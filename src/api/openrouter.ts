const API_URL = '/api/chat';
const DEFAULT_MODEL = 'moonshotai/kimi-k2-thinking';

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  isBest?: boolean;
  isFastest?: boolean;
}

export const AVAILABLE_MODELS: ModelInfo[] = [
  { id: 'z-ai/glm-4.6', name: 'GLM 4.6', provider: 'Z-AI', isBest: true },
  { id: 'google/gemini-2.5-flash-lite-preview-09-2025', name: 'Gemini 2.5 Flash', provider: 'Google', isFastest: true },
  { id: 'x-ai/grok-4.1-fast:free', name: 'Grok 4.1 Fast', provider: 'xAI' },
  { id: 'tngtech/deepseek-r1t2-chimera:free', name: 'DeepSeek R1T2 Chimera', provider: 'TNG' },
  { id: 'kwaipilot/kat-coder-pro:free', name: 'Kat Coder Pro', provider: 'Kwaipilot' },
  { id: 'tngtech/deepseek-r1t-chimera:free', name: 'DeepSeek R1T Chimera', provider: 'TNG' },
  { id: 'z-ai/glm-4.5-air:free', name: 'GLM 4.5 Air', provider: 'Z-AI' },
  { id: 'nvidia/nemotron-nano-12b-v2-vl:free', name: 'Nemotron Nano 12B V2 VL', provider: 'NVIDIA' },
  { id: 'qwen/qwen3-coder:free', name: 'Qwen 3 Coder', provider: 'Qwen' },
  { id: 'google/gemma-3-27b-it:free', name: 'Gemma 3 27B', provider: 'Google' },
];

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    strict?: boolean; // Enable strict schema validation
    parameters: {
      type: 'object';
      properties: Record<string, {
        type: string;
        description?: string;
        enum?: string[];
        items?: { type: string };
      }>;
      required?: string[];
      additionalProperties?: boolean; // Set to false for strict mode
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
}

export interface StreamMetrics {
  ttft: number; // Time to first token in ms
  tps: number;  // Tokens per second
  totalTokens: number;
  totalTime: number; // Total generation time in ms
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onToolCalls?: (toolCalls: ToolCall[]) => Promise<ChatMessage[]>; // Returns tool results
  onFollowUp?: () => void; // Called before making a follow-up call after tool execution - allows creating new message
  onComplete: (metrics: StreamMetrics) => void | Promise<void>;
  onError: (error: Error) => void | Promise<void>;
}

export interface SendMessageOptions {
  model?: string;
  tools?: ToolDefinition[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
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
}

function accumulateToolCallDelta(
  accumulated: Map<number, ToolCall>,
  delta: ToolCallDelta
): void {
  const existing = accumulated.get(delta.index);
  
  if (!existing) {
    // New tool call
    accumulated.set(delta.index, {
      id: delta.id || '',
      type: 'function',
      function: {
        name: delta.function?.name || '',
        arguments: delta.function?.arguments || '',
      },
    });
  } else {
    // Accumulate into existing
    if (delta.id) existing.id = delta.id;
    if (delta.function?.name) existing.function.name += delta.function.name;
    if (delta.function?.arguments) existing.function.arguments += delta.function.arguments;
  }
}

export async function sendMessageStream(
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
  model: string = DEFAULT_MODEL,
  abortSignal?: AbortSignal,
  tools?: ToolDefinition[],
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
): Promise<void> {
  console.log('[API] sendMessageStream called', { model, messageCount: messages.length, hasTools: !!tools, toolCount: tools?.length, tool_choice });
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
    
    // Add tools if provided
    if (tools && tools.length > 0) {
      requestBody.tools = tools;
      if (tool_choice) {
        requestBody.tool_choice = tool_choice;
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
                callbacks.onToken(content);
              }
              
              // Handle tool call deltas
              const toolCallDeltas = choice.delta?.tool_calls;
              if (toolCallDeltas && Array.isArray(toolCallDeltas)) {
                for (const delta of toolCallDeltas) {
                  accumulateToolCallDelta(accumulatedToolCalls, delta);
                }
              }
              
              // Track finish reason
              if (choice.finish_reason) {
                finishReason = choice.finish_reason;
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
      hasOnToolCalls: !!callbacks.onToolCalls 
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
        content: null,
        tool_calls: toolCalls,
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
        tool_choice
      );
      return; // The recursive call will handle completion
    }

    console.log('[API] Stream complete, calling onComplete', { tokenCount, totalTime: Math.round(totalTime) });
    await Promise.resolve(callbacks.onComplete({
      ttft: Math.round(ttft),
      tps: Math.round(tps * 10) / 10,
      totalTokens: tokenCount,
      totalTime: Math.round(totalTime)
    }));
    console.log('[API] onComplete finished');
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Unknown error');
    console.log('[API] Error caught, calling onError', { name: error.name, message: error.message });
    await Promise.resolve(callbacks.onError(error));
    console.log('[API] onError finished');
  }
}
