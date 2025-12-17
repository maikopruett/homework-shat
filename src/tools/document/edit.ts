import { z } from 'zod';
import { Tool, toolSuccess, toolError } from '../Tool';
import { findTextInDocument } from './utils';

/**
 * Find specific text in the document and replace it.
 */
export const editTextTool = Tool.define({
  id: 'edit_text',
  name: 'Edit Text',
  description:
    'Find specific text in the document and replace it with new text. Use for targeted edits to existing content.',
  parameters: z.object({
    find_text: z.string().describe('The exact text to find and replace in the document.'),
    replace_with: z.string().describe('The new text to replace the found text with.'),
  }),
  requiredContext: ['editor'],

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
