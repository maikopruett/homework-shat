import { z } from 'zod';
import type {
  ToolSpec,
  ToolContext,
  ToolResult,
  AgentConfig,
  ChatCompletionToolDefinition,
  JsonSchemaProperty,
} from '../agent/types';

// Generic tool spec for registry storage (erases specific param/result types)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyToolSpec = ToolSpec<any, any>;

/**
 * Registry for managing and executing tools.
 *
 * Provides:
 * - Tool registration and discovery
 * - Zod schema validation before execution
 * - Conversion to OpenAI-compatible chat-completions format
 * - Permission checking
 * - Context validation
 */
export class ToolRegistry {
  private tools = new Map<string, AnyToolSpec>();

  /**
   * Register a tool with the registry
   */
  register<TParams, TResult>(tool: ToolSpec<TParams, TResult>): void {
    if (this.tools.has(tool.id)) {
      console.warn(`[ToolRegistry] Tool "${tool.id}" already registered, overwriting`);
    }
    this.tools.set(tool.id, tool as AnyToolSpec);
  }

  /**
   * Register multiple tools at once
   */
  registerAll(tools: AnyToolSpec[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * Get a tool by ID
   */
  get(id: string): AnyToolSpec | undefined {
    return this.tools.get(id);
  }

  resolveId(id: string): string {
    if (this.tools.has(id)) return id;
    const normalized = id.trim().toLowerCase().replace(/[\s-]+/g, '_');
    return this.tools.has(normalized) ? normalized : id;
  }

  repairArguments(toolId: string, args: unknown): unknown {
    const tool = this.get(this.resolveId(toolId));
    if (!tool) return args;
    const schema = this.zodToJsonSchema(tool);
    if (schema.required.length !== 1) return args;
    const field = schema.required[0];
    if (typeof args !== 'object' || args === null || Array.isArray(args)) {
      return { [field]: args };
    }
    const record = args as Record<string, unknown>;
    if (!(field in record) && Object.keys(record).length === 1 && 'value' in record) {
      return { [field]: record.value };
    }
    return args;
  }

  canRunInParallel(toolIds: string[]): boolean {
    return toolIds.every((id) => {
      const execution = this.get(this.resolveId(id))?.execution ?? 'read';
      return execution === 'read' || execution === 'research';
    });
  }

  /**
   * Get all registered tools
   */
  getAll(): AnyToolSpec[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tool IDs
   */
  getIds(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get tools available for a specific agent configuration.
   * Respects the agent's tool permissions (enabled/disabled lists).
   */
  getForAgent(config: AgentConfig): AnyToolSpec[] {
    return this.getAll().filter((tool) => {
      // Check if explicitly disabled
      if (config.tools.disabled.includes(tool.id)) {
        return false;
      }

      // If enabled list is non-empty, use whitelist mode
      if (config.tools.enabled.length > 0) {
        return config.tools.enabled.includes(tool.id);
      }

      // Otherwise, all non-disabled tools are available
      return true;
    });
  }

  /**
   * Convert tools to OpenAI-compatible function calling format.
   */
  toChatCompletionsFormat(tools: AnyToolSpec[]): ChatCompletionToolDefinition[] {
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.id,
        description: tool.description,
        parameters: this.zodToJsonSchema(tool),
      },
    }));
  }

