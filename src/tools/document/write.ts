import { z } from 'zod';
import { Tool, toolSuccess, toolError } from '../Tool';
import { textToHtml } from './utils';

/**
 * Append content to the end of the document.
 */
export const writeContentTool = Tool.define({
  id: 'write_content',
  name: 'Write Content',
  description: `Append content to the end of the document.

WHEN TO USE: To add new text, paragraphs, or sections. Content is always added AFTER any existing content. Use this for writing essays, adding paragraphs, or extending documents.

PARAMETERS:
- content: Plain text only. Use \\n\\n for paragraph breaks. Do NOT use markdown syntax.

OUTPUT: Returns { written: true } on success.

TIPS:
- For new documents, just start writing - no need to clear first
- Use double newlines (\\n\\n) to create separate paragraphs
- Formatting (bold, fonts, etc.) should be applied separately with format_text after writing`,
  parameters: z.object({
    content: z
      .string()
      .describe(
        'The text content to add to the document. Use newlines for paragraphs. Do not use markdown - plain text only.'
      ),
  }),
  requiredContext: ['editor'],

  async execute({ content }, ctx) {
    const editor = ctx.editor;
    if (!editor) {
      return toolError('Editor not available');
    }

    ctx.emitStatus({
      toolId: 'write_content',
      status: 'running',
      title: 'Writing content...',
    });

    const htmlContent = textToHtml(content);
    editor.insertContent(htmlContent);

    return toolSuccess({ written: true });
  },
});
