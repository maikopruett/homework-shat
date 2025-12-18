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

import { WRITING_STYLE_RULES, BANNED_WORDS_STRING, BANNED_WORDS_SHORT, PERSONAL_INFO_PLACEHOLDER } from './core/style';
import { WORKFLOW_RULES, CHAT_MODE_BASE_RULES } from './core/workflow';
import { type PersonaSettings, generatePersonaEditPrompt, generatePersonaChatPrompt } from './core/persona';
import { CLAUDE_PROMPT, type ModelPromptConfig } from './models/claude';
import { GROK_PROMPT } from './models/grok';
import { MINIMAX_PROMPT } from './models/minimax';

// Model family detection
export type ModelFamily = 'claude' | 'grok' | 'minimax' | 'default';

export function getModelFamily(modelId: string): ModelFamily {
  const id = modelId.toLowerCase();
  if (id.includes('claude')) return 'claude';
  if (id.includes('grok')) return 'grok';
  if (id.includes('minimax')) return 'minimax';
  return 'default';
}

/**
 * Check if a model supports proper OpenRouter tool calling.
 * Grok has issues with tool calling - it outputs XML-style parameters
 * in text content instead of proper JSON in tool_calls.
 */
export function modelSupportsTools(modelId: string): boolean {
  const family = getModelFamily(modelId);
  // Grok has broken tool calling via OpenRouter
  if (family === 'grok') return false;
  return true;
}

// Model prompt registry
const MODEL_PROMPTS: Record<ModelFamily, ModelPromptConfig> = {
  claude: CLAUDE_PROMPT,
  grok: GROK_PROMPT,
  minimax: MINIMAX_PROMPT,
  default: GROK_PROMPT, // Default to Grok (current default model)
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
  mode: 'edit' | 'chat';
  persona?: PersonaSettings | null;
  documentTitle?: string;
  documentContent?: string;
  documentStyling?: string; // Extracted styling info
  searchResults?: SearchResult[];
  template?: EssayTemplate | null;
  currentDate: string;
  planModeInstructions?: string; // From plan detector
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
 * Build the default (non-persona) chat mode prompt
 */
function buildDefaultChatPrompt(modelPrompt: ModelPromptConfig): string {
  return `${modelPrompt.identity.replace('editor', 'writing')} (Chat-only mode)

${CHAT_MODE_BASE_RULES}

No AI buzzwords (${BANNED_WORDS_SHORT}).

${modelPrompt.strengths}`;
}

/**
 * Main prompt builder function
 * Composes model-specific + uniform rules + context
 */
export function buildSystemPrompt(context: PromptContext): string {
  const family = getModelFamily(context.modelId);
  const modelPrompt = MODEL_PROMPTS[family];

  // Step 1: Get base prompt (persona or default, edit or chat)
  let prompt: string;

  if (context.persona && context.persona.documentContent) {
    // Persona mode - use persona-specific prompt
    prompt = context.mode === 'edit'
      ? generatePersonaEditPrompt(context.persona)
      : generatePersonaChatPrompt(context.persona);

    // Add model-specific tool guidance for persona edit mode
    if (context.mode === 'edit') {
      prompt += `\n\n${modelPrompt.toolGuidance}`;
    }
  } else {
    // Default mode - use model-specific base prompt
    prompt = context.mode === 'edit'
      ? buildDefaultEditPrompt(modelPrompt)
      : buildDefaultChatPrompt(modelPrompt);
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

  // Step 5: Add plan mode instructions if detected
  if (context.planModeInstructions) {
    prompt += `\n\n${context.planModeInstructions}`;
  }

  return prompt;
}

/**
 * Get model-specific prompt config for external use
 */
export function getModelPromptConfig(modelId: string): ModelPromptConfig {
  const family = getModelFamily(modelId);
  return MODEL_PROMPTS[family];
}
