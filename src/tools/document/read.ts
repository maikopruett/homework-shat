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
  description:
    'Read and analyze the current document content. You MUST call this before making any edits to understand what exists in the document.',
  parameters: z.object({
    focus: z
      .string()
      .describe(
        'What aspect to focus on: "full" for entire document, or describe specific section/element to analyze (e.g., "introduction", "formatting", "conclusion").'
      ),
  }),
  requiredContext: ['editor'],

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
