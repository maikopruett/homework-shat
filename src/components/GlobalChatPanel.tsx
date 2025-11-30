import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';

interface GlobalChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const LOCALSTORAGE_USERNAME_KEY = 'docfake_chat_username';

export default function GlobalChatPanel({ isOpen, onClose }: GlobalChatPanelProps) {
  const [username, setUsername] = useState<string | null>(null);
  const [showUsernamePrompt, setShowUsernamePrompt] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Convex queries and mutations
  const messages = useQuery(api.chat.list) ?? [];
  const sendMessage = useMutation(api.chat.send);

  // Load username from localStorage on mount
  useEffect(() => {
    const storedUsername = localStorage.getItem(LOCALSTORAGE_USERNAME_KEY);
    if (storedUsername) {
      setUsername(storedUsername);
      setShowUsernamePrompt(false);
    } else {
      setShowUsernamePrompt(true);
    }
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && username && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, username]);

  const handleSetUsername = useCallback(() => {
    const trimmedUsername = usernameInput.trim();
    if (trimmedUsername) {
      localStorage.setItem(LOCALSTORAGE_USERNAME_KEY, trimmedUsername);
      setUsername(trimmedUsername);
      setShowUsernamePrompt(false);
      setUsernameInput('');
    }
  }, [usernameInput]);

  const handleSendMessage = useCallback(async () => {
    const trimmedMessage = messageInput.trim();
    if (trimmedMessage && username) {
      await sendMessage({ body: trimmedMessage, author: username });
      setMessageInput('');
    }
  }, [messageInput, username, sendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }, [handleSendMessage]);

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 1) {
      return 'just now';
    } else if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffMins < 1440) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const changeUsername = useCallback(() => {
    setShowUsernamePrompt(true);
    setUsernameInput(username || '');
  }, [username]);

  return (
    <div 
      className={`fixed top-0 right-0 h-full bg-white border-l border-gray-300 flex flex-col transition-transform duration-300 z-[9999] ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
      style={{ width: '360px' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-3">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#444746">
            <path d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18zM18 14H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
          </svg>
          <div>
            <h2 className="text-gray-800 font-medium text-sm">Global Chat</h2>
            <p className="text-gray-500 text-xs">{messages.length} messages</p>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-200 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Username badge */}
      {username && !showUsernamePrompt && (
        <div className="px-4 py-2 bg-white border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-medium">
              {username.charAt(0).toUpperCase()}
            </div>
            <span className="text-sm text-gray-700">
              Chatting as <span className="font-medium text-gray-900">{username}</span>
            </span>
          </div>
          <button 
            onClick={changeUsername}
            className="text-xs text-gray-500 hover:text-blue-600 transition-colors"
          >
            Change
          </button>
        </div>
      )}

      {/* Username prompt modal */}
      {showUsernamePrompt && (
        <div className="absolute inset-0 bg-white z-10 flex flex-col">
          <div className="flex-1 flex flex-col items-center justify-center p-8">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-6">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="#5f6368">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Welcome to Global Chat</h3>
            <p className="text-gray-500 text-sm text-center mb-6 max-w-[260px]">
              Enter a username to start chatting with everyone on the platform.
            </p>
            <div className="w-full max-w-[280px]">
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && usernameInput.trim()) {
                    handleSetUsername();
                  }
                }}
                placeholder="Enter your username..."
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-600 transition-colors"
                autoFocus
                maxLength={20}
              />
              <button
                onClick={handleSetUsername}
                disabled={!usernameInput.trim()}
                className="w-full mt-3 px-4 py-2.5 bg-blue-600 text-white font-medium rounded-lg text-sm transition-colors hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Start Chatting
              </button>
              {username && (
                <button
                  onClick={() => setShowUsernamePrompt(false)}
                  className="w-full mt-2 px-4 py-2 text-gray-500 text-sm hover:text-gray-700 transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Messages list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && !showUsernamePrompt && (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 px-6">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9aa0a6" strokeWidth="1.5" className="mb-4 opacity-50">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <p className="text-sm font-medium text-gray-700 mb-1">No messages yet</p>
            <p className="text-xs text-gray-500">Be the first to say hello!</p>
          </div>
        )}
        
        {messages.map((msg) => {
          const isOwnMessage = msg.author === username;
          return (
            <div 
              key={msg._id}
              className={`flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'}`}
            >
              {!isOwnMessage && (
                <div className="flex items-center gap-1.5 mb-1 ml-1">
                  <div className="w-5 h-5 rounded-full bg-gray-400 flex items-center justify-center text-white text-[10px] font-medium">
                    {msg.author.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-xs font-medium text-gray-700">{msg.author}</span>
                </div>
              )}
              <div 
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  isOwnMessage 
                    ? 'bg-blue-600 text-white rounded-br-sm' 
                    : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                }`}
              >
                {msg.body}
              </div>
              <span className={`text-[10px] text-gray-400 mt-1 ${isOwnMessage ? 'mr-1' : 'ml-1'}`}>
                {formatTimestamp(msg.createdAt)}
              </span>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Message input */}
      {username && !showUsernamePrompt && (
        <div className="border-t border-gray-200 p-3 bg-white">
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center border border-gray-300 rounded-3xl px-4 py-1.5 bg-white transition-colors focus-within:border-blue-600">
              <input
                ref={inputRef}
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                className="flex-1 border-none bg-transparent text-sm outline-none text-gray-800 placeholder:text-gray-400"
                maxLength={500}
              />
            </div>
            <button
              onClick={handleSendMessage}
              disabled={!messageInput.trim()}
              className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center transition-colors hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex-shrink-0"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7"/>
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