  /**
   * Execute a tool with validation and error handling.
   */
  async execute(
    toolId: string,
    args: unknown,
    context: ToolContext
  ): Promise<ToolResult> {
    const tool = this.get(toolId);

    if (!tool) {
      return {
        success: false,
        error: `Unknown tool: ${toolId}`,
      };
    }

    // Validate parameters with Zod
    const parseResult = tool.parameters.safeParse(args);
    if (!parseResult.success) {
      // Use custom formatter if provided, otherwise generate instructive error
      const errorMessage = tool.formatValidationError
        ? tool.formatValidationError(parseResult.error)
        : this.formatValidationError(toolId, tool, parseResult.error);

      return {
        success: false,
        error: errorMessage,
      };
    }

    // Check permissions
    if (tool.permissions === 'deny') {
      return {
        success: false,
        error: `Tool "${toolId}" is not allowed`,
      };
    }

    // Check if tool requires confirmation (askFirst in agent config)
    if (context.agent.tools.askFirst.includes(toolId)) {
      // In a real implementation, this would prompt the user
      // For now, we'll allow it but log
      console.log(`[ToolRegistry] Tool "${toolId}" requires confirmation (askFirst)`);
    }

    // Check required context
    for (const req of tool.requiredContext ?? []) {
      if (req === 'editor' && !context.editor) {
        return {
          success: false,
          error: `Tool "${toolId}" requires an active editor`,
        };
      }
      if (req === 'document' && !context.document) {
        return {
          success: false,
          error: `Tool "${toolId}" requires an active document`,
        };
      }
      if (req === 'session' && !context.session) {
        return {
          success: false,
          error: `Tool "${toolId}" requires an active session`,
        };
      }
    }

    // Check abort signal
    if (context.abortSignal?.aborted) {
      return {
        success: false,
        error: 'Operation was cancelled',
      };
    }

    // Emit running status
    context.emitStatus({
      toolId,
      status: 'running',
      title: `Executing ${tool.name}...`,
    });

    try {
      const result = await tool.execute(parseResult.data, context);

      // Emit completion status
      context.emitStatus({
        toolId,
        status: result.success ? 'completed' : 'error',
        title: result.success ? `${tool.name} completed` : `${tool.name} failed`,
        metadata: result.metadata,
      });

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';

      context.emitStatus({
        toolId,
        status: 'error',
        title: `${tool.name} failed: ${errorMessage}`,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Format validation errors into AI-instructive messages.
   * Tells the AI exactly what went wrong and how to fix it.
   */
  private formatValidationError(
    toolId: string,
    tool: AnyToolSpec,
    error: z.ZodError
  ): string {
    const issues = error.issues ?? [];

    // Format individual errors
    const formattedErrors = issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
        return `  - ${path}: ${issue.message}`;
      })
      .join('\n');

    // Extract expected parameters from schema description
    const parameterHints = this.extractParameterHints(tool);

    // Build example usage if tool has examples
    let exampleSection = '';
    if (tool.examples && tool.examples.length > 0) {
      exampleSection = '\n\nExample usage:\n' +
        tool.examples.map((ex) => `  ${JSON.stringify(ex)}`).join('\n');
    }

    return (
      `Invalid parameters for tool '${toolId}':\n${formattedErrors}\n\n` +
      `Expected parameters:\n${parameterHints}` +
      exampleSection +
      `\n\nPlease call the ${toolId} tool again with all required parameters.`
    );
  }

  /**
   * Extract parameter hints from tool schema for error messages.
   */
  private extractParameterHints(tool: AnyToolSpec): string {
    try {
      const schema = this.zodToJsonSchema(tool);
      const properties = schema.properties;
      const required = schema.required;

      if (Object.keys(properties).length === 0) {
        return '  (no parameters)';
      }

      const requiredSet = new Set(required);
      const hints: string[] = [];

      for (const [name, prop] of Object.entries(properties)) {
        const p = prop;
        const isRequired = requiredSet.has(name);

        // Handle different type formats
        let typeInfo: string;
        if (p.enum) {
          typeInfo = `one of: ${p.enum.map((value) => JSON.stringify(value)).join(' | ')}`;
        } else if (p.type === 'array') {
          typeInfo = 'array';
        } else {
          typeInfo = Array.isArray(p.type) ? p.type.join(' | ') : (p.type || 'unknown');
        }

        const reqLabel = isRequired ? '(REQUIRED)' : '(optional)';
        const desc = p.description ? ` - ${p.description}` : '';

        hints.push(`  - ${name}: ${typeInfo} ${reqLabel}${desc}`);
      }

      return hints.join('\n');
    } catch (err) {
      console.error('[ToolRegistry] Failed to extract parameter hints:', err);
      return '  See tool description for parameter details.';
    }
  }

  /**
   * Convert a Zod schema to JSON Schema for chat completions.
   */
  private zodToJsonSchema(tool: AnyToolSpec): {
    type: 'object';
    properties: Record<string, JsonSchemaProperty>;
    required: string[];
    additionalProperties: boolean;
  } {
    const jsonSchema = z.toJSONSchema(tool.parameters, { target: 'draft-7' });
    if (jsonSchema.type !== 'object') {
      throw new Error(`Tool "${tool.id}" must use a Zod object parameter schema`);
    }

    return {
      type: 'object',
      properties: (jsonSchema.properties ?? {}) as Record<string, JsonSchemaProperty>,
      required: jsonSchema.required ?? [],
      additionalProperties: false,
    };
  }
}

// Singleton instance for the application
export const toolRegistry = new ToolRegistry();
