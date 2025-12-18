import { useState, useEffect, useCallback, useRef } from 'react';
import { generateTitle, DEFAULT_MODEL } from '../api/openrouter';
import type { TiptapEditorHandle } from '../components/TiptapEditor';
import { searchExa, type SearchResult } from '../api/exa';

// Agent system imports
import { runAgentLoop } from '../agent/Loop';
import { createAgentConfig, getPresetForMode } from '../agent/Agent';
import type { ToolStatus, Todo, UserQuestionRequest, UserQuestionResponse, MessagePart, TextPart } from '../agent/types';
import { detectPlanMode, getPlanModeInstructions } from '../agent/planDetector';

// Model-specific prompts system
import { buildSystemPrompt, type PromptContext, type PersonaSettings as PromptPersonaSettings, type EssayTemplate } from '../prompts';

// Essay format templates
import { PRESET_TEMPLATES } from '../prompts/formats';

// Legacy type - kept for reference during migration
export type MessageStatus = 'thinking' | 'reading' | 'searching' | 'writing' | 'formatting' | 'done';

export interface DocChatMessage {
  id: string;
  role: 'user' | 'assistant';
  parts: MessagePart[];  // Message parts (text, tool calls, tool results)
  timestamp: number;
  isStreaming?: boolean;  // True while message is being generated
}

// Helper to get text content from message parts
export function getMessageText(msg: DocChatMessage): string {
  return msg.parts
    .filter((p): p is TextPart => p.type === 'text')
    .map((p) => p.content)
    .join('');
}

// Legacy interface for migration
interface LegacyDocChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content?: string;
  parts?: MessagePart[];
  timestamp: number;
  status?: MessageStatus;
  statusDetail?: string;
  isStreaming?: boolean;
}

// Migrate legacy message format to new parts-based format
function migrateDocChatMessage(msg: LegacyDocChatMessage): DocChatMessage {
  // Already migrated - has parts array
  if (Array.isArray(msg.parts) && msg.parts.length > 0) {
    return {
      id: msg.id,
      role: msg.role,
      parts: msg.parts,
      timestamp: msg.timestamp,
      isStreaming: msg.isStreaming ?? false,
    };
  }

  // Convert legacy flat content to parts
  const parts: MessagePart[] = [];
  if (msg.content && msg.content.trim()) {
    parts.push({ type: 'text', content: msg.content });
  }

  return {
    id: msg.id,
    role: msg.role,
    parts,
    timestamp: msg.timestamp,
    isStreaming: false,
  };
}

