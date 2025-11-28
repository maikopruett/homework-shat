import { useRef, useEffect, useState } from 'react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  inserted?: boolean;
}

interface GoogleDocsUIProps {
  onSubmit: (text: string) => void;
  isLoading: boolean;
  aiResponse: string;
}

export default function GoogleDocsUI({ onSubmit, isLoading, aiResponse }: GoogleDocsUIProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [pendingResponse, setPendingResponse] = useState(false);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.focus();
    }
  }, []);

  // Handle AI response
  useEffect(() => {
    if (aiResponse && pendingResponse) {
      setChatMessages(prev => {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage && lastMessage.role === 'assistant') {
          // Update existing assistant message
          return prev.map((msg, i) => 
            i === prev.length - 1 ? { ...msg, content: aiResponse } : msg
          );
        } else {
          // Add new assistant message
          return [...prev, {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: aiResponse
          }];
        }
      });
    }
  }, [aiResponse, pendingResponse]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // When loading completes, mark pending as done
  useEffect(() => {
    if (!isLoading && pendingResponse) {
      setPendingResponse(false);
    }
  }, [isLoading, pendingResponse]);

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatInput.trim() && !isLoading) {
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: chatInput.trim()
      };
      setChatMessages(prev => [...prev, userMessage]);
      setPendingResponse(true);
      onSubmit(chatInput.trim());
      setChatInput('');
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSubmit(e);
    }
  };

  const insertIntoDocument = (content: string, messageId: string) => {
    if (editorRef.current) {
      const currentContent = editorRef.current.innerHTML;
      const newContent = currentContent 
        ? currentContent + '<br><br>' + content.replace(/\n/g, '<br>')
        : content.replace(/\n/g, '<br>');
      editorRef.current.innerHTML = newContent;
      
      // Mark message as inserted
      setChatMessages(prev => 
        prev.map(msg => msg.id === messageId ? { ...msg, inserted: true } : msg)
      );
    }
  };

  return (
    <div className="gdocs-container">
      {/* Top Header with logo and title */}
      <header className="gdocs-header">
        <div className="gdocs-header-left">
          {/* Google Docs Icon */}
          <div className="gdocs-icon">
            <svg viewBox="0 0 48 48" width="40" height="40">
              <path fill="#2196F3" d="M37,45H11c-1.657,0-3-1.343-3-3V6c0-1.657,1.343-3,3-3h19l10,10v29C40,43.657,38.657,45,37,45z"/>
              <path fill="#BBDEFB" d="M40,13H30V3L40,13z"/>
              <path fill="#1565C0" d="M30 13L40 13 30 3z"/>
              <path fill="#E3F2FD" d="M15 23H33V25H15zM15 27H33V29H15zM15 31H33V33H15zM15 35H25V37H15z"/>
            </svg>
          </div>
          
          <div className="gdocs-title-area">
            <input 
              type="text" 
              defaultValue="Untitled document" 
              className="gdocs-title-input"
              onClick={(e) => e.currentTarget.select()}
            />
            <div className="gdocs-title-icons">
              <button className="gdocs-icon-btn" title="Star">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
              </button>
              <button className="gdocs-icon-btn" title="Move">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
              </button>
              <span className="gdocs-save-status">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                </svg>
              </span>
            </div>
          </div>
        </div>
        
        <div className="gdocs-header-right">
          <button className="gdocs-icon-btn gdocs-history-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </button>
          <button className="gdocs-icon-btn gdocs-comments-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </button>
          <button className="gdocs-icon-btn gdocs-meet-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 8v8l-4-4 4-4zm-6 0v8H5V8h8zm-7 7h6V9H6v6z"/>
            </svg>
          </button>
          <button className="gdocs-share-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="8.5" cy="7" r="4"/>
              <line x1="20" y1="8" x2="20" y2="14"/>
              <line x1="23" y1="11" x2="17" y2="11"/>
            </svg>
            Share
          </button>
          <div className="gdocs-avatar">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="#5f6368">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
            </svg>
          </div>
        </div>
      </header>

      {/* Menu Bar */}
      <nav className="gdocs-menubar">
        <button className="gdocs-menu-item">File</button>
        <button className="gdocs-menu-item">Edit</button>
        <button className="gdocs-menu-item">View</button>
        <button className="gdocs-menu-item">Insert</button>
        <button className="gdocs-menu-item">Format</button>
        <button className="gdocs-menu-item">Tools</button>
        <button className="gdocs-menu-item">Extensions</button>
        <button className="gdocs-menu-item">Help</button>
      </nav>

      {/* Toolbar */}
      <div className="gdocs-toolbar">
        <div className="gdocs-toolbar-group">
          <button className="gdocs-toolbar-btn" title="Undo (Ctrl+Z)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 7v6h6"/>
              <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
            </svg>
          </button>
          <button className="gdocs-toolbar-btn" title="Redo (Ctrl+Y)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 7v6h-6"/>
              <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/>
            </svg>
          </button>
          <button className="gdocs-toolbar-btn" title="Print (Ctrl+P)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
          </button>
          <button className="gdocs-toolbar-btn" title="Spelling and grammar check (Ctrl+Alt+X)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </button>
          <button className="gdocs-toolbar-btn" title="Paint format">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v4c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>
              <path d="M12 11v9"/>
              <path d="M8 21h8"/>
            </svg>
          </button>
        </div>

        <div className="gdocs-toolbar-divider"></div>

        <div className="gdocs-toolbar-group">
          <select className="gdocs-toolbar-select gdocs-zoom-select">
            <option>100%</option>
          </select>
        </div>

        <div className="gdocs-toolbar-divider"></div>

        <div className="gdocs-toolbar-group">
          <select className="gdocs-toolbar-select gdocs-font-select">
            <option>Arial</option>
          </select>
        </div>

        <div className="gdocs-toolbar-divider"></div>

        <div className="gdocs-toolbar-group">
          <button className="gdocs-toolbar-btn gdocs-fontsize-btn">−</button>
          <input type="text" className="gdocs-fontsize-input" defaultValue="11" />
          <button className="gdocs-toolbar-btn gdocs-fontsize-btn">+</button>
        </div>

        <div className="gdocs-toolbar-divider"></div>

        <div className="gdocs-toolbar-group">
          <button className="gdocs-toolbar-btn" title="Bold (Ctrl+B)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/>
            </svg>
          </button>
          <button className="gdocs-toolbar-btn" title="Italic (Ctrl+I)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z"/>
            </svg>
          </button>
          <button className="gdocs-toolbar-btn" title="Underline (Ctrl+U)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z"/>
            </svg>
          </button>
          <button className="gdocs-toolbar-btn" title="Text color">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11 2L5.5 16h2.25l1.12-3h6.25l1.12 3h2.25L13 2h-2zm-1.38 9L12 4.67 14.38 11H9.62z"/>
              <rect x="3" y="18" width="18" height="4" fill="#000"/>
            </svg>
          </button>
          <button className="gdocs-toolbar-btn" title="Highlight color">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 3l-1.25 1.25L16 5.5 17.25 4.25 16 3zm-6.5 4L5.5 11l1.41 1.41 4-4L9.5 7zm4.25 0L7 13.75V17h3.25l6.75-6.75L13.75 7zM5 19v2h14v-2H5z"/>
            </svg>
          </button>
        </div>

        <div className="gdocs-toolbar-divider"></div>

        <div className="gdocs-toolbar-group">
          <button className="gdocs-toolbar-btn" title="Insert link (Ctrl+K)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
          </button>
          <button className="gdocs-toolbar-btn" title="Add comment (Ctrl+Alt+M)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
            </svg>
          </button>
          <button className="gdocs-toolbar-btn" title="Insert image">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </button>
        </div>

        <div className="gdocs-toolbar-divider"></div>

        <div className="gdocs-toolbar-group">
          <button className="gdocs-toolbar-btn" title="Align">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="17" y1="10" x2="3" y2="10"/>
              <line x1="21" y1="6" x2="3" y2="6"/>
              <line x1="21" y1="14" x2="3" y2="14"/>
              <line x1="17" y1="18" x2="3" y2="18"/>
            </svg>
          </button>
          <button className="gdocs-toolbar-btn" title="Line & paragraph spacing">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="21" y1="10" x2="7" y2="10"/>
              <line x1="21" y1="6" x2="7" y2="6"/>
              <line x1="21" y1="14" x2="7" y2="14"/>
              <line x1="21" y1="18" x2="7" y2="18"/>
              <polyline points="3 6 3 18"/>
              <polyline points="5 8 3 6 1 8"/>
              <polyline points="5 16 3 18 1 16"/>
            </svg>
          </button>
          <button className="gdocs-toolbar-btn" title="Checklist">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="5" height="5"/>
              <rect x="3" y="10" width="5" height="5"/>
              <rect x="3" y="17" width="5" height="5"/>
              <line x1="11" y1="5.5" x2="21" y2="5.5"/>
              <line x1="11" y1="12.5" x2="21" y2="12.5"/>
              <line x1="11" y1="19.5" x2="21" y2="19.5"/>
            </svg>
          </button>
          <button className="gdocs-toolbar-btn" title="Bulleted list">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="9" y1="6" x2="21" y2="6"/>
              <line x1="9" y1="12" x2="21" y2="12"/>
              <line x1="9" y1="18" x2="21" y2="18"/>
              <circle cx="4" cy="6" r="2" fill="currentColor"/>
              <circle cx="4" cy="12" r="2" fill="currentColor"/>
              <circle cx="4" cy="18" r="2" fill="currentColor"/>
            </svg>
          </button>
          <button className="gdocs-toolbar-btn" title="Numbered list">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z"/>
            </svg>
          </button>
          <button className="gdocs-toolbar-btn" title="Decrease indent">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="21" y1="6" x2="11" y2="6"/>
              <line x1="21" y1="12" x2="11" y2="12"/>
              <line x1="21" y1="18" x2="11" y2="18"/>
              <polyline points="7 8 3 12 7 16"/>
            </svg>
          </button>
          <button className="gdocs-toolbar-btn" title="Increase indent">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="21" y1="6" x2="11" y2="6"/>
              <line x1="21" y1="12" x2="11" y2="12"/>
              <line x1="21" y1="18" x2="11" y2="18"/>
              <polyline points="3 8 7 12 3 16"/>
            </svg>
          </button>
          <button className="gdocs-toolbar-btn" title="Clear formatting">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3.27 5L2 6.27l6.97 6.97L6.5 19h3l1.57-3.66L16.73 21 18 19.73 3.27 5zM6 5v.18L8.82 8h2.4l-.72 1.68 2.1 2.1L14.21 8H20V5H6z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Ruler */}
      <div className="gdocs-ruler">
        <div className="gdocs-ruler-inner">
          {[...Array(17)].map((_, i) => (
            <div key={i} className="gdocs-ruler-mark">
              <span className="gdocs-ruler-number">{i + 1}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content Area with Document and Chat Sidebar */}
      <div className="gdocs-main-content">
        {/* Document Area */}
        <div className="gdocs-document-area">
          {/* AI Chat Toggle Arrow */}
          <button 
            className={`gdocs-chat-toggle ${chatOpen ? 'open' : ''}`}
            onClick={() => setChatOpen(!chatOpen)}
            title="AI Assistant"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points={chatOpen ? "15 18 9 12 15 6" : "9 18 15 12 9 6"}/>
            </svg>
            {!chatOpen && (
              <span className="gdocs-chat-toggle-label">AI</span>
            )}
          </button>

          <div className="gdocs-page">
            <div
              ref={editorRef}
              className="gdocs-editor"
              contentEditable
              suppressContentEditableWarning
              data-placeholder="Start typing your document..."
            />
          </div>
        </div>

        {/* Chat Sidebar */}
        <div className={`gdocs-chat-sidebar ${chatOpen ? 'open' : ''}`}>
          <div className="gdocs-chat-header">
            <div className="gdocs-chat-header-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
                <path d="M12 6v6l4 2"/>
              </svg>
              <span>AI Assistant</span>
            </div>
            <button 
              className="gdocs-chat-close"
              onClick={() => setChatOpen(false)}
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
                <p>Ask me to help you write, edit, or brainstorm ideas for your document.</p>
              </div>
            )}
            {chatMessages.map((msg) => (
              <div key={msg.id} className={`gdocs-chat-message ${msg.role}`}>
                <div className="gdocs-chat-message-content">
                  {msg.content}
                </div>
                {msg.role === 'assistant' && msg.content && (
                  <button
                    className={`gdocs-insert-btn ${msg.inserted ? 'inserted' : ''}`}
                    onClick={() => insertIntoDocument(msg.content, msg.id)}
                    disabled={msg.inserted}
                  >
                    {msg.inserted ? (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        Inserted
                      </>
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 5v14"/>
                          <path d="M5 12h14"/>
                        </svg>
                        Insert into document
                      </>
                    )}
                  </button>
                )}
              </div>
            ))}
            {isLoading && (
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
              placeholder="Ask AI to write something..."
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
      </div>
    </div>
  );
}
