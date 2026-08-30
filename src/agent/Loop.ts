/**
 * Agent Execution Loop
 *
 * Handles multi-turn tool execution with configurable follow-up limits.
 * Based on OpenCode's agent loop pattern.
 */

import { toolRegistry } from '../tools';
import { sendMessageStream } from '../api/workersAi';
import type {
  Session,
  Message,
  TextPart,
  ToolCallPart,
  ToolResultPart,
  ReasoningPart,
  ToolContext,
  ToolStatus,
  DocumentInfo,
  UserQuestionRequest,
  UserQuestionResponse,
  UserQuestionParams,
  ReasoningDetail,
  AgentStepRecord,
} from './types';
import type { TiptapEditorHandle } from '../components/TiptapEditor';
import type { ChatMessage, ToolCall } from '../api/workersAi';
import { validateFormatting, modelSupportsTools, type EssayTemplate } from '../prompts';
import { compactChatMessages, documentRevision, ESSAY_PHASE_TOOLS, essayPhasePrompt, MAX_ESSAY_SEARCH_QUERIES, MAX_ESSAY_SOURCES, touchEssaySpec } from './essay';

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
  /** Callback when reasoning tokens are received (for real-time streaming display) */
  onReasoningReceived?: (detail: ReasoningDetail) => void;
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

      // Completed tool exchanges are collapsed to their user-visible answer.
      // Replaying persisted tool calls without their original turn boundaries
      // creates invalid chat-completions history for stricter providers.
      if (textContent) {
        messages.push({
          role: 'assistant',
          content: textContent,
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

function parseToolArguments(value: string): unknown {
  try {
    const parsed = JSON.parse(value || '{}');
    if (typeof parsed === 'string') {
      try {
        return JSON.parse(parsed);
      } catch {
        return parsed;
      }
    }
    return parsed;
  } catch {
    return {};
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function truncateToolResult(value: unknown, limit = 16_000): string {
  const serialized = JSON.stringify(value);
  if (serialized.length <= limit) return serialized;
  return `${serialized.slice(0, limit)}\n...[tool output truncated by harness]`;
}

function shouldContinueEssayWorkflow(session: Session): boolean {
  if (session.agentConfig.mode === 'plan') {
    return session.essay.phase !== 'outline' || session.essay.outline.length === 0;
  }
  if (session.agentConfig.mode !== 'build' || session.essay.phase === 'complete') return false;
  if (session.essay.phase === 'draft' && session.essay.outline.every((section) => section.status === 'complete')) {
    session.essay.phase = 'verify';
    touchEssaySpec(session.essay);
  } else if (session.essay.phase === 'verify' && session.essay.lastVerification?.passed) {
    session.essay.phase = 'format';
    touchEssaySpec(session.essay);
  }
  return true;
}

function essayWorkflowRequiresTool(session: Session): boolean {
  if (session.agentConfig.mode === 'plan') {
    return session.essay.phase !== 'outline' || session.essay.outline.length === 0;
  }
  return session.agentConfig.mode === 'build' && session.essay.phase !== 'complete';
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
  const isEssayWorkflow = agentConfig.mode === 'plan' || agentConfig.mode === 'build';

  const supportsTools = modelSupportsTools(agentConfig.model);

  // Build initial message history
  const messages = buildMessageHistory(session, userMessage, systemPrompt);

  let followUpCount = 0;
  let totalToolCalls = 0;
  const maxFollowUps = agentConfig.permissions.maxFollowUps;
  let previousCallSignature = '';
  let consecutiveIdenticalCalls = 0;
  const validationFailures = new Map<string, number>();
  const disabledTools = new Set<string>();

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

      session.essay.documentRevision = documentRevision(options.editor);
      messages[0] = {
        role: 'system',
        content: isEssayWorkflow
          ? `${buildFullSystemPrompt(systemPrompt, session)}\n\n${essayPhasePrompt(session.essay)}`
          : buildFullSystemPrompt(systemPrompt, session),
      };

      const phaseTools = new Set(ESSAY_PHASE_TOOLS[session.essay.phase]);
      const availableTools = supportsTools
        ? toolRegistry.getForAgent(agentConfig).filter((tool) =>
            !disabledTools.has(tool.id)
            && !(tool.id === 'search_web' && (
              session.essay.searchResultsUsed >= MAX_ESSAY_SOURCES
              || session.essay.searchQueriesUsed >= MAX_ESSAY_SEARCH_QUERIES
            ))
            && (agentConfig.mode === 'edit' || phaseTools.has(tool.id)))
        : [];
      const chatCompletionTools = toolRegistry.toChatCompletionsFormat(availableTools);
      const requestMessages = compactChatMessages(messages, JSON.stringify({
        essayPhase: session.essay.phase,
        essayRevision: session.essay.revision,
        documentRevision: session.essay.documentRevision,
      }));

      const step: AgentStepRecord = {
        id: crypto.randomUUID(),
        index: session.steps.length + 1,
        phase: session.essay.phase,
        status: 'running',
        toolNames: [],
        startedAt: Date.now(),
      };
      session.steps.push(step);
      assistantMessage.metadata = {
        ...assistantMessage.metadata,
        ...(isEssayWorkflow ? {
          essayPhase: session.essay.phase,
          essayRevision: session.essay.revision,
          steps: [...session.steps],
        } : {}),
      };
      onMessageUpdate(assistantMessage);

      let currentTextContent = '';

      // Stream the response
      const turn = await sendMessageStream(
        requestMessages,
        {
          onToken: (token) => {
            currentTextContent += token;
            options.onTokenReceived?.(token);

            const reasoningPart = assistantMessage.parts.find(
              (p): p is ReasoningPart => p.type === 'reasoning'
            );
            if (reasoningPart) reasoningPart.isStreaming = false;

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

          onReasoningToken: (detail) => {
            // Stream reasoning to UI in real-time
            options.onReasoningReceived?.(detail);

            // Find or create a ReasoningPart in the message
            let reasoningPart = assistantMessage.parts.find(
              (p): p is ReasoningPart => p.type === 'reasoning'
            );

            if (!reasoningPart) {
              // Create new reasoning part at the beginning of parts (reasoning comes first)
              reasoningPart = {
                type: 'reasoning',
                details: [],
                isStreaming: true,
              };
              // Insert at beginning so reasoning appears before text
              assistantMessage.parts.unshift(reasoningPart);
            }

            reasoningPart.isStreaming = true;
            // Add the new reasoning detail
            reasoningPart.details.push(detail);
            onMessageUpdate(assistantMessage);
          },

          onToolCallStart: () => {
            const reasoningPart = assistantMessage.parts.find(
              (p): p is ReasoningPart => p.type === 'reasoning'
            );
            if (reasoningPart) reasoningPart.isStreaming = false;
          },

          onToolCalls: async (toolCalls) => {
            totalToolCalls += toolCalls.length;
            step.toolNames = toolCalls.map((call) => toolRegistry.resolveId(call.function.name));

            // Helper function to execute a single tool call
            const executeToolCall = async (toolCall: ToolCall): Promise<ChatMessage> => {
              const name = toolRegistry.resolveId(toolCall.function.name);
              toolCall.function.name = name;
              const parsedArgs = parseToolArguments(toolCall.function.arguments);
              let args = toolRegistry.repairArguments(name, parsedArgs);
              if (name === 'search_web') {
                const record = args && typeof args === 'object' && !Array.isArray(args)
                  ? args as Record<string, unknown>
                  : {};
                const query = typeof record.query === 'string' ? record.query.trim() : '';
                const malformedWrapper = /^\w*Input\{\}$/i.test(query);
                if (!query || malformedWrapper) {
                  args = {
                    query: (session.essay.topic.trim() || userMessage.trim()).slice(0, 500),
                  };
                }
              }
              const signature = `${name}:${stableStringify(args)}`;
              if (signature === previousCallSignature) consecutiveIdenticalCalls += 1;
              else {
                previousCallSignature = signature;
                consecutiveIdenticalCalls = 1;
              }
              const repetitionCount = consecutiveIdenticalCalls;

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
              if (repetitionCount >= 3) {
                result = {
                  success: false,
                  error: `Blocked repeated identical tool call after ${repetitionCount} attempts. Change the arguments or choose another tool.`,
                };
              } else if (name === 'ask_user' && options.onUserQuestionRequest) {
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

              if (!result.success && /invalid|requires|required|unknown tool/i.test(result.error ?? '')) {
                const failures = (validationFailures.get(name) ?? 0) + 1;
                validationFailures.set(name, failures);
                if (failures >= 2) disabledTools.add(name);
              } else if (result.success) {
                validationFailures.delete(name);
              }

              // Validation and lookup failures return before the registry emits
              // a status update. Ensure their cards terminate instead of
              // remaining as an endless pending spinner.
              if (!result.success && toolCallPart.status.status !== 'error') {
                toolCallPart.status = {
                  toolId: name,
                  status: 'error',
                  title: `${name} failed`,
                };
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
                ? { success: true, data: result.data }
                : { success: false, error: result.error };
              return {
                role: 'tool' as const,
                tool_call_id: toolCall.id,
                content: truncateToolResult(resultContent),
              };
            };

            // Only side-effect-free reads and searches may run concurrently.
            const shouldRunParallel = agentConfig.toolCallingOptions?.parallel_tool_calls !== false
              && toolRegistry.canRunInParallel(toolCalls.map((call) => toolRegistry.resolveId(call.function.name)));

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

          onComplete: (metrics) => {
            // Mark reasoning part as no longer streaming
            const reasoningPart = assistantMessage.parts.find(
              (p): p is ReasoningPart => p.type === 'reasoning'
            );
            if (reasoningPart) {
              reasoningPart.isStreaming = false;
            }

            // Update message metadata
            // Use reasoning from parts if available, otherwise from metrics
            const reasoningDetails = reasoningPart?.details ?? metrics?.reasoningDetails;
            const reasoningContent = agentConfig.model.includes('deepseek')
              ? reasoningPart?.details
                  .filter((detail): detail is Extract<ReasoningDetail, { type: 'reasoning.text' }> => detail.type === 'reasoning.text')
                  .map((detail) => detail.text)
                  .join('') || metrics?.reasoningContent
              : undefined;
            assistantMessage.metadata = {
              model: agentConfig.model,
              ttft: metrics?.ttft,
              tps: metrics?.tps,
              tokenCount: metrics?.totalTokens,
              reasoningDetails, // For reasoning models - preserved for follow-up calls
              reasoningContent,
              ...(isEssayWorkflow ? {
                essayPhase: session.essay.phase,
                essayRevision: session.essay.revision,
                steps: [...session.steps],
              } : {}),
            };
            onMessageUpdate(assistantMessage);
          },

          onError: (error) => {
            console.error('[AgentLoop] Stream error:', error);
          },
        },
        agentConfig.model,
        abortSignal,
        // Pass tool definitions if available
        chatCompletionTools.length > 0 ? (chatCompletionTools as import('../api/workersAi').ToolDefinition[]) : undefined,
        // An incomplete essay phase must produce an action, not a promise to act.
        chatCompletionTools.length > 0
          ? (isEssayWorkflow && essayWorkflowRequiresTool(session)
              ? 'required'
              : (agentConfig.toolCallingOptions?.tool_choice ?? 'auto'))
          : undefined,
        // Pass parallel tool calls option from agent config
        agentConfig.toolCallingOptions?.parallel_tool_calls
      );

      step.status = 'completed';
      step.completedAt = Date.now();
      assistantMessage.metadata = {
        ...assistantMessage.metadata,
        ...(isEssayWorkflow ? {
          essayPhase: session.essay.phase,
          essayRevision: session.essay.revision,
          steps: [...session.steps],
        } : {}),
      };
      onMessageUpdate(assistantMessage);

      if (turn.toolCalls.length > 0) {
        messages.push(
          {
            role: 'assistant',
            content: turn.content || null,
            tool_calls: turn.toolCalls,
            reasoning_details: turn.metrics.reasoningDetails,
            reasoning_content: turn.metrics.reasoningContent,
          },
          ...turn.toolResults
        );

        followUpCount++;
        if (followUpCount >= maxFollowUps) {
          console.log(`[AgentLoop] Max follow-ups (${maxFollowUps}) reached`);
          assistantMessage.parts.push({
            type: 'text',
            content: `\n\n(Reached maximum ${maxFollowUps} tool execution cycles)`,
          });
          break;
        }

        continue;
      }

      if (supportsTools && shouldContinueEssayWorkflow(session)) {
        messages.push({
          role: 'assistant',
          content: turn.content || null,
        }, {
          role: 'user',
          content: `Continue the essay workflow from phase "${session.essay.phase}". Use the available phase tools and do not stop until this phase's objective is complete.`,
        });
        followUpCount++;
        continue;
      }

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

    const runningStep = [...session.steps].reverse().find((step) => step.status === 'running');
    if (runningStep) {
      runningStep.status = 'error';
      runningStep.error = errorMessage;
      runningStep.completedAt = Date.now();
    }

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
