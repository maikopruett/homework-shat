import { z } from 'zod';
import { Tool, toolSuccess, toolError } from '../Tool';
import { findTextInDocument } from './utils';

/**
 * Find specific text in the document and replace it.
 */
export const editTextTool = Tool.define({
  id: 'edit_text',
  name: 'Edit Text',
  description: `Find and replace specific text in the document.

WHEN TO USE: For targeted edits to existing content - fixing typos, changing words, updating sentences.

PARAMETERS:
- find_text: The EXACT text to find (case-sensitive, whitespace-sensitive). Must match precisely.
- replace_with: The new text to replace it with.

OUTPUT: Returns { edited: true } on success.

TIPS:
- Call read_document first to see the exact text to match
- The find_text must be an exact match - partial matches won't work
- For multiple replacements, call this tool multiple times

ERRORS: Returns error if the exact text is not found in the document.`,
  parameters: z.object({
    find_text: z.string().describe('The exact text to find and replace in the document.'),
    replace_with: z.string().describe('The new text to replace the found text with.'),
  }),
  requiredContext: ['editor'],
  examples: [
    { find_text: 'old header text', replace_with: 'New Header Text' },
    { find_text: 'Mrs. Johson', replace_with: 'Mrs. Johnson' },
  ],

  async execute({ find_text, replace_with }, ctx) {
    const editor = ctx.editor;
    if (!editor) {
      return toolError('Editor not available');
    }

    ctx.emitStatus({
      toolId: 'edit_text',
      status: 'running',
      title: 'Editing text...',
    });

    const editorInstance = editor.getEditor();
    if (!editorInstance) {
      return toolError('Editor instance not available');
    }

    const doc = editorInstance.state.doc;
    const result = findTextInDocument(doc, find_text);

    if (result) {
      editorInstance
        .chain()
        .focus()
        .setTextSelection({ from: result.from, to: result.to })
        .deleteSelection()
        .insertContent(replace_with)
        .run();

      return toolSuccess({ edited: true });
    } else {
      return toolError('Text not found in document');
    }
  },
});
