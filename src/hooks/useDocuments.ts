import { useState, useEffect, useCallback, useRef } from 'react';
import { sendMessageStream, DEFAULT_MODEL } from '../api/openrouter';
import type { ChatMessage, ToolDefinition, ToolCall } from '../api/openrouter';
import type { TiptapEditorHandle } from '../components/TiptapEditor';
import { searchExa, formatSearchResultsForAI, type SearchResult } from '../api/exa';

export type MessageStatus = 'thinking' | 'reading' | 'searching' | 'writing' | 'formatting' | 'done';

export interface DocChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  status?: MessageStatus;
  statusDetail?: string; // e.g., "Searching for 'climate change'..."
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
}

export interface EssayTemplate {
  id: string;
  name: string;
  type: 'preset' | 'custom';
  htmlContent: string;           // Full HTML of the template document
  formattingInstructions: string; // AI-readable formatting guide extracted from the doc
  createdAt: number;
}

const STORAGE_KEY = 'homework-documents';
const MODEL_STORAGE_KEY = 'homework-selected-model';
const PERSONA_STORAGE_KEY = 'homework-persona-settings';
const GHOST_MODE_STORAGE_KEY = 'homework-ghost-mode';
const TEMPLATES_STORAGE_KEY = 'homework-essay-templates';

// ==================== TOOL DEFINITIONS ====================

const DOCUMENT_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'read_document',
      description: 'Read and analyze the current document content. You MUST call this before making any edits to understand what exists in the document.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          focus: {
            type: 'string',
            description: 'What aspect to focus on: "full" for entire document, or describe specific section/element to analyze (e.g., "introduction", "formatting", "conclusion").',
          },
        },
        required: ['focus'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_content',
      description: 'Append content to the end of the document. Use this to add new text, paragraphs, or sections. Content will be added after any existing content.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'The text content to add to the document. Use newlines for paragraphs. Do not use markdown - plain text only.',
          },
        },
        required: ['content'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'clear_document',
      description: 'Clear all content from the document. ONLY use this if the document has existing content that needs to be replaced. Do NOT call this on an empty document.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_text',
      description: 'Find specific text in the document and replace it with new text. Use for targeted edits to existing content.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          find_text: {
            type: 'string',
            description: 'The exact text to find and replace in the document.',
          },
          replace_with: {
            type: 'string',
            description: 'The new text to replace the found text with.',
          },
        },
        required: ['find_text', 'replace_with'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'insert_content',
      description: 'Insert content at a specific position in the document.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'The text content to insert.',
          },
          position: {
            type: 'string',
            enum: ['start', 'end', 'before', 'after'],
            description: 'Where to insert: "start" for beginning of document, "end" for end, "before" or "after" a target text.',
          },
          target_text: {
            type: 'string',
            description: 'Required when position is "before" or "after". The text to insert relative to.',
          },
        },
        required: ['content', 'position'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'format_text',
      description: 'Apply formatting to text in the document. Can target specific text or the entire document.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          format_type: {
            type: 'string',
            enum: [
              'bold', 'italic', 'underline', 'strikethrough',
              'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'paragraph',
              'bulletList', 'orderedList', 'blockquote', 'codeBlock',
              'align', 'textColor', 'highlight', 'fontSize', 'fontFamily',
              'textIndent', 'removeFormat', 'link', 'horizontalRule'
            ],
            description: 'The type of formatting to apply.',
          },
          target: {
            type: 'string',
            description: 'The exact text to format, or "all" to format the entire document.',
          },
          value: {
            type: 'string',
            description: 'Value for formatting types that need it: color hex codes for textColor/highlight, alignment value (left/center/right/justify), font size (e.g. "14pt"), font family name, indent value (e.g. "0.5in"), or URL for links.',
          },
        },
        required: ['format_type', 'target'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'indent_body_paragraphs',
      description: 'Apply first-line indent to all body paragraphs in the document. Use this for MLA/APA formatting. Skips header lines (first few lines with name, date, title, etc.) and special sections like Works Cited/References.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          indent_value: {
            type: 'string',
            description: 'The indent value, e.g. "0.5in" for half inch (standard for MLA/APA).',
          },
          skip_lines: {
            type: 'number',
            description: 'Number of lines to skip at the start (header block). For MLA use 5 (name, professor, class, date, title). For APA use 7 (title, name, dept, course, instructor, date, blank line).',
          },
        },
        required: ['indent_value', 'skip_lines'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: 'Search the web for information to include in the document. Use this when writing essays that need citations, researching topics, or finding facts. Returns search results that you should use for citations.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to find relevant information.',
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
];

// ==================== HELPER FUNCTIONS ====================