export interface Document {
  id: string;
  title: string;
  content: string; // HTML content of the editor
  chatMessages: DocChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface PersonaSettings {
  documentName: string;
  documentContent: string;
  profileImage: string | null; // Base64 data URL
  firstName: string;
  lastName: string;
  teacherName: string;
  className: string;
}

// EssayTemplate is imported from ../prompts
export type { EssayTemplate } from '../prompts';

const STORAGE_KEY = 'homework-documents';
const MODEL_STORAGE_KEY = 'homework-selected-model';
const PERSONA_STORAGE_KEY = 'homework-persona-settings';
const GHOST_MODE_STORAGE_KEY = 'homework-ghost-mode';
const TEMPLATES_STORAGE_KEY = 'homework-essay-templates';

// ==================== HELPER FUNCTIONS ====================

function loadDocuments(): Document[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const docs = JSON.parse(stored) as Document[];
    // Migrate legacy message format to parts-based format
    return docs.map(doc => ({
      ...doc,
      chatMessages: doc.chatMessages.map(msg => migrateDocChatMessage(msg as LegacyDocChatMessage)),
    }));
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

function loadPersona(): PersonaSettings | null {
  try {
    const stored = localStorage.getItem(PERSONA_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function savePersona(persona: PersonaSettings | null) {
  try {
    if (persona) {
      localStorage.setItem(PERSONA_STORAGE_KEY, JSON.stringify(persona));
    } else {
      localStorage.removeItem(PERSONA_STORAGE_KEY);
    }
  } catch {
    // Storage full or unavailable
  }
}

function loadCustomTemplates(): EssayTemplate[] {
  try {
    const stored = localStorage.getItem(TEMPLATES_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveCustomTemplates(templates: EssayTemplate[]) {
  try {
    localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
  } catch {
    // Storage full or unavailable
  }
}

// Get all templates (presets from prompts/formats + custom from localStorage)
function getAllTemplates(): EssayTemplate[] {
  const customTemplates = loadCustomTemplates();
  return [...PRESET_TEMPLATES, ...customTemplates];
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

// Generate AI-readable template instructions from HTML content
// This analyzes the document structure and produces step-by-step formatting instructions
function generateTemplateInstructions(htmlContent: string): string {
  // Parse HTML to extract structure
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');
  const body = doc.body;
  
  if (!body || !body.hasChildNodes()) {
    return 'Empty template - no specific formatting required.';
  }

  const instructions: string[] = [];
  const elementOrder: string[] = [];
  let elementIndex = 0;

  // Track formatting patterns
  const formatPatterns = {
    fonts: new Set<string>(),
    sizes: new Set<string>(),
    alignments: new Set<string>(),
    colors: new Set<string>(),
    hasIndentation: false,
    hasBold: false,
    hasItalic: false,
    hasUnderline: false,
  };

  // Helper to extract inline styles from an element
  const extractStyles = (element: Element): { font?: string; size?: string; color?: string; align?: string; indent?: string } => {
    const style = element.getAttribute('style') || '';
    const result: { font?: string; size?: string; color?: string; align?: string; indent?: string } = {};
    
    const fontMatch = style.match(/font-family:\s*([^;]+)/i);
    if (fontMatch) result.font = fontMatch[1].trim();
    
    const sizeMatch = style.match(/font-size:\s*([^;]+)/i);
    if (sizeMatch) result.size = sizeMatch[1].trim();
    
    const colorMatch = style.match(/color:\s*([^;]+)/i);
    if (colorMatch) result.color = colorMatch[1].trim();
    
    const alignMatch = style.match(/text-align:\s*([^;]+)/i);
    if (alignMatch) result.align = alignMatch[1].trim();
    
    const indentMatch = style.match(/text-indent:\s*([^;]+)/i);
    if (indentMatch) {
      result.indent = indentMatch[1].trim();
      formatPatterns.hasIndentation = true;
    }
    
    if (result.font) formatPatterns.fonts.add(result.font);
    if (result.size) formatPatterns.sizes.add(result.size);
    if (result.color) formatPatterns.colors.add(result.color);
    if (result.align) formatPatterns.alignments.add(result.align);
    
    return result;
  };

  // Helper to describe an element's formatting
  const describeElement = (element: Element, label: string): string => {
    const styles = extractStyles(element);
    const parts: string[] = [label];
    
    if (styles.align) parts.push(`aligned ${styles.align}`);
    if (styles.font) parts.push(`font: ${styles.font}`);
    if (styles.size) parts.push(`size: ${styles.size}`);
    if (styles.color) parts.push(`color: ${styles.color}`);
    if (styles.indent) parts.push(`first-line indent: ${styles.indent}`);
    
    // Check for bold/italic in children
    if (element.querySelector('strong, b')) {
      parts.push('bold');
      formatPatterns.hasBold = true;
    }
    if (element.querySelector('em, i')) {
      parts.push('italic');
      formatPatterns.hasItalic = true;
    }
    if (element.querySelector('u')) {
      parts.push('underline');
      formatPatterns.hasUnderline = true;
    }
    
    return parts.join(', ');
  };

  // Process each child element in order
  const processElement = (element: Element) => {
    elementIndex++;
    const tagName = element.tagName.toLowerCase();
    const textContent = element.textContent?.trim().slice(0, 50) || '';
    const textPreview = textContent.length >= 50 ? textContent + '...' : textContent;

    switch (tagName) {
      case 'h1':
        elementOrder.push(`${elementIndex}. HEADING 1 (Title): "${textPreview}" - ${describeElement(element, 'H1')}`);
        break;
      case 'h2':
        elementOrder.push(`${elementIndex}. HEADING 2 (Section): "${textPreview}" - ${describeElement(element, 'H2')}`);
        break;
      case 'h3':
        elementOrder.push(`${elementIndex}. HEADING 3 (Subsection): "${textPreview}" - ${describeElement(element, 'H3')}`);
        break;
      case 'h4':
      case 'h5':
      case 'h6':
        elementOrder.push(`${elementIndex}. HEADING ${tagName.slice(1)}: "${textPreview}" - ${describeElement(element, tagName.toUpperCase())}`);
        break;
      case 'p':
        const pStyles = extractStyles(element);
        if (pStyles.align === 'center') {
          elementOrder.push(`${elementIndex}. CENTERED PARAGRAPH: "${textPreview}" - ${describeElement(element, 'paragraph')}`);
        } else {
          elementOrder.push(`${elementIndex}. PARAGRAPH: "${textPreview}" - ${describeElement(element, 'paragraph')}`);
        }
        break;
      case 'ul':
        elementOrder.push(`${elementIndex}. BULLET LIST - ${describeElement(element, 'unordered list')}`);
        break;
      case 'ol':
        elementOrder.push(`${elementIndex}. NUMBERED LIST - ${describeElement(element, 'ordered list')}`);
        break;
      case 'blockquote':
        elementOrder.push(`${elementIndex}. BLOCKQUOTE: "${textPreview}" - ${describeElement(element, 'blockquote')}`);
        break;
      case 'hr':
        elementOrder.push(`${elementIndex}. HORIZONTAL RULE (divider)`);
        break;
      default:
        if (textContent) {
          elementOrder.push(`${elementIndex}. ${tagName.toUpperCase()}: "${textPreview}"`);
        }
    }
  };

  // Process all top-level elements
  Array.from(body.children).forEach(child => processElement(child));

  // Build the instructions string
  instructions.push('## TEMPLATE STRUCTURE (follow this order exactly):\n');
  instructions.push(...elementOrder);

  // Add general formatting rules
  instructions.push('\n## FORMATTING RULES TO APPLY:\n');
  
  if (formatPatterns.fonts.size > 0) {
    const mainFont = Array.from(formatPatterns.fonts)[0];
    instructions.push(`- Font Family: Use "${mainFont}" for all text`);
  }
  
  if (formatPatterns.sizes.size > 0) {
    const sizes = Array.from(formatPatterns.sizes);
    if (sizes.length === 1) {
      instructions.push(`- Font Size: Use ${sizes[0]} for all text`);
    } else {
      instructions.push(`- Font Sizes: ${sizes.join(', ')} (apply as shown in structure)`);
    }
  }
  
  if (formatPatterns.alignments.size > 0) {
    instructions.push(`- Text Alignments: ${Array.from(formatPatterns.alignments).join(', ')} (apply as shown in structure)`);
  }
  
  if (formatPatterns.hasIndentation) {
    instructions.push(`- Paragraph Indentation: Apply first-line indent to body paragraphs`);
  }
  
  if (formatPatterns.hasBold || formatPatterns.hasItalic || formatPatterns.hasUnderline) {
    const styles: string[] = [];
    if (formatPatterns.hasBold) styles.push('bold');
    if (formatPatterns.hasItalic) styles.push('italic');
    if (formatPatterns.hasUnderline) styles.push('underline');
    instructions.push(`- Text Styles Used: ${styles.join(', ')}`);
  }

  return instructions.join('\n');
}

// System prompts are now in src/prompts/ module
// See: src/prompts/models/claude.ts, grok.ts, minimax.ts for model-specific prompts
// See: src/prompts/builder.ts for prompt composition logic

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
  const [personaSettings, setPersonaSettings] = useState<PersonaSettings | null>(() => {
    return loadPersona();
  });
  const [ghostModeEnabled, setGhostModeEnabled] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(GHOST_MODE_STORAGE_KEY);
      return stored === 'true';
    } catch {
      return false;
    }
  });
  const [templates, setTemplates] = useState<EssayTemplate[]>(() => getAllTemplates());
  const [selectedTemplate, setSelectedTemplate] = useState<EssayTemplate | null>(null);

  // Plan mode state
  const [currentTodos, setCurrentTodos] = useState<Todo[]>([]);
  const [pendingQuestion, setPendingQuestion] = useState<UserQuestionRequest | null>(null);
  const questionResolverRef = useRef<((response: UserQuestionResponse) => void) | null>(null);

  // Calculate todo progress
  const todoProgress = {
    total: currentTodos.length,
    completed: currentTodos.filter(t => t.status === 'completed').length,
    percentage: currentTodos.length > 0
      ? Math.round((currentTodos.filter(t => t.status === 'completed').length / currentTodos.length) * 100)
      : 0,
  };

  // Answer a pending user question
  const answerQuestion = useCallback((questionId: string, selectedOptions: string[]) => {
    if (questionResolverRef.current && pendingQuestion?.questionId === questionId) {
      const response: UserQuestionResponse = {
        questionId,
        selectedOptions,
        timestamp: Date.now(),
      };
      questionResolverRef.current(response);
      questionResolverRef.current = null;
      setPendingQuestion(null);
    }
  }, [pendingQuestion]);

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

  // Save persona settings to localStorage
  useEffect(() => {
    savePersona(personaSettings);
  }, [personaSettings]);

  // Save ghost mode state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(GHOST_MODE_STORAGE_KEY, ghostModeEnabled.toString());
    } catch {
      // Storage unavailable
    }
  }, [ghostModeEnabled]);

  // Update persona settings
  const updatePersona = useCallback((settings: PersonaSettings | null) => {
    setPersonaSettings(settings);
  }, []);

  // Toggle ghost mode
  const toggleGhostMode = useCallback(() => {
    setGhostModeEnabled(prev => !prev);
  }, []);

  // Save current document as a template
  const saveAsTemplate = useCallback((name: string, editorRef: React.RefObject<TiptapEditorHandle | null>) => {
    if (!editorRef.current) return;
    
    const htmlContent = editorRef.current.getHTML();
    const formattingInstructions = generateTemplateInstructions(htmlContent);
    
    const newTemplate: EssayTemplate = {
      id: crypto.randomUUID(),
      name,
      type: 'custom',
      htmlContent,
      formattingInstructions,
      createdAt: Date.now(),
    };
    
    const customTemplates = loadCustomTemplates();
    const updatedCustomTemplates = [...customTemplates, newTemplate];
    saveCustomTemplates(updatedCustomTemplates);
    
    // Update templates state to include the new template
    setTemplates(getAllTemplates());
    
    return newTemplate;
  }, []);

  // Delete a custom template
  const deleteTemplate = useCallback((templateId: string) => {
    // Can't delete preset templates
    if (templateId.startsWith('preset-')) return;
    
    const customTemplates = loadCustomTemplates();
    const filtered = customTemplates.filter(t => t.id !== templateId);
    saveCustomTemplates(filtered);
    
    // Update templates state
    setTemplates(getAllTemplates());
    
    // Clear selected template if it was deleted
    if (selectedTemplate?.id === templateId) {
      setSelectedTemplate(null);
    }
  }, [selectedTemplate]);

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

  const clearChat = useCallback(() => {
    setDocuments(prev => prev.map(doc =>
      doc.id === activeDocId
        ? { ...doc, chatMessages: [], updatedAt: Date.now() }
        : doc
    ));
    setError(null);
  }, [activeDocId]);

  // Send a chat message using the agent system
  const sendMessage = useCallback(async (
    content: string,
    editorRef: React.RefObject<TiptapEditorHandle | null>,
    mode: ChatMode = 'edit',
    preSearchResults?: SearchResult[]
  ) => {
    console.log('[AgentSystem] sendMessageWithAgent called', { mode, hasPreSearchResults: !!preSearchResults });
    if (!content.trim() || isLoading || !activeDocument) {
      return;
    }

    const shouldGenerateTitle = activeDocument.title === 'Untitled document' && activeDocument.chatMessages.length === 0;
    const originalUserMessage = content.trim();

    editorRefStore.current = editorRef.current;

    const userMessage: DocChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      parts: [{ type: 'text', content: content.trim() }],
      timestamp: Date.now(),
    };

    const assistantMessageId = crypto.randomUUID();
    streamingChatRef.current = '';

    // Add user message
    setDocuments(prev => prev.map(doc =>
      doc.id === activeDocId
        ? { ...doc, chatMessages: [...doc.chatMessages, userMessage], updatedAt: Date.now() }
        : doc
    ));

    setIsLoading(true);
    setError(null);

    // Create abort controller
    abortControllerRef.current = new AbortController();

    // Build context for the agent
    const documentContext = editorRef.current?.getText() || activeDocument.content;

    // Detect plan mode for essay writing (needed for prompt context)
    const planDetection = detectPlanMode(content);
    const usePlanMode = mode === 'edit' && planDetection.shouldUsePlanMode;

    // Build current date string
    const today = new Date();
    const currentDate = today.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Extract document styling
    let stylingContext = '';
    if (editorRef.current) {
      const stylingInfo = extractDocumentStyling(editorRef.current);
      stylingContext = formatStylingForAI(stylingInfo);
    }

    // Build model-specific system prompt using new prompts system
    const promptContext: PromptContext = {
      modelId: selectedModel,
      mode,
      persona: personaSettings as PromptPersonaSettings | null,
      documentTitle: activeDocument.title,
      documentContent: documentContext || '(empty document)',
      documentStyling: stylingContext || undefined,
      searchResults: preSearchResults?.map(r => ({
        title: r.title,
        url: r.url,
        snippet: r.snippet,
        publishedDate: r.publishedDate,
        author: r.author,
      })),
      template: selectedTemplate || undefined,
      currentDate,
      planModeInstructions: usePlanMode ? getPlanModeInstructions() : undefined,
    };

    const systemContent = buildSystemPrompt(promptContext);

    // Create placeholder assistant message
    const assistantMessage: DocChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      parts: [],  // Parts will be populated as the agent streams
      timestamp: Date.now(),
      isStreaming: true,
    };

    setDocuments(prev => prev.map(doc =>
      doc.id === activeDocId
        ? { ...doc, chatMessages: [...doc.chatMessages, assistantMessage], updatedAt: Date.now() }
        : doc
    ));

    // Create agent config based on mode and plan detection
    let presetKey = getPresetForMode(mode);
    if (usePlanMode) {
      presetKey = 'essay_planner';
    }

    const agentConfig = createAgentConfig(presetKey, {
      model: selectedModel,
      systemPrompt: systemContent,
    });

    // Create session for the agent
    const agentSession = {
      id: crypto.randomUUID(),
      agentConfig,
      messages: [] as import('../agent/types').Message[],
      todos: [] as import('../agent/types').Todo[],
      status: 'active' as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Status update handler - now just logs, actual status is derived from parts
    const handleStatusUpdate = (status: ToolStatus) => {
      console.log('[AgentSystem] Tool status:', status);
      // Status is now derived from message parts in the UI
      // The parts themselves are updated via onMessageUpdate
    };

    try {
      // Run the agent loop
      const result = await runAgentLoop({
        session: agentSession,
        userMessage: content.trim(),
        editor: editorRef.current ?? null,
        document: activeDocument ? { id: activeDocument.id, title: activeDocument.title, content: documentContext || '' } : null,
        template: selectedTemplate ?? null,
        systemPrompt: systemContent,
        onStatusUpdate: handleStatusUpdate,
        onMessageUpdate: (message) => {
          console.log('[AgentSystem] Message update:', message.role, 'parts:', message.parts.length);
          // Sync parts from agent message to DocChatMessage
          setDocuments(prev => prev.map(doc =>
            doc.id === activeDocId
              ? {
                  ...doc,
                  chatMessages: doc.chatMessages.map(m =>
                    m.id === assistantMessageId
                      ? { ...m, parts: [...message.parts], isStreaming: true }
                      : m
                  ),
                  updatedAt: Date.now()
                }
              : doc
          ));
          // Update todos from session when message updates
          if (agentSession.todos.length > 0) {
            setCurrentTodos([...agentSession.todos]);
          }
        },
        onTokenReceived: (token: string) => {
          // Token streaming is now handled via onMessageUpdate
          // The Loop.ts already updates text parts as tokens arrive
          streamingChatRef.current += token;
        },
        // Handle ask_user tool - pause loop and wait for user response
        onUserQuestionRequest: async (request) => {
          return new Promise<UserQuestionResponse>((resolve) => {
            setPendingQuestion(request);
            questionResolverRef.current = resolve;
          });
        },
        abortSignal: abortControllerRef.current.signal,
      });

      console.log('[AgentSystem] Agent loop completed', { success: result.success, followUpCount: result.followUpCount });

      // Save final document content
      let documentTextContent = '';
      if (editorRefStore.current) {
        const finalContent = editorRefStore.current.getHTML();
        documentTextContent = editorRefStore.current.getText();
        setDocuments(prev => prev.map(doc =>
          doc.id === activeDocId
            ? { ...doc, content: finalContent, updatedAt: Date.now() }
            : doc
        ));
      }

      // Mark message as complete (no longer streaming)
      // Parts are already synced via onMessageUpdate, just need to clear isStreaming
      setDocuments(prev => prev.map(doc =>
        doc.id === activeDocId
          ? {
              ...doc,
              chatMessages: doc.chatMessages.map(m =>
                m.id === assistantMessageId
                  ? { ...m, parts: [...result.message.parts], isStreaming: false }
                  : m
              ),
              updatedAt: Date.now()
            }
          : doc
      ));

      // Generate title if needed
      if (shouldGenerateTitle && documentTextContent.trim()) {
        try {
          const aiTitle = await generateTitle(originalUserMessage, documentTextContent);
          if (aiTitle && aiTitle !== 'Untitled Document') {
            setDocuments(prev => prev.map(doc =>
              doc.id === activeDocId
                ? { ...doc, title: aiTitle, updatedAt: Date.now() }
                : doc
            ));
          }
        } catch (titleErr) {
          console.error('[AgentSystem] Error generating title:', titleErr);
          const fallbackTitle = generateTitleFromMessage(originalUserMessage);
          if (fallbackTitle !== 'Untitled document') {
            setDocuments(prev => prev.map(doc =>
              doc.id === activeDocId
                ? { ...doc, title: fallbackTitle, updatedAt: Date.now() }
                : doc
            ));
          }
        }
      }
    } catch (err) {
      console.error('[AgentSystem] Error:', err);
      if (err instanceof Error && err.name === 'AbortError') {
        // User aborted - keep partial response, mark as not streaming
        setDocuments(prev => prev.map(doc =>
          doc.id === activeDocId
            ? {
                ...doc,
                chatMessages: doc.chatMessages.map(m => {
                  if (m.id !== assistantMessageId) return m;
                  // Keep existing parts, add "(stopped)" if no text content
                  const hasText = m.parts.some(p => p.type === 'text' && p.content.trim());
                  const parts = hasText
                    ? m.parts
                    : [...m.parts, { type: 'text' as const, content: '(stopped)' }];
                  return { ...m, parts, isStreaming: false };
                }),
                updatedAt: Date.now()
              }
            : doc
        ));
      } else {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setDocuments(prev => prev.map(doc =>
          doc.id === activeDocId
            ? {
                ...doc,
                chatMessages: doc.chatMessages.filter(m => m.id !== assistantMessageId),
                updatedAt: Date.now()
              }
            : doc
        ));
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [activeDocument, activeDocId, isLoading, selectedModel, personaSettings, selectedTemplate, generateTitleFromMessage]);

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
    isSearching,
    searchResults,
    error,
    selectedModel,
    setSelectedModel,
    personaSettings,
    updatePersona,
    ghostModeEnabled,
    toggleGhostMode,
    templates,
    selectedTemplate,
    setSelectedTemplate,
    saveAsTemplate,
    deleteTemplate,
    createDocument,
    switchDocument,
    updateTitle,
    updateContent,
    deleteDocument,
    sendMessage,
    clearChat,
    stopGeneration,
    performSearch,
    // Plan mode state
    currentTodos,
    todoProgress,
    pendingQuestion,
    answerQuestion,
  };
}
