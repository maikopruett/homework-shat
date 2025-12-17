/**
 * Ask User Tool
 *
 * Pauses the agent loop and asks the user a question with clickable options.
 * The tool execution is handled specially in Loop.ts to await user response.
 */

import { Tool, toolError } from '../Tool';
import { UserQuestionSchema } from '../../agent/types';

export const askUserTool = Tool.define({
  id: 'ask_user',
  name: 'Ask User',
  description: `Ask the user a clarifying question with multiple choice options. The user will see clickable buttons for each option.

IMPORTANT: Each option MUST have:
- id: A unique identifier string (e.g., "opt1", "biology", "mla")
- label: The button text the user sees (e.g., "MLA Format", "500 words")
- description: Optional extra context shown below the label

Example usage:
{
  "question": "What citation format should I use?",
  "options": [
    {"id": "mla", "label": "MLA Format", "description": "Modern Language Association style"},
    {"id": "apa", "label": "APA Format", "description": "American Psychological Association style"},
    {"id": "none", "label": "No citations needed"}
  ],
  "allowMultiple": false
}`,
  parameters: UserQuestionSchema,
  requiredContext: ['session'],

  async execute(params, ctx) {
    // This tool is handled specially in Loop.ts
    // The actual execution happens via the onUserQuestionRequest callback
    // This execute function is called but the Loop intercepts ask_user calls

    ctx.emitStatus({
      toolId: 'ask_user',
      status: 'running',
      title: 'Waiting for your response...',
      metadata: {
        question: params.question,
        optionCount: params.options.length,
      },
    });

    // The Loop.ts will intercept this and handle the user interaction
    // This return is a fallback if not handled properly
    return toolError('ask_user tool must be handled by the agent loop');
  },
});
