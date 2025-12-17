import { z } from 'zod';
import { Tool, toolSuccess, toolError } from '../Tool';
import { findTextInDocument, textToHtml } from './utils';

/**
 * Insert content at a specific position in the document.
 */
export const insertContentTool = Tool.define({
  id: 'insert_content',
  name: 'Insert Content',
  description: 'Insert content at a specific position in the document.',
  parameters: z.object({
    content: z.string().describe('The text content to insert.'),
    position: z
      .enum(['start', 'end', 'before', 'after'])
      .describe(
        'Where to insert: "start" for beginning of document, "end" for end, "before" or "after" a target text.'
      ),
    target_text: z
      .string()
      .optional()
      .describe('Required when position is "before" or "after". The text to insert relative to.'),
  }),
  requiredContext: ['editor'],

  async execute({ content, position, target_text }, ctx) {
    const editor = ctx.editor;
    if (!editor) {
      return toolError('Editor not available');
    }

    ctx.emitStatus({
      toolId: 'insert_content',
      status: 'running',
      title: `Inserting at ${position}...`,
    });

    const editorInstance = editor.getEditor();
    if (!editorInstance) {
      return toolError('Editor instance not available');
    }

    const htmlContent = textToHtml(content);

    if (position === 'start') {
      editorInstance.chain().focus().setTextSelection(0).insertContent(htmlContent).run();
    } else if (position === 'end') {
      editor.insertContent(htmlContent);
    } else if (position === 'after' && target_text) {
      const doc = editorInstance.state.doc;
      const result = findTextInDocument(doc, target_text);
      if (result) {
        editorInstance.chain().focus().setTextSelection(result.to).insertContent(htmlContent).run();
      } else {
        // Fallback to end
        editor.insertContent(htmlContent);
      }
    } else if (position === 'before' && target_text) {
      const doc = editorInstance.state.doc;
      const result = findTextInDocument(doc, target_text);
      if (result) {
        editorInstance.chain().focus().setTextSelection(result.from).insertContent(htmlContent).run();
      } else {
        // Fallback to start
        editorInstance.chain().focus().setTextSelection(0).insertContent(htmlContent).run();
      }
    }

    return toolSuccess({ inserted: true, position });
  },
});
