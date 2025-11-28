import { useRef, useEffect, useState, useCallback } from 'react';
import type { Document } from '../hooks/useDocuments';
import ChatSidebar from './ChatSidebar';
import TiptapEditor, { type TiptapEditorHandle } from './TiptapEditor';

interface GoogleDocsUIProps {
  documents: Document[];
  activeDocument: Document | undefined;
  isLoading: boolean;
  isWritingToDoc: boolean;
  onSendMessage: (text: string, editorRef: React.RefObject<TiptapEditorHandle | null>) => void;
  onCreateDocument: (title?: string) => void;
  onSwitchDocument: (docId: string) => void;
  onUpdateTitle: (docId: string, title: string) => void;
  onUpdateContent: (docId: string, content: string) => void;
  onDeleteDocument: (docId: string) => void;
}

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];
const FONTS = [
  'Arial',
  'Times New Roman',
  'Georgia',
  'Verdana',
  'Courier New',
  'Comic Sans MS',
  'Impact',
  'Trebuchet MS',
];

const HEADING_OPTIONS = [
  { label: 'Normal text', value: 'paragraph' },
  { label: 'Heading 1', value: 'h1' },
  { label: 'Heading 2', value: 'h2' },
  { label: 'Heading 3', value: 'h3' },
  { label: 'Heading 4', value: 'h4' },
  { label: 'Heading 5', value: 'h5' },
  { label: 'Heading 6', value: 'h6' },
];

const TEXT_COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff',
  '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff',
  '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc',
  '#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd',
  '#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#6fa8dc', '#8e7cc3', '#c27ba0',
];

const HIGHLIGHT_COLORS = [
  '#ffffff', '#000000', '#ffff00', '#00ff00', '#00ffff', '#ff00ff', '#ff0000', '#0000ff',
  '#ffcdd2', '#f8bbd9', '#e1bee7', '#d1c4e9', '#c5cae9', '#bbdefb', '#b3e5fc', '#b2ebf2',
  '#b2dfdb', '#c8e6c9', '#dcedc8', '#f0f4c3', '#fff9c4', '#ffecb3', '#ffe0b2', '#ffccbc',
];

