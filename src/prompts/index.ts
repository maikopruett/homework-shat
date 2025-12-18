/**
 * Prompts module - Model-specific system prompts for essay writing
 *
 * Usage:
 *   import { buildSystemPrompt, getModelFamily } from './prompts';
 *
 *   const prompt = buildSystemPrompt({
 *     modelId: 'anthropic/claude-haiku-4.5',
 *     mode: 'edit',
 *     currentDate: '12/17/2025',
 *     documentTitle: 'My Essay',
 *     documentContent: '<p>...</p>',
 *   });
 */

// Main builder
export {
  buildSystemPrompt,
  getModelFamily,
  getModelPromptConfig,
  modelSupportsTools,
  type ModelFamily,
  type PromptContext,
  type SearchResult,
  type EssayTemplate,
} from './builder';

// Core rules (for external use if needed)
export {
  WRITING_STYLE_RULES,
  BANNED_WORDS,
  BANNED_WORDS_STRING,
  BANNED_WORDS_SHORT,
  PERSONAL_INFO_PLACEHOLDER,
} from './core/style';

export {
  WORKFLOW_RULES,
  CHAT_MODE_BASE_RULES,
} from './core/workflow';

export {
  type PersonaSettings,
  buildStudentInfoSection,
  generatePersonaEditPrompt,
  generatePersonaChatPrompt,
} from './core/persona';

// Model configs (for debugging/inspection)
export { CLAUDE_PROMPT, type ModelPromptConfig } from './models/claude';
export { GROK_PROMPT } from './models/grok';
export { MINIMAX_PROMPT } from './models/minimax';

// Essay format templates and validation
export { PRESET_TEMPLATES, APA_TEMPLATE, MLA_TEMPLATE } from './formats';
export {
  validateFormatting,
  parseTemplateRequirements,
  type FormatValidationResult,
  type FormatIssue,
  type FormatCorrection,
  type TemplateRequirements,
} from './formats';
