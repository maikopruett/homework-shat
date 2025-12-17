import { useState, useEffect, useCallback, useRef } from 'react';
import { generateTitle, DEFAULT_MODEL } from '../api/openrouter';
import type { TiptapEditorHandle } from '../components/TiptapEditor';
import { searchExa, formatSearchResultsForAI, type SearchResult } from '../api/exa';

// Agent system imports
import { runAgentLoop } from '../agent/Loop';
import { createAgentConfig, getPresetForMode } from '../agent/Agent';
import type { ToolStatus, Todo, UserQuestionRequest, UserQuestionResponse } from '../agent/types';
import { detectPlanMode, getPlanModeInstructions } from '../agent/planDetector';

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
  firstName: string;
  lastName: string;
  teacherName: string;
  className: string;
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

// ==================== HELPER FUNCTIONS ====================

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
  workflow: `<response_format>
Call tools silently. After all tools complete, provide ONE brief summary (under 20 words).
No acknowledgement before tools. No narration during tools. Just the final result.
</response_format>

<rules>
- read_document before edits, search_web before citations, clear_document before rewrites
- Output ONLY the final summary after tools complete - nothing before or during
</rules>

<forbidden>
- No "Got it", "Sure", "I'll", or any acknowledgement before tools
- No "Thinking...", "Working...", "Proceeding..." status narration
- No text output until all tool calls are complete
</forbidden>`,

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

// Helper to build student info section for prompts
function buildStudentInfoSection(persona: PersonaSettings): string {
  const hasStudentInfo = persona.firstName || persona.lastName || persona.teacherName || persona.className;
  if (!hasStudentInfo) return '';

  const fullName = `${persona.firstName || ''} ${persona.lastName || ''}`.trim();
  let section = '\n## Student Information\n';
  section += `- Student Name: ${fullName || '[Your Name]'}\n`;
  if (persona.teacherName) {
    section += `- Teacher/Professor: ${persona.teacherName}\n`;
  }
  if (persona.className) {
    section += `- Class: ${persona.className}\n`;
  }
  section += '\nWhen writing essays, use this student\'s actual name and class information instead of placeholders.\n';
  return section;
}

