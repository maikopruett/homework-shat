import { useRef, useEffect, useState } from 'react';
import type { Document } from '../hooks/useDocuments';

interface ChatSidebarProps {
  documents: Document[];
  activeDocument: Document | undefined;
  isLoading: boolean;
  isWritingToDoc: boolean;
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
  isOpen,
  onClose,
  onSendMessage,
  onCreateDocument,
  onSwitchDocument,
}: ChatSidebarProps) {
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const [chatInput, setChatInput] = useState('');
  const [showDocList, setShowDocList] = useState(true);

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
    <div className={`gdocs-chat-sidebar ${isOpen ? 'open' : ''}`}>
        {/* Document List Panel */}
        <div className={`gdocs-doc-list-panel ${showDocList ? 'expanded' : ''}`}>
          <div 
            className="gdocs-doc-list-header"
            onClick={() => setShowDocList(!showDocList)}
          >
            <div className="gdocs-doc-list-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <span>Documents ({documents.length})</span>
            </div>
            <svg 
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={`gdocs-doc-list-chevron ${showDocList ? 'expanded' : ''}`}
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>
          
          {showDocList && (
            <div className="gdocs-doc-list">
              <button 
                className="gdocs-doc-list-new"
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
                  className={`gdocs-doc-list-item ${doc.id === activeDocument?.id ? 'active' : ''}`}
                  onClick={() => onSwitchDocument(doc.id)}
                >
                  <div className="gdocs-doc-list-item-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <line x1="8" y1="13" x2="16" y2="13"/>
                      <line x1="8" y1="17" x2="14" y2="17"/>
                    </svg>
                  </div>
                  <div className="gdocs-doc-list-item-content">
                    <div className="gdocs-doc-list-item-title">{doc.title}</div>
                    <div className="gdocs-doc-list-item-meta">
                      {doc.chatMessages.length} messages · {formatDate(doc.updatedAt)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="gdocs-chat-header">
          <div className="gdocs-chat-header-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <span>AI Assistant</span>
            {isWritingToDoc && (
              <span className="gdocs-writing-badge">
                <span className="gdocs-writing-dot"></span>
                Writing...
              </span>
            )}
          </div>
          <button 
            className="gdocs-chat-close"
            onClick={onClose}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="gdocs-chat-messages" ref={chatMessagesRef}>
          {chatMessages.length === 0 && (
            <div className="gdocs-chat-empty">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9aa0a6" strokeWidth="1.5">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <p>Ask me to write, edit, or improve your document. I'll make changes directly in the editor.</p>
              <div className="gdocs-chat-examples">
                <span className="gdocs-chat-example">"Write an essay about..."</span>
                <span className="gdocs-chat-example">"Make it bold"</span>
                <span className="gdocs-chat-example">"Change color to blue"</span>
                <span className="gdocs-chat-example">"Make the intro shorter"</span>
              </div>
            </div>
          )}
          {chatMessages.map((msg) => (
            <div key={msg.id} className={`gdocs-chat-message ${msg.role}`}>
              <div className="gdocs-chat-message-content">
                {msg.content}
                {msg.isWriting && (
                  <span className="gdocs-typing-indicator">
                    <span className="gdocs-typing-dot"></span>
                    <span className="gdocs-typing-dot"></span>
                    <span className="gdocs-typing-dot"></span>
                  </span>
                )}
              </div>
              {msg.role === 'assistant' && msg.isWriting && (
                <div className="gdocs-writing-status">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 19l7-7 3 3-7 7-3-3z"/>
                    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
                    <path d="M2 2l7.586 7.586"/>
                  </svg>
                  <span>Writing to document...</span>
                </div>
              )}
            </div>
          ))}
          {isLoading && !chatMessages.some(m => m.role === 'assistant' && m.content === '') && (
            <div className="gdocs-chat-message assistant">
              <div className="gdocs-chat-loading">
                <span className="gdocs-loading-dot"></span>
                <span className="gdocs-loading-dot"></span>
                <span className="gdocs-loading-dot"></span>
              </div>
            </div>
          )}
        </div>

        <form className="gdocs-chat-input-area" onSubmit={handleChatSubmit}>
          <textarea
            ref={chatInputRef}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={handleChatKeyDown}
            placeholder="Ask AI to write or edit..."
            rows={1}
            disabled={isLoading}
          />
          <button 
            type="submit" 
            disabled={!chatInput.trim() || isLoading}
            className="gdocs-chat-send"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </form>
    </div>
  );
}
