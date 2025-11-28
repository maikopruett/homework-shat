import { useRef, useEffect, useState } from 'react';
import type { Document } from '../hooks/useDocuments';
import { AVAILABLE_MODELS } from '../api/openrouter';

interface ChatSidebarProps {
  documents: Document[];
  activeDocument: Document | undefined;
  isLoading: boolean;
  isWritingToDoc: boolean;
  selectedModel: string;
  onModelChange: (model: string) => void;
  isOpen: boolean;
  onClose: () => void;
  onSendMessage: (text: string) => void;
  onCreateDocument: (title?: string) => void;
  onSwitchDocument: (docId: string) => void;
}

export default function ChatSidebar({
  documents,
  activeDocument,
  isLoading,
  isWritingToDoc,
  selectedModel,
  onModelChange,
  isOpen,
  onClose,
  onSendMessage,
  onCreateDocument,
  onSwitchDocument,
}: ChatSidebarProps) {
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const [chatInput, setChatInput] = useState('');
  const [showDocList, setShowDocList] = useState(true);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);

  // Close model menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setModelMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentModel = AVAILABLE_MODELS.find(m => m.id === selectedModel) || AVAILABLE_MODELS[0];

  // Auto-scroll chat
  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [activeDocument?.chatMessages]);

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatInput.trim() && !isLoading) {
      onSendMessage(chatInput.trim());
      setChatInput('');
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSubmit(e);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const handleNewDocument = () => {
    onCreateDocument();
  };

  const chatMessages = activeDocument?.chatMessages || [];

  return (
    <div className={`bg-white border-l border-gray-300 flex flex-col transition-all duration-300 overflow-hidden ${isOpen ? 'w-[360px] min-w-[360px]' : 'w-0 min-w-0'}`}>
        {/* Document List Panel */}
        <div className="border-b border-gray-200 bg-white">
          <div 
            className="flex items-center justify-between px-4 py-3 cursor-pointer transition-colors hover:bg-gray-50"
            onClick={() => setShowDocList(!showDocList)}
          >
            <div className="flex items-center gap-2 text-[13px] font-medium text-gray-800">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-500">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <span>Documents ({documents.length})</span>
            </div>
            <svg 
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={`text-gray-500 transition-transform duration-200 ${showDocList ? 'rotate-180' : ''}`}
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>
          
          {showDocList && (
            <div className="max-h-60 overflow-y-auto px-2 pb-2">
              <button 
                className="flex items-center gap-2 w-full px-3 py-2 border border-dashed border-gray-300 bg-transparent rounded-lg text-blue-600 text-[13px] font-medium cursor-pointer transition-all mb-1 hover:bg-blue-50 hover:border-blue-600"
                onClick={handleNewDocument}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                New document
              </button>
              {documents.map(doc => (
                <button
                  key={doc.id}
                  className={`flex items-start gap-2.5 w-full px-3 py-2.5 border-none bg-transparent rounded-lg text-left cursor-pointer transition-colors hover:bg-gray-100 ${doc.id === activeDocument?.id ? 'bg-blue-50' : ''}`}
                  onClick={() => onSwitchDocument(doc.id)}
                >
                  <div className={`w-5 h-5 flex items-center justify-center flex-shrink-0 ${doc.id === activeDocument?.id ? 'text-blue-600' : 'text-blue-600'}`}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <line x1="8" y1="13" x2="16" y2="13"/>
                      <line x1="8" y1="17" x2="14" y2="17"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-[13px] font-medium whitespace-nowrap overflow-hidden text-ellipsis ${doc.id === activeDocument?.id ? 'text-blue-600' : 'text-gray-800'}`}>{doc.title}</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      {doc.chatMessages.length} messages · {formatDate(doc.updatedAt)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-800 relative" ref={modelMenuRef}>
            <div 
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors hover:bg-gray-100"
              onClick={() => setModelMenuOpen(!modelMenuOpen)}
            >
              <svg width="18" height="18" viewBox="0 -960 960 960" fill="currentColor" className="text-blue-600">
                <path d="M480-80q-6,0-11-4t-7-10q-17-67-51-126T328-328T220-411T94-462q-6-2-10-7t-4-11t4-11t10-7q67-17 126-51t108-83t83-108t51-126q2-6 7-10t11-4t10.5,4t6.5,10q18,67 52,126t83,108t108,83t126,51q6,2 10,7t4,11t-4,11t-10,7q-67,17-126,51T632-328T549-220T498-94q-2,6-7,10t-11,4Z"/>
              </svg>
              <span className="font-medium text-gray-800">{currentModel.name}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-500">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
            {isWritingToDoc && (
              <span className="inline-flex items-center gap-1.5 bg-green-50 text-green-700 text-[11px] font-medium px-2.5 py-0.5 rounded-xl ml-2 animate-pulse">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-ping" />
                Writing...
              </span>
            )}
            
            {modelMenuOpen && (
              <div className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.15),_0_0_0_1px_rgba(0,0,0,0.05)] min-w-[260px] max-h-[400px] overflow-y-auto z-[1000] animate-[dropdown-in_0.15s_ease]">
                <div className="py-2">
                  <div className="px-4 py-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Select Model</div>
                  {AVAILABLE_MODELS.map(model => (
                    <button
                      key={model.id}
                      className={`flex items-center justify-between w-full px-4 py-2.5 border-none bg-transparent text-left cursor-pointer transition-colors hover:bg-gray-100 ${model.id === selectedModel ? 'bg-blue-50' : ''}`}
                      onClick={() => {
                        onModelChange(model.id);
                        setModelMenuOpen(false);
                      }}
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium text-gray-800">{model.name}</span>
                        <span className="text-xs text-gray-500">{model.provider}</span>
                      </div>
                      {model.id === selectedModel && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-600 flex-shrink-0">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button 
            className="w-8 h-8 border-none bg-transparent rounded-full cursor-pointer flex items-center justify-center text-gray-500 transition-colors hover:bg-gray-200"
            onClick={onClose}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3" ref={chatMessagesRef}>
          {chatMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 px-6">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9aa0a6" strokeWidth="1.5" className="mb-4 opacity-50">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <p className="text-[13px] leading-relaxed max-w-[240px]">Ask me to write, edit, or improve your document. I'll make changes directly in the editor.</p>
              <div className="flex flex-wrap gap-2 mt-4 justify-center">
                <span className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-2xl text-xs cursor-pointer transition-colors hover:bg-blue-100">"Write an essay about..."</span>
                <span className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-2xl text-xs cursor-pointer transition-colors hover:bg-blue-100">"Make it bold"</span>
                <span className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-2xl text-xs cursor-pointer transition-colors hover:bg-blue-100">"Change color to blue"</span>
                <span className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-2xl text-xs cursor-pointer transition-colors hover:bg-blue-100">"Make the intro shorter"</span>
              </div>
            </div>
          )}
          {chatMessages.map((msg) => (
            <div key={msg.id} className="flex flex-col gap-2">
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-snug ${
                msg.role === 'user' 
                  ? 'self-end bg-blue-600 text-white rounded-br-sm' 
                  : 'self-start bg-gray-100 text-gray-800 rounded-bl-sm whitespace-pre-wrap'
              }`}>
                {msg.role === 'assistant' && !msg.content ? (
                  <span className="flex gap-1 py-1">
                    <span className="w-2 h-2 bg-blue-600 rounded-full animate-[pulse-dot_1.4s_ease-in-out_infinite]" />
                    <span className="w-2 h-2 bg-blue-600 rounded-full animate-[pulse-dot_1.4s_ease-in-out_infinite] [animation-delay:0.2s]" />
                    <span className="w-2 h-2 bg-blue-600 rounded-full animate-[pulse-dot_1.4s_ease-in-out_infinite] [animation-delay:0.4s]" />
                  </span>
                ) : (
                  <>
                    {msg.content}
                    {msg.isWriting && (
                      <span className="inline-flex items-center gap-[3px] ml-2">
                        <span className="w-1 h-1 bg-gray-500 rounded-full animate-[typing_1.4s_ease-in-out_infinite]" />
                        <span className="w-1 h-1 bg-gray-500 rounded-full animate-[typing_1.4s_ease-in-out_infinite] [animation-delay:0.2s]" />
                        <span className="w-1 h-1 bg-gray-500 rounded-full animate-[typing_1.4s_ease-in-out_infinite] [animation-delay:0.4s]" />
                      </span>
                    )}
                  </>
                )}
              </div>
              {msg.role === 'assistant' && msg.isWriting && (
                <div className="flex items-center gap-1.5 text-xs text-green-700 py-1 ml-1">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-500 animate-bounce">
                    <path d="M12 19l7-7 3 3-7 7-3-3z"/>
                    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
                    <path d="M2 2l7.586 7.586"/>
                  </svg>
                  <span>Writing to document...</span>
                </div>
              )}
            </div>
          ))}
        </div>

        <form className="flex items-end gap-2 px-4 py-3 border-t border-gray-200 bg-white" onSubmit={handleChatSubmit}>
          <textarea
            ref={chatInputRef}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={handleChatKeyDown}
            placeholder="Ask AI to write or edit..."
            rows={1}
            disabled={isLoading}
            className="flex-1 border border-gray-300 rounded-2xl px-4 py-2.5 text-sm font-[inherit] resize-none outline-none max-h-[120px] leading-snug transition-colors text-black bg-white focus:border-blue-600 placeholder:text-gray-400"
          />
          <button 
            type="submit" 
            disabled={!chatInput.trim() || isLoading}
            className="w-10 h-10 border-none bg-blue-600 rounded-full cursor-pointer flex items-center justify-center text-white transition-all flex-shrink-0 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </form>
    </div>
  );
}
