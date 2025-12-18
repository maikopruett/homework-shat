const API_URL = '/api/chat';

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  isBest?: boolean;
  isFastest?: boolean;
  isDefault?: boolean;
}

export const AVAILABLE_MODELS: ModelInfo[] = [
  { id: 'anthropic/claude-haiku-4.5', name: 'Haiku 4.5', provider: 'Anthropic', isBest: true, isDefault: true },
  { id: 'google/gemini-3-flash-preview', name: 'Gemini Flash', provider: 'Google', isFastest: true},
];

export const DEFAULT_MODEL = AVAILABLE_MODELS.find(m => m.isDefault)?.id || AVAILABLE_MODELS[0].id;

// Reasoning detail types per OpenRouter docs
// https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
export type ReasoningDetail =
  | { type: 'reasoning.summary'; summary: string; id?: string | null; format?: string; index?: number }
  | { type: 'reasoning.encrypted'; data: string; id?: string | null; format?: string; index?: number }
  | { type: 'reasoning.text'; text: string; signature?: string | null; id?: string | null; format?: string; index?: number };

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
  reasoning_details?: ReasoningDetail[]; // For reasoning models - must be preserved for tool calling follow-ups
}

/**
 * JSON Schema property type for OpenRouter tool parameters.
 * Supports the full JSON Schema specification used by OpenRouter.
 */
export interface JsonSchemaProperty {
  type?: string | string[];
  description?: string;
  enum?: (string | number | boolean | null)[];
  const?: unknown;
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean | JsonSchemaProperty;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  oneOf?: JsonSchemaProperty[];
  anyOf?: JsonSchemaProperty[];
  allOf?: JsonSchemaProperty[];
  not?: JsonSchemaProperty;
  nullable?: boolean;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
}

/**
 * Tool choice configuration for controlling how models use tools.
 * - 'auto': Model decides whether to call tools (default)
 * - 'none': Disable tool calling
 * - 'required': Force the model to call at least one tool
 * - object: Force a specific tool by name
 */
export type ToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | { type: 'function'; function: { name: string } };

