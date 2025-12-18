import { z } from 'zod';
import type { ToolSpec, ToolContext, ToolResult, PermissionLevel } from '../agent/types';

/**
 * Helper for defining tools with Zod schema validation.
 *
 * Usage:
 * ```typescript
 * export const myTool = Tool.define({
 *   id: 'my_tool',
 *   name: 'My Tool',
 *   description: 'Does something useful',
 *   parameters: z.object({
 *     input: z.string().describe('The input value'),
 *   }),
 *   async execute({ input }, ctx) {
 *     ctx.emitStatus({ toolId: 'my_tool', status: 'running', title: 'Working...' });
 *     // Do work...
 *     return { success: true, data: result };
 *   },
 * });
 * ```
 */
export class Tool {
  static define<TParams, TResult>(spec: {
    id: string;
    name: string;
    description: string;
    parameters: z.ZodSchema<TParams>;
    execute: (params: TParams, context: ToolContext) => Promise<ToolResult<TResult>>;
    permissions?: PermissionLevel;
    requiredContext?: ('document' | 'editor' | 'session')[];
    /** Example usage of the tool - shown in error messages to guide AI */
    examples?: Record<string, unknown>[];
    /** Custom validation error formatter - provides AI-friendly error messages */
    formatValidationError?: (error: z.ZodError) => string;
  }): ToolSpec<TParams, TResult> {
    return {
      id: spec.id,
      name: spec.name,
      description: spec.description,
      parameters: spec.parameters,
      execute: spec.execute,
      permissions: spec.permissions ?? 'allow',
      requiredContext: spec.requiredContext ?? [],
      examples: spec.examples,
      formatValidationError: spec.formatValidationError,
    };
  }
}

/**
 * Helper to create a successful tool result
 */
export function toolSuccess<T>(data: T, metadata?: Record<string, unknown>): ToolResult<T> {
  return {
    success: true,
    data,
    metadata,
  };
}

/**
 * Helper to create a failed tool result
 */
export function toolError(error: string, metadata?: Record<string, unknown>): ToolResult<never> {
  return {
    success: false,
    error,
    metadata,
  };
}
