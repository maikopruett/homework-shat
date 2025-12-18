import { z } from 'zod';
import type { TiptapEditorHandle } from '../components/TiptapEditor';

// ==================== Tool Types ====================

export type PermissionLevel = 'allow' | 'ask' | 'deny';

export interface ToolSpec<TParams = unknown, TResult = unknown> {
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
}

export interface ToolContext {
  session: Session;
  editor: TiptapEditorHandle | null;
  document: DocumentInfo | null;
  agent: AgentConfig;
  emitStatus: (status: ToolStatus) => void;
  abortSignal?: AbortSignal;
}

export interface ToolStatus {
  toolId: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  title: string;
  metadata?: Record<string, unknown>;
}

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: Record<string, unknown>;
}

// ==================== Todo Types ====================

export interface Todo {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority?: 'low' | 'medium' | 'high';
  createdAt: number;
  updatedAt: number;
}

export const TodoSchema = z.object({
  id: z.string().optional(),
  content: z.string().min(1),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
  priority: z.enum(['low', 'medium', 'high']).optional(),
});

export type TodoInput = z.infer<typeof TodoSchema>;

// ==================== Agent Types ====================

export type AgentMode = 'edit' | 'chat' | 'plan';

export interface ToolPermissions {
  enabled: string[];   // Tool IDs that are enabled (empty = all allowed)
  disabled: string[];  // Tool IDs that are explicitly disabled
  askFirst: string[];  // Tools that require user confirmation before execution
}

export interface AgentPermissions {
  canEditDocument: boolean;
  canSearch: boolean;
  canSpawnSubagent: boolean;
  maxFollowUps: number;  // How many tool execution cycles allowed (1-20)
}

export interface AgentConfig {
  id: string;
  name: string;
  mode: AgentMode;
  model: string;
  systemPrompt: string;
  temperature?: number;
  maxTokens?: number;
  tools: ToolPermissions;
  permissions: AgentPermissions;
  /** Options for controlling tool calling behavior */
  toolCallingOptions?: ToolCallingOptions;
}

// ==================== Session Types ====================

export interface Session {
  id: string;
  parentId?: string;        // For subagent sessions
  documentId?: string;      // Associated document
  agentConfig: AgentConfig;
  messages: Message[];
  todos: Todo[];
  createdAt: number;
  updatedAt: number;
  status: 'active' | 'completed' | 'error';
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  parts: MessagePart[];
  timestamp: number;
  metadata?: MessageMetadata;
}

export type MessagePart =
  | TextPart
  | ToolCallPart
  | ToolResultPart;

export interface TextPart {
  type: 'text';
  content: string;
}

export interface ToolCallPart {
  type: 'tool_call';
  callId: string;
  toolId: string;
  arguments: unknown;
  status: ToolStatus;
}

export interface ToolResultPart {
  type: 'tool_result';
  callId: string;
  toolId: string;
  result: unknown;
  error?: string;
}

export interface MessageMetadata {
  model?: string;
  tokenCount?: number;
  finishReason?: string;
  ttft?: number;  // Time to first token
  tps?: number;   // Tokens per second
}

// ==================== Document Types ====================

// Simplified document info for tool context (not the full Document from useDocuments)
export interface DocumentInfo {
  id: string;
  title: string;
  content: string;  // HTML content
}

// ==================== OpenRouter Integration Types ====================

/**
 * JSON Schema property type for tool parameters.
 * Supports the full JSON Schema specification used by OpenRouter.
 */
export interface JsonSchemaProperty {
  type?: string | string[];
  description?: string;
  enum?: (string | number | boolean | null)[];
  const?: unknown;
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean | JsonSchemaProperty;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  oneOf?: JsonSchemaProperty[];
  anyOf?: JsonSchemaProperty[];
  allOf?: JsonSchemaProperty[];
  nullable?: boolean;
  minItems?: number;
  maxItems?: number;
}

/**
 * Tool choice configuration for controlling model tool usage.
 */
export type ToolChoiceOption =
  | 'auto'
  | 'none'
  | 'required'
  | { type: 'function'; function: { name: string } };

/**
 * Options for controlling tool calling behavior.
 */
export interface ToolCallingOptions {
  /** How the model should choose tools */
  tool_choice?: ToolChoiceOption;
  /** Whether tools can be called in parallel (default: true) */
  parallel_tool_calls?: boolean;
}

// JSON Schema format for OpenRouter tool definitions
export interface OpenRouterToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    strict?: boolean;
    parameters: {
      type: 'object';
      properties: Record<string, JsonSchemaProperty>;
      required?: string[];
      additionalProperties?: boolean;
    };
  };
}

// Tool call from OpenRouter response
export interface OpenRouterToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;  // JSON string
  };
}

// ==================== User Question Types ====================

export interface UserQuestionOption {
  id: string;
  label: string;
  description?: string;
}

export interface UserQuestionRequest {
  questionId: string;
  question: string;
  options: UserQuestionOption[];
  allowMultiple: boolean;
  timestamp: number;
}

export interface UserQuestionResponse {
  questionId: string;
  selectedOptions: string[];
  timestamp: number;
}

// Schema for ask_user tool parameters
export const UserQuestionSchema = z.object({
  question: z.string().describe('The question to ask the user'),
  options: z.array(z.object({
    id: z.string().describe('Unique identifier for this option'),
    label: z.string().describe('Button label shown to user'),
    description: z.string().optional().describe('Additional context for this option'),
  })).min(2).max(6).describe('Available options for the user to choose from'),
  allowMultiple: z.boolean().optional().default(false).describe('Allow selecting multiple options'),
});

export type UserQuestionParams = z.infer<typeof UserQuestionSchema>;