interface FormatAction {
  type: string;
  target: string;
  value?: string;
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

// Preset APA Format Template (7th Edition)
const APA_TEMPLATE: EssayTemplate = {
  id: 'preset-apa',
  name: 'APA Format (7th Edition)',
  type: 'preset',
  htmlContent: `<p style="text-align: center"><span style="font-family: Times New Roman"><span style="font-size: 12pt"><strong>Title of Your Paper</strong></span></span></p>
<p style="text-align: center"><span style="font-family: Times New Roman"><span style="font-size: 12pt">[Your Name]</span></span></p>
<p style="text-align: center"><span style="font-family: Times New Roman"><span style="font-size: 12pt">[Department], [Institution Name]</span></span></p>
<p style="text-align: center"><span style="font-family: Times New Roman"><span style="font-size: 12pt">[Course Number]: [Class Name]</span></span></p>
<p style="text-align: center"><span style="font-family: Times New Roman"><span style="font-size: 12pt">[Professor's Name]</span></span></p>
<p style="text-align: center"><span style="font-family: Times New Roman"><span style="font-size: 12pt">[Current Date]</span></span></p>
<p><span style="font-family: Times New Roman"><span style="font-size: 12pt"></span></span></p>
<p style="text-indent: 0.5in"><span style="font-family: Times New Roman"><span style="font-size: 12pt">This is the first paragraph of your essay. In APA format, the first line of each paragraph should be indented 0.5 inches. The entire paper should be double-spaced and use Times New Roman 12-point font. Do not add extra space between paragraphs.</span></span></p>
<p style="text-indent: 0.5in"><span style="font-family: Times New Roman"><span style="font-size: 12pt">Continue your essay with additional paragraphs. Each paragraph should develop a specific point and flow logically from one to the next. Remember to cite your sources using in-text citations like (Author, Year) or Author (Year) stated that...</span></span></p>
<p style="text-align: center"><span style="font-family: Times New Roman"><span style="font-size: 12pt"><strong>References</strong></span></span></p>
<p style="text-indent: -0.5in; padding-left: 0.5in"><span style="font-family: Times New Roman"><span style="font-size: 12pt">Author, A. A. (Year). Title of article. <em>Journal Name, Volume</em>(Issue), Page range. https://doi.org/xxxxx</span></span></p>
<p style="text-indent: -0.5in; padding-left: 0.5in"><span style="font-family: Times New Roman"><span style="font-size: 12pt">Author, B. B., & Author, C. C. (Year). <em>Title of book</em>. Publisher.</span></span></p>`,
  formattingInstructions: `## APA FORMAT (7th Edition) TEMPLATE INSTRUCTIONS:

### DOCUMENT STRUCTURE (in order):
1. TITLE - Centered, Bold, Times New Roman 12pt
2. AUTHOR NAME - Centered, Times New Roman 12pt (use [Your Name] if unknown)
3. DEPARTMENT AND INSTITUTION - Centered, Times New Roman 12pt (use [Department], [Institution Name] if unknown)
4. COURSE INFO - Centered, Times New Roman 12pt (use [Course Number]: [Class Name] if unknown)
5. INSTRUCTOR NAME - Centered, Times New Roman 12pt (use [Professor's Name] if unknown)
6. DATE - Centered, Times New Roman 12pt (ALWAYS use current date from system context)
7. BLANK LINE
8. BODY PARAGRAPHS - First-line indent 0.5in, Times New Roman 12pt
9. REFERENCES HEADING - Centered, Bold, Times New Roman 12pt
10. REFERENCE ENTRIES - Hanging indent (first line flush left, subsequent lines indented)

### PERSONAL INFO RULES:
- NEVER make up names, professors, courses, or institutions
- Use placeholders if info not provided: [Your Name], [Professor's Name], [Class Name], [Institution Name]
- ALWAYS use the current date provided in system context for the date field

### FORMATTING RULES:
- Font: Times New Roman, 12pt throughout
- Title: Centered, Bold
- All header info (name, institution, etc.): Centered, NOT bold
- Body paragraphs: Left-aligned with 0.5 inch first-line indent
- References heading: Centered, Bold
- Reference entries: Hanging indent (reverse indent)
- In-text citations: (Author, Year) format
- NEVER use bold text

### REQUIRED TOOL CALLS (in order):
1. format_text with fontFamily="Times New Roman" and target="all"
2. format_text with fontSize="12pt" and target="all"
3. format_text with align="center" for title, author, institution, course, instructor, date lines
4. format_text with bold for title only
5. indent_body_paragraphs with indent_value="0.5in" and skip_lines=7 (skips header block, indents all body paragraphs automatically)
6. format_text with align="center" and bold for References heading`,
  createdAt: 0,
};

// Preset MLA Format Template (9th Edition)
const MLA_TEMPLATE: EssayTemplate = {
  id: 'preset-mla',
  name: 'MLA Format (9th Edition)',
  type: 'preset',
  htmlContent: `<p><span style="font-family: Times New Roman"><span style="font-size: 12pt">[Your Name]</span></span></p>
<p><span style="font-family: Times New Roman"><span style="font-size: 12pt">[Professor's Name]</span></span></p>
<p><span style="font-family: Times New Roman"><span style="font-size: 12pt">[Class Name]</span></span></p>
<p><span style="font-family: Times New Roman"><span style="font-size: 12pt">[Current Date]</span></span></p>
<p style="text-align: center"><span style="font-family: Times New Roman"><span style="font-size: 12pt">Title of Your Essay</span></span></p>
<p style="text-indent: 0.5in"><span style="font-family: Times New Roman"><span style="font-size: 12pt">This is the first paragraph of your essay. In MLA format, the first line of each paragraph should be indented half an inch (0.5 inches). The entire paper should be double-spaced and use Times New Roman 12-point font. The title should be centered but not bold, italicized, or underlined.</span></span></p>
<p style="text-indent: 0.5in"><span style="font-family: Times New Roman"><span style="font-size: 12pt">Continue with your body paragraphs here. Each paragraph should make a clear point and support your thesis. When citing sources, use parenthetical citations with the author's last name and page number, like this (Smith 42). If you mention the author in the sentence, only include the page number: Smith argues that "quote here" (42).</span></span></p>
<p style="text-indent: 0.5in"><span style="font-family: Times New Roman"><span style="font-size: 12pt">Add more paragraphs as needed to develop your argument. Each paragraph should transition smoothly to the next and contribute to your overall thesis.</span></span></p>
<p style="text-align: center"><span style="font-family: Times New Roman"><span style="font-size: 12pt">Works Cited</span></span></p>
<p style="text-indent: -0.5in; padding-left: 0.5in"><span style="font-family: Times New Roman"><span style="font-size: 12pt">Last Name, First Name. "Title of Article." <em>Journal Name</em>, vol. #, no. #, Year, pp. #-#.</span></span></p>
<p style="text-indent: -0.5in; padding-left: 0.5in"><span style="font-family: Times New Roman"><span style="font-size: 12pt">Last Name, First Name. <em>Title of Book</em>. Publisher, Year.</span></span></p>`,
  formattingInstructions: `## MLA FORMAT (9th Edition) TEMPLATE INSTRUCTIONS:

### DOCUMENT STRUCTURE (in order):
1. YOUR NAME - Left-aligned, Times New Roman 12pt (use [Your Name] if unknown)
2. PROFESSOR'S NAME - Left-aligned, Times New Roman 12pt (use [Professor's Name] if unknown)
3. COURSE NAME - Left-aligned, Times New Roman 12pt (use [Class Name] if unknown)
4. DATE - Left-aligned, Times New Roman 12pt (ALWAYS use current date from system context, format: Day Month Year)
5. TITLE - Centered, Times New Roman 12pt, NOT bold/italic/underlined
6. BODY PARAGRAPHS - First-line indent 0.5in, Times New Roman 12pt
7. WORKS CITED HEADING - Centered, Times New Roman 12pt, NOT bold
8. WORKS CITED ENTRIES - Hanging indent (first line flush left, subsequent lines indented)

### PERSONAL INFO RULES:
- NEVER make up names, professors, or courses
- Use placeholders if info not provided: [Your Name], [Professor's Name], [Class Name]
- ALWAYS use the current date provided in system context for the date field

### FORMATTING RULES:
- Font: Times New Roman, 12pt throughout
- Header block (name, professor, course, date): Left-aligned, single info per line
- Title: Centered, NO bold, NO italics, NO underline
- Body paragraphs: Left-aligned with 0.5 inch first-line indent
- Works Cited heading: Centered, NOT bold (unlike APA)
- Works Cited entries: Hanging indent
- In-text citations: (Author Page) format, no comma
- NEVER use bold text

### REQUIRED TOOL CALLS (in order):
1. format_text with fontFamily="Times New Roman" and target="all"
2. format_text with fontSize="12pt" and target="all"
3. format_text with align="center" for title only
4. indent_body_paragraphs with indent_value="0.5in" and skip_lines=5 (skips name, professor, class, date, title - indents all body paragraphs automatically)
5. format_text with align="center" for Works Cited heading`,
  createdAt: 0,
};

// Get all templates (presets + custom)
function getAllTemplates(): EssayTemplate[] {
  const customTemplates = loadCustomTemplates();
  return [APA_TEMPLATE, MLA_TEMPLATE, ...customTemplates];
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

// Convert plain text with line breaks to HTML
// Each line becomes its own paragraph for proper block-level formatting (alignment, indentation)
// This matches word processor behavior where Enter = new paragraph
function textToHtml(text: string): string {
  // Split by any newline(s) - each line becomes its own paragraph
  const lines = text.split(/\n/).filter(line => line.trim());
  
  const result: string[] = [];
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Check if this is a bullet point
    if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
      // Collect consecutive bullet items
      const listItems: string[] = [];
      while (i < lines.length) {
        const currentTrimmed = lines[i].trim();
        if (currentTrimmed.startsWith('•') || currentTrimmed.startsWith('-') || currentTrimmed.startsWith('*')) {
          const cleanItem = currentTrimmed.replace(/^[•\-\*]\s*/, '');
          listItems.push(`<li><p>${cleanItem}</p></li>`);
          i++;
        } else {
          break;
        }
      }
      result.push(`<ul>${listItems.join('')}</ul>`);
      continue;
    }
    
    // Check if this is a numbered list item
    if (/^\d+[\.\)]\s/.test(trimmed)) {
      // Collect consecutive numbered items
      const listItems: string[] = [];
      while (i < lines.length) {
        const currentTrimmed = lines[i].trim();
        if (/^\d+[\.\)]\s/.test(currentTrimmed)) {
          const cleanItem = currentTrimmed.replace(/^\d+[\.\)]\s*/, '');
          listItems.push(`<li><p>${cleanItem}</p></li>`);
          i++;
        } else {
          break;
        }
      }
      result.push(`<ol>${listItems.join('')}</ol>`);
      continue;
    }
    
    // Regular paragraph - each line is its own paragraph
    result.push(`<p>${trimmed}</p>`);
    i++;
  }
  
  return result.join('');
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
    case 'textColor':
    case 'text-color':
    case 'color':
      if (action.value) {
        editor.setTextColor(action.value);
      }
      break;
    case 'highlight':
    case 'highlightColor':
    case 'highlight-color':
    case 'backgroundColor':
    case 'background-color':
      if (action.value) {
        editor.setHighlight(action.value);
      }
      break;
    case 'fontSize':
    case 'font-size':
      if (action.value) {
        editor.setFontSize(action.value);
      }
      break;
    case 'fontFamily':
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
    case 'bulletList':
    case 'bullet-list':
    case 'bullets':
      editor.toggleBulletList();
      break;
    case 'orderedList':
    case 'ordered-list':
    case 'numbered':
    case 'numberList':
    case 'number-list':
      editor.toggleOrderedList();
      break;
    case 'blockquote':
    case 'quote':
      editor.toggleBlockquote();
      break;
    case 'codeBlock':
    case 'code-block':
    case 'code':
      editor.toggleCodeBlock();
      break;
    case 'horizontalRule':
    case 'horizontal-rule':
    case 'hr':
    case 'divider':
      editor.insertHorizontalRule();
      break;
    case 'align':
    case 'textAlign':
    case 'text-align':
      if (action.value) {
        const alignValue = action.value.toLowerCase() as 'left' | 'center' | 'right' | 'justify';
        editor.setTextAlign(alignValue);
      }
      break;
    case 'removeFormat':
    case 'remove-format':
    case 'clearFormat':
    case 'clear-format':
    case 'clear':
      editor.clearFormatting();
      break;
    case 'link':
      if (action.value) {
        editor.setLink(action.value);
      }
      break;
    case 'textIndent':
    case 'text-indent':
    case 'indent':
    case 'firstLineIndent':
    case 'first-line-indent':
      if (action.value) {
        editor.setTextIndent(action.value);
      } else {
        // Default indent is 2em (roughly two character widths, like a tab)
        editor.setTextIndent('2em');
      }
      break;
    case 'removeIndent':
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

