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
const DEFAULT_MODEL = 'x-ai/grok-4.1-fast:free';

// Parser state for handling structured AI responses
type ParseState = 'idle' | 'in_tag' | 'in_chat' | 'in_write' | 'in_edit' | 'in_format' | 'in_insert';

interface FormatAction {
  type: string;
  target: string;
  value?: string;
}

interface InsertAction {
  position: 'start' | 'end' | 'before' | 'after';
  target?: string; // For before/after positioning
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
  insertAction: InsertAction | null;
  insertContent: string;
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
    insertAction: null,
    insertContent: '',
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
    onInsertStart: (action: InsertAction) => void;
    onInsertComplete: (content: string, action: InsertAction) => void;
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
          } else if (tagLower.startsWith('insert')) {
            // Parse insert tag: <insert position="start">, <insert after="text">, <insert before="text">
            const positionMatch = newCtx.tagBuffer.match(/position=["']([^"']+)["']/i);
            const afterMatch = newCtx.tagBuffer.match(/after=["']([^"']+)["']/i);
            const beforeMatch = newCtx.tagBuffer.match(/before=["']([^"']+)["']/i);
            
            let insertAction: InsertAction;
            if (afterMatch) {
              insertAction = { position: 'after', target: afterMatch[1] };
            } else if (beforeMatch) {
              insertAction = { position: 'before', target: beforeMatch[1] };
            } else if (positionMatch) {
              const pos = positionMatch[1].toLowerCase();
              insertAction = { position: pos === 'start' ? 'start' : 'end' };
            } else {
              // Default to end if no position specified
              insertAction = { position: 'end' };
            }
            
            newCtx.insertAction = insertAction;
            newCtx.insertContent = '';
            newCtx.state = 'in_insert';
            callbacks.onInsertStart(insertAction);
          } else if (tagLower === '/insert') {
            if (newCtx.insertAction) {
              callbacks.onInsertComplete(newCtx.insertContent, newCtx.insertAction);
              newCtx.insertAction = null;
            }
            newCtx.insertContent = '';
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
        
      case 'in_insert':
        if (char === '<') {
          newCtx.state = 'in_tag';
          newCtx.tagBuffer = '';
        } else {
          newCtx.insertContent += char;
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

// Normalize quotes and apostrophes for flexible text matching
function normalizeForMatching(text: string): string {
  return text
    .replace(/[''`′‵ʼ]/g, "'")  // Normalize single quotes/apostrophes
    .replace(/[""″‶]/g, '"');   // Normalize double quotes
}

// Extract a reasonable target from potentially malformed AI output
function extractReasonableTarget(target: string): string[] {
  const candidates: string[] = [];
  
  // If target is short and reasonable, use it as-is
  if (target.length <= 100 && !target.includes('\n')) {
    candidates.push(target);
    return candidates;
  }
  
  // Try first line only (most likely the actual title)
  const firstLine = target.split('\n')[0].trim();
  if (firstLine.length > 0 && firstLine.length <= 150) {
    candidates.push(firstLine);
  }
  
  // If first line contains a colon with repeated text (like "Title: Title"), extract just the first part
  const colonMatch = firstLine.match(/^(.+?):\s*\1/);
  if (colonMatch) {
    candidates.push(colonMatch[1].trim());
  }
  
  // Try text before first colon if it looks like "Title: rest of content"
  const beforeColon = firstLine.split(':')[0].trim();
  if (beforeColon.length > 0 && beforeColon.length < firstLine.length) {
    candidates.push(beforeColon);
  }
  
  // Also try the original if nothing else works
  if (candidates.length === 0) {
    candidates.push(target);
  }
  
  return candidates;
}

// Search for text across multiple nodes (handles text split by formatting)
interface TextSearchResult {
  from: number;
  to: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findTextInDocument(doc: any, searchText: string): TextSearchResult | null {
  // Build a map of all text content with positions
  const textSegments: { text: string; pos: number }[] = [];
  
  doc.descendants((node: { isText: boolean; text?: string }, pos: number) => {
    if (node.isText && node.text) {
      textSegments.push({ text: node.text, pos });
    }
  });
  
  if (textSegments.length === 0) return null;
  
  // Build combined text and position map
  let combinedText = '';
  const positionMap: { charIndex: number; docPos: number }[] = [];
  
  for (const segment of textSegments) {
    for (let i = 0; i < segment.text.length; i++) {
      positionMap.push({
        charIndex: combinedText.length + i,
        docPos: segment.pos + i
      });
    }
    combinedText += segment.text;
  }
  
  // Search in combined text (normalized)
  const normalizedCombined = normalizeForMatching(combinedText);
  const normalizedSearch = normalizeForMatching(searchText);
  const index = normalizedCombined.indexOf(normalizedSearch);
  
  if (index === -1) return null;
  
  // Map back to document positions
  const fromEntry = positionMap[index];
  const toEntry = positionMap[index + searchText.length - 1];
  
  if (!fromEntry || !toEntry) return null;
  
  return {
    from: fromEntry.docPos,
    to: toEntry.docPos + 1  // +1 because 'to' is exclusive in Tiptap
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
    let result: TextSearchResult | null = null;

    // Get candidate targets (handles malformed AI output)
    const candidates = extractReasonableTarget(action.target);

    // Try each candidate until we find a match
    for (const candidate of candidates) {
      result = findTextInDocument(doc, candidate);
      if (result) break;
    }

    if (result) {
      editorInstance.chain().focus().setTextSelection({ from: result.from, to: result.to }).run();
    } else {
      console.warn('Could not find text to format. Tried candidates:', candidates);
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
    case 'textindent':
    case 'text-indent':
    case 'indent':
    case 'firstlineindent':
    case 'first-line-indent':
      if (action.value) {
        editor.setTextIndent(action.value);
      } else {
        // Default indent is 2em (roughly two character widths, like a tab)
        editor.setTextIndent('2em');
      }
      break;
    case 'removeindent':
    case 'remove-indent':
    case 'unindent':
      editor.unsetTextIndent();
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

### 1. APPENDING new content (adds to end of document):
<chat>Brief acknowledgment</chat><write>Content to ADD to document</write>
NOTE: <write> only APPENDS. Use this for empty documents or adding new sections.

### 2. INSERTING text at a specific position:
<chat>Brief acknowledgment</chat><insert position="start">Content to insert</insert>
<chat>Brief acknowledgment</chat><insert after="existing text">Content to insert after</insert>
<chat>Brief acknowledgment</chat><insert before="existing text">Content to insert before</insert>
NOTE: Use this to add content at the beginning, end, or relative to existing text WITHOUT replacing anything.

### 3. EDITING specific text (find and replace):
<chat>Brief acknowledgment</chat><edit find="exact text to find">Replacement text</edit>
NOTE: Use this for small, targeted changes to existing content.

### 4. REWRITING the entire document (clear and replace):
<chat>Brief acknowledgment</chat><clear/><write>Complete new content</write>
NOTE: ALWAYS use <clear/> first when rewriting, improving, or creating a new version of existing content. This prevents duplicate content.

### 5. FORMATTING text (bold, italic, colors, headings, lists, etc.):
<chat>Brief acknowledgment</chat><format type="TYPE" target="TARGET" value="VALUE"/>

### Format Types Available:

**Text Styling:**
- bold, italic, underline, strikethrough
- textColor (with value like "#ff0000" or "red")
- highlight (with value for background color)
- fontSize (with value like "14pt" or "18")
- fontFamily (with value like "Arial" or "Times New Roman")
- textIndent (with value like "2em" for essay-style first-line paragraph indentation; default "2em" if no value)

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

## Example Responses:

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

**Adding essay-style paragraph indentation (tabs):**
<chat>Added first-line indentation to all paragraphs.</chat><format type="textIndent" target="all"/>

**Editing existing text:**
<chat>Fixed that for you.</chat><edit find="thousands of years">millennia</edit>

**Inserting text at the beginning:**
<chat>Added your name at the top.</chat><insert position="start">John Smith

</insert>

**Inserting text after specific content:**
<chat>Added a note after the introduction.</chat><insert after="Introduction">

Note: This is important context.

</insert>

## Rules:
1. <chat> section: keep it short and casual (1-2 sentences max, no fluff)
2. You can use multiple actions in one response
3. For formatting, use self-closing tags with />
4. The target for format should be the EXACT text from the document, or "all" for everything
5. For colors, use hex codes like "#ff0000" or color names like "red", "blue"
6. If user asks a question not requiring document changes, just use <chat>
7. Apply formatting AFTER writing content so the text exists first
8. Sound human. Be direct, skip the pleasantries, and don't over-explain.
9. NEVER use markdown syntax (# ## * ** _ etc.) in <write> content. Write plain text, then use <format> tags for styling.

## CRITICAL - When to use each action:
- <write> ONLY APPENDS content to the end of the document. It NEVER replaces existing content.
- <insert position="start"> adds content at the BEGINNING of the document (for headers, names, titles at top)
- <insert after="text"> or <insert before="text"> adds content relative to existing text WITHOUT replacing it
- <edit find="..."> for small targeted changes - finds and REPLACES specific text
- <clear/><write> for complete rewrites, new versions, or when asked to "redo", "rewrite", "make it better", "turn it into", etc.
- NEVER append a new version below the old one. Either edit specific parts OR clear and rewrite.
- When asked to "add something to the top" or "put my name at the beginning", use <insert position="start">, NOT <clear/><write>.

Example - Rewriting an essay:
<chat>Here's the improved version.</chat><clear/><write>New essay content here...</write>

## Example - Writing an Essay with Headings:
<chat>Here's your essay.</chat><write>The Remarkable World of Turtles

Introduction

Turtles have captivated humans for centuries...

Biology of Turtles

Turtles possess remarkable anatomy...</write><format type="h1" target="The Remarkable World of Turtles"/><format type="h2" target="Introduction"/><format type="h2" target="Biology of Turtles"/>

Notice: headings are written as plain text, then formatted with <format type="h1"> or <format type="h2"> tags.`;

const CHAT_MODE_SYSTEM_PROMPT = `You are a writing assistant helping a user with their document. You can see the document content and discuss it with the user, but you CANNOT edit it directly in this mode.

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

In this CHAT MODE, you can:
- Answer questions about the document
- Provide feedback and suggestions
- Discuss ideas and brainstorm
- Explain concepts related to the writing
- Help plan or outline content

You CANNOT directly edit the document in this mode. If the user wants you to make changes, suggest they switch to Edit mode.

Respond naturally without any special tags or formatting. Just have a normal conversation.`;

export type ChatMode = 'chat' | 'edit';

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
  const abortControllerRef = useRef<AbortController | null>(null);

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

  // Generate a title from user's message (max 5 words)
  const generateTitleFromMessage = useCallback((message: string): string => {
    // Clean up the message
    let title = message.trim();
    
    // Remove common prefixes like "write me", "help me with", etc.
    const prefixPatterns = [
      /^(please\s+)?write\s+(me\s+)?(a\s+|an\s+)?/i,
      /^(please\s+)?help\s+(me\s+)?(with\s+)?(a\s+|an\s+)?/i,
      /^(please\s+)?create\s+(me\s+)?(a\s+|an\s+)?/i,
      /^(please\s+)?make\s+(me\s+)?(a\s+|an\s+)?/i,
      /^(please\s+)?draft\s+(me\s+)?(a\s+|an\s+)?/i,
      /^(can\s+you\s+)?(please\s+)?/i,
      /^i\s+need\s+(a\s+|an\s+)?/i,
      /^i\s+want\s+(a\s+|an\s+)?/i,
    ];
    
    for (const pattern of prefixPatterns) {
      title = title.replace(pattern, '');
    }
    
    // Remove punctuation and extra whitespace
    title = title.replace(/[.!?,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Take only the first 5 words
    const words = title.split(' ').slice(0, 5);
    title = words.join(' ');
    
    // Capitalize first letter
    if (title.length > 0) {
      title = title.charAt(0).toUpperCase() + title.slice(1);
    }
    
    return title || 'Untitled document';
  }, []);

  // Send a chat message with direct document editing capability
  const sendMessage = useCallback(async (content: string, editorRef: React.RefObject<TiptapEditorHandle | null>, mode: ChatMode = 'edit') => {
    if (!content.trim() || isLoading || !activeDocument) return;

    // Auto-generate title if document is untitled and this is the first message
    if (activeDocument.title === 'Untitled document' && activeDocument.chatMessages.length === 0) {
      const generatedTitle = generateTitleFromMessage(content);
      if (generatedTitle !== 'Untitled document') {
        setDocuments(prev => prev.map(doc => 
          doc.id === activeDocId 
            ? { ...doc, title: generatedTitle, updatedAt: Date.now() }
            : doc
        ));
      }
    }

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
    const basePrompt = mode === 'edit' ? SYSTEM_PROMPT : CHAT_MODE_SYSTEM_PROMPT;
    const systemMessage: ChatMessage = {
      role: 'system' as const,
      content: `${basePrompt}\n\nDocument Title: "${activeDocument.title}"\n\nCurrent Document Content:\n${documentContext || '(empty document)'}`,
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

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    // Handler for streaming tokens based on mode
    const handleToken = mode === 'chat' 
      ? (token: string) => {
          // Chat mode: just stream the response directly
          streamingChatRef.current += token;
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
        }
      : (token: string) => {
          // Edit mode: parse for document editing tags
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
                  const result = findTextInDocument(doc, findText);
                  
                  if (result) {
                    editor.chain().focus().setTextSelection({ from: result.from, to: result.to }).deleteSelection().run();
                  }
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
            onInsertStart: () => {
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
            onInsertComplete: (insertContent, action) => {
              if (editorRefStore.current) {
                const editor = editorRefStore.current.getEditor();
                if (editor) {
                  const htmlContent = textToHtml(insertContent);
                  
                  if (action.position === 'start') {
                    // Insert at the very beginning of the document
                    editor.chain().focus().setTextSelection(0).insertContent(htmlContent).run();
                  } else if (action.position === 'end') {
                    // Insert at the end (same as write)
                    editorRefStore.current.insertContent(htmlContent);
                  } else if (action.position === 'after' && action.target) {
                    // Find the target text and insert after it
                    const doc = editor.state.doc;
                    const result = findTextInDocument(doc, action.target);
                    if (result) {
                      editor.chain().focus().setTextSelection(result.to).insertContent(htmlContent).run();
                    } else {
                      // Fallback: insert at end if target not found
                      editorRefStore.current.insertContent(htmlContent);
                    }
                  } else if (action.position === 'before' && action.target) {
                    // Find the target text and insert before it
                    const doc = editor.state.doc;
                    const result = findTextInDocument(doc, action.target);
                    if (result) {
                      editor.chain().focus().setTextSelection(result.from).insertContent(htmlContent).run();
                    } else {
                      // Fallback: insert at start if target not found
                      editor.chain().focus().setTextSelection(0).insertContent(htmlContent).run();
                    }
                  }
                }
              }
            },
          });
        };

    await sendMessageStream([systemMessage, ...chatHistory], {
      onToken: handleToken,
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
        abortControllerRef.current = null;
      },
      onError: (err) => {
        // Don't show error or remove message if it was aborted by user
        if (err.name === 'AbortError') {
          // Keep the partial response, just mark as complete
          setDocuments(prev => prev.map(doc => 
            doc.id === activeDocId 
              ? { 
                  ...doc, 
                  chatMessages: doc.chatMessages.map(m => 
                    m.id === assistantId 
                      ? { ...m, content: streamingChatRef.current || '(stopped)', isWriting: false }
                      : m
                  ),
                  updatedAt: Date.now() 
                }
              : doc
          ));
        } else {
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
        }
        setIsLoading(false);
        setIsWritingToDoc(false);
        abortControllerRef.current = null;
      },
    }, selectedModel, abortControllerRef.current.signal);
  }, [activeDocument, activeDocId, isLoading, selectedModel]);

  const clearChat = useCallback(() => {
    setDocuments(prev => prev.map(doc => 
      doc.id === activeDocId 
        ? { ...doc, chatMessages: [], updatedAt: Date.now() }
        : doc
    ));
    setError(null);
  }, [activeDocId]);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

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
    stopGeneration,
  };
}
