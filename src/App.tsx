import { useRef, useEffect, useState } from 'react';
import { useChat } from './hooks/useChat';
import type { Message } from './hooks/useChat';
import GoogleDocsUI from './components/GoogleDocsUI';

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  
  // Don't render empty assistant messages (they show loading indicator instead)
  if (!isUser && !message.content) {
    return null;
  }
  
  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[85%] px-4 py-3 rounded-2xl whitespace-pre-wrap wrap-break-word ${
          isUser
            ? 'bg-cyan-500 text-black rounded-br-md'
            : 'bg-zinc-800 text-zinc-100 rounded-bl-md'
        }`}
      >
        {message.content}
      </div>
      {message.metrics && (
        <div className="flex gap-3 mt-1 px-1 text-xs text-zinc-500">
          <span>TTFT: {message.metrics.ttft}ms</span>
          <span>TPS: {message.metrics.tps}</span>
        </div>
      )}
    </div>
  );
}

function LoadingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-zinc-800 px-4 py-3 rounded-2xl rounded-bl-md flex gap-1">
        <span className="loading-dot w-2 h-2 bg-zinc-400 rounded-full" />
        <span className="loading-dot w-2 h-2 bg-zinc-400 rounded-full" />
        <span className="loading-dot w-2 h-2 bg-zinc-400 rounded-full" />
      </div>
    </div>
  );
}

export default function App() {
  const { messages, isLoading, error, send, clearChat } = useChat();
  const [input, setInput] = useState('');
  const [ghostMode, setGhostMode] = useState(false);
  const [docsAiResponse, setDocsAiResponse] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Track AI responses for Google Docs mode
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant' && lastMessage.content) {
        setDocsAiResponse(lastMessage.content);
      }
    }
  }, [messages]);

  const handleDocsSubmit = (text: string) => {
    send(text);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      send(input);
      setInput('');
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Ghost icon button component
  const GhostButton = () => (
    <button
      onClick={() => setGhostMode(!ghostMode)}
      className="ghost-toggle-btn"
      title={ghostMode ? "Exit Ghost Mode" : "Enter Ghost Mode"}
      aria-label={ghostMode ? "Exit Ghost Mode" : "Enter Ghost Mode"}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2C7.58 2 4 5.58 4 10v9c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1c0-.55.45-1 1-1s1 .45 1 1v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1c0-.55.45-1 1-1s1 .45 1 1v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1c0-.55.45-1 1-1s1 .45 1 1v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-9c0-4.42-3.58-8-8-8zm-2 9c-.83 0-1.5-.67-1.5-1.5S9.17 8 10 8s1.5.67 1.5 1.5S10.83 11 10 11zm4 0c-.83 0-1.5-.67-1.5-1.5S13.17 8 14 8s1.5.67 1.5 1.5S14.83 11 14 11z"/>
      </svg>
    </button>
  );

  if (ghostMode) {
    return (
      <>
        <GoogleDocsUI 
          onSubmit={handleDocsSubmit} 
          isLoading={isLoading} 
          aiResponse={docsAiResponse}
        />
        <GhostButton />
      </>
    );
  }

  return (
    <div 
      className="flex flex-col h-full bg-zinc-950"
      style={{ 
        paddingTop: 'max(env(safe-area-inset-top), 0px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 0px)'
      }}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-linear-to-br from-cyan-400 to-cyan-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-white">Grok Chat</h1>
        </div>
        <button
          onClick={clearChat}
          className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
        >
          Clear
        </button>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto scroll-smooth px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-16 h-16 rounded-2xl bg-linear-to-br from-cyan-400 to-cyan-600 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Grok 4.1 Fast</h2>
            <p className="text-zinc-500 max-w-sm">
              Start a conversation. Your chat history is saved locally on this device.
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-w-3xl mx-auto">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {isLoading && messages[messages.length - 1]?.content === '' && <LoadingIndicator />}
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* Error */}
      {error && (
        <div className="mx-4 mb-2 px-4 py-2 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">
          {error}
        </div>
      )}

      {/* Input */}
      <form 
        onSubmit={handleSubmit} 
        className="shrink-0 px-4 pb-4 pt-2 bg-zinc-950"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
      >
        <div className="flex gap-2 max-w-3xl mx-auto">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Grok..."
            rows={1}
            className="flex-1 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
            style={{ minHeight: '48px', maxHeight: '120px' }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="px-4 py-3 bg-cyan-500 hover:bg-cyan-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-black font-medium rounded-xl transition-colors shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </form>
      
      <GhostButton />
    </div>
  );
}
