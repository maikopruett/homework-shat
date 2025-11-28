import { useState, useEffect, useCallback, useRef } from 'react';
import { sendMessageStream } from '../api/openrouter';
import type { ChatMessage } from '../api/openrouter';

export interface DocChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isWriting?: boolean; // Indicates AI is writing to document
}

export interface Document {
  id: string;
  title: string;
  content: string; // HTML content of the editor
  chatMessages: DocChatMessage[];
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'homework-documents';

// Parser state for handling structured AI responses
type ParseState = 'idle' | 'in_tag' | 'in_chat' | 'in_write' | 'in_edit' | 'in_format';

interface FormatAction {
  type: string;
  target: string;
  value?: string;
}

interface ParseContext {
  state: ParseState;
  buffer: string;
  chatContent: string;
  writeContent: string;
  editFind: string;
  editContent: string;
  tagBuffer: string;
  formatAction: FormatAction | null;
}

function createParseContext(): ParseContext {
  return {
    state: 'idle',
    buffer: '',
    chatContent: '',
    writeContent: '',
    editFind: '',
    editContent: '',
    tagBuffer: '',
    formatAction: null,
  };
}

// Parse incoming tokens and route them appropriately
function parseToken(
  ctx: ParseContext,
  token: string,
  callbacks: {
    onChatToken: (token: string) => void;
    onWriteToken: (token: string) => void;
    onEditStart: (findText: string) => void;
    onEditToken: (token: string) => void;
    onFormat: (action: FormatAction) => void;
  }
): ParseContext {
  const newCtx = { ...ctx };
  
  for (const char of token) {
    switch (newCtx.state) {
      case 'idle':
        if (char === '<') {
          newCtx.state = 'in_tag';
          newCtx.tagBuffer = '';
        }
        // Ignore content outside of tags
        break;
        
      case 'in_tag':
        if (char === '>') {
          const tag = newCtx.tagBuffer.trim();
          const tagLower = tag.toLowerCase();
          
          if (tagLower === 'chat') {
            newCtx.state = 'in_chat';
          } else if (tagLower === 'write') {
            newCtx.state = 'in_write';
          } else if (tagLower.startsWith('edit')) {
            // Parse find attribute: edit find="..."
            const findMatch = newCtx.tagBuffer.match(/find=["']([^"']+)["']/i);
            if (findMatch) {
              newCtx.editFind = findMatch[1];
              callbacks.onEditStart(newCtx.editFind);
            }
            newCtx.state = 'in_edit';
          } else if (tagLower.startsWith('format')) {
            // Parse format tag: <format type="bold" target="all" value="#ff0000"/>
            const typeMatch = tag.match(/type=["']([^"']+)["']/i);
            const targetMatch = tag.match(/target=["']([^"']+)["']/i);
            const valueMatch = tag.match(/value=["']([^"']+)["']/i);
            
            if (typeMatch) {
              const formatAction: FormatAction = {
                type: typeMatch[1].toLowerCase(),
                target: targetMatch ? targetMatch[1] : 'all',
                value: valueMatch ? valueMatch[1] : undefined,
              };
              newCtx.formatAction = formatAction;
              
              // Self-closing tag detection
              if (tag.endsWith('/')) {
                callbacks.onFormat(formatAction);
                newCtx.state = 'idle';
              } else {
                newCtx.state = 'in_format';
              }
            } else {
              newCtx.state = 'idle';
            }
          } else if (tagLower === '/chat' || tagLower === '/write' || tagLower === '/edit' || tagLower === '/format') {
            if (tagLower === '/format' && newCtx.formatAction) {
              callbacks.onFormat(newCtx.formatAction);
              newCtx.formatAction = null;
            }
            newCtx.state = 'idle';
          }
          newCtx.tagBuffer = '';
        } else {
          newCtx.tagBuffer += char;
        }
        break;
        
      case 'in_chat':
        if (char === '<') {
          newCtx.state = 'in_tag';
          newCtx.tagBuffer = '';
        } else {
          newCtx.chatContent += char;
          callbacks.onChatToken(char);
        }
        break;
        
      case 'in_write':
        if (char === '<') {
          newCtx.state = 'in_tag';
          newCtx.tagBuffer = '';
        } else {
          newCtx.writeContent += char;
          callbacks.onWriteToken(char);
        }
        break;
        
      case 'in_edit':
        if (char === '<') {
          newCtx.state = 'in_tag';
          newCtx.tagBuffer = '';
        } else {
          newCtx.editContent += char;
          callbacks.onEditToken(char);
        }
        break;
        
      case 'in_format':
        // Format tags don't have content, just wait for closing tag
        if (char === '<') {
          newCtx.state = 'in_tag';
          newCtx.tagBuffer = '';
        }
        break;
    }
  }
  
  return newCtx;
}

function loadDocuments(): Document[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveDocuments(docs: Document[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
  } catch {
    // Storage full or unavailable
  }
}

function createNewDocument(title: string = 'Untitled document'): Document {
  return {
    id: crypto.randomUUID(),
    title,
    content: '',
    chatMessages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// Helper to find and replace text in editor
function findTextInEditor(editor: HTMLDivElement, searchText: string): { found: boolean; node?: Text; offset?: number } {
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null);
  let fullText = '';
  const nodes: { node: Text; start: number; end: number }[] = [];
  
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const start = fullText.length;
    fullText += node.textContent || '';
    nodes.push({ node, start, end: fullText.length });
  }
  
  const searchIndex = fullText.indexOf(searchText);
  if (searchIndex === -1) {
    return { found: false };
  }
  
  for (const { node, start, end } of nodes) {
    if (searchIndex >= start && searchIndex < end) {
      return { found: true, node, offset: searchIndex - start };
    }
  }
  
  return { found: false };
}

// Remove text from editor starting at a position
function removeTextFromEditor(editor: HTMLDivElement, searchText: string): boolean {
  const result = findTextInEditor(editor, searchText);
  if (!result.found || !result.node) return false;
  
  const fullContent = editor.innerHTML;
  const textContent = editor.textContent || '';
  const searchIndex = textContent.indexOf(searchText);
  
  if (searchIndex === -1) return false;
  
  const escapedSearch = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const newContent = fullContent.replace(new RegExp(escapedSearch.replace(/\s+/g, '\\s*')), '');
  editor.innerHTML = newContent;
  
  return true;
}

// Select text in editor for formatting
function selectTextInEditor(editor: HTMLDivElement, targetText: string): boolean {
  const selection = window.getSelection();
  if (!selection) return false;
  
  if (targetText === 'all') {
    // Select all content
    const range = document.createRange();
    range.selectNodeContents(editor);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }
  
  // Find and select specific text
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null);
  let fullText = '';
  const nodes: { node: Text; start: number; end: number }[] = [];
  
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const start = fullText.length;
    fullText += node.textContent || '';
    nodes.push({ node, start, end: fullText.length });
  }
  