// Function to generate persona-aware system prompt
function generatePersonaSystemPrompt(persona: PersonaSettings): string {
  const studentInfo = buildStudentInfoSection(persona);

  return `You are a document editor that writes EXACTLY like the person below. Mimic their vocabulary, sentence patterns, tone, punctuation, and structure precisely.
${studentInfo}
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
  const studentInfo = buildStudentInfoSection(persona);

  return `Chat-only mode. ${PROMPT_CONFIG.chatModeRules}
${studentInfo}
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
      content: content.trim(),
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

    // Choose system prompt based on persona
    let basePrompt: string;
    if (personaSettings && personaSettings.documentContent) {
      basePrompt = mode === 'edit'
        ? generatePersonaSystemPrompt(personaSettings)
        : generatePersonaChatPrompt(personaSettings);
    } else {
      basePrompt = mode === 'edit' ? SYSTEM_PROMPT : CHAT_MODE_SYSTEM_PROMPT;
    }

    const today = new Date();
    const currentDate = today.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    let stylingContext = '';
    if (editorRef.current) {
      const stylingInfo = extractDocumentStyling(editorRef.current);
      stylingContext = formatStylingForAI(stylingInfo);
    }

    let systemContent = `${basePrompt}\n\nToday's Date: ${currentDate}\n\nDocument Title: "${activeDocument.title}"\n\nCurrent Document Content:\n${documentContext || '(empty document)'}\n\n${stylingContext}`;

    if (preSearchResults && preSearchResults.length > 0) {
      const formattedResults = formatSearchResultsForAI(preSearchResults);
      systemContent += `\n\n## Research Results (use these for citations):\n${formattedResults}\n\nIMPORTANT: Use the research results above to support your writing with accurate information and proper citations. Include URLs when citing sources. For "Accessed" dates in citations, use today's date: ${currentDate}.`;
    }

    if (selectedTemplate) {
      systemContent += `\n\n## TEMPLATE TO FOLLOW (CRITICAL)\n\nYou MUST follow this template exactly when writing. Match the structure, formatting, fonts, sizes, alignment, and spacing.\n\n### Template: ${selectedTemplate.name}\n\n${selectedTemplate.formattingInstructions}\n\nCRITICAL INSTRUCTIONS:\n1. Follow the EXACT structure shown in the formatting instructions above\n2. Use format_text tool calls to apply fonts, sizes, and alignments EXACTLY as specified\n3. Write content first, then apply formatting using the tool calls\n4. Replace placeholder text with actual content while applying the exact formatting specified`;
    }

    // Create placeholder assistant message
    const assistantMessage: DocChatMessage = {
      id: assistantMessageId,
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

    // Detect plan mode for essay writing
    const planDetection = detectPlanMode(content);
    const usePlanMode = mode === 'edit' && planDetection.shouldUsePlanMode;

    // Create agent config based on mode and plan detection
    let presetKey = getPresetForMode(mode);
    if (usePlanMode) {
      presetKey = 'essay_planner';
      // Add plan mode instructions to system prompt
      systemContent += '\n\n' + getPlanModeInstructions();
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

    // Status update handler
    const handleStatusUpdate = (status: ToolStatus) => {
      console.log('[AgentSystem] Tool status:', status);
      // Map tool status to message status
      let messageStatus: MessageStatus = 'thinking';
      let statusDetail: string | undefined = status.title;

      if (status.toolId === 'read_document') {
        messageStatus = 'reading';
      } else if (status.toolId === 'search_web') {
        messageStatus = 'searching';
      } else if (status.toolId === 'write_content' || status.toolId === 'edit_text' || status.toolId === 'insert_content') {
        messageStatus = 'writing';
      } else if (status.toolId === 'format_text' || status.toolId === 'indent_body_paragraphs') {
        messageStatus = 'formatting';
      }

      if (status.status === 'completed' || status.status === 'error') {
        messageStatus = 'thinking';
        statusDetail = status.status === 'error' ? `Error: ${status.title}` : undefined;
      }

      setDocuments(prev => prev.map(doc =>
        doc.id === activeDocId
          ? {
              ...doc,
              chatMessages: doc.chatMessages.map(m =>
                m.id === assistantMessageId
                  ? { ...m, status: messageStatus, statusDetail }
                  : m
              ),
              updatedAt: Date.now()
            }
          : doc
      ));
    };

    try {
      // Run the agent loop
      const result = await runAgentLoop({
        session: agentSession,
        userMessage: content.trim(),
        editor: editorRef.current ?? null,
        document: activeDocument ? { id: activeDocument.id, title: activeDocument.title, content: documentContext || '' } : null,
        systemPrompt: systemContent,
        onStatusUpdate: handleStatusUpdate,
        onMessageUpdate: (message) => {
          console.log('[AgentSystem] Message update:', message.role);
          // Update todos from session when message updates
          if (agentSession.todos.length > 0) {
            setCurrentTodos([...agentSession.todos]);
          }
        },
        onTokenReceived: (token: string) => {
          streamingChatRef.current += token;
          const displayContent = streamingChatRef.current.trim();

          setDocuments(prev => prev.map(doc =>
            doc.id === activeDocId
              ? {
                  ...doc,
                  chatMessages: doc.chatMessages.map(m =>
                    m.id === assistantMessageId
                      ? { ...m, content: displayContent }
                      : m
                  ),
                  updatedAt: Date.now()
                }
              : doc
          ));
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

      // Get final response from the result message
      const resultTextParts = result.message.parts.filter((p): p is import('../agent/types').TextPart => p.type === 'text');
      const resultText = resultTextParts.map(p => p.content).join('');

      // Mark complete
      const finalContent = streamingChatRef.current.trim() || resultText || '';
      setDocuments(prev => prev.map(doc =>
        doc.id === activeDocId
          ? {
              ...doc,
              chatMessages: doc.chatMessages.map(m =>
                m.id === assistantMessageId
                  ? { ...m, content: finalContent, status: 'done' as const, statusDetail: undefined }
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
        // User aborted - keep partial response
        setDocuments(prev => prev.map(doc =>
          doc.id === activeDocId
            ? {
                ...doc,
                chatMessages: doc.chatMessages.map(m =>
                  m.id === assistantMessageId
                    ? { ...m, content: streamingChatRef.current || '(stopped)', status: 'done' as const, statusDetail: undefined }
                    : m
                ),
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
