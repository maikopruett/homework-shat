/**
 * Tool Registry - Central registration point for all agent tools.
 *
 * This module exports the singleton toolRegistry and registers all tools.
 * Import this module to get access to all registered tools.
 */

import { toolRegistry, ToolRegistry } from './registry';
import type { ToolSpec, OpenRouterToolDefinition } from '../agent/types';

// Document tools
import {
  readDocumentTool,
  writeContentTool,
  clearDocumentTool,
  editTextTool,
  insertContentTool,
  formatTextTool,
  indentBodyParagraphsTool,
} from './document';

// Research tools
import { searchWebTool } from './research';

// Task management tools
import { todoWriteTool, todoReadTool } from './task';

// Interaction tools
import { askUserTool } from './interaction';

// ==================== Register All Tools ====================

// Document manipulation
toolRegistry.register(readDocumentTool);
toolRegistry.register(writeContentTool);
toolRegistry.register(clearDocumentTool);
toolRegistry.register(editTextTool);
toolRegistry.register(insertContentTool);
toolRegistry.register(formatTextTool);
toolRegistry.register(indentBodyParagraphsTool);

// Research
toolRegistry.register(searchWebTool);

// Task management
toolRegistry.register(todoWriteTool);
toolRegistry.register(todoReadTool);

// Interaction
toolRegistry.register(askUserTool);

// ==================== Exports ====================

export { toolRegistry, ToolRegistry };
export { Tool, toolSuccess, toolError } from './Tool';
export type { ToolSpec, OpenRouterToolDefinition };

// Re-export individual tools for direct import
export {
  // Document
  readDocumentTool,
  writeContentTool,
  clearDocumentTool,
  editTextTool,
  insertContentTool,
  formatTextTool,
  indentBodyParagraphsTool,
  // Research
  searchWebTool,
  // Task
  todoWriteTool,
  todoReadTool,
  // Interaction
  askUserTool,
};

// Re-export document utilities
export * from './document/utils';

/**
 * Get all tools formatted for OpenRouter API.
 * This is the main function to use when setting up tool calling.
 */
export function getOpenRouterTools(): OpenRouterToolDefinition[] {
  return toolRegistry.toOpenRouterFormat(toolRegistry.getAll());
}

/**
 * Get document tools only (for edit mode).
 */
export function getDocumentTools(): ToolSpec[] {
  const documentToolIds = [
    'read_document',
    'write_content',
    'clear_document',
    'edit_text',
    'insert_content',
    'format_text',
    'indent_body_paragraphs',
    'search_web',
  ];
  return toolRegistry.getAll().filter((t) => documentToolIds.includes(t.id));
}

/**
 * Get read-only tools (for chat mode).
 */
export function getReadOnlyTools(): ToolSpec[] {
  const readOnlyIds = ['read_document', 'search_web', 'todoread'];
  return toolRegistry.getAll().filter((t) => readOnlyIds.includes(t.id));
}

/**
 * Get planning tools (for plan mode).
 */
export function getPlanningTools(): ToolSpec[] {
  const planningIds = ['read_document', 'search_web', 'todowrite', 'todoread', 'ask_user'];
  return toolRegistry.getAll().filter((t) => planningIds.includes(t.id));
}
