/**
 * PromptBuilder - Composes model-specific prompts with uniform writing rules
 *
 * Architecture (like OpenCode):
 * 1. Model-specific identity + tool guidance
 * 2. Uniform writing style rules
 * 3. Model-specific strengths
 * 4. Workflow rules
 * 5. Context injection (document, search results, template, etc.)
 */

import { WRITING_STYLE_RULES, BANNED_WORDS_STRING, PERSONAL_INFO_PLACEHOLDER } from './core/style';
import { WORKFLOW_RULES, PLAN_MODE_INSTRUCTIONS } from './core/workflow';
import { type PersonaSettings, generatePersonaEditPrompt } from './core/persona';
import { CLAUDE_PROMPT, type ModelPromptConfig } from './models/claude';
import { GROK_PROMPT } from './models/grok';
import { GEMINI_PROMPT } from './models/gemini';
import { DEEPSEEK_PROMPT } from './models/deepseek';
import { KIMI_PROMPT } from './models/kimi';
import { MINIMAX_PROMPT } from './models/minimax';

// Model family detection
export type ModelFamily = 'claude' | 'grok' | 'gemini' | 'deepseek' | 'kimi' | 'minimax' | 'default';

export function getModelFamily(modelId: string): ModelFamily {
  const id = modelId.toLowerCase();
  if (id.includes('claude')) return 'claude';
  if (id.includes('grok')) return 'grok';
  if (id.includes('gemini')) return 'gemini';
  if (id.includes('deepseek')) return 'deepseek';
  if (id.includes('kimi')) return 'kimi';
  if (id.includes('minimax')) return 'minimax';
  return 'default';
}

/**
 * Check if a model supports proper OpenRouter tool calling.
 */
export function modelSupportsTools(modelId: string): boolean {
  const family = getModelFamily(modelId);
  // All current models support tool calling
  if (family === 'claude') return true;
  if (family === 'grok') return true;
  if (family === 'gemini') return true;
  if (family === 'deepseek') return true;
  if (family === 'kimi') return true;
  if (family === 'minimax') return true;
  return true;
}

// Model prompt registry
const MODEL_PROMPTS: Record<ModelFamily, ModelPromptConfig> = {
  claude: CLAUDE_PROMPT,
  grok: GROK_PROMPT,
  gemini: GEMINI_PROMPT,
  deepseek: DEEPSEEK_PROMPT,
  kimi: KIMI_PROMPT,
  minimax: MINIMAX_PROMPT,
  default: GEMINI_PROMPT, // Default to Gemini (current default model)
};

// Search result interface (matches what's used in useDocuments)
export interface SearchResult {
  title: string;
  url: string;
  snippet?: string;
  publishedDate?: string;
  author?: string;
}

// Template interface
export interface EssayTemplate {
  id: string;
  name: string;
  type: 'preset' | 'custom';
  htmlContent: string;
  formattingInstructions: string;
  createdAt: number;
}

// Context for building prompts
export interface PromptContext {
  modelId: string;
  mode: 'edit' | 'plan';
  persona?: PersonaSettings | null;
  documentTitle?: string;
  documentContent?: string;
  documentStyling?: string; // Extracted styling info
  searchResults?: SearchResult[];
  template?: EssayTemplate | null;
  currentDate: string;
  // Plan mode instructions are automatically included when mode === 'plan'
}

/**
 * Format search results for AI consumption
 */
function formatSearchResults(results: SearchResult[], accessDate: string): string {
  let formatted = `## Research Results (accessed ${accessDate})\n`;
  formatted += `Use these sources for citations. Include URLs when referencing.\n\n`;

  results.forEach((result, i) => {
    formatted += `### Source ${i + 1}: ${result.title}\n`;
    formatted += `URL: ${result.url}\n`;
    if (result.author) formatted += `Author: ${result.author}\n`;
    if (result.publishedDate) formatted += `Published: ${result.publishedDate}\n`;
    if (result.snippet) formatted += `Summary: ${result.snippet}\n`;
    formatted += '\n';
  });

  return formatted;
}

