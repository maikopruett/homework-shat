import { useRef, useEffect, useState, useCallback } from 'react';
import type { Document, ChatMode, PersonaSettings, EssayTemplate } from '../hooks/useDocuments';
import ChatSidebar from './ChatSidebar';
import GlobalChatPanel from './GlobalChatPanel';
import TiptapEditor, { type TiptapEditorHandle, type EditorState } from './TiptapEditor';
import type { SearchResult } from '../api/exa';
import { parseFile, getAcceptedFileTypes, isValidFileType, type ParsedFile } from '../utils/fileParser';

interface GoogleDocsUIProps {
  documents: Document[];
  activeDocument: Document | undefined;
  isLoading: boolean;
  isSearching: boolean;
  selectedModel: string;
  onModelChange: (model: string) => void;
  onSendMessage: (text: string, editorRef: React.RefObject<TiptapEditorHandle | null>, mode: ChatMode, searchResults?: SearchResult[]) => void;
  onSearch: (query: string) => Promise<SearchResult[]>;
  onStopGeneration: () => void;
  onCreateDocument: (title?: string) => void;
  onSwitchDocument: (docId: string) => void;
  onUpdateTitle: (docId: string, title: string) => void;
  onUpdateContent: (docId: string, content: string) => void;
  onDeleteDocument: (docId: string) => void;
  personaSettings: PersonaSettings | null;
  onUpdatePersona: (settings: PersonaSettings | null) => void;
  ghostModeEnabled: boolean;
  onToggleGhostMode: () => void;
  // Template props
  templates: EssayTemplate[];
  selectedTemplate: EssayTemplate | null;
  onSelectTemplate: (template: EssayTemplate | null) => void;
  onSaveAsTemplate: (name: string, editorRef: React.RefObject<TiptapEditorHandle | null>) => void;
  onDeleteTemplate: (templateId: string) => void;
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
  isSearching,
  selectedModel,
  onModelChange,
  onSendMessage,
  onSearch,
  onStopGeneration,
  onCreateDocument,
  onSwitchDocument,
  onUpdateTitle,
  onUpdateContent,
  onDeleteDocument,
  personaSettings,
  onUpdatePersona,
  ghostModeEnabled,
  onToggleGhostMode,
  templates,
  selectedTemplate,
  onSelectTemplate,
  onSaveAsTemplate,
  onDeleteTemplate,
}: GoogleDocsUIProps) {
  const editorRef = useRef<TiptapEditorHandle>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [globalChatOpen, setGlobalChatOpen] = useState(false);
  const [chatMode, setChatMode] = useState<ChatMode>('edit');
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [personaModalOpen, setPersonaModalOpen] = useState(false);
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [personaDocName, setPersonaDocName] = useState<string | null>(null);
  const [personaDocContent, setPersonaDocContent] = useState<string | null>(null);
  const [personaUploadError, setPersonaUploadError] = useState<string | null>(null);
  const [isDraggingPersonaFile, setIsDraggingPersonaFile] = useState(false);
  const [isImportingDocument, setIsImportingDocument] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingImportContent, setPendingImportContent] = useState<string | null>(null);
  const [importPreviousDocId, setImportPreviousDocId] = useState<string | null>(null);
  // Ghost mode features
  const [ghostTemplateModalOpen, setGhostTemplateModalOpen] = useState(false);
  const [ghostAttachedFiles, setGhostAttachedFiles] = useState<ParsedFile[]>([]);
  const [isParsingGhostFile, setIsParsingGhostFile] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const downloadMenuRef = useRef<HTMLDivElement>(null);
  const infoRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const profileImageInputRef = useRef<HTMLInputElement>(null);
  const personaFileInputRef = useRef<HTMLInputElement>(null);
  const documentImportInputRef = useRef<HTMLInputElement>(null);
  const ghostFileInputRef = useRef<HTMLInputElement>(null);
  const ghostTemplateModalRef = useRef<HTMLDivElement>(null);
  
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
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [currentAlign, setCurrentAlign] = useState<'left' | 'center' | 'right' | 'justify'>('left');
  const textColorRef = useRef<HTMLDivElement>(null);
  const highlightColorRef = useRef<HTMLDivElement>(null);
  const alignMenuRef = useRef<HTMLDivElement>(null);
  const headingMenuRef = useRef<HTMLDivElement>(null);

  // Handle pending document import content
  useEffect(() => {
    // Only apply content when:
    // 1. We have pending content to import
    // 2. We're in import mode
    // 3. The activeDocument has changed from the previous one (meaning new doc was created)
    if (
      pendingImportContent && 
      activeDocument && 
      isImportingDocument && 
      activeDocument.id !== importPreviousDocId
    ) {
      // Set the content on the new document
      onUpdateContent(activeDocument.id, pendingImportContent);
      // Also set it in the editor directly to ensure it's displayed
      if (editorRef.current) {
        editorRef.current.setContent(pendingImportContent);
      }
      setPendingImportContent(null);
      setIsImportingDocument(false);
      setImportPreviousDocId(null);
    }
  }, [pendingImportContent, activeDocument, isImportingDocument, importPreviousDocId, onUpdateContent]);

  // Show import error
  useEffect(() => {
    if (importError) {
      alert(`Failed to import document: ${importError}`);
      setImportError(null);
    }
  }, [importError]);

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
      if (infoRef.current && !infoRef.current.contains(e.target as Node)) {
        setInfoOpen(false);
      }
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
      if (ghostTemplateModalRef.current && !ghostTemplateModalRef.current.contains(e.target as Node)) {
        setGhostTemplateModalOpen(false);
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

  // Handle editor selection update - sync toolbar with current selection
  const handleSelectionUpdate = useCallback((state: EditorState) => {
    // Update bold/italic/underline states
    setIsBold(state.isBold);
    setIsItalic(state.isItalic);
    setIsUnderline(state.isUnderline);
    
    // Update text color if set
    if (state.textColor) {
      setCurrentTextColor(state.textColor);
    }
    
    // Update highlight color if set
    if (state.highlightColor) {
      setCurrentHighlightColor(state.highlightColor);
    }
    
    // Update font family
    if (state.fontFamily) {
      setFontFamily(state.fontFamily);
    } else {
      setFontFamily('Arial'); // Default
    }
    
    // Update font size (parse from string like "11pt")
    if (state.fontSize) {
      const sizeMatch = state.fontSize.match(/(\d+)/);
      if (sizeMatch) {
        setFontSize(parseInt(sizeMatch[1], 10));
      }
    } else {
      // Default font size based on heading level or default
      if (state.headingLevel) {
        const headingSizes: Record<number, number> = { 1: 32, 2: 24, 3: 18, 4: 14, 5: 12, 6: 11 };
        setFontSize(headingSizes[state.headingLevel] || 11);
      } else {
        setFontSize(11); // Default
      }
    }
    
    // Update heading style
    if (state.headingLevel) {
      setHeadingStyle(`h${state.headingLevel}`);
    } else {
      setHeadingStyle('paragraph');
    }
    
    // Update text alignment
    setCurrentAlign(state.textAlign);
  }, []);

  // Toolbar actions using Tiptap
  const handleBold = () => editorRef.current?.toggleBold();
  const handleItalic = () => editorRef.current?.toggleItalic();
  const handleUnderline = () => editorRef.current?.toggleUnderline();
  
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
    const newAlign = alignMap[alignment] || 'left';
    setCurrentAlign(newAlign);
    editorRef.current?.setTextAlign(newAlign);
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

  // Download handlers
  const getDocumentTitle = () => activeDocument?.title || 'Untitled document';
  
  const downloadAsText = () => {
    const text = editorRef.current?.getText() || '';
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, `${getDocumentTitle()}.txt`);
    setFileMenuOpen(false);
    setDownloadMenuOpen(false);
  };

  const downloadAsHtml = () => {
    const html = editorRef.current?.getHTML() || '';
    const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${getDocumentTitle()}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; }
    h1, h2, h3, h4, h5, h6 { margin-top: 1.5em; margin-bottom: 0.5em; }
    p { margin: 1em 0; }
    ul, ol { margin: 1em 0; padding-left: 2em; }
    blockquote { border-left: 3px solid #ccc; margin: 1em 0; padding-left: 1em; color: #666; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
    pre { background: #f4f4f4; padding: 1em; border-radius: 5px; overflow-x: auto; }
  </style>
</head>
<body>
${html}
</body>
</html>`;
    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    downloadBlob(blob, `${getDocumentTitle()}.html`);
    setFileMenuOpen(false);
    setDownloadMenuOpen(false);
  };

  const downloadAsRtf = () => {
    const html = editorRef.current?.getHTML() || '';
    let rtf = '{\\rtf1\\ansi\\deff0\n';
    rtf += '{\\fonttbl{\\f0 Arial;}}\n';
    rtf += '\\f0\\fs24\n';
    
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    const processNode = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) {
        return (node.textContent || '').replace(/[\\{}]/g, '\\$&');
      }
      
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        const tagName = el.tagName.toLowerCase();
        let content = Array.from(el.childNodes).map(processNode).join('');
        
        switch (tagName) {
          case 'b':
          case 'strong':
            return `{\\b ${content}}`;
          case 'i':
          case 'em':
            return `{\\i ${content}}`;
          case 'u':
            return `{\\ul ${content}}`;
          case 'p':
            return `${content}\\par\n`;
          case 'br':
            return '\\line\n';
          case 'h1':
            return `{\\fs48\\b ${content}}\\par\n`;
          case 'h2':
            return `{\\fs36\\b ${content}}\\par\n`;
          case 'h3':
            return `{\\fs28\\b ${content}}\\par\n`;
          case 'li':
            return `\\tab\\bullet  ${content}\\par\n`;
          default:
            return content;
        }
      }
      return '';
    };
    
    rtf += processNode(tempDiv);
    rtf += '}';
    
    const blob = new Blob([rtf], { type: 'application/rtf' });
    downloadBlob(blob, `${getDocumentTitle()}.rtf`);
    setFileMenuOpen(false);
    setDownloadMenuOpen(false);
  };

  const downloadAsDocx = async () => {
    const html = editorRef.current?.getHTML() || '';
    const title = getDocumentTitle();
    
    const wordDoc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<?mso-application progid="Word.Document"?>
<w:wordDocument xmlns:w="http://schemas.microsoft.com/office/word/2003/wordml">
  <w:body>
    <w:p>
      <w:r>
        <w:t>${html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()}</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:wordDocument>`;
    
    const blob = new Blob([wordDoc], { type: 'application/vnd.ms-word' });
    downloadBlob(blob, `${title}.doc`);
    setFileMenuOpen(false);
    setDownloadMenuOpen(false);
  };

  const downloadAsPdf = () => {
    const html = editorRef.current?.getHTML() || '';
    const title = getDocumentTitle();
    
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <style>
    @page { margin: 1in; }
    body { font-family: Arial, sans-serif; line-height: 1.6; }
    h1, h2, h3, h4, h5, h6 { margin-top: 1.5em; margin-bottom: 0.5em; }
    p { margin: 1em 0; }
    ul, ol { margin: 1em 0; padding-left: 2em; }
    blockquote { border-left: 3px solid #ccc; margin: 1em 0; padding-left: 1em; color: #666; }
  </style>
</head>
<body>
${html}
</body>
</html>`);
      printWindow.document.close();
      printWindow.print();
    }
    setFileMenuOpen(false);
    setDownloadMenuOpen(false);
  };

  const downloadAsMarkdown = () => {
    const html = editorRef.current?.getHTML() || '';
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    const convertToMarkdown = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent || '';
      }
      
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        const tagName = el.tagName.toLowerCase();
        let content = Array.from(el.childNodes).map(convertToMarkdown).join('');
        
        switch (tagName) {
          case 'h1': return `# ${content}\n\n`;
          case 'h2': return `## ${content}\n\n`;
          case 'h3': return `### ${content}\n\n`;
          case 'h4': return `#### ${content}\n\n`;
          case 'h5': return `##### ${content}\n\n`;
          case 'h6': return `###### ${content}\n\n`;
          case 'p': return `${content}\n\n`;
          case 'br': return '\n';
          case 'strong':
          case 'b': return `**${content}**`;
          case 'em':
          case 'i': return `*${content}*`;
          case 'u': return `<u>${content}</u>`;
          case 's':
          case 'strike': return `~~${content}~~`;
          case 'code': return `\`${content}\``;
          case 'pre': return `\`\`\`\n${content}\n\`\`\`\n\n`;
          case 'blockquote': return `> ${content.trim().split('\n').join('\n> ')}\n\n`;
          case 'ul': return `${content}\n`;
          case 'ol': return `${content}\n`;
          case 'li': {
            const parent = el.parentElement?.tagName.toLowerCase();
            const prefix = parent === 'ol' ? '1.' : '-';
            return `${prefix} ${content.trim()}\n`;
          }
          case 'a': {
            const href = el.getAttribute('href') || '';
            return `[${content}](${href})`;
          }
          case 'hr': return '\n---\n\n';
          default: return content;
        }
      }
      return '';
    };
    
    const markdown = convertToMarkdown(tempDiv).trim();
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    downloadBlob(blob, `${getDocumentTitle()}.md`);
    setFileMenuOpen(false);
    setDownloadMenuOpen(false);
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (activeDocument) {
      onUpdateTitle(activeDocument.id, e.target.value);
    }
  };

  // Handle sending message with editor ref
  const handleSendMessage = useCallback((text: string, mode: ChatMode, searchResults?: SearchResult[]) => {
    onSendMessage(text, editorRef, mode, searchResults);
  }, [onSendMessage]);

  // Handle ghost mode submit (Ctrl+Enter in editor)
  const handleGhostSubmit = useCallback((text: string) => {
    if (ghostModeEnabled && text.trim()) {
      // Always use edit mode in ghost mode
      onSendMessage(text, editorRef, 'edit');
    }
  }, [ghostModeEnabled, onSendMessage]);

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
          // In ghost mode, Ctrl+U opens file upload, otherwise underline
          if (ghostModeEnabled) {
            ghostFileInputRef.current?.click();
          } else {
            handleUnderline();
          }
          break;
        case 't':
          // Ctrl+T opens template selection in ghost mode
          if (ghostModeEnabled) {
            e.preventDefault();
            setGhostTemplateModalOpen(true);
          }
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
  }, [ghostModeEnabled, handleBold, handleItalic, handleUnderline, handleRedo, handleInsertLink]);

  // Handle Escape key to close modals
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (helpModalOpen) {
          setHelpModalOpen(false);
        }
        if (personaModalOpen) {
          setPersonaModalOpen(false);
        }
        if (ghostTemplateModalOpen) {
          setGhostTemplateModalOpen(false);
        }
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [helpModalOpen, personaModalOpen, ghostTemplateModalOpen]);

  // Handle ghost mode keyboard shortcuts (Ctrl+T, Ctrl+U)
  useEffect(() => {
    if (!ghostModeEnabled) return;

    const handleGhostShortcuts = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        if (e.key.toLowerCase() === 't') {
          e.preventDefault();
          e.stopPropagation();
          setGhostTemplateModalOpen(true);
        } else if (e.key.toLowerCase() === 'u') {
          e.preventDefault();
          e.stopPropagation();
          ghostFileInputRef.current?.click();
        }
      }
    };

    document.addEventListener('keydown', handleGhostShortcuts, true); // Use capture phase
    return () => document.removeEventListener('keydown', handleGhostShortcuts, true);
  }, [ghostModeEnabled]);

  const currentHeadingLabel = HEADING_OPTIONS.find(h => h.value === headingStyle)?.label || 'Normal text';

  const headingFontSizes: Record<string, string> = {
    'paragraph': 'text-sm',
    'h1': 'text-2xl font-semibold',
    'h2': 'text-xl font-semibold',
    'h3': 'text-lg font-semibold',
    'h4': 'text-base font-semibold',
    'h5': 'text-sm font-semibold',
    'h6': 'text-xs font-semibold',
  };

  // Handle profile image upload
  const handleProfileImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Check file size (max 500KB)
    if (file.size > 500 * 1024) {
      alert('Image too large. Please use an image under 500KB.');
      return;
    }
    
    // Check file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      onUpdatePersona({
        documentName: personaSettings?.documentName || '',
        documentContent: personaSettings?.documentContent || '',
        profileImage: base64,
      });
    };
    reader.readAsDataURL(file);
    setProfileMenuOpen(false);
  }, [personaSettings, onUpdatePersona]);

  // Handle document import
  const handleDocumentImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsImportingDocument(true);
    setImportError(null);
    setFileMenuOpen(false);
    
    // Store the current document ID so we can detect when the new document is ready
    setImportPreviousDocId(activeDocument?.id || null);
    
    try {
      const parsed = await parseFile(file);
      // Remove file extension from name for the document title
      const title = parsed.name.replace(/\.[^/.]+$/, '');
      
      let htmlContent: string;
      
      if (parsed.isHtml) {
        // Content is already HTML with formatting preserved (e.g., from .docx)
        htmlContent = parsed.content;
      } else {
        // Convert plain text to HTML paragraphs (for .txt, .pdf)
        htmlContent = parsed.content
          .split('\n\n')
          .map(para => para.trim())
          .filter(para => para.length > 0)
          .map(para => `<p>${para.replace(/\n/g, '<br>')}</p>`)
          .join('');
      }
      
      // Store the content to be applied after document is created
      setPendingImportContent(htmlContent);
      
      // Create new document - the useEffect will handle setting the content
      onCreateDocument(title);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to import document');
      setIsImportingDocument(false);
      setImportPreviousDocId(null);
    }
    
    // Reset the input so the same file can be selected again
    e.target.value = '';
  }, [onCreateDocument, activeDocument?.id]);

  // Handle persona document upload
  const handlePersonaFileUpload = useCallback(async (file: File) => {
    setPersonaUploadError(null);
    
    try {
      const parsed = await parseFile(file);
      setPersonaDocName(parsed.name);
      setPersonaDocContent(parsed.content);
    } catch (err) {
      setPersonaUploadError(err instanceof Error ? err.message : 'Failed to parse file');
    }
  }, []);

  const handlePersonaFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handlePersonaFileUpload(file);
    }
  }, [handlePersonaFileUpload]);

  // Persona drag and drop handlers
  const handlePersonaDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingPersonaFile(true);
  }, []);

  const handlePersonaDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingPersonaFile(false);
  }, []);

  const handlePersonaDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingPersonaFile(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handlePersonaFileUpload(file);
    }
  }, [handlePersonaFileUpload]);

  // Open persona modal and load current settings
  const openPersonaModal = useCallback(() => {
    setPersonaDocName(personaSettings?.documentName || null);
    setPersonaDocContent(personaSettings?.documentContent || null);
    setPersonaUploadError(null);
    setPersonaModalOpen(true);
    setProfileMenuOpen(false);
  }, [personaSettings]);

  // Save persona settings
  const savePersonaSettings = useCallback(() => {
    if (personaDocName && personaDocContent) {
      onUpdatePersona({
        documentName: personaDocName,
        documentContent: personaDocContent,
        profileImage: personaSettings?.profileImage || null,
      });
    }
    setPersonaModalOpen(false);
  }, [personaDocName, personaDocContent, personaSettings, onUpdatePersona]);

  // Remove persona
  const removePersona = useCallback(() => {
    onUpdatePersona({
      documentName: '',
      documentContent: '',
      profileImage: personaSettings?.profileImage || null,
    });
    setPersonaDocName(null);
    setPersonaDocContent(null);
    setPersonaModalOpen(false);
  }, [personaSettings, onUpdatePersona]);

  // Ghost mode file processing
  const processGhostFile = useCallback(async (files: FileList | File[]) => {
    const validFiles = Array.from(files).filter(isValidFileType);
    
    if (validFiles.length === 0) {
      alert('Please select .txt, .pdf, .docx, or .html files');
      return;
    }

    setIsParsingGhostFile(true);

    try {
      const parsed = await Promise.all(validFiles.map(parseFile));
      setGhostAttachedFiles(prev => [...prev, ...parsed]);
      
      // Auto-send file content to AI
      const fileContents = parsed.map(f => 
        `--- ${f.name} ---\n${f.content}`
      ).join('\n\n');
      
      const message = `Here are my assignment requirements:\n\n${fileContents}`;
      onSendMessage(message, editorRef, 'edit');
      
      // Clear attached files after sending
      setGhostAttachedFiles([]);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to parse file');
    } finally {
      setIsParsingGhostFile(false);
    }
  }, [onSendMessage]);

  const handleGhostFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processGhostFile(e.target.files);
    }
    // Reset input so the same file can be selected again
    e.target.value = '';
  }, [processGhostFile]);

  return (
    <div className="flex flex-col h-full bg-gray-50 font-['Roboto',_'RobotoDraft',_Helvetica,_Arial,_sans-serif] text-[13px] text-black">
      {/* Google Docs Chrome - Top Header Bar */}
      <div className="bg-[#f9fbfd] border-b border-[#f9fbfd] -mb-px outline-none" role="banner" aria-label="Menu bar">
        {/* Banner Container */}
        <div className="flex justify-end">
          <div className="flex-auto relative overflow-hidden" />
        </div>
        
        {/* Header Container */}
        <div className="flex justify-end">
          <div className="flex-auto relative">
            {/* Branding Container - Google Docs Logo */}
            <div className="z-[1] w-16 h-16 absolute bg-transparent">
              <a href="#" data-tooltip="Docs home" aria-label="Docs home" className="inline-block w-10 h-10 rounded-full my-1 ml-2 p-2 transition-colors hover:bg-black/5 focus:bg-black/5 focus:outline-none">
                <div className="w-9 h-9">
                  <div className="text-left align-middle flex items-center justify-center w-9 h-9 overflow-hidden">
                    <svg viewBox="0 0 48 48" width="36" height="36">
                      <path fill="#4285F4" d="M29 3H11c-1.66 0-3 1.34-3 3v36c0 1.66 1.34 3 3 3h26c1.66 0 3-1.34 3-3V14L29 3z"/>
                      <path fill="#A1C2FA" d="M29 3v11h11L29 3z"/>
                      <path fill="#fff" d="M15 23h18v2H15zm0 4h18v2H15zm0 4h18v2H15zm0 4h12v2H15z"/>
                    </svg>
                  </div>
                </div>
              </a>
            </div>
            
            {/* Titlebar Container */}
            <div className="ml-[54px] relative">
              <div className="clear-both w-full h-6 pt-2 text-lg">
                <div className="whitespace-nowrap flex flex-row items-center">
                  {/* Title Widget */}
                  <div className="w-auto h-[27px] font-['Google_Sans',_Roboto,_RobotoDraft,_Helvetica,_Arial,_sans-serif]">
                    <div className="inline-block relative">
                      <input 
                        type="text" 
                        className="border border-transparent min-w-[1px] h-5 px-1.5 m-0 text-lg leading-[22px] text-gray-800 bg-transparent rounded outline-none font-['Google_Sans',_Roboto,_RobotoDraft,_Helvetica,_Arial,_sans-serif] hover:border-gray-500 focus:border-2 focus:border-blue-600 focus:mx-[-1px] focus:shadow-none focus:text-gray-900"
                        value={activeDocument?.title || 'Untitled document'}
                        onChange={handleTitleChange}
                        onClick={(e) => e.currentTarget.select()}
                        spellCheck="false"
                        aria-label="Rename"
                        data-tooltip="Rename"
                      />
                    </div>
                  </div>
                  
                  {/* Titlebar Badges */}
                  <div className="flex flex-nowrap items-center gap-1">
                    {/* Star Badge */}
                    <div className="flex flex-nowrap items-center px-0.5">
                      <div className="text-gray-500 cursor-pointer rounded-full flex items-center justify-center h-7 font-['Google_Sans',_Roboto,_RobotoDraft,_Helvetica,_Arial,_sans-serif] font-medium outline-none transition-colors hover:bg-gray-200 active:bg-gray-300" role="checkbox" aria-checked="false" data-tooltip="Star" aria-label="Star" tabIndex={0}>
                        <div className="w-5 h-5 m-1 flex items-center justify-center">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" stroke="#5f6368" strokeWidth="1.5" fill="none"/>
                          </svg>
                        </div>
                      </div>
                    </div>
                    
                    {/* Folder/Move Badge */}
                    <div className="flex flex-nowrap items-center px-0.5">
                      <div className="text-gray-500 cursor-pointer rounded-full flex items-center justify-center h-7 font-medium outline-none transition-colors hover:bg-gray-200 active:bg-gray-300" role="button" data-tooltip="Move" aria-label="Move" tabIndex={0}>
                        <div className="w-5 h-5 m-1 flex items-center justify-center">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="#5f6368">
                            <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6 12l-4-4h3V9h2v5h3l-4 4z"/>
                          </svg>
                        </div>
                      </div>
                    </div>
                    
                    {/* Save Indicator */}
                    <div className="flex flex-nowrap items-center px-0.5">
                      <div className="text-gray-500 cursor-pointer rounded-full flex items-center justify-center h-7 font-medium outline-none transition-colors hover:bg-gray-200 active:bg-gray-300" role="button" data-tooltip="See document status" aria-label="Document status: Saved to Drive." tabIndex={0}>
                        <div className="w-5 h-5 m-1 flex items-center justify-center">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="#5f6368">
                            <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM10 17l-3.5-3.5 1.41-1.41L10 14.17l4.59-4.59L16 11l-6 6z"/>
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Titlebar Buttons - Right Side */}
              <div className="text-right align-middle whitespace-nowrap font-['Google_Sans',_Roboto,_RobotoDraft,_Helvetica,_Arial,_sans-serif] absolute top-0 right-0 z-[900] flex items-center h-16 bg-[#f9fbfd] pl-4 pr-3">
                {/* Ghost Mode Indicator */}
                {ghostModeEnabled && (
                  <div className="inline-block relative mr-2" title="Ghost Mode Active - Press Ctrl+Enter to send">
                    <div 
                      className={`relative z-[1] text-center whitespace-nowrap outline-none text-xs leading-7 font-medium justify-center items-center inline-flex w-10 h-10 rounded-full border border-transparent transition-all duration-300 select-none ${
                        isSearching 
                          ? 'bg-purple-100 text-purple-600' 
                          : isLoading 
                            ? 'bg-blue-100 text-blue-600' 
                            : 'text-gray-500 hover:bg-black/[0.06]'
                      }`}
                      role="status"
                      aria-label={`Ghost Mode: ${isSearching ? 'Researching' : isLoading ? 'Working' : 'Ready'}`}
                    >
                      <svg 
                        width="24" 
                        height="24" 
                        viewBox="0 0 24 24" 
                        fill={
                          isSearching 
                            ? '#9333ea' 
                            : isLoading 
                              ? '#3b82f6' 
                              : '#5f6368'
                        }
                        className={`transition-all duration-300 ${(isLoading || isSearching) ? 'animate-pulse' : ''}`}
                      >
                        <path d="M12 2C7.58 2 4 5.58 4 10v8c0 1.1.9 2 2 2h1c0-1.1.9-2 2-2s2 .9 2 2h2c0-1.1.9-2 2-2s2 .9 2 2h1c1.1 0 2-.9 2-2v-8c0-4.42-3.58-8-8-8zm-2 9c-.83 0-1.5-.67-1.5-1.5S9.17 8 10 8s1.5.67 1.5 1.5S10.83 11 10 11zm4 0c-.83 0-1.5-.67-1.5-1.5S13.17 8 14 8s1.5.67 1.5 1.5S14.83 11 14 11z"/>
                      </svg>
                      
                      {/* Template indicator */}
                      {selectedTemplate && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-amber-500 rounded-full border-2 border-white flex items-center justify-center" title={`Template: ${selectedTemplate.name}`}>
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="white">
                            <rect x="3" y="3" width="18" height="18" rx="2"/>
                            <path d="M3 9h18"/>
                            <path d="M9 21V9"/>
                          </svg>
                        </div>
                      )}
                      
                      {/* File upload indicator */}
                      {(ghostAttachedFiles.length > 0 || isParsingGhostFile) && (
                        <div className={`absolute ${selectedTemplate ? '-bottom-0.5 -left-0.5' : '-bottom-0.5 -right-0.5'} w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white flex items-center justify-center`} title={isParsingGhostFile ? 'Processing file...' : `File uploaded: ${ghostAttachedFiles.map(f => f.name).join(', ')}`}>
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="white">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                          </svg>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {/* History Button */}
                <div className="inline-block relative">
                  <div 
                    className="relative z-[1] text-center whitespace-nowrap outline-none text-xs leading-7 font-medium text-[#444746] justify-center items-center inline-flex w-10 h-10 cursor-pointer rounded-full border border-transparent transition-colors hover:bg-black/[0.06] focus:bg-black/[0.06] select-none mr-2" 
                    role="button" 
                    aria-label="Last edit was recently" 
                    tabIndex={0}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="#444746">
                      <path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>
                    </svg>
                  </div>
                </div>
                
                {/* Comments Button - Global Chat */}
                <div className="inline-block relative">
                  <button 
                    className={`relative z-[1] text-center whitespace-nowrap outline-none text-xs leading-7 font-medium justify-center items-center inline-flex align-middle w-10 h-10 cursor-pointer rounded-full border transition-colors select-none mr-1.5 ${
                      globalChatOpen 
                        ? 'bg-indigo-100 text-indigo-600 border-indigo-200' 
                        : 'text-[#444746] border-transparent hover:bg-black/[0.06] focus:bg-zinc-200'
                    }`}
                    role="button" 
                    aria-pressed={globalChatOpen}
                    aria-label="Open global chat" 
                    tabIndex={0}
                    onClick={() => setGlobalChatOpen(!globalChatOpen)}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill={globalChatOpen ? '#4f46e5' : '#444746'}>
                      <path d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18zM18 14H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
                    </svg>
                  </button>
                </div>
                
                {/* Meet Button */}
                <div>
                  <div 
                    className="relative text-[#444746] text-center outline-none min-w-12 text-xs font-medium leading-7 ml-0.5 pl-1.5 pr-5 cursor-pointer bg-white rounded-3xl items-center w-16 h-10 flex mr-2 pb-0.5 border border-transparent select-none transition-colors hover:bg-black/[0.06]" 
                    role="button" 
                    aria-expanded="false" 
                    aria-haspopup="true" 
                    tabIndex={0} 
                    aria-label="Join a call here or present this tab to the call"
                  >
                    <div className="inline-block relative align-top whitespace-nowrap font-normal pl-0.5 pb-0.5">
                      <div className="inline-block relative text-left align-middle w-6 h-6 mt-1.5 mx-1">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="#444746">
                          <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
                        </svg>
                      </div>
                    </div>
                    <div className="inline-block w-0 h-0 border-t-4 border-x-4 border-solid border-x-transparent border-t-[#444746] absolute right-3.5 top-[18px]" />
                  </div>
                </div>
                
                {/* Share Button - Split Button */}
                <span className="inline-block">
                  <div 
                    className="relative z-[1] text-center outline-none justify-center items-center inline-flex align-middle tracking-[-0.4px] capitalize border border-transparent cursor-pointer whitespace-nowrap text-[#001d35] bg-[#c2e7ff] h-10 font-['Google_Sans',_Roboto,_sans-serif] text-sm font-medium leading-5 rounded-full pl-6 pr-2 py-2.5 rounded-tr-none rounded-br-none select-none transition-colors hover:bg-[#a8d4f0] active:bg-[#8bc4e8] active:shadow-inner" 
                    role="button" 
                    aria-label="Share. Private to only me."
                    tabIndex={0}
                  >
                    <span className="inline-block align-middle w-5 h-5 -ml-2 mr-2 mb-px">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#001d35" strokeWidth="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                    </span>
                    Share
                  </div>
                  <div 
                    className="relative z-[1] text-center outline-none justify-center items-center inline-flex align-middle cursor-pointer whitespace-nowrap text-[#001d35] bg-[#c2e7ff] h-10 font-['Google_Sans',_Roboto,_sans-serif] text-sm font-medium leading-5 border-l border-l-white border-y-transparent border-r-transparent w-9 min-w-9 -ml-px mr-2 pr-2 py-2.5 rounded-full rounded-tl-none rounded-bl-none select-none transition-colors hover:bg-[#a8d4f0] active:bg-[#8bc4e8] active:shadow-inner" 
                    role="button" 
                    aria-label="Quick sharing actions" 
                    aria-expanded="false" 
                    aria-haspopup="true" 
                    tabIndex={0}
                  >
                    <div className="inline-block w-0 border-t-4 border-x-4 border-solid border-x-transparent border-t-[#001d35] align-middle absolute right-3 top-[18px]" />
                  </div>
                </span>
                
                {/* Gemini/Sidekick Button */}
                <div className="mr-1">
                  <div className="w-10 h-10 relative group">
                    {/* Animated gradient border on hover */}
                    <div className="w-11 h-11 relative -top-0.5 -left-0.5 animate-[rotateFull_7s_linear_infinite_paused] group-hover:animate-[rotateFull_7s_linear_infinite]">
                      <div 
                        className="w-full h-full absolute scale-[0.2] group-hover:scale-100 transition-transform duration-300 ease-out bg-[linear-gradient(135deg,#217bfe,#078efb,#ac87eb,#217bfe)] bg-[length:800%] animate-[shimmer_2.1s_linear_infinite_paused] group-hover:animate-[shimmer_2.1s_linear_infinite]"
                        style={{ clipPath: "path('M29.6119 3.50376C27.9701 2.75188 25.1343 2 22 2C18.8657 2 16.0713 2.85149 14.3881 3.50376C12.4478 4.25564 9.76119 5.90977 7.97015 7.71429C6.1791 9.5188 4.38806 12.0752 3.49254 14.4812C2.73084 16.5277 2 19.7444 2 22.1504C2 24.1053 2.44776 26.9624 3.49254 29.6692C4.17681 31.442 6.08404 34.3854 7.97015 36.2857C9.91045 38.2406 12 39.4026 14.3881 40.4962C16.0299 41.2481 19.1642 42 22 42C24.8358 42 27.6278 41.2959 29.6119 40.4962C32.7463 39.2331 35.1343 37.188 36.0299 36.2857C37.9701 34.3308 39.0896 32.5263 40.209 30.2707C41.2537 28.1654 42 25.0075 42 22.1504C42 19.7444 41.6418 17.3383 40.5075 14.4812C39.4328 11.7744 37.599 9.29521 36.1791 7.86466C34.0896 5.7594 31.6815 4.45156 29.6119 3.50376Z')" }}
                      />
                    </div>
                    <button 
                      className="w-10 h-10 border-none rounded-[min(100%,20px)] cursor-pointer flex items-center justify-center bg-transparent transition-colors duration-300 absolute inset-0 text-[#444746] group-hover:text-white select-none" 
                      aria-label="Ask Gemini"
                    >
                      <span className="z-[1] transition-transform duration-700 ease-in-out group-hover:[transform:rotate(180deg)]">
                        <svg width="24" height="24" viewBox="0 -960 960 960" fill="currentColor">
                          <path d="M480-80q-6,0-11-4t-7-10q-17-67-51-126T328-328T220-411T94-462q-6-2-10-7t-4-11t4-11t10-7q67-17 126-51t108-83t83-108t51-126q2-6 7-10t11-4t10.5,4t6.5,10q18,67 52,126t83,108t108,83t126,51q6,2 10,7t4,11t-4,11t-10,7q-67,17-126,51T632-328T549-220T498-94q-2,6-7,10t-11,4Z"/>
                        </svg>
                      </span>
                    </button>
                  </div>
                </div>
                
                {/* User Avatar with Menu */}
                <div className="text-left relative" ref={profileMenuRef}>
                  <div className="align-middle whitespace-nowrap select-none items-center flex-none justify-end">
                    <div className="align-middle inline-block p-1">
                      <div className="relative">
                        <button 
                          className="align-middle outline-none w-10 h-10 inline-block rounded-full cursor-pointer p-1 transition-colors hover:bg-zinc-700/[0.08] focus:bg-zinc-700/[0.1] active:bg-zinc-700/[0.12] border-none bg-transparent" 
                          aria-label="Profile settings" 
                          onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                        >
                          <div className="w-8 h-8 relative rounded-full overflow-hidden">
                            {personaSettings?.profileImage ? (
                              <img 
                                src={personaSettings.profileImage} 
                                alt="Profile" 
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <svg width="32" height="32" viewBox="0 0 24 24" fill="#5f6368">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                              </svg>
                            )}
                          </div>
                          {/* Persona active indicator */}
                          {personaSettings?.documentContent && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-blue-500 rounded-full border-2 border-white flex items-center justify-center">
                              <svg width="8" height="8" viewBox="0 0 24 24" fill="white">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                              </svg>
                            </div>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  {/* Profile Dropdown Menu */}
                  {profileMenuOpen && (
                    <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-[0_2px_10px_rgba(0,0,0,0.15),_0_4px_20px_rgba(0,0,0,0.1)] min-w-[220px] py-2 z-[1000] animate-[dropdown-in_0.15s_ease]">
                      <div className="px-4 py-3 border-b border-gray-100">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-100 flex-shrink-0">
                            {personaSettings?.profileImage ? (
                              <img 
                                src={personaSettings.profileImage} 
                                alt="Profile" 
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <svg width="40" height="40" viewBox="0 0 24 24" fill="#5f6368">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                              </svg>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">Your Profile</p>
                            {personaSettings?.documentContent && (
                              <p className="text-xs text-blue-600 truncate">Persona active</p>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="py-1">
                        <button 
                          className="flex items-center gap-3 w-full px-4 py-2.5 border-none bg-transparent text-gray-800 text-sm text-left cursor-pointer transition-colors hover:bg-gray-100"
                          onClick={() => profileImageInputRef.current?.click()}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                            <circle cx="8.5" cy="8.5" r="1.5"/>
                            <polyline points="21 15 16 10 5 21"/>
                          </svg>
                          Change profile picture
                        </button>
                        <input 
                          ref={profileImageInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleProfileImageUpload}
                        />
                        
                        <button 
                          className="flex items-center gap-3 w-full px-4 py-2.5 border-none bg-transparent text-gray-800 text-sm text-left cursor-pointer transition-colors hover:bg-gray-100"
                          onClick={openPersonaModal}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                            <circle cx="12" cy="7" r="4"/>
                          </svg>
                          Persona settings
                          {personaSettings?.documentContent && (
                            <span className="ml-auto w-2 h-2 bg-blue-500 rounded-full" />
                          )}
                        </button>
                        
                        <div className="h-px bg-gray-200 my-1" />
                        
                        <button 
                          className={`flex items-center gap-3 w-full px-4 py-2.5 border-none text-sm text-left cursor-pointer transition-colors hover:bg-gray-100 ${ghostModeEnabled ? 'bg-purple-50 text-purple-700' : 'bg-transparent text-gray-800'}`}
                          onClick={() => {
                            onToggleGhostMode();
                            setProfileMenuOpen(false);
                          }}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill={ghostModeEnabled ? '#7c3aed' : 'currentColor'}>
                            <path d="M12 2C7.58 2 4 5.58 4 10v8c0 1.1.9 2 2 2h1c0-1.1.9-2 2-2s2 .9 2 2h2c0-1.1.9-2 2-2s2 .9 2 2h1c1.1 0 2-.9 2-2v-8c0-4.42-3.58-8-8-8zm-2 9c-.83 0-1.5-.67-1.5-1.5S9.17 8 10 8s1.5.67 1.5 1.5S10.83 11 10 11zm4 0c-.83 0-1.5-.67-1.5-1.5S13.17 8 14 8s1.5.67 1.5 1.5S14.83 11 14 11z"/>
                          </svg>
                          Ghost Mode
                          {ghostModeEnabled ? (
                            <span className="ml-auto text-xs text-purple-600 font-medium">ON</span>
                          ) : (
                            <span className="ml-auto text-xs text-gray-400">OFF</span>
                          )}
                        </button>
                        <p className="px-4 py-1.5 text-[10px] text-gray-400 leading-tight">
                          Type in doc, press Ctrl+Enter to send secretly
                        </p>
                      </div>
                      
                      {personaSettings?.profileImage && (
                        <>
                          <div className="h-px bg-gray-200 my-1" />
                          <button 
                            className="flex items-center gap-3 w-full px-4 py-2.5 border-none bg-transparent text-red-600 text-sm text-left cursor-pointer transition-colors hover:bg-gray-100"
                            onClick={() => {
                              onUpdatePersona({
                                ...personaSettings,
                                profileImage: null,
                              });
                              setProfileMenuOpen(false);
                            }}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                            Remove profile picture
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Menu Bars Container */}
      <div className="relative z-[100]">
        <div className="whitespace-nowrap">
          <div className="cursor-default whitespace-nowrap outline-none h-[33px] ml-[54px] font-['Google_Sans',_Roboto,_sans-serif] text-sm inline-block relative text-ellipsis align-top" role="menubar" tabIndex={0}>
            <div className="relative inline-block" ref={fileMenuRef}>
              <div 
                role="menuitem"
                className={`shadow-none text-gray-800 cursor-pointer tracking-[0.2px] border border-transparent rounded px-[7px] py-0.5 text-sm inline-block mt-2 -mb-1 select-none transition-colors align-text-bottom overflow-hidden hover:bg-gray-100 ${fileMenuOpen ? 'bg-gray-300' : ''}`}
                aria-expanded={fileMenuOpen}
                aria-haspopup="true"
                onClick={() => setFileMenuOpen(!fileMenuOpen)}
              >
                File
              </div>
              {fileMenuOpen && (
                <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-[0_2px_10px_rgba(0,0,0,0.15),_0_4px_20px_rgba(0,0,0,0.1)] min-w-[260px] py-2 z-[1000] animate-[dropdown-in_0.15s_ease]">
                  <button className="flex items-center gap-3 w-full px-4 py-2 border-none bg-transparent text-gray-800 text-sm text-left cursor-pointer transition-colors hover:bg-gray-100" onClick={handleNewDocument}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <line x1="12" y1="18" x2="12" y2="12"/>
                      <line x1="9" y1="15" x2="15" y2="15"/>
                    </svg>
                    New document
                    <span className="ml-auto text-xs text-gray-400">⌘N</span>
                  </button>
                  <div className="h-px bg-gray-200 my-2" />
                  <div className="group relative">
                    <button 
                      className="flex items-center gap-3 w-full px-4 py-2 border-none bg-transparent text-gray-800 text-sm text-left cursor-pointer transition-colors hover:bg-gray-100"
                      onClick={() => documentImportInputRef.current?.click()}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="12" y1="18" x2="12" y2="12"/>
                        <line x1="9" y1="15" x2="15" y2="15"/>
                      </svg>
                      Import document
                      <span className="ml-auto text-xs text-gray-400">⌘O</span>
                    </button>
                    {/* Tooltip with format info */}
                    <div className="absolute left-full top-0 ml-2 w-56 p-3 bg-white text-gray-800 text-xs rounded-lg shadow-[0_2px_10px_rgba(0,0,0,0.15),0_4px_20px_rgba(0,0,0,0.1)] border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[1100]">
                      <p className="font-medium mb-1.5 text-gray-900">Supported formats:</p>
                      <ul className="space-y-1 text-gray-600">
                        <li><span className="text-green-600 font-medium">✓ HTML</span> – Full formatting</li>
                        <li><span className="text-blue-600 font-medium">◐ DOCX</span> – Basic formatting</li>
                        <li><span className="text-gray-500">○ TXT/PDF</span> – Text only</li>
                      </ul>
                      <p className="mt-2 text-gray-500 border-t border-gray-200 pt-2">
                        Tip: Save Word docs as HTML
                      </p>
                    </div>
                  </div>
                  <input 
                    ref={documentImportInputRef}
                    type="file"
                    accept={getAcceptedFileTypes()}
                    className="hidden"
                    onChange={handleDocumentImport}
                  />
                  <div className="h-px bg-gray-200 my-2" />
                  
                  {/* Download submenu */}
                  <div 
                    className="relative flex items-center gap-3 w-full px-4 py-2 border-none bg-transparent text-gray-800 text-sm text-left cursor-pointer transition-colors hover:bg-gray-100"
                    ref={downloadMenuRef}
                    onMouseEnter={() => setDownloadMenuOpen(true)}
                    onMouseLeave={() => setDownloadMenuOpen(false)}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Download
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ml-auto flex-shrink-0 text-gray-500">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                    
                    {downloadMenuOpen && (
                      <div className="absolute left-full top-[-8px] ml-1 bg-white rounded-lg shadow-[0_2px_10px_rgba(0,0,0,0.15),_0_4px_20px_rgba(0,0,0,0.1)] min-w-[220px] py-2 z-[1001] animate-[dropdown-in_0.15s_ease]">
                        <button className="flex items-center gap-3 w-full px-4 py-2.5 border-none bg-transparent text-gray-800 text-sm text-left cursor-pointer transition-colors hover:bg-gray-100" onClick={downloadAsPdf}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EA4335" strokeWidth="2" className="flex-shrink-0">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                          </svg>
                          PDF Document (.pdf)
                        </button>
                        <button className="flex items-center gap-3 w-full px-4 py-2.5 border-none bg-transparent text-gray-800 text-sm text-left cursor-pointer transition-colors hover:bg-gray-100" onClick={downloadAsDocx}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4285F4" strokeWidth="2" className="flex-shrink-0">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                          </svg>
                          Microsoft Word (.doc)
                        </button>
                        <button className="flex items-center gap-3 w-full px-4 py-2.5 border-none bg-transparent text-gray-800 text-sm text-left cursor-pointer transition-colors hover:bg-gray-100" onClick={downloadAsRtf}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9C27B0" strokeWidth="2" className="flex-shrink-0">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                          </svg>
                          Rich Text Format (.rtf)
                        </button>
                        <div className="h-px bg-gray-200 my-2" />
                        <button className="flex items-center gap-3 w-full px-4 py-2.5 border-none bg-transparent text-gray-800 text-sm text-left cursor-pointer transition-colors hover:bg-gray-100" onClick={downloadAsHtml}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF5722" strokeWidth="2" className="flex-shrink-0">
                            <polyline points="16 18 22 12 16 6"/>
                            <polyline points="8 6 2 12 8 18"/>
                          </svg>
                          Web Page (.html)
                        </button>
                        <button className="flex items-center gap-3 w-full px-4 py-2.5 border-none bg-transparent text-gray-800 text-sm text-left cursor-pointer transition-colors hover:bg-gray-100" onClick={downloadAsMarkdown}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#607D8B" strokeWidth="2" className="flex-shrink-0">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                            <path d="M9 15l2-2 2 2"/>
                            <line x1="11" y1="13" x2="11" y2="17"/>
                          </svg>
                          Markdown (.md)
                        </button>
                        <button className="flex items-center gap-3 w-full px-4 py-2.5 border-none bg-transparent text-gray-800 text-sm text-left cursor-pointer transition-colors hover:bg-gray-100" onClick={downloadAsText}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#757575" strokeWidth="2" className="flex-shrink-0">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                            <line x1="16" y1="13" x2="8" y2="13"/>
                            <line x1="16" y1="17" x2="8" y2="17"/>
                          </svg>
                          Plain Text (.txt)
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <div className="h-px bg-gray-200 my-2" />
                  <button 
                    className="flex items-center gap-3 w-full px-4 py-2 border-none bg-transparent text-red-600 text-sm text-left cursor-pointer transition-colors hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => {
                      if (activeDocument && documents.length > 1) {
                        onDeleteDocument(activeDocument.id);
                      }
                      setFileMenuOpen(false);
                    }}
                    disabled={documents.length <= 1}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-600">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                    Delete document
                  </button>
                </div>
              )}
            </div>
            <div role="menuitem" className="shadow-none text-gray-800 cursor-pointer tracking-[0.2px] border border-transparent rounded px-[7px] py-0.5 text-sm inline-block mt-2 -mb-1 select-none transition-colors align-text-bottom overflow-hidden hover:bg-gray-100" aria-expanded="false" aria-haspopup="true">Edit</div>
            <div role="menuitem" className="shadow-none text-gray-800 cursor-pointer tracking-[0.2px] border border-transparent rounded px-[7px] py-0.5 text-sm inline-block mt-2 -mb-1 select-none transition-colors align-text-bottom overflow-hidden hover:bg-gray-100" aria-expanded="false" aria-haspopup="true">View</div>
            <div role="menuitem" className="shadow-none text-gray-800 cursor-pointer tracking-[0.2px] border border-transparent rounded px-[7px] py-0.5 text-sm inline-block mt-2 -mb-1 select-none transition-colors align-text-bottom overflow-hidden hover:bg-gray-100" aria-expanded="false" aria-haspopup="true">Insert</div>
            <div role="menuitem" className="shadow-none text-gray-800 cursor-pointer tracking-[0.2px] border border-transparent rounded px-[7px] py-0.5 text-sm inline-block mt-2 -mb-1 select-none transition-colors align-text-bottom overflow-hidden hover:bg-gray-100" aria-expanded="false" aria-haspopup="true">Format</div>
            <div role="menuitem" className="shadow-none text-gray-800 cursor-pointer tracking-[0.2px] border border-transparent rounded px-[7px] py-0.5 text-sm inline-block mt-2 -mb-1 select-none transition-colors align-text-bottom overflow-hidden hover:bg-gray-100" aria-expanded="false" aria-haspopup="true">Tools</div>
            <div role="menuitem" className="shadow-none text-gray-800 cursor-pointer tracking-[0.2px] border border-transparent rounded px-[7px] py-0.5 text-sm inline-block mt-2 -mb-1 select-none transition-colors align-text-bottom overflow-hidden hover:bg-gray-100" aria-expanded="false" aria-haspopup="true">Extensions</div>
            <button 
              role="menuitem" 
              className="shadow-none text-gray-800 cursor-pointer tracking-[0.2px] border border-transparent rounded px-[7px] py-0.5 text-sm inline-block mt-2 -mb-1 select-none transition-colors align-text-bottom overflow-hidden hover:bg-gray-100" 
              aria-expanded="false" 
              aria-haspopup="true"
              onClick={() => setHelpModalOpen(true)}
            >
              Help
            </button>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="relative bg-slate-100 min-h-10 font-['Google_Sans',_Roboto,_sans-serif] mt-1.5 mb-2 mx-4 px-2 rounded-3xl flex items-center select-none">
        {/* Search/Menus omnibox */}
        <div className="inline-block align-middle w-24 my-1 mr-1 select-none" role="toolbar" aria-label="Search the menus (Option+/)">
          <div className="relative w-24">
            <div className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#5f6368">
                <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
              </svg>
            </div>
            <input 
              className="w-full h-7 bg-white rounded-3xl border border-transparent pl-9 pr-2 text-sm font-normal text-stone-900 placeholder:text-zinc-700 placeholder:font-['Google_Sans',_Roboto,_sans-serif] focus:outline-none focus:shadow cursor-pointer select-none" 
              placeholder="Menus"
              readOnly
              tabIndex={-1}
            />
          </div>
        </div>

        {/* Main toolbar buttons */}
        <div className="inline-flex items-center">
          <button className="relative outline-none text-xs font-medium cursor-pointer border border-transparent text-black/70 min-w-7 h-7 mx-px my-1.5 rounded transition-colors hover:bg-zinc-700/[0.08] focus:bg-zinc-700/[0.12] select-none flex items-center justify-center" title="Undo (⌘Z)" onClick={handleUndo}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/>
            </svg>
          </button>
          <button className="relative outline-none text-xs font-medium cursor-pointer border border-transparent text-black/70 min-w-7 h-7 mx-px my-1.5 rounded transition-colors hover:bg-zinc-700/[0.08] focus:bg-zinc-700/[0.12] select-none flex items-center justify-center" title="Redo (⌘Y)" onClick={handleRedo}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z"/>
            </svg>
          </button>
          <button className="relative outline-none text-xs font-medium cursor-pointer border border-transparent text-black/70 min-w-7 h-7 mx-px my-1.5 rounded transition-colors hover:bg-zinc-700/[0.08] focus:bg-zinc-700/[0.12] select-none flex items-center justify-center" title="Print (⌘P)" onClick={() => window.print()}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/>
            </svg>
          </button>
          <button className="relative outline-none text-xs font-medium cursor-pointer border border-transparent text-black/70 min-w-7 h-7 mx-px my-1.5 rounded transition-colors hover:bg-zinc-700/[0.08] focus:bg-zinc-700/[0.12] select-none flex items-center justify-center" title="Paint format">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18 4V3c0-.55-.45-1-1-1H5c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1h12c.55 0 1-.45 1-1V6h1v4H9v11c0 .55.45 1 1 1h2c.55 0 1-.45 1-1v-9h8V4h-3z"/>
            </svg>
          </button>
        </div>

        {/* Separator */}
        <div className="inline-block align-top w-0 h-5 border-l border-stone-300 mx-1 my-2.5" role="separator" />

        {/* Heading/Style Selector */}
        <div className="inline-flex items-center">
          <div className="relative" ref={headingMenuRef}>
            <button 
              className="relative outline-none text-xs font-medium cursor-pointer border border-transparent text-black/70 min-w-7 h-7 mx-px my-1.5 rounded transition-colors hover:bg-zinc-700/[0.08] focus:bg-zinc-700/[0.12] select-none flex items-center justify-center pr-1"
              onClick={() => setHeadingMenuOpen(!headingMenuOpen)}
            >
              <div className="flex items-center min-w-7 h-7">
                <div className="text-left ml-2.5 text-ellipsis whitespace-nowrap overflow-hidden w-20 text-sm">
                  {currentHeadingLabel}
                </div>
                <div className="w-0 h-0 border-t-4 border-x-4 border-solid border-x-transparent border-t-zinc-700 ml-1.5 mr-1" />
              </div>
            </button>
            {headingMenuOpen && (
              <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-[0_2px_10px_rgba(0,0,0,0.15),0_4px_20px_rgba(0,0,0,0.1)] py-2 min-w-[180px] z-[1000] animate-[dropdown-in_0.15s_ease]">
                {HEADING_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    className={`block w-full px-4 py-2 border-none bg-transparent text-left cursor-pointer transition-colors text-gray-800 hover:bg-gray-100 ${headingStyle === option.value ? 'bg-blue-50 text-blue-600' : ''} ${headingFontSizes[option.value]}`}
                    onClick={() => handleHeadingChange(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Separator */}
        <div className="inline-block align-top w-0 h-5 border-l border-stone-300 mx-1 my-2.5" role="separator" />

        {/* Font Family */}
        <div className="inline-flex items-center">
          <div className="relative">
            <button className="relative outline-none text-xs font-medium cursor-pointer border border-transparent text-black/70 min-w-7 h-7 mx-px my-1.5 rounded transition-colors hover:bg-zinc-700/[0.08] focus:bg-zinc-700/[0.12] select-none flex items-center justify-center pr-1">
              <div className="flex items-center min-w-7 h-7">
                <div className="text-left ml-2.5 text-ellipsis whitespace-nowrap overflow-hidden w-14 text-sm">
                  {fontFamily}
                </div>
                <div className="w-0 h-0 border-t-4 border-x-4 border-solid border-x-transparent border-t-zinc-700 ml-1.5 mr-1" />
              </div>
            </button>
            <select 
              className="absolute inset-0 opacity-0 cursor-pointer w-full"
              value={fontFamily}
              onChange={(e) => handleFontFamily(e.target.value)}
            >
              {FONTS.map(font => (
                <option key={font} value={font} style={{ fontFamily: font }}>{font}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Separator */}
        <div className="inline-block align-top w-0 h-5 border-l border-stone-300 mx-1 my-2.5" role="separator" />

        {/* Font Size Controls */}
        <div className="inline-flex items-center">
          <button className="relative outline-none text-xs font-medium cursor-pointer text-black/70 w-6 h-6 ml-px my-1.5 rounded transition-colors hover:bg-zinc-700/[0.08] focus:bg-zinc-700/[0.12] select-none flex items-center justify-center" title="Decrease font size (⌘+Shift+comma)" onClick={handleFontSizeDecrease}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13H5v-2h14v2z"/>
            </svg>
          </button>
          <div className="relative mx-1 flex items-center">
            <input 
              type="text"
              className="w-8 h-6 text-center text-sm text-zinc-700 font-medium rounded border border-neutral-500 bg-transparent focus:outline-none focus:border-blue-600 select-none"
              value={fontSize}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                if (!isNaN(val) && val > 0) handleFontSize(val);
              }}
            />
          </div>
          <button className="relative outline-none text-xs font-medium cursor-pointer text-black/70 w-6 h-6 mr-px my-1.5 rounded transition-colors hover:bg-zinc-700/[0.08] focus:bg-zinc-700/[0.12] select-none flex items-center justify-center" title="Increase font size (⌘+Shift+period)" onClick={handleFontSizeIncrease}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
          </button>
        </div>

        {/* Separator */}
        <div className="inline-block align-top w-0 h-5 border-l border-stone-300 mx-1 my-2.5" role="separator" />

        {/* Text Formatting */}
        <div className="inline-flex items-center">
          <button className={`relative outline-none text-xs font-medium cursor-pointer border border-transparent min-w-7 h-7 mx-px my-1.5 rounded transition-colors select-none flex items-center justify-center ${isBold ? 'bg-blue-100 text-blue-600' : 'text-black/70 hover:bg-zinc-700/[0.08] focus:bg-zinc-700/[0.12]'}`} title="Bold (⌘B)" onClick={handleBold}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/>
            </svg>
          </button>
          <button className={`relative outline-none text-xs font-medium cursor-pointer border border-transparent min-w-7 h-7 mx-px my-1.5 rounded transition-colors select-none flex items-center justify-center ${isItalic ? 'bg-blue-100 text-blue-600' : 'text-black/70 hover:bg-zinc-700/[0.08] focus:bg-zinc-700/[0.12]'}`} title="Italic (⌘I)" onClick={handleItalic}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z"/>
            </svg>
          </button>
          <button className={`relative outline-none text-xs font-medium cursor-pointer border border-transparent min-w-7 h-7 mx-px my-1.5 rounded transition-colors select-none flex items-center justify-center ${isUnderline ? 'bg-blue-100 text-blue-600' : 'text-black/70 hover:bg-zinc-700/[0.08] focus:bg-zinc-700/[0.12]'}`} title="Underline (⌘U)" onClick={handleUnderline}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z"/>
            </svg>
          </button>
          
          {/* Text Color */}
          <div className="relative" ref={textColorRef}>
            <button 
              className="relative outline-none text-xs font-medium cursor-pointer border border-transparent text-black/70 min-w-7 h-7 mx-px my-1.5 rounded transition-colors hover:bg-zinc-700/[0.08] focus:bg-zinc-700/[0.12] select-none flex items-center justify-center" 
              title="Text color"
              onClick={() => setTextColorOpen(!textColorOpen)}
            >
              <div className="relative flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11 2L5.5 16h2.25l1.12-3h6.25l1.12 3h2.25L13 2h-2zm-1.38 9L12 4.67 14.38 11H9.62z"/>
                </svg>
                <div className="absolute -bottom-0.5 left-0 right-0 h-1 rounded-sm" style={{ backgroundColor: currentTextColor }} />
              </div>
            </button>
            {textColorOpen && (
              <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-[0_2px_10px_rgba(0,0,0,0.15),0_4px_20px_rgba(0,0,0,0.1)] p-3 z-[1000] animate-[dropdown-in_0.15s_ease]">
                <div className="grid grid-cols-10 gap-1 w-[200px]">
                  {TEXT_COLORS.map(color => (
                    <button
                      key={color}
                      className="w-[18px] h-[18px] border border-gray-300 rounded-[3px] cursor-pointer transition-all hover:scale-[1.2] hover:shadow-md hover:z-[1]"
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
          <div className="relative" ref={highlightColorRef}>
            <button 
              className="relative outline-none text-xs font-medium cursor-pointer border border-transparent text-black/70 min-w-7 h-7 mx-px my-1.5 rounded transition-colors hover:bg-zinc-700/[0.08] focus:bg-zinc-700/[0.12] select-none flex items-center justify-center" 
              title="Highlight color"
              onClick={() => setHighlightColorOpen(!highlightColorOpen)}
            >
              <div className="relative flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 14l3 3v5h6v-5l3-3V9H6v5zm5-12h2v3h-2V2zm6.24 3.66l1.47 1.47-2.12 2.12-1.47-1.47 2.12-2.12zM4.29 5.66l2.12 2.12-1.47 1.47-2.12-2.12 1.47-1.47z"/>
                </svg>
                <div className="absolute -bottom-0.5 left-0 right-0 h-1 rounded-sm" style={{ backgroundColor: currentHighlightColor }} />
              </div>
            </button>
            {highlightColorOpen && (
              <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-[0_2px_10px_rgba(0,0,0,0.15),0_4px_20px_rgba(0,0,0,0.1)] p-3 z-[1000] animate-[dropdown-in_0.15s_ease]">
                <div className="grid grid-cols-8 gap-1 w-[176px]">
                  {HIGHLIGHT_COLORS.map(color => (
                    <button
                      key={color}
                      className="w-[18px] h-[18px] border border-gray-300 rounded-[3px] cursor-pointer transition-all hover:scale-[1.2] hover:shadow-md hover:z-[1]"
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

        {/* Separator */}
        <div className="inline-block align-top w-0 h-5 border-l border-stone-300 mx-1 my-2.5" role="separator" />

        {/* Insert tools */}
        <div className="inline-flex items-center">
          <button className="relative outline-none text-xs font-medium cursor-pointer border border-transparent text-black/70 min-w-7 h-7 mx-px my-1.5 rounded transition-colors hover:bg-zinc-700/[0.08] focus:bg-zinc-700/[0.12] select-none flex items-center justify-center" title="Insert link (⌘K)" onClick={handleInsertLink}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
            </svg>
          </button>
          <button className="relative outline-none text-xs font-medium cursor-pointer border border-transparent text-black/70 min-w-7 h-7 mx-px my-1.5 rounded transition-colors hover:bg-zinc-700/[0.08] focus:bg-zinc-700/[0.12] select-none flex items-center justify-center" title="Add comment (⌘+Option+M)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22 4c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4zm-2 13.17L18.83 16H4V4h16v13.17zM13 5h-2v4H7v2h4v4h2v-4h4V9h-4z"/>
            </svg>
          </button>
          <button className="relative outline-none text-xs font-medium cursor-pointer border border-transparent text-black/70 min-w-7 h-7 mx-px my-1.5 rounded transition-colors hover:bg-zinc-700/[0.08] focus:bg-zinc-700/[0.12] select-none flex items-center justify-center" title="Insert image">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
            </svg>
          </button>
        </div>

        {/* Separator */}
        <div className="inline-block align-top w-0 h-5 border-l border-stone-300 mx-1 my-2.5" role="separator" />

        {/* Alignment and Lists */}
        <div className="inline-flex items-center">
          {/* Alignment Menu */}
          <div className="relative" ref={alignMenuRef}>
            <button 
              className="relative outline-none text-xs font-medium cursor-pointer border border-transparent text-black/70 min-w-7 h-7 mx-px my-1.5 rounded transition-colors hover:bg-zinc-700/[0.08] focus:bg-zinc-700/[0.12] select-none flex items-center justify-center pr-1" 
              title="Align & indent"
              onClick={() => setAlignMenuOpen(!alignMenuOpen)}
            >
              {/* Show icon based on current alignment */}
              {currentAlign === 'left' && (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15 15H3v2h12v-2zm0-8H3v2h12V7zM3 13h18v-2H3v2zm0 8h18v-2H3v2zM3 3v2h18V3H3z"/>
                </svg>
              )}
              {currentAlign === 'center' && (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7 15v2h10v-2H7zm-4 6h18v-2H3v2zm0-8h18v-2H3v2zm4-6v2h10V7H7zM3 3v2h18V3H3z"/>
                </svg>
              )}
              {currentAlign === 'right' && (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 21h18v-2H3v2zm6-4h12v-2H9v2zm-6-4h18v-2H3v2zm6-4h12V7H9v2zM3 3v2h18V3H3z"/>
                </svg>
              )}
              {currentAlign === 'justify' && (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 21h18v-2H3v2zm0-4h18v-2H3v2zm0-4h18v-2H3v2zm0-4h18V7H3v2zm0-6v2h18V3H3z"/>
                </svg>
              )}
              <div className="w-0 h-0 border-t-4 border-x-4 border-solid border-x-transparent border-t-zinc-700 -ml-0.5" />
            </button>
            {alignMenuOpen && (
              <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-[0_2px_10px_rgba(0,0,0,0.15),0_4px_20px_rgba(0,0,0,0.1)] p-2 flex gap-1 z-[1000] animate-[dropdown-in_0.15s_ease]">
                <button className={`w-8 h-8 border-none rounded cursor-pointer flex items-center justify-center transition-colors ${currentAlign === 'left' ? 'bg-blue-100 text-blue-600' : 'bg-transparent text-black/70 hover:bg-gray-100'}`} onClick={() => handleAlign('justifyLeft')} title="Align left">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M15 15H3v2h12v-2zm0-8H3v2h12V7zM3 13h18v-2H3v2zm0 8h18v-2H3v2zM3 3v2h18V3H3z"/>
                  </svg>
                </button>
                <button className={`w-8 h-8 border-none rounded cursor-pointer flex items-center justify-center transition-colors ${currentAlign === 'center' ? 'bg-blue-100 text-blue-600' : 'bg-transparent text-black/70 hover:bg-gray-100'}`} onClick={() => handleAlign('justifyCenter')} title="Align center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7 15v2h10v-2H7zm-4 6h18v-2H3v2zm0-8h18v-2H3v2zm4-6v2h10V7H7zM3 3v2h18V3H3z"/>
                  </svg>
                </button>
                <button className={`w-8 h-8 border-none rounded cursor-pointer flex items-center justify-center transition-colors ${currentAlign === 'right' ? 'bg-blue-100 text-blue-600' : 'bg-transparent text-black/70 hover:bg-gray-100'}`} onClick={() => handleAlign('justifyRight')} title="Align right">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 21h18v-2H3v2zm6-4h12v-2H9v2zm-6-4h18v-2H3v2zm6-4h12V7H9v2zM3 3v2h18V3H3z"/>
                  </svg>
                </button>
                <button className={`w-8 h-8 border-none rounded cursor-pointer flex items-center justify-center transition-colors ${currentAlign === 'justify' ? 'bg-blue-100 text-blue-600' : 'bg-transparent text-black/70 hover:bg-gray-100'}`} onClick={() => handleAlign('justifyFull')} title="Justify">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 21h18v-2H3v2zm0-4h18v-2H3v2zm0-4h18v-2H3v2zm0-4h18V7H3v2zm0-6v2h18V3H3z"/>
                  </svg>
                </button>
              </div>
            )}
          </div>
          
          <button className="relative outline-none text-xs font-medium cursor-pointer border border-transparent text-black/70 min-w-7 h-7 mx-px my-1.5 rounded transition-colors hover:bg-zinc-700/[0.08] focus:bg-zinc-700/[0.12] select-none flex items-center justify-center" title="Bulleted list (⌘+Shift+8)" onClick={handleBulletList}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z"/>
            </svg>
          </button>
          <button className="relative outline-none text-xs font-medium cursor-pointer border border-transparent text-black/70 min-w-7 h-7 mx-px my-1.5 rounded transition-colors hover:bg-zinc-700/[0.08] focus:bg-zinc-700/[0.12] select-none flex items-center justify-center" title="Numbered list (⌘+Shift+7)" onClick={handleNumberedList}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z"/>
            </svg>
          </button>
          <button className="relative outline-none text-xs font-medium cursor-pointer border border-transparent text-black/70 min-w-7 h-7 mx-px my-1.5 rounded transition-colors hover:bg-zinc-700/[0.08] focus:bg-zinc-700/[0.12] select-none flex items-center justify-center" title="Decrease indent (⌘+left bracket)" onClick={handleOutdent}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11 17h10v-2H11v2zm-8-5l4 4V8l-4 4zm0 9h18v-2H3v2zM3 3v2h18V3H3zm8 6h10V7H11v2zm0 4h10v-2H11v2z"/>
            </svg>
          </button>
          <button className="relative outline-none text-xs font-medium cursor-pointer border border-transparent text-black/70 min-w-7 h-7 mx-px my-1.5 rounded transition-colors hover:bg-zinc-700/[0.08] focus:bg-zinc-700/[0.12] select-none flex items-center justify-center" title="Increase indent (⌘+right bracket)" onClick={handleIndent}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 21h18v-2H3v2zM3 8v8l4-4-4-4zm8 9h10v-2H11v2zM3 3v2h18V3H3zm8 6h10V7H11v2zm0 4h10v-2H11v2z"/>
            </svg>
          </button>
          <button className="relative outline-none text-xs font-medium cursor-pointer border border-transparent text-black/70 min-w-7 h-7 mx-px my-1.5 rounded transition-colors hover:bg-zinc-700/[0.08] focus:bg-zinc-700/[0.12] select-none flex items-center justify-center" title="Clear formatting (⌘backslash)" onClick={handleClearFormatting}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3.27 5L2 6.27l6.97 6.97L6.5 19h3l1.57-3.66L16.73 21 18 19.73 3.27 5zM6 5v.18L8.82 8h2.4l-.72 1.68 2.1 2.1L14.21 8H20V5H6z"/>
            </svg>
          </button>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right side toolbar - Mode and View */}
        <div className="flex items-center justify-end mr-3 select-none" role="toolbar" aria-label="Mode and view">
          {/* Editing mode button */}
          <button 
            className="relative outline-none text-xs font-medium cursor-pointer border border-transparent min-w-7 h-7 mx-px my-1.5 rounded-full px-2 transition-colors hover:bg-zinc-700/[0.08] focus:bg-zinc-700/[0.12] select-none text-zinc-700 group flex items-center justify-center"
            title="Editing mode"
          >
            <div className="flex items-center pr-1">
              <div className="whitespace-nowrap overflow-hidden transition-all text-zinc-700 font-medium text-sm font-['Google_Sans',_Roboto,_sans-serif] w-6 group-hover:w-auto flex items-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="ml-1 mr-2">
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                </svg>
                <span className="hidden group-hover:inline">Editing</span>
              </div>
              <div className="w-0 h-0 border-t-4 border-x-4 border-solid border-x-transparent border-t-zinc-700 ml-1" />
            </div>
          </button>

          {/* Separator */}
          <div className="inline-block align-top w-0 h-5 border-l border-stone-300 ml-2 mr-1 my-2.5" role="separator" />

          {/* Hide menus button */}
          <button className="relative outline-none text-xs font-medium cursor-pointer border border-transparent text-black/70 min-w-7 h-7 mx-px my-1.5 rounded transition-colors hover:bg-zinc-700/[0.08] focus:bg-zinc-700/[0.12] select-none flex items-center justify-center" title="Hide the menus (Ctrl+Shift+F)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Ruler */}
      <div className="bg-gray-100 h-5 overflow-hidden flex justify-center relative border-b border-gray-300">
        <div className="relative w-[816px] h-full">
          <div className="absolute inset-0 bg-gray-100">
            <div className="absolute left-24 right-24 top-0 bottom-0 bg-white" />
          </div>
          <div className="absolute inset-0">
            {/* Generate ruler divisions */}
            {(() => {
              const divisions = [];
              const totalInches = 8;
              const divisionsPerInch = 8;
              const pxPerDivision = 12;
              
              for (let inch = 0; inch < totalInches; inch++) {
                for (let div = 0; div < divisionsPerInch; div++) {
                  const position = (inch * 96) + (div * pxPerDivision);
                  
                  if (div === 0) {
                    divisions.push(
                      <div 
                        key={`${inch}-${div}`}
                        className="absolute bottom-0 h-full flex flex-col items-center z-[1]"
                        style={{ left: `${position}px` }}
                      >
                        <div className="text-[9px] font-normal text-gray-500 leading-none absolute top-0.5 -translate-x-1/2">{inch > 0 ? inch : ''}</div>
                        <div className="absolute bottom-0 w-px h-2.5 bg-gray-400" />
                      </div>
                    );
                  } else if (div === 4) {
                    divisions.push(
                      <div 
                        key={`${inch}-${div}`}
                        className="absolute bottom-0 w-px h-[7px] bg-gray-400"
                        style={{ left: `${position}px` }}
                      />
                    );
                  } else {
                    divisions.push(
                      <div 
                        key={`${inch}-${div}`}
                        className="absolute bottom-0 w-px h-1 bg-gray-300"
                        style={{ left: `${position}px` }}
                      />
                    );
                  }
                }
              }
              return divisions;
            })()}
          </div>
          {/* Indent controls */}
          <div className="absolute inset-0 z-[2]">
            <div className="absolute left-[91px] top-[1px] cursor-ew-resize z-[3]">
              <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-blue-600 transition-colors hover:border-t-blue-800" />
            </div>
            <div className="absolute left-[91px] bottom-[1px] cursor-ew-resize z-[2]">
              <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[5px] border-b-blue-600 transition-colors hover:border-b-blue-800" />
            </div>
            <div className="absolute right-[91px] bottom-[1px] cursor-ew-resize z-[2]">
              <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[5px] border-b-blue-600 transition-colors hover:border-b-blue-800" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area with Document and Chat Sidebar */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Document Area */}
        <div className="flex-1 overflow-y-auto flex justify-center py-5 bg-gray-50 relative">
          {/* Chat Toggle Arrow */}
          <button 
            className={`absolute right-3 top-5 w-9 h-9 border border-gray-300 bg-white rounded-full cursor-pointer flex items-center justify-center gap-0.5 text-gray-500 transition-all shadow-sm z-10 hover:bg-gray-100 hover:shadow-md ${chatOpen ? 'bg-blue-50 border-blue-600 text-blue-600' : ''}`}
            onClick={() => setChatOpen(!chatOpen)}
            title="Toggle AI sidebar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points={chatOpen ? "9 18 15 12 9 6" : "15 18 9 12 15 6"}/>
            </svg>
          </button>

          <div className="flex flex-col gap-2 pb-10">
            <div className="w-[816px] min-h-[1056px] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12),_0_1px_2px_rgba(0,0,0,0.24)] p-[72px_96px] relative flex-shrink-0 box-border" onKeyDown={handleKeyDown}>
              <TiptapEditor
                ref={editorRef}
                content={activeDocument?.content || ''}
                onUpdate={handleEditorUpdate}
                onSelectionUpdate={handleSelectionUpdate}
                onBlur={saveContent}
                onGhostSubmit={ghostModeEnabled ? handleGhostSubmit : undefined}
                placeholder="Start typing your document..."
                className="w-full min-h-[912px] outline-none font-['Arial',_sans-serif] text-[11pt] leading-[1.15] text-black"
              />
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[11px] text-gray-500 font-['Arial',_sans-serif]">1</div>
            </div>
          </div>
        </div>

        {/* Chat Sidebar */}
        <ChatSidebar
          documents={documents}
          activeDocument={activeDocument}
          isLoading={isLoading}
          isSearching={isSearching}
          selectedModel={selectedModel}
          onModelChange={onModelChange}
          chatMode={ghostModeEnabled ? 'edit' : chatMode}
          onModeChange={ghostModeEnabled ? () => {} : setChatMode}
          isOpen={chatOpen}
          onSendMessage={handleSendMessage}
          onSearch={onSearch}
          onStopGeneration={onStopGeneration}
          onCreateDocument={onCreateDocument}
          onSwitchDocument={onSwitchDocument}
          templates={templates}
          selectedTemplate={selectedTemplate}
          onSelectTemplate={onSelectTemplate}
          onSaveAsTemplate={(name) => onSaveAsTemplate(name, editorRef)}
          onDeleteTemplate={onDeleteTemplate}
          editorRef={editorRef}
        />
      </div>

      {/* Hidden file inputs (always accessible) */}
      <input 
        ref={ghostFileInputRef}
        type="file"
        accept={getAcceptedFileTypes()}
        className="hidden"
        onChange={handleGhostFileInputChange}
      />

      {/* Info Button - Bottom Left */}
      <div className="fixed bottom-4 left-4 z-50" ref={infoRef}>
        <button
          onClick={() => setInfoOpen(!infoOpen)}
          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-md ${
            infoOpen 
              ? 'bg-blue-600 text-white' 
              : 'bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-700 border border-gray-200'
          }`}
          title="About"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
        </button>
        
        {infoOpen && (
          <div className="absolute bottom-full left-0 mb-2 bg-white rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.15),_0_0_0_1px_rgba(0,0,0,0.05)] w-64 p-4 animate-[dropdown-in_0.15s_ease]">
            <h3 className="font-semibold text-gray-900 text-sm mb-2">DocFake</h3>
            
            <p className="text-xs text-gray-600 leading-relaxed mb-3">
              Looks like Google Docs, but with AI built in. Your teachers won't know the difference.
            </p>
            
            <div className="border-t border-gray-100 pt-3 pb-3">
              <p className="text-[11px] text-gray-500">
                Built by <span className="font-medium text-gray-700">Maiko</span>
              </p>
              <p className="text-[10px] text-gray-400">Software Engineer / Lord and Savior</p>
            </div>
            <a href="https://www.buymeacoffee.com/maikopruett"><img src="https://img.buymeacoffee.com/button-api/?text=Buy me a coffee&emoji=&slug=maikopruett&button_colour=FFDD00&font_colour=000000&font_family=Poppins&outline_colour=000000&coffee_colour=ffffff" /></a>
            <p className="text-[10px] pt-3 text-gray-400">Version 0.3</p>
          </div>
        )}
      </div>

      {/* Persona Settings Modal */}
      {personaModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setPersonaModalOpen(false)}
          />
          
          {/* Modal */}
          <div className="relative bg-white rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.2)] w-full max-w-lg mx-4 animate-[modal-in_0.2s_ease]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Persona Settings</h2>
              <button 
                className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                onClick={() => setPersonaModalOpen(false)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            
            {/* Content */}
            <div className="px-6 py-5">
              <p className="text-sm text-gray-600 mb-4">
                Upload a document that represents your writing style. The AI will analyze it and mimic how you write.
              </p>
              
              {/* Upload Zone */}
              <div 
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
                  isDraggingPersonaFile 
                    ? 'border-blue-500 bg-blue-50' 
                    : personaDocName 
                      ? 'border-green-300 bg-green-50' 
                      : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                }`}
                onDragOver={handlePersonaDragOver}
                onDragLeave={handlePersonaDragLeave}
                onDrop={handlePersonaDrop}
                onClick={() => personaFileInputRef.current?.click()}
              >
                {personaDocName ? (
                  <div className="flex flex-col items-center">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" className="mb-2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <polyline points="9 15 11 17 15 13"/>
                    </svg>
                    <p className="text-sm font-medium text-gray-900">{personaDocName}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {personaDocContent ? `${personaDocContent.split(/\s+/).length} words` : ''}
                    </p>
                    <button 
                      className="mt-2 text-xs text-blue-600 hover:text-blue-700"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPersonaDocName(null);
                        setPersonaDocContent(null);
                      }}
                    >
                      Remove and upload different file
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" className="mb-2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <line x1="12" y1="18" x2="12" y2="12"/>
                      <line x1="9" y1="15" x2="15" y2="15"/>
                    </svg>
                    <p className="text-sm font-medium text-gray-700">
                      Drop a document here or click to upload
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Supports .txt, .pdf, .docx, .html
                    </p>
                  </div>
                )}
              </div>
              <input 
                ref={personaFileInputRef}
                type="file"
                accept={getAcceptedFileTypes()}
                className="hidden"
                onChange={handlePersonaFileInputChange}
              />
              
              {personaUploadError && (
                <p className="mt-2 text-sm text-red-600">{personaUploadError}</p>
              )}
              
              {/* Current Persona Info */}
              {personaSettings?.documentContent && !personaDocName && (
                <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-start gap-3">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" className="flex-shrink-0 mt-0.5">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="16" x2="12" y2="12"/>
                      <line x1="12" y1="8" x2="12.01" y2="8"/>
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-blue-900">Active Persona</p>
                      <p className="text-xs text-blue-700 mt-0.5">
                        Currently using: {personaSettings.documentName || 'Uploaded document'}
                      </p>
                      <p className="text-xs text-blue-600 mt-0.5">
                        {personaSettings.documentContent.split(/\s+/).length} words
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
              <div>
                {(personaSettings?.documentContent || personaDocName) && (
                  <button 
                    className="text-sm text-red-600 hover:text-red-700 font-medium"
                    onClick={removePersona}
                  >
                    Remove persona
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button 
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
                  onClick={() => setPersonaModalOpen(false)}
                >
                  Cancel
                </button>
                <button 
                  className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
                    personaDocName && personaDocContent
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-gray-300 cursor-not-allowed'
                  }`}
                  onClick={savePersonaSettings}
                  disabled={!personaDocName || !personaDocContent}
                >
                  Save persona
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ghost Mode Template Selection Modal */}
      {ghostTemplateModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setGhostTemplateModalOpen(false)}
          />
          
          {/* Modal */}
          <div 
            ref={ghostTemplateModalRef}
            className="relative bg-white rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.2)] w-full max-w-[320px] mx-4 max-h-[80%] flex flex-col animate-[modal-in_0.2s_ease]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
              <h3 className="font-semibold text-gray-800">Select Template</h3>
              <button
                type="button"
                onClick={() => setGhostTemplateModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            
            {/* Content */}
            <div className="flex-1 overflow-y-auto p-2">
              {/* Clear template option */}
              {selectedTemplate && (
                <button
                  type="button"
                  onClick={() => {
                    onSelectTemplate(null);
                    setGhostTemplateModalOpen(false);
                  }}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left cursor-pointer transition-colors hover:bg-gray-100 text-red-600 text-sm mb-1"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                  Clear template
                </button>
              )}
              
              {/* Preset templates */}
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 py-2">
                Preset Formats
              </div>
              {templates.filter(t => t.type === 'preset').map(template => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => {
                    onSelectTemplate(template);
                    setGhostTemplateModalOpen(false);
                  }}
                  className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left cursor-pointer transition-colors text-sm ${
                    selectedTemplate?.id === template.id 
                      ? 'bg-amber-50 text-amber-700' 
                      : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-500 flex-shrink-0">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <path d="M3 9h18"/>
                    <path d="M9 21V9"/>
                  </svg>
                  <span className="flex-1 truncate">{template.name}</span>
                  {selectedTemplate?.id === template.id && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-600 flex-shrink-0">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </button>
              ))}
              
              {/* Custom templates */}
              {templates.filter(t => t.type === 'custom').length > 0 && (
                <>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 py-2 mt-2">
                    Your Templates
                  </div>
                  {templates.filter(t => t.type === 'custom').map(template => (
                    <div 
                      key={template.id}
                      className={`flex items-center gap-2 w-full px-3 py-2.5 rounded-lg transition-colors ${
                        selectedTemplate?.id === template.id 
                          ? 'bg-amber-50' 
                          : 'hover:bg-gray-100'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onSelectTemplate(template);
                          setGhostTemplateModalOpen(false);
                        }}
                        className={`flex items-center gap-3 flex-1 text-left cursor-pointer text-sm ${
                          selectedTemplate?.id === template.id 
                            ? 'text-amber-700' 
                            : 'text-gray-700'
                        }`}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-500 flex-shrink-0">
                          <rect x="3" y="3" width="18" height="18" rx="2"/>
                          <path d="M3 9h18"/>
                          <path d="M9 21V9"/>
                        </svg>
                        <span className="flex-1 truncate">{template.name}</span>
                        {selectedTemplate?.id === template.id && (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-600 flex-shrink-0">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteTemplate(template.id);
                        }}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                        title="Delete template"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </>
              )}
              
              {templates.filter(t => t.type === 'custom').length === 0 && (
                <div className="text-xs text-gray-400 px-3 py-4 text-center">
                  No custom templates yet.<br/>
                  Save your documents as templates to reuse them.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Global Chat Panel */}
      <GlobalChatPanel 
        isOpen={globalChatOpen} 
        onClose={() => setGlobalChatOpen(false)} 
      />

      {/* Help Modal */}
      {helpModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setHelpModalOpen(false)}
          />
          
          {/* Modal */}
          <div className="relative bg-white rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.2)] w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col animate-[modal-in_0.2s_ease]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">Help & Documentation</h2>
              <button 
                className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                onClick={() => setHelpModalOpen(false)}
                aria-label="Close help modal"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            
            {/* Content - Scrollable */}
            <div className="px-6 py-5 overflow-y-auto flex-1">
              {/* Introduction */}
              <div className="mb-6">
                <h3 className="text-base font-semibold text-gray-900 mb-3">Welcome to DocFake</h3>
                <p className="text-sm text-gray-700 leading-relaxed mb-2">
                  DocFake is an AI-powered document editor that looks like Google Docs but includes powerful AI writing assistance built right in. Write essays, reports, and documents faster with AI that can edit your document directly, research sources, and match your writing style.
                </p>
              </div>

              {/* Chat Modes */}
              <div className="mb-6">
                <h3 className="text-base font-semibold text-gray-900 mb-3">Chat Modes</h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900 mb-1">Edit Mode</p>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      The AI can directly edit your document. Ask it to write, rewrite, format, or modify content, and it will make changes automatically. Perfect for creating and editing content.
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 mb-1">Chat Mode</p>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      The AI can only discuss and provide feedback without editing your document. Use this when you want advice, suggestions, or explanations without any changes being made.
                    </p>
                  </div>
                  <p className="text-sm text-gray-600 italic">
                    Switch between modes using the toggle in the chat sidebar.
                  </p>
                </div>
              </div>

              {/* Ghost Mode */}
              <div className="mb-6">
                <h3 className="text-base font-semibold text-gray-900 mb-3">Ghost Mode</h3>
                <p className="text-sm text-gray-700 leading-relaxed mb-2">
                  Ghost Mode lets you use AI assistance discreetly. When enabled, you can type directly in your document and press <kbd className="px-2 py-1 bg-gray-100 rounded text-xs font-mono">Ctrl+Enter</kbd> to send your text to the AI secretly.
                </p>
                <ul className="text-sm text-gray-700 list-disc list-inside space-y-1 ml-2">
                  <li>Enable via Profile menu → Ghost Mode</li>
                  <li>Type in your document normally</li>
                  <li>Press <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">Ctrl+Enter</kbd> to send</li>
                  <li>Press <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">Ctrl+T</kbd> to quickly select a template</li>
                  <li>Press <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">Ctrl+U</kbd> to upload a requirements file</li>
                  <li>Look for the ghost icon indicator in the top bar when active</li>
                </ul>
              </div>

              {/* Persona Settings */}
              <div className="mb-6">
                <h3 className="text-base font-semibold text-gray-900 mb-3">Persona Settings</h3>
                <p className="text-sm text-gray-700 leading-relaxed mb-2">
                  Upload a document written in your style, and the AI will mimic your writing voice, vocabulary, and patterns. Perfect for maintaining consistency across assignments.
                </p>
                <ul className="text-sm text-gray-700 list-disc list-inside space-y-1 ml-2">
                  <li>Access via Profile menu → Persona settings</li>
                  <li>Upload a document (.txt, .pdf, .docx, .html)</li>
                  <li>The AI analyzes your writing style</li>
                  <li>All future AI responses will match your style</li>
                </ul>
              </div>

              {/* Templates */}
              <div className="mb-6">
                <h3 className="text-base font-semibold text-gray-900 mb-3">Templates</h3>
                <p className="text-sm text-gray-700 leading-relaxed mb-2">
                  Use preset templates (APA, MLA) or save your own custom templates for consistent formatting.
                </p>
                <ul className="text-sm text-gray-700 list-disc list-inside space-y-1 ml-2">
                  <li>Select templates from the chat sidebar</li>
                  <li>Preset templates: APA Format (7th Edition), MLA Format (9th Edition)</li>
                  <li>Save current document as template: Tools menu → Save as template</li>
                  <li>Templates preserve formatting, fonts, and structure</li>
                </ul>
              </div>

              {/* Document Management */}
              <div className="mb-6">
                <h3 className="text-base font-semibold text-gray-900 mb-3">Document Management</h3>
                <div className="space-y-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900 mb-1">Create Documents</p>
                    <p className="text-sm text-gray-700">
                      File → New document or <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">Ctrl+N</kbd>
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 mb-1">Import Documents</p>
                    <p className="text-sm text-gray-700">
                      File → Import document or <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">Ctrl+O</kbd>
                    </p>
                    <p className="text-xs text-gray-600 mt-1 ml-4">
                      Supports: HTML (full formatting), DOCX (basic formatting), TXT/PDF (text only)
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 mb-1">Switch Documents</p>
                    <p className="text-sm text-gray-700">
                      Click on document names in the chat sidebar to switch between open documents.
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 mb-1">Export Documents</p>
                    <p className="text-sm text-gray-700">
                      File → Download → Choose format: PDF, Word (.doc), RTF, HTML, Markdown (.md), or Plain Text (.txt)
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 mb-1">Delete Documents</p>
                    <p className="text-sm text-gray-700">
                      File → Delete document (requires at least 2 documents)
                    </p>
                  </div>
                </div>
              </div>

              {/* Formatting Tools */}
              <div className="mb-6">
                <h3 className="text-base font-semibold text-gray-900 mb-3">Formatting Tools</h3>
                <p className="text-sm text-gray-700 leading-relaxed mb-2">
                  Use the toolbar or keyboard shortcuts to format your document:
                </p>
                <ul className="text-sm text-gray-700 list-disc list-inside space-y-1 ml-2">
                  <li><strong>Text Styles:</strong> Bold, Italic, Underline</li>
                  <li><strong>Colors:</strong> Text color and highlight colors</li>
                  <li><strong>Fonts:</strong> Change font family and size</li>
                  <li><strong>Headings:</strong> H1-H6 heading styles</li>
                  <li><strong>Lists:</strong> Bulleted and numbered lists</li>
                  <li><strong>Alignment:</strong> Left, center, right, justify</li>
                  <li><strong>Indentation:</strong> Increase/decrease indent</li>
                  <li><strong>Links:</strong> Insert hyperlinks</li>
                  <li><strong>Clear Formatting:</strong> Remove all formatting from selection</li>
                </ul>
              </div>

              {/* Search & Research */}
              <div className="mb-6">
                <h3 className="text-base font-semibold text-gray-900 mb-3">Search & Research</h3>
                <p className="text-sm text-gray-700 leading-relaxed mb-2">
                  The AI can automatically search for sources when writing essays or research papers. It will find relevant sources, cite them properly, and include URLs in your citations.
                </p>
                <ul className="text-sm text-gray-700 list-disc list-inside space-y-1 ml-2">
                  <li>Enable Research mode toggle in the chat sidebar</li>
                  <li>The AI automatically searches when writing essays</li>
                  <li>Citations include proper formatting (MLA/APA)</li>
                  <li>Sources are verified and include URLs</li>
                </ul>
              </div>

              {/* Global Chat */}
              <div className="mb-6">
                <h3 className="text-base font-semibold text-gray-900 mb-3">Global Chat</h3>
                <p className="text-sm text-gray-700 leading-relaxed mb-2">
                  Connect with other users on the platform in real-time using Global Chat. Share ideas, ask questions, or collaborate with others.
                </p>
                <ul className="text-sm text-gray-700 list-disc list-inside space-y-1 ml-2">
                  <li>Click the chat bubble icon next to the video call button in the toolbar</li>
                  <li>First-time users will be asked to enter a username</li>
                  <li>Your username is saved locally for future sessions</li>
                  <li>Messages appear in real-time for all users</li>
                  <li>You can change your username anytime from the chat panel</li>
                </ul>
              </div>

              {/* Keyboard Shortcuts */}
              <div className="mb-6">
                <h3 className="text-base font-semibold text-gray-900 mb-3">Keyboard Shortcuts</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm text-gray-700">Bold</span>
                    <kbd className="px-2 py-1 bg-gray-100 rounded text-xs font-mono">Ctrl+B</kbd>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm text-gray-700">Italic</span>
                    <kbd className="px-2 py-1 bg-gray-100 rounded text-xs font-mono">Ctrl+I</kbd>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm text-gray-700">Underline</span>
                    <kbd className="px-2 py-1 bg-gray-100 rounded text-xs font-mono">Ctrl+U</kbd>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm text-gray-700">Insert Link</span>
                    <kbd className="px-2 py-1 bg-gray-100 rounded text-xs font-mono">Ctrl+K</kbd>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm text-gray-700">Undo</span>
                    <kbd className="px-2 py-1 bg-gray-100 rounded text-xs font-mono">Ctrl+Z</kbd>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm text-gray-700">Redo</span>
                    <kbd className="px-2 py-1 bg-gray-100 rounded text-xs font-mono">Ctrl+Shift+Z</kbd>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm text-gray-700">Ghost Mode Submit</span>
                    <kbd className="px-2 py-1 bg-gray-100 rounded text-xs font-mono">Ctrl+Enter</kbd>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm text-gray-700">New Document</span>
                    <kbd className="px-2 py-1 bg-gray-100 rounded text-xs font-mono">Ctrl+N</kbd>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm text-gray-700">Import Document</span>
                    <kbd className="px-2 py-1 bg-gray-100 rounded text-xs font-mono">Ctrl+O</kbd>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm text-gray-700">Select Template (Ghost Mode)</span>
                    <kbd className="px-2 py-1 bg-gray-100 rounded text-xs font-mono">Ctrl+T</kbd>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm text-gray-700">Upload File (Ghost Mode)</span>
                    <kbd className="px-2 py-1 bg-gray-100 rounded text-xs font-mono">Ctrl+U</kbd>
                  </div>
                  <p className="text-xs text-gray-500 italic mt-2">
                    Note: Ghost Mode shortcuts (Ctrl+T, Ctrl+U) only work when Ghost Mode is enabled.
                  </p>
                </div>
              </div>

              {/* Tips & Best Practices */}
              <div className="mb-6">
                <h3 className="text-base font-semibold text-gray-900 mb-3">Tips & Best Practices</h3>
                <ul className="text-sm text-gray-700 list-disc list-inside space-y-2 ml-2">
                  <li>
                    <strong>Use Edit Mode</strong> when you want the AI to write or modify content directly in your document.
                  </li>
                  <li>
                    <strong>Use Chat Mode</strong> when you want feedback, suggestions, or explanations without changes.
                  </li>
                  <li>
                    <strong>Be specific</strong> in your requests. Instead of "make it better," try "make the introduction more engaging" or "add more detail to the conclusion."
                  </li>
                  <li>
                    <strong>Use templates</strong> for consistent formatting. Select a template before writing to ensure proper structure.
                  </li>
                  <li>
                    <strong>Enable Research mode</strong> when writing essays that need citations. The AI will find and cite sources automatically.
                  </li>
                  <li>
                    <strong>Use Persona</strong> to maintain your writing style across multiple documents and assignments.
                  </li>
                  <li>
                    <strong>Ghost Mode</strong> is perfect for discreet AI assistance when you don't want others to see you're using AI.
                  </li>
                </ul>
              </div>
            </div>
            
            {/* Footer */}
            <div className="flex items-center justify-end px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex-shrink-0">
              <button 
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                onClick={() => setHelpModalOpen(false)}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