  const searchIndex = fullText.indexOf(targetText);
  if (searchIndex === -1) return false;
  
  const searchEnd = searchIndex + targetText.length;
  
  // Find start node and offset
  let startNode: Text | null = null;
  let startOffset = 0;
  let endNode: Text | null = null;
  let endOffset = 0;
  
  for (const { node, start, end } of nodes) {
    if (!startNode && searchIndex >= start && searchIndex < end) {
      startNode = node;
      startOffset = searchIndex - start;
    }
    if (searchEnd > start && searchEnd <= end) {
      endNode = node;
      endOffset = searchEnd - start;
      break;
    }
  }
  
  if (!startNode || !endNode) return false;
  
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  selection.removeAllRanges();
  selection.addRange(range);
  
  return true;
}

// Apply formatting to editor
function applyFormatting(editor: HTMLDivElement, action: FormatAction): boolean {
  // First, select the target text
  const selected = selectTextInEditor(editor, action.target);
  if (!selected) {
    console.warn('Could not select text for formatting:', action.target);
    return false;
  }
  
  editor.focus();
  
  // Apply the formatting command
  switch (action.type) {
    case 'bold':
      document.execCommand('bold', false);
      break;
    case 'italic':
      document.execCommand('italic', false);
      break;
    case 'underline':
      document.execCommand('underline', false);
      break;
    case 'strikethrough':
      document.execCommand('strikeThrough', false);
      break;
    case 'textcolor':
    case 'text-color':
    case 'color':
      if (action.value) {
        document.execCommand('foreColor', false, action.value);
      }
      break;
    case 'highlight':
    case 'highlightcolor':
    case 'highlight-color':
    case 'backgroundcolor':
    case 'background-color':
      if (action.value) {
        document.execCommand('hiliteColor', false, action.value);
      }
      break;
    case 'fontsize':
    case 'font-size':
      if (action.value) {
        // execCommand fontSize only accepts 1-7, so we use a span wrapper
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          if (!range.collapsed) {
            const span = document.createElement('span');
            span.style.fontSize = action.value.includes('pt') || action.value.includes('px') 
              ? action.value 
              : `${action.value}pt`;
            range.surroundContents(span);
          }
        }
      }
      break;
    case 'fontfamily':
    case 'font-family':
    case 'font':
      if (action.value) {
        document.execCommand('fontName', false, action.value);
      }
      break;
    case 'align':
    case 'textalign':
    case 'text-align':
      if (action.value) {
        const alignValue = action.value.toLowerCase();
        if (alignValue === 'left') {
          document.execCommand('justifyLeft', false);
        } else if (alignValue === 'center') {
          document.execCommand('justifyCenter', false);
        } else if (alignValue === 'right') {
          document.execCommand('justifyRight', false);
        } else if (alignValue === 'justify') {
          document.execCommand('justifyFull', false);
        }
      }
      break;
    case 'removeformat':
    case 'remove-format':
    case 'clearformat':
    case 'clear-format':
      document.execCommand('removeFormat', false);
      break;
    case 'subscript':
      document.execCommand('subscript', false);
      break;
    case 'superscript':
      document.execCommand('superscript', false);
      break;
    default:
      console.warn('Unknown format type:', action.type);
      return false;
  }
  
  // Clear selection after formatting
  window.getSelection()?.removeAllRanges();
  
  return true;
}

