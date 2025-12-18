import { z } from 'zod';
import { Tool, toolSuccess, toolError } from '../Tool';
import { findTextInDocument, textToHtml } from './utils';

/**
 * Insert content at a specific position in the document.
 */
export const insertContentTool = Tool.define({
  id: 'insert_content',
  name: 'Insert Content',
  description: `Insert content at a specific position in the document.

WHEN TO USE: When you need precise placement of content - at the start, end, or relative to existing text. Use instead of write_content when position matters.

PARAMETERS:
- content: Plain text to insert (no markdown)
- position: One of "start" | "end" | "before" | "after"
- target_text: Required if position is "before" or "after". The exact text to insert relative to.

OUTPUT: Returns { inserted: true, position } on success.

EXAMPLES:
- Insert title at start: { content: "My Essay", position: "start" }
- Add after intro: { content: "New paragraph", position: "after", target_text: "Introduction paragraph text" }

FALLBACK: If target_text not found, "before" falls back to start, "after" falls back to end.`,
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
