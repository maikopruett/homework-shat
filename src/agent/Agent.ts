/**
 * Agent Configuration System
 *
 * Provides preset agent configurations for different modes:
 * - editor: Full document editing capabilities
 * - chat: Read-only conversational mode
 * - planner: Task planning with todo management
 */

import type { AgentConfig, AgentMode, AgentPermissions, ToolPermissions } from './types';

// ==================== Preset Configurations ====================

const EDITOR_TOOLS: ToolPermissions = {
  enabled: [], // Empty = all tools enabled
  disabled: ['todowrite', 'todoread'], // No task tracking in basic edit mode
  askFirst: ['clear_document'], // Confirm destructive actions
};

const CHAT_TOOLS: ToolPermissions = {
  enabled: ['read_document', 'search_web', 'todoread'],
  disabled: [],
  askFirst: [],
};

const PLANNER_TOOLS: ToolPermissions = {
  enabled: ['read_document', 'search_web', 'todowrite', 'todoread', 'ask_user'],
  disabled: [],
  askFirst: [],
};

const ESSAY_PLANNER_TOOLS: ToolPermissions = {
  enabled: [
    'read_document',
    'search_web',
    'todowrite',
    'todoread',
    'ask_user',
    'write_content',
    'edit_text',
    'insert_content',
    'format_text',
    'indent_body_paragraphs',
  ],
  disabled: [],
  askFirst: ['clear_document'],
};

const FULL_TOOLS: ToolPermissions = {
  enabled: [], // All tools
  disabled: [],
  askFirst: ['clear_document'],
};

const EDITOR_PERMISSIONS: AgentPermissions = {
  canEditDocument: true,
  canSearch: true,
  canSpawnSubagent: false,
  maxFollowUps: 20, // Allow multi-step editing workflows
};

const CHAT_PERMISSIONS: AgentPermissions = {
  canEditDocument: false,
  canSearch: true,
  canSpawnSubagent: false,
  maxFollowUps: 10, // Limit for read-only mode
};

const PLANNER_PERMISSIONS: AgentPermissions = {
  canEditDocument: false,
  canSearch: true,
  canSpawnSubagent: false,
  maxFollowUps: 15, // Moderate for planning workflows
};

const ESSAY_PLANNER_PERMISSIONS: AgentPermissions = {
  canEditDocument: true,
  canSearch: true,
  canSpawnSubagent: false,
  maxFollowUps: 20, // More for planning + execution workflow
};

const FULL_PERMISSIONS: AgentPermissions = {
  canEditDocument: true,
  canSearch: true,
  canSpawnSubagent: true,
  maxFollowUps: 20, // Maximum flexibility
};

// ==================== Agent Presets ====================

export const AGENT_PRESETS = {
  /**
   * Document Editor - Full editing capabilities with all document tools.
   * Use for standard document writing and editing tasks.
   */
  editor: {
    id: 'editor',
    name: 'Document Editor',
    mode: 'edit' as AgentMode,
    tools: EDITOR_TOOLS,
    permissions: EDITOR_PERMISSIONS,
  },

  /**
   * Chat Assistant - Read-only mode for conversations.
   * Can read documents and search but cannot edit.
   */
  chat: {
    id: 'chat',
    name: 'Chat Assistant',
    mode: 'chat' as AgentMode,
    tools: CHAT_TOOLS,
    permissions: CHAT_PERMISSIONS,
  },

  /**
   * Task Planner - Planning mode with task tracking.
   * Can create todos and research but not edit documents directly.
   */
  planner: {
    id: 'planner',
    name: 'Task Planner',
    mode: 'plan' as AgentMode,
    tools: PLANNER_TOOLS,
    permissions: PLANNER_PERMISSIONS,
  },

  /**
   * Full Agent - All capabilities enabled.
   * Use for complex multi-step workflows.
   */
  full: {
    id: 'full',
    name: 'Full Agent',
    mode: 'edit' as AgentMode,
    tools: FULL_TOOLS,
    permissions: FULL_PERMISSIONS,
  },

  /**
   * Essay Planner - Planning mode with ask_user and document editing.
   * Auto-activated when essay writing is detected.
   * Asks clarifying questions, creates task list, then writes.
   */
  essay_planner: {
    id: 'essay_planner',
    name: 'Essay Planner',
    mode: 'plan' as AgentMode,
    tools: ESSAY_PLANNER_TOOLS,
    permissions: ESSAY_PLANNER_PERMISSIONS,
  },
} as const;

export type AgentPresetKey = keyof typeof AGENT_PRESETS;

// ==================== Factory Functions ====================

/**
 * Create an agent configuration from a preset with optional overrides.
 */
export function createAgentConfig(
  preset: AgentPresetKey,
  overrides?: Partial<Omit<AgentConfig, 'id' | 'name' | 'mode'>> & {
    model?: string;
    systemPrompt?: string;
  }
): AgentConfig {
  const base = AGENT_PRESETS[preset];

  return {
    id: base.id,
    name: base.name,
    mode: base.mode,
    model: overrides?.model ?? 'x-ai/grok-4-fast',
    systemPrompt: overrides?.systemPrompt ?? '',
    temperature: overrides?.temperature ?? 0.7,
    maxTokens: overrides?.maxTokens ?? 4096,
    tools: {
      ...base.tools,
      ...overrides?.tools,
    },
    permissions: {
      ...base.permissions,
      ...overrides?.permissions,
    },
  };
}

/**
 * Create a custom agent configuration from scratch.
 */
export function createCustomAgent(config: {
  id: string;
  name: string;
  mode: AgentMode;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: Partial<ToolPermissions>;
  permissions?: Partial<AgentPermissions>;
}): AgentConfig {
  return {
    id: config.id,
    name: config.name,
    mode: config.mode,
    model: config.model ?? 'x-ai/grok-4-fast',
    systemPrompt: config.systemPrompt ?? '',
    temperature: config.temperature ?? 0.7,
    maxTokens: config.maxTokens ?? 4096,
    tools: {
      enabled: config.tools?.enabled ?? [],
      disabled: config.tools?.disabled ?? [],
      askFirst: config.tools?.askFirst ?? [],
    },
    permissions: {
      canEditDocument: config.permissions?.canEditDocument ?? true,
      canSearch: config.permissions?.canSearch ?? true,
      canSpawnSubagent: config.permissions?.canSpawnSubagent ?? false,
      maxFollowUps: config.permissions?.maxFollowUps ?? 20,
    },
  };
}

/**
 * Get the appropriate preset for a chat mode.
 */
export function getPresetForMode(mode: 'edit' | 'chat'): AgentPresetKey {
  return mode === 'edit' ? 'editor' : 'chat';
}
