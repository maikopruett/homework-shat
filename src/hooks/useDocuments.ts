import { useState, useEffect, useCallback, useRef } from 'react';
import { sendMessageStream } from '../api/openrouter';
import type { ChatMessage } from '../api/openrouter';
import type { TiptapEditorHandle } from '../components/TiptapEditor';

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
const MODEL_STORAGE_KEY = 'homework-selected-model';
const DEFAULT_MODEL = 'tngtech/tng-r1t-chimera:free';

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
    onWriteStart: () => void;
    onWriteComplete: (content: string) => void;
    onEditStart: (findText: string) => void;
    onEditComplete: (content: string) => void;
    onFormat: (action: FormatAction) => void;
    onClear: () => void;
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
            newCtx.writeContent = '';
            callbacks.onWriteStart();
          } else if (tagLower.startsWith('edit')) {
            // Parse find attribute: edit find="..."
            const findMatch = newCtx.tagBuffer.match(/find=["']([^"']+)["']/i);
            if (findMatch) {
              newCtx.editFind = findMatch[1];
              callbacks.onEditStart(newCtx.editFind);
            }
            newCtx.editContent = '';
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
          } else if (tagLower === 'clear' || tagLower === 'clear/') {
            // Self-closing clear tag - clear the document
            callbacks.onClear();
            newCtx.state = 'idle';
          } else if (tagLower === '/chat') {
            newCtx.state = 'idle';
          } else if (tagLower === '/write') {
            callbacks.onWriteComplete(newCtx.writeContent);
            newCtx.writeContent = '';
            newCtx.state = 'idle';
          } else if (tagLower === '/edit') {
            callbacks.onEditComplete(newCtx.editContent);
            newCtx.editContent = '';
            newCtx.state = 'idle';
          } else if (tagLower === '/format') {
            if (newCtx.formatAction) {
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
        }
        break;
        
      case 'in_edit':
        if (char === '<') {
          newCtx.state = 'in_tag';
          newCtx.tagBuffer = '';
        } else {
          newCtx.editContent += char;
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

// Convert plain text with line breaks to HTML
function textToHtml(text: string): string {
  // Split by double newlines for paragraphs
  const paragraphs = text.split(/\n\n+/);
  
  return paragraphs.map(p => {
    // Handle bullet points
    if (p.trim().startsWith('•') || p.trim().startsWith('-') || p.trim().startsWith('*')) {
      const items = p.split(/\n/).filter(line => line.trim());
      const listItems = items.map(item => {
        const cleanItem = item.replace(/^[\s]*[•\-\*]\s*/, '');
        return `<li><p>${cleanItem}</p></li>`;
      }).join('');
      return `<ul>${listItems}</ul>`;
    }
    
    // Handle numbered lists
    if (/^\s*\d+[\.\)]\s/.test(p.trim())) {
      const items = p.split(/\n/).filter(line => line.trim());
      const listItems = items.map(item => {
        const cleanItem = item.replace(/^\s*\d+[\.\)]\s*/, '');
        return `<li><p>${cleanItem}</p></li>`;
      }).join('');
      return `<ol>${listItems}</ol>`;
    }
    
    // Regular paragraph - convert single newlines to <br>
    const withBreaks = p.replace(/\n/g, '<br>');
    return `<p>${withBreaks}</p>`;
  }).join('');
}