const SYSTEM_PROMPT = `You are an AI writing assistant integrated into a document editor. You help users write, edit, format, and improve their documents.

CRITICAL: You MUST respond using this exact structured format with XML-like tags:

## Available Actions:

### 1. Writing NEW content:
<chat>Brief acknowledgment</chat><write>Content to add to document</write>

### 2. EDITING/Replacing existing content:
<chat>Brief acknowledgment</chat><edit find="exact text to find">Replacement text</edit>

### 3. FORMATTING text (bold, italic, colors, etc.):
<chat>Brief acknowledgment</chat><format type="TYPE" target="TARGET" value="VALUE"/>

Format types available:
- bold, italic, underline, strikethrough
- textColor (with value like "#ff0000" or "red")
- highlight (with value for background color)
- fontSize (with value like "14pt" or "18")
- fontFamily (with value like "Arial" or "Times New Roman")
- align (with value: "left", "center", "right", "justify")
- removeFormat (clears all formatting)

Target options:
- "all" - applies to entire document
- Exact text string - applies to that specific text

## Writing Style Guidelines:
When writing essays, articles, or longer content, ALWAYS structure it properly:

1. **Title**: Start with a clear, centered title (use a blank line after)
2. **Introduction**: Opening paragraph that introduces the topic and thesis
3. **Body Paragraphs**: Each paragraph should:
   - Start with a topic sentence
   - Include supporting details and evidence
   - Be separated by blank lines
4. **Conclusion**: Final paragraph summarizing key points

Use this HTML structure for essays:
- Titles: wrapped in a heading style (larger, bold)
- Paragraphs: separated by double line breaks
- Sections: clearly delineated with spacing

## Rules:
1. <chat> section: brief, friendly acknowledgment (1-2 sentences)
2. You can use multiple actions in one response
3. For formatting, use self-closing tags with />
4. The target for format should be the EXACT text from the document, or "all" for everything
5. For colors, use hex codes like "#ff0000" or color names like "red", "blue"
6. If user asks a question not requiring document changes, just use <chat>
7. For essays/articles, ALWAYS include proper structure with title, intro, body, conclusion

## Examples:

User: "Write an essay about dogs"
<chat>I'll write a structured essay about dogs for you.</chat><write>The Remarkable Bond Between Humans and Dogs

Introduction

Dogs have been humanity's faithful companions for over 15,000 years, earning their title as "man's best friend." This enduring relationship has shaped both species in profound ways, creating a bond unlike any other in the animal kingdom. From ancient wolves that first approached human campfires to the diverse breeds we know today, dogs have become an integral part of human society and culture.

The History of Domestication

The domestication of dogs represents one of the earliest and most successful partnerships between humans and animals. Archaeological evidence suggests that wolves began associating with human settlements, attracted by food scraps and the safety of human camps. Over generations, the most docile and friendly wolves were welcomed into human communities, gradually evolving into the domestic dogs we know today.

The Role of Dogs in Modern Society

Today, dogs serve countless roles in human life. As beloved family pets, they provide companionship, unconditional love, and emotional support. Working dogs assist in search and rescue operations, guide the visually impaired, and support individuals with various disabilities. Law enforcement and military units rely on dogs for detection work, tracking, and protection.

The Science of the Human-Dog Bond

Research has revealed the biological basis for our connection with dogs. When humans and dogs interact, both experience increases in oxytocin, the "bonding hormone." Dogs have evolved to read human facial expressions and respond to our emotional states, making them uniquely attuned to our needs.

Conclusion

The relationship between humans and dogs stands as a testament to the power of interspecies connection. As we continue to learn more about our canine companions, one thing remains clear: dogs have earned their place not just in our homes, but in our hearts. This ancient partnership continues to enrich human life in countless ways, promising to endure for generations to come.</write>

User: "Make the text bold"
<chat>I'll make the text bold for you.</chat><format type="bold" target="all"/>

User: "Change the color to blue"
<chat>I'll change the text color to blue.</chat><format type="textColor" target="all" value="#0000ff"/>

User: "Make 'dogs' red and bold"
<chat>I'll format 'dogs' to be red and bold.</chat><format type="bold" target="dogs"/><format type="textColor" target="dogs" value="#ff0000"/>

User: "Change 'thousands of years' to 'millennia'"
<chat>I'll make that change.</chat><edit find="thousands of years">millennia</edit>`;

