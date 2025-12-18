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
  description: `Ask the user a question with clickable multiple-choice options. Pauses execution until user responds.

WHEN TO USE: When you need clarification on preferences, format choices, topic direction, or any decision the user should make.

PARAMETERS:
- question: The question text to display to the user
- options: Array of 2-6 options. Each option MUST have:
  * id: Unique identifier (e.g., "mla", "apa", "opt1")
  * label: Button text the user sees (e.g., "MLA Format")
  * description: (optional) Extra context shown below the label
- allowMultiple: (optional, default false) Set true to allow selecting multiple options

OUTPUT: Returns { question, selectedOptions, selectedLabels } where:
- selectedOptions: Array of selected option IDs
- selectedLabels: Array of selected option labels

EXAMPLE:
{
  "question": "What citation format should I use?",
  "options": [
    {"id": "mla", "label": "MLA Format", "description": "Modern Language Association style"},
    {"id": "apa", "label": "APA Format", "description": "American Psychological Association style"},
    {"id": "none", "label": "No citations needed"}
  ],
  "allowMultiple": false
}

ERRORS: Returns error if options array has fewer than 2 items or if options are missing required fields.`,
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