export default function GoogleDocsUI({ 
  documents,
  activeDocument,
  isLoading,
  isWritingToDoc,
  onSendMessage,
  onCreateDocument,
  onSwitchDocument,
  onUpdateTitle,
  onUpdateContent,
  onDeleteDocument,
}: GoogleDocsUIProps) {
  const editorRef = useRef<TiptapEditorHandle>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  
  // Toolbar state
  const [fontSize, setFontSize] = useState(11);
  const [fontFamily, setFontFamily] = useState('Arial');
  const [headingStyle, setHeadingStyle] = useState('paragraph');
  const [textColorOpen, setTextColorOpen] = useState(false);
  const [highlightColorOpen, setHighlightColorOpen] = useState(false);
  const [currentTextColor, setCurrentTextColor] = useState('#000000');
  const [currentHighlightColor, setCurrentHighlightColor] = useState('#ffff00');
  const [alignMenuOpen, setAlignMenuOpen] = useState(false);
  const [headingMenuOpen, setHeadingMenuOpen] = useState(false);
  const textColorRef = useRef<HTMLDivElement>(null);
  const highlightColorRef = useRef<HTMLDivElement>(null);
  const alignMenuRef = useRef<HTMLDivElement>(null);
  const headingMenuRef = useRef<HTMLDivElement>(null);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (fileMenuRef.current && !fileMenuRef.current.contains(e.target as Node)) {
        setFileMenuOpen(false);
      }
      if (textColorRef.current && !textColorRef.current.contains(e.target as Node)) {
        setTextColorOpen(false);
      }
      if (highlightColorRef.current && !highlightColorRef.current.contains(e.target as Node)) {
        setHighlightColorOpen(false);
      }
      if (alignMenuRef.current && !alignMenuRef.current.contains(e.target as Node)) {
        setAlignMenuOpen(false);
      }
      if (headingMenuRef.current && !headingMenuRef.current.contains(e.target as Node)) {
        setHeadingMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Save content helper
  const saveContent = useCallback(() => {
    if (editorRef.current && activeDocument) {
      onUpdateContent(activeDocument.id, editorRef.current.getHTML());
    }
  }, [activeDocument, onUpdateContent]);

  // Handle editor content update
  const handleEditorUpdate = useCallback((html: string) => {
    if (activeDocument) {
      onUpdateContent(activeDocument.id, html);
    }
  }, [activeDocument, onUpdateContent]);

  // Toolbar actions using Tiptap
  const handleBold = () => editorRef.current?.toggleBold();
  const handleItalic = () => editorRef.current?.toggleItalic();
  const handleUnderline = () => editorRef.current?.toggleUnderline();
  const handleStrikethrough = () => editorRef.current?.toggleStrike();
  
  const handleUndo = () => editorRef.current?.undo();
  const handleRedo = () => editorRef.current?.redo();
  
  const handleTextColor = (color: string) => {
    setCurrentTextColor(color);
    editorRef.current?.setTextColor(color);
    setTextColorOpen(false);
  };
  
  const handleHighlightColor = (color: string) => {
    setCurrentHighlightColor(color);
    editorRef.current?.setHighlight(color);
    setHighlightColorOpen(false);
  };
  
  const handleFontSize = (size: number) => {
    setFontSize(size);
    editorRef.current?.setFontSize(`${size}pt`);
  };
  
  const handleFontSizeIncrease = () => {
    const currentIndex = FONT_SIZES.indexOf(fontSize);
    if (currentIndex < FONT_SIZES.length - 1) {
      handleFontSize(FONT_SIZES[currentIndex + 1]);
    }
  };
  
  const handleFontSizeDecrease = () => {
    const currentIndex = FONT_SIZES.indexOf(fontSize);
    if (currentIndex > 0) {
      handleFontSize(FONT_SIZES[currentIndex - 1]);
    }
  };
  
  const handleFontFamily = (font: string) => {
    setFontFamily(font);
    editorRef.current?.setFontFamily(font);
  };

  const handleHeadingChange = (value: string) => {
    setHeadingStyle(value);
    if (value === 'paragraph') {
      editorRef.current?.setParagraph();
    } else {
      const level = parseInt(value.replace('h', '')) as 1 | 2 | 3 | 4 | 5 | 6;
      editorRef.current?.setHeading(level);
    }
    setHeadingMenuOpen(false);
  };
  
  const handleAlign = (alignment: string) => {
    const alignMap: Record<string, 'left' | 'center' | 'right' | 'justify'> = {
      'justifyLeft': 'left',
      'justifyCenter': 'center',
      'justifyRight': 'right',
      'justifyFull': 'justify',
    };
    editorRef.current?.setTextAlign(alignMap[alignment] || 'left');
    setAlignMenuOpen(false);
  };
  
  const handleBulletList = () => editorRef.current?.toggleBulletList();
  const handleNumberedList = () => editorRef.current?.toggleOrderedList();
  const handleIndent = () => editorRef.current?.indent();
  const handleOutdent = () => editorRef.current?.outdent();
  const handleClearFormatting = () => editorRef.current?.clearFormatting();
  
  const handleInsertLink = () => {
    const url = prompt('Enter URL:');
    if (url) {
      editorRef.current?.setLink(url);
    }
  };

  const handleNewDocument = () => {
    onCreateDocument();
    setFileMenuOpen(false);
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (activeDocument) {
      onUpdateTitle(activeDocument.id, e.target.value);
    }
  };

  // Handle sending message with editor ref
  const handleSendMessage = useCallback((text: string) => {
    onSendMessage(text, editorRef);
  }, [onSendMessage]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey) {
      switch (e.key.toLowerCase()) {
        case 'b':
          e.preventDefault();
          handleBold();
          break;
        case 'i':
          e.preventDefault();
          handleItalic();
          break;
        case 'u':
          e.preventDefault();
          handleUnderline();
          break;
        case 'z':
          if (e.shiftKey) {
            e.preventDefault();
            handleRedo();
          }
          break;
        case 'k':
          e.preventDefault();
          handleInsertLink();
          break;
      }
    }
  }, []);

  const currentHeadingLabel = HEADING_OPTIONS.find(h => h.value === headingStyle)?.label || 'Normal text';

  return (
    <div className="gdocs-container">
      {/* Top Header with logo and title */}
      <header className="gdocs-header">
        <div className="gdocs-header-left">
          {/* Google Docs Icon */}
          <a href="#" className="gdocs-logo-link" title="Docs home">
            <div className="gdocs-icon">
              <svg viewBox="0 0 48 48" width="36" height="36">
                <path fill="#4285F4" d="M29 3H11c-1.66 0-3 1.34-3 3v36c0 1.66 1.34 3 3 3h26c1.66 0 3-1.34 3-3V14L29 3z"/>
                <path fill="#A1C2FA" d="M29 3v11h11L29 3z"/>
                <path fill="#fff" d="M15 23h18v2H15zm0 4h18v2H15zm0 4h18v2H15zm0 4h12v2H15z"/>
              </svg>
            </div>
          </a>
          
          <div className="gdocs-title-area">
            <div className="gdocs-title-row">
              <input 
                type="text" 
                value={activeDocument?.title || 'Untitled document'}
                onChange={handleTitleChange}
                className="gdocs-title-input"
                onClick={(e) => e.currentTarget.select()}
                aria-label="Rename"
              />
              <div className="gdocs-title-badges">
                <button className="gdocs-badge-btn" title="Star" aria-label="Star">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" stroke="#5f6368" strokeWidth="1.5" fill="none"/>
                  </svg>
                </button>
                <button className="gdocs-badge-btn" title="Move" aria-label="Move">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#5f6368">
                    <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6 12l-4-4h3V9h2v5h3l-4 4z"/>
                  </svg>
                </button>
                <div className="gdocs-save-indicator" title="Document status: Saved to Drive">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#5f6368">
                    <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM10 17l-3.5-3.5 1.41-1.41L10 14.17l4.59-4.59L16 11l-6 6z"/>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="gdocs-header-right">
          <button className="gdocs-header-icon-btn" title="Last edit was recently" aria-label="See version history">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#444746">
              <path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>
            </svg>
          </button>
          <button className="gdocs-header-icon-btn" title="Open comment history" aria-label="Open comment history">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#444746">
              <path d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18zM18 14H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
            </svg>
          </button>
          <button className="gdocs-header-icon-btn gdocs-meet-btn" title="Join a call here or present this tab to the call">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#444746">
              <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
            </svg>
            <svg width="10" height="10" viewBox="0 0 20 20" className="gdocs-dropdown-arrow">
              <path d="M10 12 6 8h8Z" fill="#444746"/>
            </svg>
          </button>
          <button className="gdocs-share-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            Share
          </button>
          <button className="gdocs-gemini-btn" title="Ask Gemini" aria-label="Ask Gemini">
            <svg width="20" height="20" viewBox="0 -960 960 960" fill="#444746">
              <path d="M480-80q-6,0-11-4t-7-10q-17-67-51-126T328-328T220-411T94-462q-6-2-10-7t-4-11t4-11t10-7q67-17 126-51t108-83t83-108t51-126q2-6 7-10t11-4t10.5,4t6.5,10q18,67 52,126t83,108t108,83t126,51q6,2 10,7t4,11t-4,11t-10,7q-67,17-126,51T632-328T549-220T498-94q-2,6-7,10t-11,4Z"/>
            </svg>
          </button>
          <button className="gdocs-avatar" aria-label="Google Account">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="#5f6368">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
            </svg>
          </button>
        </div>
      </header>

      {/* Menu Bar */}
      <nav className="gdocs-menubar">
        <div className="gdocs-menu-wrapper" ref={fileMenuRef}>
          <button 
            className={`gdocs-menu-item ${fileMenuOpen ? 'active' : ''}`}
            onClick={() => setFileMenuOpen(!fileMenuOpen)}
          >
            File
          </button>
          {fileMenuOpen && (
            <div className="gdocs-dropdown-menu">
              <button className="gdocs-dropdown-item" onClick={handleNewDocument}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="12" y1="18" x2="12" y2="12"/>
                  <line x1="9" y1="15" x2="15" y2="15"/>
                </svg>
                New document
                <span className="gdocs-shortcut">⌘N</span>
              </button>
              <div className="gdocs-dropdown-divider"></div>
              <button 
                className="gdocs-dropdown-item"
                onClick={() => {
                  setChatOpen(true);
                  setFileMenuOpen(false);
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                Open document
                <span className="gdocs-shortcut">⌘O</span>
              </button>
              <div className="gdocs-dropdown-divider"></div>
              <button 
                className="gdocs-dropdown-item gdocs-dropdown-item-danger"
                onClick={() => {
                  if (activeDocument && documents.length > 1) {
                    onDeleteDocument(activeDocument.id);
                  }
                  setFileMenuOpen(false);
                }}
                disabled={documents.length <= 1}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                Delete document
              </button>
            </div>
          )}
        </div>
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
        {/* Search/Menus omnibox */}
        <div className="gdocs-omnibox" title="Search the menus (Option+/)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#5f6368">
            <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
          </svg>
          <span className="gdocs-omnibox-text">Menus</span>
        </div>

        <div className="gdocs-toolbar-group">
          <button className="gdocs-toolbar-btn" title="Undo (⌘Z)" onClick={handleUndo}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#444746">
              <path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/>
            </svg>
          </button>
          <button className="gdocs-toolbar-btn" title="Redo (⌘Y)" onClick={handleRedo}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#444746">
              <path d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z"/>
            </svg>
          </button>
          <button className="gdocs-toolbar-btn" title="Print (⌘P)" onClick={() => window.print()}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#444746">
              <path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/>
            </svg>
          </button>
          <button className="gdocs-toolbar-btn" title="Paint format">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#444746">
              <path d="M18 4V3c0-.55-.45-1-1-1H5c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1h12c.55 0 1-.45 1-1V6h1v4H9v11c0 .55.45 1 1 1h2c.55 0 1-.45 1-1v-9h8V4h-3z"/>
            </svg>
          </button>
        </div>

        <div className="gdocs-toolbar-divider"></div>

        {/* Heading/Style Selector */}
        <div className="gdocs-toolbar-group">
          <div className="gdocs-heading-wrapper" ref={headingMenuRef}>
            <button 
              className="gdocs-toolbar-select gdocs-heading-select"
              onClick={() => setHeadingMenuOpen(!headingMenuOpen)}
            >
              <span>{currentHeadingLabel}</span>
              <svg width="16" height="16" viewBox="0 0 20 20" className="gdocs-dropdown-arrow">
                <path d="M10 12 6 8h8Z" fill="#444746"/>
              </svg>
            </button>
            {headingMenuOpen && (
              <div className="gdocs-heading-menu">
                {HEADING_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    className={`gdocs-heading-option ${headingStyle === option.value ? 'active' : ''} gdocs-heading-${option.value}`}
                    onClick={() => handleHeadingChange(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="gdocs-toolbar-divider"></div>

        <div className="gdocs-toolbar-group">
          <select 
            className="gdocs-toolbar-select gdocs-font-select"
            value={fontFamily}
            onChange={(e) => handleFontFamily(e.target.value)}
          >
            {FONTS.map(font => (
              <option key={font} value={font} style={{ fontFamily: font }}>{font}</option>
            ))}
          </select>
        </div>

        <div className="gdocs-toolbar-divider"></div>

        <div className="gdocs-toolbar-group">
          <button className="gdocs-toolbar-btn gdocs-fontsize-btn" title="Decrease font size" onClick={handleFontSizeDecrease}>−</button>
          <select 
            className="gdocs-fontsize-input"
            value={fontSize}
            onChange={(e) => handleFontSize(Number(e.target.value))}
          >
            {FONT_SIZES.map(size => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
          <button className="gdocs-toolbar-btn gdocs-fontsize-btn" title="Increase font size" onClick={handleFontSizeIncrease}>+</button>
        </div>

        <div className="gdocs-toolbar-divider"></div>

        <div className="gdocs-toolbar-group">
          <button className="gdocs-toolbar-btn" title="Bold (⌘B)" onClick={handleBold}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#444746">
              <path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/>
            </svg>
          </button>
          <button className="gdocs-toolbar-btn" title="Italic (⌘I)" onClick={handleItalic}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#444746">
              <path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z"/>
            </svg>
          </button>
          <button className="gdocs-toolbar-btn" title="Underline (⌘U)" onClick={handleUnderline}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#444746">
              <path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z"/>
            </svg>
          </button>
          <button className="gdocs-toolbar-btn" title="Strikethrough" onClick={handleStrikethrough}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#444746">
              <path d="M10 19h4v-3h-4v3zM5 4v3h5v3h4V7h5V4H5zM3 14h18v-2H3v2z"/>
            </svg>
          </button>
          
          {/* Text Color */}
          <div className="gdocs-color-picker-wrapper" ref={textColorRef}>
            <button 
              className="gdocs-toolbar-btn gdocs-color-btn" 
              title="Text color"
              onClick={() => setTextColorOpen(!textColorOpen)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#444746">
                <path d="M11 2L5.5 16h2.25l1.12-3h6.25l1.12 3h2.25L13 2h-2zm-1.38 9L12 4.67 14.38 11H9.62z"/>
              </svg>
              <div className="gdocs-color-indicator" style={{ backgroundColor: currentTextColor }}></div>
            </button>
            {textColorOpen && (
              <div className="gdocs-color-picker">
                <div className="gdocs-color-grid">
                  {TEXT_COLORS.map(color => (
                    <button
                      key={color}
                      className="gdocs-color-swatch"
                      style={{ backgroundColor: color }}
                      onClick={() => handleTextColor(color)}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {/* Highlight Color */}
          <div className="gdocs-color-picker-wrapper" ref={highlightColorRef}>
            <button 
              className="gdocs-toolbar-btn gdocs-color-btn" 
              title="Highlight color"
              onClick={() => setHighlightColorOpen(!highlightColorOpen)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#444746">
                <path d="M6 14l3 3v5h6v-5l3-3V9H6v5zm5-12h2v3h-2V2zm6.24 3.66l1.47 1.47-2.12 2.12-1.47-1.47 2.12-2.12zM4.29 5.66l2.12 2.12-1.47 1.47-2.12-2.12 1.47-1.47z"/>
              </svg>
              <div className="gdocs-color-indicator" style={{ backgroundColor: currentHighlightColor }}></div>
            </button>
            {highlightColorOpen && (
              <div className="gdocs-color-picker">
                <div className="gdocs-color-grid gdocs-highlight-grid">
                  {HIGHLIGHT_COLORS.map(color => (
                    <button
                      key={color}
                      className="gdocs-color-swatch"
                      style={{ backgroundColor: color }}
                      onClick={() => handleHighlightColor(color)}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="gdocs-toolbar-divider"></div>

        <div className="gdocs-toolbar-group">
          <button className="gdocs-toolbar-btn" title="Insert link (⌘K)" onClick={handleInsertLink}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#444746">
              <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
            </svg>
          </button>
          <button className="gdocs-toolbar-btn" title="Add comment (⌘+Option+M)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#444746">
              <path d="M22 4c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4zm-2 13.17L18.83 16H4V4h16v13.17zM13 5h-2v4H7v2h4v4h2v-4h4V9h-4z"/>
            </svg>
          </button>
          <button className="gdocs-toolbar-btn" title="Insert image">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#444746">
              <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
            </svg>
          </button>
        </div>

        <div className="gdocs-toolbar-divider"></div>

        <div className="gdocs-toolbar-group">
          {/* Alignment Menu */}
          <div className="gdocs-align-wrapper" ref={alignMenuRef}>
            <button 
              className="gdocs-toolbar-btn" 
              title="Align & indent"
              onClick={() => setAlignMenuOpen(!alignMenuOpen)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#444746">
                <path d="M15 15H3v2h12v-2zm0-8H3v2h12V7zM3 13h18v-2H3v2zm0 8h18v-2H3v2zM3 3v2h18V3H3z"/>
              </svg>
            </button>
            {alignMenuOpen && (
              <div className="gdocs-align-menu">
                <button className="gdocs-align-option" onClick={() => handleAlign('justifyLeft')} title="Align left">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#444746">
                    <path d="M15 15H3v2h12v-2zm0-8H3v2h12V7zM3 13h18v-2H3v2zm0 8h18v-2H3v2zM3 3v2h18V3H3z"/>
                  </svg>
                </button>
                <button className="gdocs-align-option" onClick={() => handleAlign('justifyCenter')} title="Align center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#444746">
                    <path d="M7 15v2h10v-2H7zm-4 6h18v-2H3v2zm0-8h18v-2H3v2zm4-6v2h10V7H7zM3 3v2h18V3H3z"/>
                  </svg>
                </button>
                <button className="gdocs-align-option" onClick={() => handleAlign('justifyRight')} title="Align right">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#444746">
                    <path d="M3 21h18v-2H3v2zm6-4h12v-2H9v2zm-6-4h18v-2H3v2zm6-4h12V7H9v2zM3 3v2h18V3H3z"/>
                  </svg>
                </button>
                <button className="gdocs-align-option" onClick={() => handleAlign('justifyFull')} title="Justify">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#444746">
                    <path d="M3 21h18v-2H3v2zm0-4h18v-2H3v2zm0-4h18v-2H3v2zm0-4h18V7H3v2zm0-6v2h18V3H3z"/>
                  </svg>
                </button>
              </div>
            )}
          </div>
          
          <button className="gdocs-toolbar-btn" title="Bulleted list" onClick={handleBulletList}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#444746">
              <path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z"/>
            </svg>
          </button>
          <button className="gdocs-toolbar-btn" title="Numbered list" onClick={handleNumberedList}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#444746">
              <path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z"/>
            </svg>
          </button>
          <button className="gdocs-toolbar-btn" title="Decrease indent" onClick={handleOutdent}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#444746">
              <path d="M11 17h10v-2H11v2zm-8-5l4 4V8l-4 4zm0 9h18v-2H3v2zM3 3v2h18V3H3zm8 6h10V7H11v2zm0 4h10v-2H11v2z"/>
            </svg>
          </button>
          <button className="gdocs-toolbar-btn" title="Increase indent" onClick={handleIndent}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#444746">
              <path d="M3 21h18v-2H3v2zM3 8v8l4-4-4-4zm8 9h10v-2H11v2zM3 3v2h18V3H3zm8 6h10V7H11v2zm0 4h10v-2H11v2z"/>
            </svg>
          </button>
          <button className="gdocs-toolbar-btn" title="Clear formatting" onClick={handleClearFormatting}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#444746">
              <path d="M3.27 5L2 6.27l6.97 6.97L6.5 19h3l1.57-3.66L16.73 21 18 19.73 3.27 5zM6 5v.18L8.82 8h2.4l-.72 1.68 2.1 2.1L14.21 8H20V5H6z"/>
            </svg>
          </button>
        </div>

        <div className="gdocs-toolbar-spacer"></div>

        {/* Right side toolbar items */}
        <div className="gdocs-toolbar-right">
          <button className="gdocs-mode-btn" title="Editing mode">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#444746">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
            </svg>
            <span className="gdocs-mode-text">Editing</span>
            <svg width="16" height="16" viewBox="0 0 20 20" className="gdocs-dropdown-arrow">
              <path d="M10 12 6 8h8Z" fill="#444746"/>
            </svg>
          </button>
          <div className="gdocs-toolbar-divider"></div>
          <button className="gdocs-toolbar-btn" title="Hide the menus (Ctrl+Shift+F)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#444746">
              <path d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z"/>
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
        <div className={`gdocs-document-area ${isWritingToDoc ? 'ai-writing' : ''}`}>
          {/* Chat Toggle Arrow */}
          <button 
            className={`gdocs-chat-toggle ${chatOpen ? 'open' : ''}`}
            onClick={() => setChatOpen(!chatOpen)}
            title="Toggle AI sidebar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points={chatOpen ? "9 18 15 12 9 6" : "15 18 9 12 15 6"}/>
            </svg>
          </button>

          <div className="gdocs-pages-container">
            <div className="gdocs-page" onKeyDown={handleKeyDown}>
              <TiptapEditor
                ref={editorRef}
                content={activeDocument?.content || ''}
                onUpdate={handleEditorUpdate}
                onBlur={saveContent}
                placeholder="Start typing your document..."
                className="gdocs-editor"
              />
              <div className="gdocs-page-number">1</div>
            </div>
          </div>
        </div>

        {/* Chat Sidebar */}
        <ChatSidebar
          documents={documents}
          activeDocument={activeDocument}
          isLoading={isLoading}
          isWritingToDoc={isWritingToDoc}
          isOpen={chatOpen}
          onClose={() => setChatOpen(false)}
          onSendMessage={handleSendMessage}
          onCreateDocument={onCreateDocument}
          onSwitchDocument={onSwitchDocument}
        />
      </div>
    </div>
  );
}