export function useDocuments() {
  const [documents, setDocuments] = useState<Document[]>(() => {
    const docs = loadDocuments();
    if (docs.length === 0) {
      const initial = createNewDocument();
      return [initial];
    }
    return docs;
  });
  
  const [activeDocId, setActiveDocId] = useState<string>(() => {
    const docs = loadDocuments();
    if (docs.length > 0) {
      return docs[0].id;
    }
    return documents[0]?.id || '';
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [isWritingToDoc, setIsWritingToDoc] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parseContextRef = useRef<ParseContext>(createParseContext());
  const editorRefStore = useRef<HTMLDivElement | null>(null);
  const streamingChatRef = useRef<string>('');

  const activeDocument = documents.find(d => d.id === activeDocId) || documents[0];

  useEffect(() => {
    saveDocuments(documents);
  }, [documents]);

  const createDocument = useCallback((title?: string) => {
    const newDoc = createNewDocument(title);
    setDocuments(prev => [newDoc, ...prev]);
    setActiveDocId(newDoc.id);
    return newDoc;
  }, []);

  const switchDocument = useCallback((docId: string) => {
    setActiveDocId(docId);
    setError(null);
  }, []);

  const updateTitle = useCallback((docId: string, title: string) => {
    setDocuments(prev => prev.map(doc => 
      doc.id === docId 
        ? { ...doc, title, updatedAt: Date.now() }
        : doc
    ));
  }, []);

  const updateContent = useCallback((docId: string, content: string) => {
    setDocuments(prev => prev.map(doc => 
      doc.id === docId 
        ? { ...doc, content, updatedAt: Date.now() }
        : doc
    ));
  }, []);

  const deleteDocument = useCallback((docId: string) => {
    setDocuments(prev => {
      const filtered = prev.filter(d => d.id !== docId);
      if (docId === activeDocId && filtered.length > 0) {
        setActiveDocId(filtered[0].id);
      }
      if (filtered.length === 0) {
        const newDoc = createNewDocument();
        setActiveDocId(newDoc.id);
        return [newDoc];
      }
      return filtered;
    });
  }, [activeDocId]);

  // Send a chat message with direct document editing capability
  const sendMessage = useCallback(async (content: string, editorRef: React.RefObject<HTMLDivElement | null>) => {
    if (!content.trim() || isLoading || !activeDocument) return;

    // Store editor ref for use in callbacks
    editorRefStore.current = editorRef.current;

    const userMessage: DocChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: content.trim(),
      timestamp: Date.now(),
    };

    const assistantId = crypto.randomUUID();
    parseContextRef.current = createParseContext();
    streamingChatRef.current = '';

    // Add user message
    setDocuments(prev => prev.map(doc => 
      doc.id === activeDocId 
        ? { ...doc, chatMessages: [...doc.chatMessages, userMessage], updatedAt: Date.now() }
        : doc
    ));

    setIsLoading(true);
    setError(null);

    // Build chat history for API
    const chatHistory: ChatMessage[] = activeDocument.chatMessages.map(m => ({
      role: m.role,
      content: m.content,
    }));
    chatHistory.push({ role: 'user', content: content.trim() });

    // Include current document content in context
    const documentContext = editorRef.current?.textContent || activeDocument.content;
    const systemMessage: ChatMessage = {
      role: 'system' as const,
      content: `${SYSTEM_PROMPT}\n\nDocument Title: "${activeDocument.title}"\n\nCurrent Document Content:\n${documentContext || '(empty document)'}`,
    };

    // Create placeholder for streaming message
    const assistantMessage: DocChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isWriting: false,
    };

    setDocuments(prev => prev.map(doc => 
      doc.id === activeDocId 
        ? { ...doc, chatMessages: [...doc.chatMessages, assistantMessage], updatedAt: Date.now() }
        : doc
    ));

    let editTargetRemoved = false;

    await sendMessageStream([systemMessage, ...chatHistory], {
      onToken: (token) => {
        parseContextRef.current = parseToken(parseContextRef.current, token, {
          onChatToken: (char) => {
            streamingChatRef.current += char;
            setDocuments(prev => prev.map(doc => 
              doc.id === activeDocId 
                ? { 
                    ...doc, 
                    chatMessages: doc.chatMessages.map(m => 
                      m.id === assistantId 
                        ? { ...m, content: streamingChatRef.current }
                        : m
                    ),
                    updatedAt: Date.now() 
                  }
                : doc
            ));
          },
          onWriteToken: (char) => {
            if (!isWritingToDoc) {
              setIsWritingToDoc(true);
              setDocuments(prev => prev.map(doc => 
                doc.id === activeDocId 
                  ? { 
                      ...doc, 
                      chatMessages: doc.chatMessages.map(m => 
                        m.id === assistantId 
                          ? { ...m, isWriting: true }
                          : m
                      ),
                      updatedAt: Date.now() 
                    }
                  : doc
              ));
            }
            
            if (editorRefStore.current) {
              const currentHTML = editorRefStore.current.innerHTML;
              if (char === '\n') {
                // Check if previous content ends with a line break (indicates paragraph break)
                if (currentHTML.endsWith('<br>') || currentHTML.endsWith('<br/>')) {
                  // Double line break = new paragraph with spacing
                  editorRefStore.current.innerHTML = currentHTML + '<br><br>';
                } else {
                  editorRefStore.current.innerHTML = currentHTML + '<br>';
                }
              } else {
                editorRefStore.current.innerHTML = currentHTML + char;
              }
            }
          },
          onEditStart: (findText) => {
            setIsWritingToDoc(true);
            setDocuments(prev => prev.map(doc => 
              doc.id === activeDocId 
                ? { 
                    ...doc, 
                    chatMessages: doc.chatMessages.map(m => 
                      m.id === assistantId 
                        ? { ...m, isWriting: true }
                        : m
                    ),
                    updatedAt: Date.now() 
                  }
                : doc
            ));
            
            if (editorRefStore.current && !editTargetRemoved) {
              removeTextFromEditor(editorRefStore.current, findText);
              editTargetRemoved = true;
            }
          },
          onEditToken: (char) => {
            if (editorRefStore.current) {
              const currentHTML = editorRefStore.current.innerHTML;
              if (char === '\n') {
                editorRefStore.current.innerHTML = currentHTML + '<br>';
              } else {
                editorRefStore.current.innerHTML = currentHTML + char;
              }
            }
          },
          onFormat: (action) => {
            setIsWritingToDoc(true);
            setDocuments(prev => prev.map(doc => 
              doc.id === activeDocId 
                ? { 
                    ...doc, 
                    chatMessages: doc.chatMessages.map(m => 
                      m.id === assistantId 
                        ? { ...m, isWriting: true }
                        : m
                    ),
                    updatedAt: Date.now() 
                  }
                : doc
            ));
            
            if (editorRefStore.current) {
              applyFormatting(editorRefStore.current, action);
            }
          },
        });
      },
      onComplete: () => {
        // Save final document content
        if (editorRefStore.current) {
          const finalContent = editorRefStore.current.innerHTML;
          setDocuments(prev => prev.map(doc => 
            doc.id === activeDocId 
              ? { ...doc, content: finalContent, updatedAt: Date.now() }
              : doc
          ));
        }
        
        // Mark writing complete
        setDocuments(prev => prev.map(doc => 
          doc.id === activeDocId 
            ? { 
                ...doc, 
                chatMessages: doc.chatMessages.map(m => 
                  m.id === assistantId 
                    ? { ...m, content: streamingChatRef.current, isWriting: false }
                    : m
                ),
                updatedAt: Date.now() 
              }
            : doc
        ));
        
        setIsLoading(false);
        setIsWritingToDoc(false);
      },
      onError: (err) => {
        setError(err.message);
        setDocuments(prev => prev.map(doc => 
          doc.id === activeDocId 
            ? { 
                ...doc, 
                chatMessages: doc.chatMessages.filter(m => m.id !== assistantId),
                updatedAt: Date.now() 
              }
            : doc
        ));
        setIsLoading(false);
        setIsWritingToDoc(false);
      },
    });
  }, [activeDocument, activeDocId, isLoading, isWritingToDoc]);

  const clearChat = useCallback(() => {
    setDocuments(prev => prev.map(doc => 
      doc.id === activeDocId 
        ? { ...doc, chatMessages: [], updatedAt: Date.now() }
        : doc
    ));
    setError(null);
  }, [activeDocId]);

  return {
    documents,
    activeDocument,
    activeDocId,
    isLoading,
    isWritingToDoc,
    error,
    createDocument,
    switchDocument,
    updateTitle,
    updateContent,
    deleteDocument,
    sendMessage,
    clearChat,
  };
}