// Apply formatting using Tiptap editor API
function applyFormatting(editor: TiptapEditorHandle, action: FormatAction): boolean {
  const editorInstance = editor.getEditor();
  if (!editorInstance) {
    console.warn('Editor instance not available');
    return false;
  }

  // If target is specific text, we need to select it first
  if (action.target !== 'all') {
    const doc = editorInstance.state.doc;
    let found = false;
    let from = 0;
    let to = 0;

    doc.descendants((node, pos) => {
      if (found) return false;
      if (node.isText && node.text) {
        const index = node.text.indexOf(action.target);
        if (index !== -1) {
          from = pos + index;
          to = from + action.target.length;
          found = true;
          return false;
        }
      }
    });

    if (found) {
      editorInstance.chain().focus().setTextSelection({ from, to }).run();
    } else {
      console.warn('Could not find text to format:', action.target);
      return false;
    }
  } else {
    // Select all content
    editorInstance.chain().focus().selectAll().run();
  }

  // Apply the formatting command
  switch (action.type) {
    case 'bold':
      editor.toggleBold();
      break;
    case 'italic':
      editor.toggleItalic();
      break;
    case 'underline':
      editor.toggleUnderline();
      break;
    case 'strikethrough':
    case 'strike':
      editor.toggleStrike();
      break;
    case 'textcolor':
    case 'text-color':
    case 'color':
      if (action.value) {
        editor.setTextColor(action.value);
      }
      break;
    case 'highlight':
    case 'highlightcolor':
    case 'highlight-color':
    case 'backgroundcolor':
    case 'background-color':
      if (action.value) {
        editor.setHighlight(action.value);
      }
      break;
    case 'fontsize':
    case 'font-size':
      if (action.value) {
        editor.setFontSize(action.value);
      }
      break;
    case 'fontfamily':
    case 'font-family':
    case 'font':
      if (action.value) {
        editor.setFontFamily(action.value);
      }
      break;
    case 'heading':
    case 'heading1':
    case 'h1':
      editor.setHeading(1);
      break;
    case 'heading2':
    case 'h2':
      editor.setHeading(2);
      break;
    case 'heading3':
    case 'h3':
      editor.setHeading(3);
      break;
    case 'heading4':
    case 'h4':
      editor.setHeading(4);
      break;
    case 'heading5':
    case 'h5':
      editor.setHeading(5);
      break;
    case 'heading6':
    case 'h6':
      editor.setHeading(6);
      break;
    case 'paragraph':
    case 'normal':
      editor.setParagraph();
      break;
    case 'bulletlist':
    case 'bullet-list':
    case 'bullets':
      editor.toggleBulletList();
      break;
    case 'orderedlist':
    case 'ordered-list':
    case 'numbered':
    case 'numberlist':
    case 'number-list':
      editor.toggleOrderedList();
      break;
    case 'blockquote':
    case 'quote':
      editor.toggleBlockquote();
      break;
    case 'codeblock':
    case 'code-block':
    case 'code':
      editor.toggleCodeBlock();
      break;
    case 'horizontalrule':
    case 'horizontal-rule':
    case 'hr':
    case 'divider':
      editor.insertHorizontalRule();
      break;
    case 'align':
    case 'textalign':
    case 'text-align':
      if (action.value) {
        const alignValue = action.value.toLowerCase() as 'left' | 'center' | 'right' | 'justify';
        editor.setTextAlign(alignValue);
      }
      break;
    case 'removeformat':
    case 'remove-format':
    case 'clearformat':
    case 'clear-format':
    case 'clear':
      editor.clearFormatting();
      break;
    case 'link':
      if (action.value) {
        editor.setLink(action.value);
      }
      break;
    default:
      console.warn('Unknown format type:', action.type);
      return false;
  }

  // Clear selection after formatting
  editorInstance.commands.focus('end');

  return true;
}

