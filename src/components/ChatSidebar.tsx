import { useRef, useEffect, useState, useCallback } from 'react';
import type { Document, ChatMode } from '../hooks/useDocuments';
import { AVAILABLE_MODELS } from '../api/openrouter';
import { parseFile, isValidFileType, getAcceptedFileTypes, type ParsedFile } from '../utils/fileParser';
import type { SearchResult } from '../api/exa';

interface ChatSidebarProps {
  documents: Document[];
  activeDocument: Document | undefined;
  isLoading: boolean;
  isWritingToDoc: boolean;
  isSearching: boolean;
  selectedModel: string;
  onModelChange: (model: string) => void;
  chatMode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  isOpen: boolean;
  onSendMessage: (text: string, mode: ChatMode, searchResults?: SearchResult[]) => void;
  onSearch: (query: string) => Promise<SearchResult[]>;
  onStopGeneration: () => void;
  onCreateDocument: (title?: string) => void;
  onSwitchDocument: (docId: string) => void;
}

export default function ChatSidebar({
  documents,
  activeDocument,
  isLoading,
  isSearching,
  selectedModel,
  onModelChange,
  chatMode,
  onModeChange,
  isOpen,
  onSendMessage,
  onSearch,
  onStopGeneration,
  onCreateDocument,
  onSwitchDocument,
}: ChatSidebarProps) {
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [chatInput, setChatInput] = useState('');
  const [showDocList, setShowDocList] = useState(true);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<ParsedFile[]>([]);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [researchEnabled, setResearchEnabled] = useState(false);
  const dragCounter = useRef(0);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setModelMenuOpen(false);
      }
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target as Node)) {
        setToolsMenuOpen(false);
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

  // Handle file processing
  const processFiles = useCallback(async (files: FileList | File[]) => {
    const validFiles = Array.from(files).filter(isValidFileType);
    
    if (validFiles.length === 0) {
      setFileError('Please drop .txt, .pdf, or .docx files');
      setTimeout(() => setFileError(null), 3000);
      return;
    }

    setIsParsingFile(true);
    setFileError(null);

    try {
      const parsed = await Promise.all(validFiles.map(parseFile));
      setAttachedFiles(prev => [...prev, ...parsed]);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Failed to parse file');
      setTimeout(() => setFileError(null), 3000);
    } finally {
      setIsParsingFile(false);
    }
  }, []);

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  }, [processFiles]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
    // Reset input so the same file can be selected again
    e.target.value = '';
  }, [processFiles]);

  const removeAttachedFile = useCallback((index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((chatInput.trim() || attachedFiles.length > 0) && !isLoading && !isSearching) {
      // Build message with attached file contents
      let message = chatInput.trim();
      
      if (attachedFiles.length > 0) {
        const fileContents = attachedFiles.map(f => 
          `--- ${f.name} ---\n${f.content}`
        ).join('\n\n');
        
        if (message) {
          message = `${message}\n\n[Attached Requirements]\n${fileContents}`;
        } else {
          message = `Here are my assignment requirements:\n\n${fileContents}`;
        }
      }
      
      // If research mode is enabled, search first then send with results
      if (researchEnabled && message) {
        const searchQuery = message.slice(0, 200); // Use first 200 chars as search query
        const searchResults = await onSearch(searchQuery);
        onSendMessage(message, chatMode, searchResults);
        setResearchEnabled(false); // Turn off after use
      } else {
        onSendMessage(message, chatMode);
      }
      
      setChatInput('');
      setAttachedFiles([]);
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
    <div 
      className={`bg-white border-l border-gray-300 flex flex-col transition-all duration-300 overflow-hidden relative ${isOpen ? 'w-[360px] min-w-[360px]' : 'w-0 min-w-0'}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
        {/* Drag overlay */}
        {isDragging && (
          <div className="absolute inset-0 bg-blue-500/10 border-2 border-dashed border-blue-500 z-50 flex items-center justify-center backdrop-blur-[1px]">
            <div className="bg-white rounded-xl p-6 shadow-lg text-center">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="1.5" className="mx-auto mb-3">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <p className="text-blue-600 font-medium">Drop your requirements file</p>
              <p className="text-gray-500 text-sm mt-1">.docx, .pdf, or .txt</p>
            </div>
          </div>
        )}

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
              {currentModel.isBest && (
                <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-blue-100 text-blue-700 rounded">Best</span>
              )}
              {currentModel.isFastest && (
                <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-green-100 text-green-700 rounded">Fast</span>
              )}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-500">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
            
            {modelMenuOpen && (
              <div className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.15),_0_0_0_1px_rgba(0,0,0,0.05)] min-w-[260px] max-h-[400px] overflow-y-auto z-[1000] animate-[dropdown-in_0.15s_ease]">
                <div className="py-2">
                  <div className="px-4 py-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Select Model</div>
                  {AVAILABLE_MODELS.map(model => (
                    <button
                      key={model.id}
                      className={`flex items-center justify-between w-full px-4 py-2.5 border-none text-left cursor-pointer transition-colors hover:bg-gray-100 ${
                        model.id === selectedModel 
                          ? 'bg-blue-50' 
                          : model.isBest 
                            ? 'bg-blue-50/50' 
                            : model.isFastest 
                              ? 'bg-green-50/50' 
                              : 'bg-transparent'
                      }`}
                      onClick={() => {
                        onModelChange(model.id);
                        setModelMenuOpen(false);
                      }}
                    >
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-800">{model.name}</span>
                          {model.isBest && (
                            <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-700 rounded">Best</span>
                          )}
                          {model.isFastest && (
                            <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-green-100 text-green-700 rounded">Fast</span>
                          )}
                        </div>
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
          
          {/* Mode Toggle */}
          <div className="flex items-center gap-1">
            <div className="flex items-center bg-gray-200 rounded-full p-0.5">
              <button
                type="button"
                onClick={() => onModeChange('chat')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                  chatMode === 'chat' 
                    ? 'bg-white text-gray-800 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                title="Chat mode - discuss without editing"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                Chat
              </button>
              <button
                type="button"
                onClick={() => onModeChange('edit')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                  chatMode === 'edit' 
                    ? 'bg-white text-green-700 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                title="Edit mode - AI can modify document"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Edit
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3" ref={chatMessagesRef}>
          {chatMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 px-6">
              {chatMode === 'edit' ? (
                <>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9aa0a6" strokeWidth="1.5" className="mb-4 opacity-50">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  <p className="text-[13px] leading-relaxed max-w-[240px]">Ask me to write, edit, or improve your document. I'll make changes directly in the editor.</p>
                  <div className="flex flex-wrap gap-2 mt-4 justify-center">
                    <span className="bg-green-50 text-green-700 px-3 py-1.5 rounded-2xl text-xs cursor-pointer transition-colors hover:bg-green-100">"Write an essay about..."</span>
                    <span className="bg-green-50 text-green-700 px-3 py-1.5 rounded-2xl text-xs cursor-pointer transition-colors hover:bg-green-100">"Make it bold"</span>
                    <span className="bg-green-50 text-green-700 px-3 py-1.5 rounded-2xl text-xs cursor-pointer transition-colors hover:bg-green-100">"Change color to blue"</span>
                  </div>
                </>
              ) : (
                <>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9aa0a6" strokeWidth="1.5" className="mb-4 opacity-50">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                  <p className="text-[13px] leading-relaxed max-w-[240px]">Chat about your document without making changes. Ask questions, get feedback, or brainstorm ideas.</p>
                  <div className="flex flex-wrap gap-2 mt-4 justify-center">
                    <span className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-2xl text-xs cursor-pointer transition-colors hover:bg-blue-100">"What do you think?"</span>
                    <span className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-2xl text-xs cursor-pointer transition-colors hover:bg-blue-100">"How can I improve this?"</span>
                    <span className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-2xl text-xs cursor-pointer transition-colors hover:bg-blue-100">"Is this clear?"</span>
                  </div>
                </>
              )}
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
                  msg.content
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

        <div className="border-t border-gray-200 bg-white">
          {/* Attached files display */}
          {attachedFiles.length > 0 && (
            <div className="px-4 pt-3 flex flex-wrap gap-2">
              {attachedFiles.map((file, index) => (
                <div 
                  key={index}
                  className="flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg text-xs"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  <span className="max-w-[120px] truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachedFile(index)}
                    className="hover:text-red-500 transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* File error message */}
          {fileError && (
            <div className="px-4 pt-2 text-xs text-red-500">
              {fileError}
            </div>
          )}

          {/* Parsing indicator */}
          {isParsingFile && (
            <div className="px-4 pt-2 text-xs text-blue-600 flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              Parsing file...
            </div>
          )}

          {/* Searching indicator */}
          {isSearching && (
            <div className="px-4 pt-2 text-xs text-purple-600 flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-pulse">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
              </svg>
              Researching topic...
            </div>
          )}

          {/* Research mode indicator */}
          {researchEnabled && !isSearching && (
            <div className="px-4 pt-2 flex items-center gap-2">
              <span className="text-xs text-purple-600 flex items-center gap-1.5 bg-purple-50 px-2 py-1 rounded-full">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.35-4.35"/>
                </svg>
                Research mode
                <button 
                  type="button" 
                  onClick={() => setResearchEnabled(false)}
                  className="ml-1 hover:text-purple-800"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </span>
            </div>
          )}

          <form className="flex items-center gap-2 px-3 py-3" onSubmit={handleChatSubmit}>
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept={getAcceptedFileTypes()}
              onChange={handleFileInputChange}
              className="hidden"
              multiple
            />
            
            {/* Tools menu button */}
            <div className="relative" ref={toolsMenuRef}>
              <button
                type="button"
                onClick={() => setToolsMenuOpen(!toolsMenuOpen)}
                disabled={isLoading}
                className={`w-9 h-9 border border-gray-300 rounded-full cursor-pointer flex items-center justify-center transition-all flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${
                  toolsMenuOpen 
                    ? 'bg-gray-200 text-gray-700 rotate-45' 
                    : 'bg-white text-gray-500 hover:bg-gray-50 hover:border-gray-400'
                }`}
                title="Tools"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
              
              {/* Tools menu popup */}
              {toolsMenuOpen && (
                <div className="absolute bottom-full left-0 mb-2 bg-white rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.15),_0_0_0_1px_rgba(0,0,0,0.05)] min-w-[180px] py-2 z-[1000] animate-[dropdown-in_0.15s_ease]">
                  <button
                    type="button"
                    onClick={() => {
                      setResearchEnabled(!researchEnabled);
                      setToolsMenuOpen(false);
                    }}
                    disabled={isSearching}
                    className={`flex items-center gap-3 w-full px-4 py-2.5 border-none text-left cursor-pointer transition-colors text-sm disabled:opacity-50 ${
                      researchEnabled ? 'bg-purple-50 text-purple-700' : 'bg-transparent text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8"/>
                      <path d="m21 21-4.35-4.35"/>
                    </svg>
                    {researchEnabled ? 'Research enabled' : 'Research first'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      fileInputRef.current?.click();
                      setToolsMenuOpen(false);
                    }}
                    disabled={isParsingFile}
                    className="flex items-center gap-3 w-full px-4 py-2.5 border-none bg-transparent text-left cursor-pointer transition-colors hover:bg-gray-100 text-gray-700 text-sm disabled:opacity-50"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                    </svg>
                    Attach file
                  </button>
                </div>
              )}
            </div>

            {/* Input container with embedded send button */}
            <div className="flex-1 flex items-center border border-gray-300 rounded-3xl pl-4 pr-1.5 py-1.5 bg-white transition-colors focus-within:border-blue-600">
              <textarea
                ref={chatInputRef}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                placeholder={
                  attachedFiles.length > 0 
                    ? "Add instructions or just send..." 
                    : chatMode === 'edit' 
                      ? "Ask AI to write or edit..." 
                      : "Chat about your document..."
                }
                rows={1}
                disabled={isLoading}
                className="flex-1 border-none bg-transparent text-sm font-[inherit] resize-none outline-none max-h-[100px] leading-snug text-black placeholder:text-gray-400 py-1"
              />
              {isLoading || isSearching ? (
                <button 
                  type="button"
                  onClick={onStopGeneration}
                  disabled={isSearching}
                  className="w-8 h-8 border-none bg-gray-500 rounded-full cursor-pointer flex items-center justify-center text-white transition-all flex-shrink-0 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed ml-2"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                </button>
              ) : (
                <button 
                  type="submit" 
                  disabled={!chatInput.trim() && attachedFiles.length === 0}
                  className={`w-8 h-8 border-none rounded-full cursor-pointer flex items-center justify-center text-white transition-all flex-shrink-0 disabled:bg-gray-300 disabled:cursor-not-allowed ml-2 ${
                    researchEnabled ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 19V5M5 12l7-7 7 7"/>
                  </svg>
                </button>
              )}
            </div>
          </form>
        </div>
    </div>
  );
}
