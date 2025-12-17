/**
 * Shared utilities for document manipulation tools.
 * Extracted from useDocuments.ts for reuse in modular tool system.
 */

import type { TiptapEditorHandle } from '../../components/TiptapEditor';

// ==================== Text Search ====================

export interface TextSearchResult {
  from: number;
  to: number;
}

/**
 * Normalize text for matching - handles AI output variations in quotes
 */
export function normalizeForMatching(text: string): string {
  return text
    .replace(/[''`′‵ʼ]/g, "'") // Normalize single quotes/apostrophes
    .replace(/[""″‶]/g, '"');  // Normalize double quotes
}

/**
 * Find text in a ProseMirror document, handling cross-node matches.
 * Uses normalized matching to handle quote/apostrophe variations.
 */
export function findTextInDocument(
  doc: { descendants: (callback: (node: { isText: boolean; text?: string }, pos: number) => boolean) => void },
  searchText: string
): TextSearchResult | null {
  // Build a map of all text content with positions
  const textSegments: { text: string; pos: number }[] = [];

  doc.descendants((node: { isText: boolean; text?: string }, pos: number) => {
    if (node.isText && node.text) {
      textSegments.push({ text: node.text, pos });
    }
    return true;
  });

  if (textSegments.length === 0) return null;

  // Build combined text and position map
  let combinedText = '';
  const positionMap: { charIndex: number; docPos: number }[] = [];

  for (const segment of textSegments) {
    for (let i = 0; i < segment.text.length; i++) {
      positionMap.push({
        charIndex: combinedText.length + i,
        docPos: segment.pos + i,
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
    to: toEntry.docPos + 1, // +1 because 'to' is exclusive in Tiptap
  };
}

/**
 * Extract reasonable target candidates from potentially malformed AI output.
 * Handles cases where AI provides too much context or duplicated text.
 */
export function extractReasonableTarget(target: string): string[] {
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

// ==================== HTML Conversion ====================

/**
 * Convert plain text to HTML with proper paragraph handling.
 * Recognizes bullet and numbered lists.
 */
export function textToHtml(text: string): string {
  // Split by any newline(s) - each line becomes its own paragraph
  const lines = text.split(/\n/).filter((line) => line.trim());

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
        if (
          currentTrimmed.startsWith('•') ||
          currentTrimmed.startsWith('-') ||
          currentTrimmed.startsWith('*')
        ) {
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

// ==================== Document Styling Analysis ====================

export interface DocumentStyleInfo {
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

/**
 * Extract styling information from the document for AI context.
 */
export function extractDocumentStyling(editor: TiptapEditorHandle): DocumentStyleInfo {
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
  doc.descendants((node: any) => {
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

/**
 * Format styling info as AI-readable context.
 */
export function formatStylingForAI(info: DocumentStyleInfo): string {
  if (!info.hasContent) {
    return 'Document styling: (empty document, no styling applied)';
  }

  const lines: string[] = ['## Current Document Styling:'];

  // Structure overview
  lines.push('\n### Structure:');
  lines.push(`- Paragraphs: ${info.totalParagraphs}`);
  if (info.totalHeadings.length > 0) {
    lines.push(`- Headings: ${info.totalHeadings.map((h) => `H${h.level}: "${h.text}"`).join(', ')}`);
  }
  if (info.hasBulletLists) lines.push('- Contains bullet lists');
  if (info.hasNumberedLists) lines.push('- Contains numbered lists');
  if (info.hasBlockquotes) lines.push('- Contains blockquotes');
  if (info.hasCodeBlocks) lines.push('- Contains code blocks');

  // Text formatting
  const formats: string[] = [];
  if (info.hasBoldText) formats.push('bold');
  if (info.hasItalicText) formats.push('italic');
  if (info.hasUnderlineText) formats.push('underline');
  if (info.hasColoredText) formats.push('colored text');
  if (info.hasHighlightedText) formats.push('highlighted text');
  if (info.hasLinks) formats.push('links');

  if (formats.length > 0) {
    lines.push('\n### Text Formatting:');
    lines.push(`- Uses: ${formats.join(', ')}`);
  }

  // Font/style details
  if (info.fontFamilies.size > 0) {
    lines.push(`- Fonts: ${Array.from(info.fontFamilies).join(', ')}`);
  }
  if (info.fontSizes.size > 0) {
    lines.push(`- Sizes: ${Array.from(info.fontSizes).join(', ')}`);
  }
  if (info.textAlignments.size > 0) {
    lines.push(`- Alignments: ${Array.from(info.textAlignments).join(', ')}`);
  }

  return lines.join('\n');
}

// ==================== Formatting Actions ====================

export interface FormatAction {
  type: string;
  target: string;
  value?: string;
}

/**
 * Apply a formatting action to the editor.
 */
export function applyFormatting(editor: TiptapEditorHandle, action: FormatAction): boolean {
  const editorInstance = editor.getEditor();
  if (!editorInstance) {
    console.warn('[applyFormatting] Editor instance not available');
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
      console.warn('[applyFormatting] Could not find text to format. Tried candidates:', candidates);
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
      if (action.value) {
        editor.setTextIndent(action.value);
      }
      break;
    default:
      console.warn(`[applyFormatting] Unknown format type: ${action.type}`);
      return false;
  }

  return true;
}
