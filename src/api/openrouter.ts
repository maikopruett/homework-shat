const API_KEY = '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';
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'nvidia/nemotron-nano-9b-v2:free';

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
  callbacks: StreamCallbacks
): Promise<void> {
  const startTime = performance.now();
  let firstTokenTime: number | null = null;
  let tokenCount = 0;

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Grok Chat PWA'
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        max_tokens: 2048,
        stream: true
      })
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