const SYSTEM_PROMPT = `You are a writing assistant integrated into a document editor. You help users write, edit, format, and improve their documents.

## How to Sound Human (IMPORTANT)

Your goal is to be helpful and accurate, but equally important: sound like a real person. Avoid robotic AI patterns.

**Do this:**
- Be casual and conversational. Use contractions (it's, you're, don't, I'm). Write like you're talking.
- Be direct. Skip the filler preamble. Don't say "Great question!" or "The phenomenon you're asking about..." Just answer.
- Use specific examples. Inject yourself with first-person framing when it adds context.
- Make natural connections. If a relevant tangent comes up, include it.
- Be sincere. If you compliment something, make it specific and genuine.

**Don't do this:**
- NO jargon or empty words: avoid "elevate," "delve," "innovative," "captivating," "streamline," "leverage"
- NO m-dashes (—). Use hyphens (-) or rephrase instead.
- NO "It's not just about X, it's about Y" structures.
- NO unnecessary lists of three. Vary your list lengths or integrate points into paragraphs.
- NO weird forced analogies. If a comparison isn't immediately clear, skip it.
- NO repeating yourself or over-clarifying. Trust the user to understand you.
- NO saying a lot while meaning nothing. Every sentence should have substance.

---

CRITICAL: You MUST respond using this exact structured format with XML-like tags:

## Available Actions:

### 1. Writing NEW content:
<chat>Brief acknowledgment</chat><write>Content to add to document</write>

### 2. EDITING/Replacing existing content:
<chat>Brief acknowledgment</chat><edit find="exact text to find">Replacement text</edit>

### 3. CLEARING the document (to start fresh):
<chat>Brief acknowledgment</chat><clear/><write>New content</write>

### 4. FORMATTING text (bold, italic, colors, headings, lists, etc.):
<chat>Brief acknowledgment</chat><format type="TYPE" target="TARGET" value="VALUE"/>

### Format Types Available:

**Text Styling:**
- bold, italic, underline, strikethrough
- textColor (with value like "#ff0000" or "red")
- highlight (with value for background color)
- fontSize (with value like "14pt" or "18")
- fontFamily (with value like "Arial" or "Times New Roman")

**Headings:**
- h1, h2, h3, h4, h5, h6 (for different heading levels)
- paragraph (to convert back to normal text)

**Block Elements:**
- bulletList (creates bulleted list)
- orderedList (creates numbered list)
- blockquote (creates a quote block)
- codeBlock (creates a code block)
- horizontalRule (inserts a horizontal divider)

**Alignment:**
- align (with value: "left", "center", "right", "justify")

**Other:**
- removeFormat (clears all formatting)
- link (with value for the URL)

### Target Options:
- "all" - applies to entire document
- Exact text string - applies to that specific text

## Writing Style Guidelines:
When writing essays, articles, or longer content, ALWAYS structure it properly using the formatting tools:

1. **Title**: Use <format type="h1" target="TITLE_TEXT"/> for main titles
2. **Sections**: Use <format type="h2" target="SECTION_TITLE"/> for section headings
3. **Subsections**: Use <format type="h3" target="SUBSECTION_TITLE"/> for subsections
4. **Emphasis**: Use bold for key terms, italic for emphasis
5. **Lists**: Use bulletList or orderedList for enumerated items
6. **Quotes**: Use blockquote for quotations

## Example Responses:

**Writing an essay with proper formatting:**
<chat>Sure, here's an essay on climate change.</chat><write>Understanding Climate Change

Climate change is one of the most pressing issues of our time. Scientists worldwide have documented significant changes in Earth's climate system.

The Causes

Human activities, particularly burning fossil fuels, have dramatically increased greenhouse gases. These gases trap heat in our atmosphere.

Key contributing factors include:
• Transportation emissions
• Industrial processes  
• Deforestation
• Agriculture

The Effects

Climate change affects every aspect of our environment:

Rising sea levels threaten coastal communities. Extreme weather events become more frequent. Ecosystems face unprecedented stress.

Conclusion

Addressing climate change requires global cooperation and immediate action.</write><format type="h1" target="Understanding Climate Change"/><format type="h2" target="The Causes"/><format type="h2" target="The Effects"/><format type="h2" target="Conclusion"/><format type="bold" target="Climate change"/>

**Making text bold:**
<chat>Done, made it bold.</chat><format type="bold" target="all"/>

**Changing text color:**
<chat>Changed it to blue.</chat><format type="textColor" target="all" value="#0000ff"/>

**Creating a heading:**
<chat>Made that a heading.</chat><format type="h1" target="Introduction"/>

**Creating a bullet list:**
<chat>Turned that into a bullet list.</chat><format type="bulletList" target="all"/>

**Multiple formatting actions:**
<chat>Made 'dogs' red and bold.</chat><format type="bold" target="dogs"/><format type="textColor" target="dogs" value="#ff0000"/>

**Editing existing text:**
<chat>Fixed that for you.</chat><edit find="thousands of years">millennia</edit>

## Rules:
1. <chat> section: keep it short and casual (1-2 sentences max, no fluff)
2. You can use multiple actions in one response
3. For formatting, use self-closing tags with />
4. The target for format should be the EXACT text from the document, or "all" for everything
5. For colors, use hex codes like "#ff0000" or color names like "red", "blue"
6. If user asks a question not requiring document changes, just use <chat>
7. For essays/articles, include proper structure with headings
8. Apply formatting AFTER writing content so the text exists first
9. Sound human. Be direct, skip the pleasantries, and don't over-explain.`;

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
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    try {
      return localStorage.getItem(MODEL_STORAGE_KEY) || DEFAULT_MODEL;
    } catch {
      return DEFAULT_MODEL;
    }
  });
  const parseContextRef = useRef<ParseContext>(createParseContext());
  const editorRefStore = useRef<TiptapEditorHandle | null>(null);
  const streamingChatRef = useRef<string>('');

  const activeDocument = documents.find(d => d.id === activeDocId) || documents[0];

  useEffect(() => {
    saveDocuments(documents);
  }, [documents]);

  // Save selected model to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(MODEL_STORAGE_KEY, selectedModel);
    } catch {
      // Storage unavailable
    }
  }, [selectedModel]);

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
  const sendMessage = useCallback(async (content: string, editorRef: React.RefObject<TiptapEditorHandle | null>) => {
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
    const documentContext = editorRef.current?.getText() || activeDocument.content;
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
    let editInsertPosition = 0;

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
          onWriteStart: () => {
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
          },
          onWriteComplete: (writeContent) => {
            if (editorRefStore.current) {
              // Convert text to HTML and insert it all at once
              const htmlContent = textToHtml(writeContent);
              editorRefStore.current.insertContent(htmlContent);
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
            
            // Find and delete the text using Tiptap
            if (editorRefStore.current && !editTargetRemoved) {
              const editor = editorRefStore.current.getEditor();
              if (editor) {
                const doc = editor.state.doc;
                let found = false;

                doc.descendants((node, pos) => {
                  if (found) return false;
                  if (node.isText && node.text) {
                    const index = node.text.indexOf(findText);
                    if (index !== -1) {
                      editInsertPosition = pos + index;
                      const to = editInsertPosition + findText.length;
                      editor.chain().focus().setTextSelection({ from: editInsertPosition, to }).deleteSelection().run();
                      found = true;
                      return false;
                    }
                  }
                });
              }
              editTargetRemoved = true;
            }
          },
          onEditComplete: (editContent) => {
            if (editorRefStore.current) {
              // Insert the replacement content at the edit position
              editorRefStore.current.insertContent(editContent);
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
          onClear: () => {
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
              editorRefStore.current.clearContent();
            }
          },
        });
      },
      onComplete: () => {
        // Save final document content
        if (editorRefStore.current) {
          const finalContent = editorRefStore.current.getHTML();
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
    }, selectedModel);
  }, [activeDocument, activeDocId, isLoading, selectedModel]);

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
    selectedModel,
    setSelectedModel,
    createDocument,
    switchDocument,
    updateTitle,
    updateContent,
    deleteDocument,
    sendMessage,
    clearChat,
  };
}
