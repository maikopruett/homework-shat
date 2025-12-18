import { z } from 'zod';
import { Tool, toolSuccess, toolError } from '../Tool';
import { applyFormatting } from './utils';

/**
 * Apply formatting to text in the document.
 */
export const formatTextTool = Tool.define({
  id: 'format_text',
  name: 'Format Text',
  description: `Apply formatting to text in the document.

WHEN TO USE: To style text with fonts, sizes, colors, alignment, headings, or lists. Call after writing content.

PARAMETERS:
- format_type: The formatting to apply. Options:
  * Text styles: bold, italic, underline, strikethrough
  * Headings: h1, h2, h3, h4, h5, h6, paragraph
  * Lists: bulletList, orderedList
  * Blocks: blockquote, codeBlock, horizontalRule
  * Alignment: align (requires value)
  * Colors: textColor, highlight (require value as hex)
  * Typography: fontSize, fontFamily (require value)
  * Indent: textIndent (requires value)
  * Other: link (requires value as URL), removeFormat

- target: Exact text to format OR "all" for entire document

- value: REQUIRED for these format_types:
  * align: "left" | "center" | "right" | "justify"
  * textColor/highlight: hex color like "#000000"
  * fontSize: e.g. "12pt", "14px"
  * fontFamily: e.g. "Times New Roman", "Arial"
  * textIndent: e.g. "0.5in"
  * link: URL like "https://example.com"

OUTPUT: Returns { formatted: true, format_type, target, value } on success.

ERRORS: Fails if target text not found or if required value is missing.`,
  parameters: z.object({
    format_type: z
      .enum([
        'bold',
        'italic',
        'underline',
        'strikethrough',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'paragraph',
        'bulletList',
        'orderedList',
        'blockquote',
        'codeBlock',
        'align',
        'textColor',
        'highlight',
        'fontSize',
        'fontFamily',
        'textIndent',
        'removeFormat',
        'link',
        'horizontalRule',
      ])
      .describe('The type of formatting to apply.'),
    target: z
      .string()
      .describe('The exact text to format, or "all" to format the entire document.'),
    value: z
      .string()
      .optional()
      .describe(
        'REQUIRED for: align (left/center/right/justify), textColor (hex), highlight (hex), fontSize (e.g. "12pt"), fontFamily (e.g. "Times New Roman"), textIndent (e.g. "0.5in"), link (URL). Example: format_type="align", value="center"'
      ),
  }),
  requiredContext: ['editor'],
  examples: [
    { format_type: 'bold', target: 'Important text' },
    { format_type: 'align', target: 'all', value: 'center' },
    { format_type: 'fontFamily', target: 'all', value: 'Times New Roman' },
    { format_type: 'fontSize', target: 'all', value: '12pt' },
    { format_type: 'h1', target: 'Title Text' },
  ],

  async execute(params, ctx) {
    const { format_type, target } = params;
    const editor = ctx.editor;
    if (!editor) {
      return toolError('Editor not available');
    }

    // Normalize value - AI often uses format_type name as param (e.g., "align": "center" instead of "value": "center")
    // Accept common parameter name mistakes and extract the actual value
    let value = params.value;
    if (!value) {
      // Check if AI passed the value with the format_type name as the key
      const altKeys = ['align', 'fontFamily', 'fontSize', 'textColor', 'highlight', 'textIndent', 'link', 'color', 'font', 'size'];
      for (const key of altKeys) {
        if (key in params && typeof (params as Record<string, unknown>)[key] === 'string') {
          value = (params as Record<string, unknown>)[key] as string;
          break;
        }
      }
    }

    // Validate that value is provided for format types that require it
    const requiresValue = ['align', 'textColor', 'highlight', 'fontSize', 'fontFamily', 'textIndent', 'link'];
    if (requiresValue.includes(format_type) && !value) {
      return toolError(
        `format_type="${format_type}" requires a "value" parameter. ` +
        `For align, use value="center", "left", "right", or "justify".`
      );
    }

    ctx.emitStatus({
      toolId: 'format_text',
      status: 'running',
      title: `Applying ${format_type}...`,
    });

    const success = applyFormatting(editor, {
      type: format_type,
      target,
      value,
    });

    if (success) {
      return toolSuccess({ formatted: true, format_type, target, value });
    } else {
      return toolError(`Failed to apply ${format_type}. Text "${target}" not found in document.`);
    }
  },
});

