import { z } from 'zod';
import { Tool, toolSuccess, toolError } from '../Tool';
import { textToHtml } from './utils';

/**
 * Append content to the end of the document.
 */
export const writeContentTool = Tool.define({
  id: 'write_content',
  name: 'Write Content',
  description:
    'Append content to the end of the document. Use this to add new text, paragraphs, or sections. Content will be added after any existing content.',
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
