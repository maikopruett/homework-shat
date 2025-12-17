import { z } from 'zod';
import { Tool, toolSuccess, toolError } from '../Tool';
import { applyFormatting } from './utils';

/**
 * Apply formatting to text in the document.
 */
export const formatTextTool = Tool.define({
  id: 'format_text',
  name: 'Format Text',
  description: 'Apply formatting to text in the document. Can target specific text or the entire document.',
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
        'Value for formatting types that need it: color hex codes for textColor/highlight, alignment value (left/center/right/justify), font size (e.g. "14pt"), font family name, indent value (e.g. "0.5in"), or URL for links.'
      ),
  }),
  requiredContext: ['editor'],

  async execute({ format_type, target, value }, ctx) {
    const editor = ctx.editor;
    if (!editor) {
      return toolError('Editor not available');
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
      return toolSuccess({ formatted: true, format_type, target });
    } else {
      return toolError('Failed to apply formatting');
    }
  },
});

/**
 * Apply first-line indent to body paragraphs (MLA/APA formatting).
 */
export const indentBodyParagraphsTool = Tool.define({
  id: 'indent_body_paragraphs',
  name: 'Indent Body Paragraphs',
  description:
    'Apply first-line indent to all body paragraphs in the document. Use this for MLA/APA formatting. Skips header lines (first few lines with name, date, title, etc.) and special sections like Works Cited/References.',
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