/**
 * Build the default (non-persona) edit mode prompt
 */
function buildDefaultEditPrompt(modelPrompt: ModelPromptConfig): string {
  return `${modelPrompt.identity}

## Personal Info
${PERSONAL_INFO_PLACEHOLDER}

${modelPrompt.toolGuidance}

## Writing Style (Sound Human)
${WRITING_STYLE_RULES}

BANNED: ${BANNED_WORDS_STRING}

${modelPrompt.strengths}

## Workflow
${WORKFLOW_RULES}`;
}

/**
 * Build the default (non-persona) plan mode prompt
 * Plan mode adds the planning instructions to the edit prompt
 */
function buildDefaultPlanPrompt(modelPrompt: ModelPromptConfig): string {
  return `${modelPrompt.identity}

## Personal Info
${PERSONAL_INFO_PLACEHOLDER}

${modelPrompt.toolGuidance}

## Writing Style (Sound Human)
${WRITING_STYLE_RULES}

BANNED: ${BANNED_WORDS_STRING}

${modelPrompt.strengths}

## Workflow
${WORKFLOW_RULES}

${PLAN_MODE_INSTRUCTIONS}`;
}

/**
 * Main prompt builder function
 * Composes model-specific + uniform rules + context
 */
export function buildSystemPrompt(context: PromptContext): string {
  const family = getModelFamily(context.modelId);
  const modelPrompt = MODEL_PROMPTS[family];

  // Step 1: Get base prompt (persona or default, edit or plan)
  let prompt: string;

  if (context.persona && context.persona.documentContent) {
    // Persona mode - use persona-specific prompt (same base for edit and plan)
    prompt = generatePersonaEditPrompt(context.persona);
    prompt += `\n\n${modelPrompt.toolGuidance}`;

    // Add plan mode instructions for persona in plan mode
    if (context.mode === 'plan') {
      prompt += `\n\n${PLAN_MODE_INSTRUCTIONS}`;
    }
  } else {
    // Default mode - use model-specific base prompt
    prompt = context.mode === 'edit'
      ? buildDefaultEditPrompt(modelPrompt)
      : buildDefaultPlanPrompt(modelPrompt);
  }

  // Step 2: Add date and document context
  prompt += `\n\nToday's Date: ${context.currentDate}`;

  if (context.documentTitle) {
    prompt += `\nDocument Title: "${context.documentTitle}"`;
  }

  if (context.documentContent) {
    prompt += `\n\n## Current Document Content:\n${context.documentContent}`;
  }

  if (context.documentStyling) {
    prompt += `\n\n## Current Document Styling:\n${context.documentStyling}`;
  }

  // Step 3: Add search results if available
  if (context.searchResults && context.searchResults.length > 0) {
    prompt += `\n\n${formatSearchResults(context.searchResults, context.currentDate)}`;
  }

  // Step 4: Add template instructions if selected
  if (context.template) {
    prompt += `\n\n## TEMPLATE TO FOLLOW (CRITICAL)
You MUST format ALL content to match this template's structure, styling, and formatting.

Template Name: ${context.template.name}

### Formatting Instructions:
${context.template.formattingInstructions}

### Template Structure:
\`\`\`html
${context.template.htmlContent}
\`\`\`

### Requirements:
1. ALWAYS use read_document first to get current content
2. Then use write_content to add formatted content matching the template
3. Match heading styles, paragraph spacing, and overall structure exactly
4. Preserve all template formatting (fonts, sizes, spacing, alignment)`;
  }

  // Plan mode instructions are now included in buildDefaultPlanPrompt
  // No need for separate injection here

  return prompt;
}

/**
 * Get model-specific prompt config for external use
 */
export function getModelPromptConfig(modelId: string): ModelPromptConfig {
  const family = getModelFamily(modelId);
  return MODEL_PROMPTS[family];
}
