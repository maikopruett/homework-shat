/**
 * Essay Format Validation
 *
 * Validates document formatting against template requirements.
 * Used after essay completion to silently auto-correct formatting issues.
 */

import type { EssayTemplate } from '../builder';
import type { TiptapEditorHandle } from '../../components/TiptapEditor';

// ==================== Types ====================

export interface FormatValidationResult {
  isValid: boolean;
  issues: FormatIssue[];
  corrections: FormatCorrection[];
}

export interface FormatIssue {
  type: 'font' | 'fontSize' | 'alignment' | 'indent';
  description: string;
  severity: 'error' | 'warning';
  location?: string;
}

export interface FormatCorrection {
  toolId: 'format_text' | 'indent_body_paragraphs';
  params: Record<string, unknown>;
  description: string;
}

export interface TemplateRequirements {
  fontFamily?: string;
  fontSize?: string;
  bodyIndent?: string;
  skipLines: number;
}

// ==================== Document Style Extraction ====================

interface DocumentStyleInfo {
  hasContent: boolean;
  fontFamilies: Set<string>;
  fontSizes: Set<string>;
  hasBodyIndent: boolean;
}

/**
 * Extract styling information from the document for validation.
 */
function extractStyleInfo(editor: TiptapEditorHandle): DocumentStyleInfo {
  const editorInstance = editor.getEditor();
  const info: DocumentStyleInfo = {
    hasContent: false,
    fontFamilies: new Set<string>(),
    fontSizes: new Set<string>(),
    hasBodyIndent: false,
  };

  if (!editorInstance) return info;

  const doc = editorInstance.state.doc;
  info.hasContent = doc.textContent.length > 0;

  // Traverse document to extract styling
  doc.descendants((node) => {
    // Check for text-indent on paragraphs
    if (node.type.name === 'paragraph') {
      const indent = node.attrs?.textIndent;
      if (indent && indent !== '0' && indent !== '0in') {
        info.hasBodyIndent = true;
      }
    }

    // Check marks on text nodes for font info
    if (node.isText && node.marks?.length > 0) {
      for (const mark of node.marks) {
        if (mark.type.name === 'textStyle') {
          if (mark.attrs?.fontFamily) {
            info.fontFamilies.add(mark.attrs.fontFamily);
          }
          if (mark.attrs?.fontSize) {
            info.fontSizes.add(mark.attrs.fontSize);
          }
        }
      }
    }

    return true;
  });

  return info;
}

// ==================== Template Parsing ====================

/**
 * Parse template formatting instructions into structured requirements.
 */
export function parseTemplateRequirements(template: EssayTemplate): TemplateRequirements {
  const instructions = template.formattingInstructions;

  // Extract font family (e.g., "Times New Roman")
  // Look for patterns like "Font: Times New Roman, 12pt" or "Times New Roman, 12pt throughout"
  const fontMatch =
    instructions.match(/Font:\s*([\w\s]+),\s*\d+pt/i) ||
    instructions.match(/(Times New Roman)/i);
  const fontFamily = fontMatch ? fontMatch[1].trim() : undefined;

  // Extract font size (e.g., "12pt")
  const sizeMatch =
    instructions.match(/(\d+pt)\s*throughout/i) ||
    instructions.match(/Font:.*?(\d+pt)/i);
  const fontSize = sizeMatch ? sizeMatch[1] : undefined;

  // Extract body indent requirements (e.g., "0.5in")
  const indentMatch =
    instructions.match(/indent.*?([\d.]+\s*in)/i) ||
    instructions.match(/first-line\s+indent\s*([\d.]+\s*in)/i);
  const bodyIndent = indentMatch ? indentMatch[1].replace(/\s/g, '') : undefined;

  // Extract skip_lines from tool call instructions
  const skipMatch = instructions.match(/skip_lines[=:]\s*(\d+)/i);
  const skipLines = skipMatch ? parseInt(skipMatch[1], 10) : 0;

  return { fontFamily, fontSize, bodyIndent, skipLines };
}

// ==================== Main Validation ====================

/**
 * Validate document formatting against template requirements.
 * Returns issues found and corrections to apply.
 */
export function validateFormatting(
  editor: TiptapEditorHandle,
  template: EssayTemplate
): FormatValidationResult {
  const styleInfo = extractStyleInfo(editor);
  const requirements = parseTemplateRequirements(template);
  const issues: FormatIssue[] = [];
  const corrections: FormatCorrection[] = [];

  // Skip validation if document is empty
  if (!styleInfo.hasContent) {
    return { isValid: true, issues: [], corrections: [] };
  }

  // Check font family
  if (requirements.fontFamily) {
    const hasCorrectFont = styleInfo.fontFamilies.has(requirements.fontFamily);
    // If no font families detected or wrong font, add correction
    if (styleInfo.fontFamilies.size === 0 || !hasCorrectFont) {
      issues.push({
        type: 'font',
        description: `Expected font: ${requirements.fontFamily}`,
        severity: 'error',
      });
      corrections.push({
        toolId: 'format_text',
        params: {
          format_type: 'fontFamily',
          target: 'all',
          value: requirements.fontFamily,
        },
        description: `Apply ${requirements.fontFamily} to entire document`,
      });
    }
  }

  // Check font size
  if (requirements.fontSize) {
    const hasCorrectSize = styleInfo.fontSizes.has(requirements.fontSize);
    // If no font sizes detected or wrong size, add correction
    if (styleInfo.fontSizes.size === 0 || !hasCorrectSize) {
      issues.push({
        type: 'fontSize',
        description: `Expected font size: ${requirements.fontSize}`,
        severity: 'error',
      });
      corrections.push({
        toolId: 'format_text',
        params: {
          format_type: 'fontSize',
          target: 'all',
          value: requirements.fontSize,
        },
        description: `Apply ${requirements.fontSize} to entire document`,
      });
    }
  }

  // Check body paragraph indentation
  if (requirements.bodyIndent && requirements.skipLines > 0) {
    if (!styleInfo.hasBodyIndent) {
      issues.push({
        type: 'indent',
        description: `Body paragraphs missing ${requirements.bodyIndent} first-line indent`,
        severity: 'error',
        location: 'body paragraphs',
      });
      corrections.push({
        toolId: 'indent_body_paragraphs',
        params: {
          indent_value: requirements.bodyIndent,
          skip_lines: requirements.skipLines,
        },
        description: `Apply ${requirements.bodyIndent} indent to body paragraphs (skip first ${requirements.skipLines} lines)`,
      });
    }
  }

  return {
    isValid: issues.length === 0,
    issues,
    corrections,
  };
}
