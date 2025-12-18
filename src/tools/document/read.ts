import { z } from 'zod';
import { Tool, toolSuccess, toolError } from '../Tool';
import { extractDocumentStyling, formatStylingForAI } from './utils';

/**
 * Read and analyze the current document content.
 * Should be called before making any edits to understand what exists.
 */
export const readDocumentTool = Tool.define({
  id: 'read_document',
  name: 'Read Document',
  description: `Read and analyze the current document content.

WHEN TO USE: Always call this BEFORE making any edits to understand what exists. Required before using edit_text or format_text on specific content.

PARAMETERS:
- focus: "full" for entire document, or specific section like "introduction", "formatting", "conclusion", "citations"

OUTPUT: Returns { content, word_count, character_count, styling } where:
- content: The full text content of the document
- word_count: Total number of words
- character_count: Total characters
- styling: Current fonts, sizes, and formatting applied

ERRORS: Fails if no editor is available (document not open).`,
  parameters: z.object({
    focus: z
      .string()
      .describe(
        'What aspect to focus on: "full" for entire document, or describe specific section/element to analyze (e.g., "introduction", "formatting", "conclusion").'
      ),
  }),
  requiredContext: ['editor'],
  examples: [
    { focus: 'full' },
    { focus: 'formatting' },
    { focus: 'introduction' },
    { focus: 'conclusion' },
  ],

  async execute({ focus }, ctx) {
    const editor = ctx.editor;
    if (!editor) {
      return toolError('Editor not available');
    }

    ctx.emitStatus({
      toolId: 'read_document',
      status: 'running',
      title: focus === 'full' ? 'Reading document...' : `Analyzing ${focus}...`,
    });

    const textContent = editor.getText();
    const stylingInfo = extractDocumentStyling(editor);
    const wordCount = textContent.split(/\s+/).filter(Boolean).length;

    return toolSuccess({
      focus,
      content: textContent || '(empty document)',
      word_count: wordCount,
      character_count: textContent.length,
      styling: formatStylingForAI(stylingInfo),
    });
  },
});