// ==================== SYSTEM PROMPT CONFIGURATION ====================
// Edit these once - they apply to both default and persona modes

const PROMPT_CONFIG = {
  // Personal info placeholder rules
  personalInfo: `Use placeholders for unknown details: [Your Name], [Professor's Name], [Class Name], [Institution Name]. Always use the current date from system context.`,

  // Default writing style (used when no persona is active)
  defaultWritingStyle: `
- Vary sentence length dramatically (burstiness). Mix short fragments with long sprawling sentences.
- Hedge: "I think," "probably," "it seems like," "from what I can tell"
- NEVER use em-dashes (—) or en-dashes (–)
- Skip transitions: no "Furthermore," "Moreover," "In conclusion," "Additionally"
- Use first-person opinions naturally
- Be specific, not generic. Cite stats once, then refer loosely.
- Start with facts or questions, not "Throughout history..." or "X has fascinated humans..."
- No meta-commentary: never say "This essay will explore..." or "Let's dive into..."`,

  // Banned words/phrases (applies to default mode, persona mode uses reference style)
  bannedWords: `delve, innovative, captivating, leverage, multifaceted, comprehensive, crucial, foster, landscape, myriad, nuanced, paradigm, plethora, realm, robust, seamless, synergy, tapestry, underscore, utilize, vibrant, vital, pivotal, groundbreaking, cutting-edge, "game-changer", "at its core"`,

  // Workflow rules (applies to both modes)
  workflow: `## RESPONSE STRUCTURE (MANDATORY)
Your responses MUST follow this exact pattern:

RESPONSE 1: Brief acknowledgement (under 20 words), then STOP writing and call your tools.
RESPONSE 2: Brief summary (under 30 words). This is a SEPARATE response after tools complete.

## CRITICAL RULES
- When you make a tool call, your text output ENDS. Do not write more text after calling a tool.
- Acknowledgement and summary are NEVER in the same response - they are separated by tool execution.
- read_document before edits, search_web before citations, clear_document before rewrites

## FORBIDDEN
- Writing text after a tool call in the same response
- Combining acknowledgement + summary in one message
- Repeating yourself or restating what you're doing`,

  // Chat mode base rules
  chatModeRules: `You can see the document but CANNOT edit it. Suggest switching to Edit mode for changes.
Be direct and casual. Skip filler. Hedge sometimes ("I think," "probably"). Vary sentence length. No em-dashes.`,
};

