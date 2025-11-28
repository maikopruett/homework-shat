import { useState, useEffect, useCallback, useRef } from 'react';
import { sendMessageStream } from '../api/openrouter';
import type { ChatMessage, StreamMetrics } from '../api/openrouter';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  metrics?: StreamMetrics;
}

const STORAGE_KEY = 'chat-history';

function loadMessages(): Message[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveMessages(messages: Message[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch {
    // Storage full or unavailable
  }
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>(loadMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamingContentRef = useRef<string>('');

  useEffect(() => {
    saveMessages(messages);
  }, [messages]);

  const send = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: content.trim(),
      timestamp: Date.now()
    };

    const assistantId = crypto.randomUUID();
    streamingContentRef.current = '';

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);

    const chatHistory: ChatMessage[] = messages.map(m => ({
      role: m.role,
      content: m.content
    }));
    chatHistory.push({ role: 'user', content: content.trim() });

    // Create placeholder for streaming message
    const assistantMessage: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, assistantMessage]);

    await sendMessageStream(chatHistory, {
      onToken: (token) => {
        streamingContentRef.current += token;
        setMessages(prev => prev.map(m => 
          m.id === assistantId 
            ? { ...m, content: streamingContentRef.current }
            : m
        ));
      },
      onComplete: (metrics) => {
        // Final update with both content and metrics
        setMessages(prev => prev.map(m => 
          m.id === assistantId 
            ? { ...m, content: streamingContentRef.current, metrics }
            : m
        ));
        setIsLoading(false);
      },
      onError: (err) => {
        setError(err.message);
        setMessages(prev => prev.filter(m => m.id !== assistantId));
        setIsLoading(false);
      }
    });
  }, [messages, isLoading]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, isLoading, error, send, clearChat };
}