/**
 * Apply first-line indent to body paragraphs (MLA/APA formatting).
 */
export const indentBodyParagraphsTool = Tool.define({
  id: 'indent_body_paragraphs',
  name: 'Indent Body Paragraphs',
  description: `Apply first-line indent to all body paragraphs for academic formatting (MLA/APA).

WHEN TO USE: After writing an essay that needs MLA or APA paragraph indentation. Automatically skips headers and Works Cited/References sections.

PARAMETERS:
- indent_value: The indent amount, typically "0.5in" (half inch, standard for MLA/APA)
- skip_lines: Number of header lines to skip at the start:
  * MLA: use 5 (name, professor, class, date, title)
  * APA: use 7 (title, name, department, course, instructor, date, blank line)

OUTPUT: Returns { indented: true, paragraphs_indented, skipped_header_lines }

BEHAVIOR:
- Skips the specified number of header lines
- Skips empty paragraphs
- Automatically skips "Works Cited", "References", and "Bibliography" sections
- Applies first-line indent to all body paragraphs`,
  parameters: z.object({
    indent_value: z
      .string()
      .describe('The indent value, e.g. "0.5in" for half inch (standard for MLA/APA).'),
    skip_lines: z
      .number()
      .describe(
        'Number of lines to skip at the start (header block). For MLA use 5 (name, professor, class, date, title). For APA use 7 (title, name, dept, course, instructor, date, blank line).'
      ),
  }),
  requiredContext: ['editor'],
  examples: [
    { indent_value: '0.5in', skip_lines: 5 },  // MLA format
    { indent_value: '0.5in', skip_lines: 7 },  // APA format
  ],

  async execute({ indent_value, skip_lines }, ctx) {
    const editor = ctx.editor;
    if (!editor) {
      return toolError('Editor not available');
    }

    ctx.emitStatus({
      toolId: 'indent_body_paragraphs',
      status: 'running',
      title: 'Indenting body paragraphs...',
    });

    const editorInstance = editor.getEditor();
    if (!editorInstance) {
      return toolError('Editor instance not available');
    }

    // Get all paragraph nodes and their positions
    const doc = editorInstance.state.doc;
    const paragraphsToIndent: { from: number; to: number }[] = [];
    let paragraphIndex = 0;

    // Special section markers to skip (Works Cited, References, etc.)
    const skipMarkers = ['works cited', 'references', 'bibliography'];
    let inSkipSection = false;

    doc.descendants((node: any, pos: number) => {
      if (node.type.name === 'paragraph') {
        const text = node.textContent.toLowerCase().trim();

        // Check if we're entering a skip section
        if (skipMarkers.some((marker) => text === marker)) {
          inSkipSection = true;
        }

        // Skip header lines, empty paragraphs, and skip sections
        if (paragraphIndex >= skip_lines && node.textContent.trim() && !inSkipSection) {
          paragraphsToIndent.push({ from: pos, to: pos + node.nodeSize });
        }

        paragraphIndex++;
      }
      return true;
    });

    // Apply indent to each paragraph (in reverse to preserve positions)
    for (let i = paragraphsToIndent.length - 1; i >= 0; i--) {
      const { from, to } = paragraphsToIndent[i];
      editorInstance.chain().focus().setTextSelection({ from, to }).run();
      editor.setTextIndent(indent_value);
    }

    // Move cursor to end
    editorInstance.commands.focus('end');

    return toolSuccess({
      indented: true,
      paragraphs_indented: paragraphsToIndent.length,
      skipped_header_lines: skip_lines,
    });
  },
});