// ==================== GENERATED SYSTEM PROMPTS ====================

const SYSTEM_PROMPT = `You are a document editor assistant with direct tool access.

## Personal Info
${PROMPT_CONFIG.personalInfo}

## Writing Style (Sound Human)
${PROMPT_CONFIG.defaultWritingStyle}

BANNED: ${PROMPT_CONFIG.bannedWords}

## Workflow
${PROMPT_CONFIG.workflow}`;

const CHAT_MODE_SYSTEM_PROMPT = `You're a writing assistant in chat-only mode. ${PROMPT_CONFIG.chatModeRules}

No AI buzzwords (${PROMPT_CONFIG.bannedWords.split(', ').slice(0, 5).join(', ')}, etc.).`;

// Function to generate persona-aware system prompt
function generatePersonaSystemPrompt(persona: PersonaSettings): string {
  return `You are a document editor that writes EXACTLY like the person below. Mimic their vocabulary, sentence patterns, tone, punctuation, and structure precisely.

## Reference Document (mimic this style):
${persona.documentContent}

## Rules
- ${PROMPT_CONFIG.personalInfo}
- Match their formality level, sentence rhythm, and vocabulary exactly. Don't upgrade or downgrade.
- NEVER use em-dashes unless the reference uses them.

## Workflow
${PROMPT_CONFIG.workflow}`;
}

