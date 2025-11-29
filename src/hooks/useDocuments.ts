import { useState, useEffect, useCallback, useRef } from 'react';
import { sendMessageStream } from '../api/openrouter';
import type { ChatMessage } from '../api/openrouter';
import type { TiptapEditorHandle } from '../components/TiptapEditor';
import { searchExa, formatSearchResultsForAI, type SearchResult } from '../api/exa';

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

interface SearchAction {
  query: string;
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
  searchAction: SearchAction | null;
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
    searchAction: null,
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
    onSearch: (query: string) => void;
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
          } else if (tagLower.startsWith('search')) {
            // Parse search tag: <search query="..."/>
            const queryMatch = newCtx.tagBuffer.match(/query=["']([^"']+)["']/i);
            if (queryMatch) {
              const searchQuery = queryMatch[1];
              // Search is always self-closing
              callbacks.onSearch(searchQuery);
            }
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

// Extract document styling information for AI context
interface DocumentStyleInfo {
  hasContent: boolean;
  totalParagraphs: number;
  totalHeadings: { level: number; text: string }[];
  hasBoldText: boolean;
  hasItalicText: boolean;
  hasUnderlineText: boolean;
  hasColoredText: boolean;
  hasHighlightedText: boolean;
  hasBulletLists: boolean;
  hasNumberedLists: boolean;
  hasBlockquotes: boolean;
  hasCodeBlocks: boolean;
  hasLinks: boolean;
  textAlignments: Set<string>;
  fontFamilies: Set<string>;
  fontSizes: Set<string>;
  textColors: Set<string>;
  highlightColors: Set<string>;
  formattedSections: { text: string; styles: string[] }[];
}

function extractDocumentStyling(editor: TiptapEditorHandle): DocumentStyleInfo {
  const editorInstance = editor.getEditor();
  const info: DocumentStyleInfo = {
    hasContent: false,
    totalParagraphs: 0,
    totalHeadings: [],
    hasBoldText: false,
    hasItalicText: false,
    hasUnderlineText: false,
    hasColoredText: false,
    hasHighlightedText: false,
    hasBulletLists: false,
    hasNumberedLists: false,
    hasBlockquotes: false,
    hasCodeBlocks: false,
    hasLinks: false,
    textAlignments: new Set<string>(),
    fontFamilies: new Set<string>(),
    fontSizes: new Set<string>(),
    textColors: new Set<string>(),
    highlightColors: new Set<string>(),
    formattedSections: [],
  };

  if (!editorInstance) return info;

  const doc = editorInstance.state.doc;
  info.hasContent = doc.textContent.length > 0;

  // Traverse the document to extract styling info
  doc.descendants((node) => {
    // Check node type
    if (node.type.name === 'paragraph') {
      info.totalParagraphs++;
      // Check text alignment
      if (node.attrs.textAlign) {
        info.textAlignments.add(node.attrs.textAlign);
      }
    }

    if (node.type.name === 'heading') {
      const level = node.attrs.level as number;
      info.totalHeadings.push({ level, text: node.textContent.slice(0, 50) });
      if (node.attrs.textAlign) {
        info.textAlignments.add(node.attrs.textAlign);
      }
    }

    if (node.type.name === 'bulletList') {
      info.hasBulletLists = true;
    }

    if (node.type.name === 'orderedList') {
      info.hasNumberedLists = true;
    }

    if (node.type.name === 'blockquote') {
      info.hasBlockquotes = true;
    }

    if (node.type.name === 'codeBlock') {
      info.hasCodeBlocks = true;
    }

    // Check marks on text nodes
    if (node.isText && node.marks.length > 0) {
      const styles: string[] = [];
      const textSnippet = node.text?.slice(0, 30) || '';

      for (const mark of node.marks) {
        if (mark.type.name === 'bold') {
          info.hasBoldText = true;
          styles.push('bold');
        }
        if (mark.type.name === 'italic') {
          info.hasItalicText = true;
          styles.push('italic');
        }
        if (mark.type.name === 'underline') {
          info.hasUnderlineText = true;
          styles.push('underline');
        }
        if (mark.type.name === 'link') {
          info.hasLinks = true;
          styles.push(`link(${mark.attrs.href})`);
        }
        if (mark.type.name === 'textStyle') {
          if (mark.attrs.color) {
            info.hasColoredText = true;
            info.textColors.add(mark.attrs.color);
            styles.push(`color:${mark.attrs.color}`);
          }
          if (mark.attrs.fontFamily) {
            info.fontFamilies.add(mark.attrs.fontFamily);
            styles.push(`font:${mark.attrs.fontFamily}`);
          }
          if (mark.attrs.fontSize) {
            info.fontSizes.add(mark.attrs.fontSize);
            styles.push(`size:${mark.attrs.fontSize}`);
          }
        }
        if (mark.type.name === 'highlight') {
          info.hasHighlightedText = true;
          if (mark.attrs.color) {
            info.highlightColors.add(mark.attrs.color);
            styles.push(`highlight:${mark.attrs.color}`);
          }
        }
      }

      if (styles.length > 0 && textSnippet.trim()) {
        info.formattedSections.push({ text: textSnippet, styles });
      }
    }

    return true; // Continue traversing
  });

  return info;
}

// Format styling info for AI context
function formatStylingForAI(info: DocumentStyleInfo): string {
  if (!info.hasContent) {
    return 'Document styling: (empty document, no styling applied)';
  }

  const lines: string[] = ['## Current Document Styling:'];

  // Structure overview
  lines.push(`\n### Structure:`);
  lines.push(`- Paragraphs: ${info.totalParagraphs}`);
  if (info.totalHeadings.length > 0) {
    lines.push(`- Headings: ${info.totalHeadings.length}`);
    for (const h of info.totalHeadings.slice(0, 10)) {
      lines.push(`  - H${h.level}: "${h.text}${h.text.length >= 50 ? '...' : ''}"`);
    }
    if (info.totalHeadings.length > 10) {
      lines.push(`  - ... and ${info.totalHeadings.length - 10} more headings`);
    }
  }

  // Lists and blocks
  const blocks: string[] = [];
  if (info.hasBulletLists) blocks.push('bullet lists');
  if (info.hasNumberedLists) blocks.push('numbered lists');
  if (info.hasBlockquotes) blocks.push('blockquotes');
  if (info.hasCodeBlocks) blocks.push('code blocks');
  if (info.hasLinks) blocks.push('links');
  if (blocks.length > 0) {
    lines.push(`- Contains: ${blocks.join(', ')}`);
  }

  // Text formatting
  const textStyles: string[] = [];
  if (info.hasBoldText) textStyles.push('bold');
  if (info.hasItalicText) textStyles.push('italic');
  if (info.hasUnderlineText) textStyles.push('underline');
  if (info.hasColoredText) textStyles.push('colored text');
  if (info.hasHighlightedText) textStyles.push('highlighted text');
  
  if (textStyles.length > 0) {
    lines.push(`\n### Text Formatting Applied:`);
    lines.push(`- Styles used: ${textStyles.join(', ')}`);
  }

  // Alignments
  if (info.textAlignments.size > 0) {
    lines.push(`- Text alignments: ${Array.from(info.textAlignments).join(', ')}`);
  }

  // Fonts
  if (info.fontFamilies.size > 0) {
    lines.push(`- Font families: ${Array.from(info.fontFamilies).join(', ')}`);
  }

  // Font sizes
  if (info.fontSizes.size > 0) {
    lines.push(`- Font sizes: ${Array.from(info.fontSizes).join(', ')}`);
  }

  // Colors
  if (info.textColors.size > 0) {
    lines.push(`- Text colors: ${Array.from(info.textColors).slice(0, 5).join(', ')}${info.textColors.size > 5 ? ` (+${info.textColors.size - 5} more)` : ''}`);
  }

  if (info.highlightColors.size > 0) {
    lines.push(`- Highlight colors: ${Array.from(info.highlightColors).slice(0, 5).join(', ')}${info.highlightColors.size > 5 ? ` (+${info.highlightColors.size - 5} more)` : ''}`);
  }

  // Sample formatted sections (show a few examples)
  if (info.formattedSections.length > 0) {
    lines.push(`\n### Sample Formatted Text:`);
    const samples = info.formattedSections.slice(0, 5);
    for (const section of samples) {
      lines.push(`- "${section.text}${section.text.length >= 30 ? '...' : ''}" → [${section.styles.join(', ')}]`);
    }
    if (info.formattedSections.length > 5) {
      lines.push(`- ... and ${info.formattedSections.length - 5} more formatted sections`);
    }
  }

  return lines.join('\n');
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

## How to Sound Human (CRITICAL - READ CAREFULLY)

Your writing must pass as human-written. AI detection works by predicting statistically probable text. Humans are chaotic, idiosyncratic, and occasionally imprecise. You must break the predictable patterns.

### 1. DESTROY THE "PERFECT" RHYTHM (Burstiness)

AI writing is "flat" because it keeps consistent sentence length. Humans write with "burstiness," mixing very long, complex sentences with very short ones.

BAD (uniform): "The Shuttle was expensive. It cost $1.5 billion per launch. This was unsustainable."
GOOD (bursty): "The Shuttle was astronomically expensive, costing $1.5 billion per launch. Frankly unsustainable."

Use semicolons, sentence fragments, parentheses. Vary length dramatically. Some sentences should be 5 words. Others should sprawl across multiple clauses. NEVER use em-dashes (—) or en-dashes (–), they are a major AI tell.

### 2. INJECT HEDGING AND UNCERTAINTY

AI models are confidently assertive. Students hedge their statements to avoid being wrong.

BAD: "The data proves that Falcon 9 is cheaper."
GOOD: "It seems like the Falcon 9 ends up being cheaper, at least based on these numbers."

Use phrases like:
- "It seems that," "One might argue," "To the best of my knowledge"
- "I'm not entirely sure, but," "This could be wrong, but," "I think"
- "probably," "maybe," "from what I can tell"

NOTE: Hedging should feel natural, not formulaic. Don't start introductions with "I suspect the key takeaway is..." (that's robotic). Instead, weave uncertainty into your actual arguments.

### 3. USE "LOW PROBABILITY" VOCABULARY

AI chooses the most statistically probable word. Humans sometimes choose words that are slightly "off" or colorful.

BAD: "The question is significant."
GOOD: "This is a very pondering question." (An AI would say "thought-provoking"; "pondering" is a human quirk)

Allow slightly awkward or unexpected word choices. Use metaphors that aren't perfectly polished. Be a little imprecise sometimes.

### 4. REMOVE THE "CONNECTIVE TISSUE"

AI loves transition words. It holds the reader's hand between paragraphs. Humans just jump.

DELETE THESE: "Furthermore," "In conclusion," "Moreover," "It is important to note," "Consequently," "Additionally," "In addition," "As such," "Thus," "Therefore," "Hence"

What to do instead: Just jump to the next point. Let context link ideas. Trust the reader.

### 5. USE OPINIONATED FIRST-PERSON LANGUAGE

AI defaults to neutral third-person. Humans slip into "I" naturally.

BAD: "The analysis reveals that the policy was ineffective."
GOOD: "I don't completely agree with this, but I don't completely disagree either. The policy had issues, sure, but calling it a total failure seems harsh."

Express genuine opinions. Take sides (cautiously). Show that a specific person is thinking through this.

### 6. AVOID DATA DUMPING

AI repeats exact figures obsessively. Humans mention a stat once, then refer to it loosely.

BAD: "The cost was $54,500 per kilogram. This $54,500 figure was problematic. When compared to the $2,720 cost..."
GOOD: "The cost was around $54,500 per kilogram (a number that made everyone wince). Later designs brought that down massively, to under $3,000."

After first mention, use "that huge price gap," "the cost difference," "those earlier numbers." Don't copy-paste exact figures repeatedly.

### 7. AVOID CLICHÉ AI OPENINGS

NEVER start with:
- "X has fascinated/intrigued/captivated humans for centuries/ages..."
- "Throughout history, X has..."
- "From ancient times to modern day..."
- "In today's world/society..."
- "X is one of the most remarkable/fascinating..."

Instead, start with a specific fact, a question, or jump straight in.
BAD: "Turtles have intrigued people for ages with their tough shells."
GOOD: "A turtle's shell isn't just armor. It's fused to its skeleton, so they can't crawl out like hermit crabs do."

### 8. BE SPECIFIC, NOT GENERIC

BAD: "Turtles face serious dangers today."
GOOD: "Plastic bags kill thousands of sea turtles yearly because they look exactly like jellyfish underwater."

### 9. FOR CITATIONS - BE COMPLETE AND ACCURATE (CRITICAL)

**NEVER create "ghost citations"** - every in-text citation MUST have a corresponding Works Cited/References entry. This is a major AI tell.

BAD: Essay cites "(Mitchell and Buhlmann)" but Works Cited has no Mitchell and Buhlmann entry.
GOOD: Every single (Author) reference in the text appears in the Works Cited with full details.

**Before finishing any essay with citations:**
1. List every in-text citation you used
2. Verify each one has a complete Works Cited entry
3. If you can't provide full citation details for a source, DON'T cite it in-text

**MLA Format (8th edition):**
- In-text: (Author's Last Name) or (Author's Last Name Page#)
- Works Cited entry: Last, First. "Title." Container, Publisher, Date, URL. Accessed Day Month Year.
- Alphabetize by author last name
- Hanging indent (second line indented)

**APA Format (7th edition):**
- In-text: (Author, Year) or (Author, Year, p. #)
- References entry: Author, A. A. (Year). Title. Publisher. URL
- Alphabetize by author last name
- Hanging indent

**Use search results EXACTLY:**
- Use the EXACT author names provided in search results
- Use the EXACT title provided
- If multiple authors, cite the first author listed
- Don't invent or modify citation details
- If a source doesn't have an author, use the organization name

### 10. AVOID DRAMATIC/MARKETING TONE

Don't use:
- "Enter [subject]..." or "Enter: the solution"
- "X flipped the script" or "X changed the game"
- "Reality hit harder" or similar dramatic pivots
- Rhetorical questions as transitions

BAD: "Costs ballooned. Reality hit harder. Enter SpaceX."
GOOD: "The Shuttle's costs exceeded projections by wide margins, which opened the door for commercial alternatives."

### 11. AVOID META-COMMENTARY (Major AI Tell)

Never explain what you're doing as you do it. This is extremely robotic.

BANNED meta-commentary:
- "Restating it:" or "To restate:"
- "I suspect the key takeaway is..."
- "This essay will explore/examine/discuss..."
- "As we have seen..."
- "Moving on to..."
- "Let's dive into..."
- "It's worth noting that..."

Just make your points. Don't announce them.

BAD: "Restating it: human actions are overwhelming these survivors."
GOOD: "Human actions are overwhelming these survivors."

### 12. DON'T MIX FORCED CASUAL WITH FORMAL CITATIONS

This is a dead giveaway. If you're writing an academic paper with citations, maintain a consistent academic (but natural) tone. Don't sprinkle slang into a cited essay.

BAD: "Turtles might seem like slow, shell-wearing oddballs... (Smith 2023)."
GOOD: "Turtles have survived for over 200 million years, outlasting the dinosaurs (Smith 2023)."

Avoid these "trying too hard to sound casual" phrases in cited essays:
- "oddballs", "crank it up", "get this:", "so yeah", "pretty much", "a lot"
- "killer adaptations", "landlubbers", "munch on"
- Fragment sentences meant to sound breezy: "Omnivores, most of 'em."

Academic papers can still be readable and engaging without forcing slang. Use clear, direct language instead.

### 13. AVOID FORCED FILLER PHRASES

These phrases scream "AI trying to sound human":
- "so yeah" (especially at the end of sentences)
- "And get this:"
- "Here's the thing:"
- "Pretty much"
- "kind of a big deal"
- "you know"
- "I mean"

### BANNED WORDS AND PHRASES

Never use these AI-tell words:
elevate, delve, innovative, captivating, streamline, leverage, multifaceted, comprehensive, crucial, diverse, foster, landscape, myriad, nuanced, paradigm, plethora, realm, robust, seamless, synergy, tapestry, underscore, unique, utilise/utilize, vibrant, vital, crucial, pivotal, groundbreaking, cutting-edge

Never use these phrases:
"It's not just about X, it's about Y", "In conclusion", "This essay will explore", "As we have seen", "game-changer", "at its core", "when it comes to", "the question of X is", "it is worth noting", "Restating it:", "I suspect the key takeaway"

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

### 6. SEARCHING for information (research, facts, citations):
<search query="your search query"/>
NOTE: Use this when writing essays that need citations, verifying facts, or gathering current information. Search results will be provided back to you, then you can write content using those sources. ALWAYS use search for:
- Essays requiring academic sources or citations
- Topics that need current/recent information
- Fact-checking or verification
- Research papers or reports

**Example - Essay with research:**
<chat>Let me research that first.</chat><search query="climate change effects on coral reefs scientific studies"/>

After receiving search results, you'll write the content using those sources and cite them properly with URLs.

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
10. Use <search> when writing essays or content that needs citations, facts, or research - especially academic work.
11. NEVER use em-dashes (—) or en-dashes (–). They are a major AI tell. Use commas, semicolons, parentheses, or separate sentences instead.
12. You can see the document's current styling (fonts, colors, alignments, headings, etc.) in the "Current Document Styling" section. Use this to:
    - Match existing formatting when adding new content
    - Understand what formatting has already been applied
    - Avoid re-applying formatting that already exists
    - Answer questions about the document's appearance

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

const CHAT_MODE_SYSTEM_PROMPT = `You are a writing assistant helping a user with their document. You can see the document content and its styling/formatting, but you CANNOT edit it directly in this mode.

## Sound Human
- Be direct and casual. Use contractions.
- Skip filler like "Great question!" Just answer.
- NEVER use em-dashes (—) or en-dashes (–). They are a major AI tell.
- Hedge sometimes: "I think," "probably," "sort of," "it seems like"
- Vary sentence length dramatically. Some short. Others sprawl.
- Avoid AI buzzwords: delve, elevate, captivating, innovative, leverage, multifaceted, crucial, foster, landscape, myriad, nuanced, paradigm, realm, robust, seamless, synergy, tapestry, underscore, vibrant, vital

In this CHAT MODE, you can:
- Answer questions about the document
- Describe the document's current formatting and styling (you can see fonts, colors, headings, alignments, bold/italic text, etc.)
- Provide feedback and suggestions on both content and formatting
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
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
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
  const searchInProgressRef = useRef<boolean>(false);
  const pendingSearchResultsRef = useRef<SearchResult[] | null>(null);
  const savedScrollPositionRef = useRef<number | null>(null);

  // Helper function to find the scrollable container (parent with overflow-y-auto)
  const findScrollableContainer = useCallback((editorElement: HTMLElement | null): HTMLElement | null => {
    if (!editorElement) return null;
    
    let current: HTMLElement | null = editorElement.parentElement;
    while (current) {
      const style = window.getComputedStyle(current);
      if (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflow === 'auto' || style.overflow === 'scroll') {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }, []);

  // Save scroll position before AI edits
  const saveScrollPosition = useCallback(() => {
    const editorHandle = editorRefStore.current;
    if (!editorHandle) return;
    
    const editor = editorHandle.getEditor();
    if (!editor) return;
    
    const editorElement = editor.view.dom as HTMLElement;
    const scrollContainer = findScrollableContainer(editorElement);
    
    if (scrollContainer) {
      savedScrollPositionRef.current = scrollContainer.scrollTop;
    }
  }, [findScrollableContainer]);

  // Restore scroll position after AI edits
  const restoreScrollPosition = useCallback(() => {
    const editorHandle = editorRefStore.current;
    if (!editorHandle || savedScrollPositionRef.current === null) return;
    
    const editor = editorHandle.getEditor();
    if (!editor) return;
    
    const editorElement = editor.view.dom as HTMLElement;
    const scrollContainer = findScrollableContainer(editorElement);
    
    if (scrollContainer) {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        if (savedScrollPositionRef.current !== null) {
          scrollContainer.scrollTop = savedScrollPositionRef.current;
          savedScrollPositionRef.current = null;
        }
      });
    }
  }, [findScrollableContainer]);

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

  // Perform a search and return results
  const performSearch = useCallback(async (query: string): Promise<SearchResult[]> => {
    setIsSearching(true);
    setError(null);
    try {
      const results = await searchExa(query);
      setSearchResults(results);
      return results;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Search failed';
      setError(message);
      return [];
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Send a chat message with direct document editing capability
  const sendMessage = useCallback(async (content: string, editorRef: React.RefObject<TiptapEditorHandle | null>, mode: ChatMode = 'edit', preSearchResults?: SearchResult[]) => {
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
    searchInProgressRef.current = false;
    pendingSearchResultsRef.current = null;

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
    
    // Get current date for citations
    const today = new Date();
    const currentDate = today.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    // Extract document styling information if editor is available
    let stylingContext = '';
    if (editorRef.current) {
      const stylingInfo = extractDocumentStyling(editorRef.current);
      stylingContext = formatStylingForAI(stylingInfo);
    }
    
    // Build system message with optional search results
    let systemContent = `${basePrompt}\n\nToday's Date: ${currentDate}\n\nDocument Title: "${activeDocument.title}"\n\nCurrent Document Content:\n${documentContext || '(empty document)'}\n\n${stylingContext}`;
    
    if (preSearchResults && preSearchResults.length > 0) {
      const formattedResults = formatSearchResultsForAI(preSearchResults);
      systemContent += `\n\n## Research Results (use these for citations):\n${formattedResults}\n\nIMPORTANT: Use the research results above to support your writing with accurate information and proper citations. Include URLs when citing sources. For "Accessed" dates in citations, use today's date: ${currentDate}.`;
    }
    
    const systemMessage: ChatMessage = {
      role: 'system' as const,
      content: systemContent,
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

    // Helper function to make follow-up call with search results
    // This is called from both onComplete and onError to handle the race condition
    // where search may complete before or after the stream ends
    const makeSearchFollowUpCall = async () => {
      if (!pendingSearchResultsRef.current) return false;
      
      console.log('[Search] Making follow-up call with search results');
      const searchResults = pendingSearchResultsRef.current;
      pendingSearchResultsRef.current = null; // Clear pending results
      
      // Format search results for context
      const formattedResults = formatSearchResultsForAI(searchResults);
      
      // Build follow-up messages
      const followUpHistory: ChatMessage[] = [
        ...chatHistory,
        { 
          role: 'assistant' as const, 
          content: streamingChatRef.current 
        },
        { 
          role: 'user' as const, 
          content: `Here are the research results I found:\n\n${formattedResults}\n\nNow please write the content using these sources. Include proper citations with URLs where appropriate.` 
        }
      ];
      
      // Create new abort controller for follow-up
      abortControllerRef.current = new AbortController();
      
      // Make follow-up call
      console.log('[Search] Starting follow-up generation with', searchResults.length, 'sources');
      await sendMessageStream([systemMessage, ...followUpHistory], {
        onToken: handleToken,
        onComplete: () => {
          console.log('[Search] Follow-up generation complete');
          if (editorRefStore.current) {
            const finalContent = editorRefStore.current.getHTML();
            setDocuments(prev => prev.map(doc => 
              doc.id === activeDocId 
                ? { ...doc, content: finalContent, updatedAt: Date.now() }
                : doc
            ));
          }
          
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
        onError: (followUpErr) => {
          console.error('[Search] Follow-up generation error:', followUpErr);
          if (followUpErr.name !== 'AbortError') {
            setError(followUpErr.message);
          }
          setIsLoading(false);
          setIsWritingToDoc(false);
          abortControllerRef.current = null;
        },
      }, selectedModel, abortControllerRef.current.signal);
      
      return true;
    };

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
              saveScrollPosition();
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
                restoreScrollPosition();
              }
            },
            onEditStart: (findText) => {
              saveScrollPosition();
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
                restoreScrollPosition();
              }
            },
            onFormat: (action) => {
              saveScrollPosition();
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
                restoreScrollPosition();
              }
            },
            onClear: () => {
              saveScrollPosition();
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
                restoreScrollPosition();
              }
            },
            onInsertStart: () => {
              saveScrollPosition();
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
                  restoreScrollPosition();
                }
              }
            },
            onSearch: async (query) => {
              // Prevent duplicate search calls
              if (searchInProgressRef.current) {
                console.log('[Search] Already in progress, skipping duplicate call');
                return;
              }
              
              console.log('[Search] AI requested search for:', query);
              searchInProgressRef.current = true;
              setIsSearching(true);
              
              // Update chat to show searching
              const searchingMsg = ` Searching for sources...`;
              streamingChatRef.current += searchingMsg;
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
              
              try {
                console.log('[Search] Calling Exa API...');
                const results = await searchExa(query);
                console.log('[Search] Got results:', results.length, 'sources');
                setSearchResults(results);
                
                // Store results for the follow-up call
                pendingSearchResultsRef.current = results;
                
                // Update chat to show search completed
                const resultSummary = results.length > 0 
                  ? ` Found ${results.length} sources. Now writing with citations...`
                  : ' No results found.';
                streamingChatRef.current = streamingChatRef.current.replace(searchingMsg, resultSummary);
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
                
                // Abort current stream - we'll make a follow-up call with search results
                console.log('[Search] Aborting current stream to make follow-up call with results');
                if (abortControllerRef.current) {
                  abortControllerRef.current.abort();
                }
              } catch (err) {
                console.error('[Search] Failed:', err);
                streamingChatRef.current = streamingChatRef.current.replace(searchingMsg, ' Search failed.');
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
              } finally {
                setIsSearching(false);
                searchInProgressRef.current = false;
              }
            },
          });
        };

    await sendMessageStream([systemMessage, ...chatHistory], {
      onToken: handleToken,
      onComplete: async () => {
        // Check if a search is still in progress - wait for it to complete
        // This handles the race condition where the stream finishes before search completes
        if (searchInProgressRef.current) {
          console.log('[Search] Stream completed but search still in progress - waiting...');
          // Wait for search to complete (check every 100ms, max 30 seconds)
          let waited = 0;
          while (searchInProgressRef.current && waited < 30000) {
            await new Promise(resolve => setTimeout(resolve, 100));
            waited += 100;
          }
          console.log('[Search] Search finished after', waited, 'ms wait');
        }
        
        // Check if we have pending search results
        if (pendingSearchResultsRef.current) {
          console.log('[Search] Stream completed with pending search results - making follow-up call');
          await makeSearchFollowUpCall();
          return;
        }
        
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
      onError: async (err) => {
        // Check if we aborted due to a search - if so, make follow-up call with results
        if (err.name === 'AbortError' && pendingSearchResultsRef.current) {
          await makeSearchFollowUpCall();
          return; // Don't run the normal abort handling
        }
        
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
  }, [activeDocument, activeDocId, isLoading, selectedModel, generateTitleFromMessage]);

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
    isSearching,
    searchResults,
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
    performSearch,
  };
}
