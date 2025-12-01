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
  { id: 'moonshotai/kimi-k2-thinking', name: 'Kimi K2', provider: 'Moonshot', isBest: true },
  { id: 'x-ai/grok-4.1-fast:free', name: 'Grok 4.1 Fast', provider: 'xAI' },
  { id: 'tngtech/deepseek-r1t2-chimera:free', name: 'DeepSeek R1T2 Chimera', provider: 'TNG' },
  { id: 'kwaipilot/kat-coder-pro:free', name: 'Kat Coder Pro', provider: 'Kwaipilot' },
  { id: 'tngtech/deepseek-r1t-chimera:free', name: 'DeepSeek R1T Chimera', provider: 'TNG' },
  { id: 'z-ai/glm-4.5-air:free', name: 'GLM 4.5 Air', provider: 'Z-AI', isFastest: true },
  { id: 'nvidia/nemotron-nano-12b-v2-vl:free', name: 'Nemotron Nano 12B V2 VL', provider: 'NVIDIA' },
  { id: 'qwen/qwen3-coder:free', name: 'Qwen 3 Coder', provider: 'Qwen' },
  { id: 'google/gemma-3-27b-it:free', name: 'Gemma 3 27B', provider: 'Google' },
];

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface StreamMetrics {
  ttft: number; // Time to first token in ms
  tps: number;  // Tokens per second
  totalTokens: number;
  totalTime: number; // Total generation time in ms
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onComplete: (metrics: StreamMetrics) => void;
  onError: (error: Error) => void;
}

export async function sendMessageStream(
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
  model: string = DEFAULT_MODEL,
  abortSignal?: AbortSignal
): Promise<void> {
  const startTime = performance.now();
  let firstTokenTime: number | null = null;
  let tokenCount = 0;

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 4096,
        stream: true
      }),
      signal: abortSignal
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API Error: ${response.status} - ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              if (firstTokenTime === null) {
                firstTokenTime = performance.now();
              }
              tokenCount++;
              callbacks.onToken(content);
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

    callbacks.onComplete({
      ttft: Math.round(ttft),
      tps: Math.round(tps * 10) / 10,
      totalTokens: tokenCount,
      totalTime: Math.round(totalTime)
    });
  } catch (err) {
    callbacks.onError(err instanceof Error ? err : new Error('Unknown error'));
  }
}