// Function to generate persona-aware chat mode prompt
function generatePersonaChatPrompt(persona: PersonaSettings): string {
  return `Chat-only mode. ${PROMPT_CONFIG.chatModeRules}

Communicate in the style of this reference document:
${persona.documentContent}

Match their tone, vocabulary, and sentence patterns exactly.`;
}

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
  const editorRefStore = useRef<TiptapEditorHandle | null>(null);
  const streamingChatRef = useRef<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);
  const savedScrollPositionRef = useRef<number | null>(null);
  const pendingSearchResultsRef = useRef<SearchResult[] | null>(null);

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

  // Helper to update message status
  const updateMessageStatus = useCallback((
    messageId: string,
    status: MessageStatus,
    statusDetail?: string
  ) => {
    setDocuments(prev => prev.map(doc => 
      doc.id === activeDocId 
        ? { 
            ...doc, 
            chatMessages: doc.chatMessages.map(m => 
              m.id === messageId 
                ? { ...m, status, statusDetail }
                : m
            ),
          }
        : doc
    ));
  }, [activeDocId]);

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

  // Tool execution handler
  const executeToolCall = useCallback(async (
    toolCall: ToolCall,
    assistantId: string,
    currentDate: string
  ): Promise<ChatMessage> => {
    const { name, arguments: argsJson } = toolCall.function;
    let args: Record<string, unknown>;
    
    try {
      args = JSON.parse(argsJson);
    } catch {
      return {
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify({ error: 'Invalid JSON arguments' }),
      };
    }
    
    console.log('[Tool] Executing:', name, args);
    
    const editorRef = editorRefStore.current;
    
    // Status will be updated per-tool in each case below
    
    try {
      switch (name) {
        case 'read_document': {
          const focus = args.focus as string;
          updateMessageStatus(assistantId, 'reading', focus === 'full' ? 'Reading document...' : `Analyzing ${focus}...`);
          
          if (editorRef) {
            const textContent = editorRef.getText();
            const stylingInfo = extractDocumentStyling(editorRef);
            const wordCount = textContent.split(/\s+/).filter(Boolean).length;
            
            return {
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({
                success: true,
                focus,
                content: textContent || '(empty document)',
                word_count: wordCount,
                character_count: textContent.length,
                styling: formatStylingForAI(stylingInfo),
              }),
            };
          }
          return {
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ success: false, error: 'Editor not available' }),
          };
        }
        
        case 'write_content': {
          const content = args.content as string;
          updateMessageStatus(assistantId, 'writing', 'Writing content...');
          if (editorRef) {
            saveScrollPosition();
            const htmlContent = textToHtml(content);
            editorRef.insertContent(htmlContent);
            restoreScrollPosition();
          }
          return {
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ success: true }),
          };
        }

        case 'clear_document': {
          updateMessageStatus(assistantId, 'writing', 'Clearing document...');
          if (editorRef) {
            saveScrollPosition();
            editorRef.clearContent();
            restoreScrollPosition();
          }
          return {
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ success: true }),
          };
        }
        
        case 'edit_text': {
          const findText = args.find_text as string;
          const replaceWith = args.replace_with as string;
          updateMessageStatus(assistantId, 'writing', 'Editing text...');
          
          if (editorRef) {
            const editor = editorRef.getEditor();
            if (editor) {
              saveScrollPosition();
              const doc = editor.state.doc;
              const result = findTextInDocument(doc, findText);
              
              if (result) {
                editor.chain()
                  .focus()
                  .setTextSelection({ from: result.from, to: result.to })
                  .deleteSelection()
                  .insertContent(replaceWith)
                  .run();
                restoreScrollPosition();
                return {
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: JSON.stringify({ success: true }),
                };
              } else {
                return {
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: JSON.stringify({ success: false, error: 'Text not found in document' }),
                };
              }
            }
          }
          return {
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ success: false, error: 'Editor not available' }),
          };
        }
        
        case 'insert_content': {
          const content = args.content as string;
          const position = args.position as 'start' | 'end' | 'before' | 'after';
          const targetText = args.target_text as string | undefined;
          updateMessageStatus(assistantId, 'writing', `Inserting at ${position}...`);
          
          if (editorRef) {
            const editor = editorRef.getEditor();
            if (editor) {
              saveScrollPosition();
              const htmlContent = textToHtml(content);
              
              if (position === 'start') {
                editor.chain().focus().setTextSelection(0).insertContent(htmlContent).run();
              } else if (position === 'end') {
                editorRef.insertContent(htmlContent);
              } else if (position === 'after' && targetText) {
                const doc = editor.state.doc;
                const result = findTextInDocument(doc, targetText);
                if (result) {
                  editor.chain().focus().setTextSelection(result.to).insertContent(htmlContent).run();
                } else {
                  editorRef.insertContent(htmlContent);
                }
              } else if (position === 'before' && targetText) {
                const doc = editor.state.doc;
                const result = findTextInDocument(doc, targetText);
                if (result) {
                  editor.chain().focus().setTextSelection(result.from).insertContent(htmlContent).run();
                } else {
                  editor.chain().focus().setTextSelection(0).insertContent(htmlContent).run();
                }
              }
              restoreScrollPosition();
            }
          }
          return {
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ success: true }),
          };
        }
        
        case 'format_text': {
          const formatType = args.format_type as string;
          const target = args.target as string;
          const value = args.value as string | undefined;
          updateMessageStatus(assistantId, 'formatting', `Applying ${formatType}...`);
          
          if (editorRef) {
            saveScrollPosition();
            const action: FormatAction = {
              type: formatType,
              target: target,
              value: value,
            };
            const success = applyFormatting(editorRef, action);
            restoreScrollPosition();
            return {
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({ success, error: success ? undefined : 'Failed to apply formatting' }),
            };
          }
          return {
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ success: false, error: 'Editor not available' }),
          };
        }
        
        case 'indent_body_paragraphs': {
          const indentValue = args.indent_value as string;
          const skipLines = args.skip_lines as number;
          updateMessageStatus(assistantId, 'formatting', 'Indenting body paragraphs...');

          if (editorRef) {
            const editor = editorRef.getEditor();
            if (editor) {
              saveScrollPosition();

              // Get all paragraph nodes and their positions
              const doc = editor.state.doc;
              const paragraphsToIndent: { from: number; to: number }[] = [];
              let paragraphIndex = 0;

              // Special section markers to skip (Works Cited, References, etc.)
              const skipMarkers = ['works cited', 'references', 'bibliography'];
              let inSkipSection = false;

              doc.descendants((node, pos) => {
                if (node.type.name === 'paragraph') {
                  const text = node.textContent.toLowerCase().trim();

                  // Check if we're entering a skip section
                  if (skipMarkers.some(marker => text === marker)) {
                    inSkipSection = true;
                  }

                  // Skip header lines, empty paragraphs, and skip sections
                  if (paragraphIndex >= skipLines && node.textContent.trim() && !inSkipSection) {
                    paragraphsToIndent.push({ from: pos, to: pos + node.nodeSize });
                  }

                  paragraphIndex++;
                }
                return true;
              });

              // Apply indent to each paragraph (in reverse to preserve positions)
              for (let i = paragraphsToIndent.length - 1; i >= 0; i--) {
                const { from, to } = paragraphsToIndent[i];
                editor.chain()
                  .focus()
                  .setTextSelection({ from, to })
                  .run();
                editorRef.setTextIndent(indentValue);
              }

              // Move cursor to end
              editor.commands.focus('end');
              restoreScrollPosition();

              return {
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  success: true,
                  paragraphs_indented: paragraphsToIndent.length,
                  skipped_header_lines: skipLines,
                }),
              };
            }
          }
          return {
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ success: false, error: 'Editor not available' }),
          };
        }

        case 'search_web': {
          const query = args.query as string;
          updateMessageStatus(assistantId, 'searching', `Searching for "${query.slice(0, 50)}${query.length > 50 ? '...' : ''}"...`);
          
          setIsSearching(true);
          try {
            const results = await searchExa(query);
            setSearchResults(results);
            pendingSearchResultsRef.current = results;
            
            // Format results for the model
            const formattedResults = formatSearchResultsForAI(results);
            
            return {
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({
                success: true,
                results_count: results.length,
                results: formattedResults,
                current_date: currentDate,
              }),
            };
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Search failed';
            return {
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({ success: false, error: message }),
            };
          } finally {
            setIsSearching(false);
          }
        }
        
        default:
          return {
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: `Unknown tool: ${name}` }),
          };
      }
    } finally {
      // Status is managed per-tool call, no cleanup needed here
    }
  }, [activeDocId, saveScrollPosition, restoreScrollPosition, updateMessageStatus]);

  // Send a chat message with tool calling capability
  const sendMessage = useCallback(async (
    content: string, 
    editorRef: React.RefObject<TiptapEditorHandle | null>, 
    mode: ChatMode = 'edit', 
    preSearchResults?: SearchResult[]
  ) => {
    console.log('[Chat] sendMessage called', { mode, hasPreSearchResults: !!preSearchResults, isLoading, hasActiveDocument: !!activeDocument });
    if (!content.trim() || isLoading || !activeDocument) {
      console.log('[Chat] sendMessage early return', { emptyContent: !content.trim(), isLoading, noActiveDocument: !activeDocument });
      return;
    }

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

    // Use an object so assistantId can be updated when follow-up calls create new messages
    const messageState = {
      assistantId: crypto.randomUUID(),
      firstTokenReceived: false,
    };
    streamingChatRef.current = '';
    pendingSearchResultsRef.current = null;

    // Add user message
    setDocuments(prev => prev.map(doc => 
      doc.id === activeDocId 
        ? { ...doc, chatMessages: [...doc.chatMessages, userMessage], updatedAt: Date.now() }
        : doc
    ));

    console.log('[Chat] Setting isLoading=true, starting stream');
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
    
    // Choose system prompt based on persona settings
    let basePrompt: string;
    if (personaSettings && personaSettings.documentContent) {
      // Use persona-aware prompts
      basePrompt = mode === 'edit' 
        ? generatePersonaSystemPrompt(personaSettings) 
        : generatePersonaChatPrompt(personaSettings);
    } else {
      // Use default prompts
      basePrompt = mode === 'edit' ? SYSTEM_PROMPT : CHAT_MODE_SYSTEM_PROMPT;
    }
    
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
    
    // Add template context if a template is selected
    if (selectedTemplate) {
      systemContent += `\n\n## TEMPLATE TO FOLLOW (CRITICAL)

You MUST follow this template exactly when writing. Match the structure, formatting, fonts, sizes, alignment, and spacing.

### Template: ${selectedTemplate.name}

${selectedTemplate.formattingInstructions}

CRITICAL INSTRUCTIONS:
1. Follow the EXACT structure shown in the formatting instructions above
2. Use format_text tool calls to apply fonts, sizes, and alignments EXACTLY as specified
3. Write content first, then apply formatting using the tool calls
4. Replace placeholder text with actual content while applying the exact formatting specified`;
    }
    
    const systemMessage: ChatMessage = {
      role: 'system' as const,
      content: systemContent,
    };

    // Create placeholder for streaming message
    const assistantMessage: DocChatMessage = {
      id: messageState.assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'thinking',
      statusDetail: 'Thinking...',
    };

    setDocuments(prev => prev.map(doc => 
      doc.id === activeDocId 
        ? { ...doc, chatMessages: [...doc.chatMessages, assistantMessage], updatedAt: Date.now() }
        : doc
    ));

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    // Determine which tools to use based on mode
    const tools = mode === 'edit' ? DOCUMENT_TOOLS : undefined;
    
    console.log('[Stream] Starting stream with model:', selectedModel, 'mode:', mode, 'tools:', tools?.length || 0);
    await sendMessageStream(
      [systemMessage, ...chatHistory],
      {
        onToken: (token: string) => {
          streamingChatRef.current += token;
          messageState.firstTokenReceived = true;
          
          // Trim leading/trailing whitespace for display
          const displayContent = streamingChatRef.current.trim();
          
          // Only update content, don't touch status - let tool executions control that
          setDocuments(prev => prev.map(doc => 
            doc.id === activeDocId 
              ? { 
                  ...doc, 
                  chatMessages: doc.chatMessages.map(m => 
                    m.id === messageState.assistantId 
                      ? { ...m, content: displayContent }
                      : m
                  ),
                  updatedAt: Date.now() 
                }
              : doc
          ));
        },
        onToolCalls: async (toolCalls: ToolCall[]) => {
          console.log('[Stream] Tool calls received:', toolCalls.length);
          
          // Execute each tool call and collect results
          const toolResults: ChatMessage[] = [];
          for (const toolCall of toolCalls) {
            const result = await executeToolCall(toolCall, messageState.assistantId, currentDate);
            toolResults.push(result);
          }
          
          // Update status after searches complete
          const hadSearches = toolCalls.some(tc => tc.function.name === 'search_web');
          if (hadSearches) {
            updateMessageStatus(messageState.assistantId, 'thinking', 'Research done');
          }
          
          return toolResults;
        },
        onFollowUp: () => {
          console.log('[Stream] Follow-up starting');
          
          // Check if current message has content
          const currentContent = streamingChatRef.current.trim();
          
          if (currentContent) {
            // Current message has content - mark it done and create a new message
            console.log('[Stream] Current message has content, creating new bubble');
            
            setDocuments(prev => prev.map(doc => 
              doc.id === activeDocId 
                ? { 
                    ...doc, 
                    chatMessages: doc.chatMessages.map(m => 
                      m.id === messageState.assistantId 
                        ? { ...m, status: 'done' as const, statusDetail: undefined }
                        : m
                    ),
                    updatedAt: Date.now() 
                  }
                : doc
            ));
            
            // Create a new message for the follow-up response
            const newAssistantId = crypto.randomUUID();
            messageState.assistantId = newAssistantId;
            streamingChatRef.current = '';
            messageState.firstTokenReceived = false;
            
            const newAssistantMessage: DocChatMessage = {
              id: newAssistantId,
              role: 'assistant',
              content: '',
              timestamp: Date.now(),
              status: 'thinking',
              statusDetail: 'Working...',
            };
            
            setDocuments(prev => prev.map(doc => 
              doc.id === activeDocId 
                ? { 
                    ...doc, 
                    chatMessages: [...doc.chatMessages, newAssistantMessage],
                    updatedAt: Date.now() 
                  }
                : doc
            ));
          } else {
            // Current message has no content - just reset and continue using it
            // Don't update status here - let the tool execution status updates come through
            console.log('[Stream] Current message is empty, reusing same bubble');
            streamingChatRef.current = '';
            messageState.firstTokenReceived = false;
          }
        },
        onComplete: async () => {
          console.log('[Stream] onComplete called');
          try {
            // Save final document content
            console.log('[Stream] Saving final document content');
            try {
              if (editorRefStore.current) {
                const finalContent = editorRefStore.current.getHTML();
                setDocuments(prev => prev.map(doc => 
                  doc.id === activeDocId 
                    ? { ...doc, content: finalContent, updatedAt: Date.now() }
                    : doc
                ));
              }
            } catch (editorErr) {
              console.error('[Stream] Error saving document content:', editorErr);
            }
            
            // Mark complete
            console.log('[Stream] Marking complete');
            const finalContent = streamingChatRef.current.trim();
            setDocuments(prev => prev.map(doc => 
              doc.id === activeDocId 
                ? { 
                    ...doc, 
                    chatMessages: doc.chatMessages.map(m => 
                      m.id === messageState.assistantId 
                        ? { ...m, content: finalContent, status: 'done' as const, statusDetail: undefined }
                        : m
                    ),
                    updatedAt: Date.now() 
                  }
                : doc
            ));
          } catch (err) {
            console.error('[Stream] Error in onComplete handler:', err);
          } finally {
            console.log('[Stream] onComplete finally - setting isLoading=false');
            setIsLoading(false);
            abortControllerRef.current = null;
          }
        },
        onError: async (err) => {
          console.log('[Stream] onError called', { 
            errorName: err.name, 
            errorMessage: err.message,
          });
          try {
            // Don't show error or remove message if it was aborted by user
            if (err.name === 'AbortError') {
              console.log('[Stream] User aborted - keeping partial response');
              // Keep the partial response, just mark as complete
              setDocuments(prev => prev.map(doc => 
                doc.id === activeDocId 
                  ? { 
                      ...doc, 
                      chatMessages: doc.chatMessages.map(m => 
                        m.id === messageState.assistantId 
                          ? { ...m, content: streamingChatRef.current || '(stopped)', status: 'done' as const, statusDetail: undefined }
                          : m
                      ),
                      updatedAt: Date.now() 
                    }
                  : doc
              ));
            } else {
              console.log('[Stream] Actual error - removing message and showing error');
              setError(err.message);
              setDocuments(prev => prev.map(doc => 
                doc.id === activeDocId 
                  ? { 
                      ...doc, 
                      chatMessages: doc.chatMessages.filter(m => m.id !== messageState.assistantId),
                      updatedAt: Date.now() 
                    }
                  : doc
              ));
            }
          } catch (handlerErr) {
            console.error('[Stream] Error in onError handler:', handlerErr);
          } finally {
            console.log('[Stream] onError finally - setting isLoading=false');
            setIsLoading(false);
            abortControllerRef.current = null;
          }
        },
      },
      selectedModel,
      abortControllerRef.current.signal,
      tools,
      tools ? 'auto' : undefined // Enable tool_choice when tools are available
    );
    console.log('[Stream] sendMessageStream returned - isLoading should now be false');
  }, [activeDocument, activeDocId, isLoading, selectedModel, personaSettings, selectedTemplate, generateTitleFromMessage, executeToolCall]);

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
  };
}
