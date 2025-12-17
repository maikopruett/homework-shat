import { z } from 'zod';
import { Tool, toolSuccess, toolError } from '../Tool';

/**
 * Clear all content from the document.
 */
export const clearDocumentTool = Tool.define({
  id: 'clear_document',
  name: 'Clear Document',
  description:
    'Clear all content from the document. ONLY use this if the document has existing content that needs to be replaced. Do NOT call this on an empty document.',
  parameters: z.object({}),
  requiredContext: ['editor'],
  permissions: 'ask', // Destructive action, should confirm

  async execute(_params, ctx) {
    const editor = ctx.editor;
    if (!editor) {
      return toolError('Editor not available');
    }

    ctx.emitStatus({
      toolId: 'clear_document',
      status: 'running',
      title: 'Clearing document...',
    });

    editor.clearContent();

    return toolSuccess({ cleared: true });
  },
});
