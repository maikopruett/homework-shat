/**
 * Agent Execution Loop
 *
 * Handles multi-turn tool execution with configurable follow-up limits.
 * Based on OpenCode's agent loop pattern.
 */

import { toolRegistry } from '../tools';
import { sendMessageStream } from '../api/openrouter';
import type {
  Session,
  Message,
  TextPart,
  ToolCallPart,
  ToolResultPart,
  ToolContext,
  ToolStatus,
  DocumentInfo,
  UserQuestionRequest,
  UserQuestionResponse,
  UserQuestionParams,
} from './types';
import type { TiptapEditorHandle } from '../components/TiptapEditor';
import type { ChatMessage, ToolCall } from '../api/openrouter';
import { validateFormatting, modelSupportsTools, type EssayTemplate } from '../prompts';

// ==================== Types ====================

export interface LoopOptions {
  session: Session;
  userMessage: string;
  editor: TiptapEditorHandle | null;
  document: DocumentInfo | null;
  /** Selected essay template for formatting validation */
  template?: EssayTemplate | null;
  systemPrompt: string;
  onStatusUpdate: (status: ToolStatus) => void;
  onMessageUpdate: (message: Message) => void;
  onTokenReceived?: (token: string) => void;
  /** Callback for ask_user tool - pauses loop until user responds */
  onUserQuestionRequest?: (request: UserQuestionRequest) => Promise<UserQuestionResponse>;
  abortSignal?: AbortSignal;
}

export interface LoopResult {
  success: boolean;
  message: Message;
  toolCallCount: number;
  followUpCount: number;
  error?: string;
}

// ==================== Helper Functions ====================

/**
 * Build message history for the API call.
 */
function buildMessageHistory(
  session: Session,
  userMessage: string,
  systemPrompt: string
): ChatMessage[] {
  // System message
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: buildFullSystemPrompt(systemPrompt, session),
    },
  ];

  // Previous messages from session
  for (const msg of session.messages) {
    if (msg.role === 'user') {
      const textContent = msg.parts
        .filter((p): p is TextPart => p.type === 'text')
        .map((p) => p.content)
        .join('');

      if (textContent) {
        messages.push({
          role: 'user',
          content: textContent,
        });
      }
    } else if (msg.role === 'assistant') {
      const textContent = msg.parts
        .filter((p): p is TextPart => p.type === 'text')
        .map((p) => p.content)
        .join('');

      // Check if this assistant message had tool calls
      const toolCallParts = msg.parts.filter(
        (p): p is ToolCallPart => p.type === 'tool_call'
      );

      if (toolCallParts.length > 0) {
        // Assistant message with tool calls - must preserve reasoning_details and thoughtSignature for Gemini
        messages.push({
          role: 'assistant',
          content: textContent || null,
          tool_calls: toolCallParts.map((part) => ({
            id: part.callId,
            type: 'function' as const,
            function: {
              name: part.toolId,
              arguments: JSON.stringify(part.arguments),
            },
            thoughtSignature: part.thoughtSignature, // Preserve for Gemini
          })),
          reasoning_details: msg.metadata?.reasoningDetails,
        });
      } else if (textContent) {
        // Regular assistant message without tool calls
        messages.push({
          role: 'assistant',
          content: textContent,
          reasoning_details: msg.metadata?.reasoningDetails,
        });
      }
    }

    // Include tool results
    for (const part of msg.parts) {
      if (part.type === 'tool_result') {
        messages.push({
          role: 'tool',
          tool_call_id: part.callId,
          content: JSON.stringify(part.result ?? { error: part.error }),
        });
      }
    }
  }

  // New user message
  messages.push({
    role: 'user',
    content: userMessage,
  });

  return messages;
}

/**
 * Build full system prompt including todos.
 */
function buildFullSystemPrompt(basePrompt: string, session: Session): string {
  let prompt = basePrompt;

  // Add current todos if any
  if (session.todos.length > 0) {
    prompt += '\n\n## Current Tasks:\n';
    for (const todo of session.todos) {
      const statusIcon = {
        pending: '[ ]',
        in_progress: '[~]',
        completed: '[x]',
        cancelled: '[-]',
      }[todo.status];
      const priority = todo.priority ? ` (${todo.priority})` : '';
      prompt += `${statusIcon} ${todo.content}${priority}\n`;
    }
    prompt += '\nUpdate these tasks using todowrite as you complete them.\n';
  }

  return prompt;
}

/**
 * Create a tool context for execution.
 */
function createToolContext(
  options: LoopOptions,
  emitStatus: (status: ToolStatus) => void
): ToolContext {
  return {
    session: options.session,
    editor: options.editor,
    document: options.document,
    agent: options.session.agentConfig,
    emitStatus,
    abortSignal: options.abortSignal,
  };
}

// ==================== Main Loop ====================

/**
 * Run the agent execution loop.
 *
 * This function handles:
 * 1. Sending messages to the LLM
 * 2. Processing streaming responses
 * 3. Executing tool calls
 * 4. Making follow-up requests with tool results
 * 5. Respecting maxFollowUps limit
 */
