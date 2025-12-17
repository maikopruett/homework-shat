/**
 * Agent System - Central exports for the agent architecture.
 */

// Types
export type {
  ToolSpec,
  ToolContext,
  ToolStatus,
  ToolResult,
  PermissionLevel,
  Todo,
  TodoInput,
  AgentMode,
  AgentConfig,
  AgentPermissions,
  ToolPermissions,
  Session,
  Message,
  MessagePart,
  TextPart,
  ToolCallPart,
  ToolResultPart,
  MessageMetadata,
  DocumentInfo,
  OpenRouterToolDefinition,
  OpenRouterToolCall,
} from './types';

// Agent configuration
export {
  AGENT_PRESETS,
  createAgentConfig,
  createCustomAgent,
  getPresetForMode,
  type AgentPresetKey,
} from './Agent';

// Agent loop
export { runAgentLoop, type LoopOptions, type LoopResult } from './Loop';