/**
 * OpenRouter tool definition following the function calling specification.
 * Uses strict mode by default for reliable parameter validation.
 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    strict?: boolean;
    parameters: {
      type: 'object';
      properties: Record<string, JsonSchemaProperty>;
      required?: string[];
      additionalProperties?: boolean;
    };
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
  thoughtSignature?: string; // For Gemini models - must be preserved for tool calling follow-ups
}

export interface StreamMetrics {
  ttft: number; // Time to first token in ms
  tps: number;  // Tokens per second
  totalTokens: number;
  totalTime: number; // Total generation time in ms
  reasoningDetails?: ReasoningDetail[]; // For reasoning models - required for tool calling follow-ups
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onToolCalls?: (toolCalls: ToolCall[]) => Promise<ChatMessage[]>; // Returns tool results
  onFollowUp?: () => void; // Called before making a follow-up call after tool execution - allows creating new message
  onToolCallStart?: () => void; // Called when first tool call is detected - signals end of text before tools
  onComplete: (metrics: StreamMetrics) => void | Promise<void>;
  onError: (error: Error) => void | Promise<void>;
}

export interface SendMessageOptions {
  model?: string;
  tools?: ToolDefinition[];
  tool_choice?: ToolChoice;
  parallel_tool_calls?: boolean;
  abortSignal?: AbortSignal;
}

// Timeout for stream reads (60 seconds without data = timeout)
const STREAM_READ_TIMEOUT_MS = 60000;

// Helper to create a timeout promise for stream reads
function createReadTimeout(timeoutMs: number): { promise: Promise<never>; clear: () => void } {
  let timeoutId: ReturnType<typeof setTimeout>;
  const promise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Stream read timeout - no data received for 60 seconds'));
    }, timeoutMs);
  });
  return {
    promise,
    clear: () => clearTimeout(timeoutId),
  };
}

// Helper to accumulate tool call deltas during streaming
interface ToolCallDelta {
  index: number;
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
  thoughtSignature?: string; // Gemini direct format
  extra_content?: { google?: { thought_signature?: string } }; // OpenRouter format
}

function accumulateToolCallDelta(
  accumulated: Map<number, ToolCall>,
  delta: ToolCallDelta
): void {
  const existing = accumulated.get(delta.index);

  // Extract thoughtSignature from either direct field or OpenRouter's extra_content
  const thoughtSignature = delta.thoughtSignature || delta.extra_content?.google?.thought_signature;

  if (!existing) {
    // New tool call
    accumulated.set(delta.index, {
      id: delta.id || '',
      type: 'function',
      function: {
        name: delta.function?.name || '',
        arguments: delta.function?.arguments || '',
      },
      thoughtSignature,
    });
  } else {
    // Accumulate into existing
    if (delta.id) existing.id = delta.id;
    if (delta.function?.name) existing.function.name += delta.function.name;
    if (delta.function?.arguments) existing.function.arguments += delta.function.arguments;
    if (thoughtSignature) existing.thoughtSignature = thoughtSignature;
  }
}

export async function sendMessageStream(
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
  model: string = DEFAULT_MODEL,
  abortSignal?: AbortSignal,
  tools?: ToolDefinition[],
  tool_choice?: ToolChoice,
  parallel_tool_calls?: boolean
): Promise<void> {
  const isGemini = model.includes('gemini');
  console.log('[API] sendMessageStream called', { model, messageCount: messages.length, hasTools: !!tools, toolCount: tools?.length, tool_choice, isGemini });
  const startTime = performance.now();
  let firstTokenTime: number | null = null;
  let tokenCount = 0;

  try {
    console.log('[API] Fetching from', API_URL);
    
    // Build request body
    const requestBody: Record<string, unknown> = {
      model,
      messages,
      max_tokens: 4096,
      stream: true
    };

    // Enable reasoning for models that support it (Gemini, Anthropic Claude 3.7+, etc.)
    // This is REQUIRED for Gemini to return reasoning_details which must be preserved for tool calling
    if (isGemini && tools && tools.length > 0) {
      // Enable reasoning with default settings - required for tool calling to work
      requestBody.reasoning = {
        effort: 'medium'
      };
      console.log('[API] Enabled reasoning for Gemini model with tool calling');
    }

    // Add tools if provided
    if (tools && tools.length > 0) {
      requestBody.tools = tools;
      if (tool_choice) {
        requestBody.tool_choice = tool_choice;
      }
      // Control whether tools can be called in parallel (default: true for most models)
      if (parallel_tool_calls !== undefined) {
        requestBody.parallel_tool_calls = parallel_tool_calls;
      }
    }
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: abortSignal
    });

    console.log('[API] Response received', { status: response.status, ok: response.ok });

    if (!response.ok) {
      const error = await response.text();
      console.error('[API] Response not OK:', response.status, error);
      throw new Error(`API Error: ${response.status} - ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      console.error('[API] No response body');
      throw new Error('No response body');
    }

    console.log('[API] Starting to read stream');
    const decoder = new TextDecoder();
    let buffer = '';
    let readCount = 0;
    
    // Track accumulated tool calls
    const accumulatedToolCalls = new Map<number, ToolCall>();
    let finishReason: string | null = null;
    let accumulatedContent = '';
    let toolCallStartSignaled = false; // Track if we've signaled tool call start
    let accumulatedReasoningDetails: ReasoningDetail[] = []; // For reasoning models

    while (true) {
      // Add timeout to stream reads to prevent infinite hangs
      const timeout = createReadTimeout(STREAM_READ_TIMEOUT_MS);
      let result: ReadableStreamReadResult<Uint8Array>;
      
      try {
        result = await Promise.race([
          reader.read(),
          timeout.promise,
        ]);
      } finally {
        timeout.clear();
      }

      readCount++;
      const { done, value } = result;
      
      if (done) {
        console.log('[API] Stream done after', readCount, 'reads,', tokenCount, 'tokens');
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            console.log('[API] Received [DONE] signal');
            continue;
          }

          try {
            const parsed = JSON.parse(data);
            const choice = parsed.choices?.[0];
            
            if (choice) {
              // Handle content delta
              const content = choice.delta?.content;
              if (content) {
                if (firstTokenTime === null) {
                  firstTokenTime = performance.now();
                  console.log('[API] First token received after', Math.round(firstTokenTime - startTime), 'ms');
                }
                tokenCount++;
                accumulatedContent += content;
                callbacks.onToken(content);
              }
              
              // Handle tool call deltas (streaming format)
              const toolCallDeltas = choice.delta?.tool_calls;
              if (toolCallDeltas && Array.isArray(toolCallDeltas)) {
                // Signal that tool calls are starting (text output should be finalized)
                if (!toolCallStartSignaled && callbacks.onToolCallStart) {
                  toolCallStartSignaled = true;
                  callbacks.onToolCallStart();
                }
                for (const delta of toolCallDeltas) {
                  accumulateToolCallDelta(accumulatedToolCalls, delta);
                }
              }

              // Handle non-delta tool calls (some models return full tool calls in message)
              const messageToolCalls = choice.message?.tool_calls;
              if (messageToolCalls && Array.isArray(messageToolCalls)) {
                // Signal that tool calls are starting (text output should be finalized)
                if (!toolCallStartSignaled && callbacks.onToolCallStart) {
                  toolCallStartSignaled = true;
                  callbacks.onToolCallStart();
                }
                for (let i = 0; i < messageToolCalls.length; i++) {
                  const tc = messageToolCalls[i];
                  if (tc.id && tc.function?.name) {
                    // Extract thoughtSignature from either direct field or OpenRouter's extra_content
                    const thoughtSignature = tc.thoughtSignature || tc.extra_content?.google?.thought_signature;
                    accumulatedToolCalls.set(i, {
                      id: tc.id,
                      type: 'function',
                      function: {
                        name: tc.function.name,
                        arguments: tc.function.arguments || '',
                      },
                      thoughtSignature,
                    });
                  }
                }
              }
              
              // Track finish reason
              if (choice.finish_reason) {
                finishReason = choice.finish_reason;
              }

              // Capture reasoning_details for reasoning models (required for tool calling follow-ups)
              // OpenRouter normalizes to reasoning_details, but log the full choice for debugging
              const deltaReasoningDetails = choice.delta?.reasoning_details;
              const messageReasoningDetails = choice.message?.reasoning_details;

              // Debug: Log if we see any reasoning-related fields
              if (choice.delta && Object.keys(choice.delta).some(k => k.includes('reason') || k.includes('think') || k.includes('thought'))) {
                console.log('[API] Reasoning-related delta fields:', Object.keys(choice.delta));
              }
              if (choice.message && Object.keys(choice.message).some(k => k.includes('reason') || k.includes('think') || k.includes('thought'))) {
                console.log('[API] Reasoning-related message fields:', Object.keys(choice.message));
              }

              if (deltaReasoningDetails && Array.isArray(deltaReasoningDetails)) {
                console.log('[API] Captured delta reasoning_details:', deltaReasoningDetails.length, 'items');
                accumulatedReasoningDetails.push(...deltaReasoningDetails);
              }
              if (messageReasoningDetails && Array.isArray(messageReasoningDetails)) {
                console.log('[API] Captured message reasoning_details:', messageReasoningDetails.length, 'items');
                // For non-streaming format, replace accumulated
                accumulatedReasoningDetails = messageReasoningDetails;
              }
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }

    const endTime = performance.now();
    const totalTime = endTime - startTime;
    const ttft = firstTokenTime ? firstTokenTime - startTime : totalTime;
    const generationTime = endTime - (firstTokenTime || startTime);
    const tps = generationTime > 0 ? (tokenCount / generationTime) * 1000 : 0;

    console.log('[API] Stream finished', {
      finishReason,
      accumulatedToolCallsCount: accumulatedToolCalls.size,
      hasOnToolCalls: !!callbacks.onToolCalls,
      toolCallNames: Array.from(accumulatedToolCalls.values()).map(tc => tc.function.name),
      toolCallsWithSignatures: Array.from(accumulatedToolCalls.values()).filter(tc => tc.thoughtSignature).length,
      reasoningDetailsCount: accumulatedReasoningDetails.length,
      hasReasoningDetails: accumulatedReasoningDetails.length > 0,
    });

    // Handle tool calls if present - check for various finish reasons
    // Some models use 'tool_calls', others use 'tool_call' or 'function_call'
    const isToolCallFinish = finishReason === 'tool_calls' || finishReason === 'tool_call' || finishReason === 'function_call';
    if ((isToolCallFinish || accumulatedToolCalls.size > 0) && callbacks.onToolCalls && accumulatedToolCalls.size > 0) {
      const toolCalls = Array.from(accumulatedToolCalls.values());
      console.log('[API] Tool calls detected:', toolCalls.length, 'calls', toolCalls);
      
      // Execute tool calls and get results
      const toolResults = await callbacks.onToolCalls(toolCalls);
      
      // Build new messages array with assistant's tool call message and tool results
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: accumulatedContent || null,
        tool_calls: toolCalls,
        reasoning_details: accumulatedReasoningDetails.length > 0 ? accumulatedReasoningDetails : undefined,
      };
      
      const newMessages = [...messages, assistantMessage, ...toolResults];
      
      // Signal that we're about to make a follow-up call (allows creating new message)
      if (callbacks.onFollowUp) {
        callbacks.onFollowUp();
      }
      
      // Make follow-up call with tool results
      console.log('[API] Making follow-up call with tool results');
      await sendMessageStream(
        newMessages,
        callbacks,
        model,
        abortSignal,
        tools,
        tool_choice,
        parallel_tool_calls
      );
      return; // The recursive call will handle completion
    }

    console.log('[API] Stream complete, calling onComplete', { tokenCount, totalTime: Math.round(totalTime) });
    await Promise.resolve(callbacks.onComplete({
      ttft: Math.round(ttft),
      tps: Math.round(tps * 10) / 10,
      totalTokens: tokenCount,
      totalTime: Math.round(totalTime),
      reasoningDetails: accumulatedReasoningDetails.length > 0 ? accumulatedReasoningDetails : undefined,
    }));
    console.log('[API] onComplete finished');
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Unknown error');
    console.log('[API] Error caught, calling onError', { name: error.name, message: error.message });
    await Promise.resolve(callbacks.onError(error));
    console.log('[API] onError finished');
  }
}

// Simple non-streaming API call for generating titles
export async function generateTitle(userMessage: string, documentContent: string): Promise<string> {
  const systemPrompt = `You are a title generator. Based on the user's request and the document content that was written, generate a short, descriptive title (2-5 words) for the document.

Rules:
- Output ONLY the title, nothing else
- No quotes, no punctuation at the end
- Capitalize like a title (first letter of major words)
- Be specific and descriptive
- If it's an essay, include the main topic
- Examples: "Climate Change Essay", "Romeo and Juliet Analysis", "Civil War Research Paper"`;

  const userPrompt = `User's request: "${userMessage}"

Document content (first 500 chars): "${documentContent.slice(0, 500)}"

Generate a title:`;

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'x-ai/grok-4-fast', // Use fast model for quick title generation
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 20,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const title = data.choices?.[0]?.message?.content?.trim() || '';

    // Clean up the title - remove quotes and extra punctuation
    return title
      .replace(/^["']|["']$/g, '') // Remove surrounding quotes
      .replace(/[.!?]+$/, '') // Remove trailing punctuation
      .trim() || 'Untitled Document';
  } catch (error) {
    console.error('[API] Title generation failed:', error);
    return 'Untitled Document';
  }
}