export async function runAgentLoop(options: LoopOptions): Promise<LoopResult> {
  const { session, userMessage, systemPrompt, onStatusUpdate, onMessageUpdate, abortSignal } =
    options;
  const { agentConfig } = session;

  // Get available tools for this agent (skip for models with broken tool calling)
  const supportsTools = modelSupportsTools(agentConfig.model);
  const availableTools = supportsTools ? toolRegistry.getForAgent(agentConfig) : [];
  const openRouterTools = supportsTools ? toolRegistry.toOpenRouterFormat(availableTools) : [];

  // Build initial message history
  const messages = buildMessageHistory(session, userMessage, systemPrompt);

  let followUpCount = 0;
  let totalToolCalls = 0;
  const maxFollowUps = agentConfig.permissions.maxFollowUps;

  // Create the assistant message that will accumulate parts
  const assistantMessage: Message = {
    id: crypto.randomUUID(),
    role: 'assistant',
    parts: [],
    timestamp: Date.now(),
  };

  try {
    while (followUpCount <= maxFollowUps) {
      // Check abort
      if (abortSignal?.aborted) {
        return {
          success: false,
          message: assistantMessage,
          toolCallCount: totalToolCalls,
          followUpCount,
          error: 'Operation cancelled',
        };
      }

      let currentTextContent = '';

      // Stream the response
      await sendMessageStream(
        messages,
        {
          onToken: (token) => {
            currentTextContent += token;
            options.onTokenReceived?.(token);

            // Update or create text part
            const lastPart = assistantMessage.parts[assistantMessage.parts.length - 1];
            if (lastPart?.type === 'text') {
              (lastPart as TextPart).content = currentTextContent;
            } else if (currentTextContent.length > 0) {
              assistantMessage.parts.push({
                type: 'text',
                content: currentTextContent,
              });
            }
            onMessageUpdate(assistantMessage);
          },

          onToolCallStart: () => {
            // Reset text content when tool calls start
            // The model may stream more text after tools complete
          },

          onToolCalls: async (toolCalls) => {
            totalToolCalls += toolCalls.length;

            // Helper function to execute a single tool call
            const executeToolCall = async (toolCall: ToolCall): Promise<ChatMessage> => {
              const { name, arguments: argsJson } = toolCall.function;
              let args: unknown;

              try {
                args = JSON.parse(argsJson);
              } catch {
                args = {};
              }

              // Add tool call part
              const toolCallPart: ToolCallPart = {
                type: 'tool_call',
                callId: toolCall.id,
                toolId: name,
                arguments: args,
                status: {
                  toolId: name,
                  status: 'pending',
                  title: `Calling ${name}...`,
                },
                thoughtSignature: toolCall.thoughtSignature, // Preserve for Gemini
              };
              assistantMessage.parts.push(toolCallPart);
              onMessageUpdate(assistantMessage);

              // Execute the tool
              const ctx = createToolContext(options, (status) => {
                toolCallPart.status = status;
                onStatusUpdate(status);
                onMessageUpdate(assistantMessage);
              });

              // Special handling for ask_user tool - pause and wait for user response
              let result;
              if (name === 'ask_user' && options.onUserQuestionRequest) {
                const questionParams = args as UserQuestionParams;

                // Validate that options exist and are properly formed
                if (!questionParams.options || !Array.isArray(questionParams.options) || questionParams.options.length === 0) {
                  console.error('[AgentLoop] ask_user tool called without valid options:', questionParams);
                  result = {
                    success: false,
                    error: 'ask_user tool requires an options array with at least 2 options. Each option must have "id" and "label" fields.',
                  };
                } else {
                  // Normalize and validate each option - ensure id and label exist
                  const normalizedOptions = questionParams.options.map((opt, idx) => {
                    // Handle case where LLM sends wrong field names or structure
                    const rawOpt = opt as Record<string, unknown>;
                    const id = String(rawOpt.id || rawOpt.value || rawOpt.key || `option_${idx}`);
                    const label = String(rawOpt.label || rawOpt.text || rawOpt.name || rawOpt.title || id);
                    const description = rawOpt.description ? String(rawOpt.description) : undefined;

                    return { id, label, description };
                  });

                  // Validate we have at least some valid options
                  const validOptions = normalizedOptions.filter(opt => opt.label && opt.label.trim() !== '');
                  if (validOptions.length < 2) {
                    console.error('[AgentLoop] ask_user options missing valid labels:', questionParams.options);
                    result = {
                      success: false,
                      error: 'ask_user tool requires at least 2 options with valid "label" fields. Example: {"id": "opt1", "label": "Option 1"}',
                    };
                  } else {
                    // Emit status showing we're waiting
                    ctx.emitStatus({
                      toolId: 'ask_user',
                      status: 'running',
                      title: 'Waiting for your response...',
                      metadata: { question: questionParams.question },
                    });

                    // Create the question request and await user response
                    const questionRequest: UserQuestionRequest = {
                      questionId: toolCall.id,
                      question: questionParams.question,
                      options: validOptions,
                      allowMultiple: questionParams.allowMultiple ?? false,
                      timestamp: Date.now(),
                    };

                    try {
                      const response = await options.onUserQuestionRequest(questionRequest);

                      // Mark as completed
                      ctx.emitStatus({
                        toolId: 'ask_user',
                        status: 'completed',
                        title: 'Response received',
                      });

                      result = {
                        success: true,
                        data: {
                          question: questionParams.question,
                          selectedOptions: response.selectedOptions,
                          selectedLabels: validOptions
                            .filter(opt => response.selectedOptions.includes(opt.id))
                            .map(opt => opt.label),
                        },
                      };
                    } catch (err) {
                      result = {
                        success: false,
                        error: err instanceof Error ? err.message : 'Failed to get user response',
                      };
                    }
                  }
                }
              } else {
                result = await toolRegistry.execute(name, args, ctx);
              }

              // Add tool result part
              const toolResultPart: ToolResultPart = {
                type: 'tool_result',
                callId: toolCall.id,
                toolId: name,
                result: result.success ? result.data : undefined,
                error: result.error,
              };
              assistantMessage.parts.push(toolResultPart);
              onMessageUpdate(assistantMessage);

              // Return the message for follow-up
              const resultContent = result.success
                ? { success: true, ...(result.data as object) }
                : { success: false, error: result.error };
              return {
                role: 'tool' as const,
                tool_call_id: toolCall.id,
                content: JSON.stringify(resultContent),
              };
            };

            // Execute tools - parallel by default unless disabled via config
            const shouldRunParallel = agentConfig.toolCallingOptions?.parallel_tool_calls !== false;

            let toolResults: ChatMessage[];
            if (shouldRunParallel && toolCalls.length > 1) {
              // Execute all tool calls in parallel
              toolResults = await Promise.all(toolCalls.map(executeToolCall));
            } else {
              // Execute sequentially (for single tool or when parallel is disabled)
              toolResults = [];
              for (const toolCall of toolCalls) {
                const result = await executeToolCall(toolCall);
                toolResults.push(result);
              }
            }

            return toolResults;
          },

          onFollowUp: () => {
            // Called before making follow-up request
            followUpCount++;
            currentTextContent = ''; // Reset for new content
          },

          onComplete: (metrics) => {
            // Update message metadata
            assistantMessage.metadata = {
              model: agentConfig.model,
              ttft: metrics?.ttft,
              tps: metrics?.tps,
              tokenCount: metrics?.totalTokens,
              reasoningDetails: metrics?.reasoningDetails, // For reasoning models
            };
          },

          onError: (error) => {
            console.error('[AgentLoop] Stream error:', error);
          },
        },
        agentConfig.model,
        abortSignal,
        // Pass tool definitions if available
        openRouterTools.length > 0 ? (openRouterTools as unknown as import('../api/openrouter').ToolDefinition[]) : undefined,
        // Pass tool choice from agent config, default to 'auto'
        openRouterTools.length > 0 ? (agentConfig.toolCallingOptions?.tool_choice ?? 'auto') : undefined,
        // Pass parallel tool calls option from agent config
        agentConfig.toolCallingOptions?.parallel_tool_calls
      );

      // Tool call follow-ups are handled internally by sendMessageStream via recursion.
      // After sendMessageStream completes, we're done with this turn.
      // Validate formatting if template is selected (silent auto-correction)
      if (options.template && options.editor) {
        const validation = validateFormatting(options.editor, options.template);

        if (!validation.isValid && validation.corrections.length > 0) {
          // Create tool context for corrections
          const ctx = createToolContext(options, (status) => {
            onStatusUpdate(status);
            onMessageUpdate(assistantMessage);
          });

          // Execute corrections silently
          for (const correction of validation.corrections) {
            await toolRegistry.execute(correction.toolId, correction.params, ctx);
          }
        }
      }

      // Check if we've hit the limit (followUpCount is incremented by onFollowUp callback)
      if (followUpCount >= maxFollowUps) {
        console.log(`[AgentLoop] Max follow-ups (${maxFollowUps}) reached`);

        // Add a note about hitting the limit
        assistantMessage.parts.push({
          type: 'text',
          content: `\n\n(Reached maximum ${maxFollowUps} tool execution cycles)`,
        });
      }

      // Exit the loop - all follow-ups are handled by sendMessageStream internally
      break;
    }

    return {
      success: true,
      message: assistantMessage,
      toolCallCount: totalToolCalls,
      followUpCount,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[AgentLoop] Error:', error);

    // Add error to message
    assistantMessage.parts.push({
      type: 'text',
      content: `\n\nError: ${errorMessage}`,
    });

    return {
      success: false,
      message: assistantMessage,
      toolCallCount: totalToolCalls,
      followUpCount,
      error: errorMessage,
    };
  }
}
