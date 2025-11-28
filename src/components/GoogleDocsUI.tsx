import { useRef, useEffect, useState, useCallback } from 'react';
import type { Document, ChatMode } from '../hooks/useDocuments';
import ChatSidebar from './ChatSidebar';
import TiptapEditor, { type TiptapEditorHandle } from './TiptapEditor';

interface GoogleDocsUIProps {
  documents: Document[];
  activeDocument: Document | undefined;
  isLoading: boolean;
  isWritingToDoc: boolean;
  selectedModel: string;
  onModelChange: (model: string) => void;
  onSendMessage: (text: string, editorRef: React.RefObject<TiptapEditorHandle | null>, mode: ChatMode) => void;
  onStopGeneration: () => void;
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
  selectedModel,
  onModelChange,
  onSendMessage,
  onStopGeneration,
  onCreateDocument,
  onSwitchDocument,
  onUpdateTitle,
  onUpdateContent,
  onDeleteDocument,
}: GoogleDocsUIProps) {
  const editorRef = useRef<TiptapEditorHandle>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMode, setChatMode] = useState<ChatMode>('edit');
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const downloadMenuRef = useRef<HTMLDivElement>(null);
  const infoRef = useRef<HTMLDivElement>(null);
  
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
      if (infoRef.current && !infoRef.current.contains(e.target as Node)) {
        setInfoOpen(false);
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
  const handleSendMessage = useCallback((text: string, mode: ChatMode) => {
    onSendMessage(text, editorRef, mode);
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

  const headingFontSizes: Record<string, string> = {
    'paragraph': 'text-sm',
    'h1': 'text-2xl font-semibold',
    'h2': 'text-xl font-semibold',
    'h3': 'text-lg font-semibold',
    'h4': 'text-base font-semibold',
    'h5': 'text-sm font-semibold',
    'h6': 'text-xs font-semibold',
  };

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
                
                {/* Comments Button */}
                <div className="inline-block relative">
                  <div 
                    className="relative z-[1] text-center whitespace-nowrap outline-none text-xs leading-7 font-medium text-[#444746] justify-center items-center inline-flex align-middle w-10 h-10 cursor-pointer rounded-full border border-transparent transition-colors hover:bg-black/[0.06] focus:bg-zinc-200 select-none mr-1.5" 
                    role="button" 
                    aria-pressed="false" 
                    aria-label="Open comment history" 
                    tabIndex={0}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="#444746">
                      <path d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18zM18 14H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
                    </svg>
                  </div>
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
                
                {/* User Avatar */}
                <div className="text-left">
                  <div className="align-middle whitespace-nowrap select-none items-center flex-none justify-end">
                    <div className="align-middle inline-block p-1">
                      <div className="relative">
                        <a 
                          className="align-middle outline-none w-10 h-10 inline-block rounded-full cursor-pointer p-1 transition-colors hover:bg-zinc-700/[0.08] focus:bg-zinc-700/[0.1] active:bg-zinc-700/[0.12]" 
                          role="button" 
                          aria-label="Google Account" 
                          tabIndex={0}
                        >
                          <div className="w-8 h-8 relative">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="#5f6368">
                              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                            </svg>
                          </div>
                        </a>
                      </div>
                    </div>
                  </div>
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
                  <button 
                    className="flex items-center gap-3 w-full px-4 py-2 border-none bg-transparent text-gray-800 text-sm text-left cursor-pointer transition-colors hover:bg-gray-100"
                    onClick={() => {
                      setChatOpen(true);
                      setFileMenuOpen(false);
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                    Open document
                    <span className="ml-auto text-xs text-gray-400">⌘O</span>
                  </button>
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
            <div role="menuitem" className="shadow-none text-gray-800 cursor-pointer tracking-[0.2px] border border-transparent rounded px-[7px] py-0.5 text-sm inline-block mt-2 -mb-1 select-none transition-colors align-text-bottom overflow-hidden hover:bg-gray-100" aria-expanded="false" aria-haspopup="true">Help</div>
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
          <button className="relative outline-none text-xs font-medium cursor-pointer border border-transparent text-black/70 min-w-7 h-7 mx-px my-1.5 rounded transition-colors hover:bg-zinc-700/[0.08] focus:bg-zinc-700/[0.12] select-none flex items-center justify-center" title="Bold (⌘B)" onClick={handleBold}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/>
            </svg>
          </button>
          <button className="relative outline-none text-xs font-medium cursor-pointer border border-transparent text-black/70 min-w-7 h-7 mx-px my-1.5 rounded transition-colors hover:bg-zinc-700/[0.08] focus:bg-zinc-700/[0.12] select-none flex items-center justify-center" title="Italic (⌘I)" onClick={handleItalic}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z"/>
            </svg>
          </button>
          <button className="relative outline-none text-xs font-medium cursor-pointer border border-transparent text-black/70 min-w-7 h-7 mx-px my-1.5 rounded transition-colors hover:bg-zinc-700/[0.08] focus:bg-zinc-700/[0.12] select-none flex items-center justify-center" title="Underline (⌘U)" onClick={handleUnderline}>
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
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15 15H3v2h12v-2zm0-8H3v2h12V7zM3 13h18v-2H3v2zm0 8h18v-2H3v2zM3 3v2h18V3H3z"/>
              </svg>
              <div className="w-0 h-0 border-t-4 border-x-4 border-solid border-x-transparent border-t-zinc-700 -ml-0.5" />
            </button>
            {alignMenuOpen && (
              <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-[0_2px_10px_rgba(0,0,0,0.15),0_4px_20px_rgba(0,0,0,0.1)] p-2 flex gap-1 z-[1000] animate-[dropdown-in_0.15s_ease]">
                <button className="w-8 h-8 border-none bg-transparent rounded cursor-pointer flex items-center justify-center text-black/70 transition-colors hover:bg-gray-100" onClick={() => handleAlign('justifyLeft')} title="Align left">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M15 15H3v2h12v-2zm0-8H3v2h12V7zM3 13h18v-2H3v2zm0 8h18v-2H3v2zM3 3v2h18V3H3z"/>
                  </svg>
                </button>
                <button className="w-8 h-8 border-none bg-transparent rounded cursor-pointer flex items-center justify-center text-black/70 transition-colors hover:bg-gray-100" onClick={() => handleAlign('justifyCenter')} title="Align center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7 15v2h10v-2H7zm-4 6h18v-2H3v2zm0-8h18v-2H3v2zm4-6v2h10V7H7zM3 3v2h18V3H3z"/>
                  </svg>
                </button>
                <button className="w-8 h-8 border-none bg-transparent rounded cursor-pointer flex items-center justify-center text-black/70 transition-colors hover:bg-gray-100" onClick={() => handleAlign('justifyRight')} title="Align right">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 21h18v-2H3v2zm6-4h12v-2H9v2zm-6-4h18v-2H3v2zm6-4h12V7H9v2zM3 3v2h18V3H3z"/>
                  </svg>
                </button>
                <button className="w-8 h-8 border-none bg-transparent rounded cursor-pointer flex items-center justify-center text-black/70 transition-colors hover:bg-gray-100" onClick={() => handleAlign('justifyFull')} title="Justify">
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
        <div className={`flex-1 overflow-y-auto flex justify-center py-5 bg-gray-50 relative ${isWritingToDoc ? 'ai-writing' : ''}`}>
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
            <div className={`w-[816px] min-h-[1056px] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12),_0_1px_2px_rgba(0,0,0,0.24)] p-[72px_96px] relative flex-shrink-0 box-border ${isWritingToDoc ? 'shadow-[0_0_0_2px_#4caf50,_0_4px_12px_rgba(76,175,80,0.2)]' : ''}`} onKeyDown={handleKeyDown}>
              <TiptapEditor
                ref={editorRef}
                content={activeDocument?.content || ''}
                onUpdate={handleEditorUpdate}
                onBlur={saveContent}
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
          isWritingToDoc={isWritingToDoc}
          selectedModel={selectedModel}
          onModelChange={onModelChange}
          chatMode={chatMode}
          onModeChange={setChatMode}
          isOpen={chatOpen}
          onSendMessage={handleSendMessage}
          onStopGeneration={onStopGeneration}
          onCreateDocument={onCreateDocument}
          onSwitchDocument={onSwitchDocument}
        />
      </div>

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
              Looks like Google Docs, but with AI built in. Your teachers won't know the difference. Thank me later.
            </p>
            
            <div className="border-t border-gray-100 pt-3">
              <p className="text-[11px] text-gray-500">
                Built by <span className="font-medium text-gray-700">Maiko</span>
              </p>
              <p className="text-[10px] text-gray-400">Software Engineer / Lord and Savior</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
