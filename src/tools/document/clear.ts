import { z } from 'zod';
import { Tool, toolSuccess, toolError } from '../Tool';

/**
 * Clear all content from the document.
 */
export const clearDocumentTool = Tool.define({
  id: 'clear_document',
  name: 'Clear Document',
  description: `Clear ALL content from the document. This is a destructive action.

WHEN TO USE: Only when the user explicitly asks to start over, clear the document, or completely replace all content. Do NOT call this on an already empty document.

PARAMETERS: None required - pass empty object {}.

OUTPUT: Returns { cleared: true } on success.

WARNING: This action cannot be undone. All text, formatting, and content will be permanently removed.

AVOID: Do not use this before writing new content to an empty document - just use write_content directly.`,
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
