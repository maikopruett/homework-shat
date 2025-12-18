/**
 * Tool Display Information
 *
 * Maps tool IDs to human-readable display info (icons, names, status labels).
 * Used by the chat UI to show tool calls in a user-friendly way.
 */

import type { ComponentType, SVGProps } from 'react';
import {
  BookOpen,
  PenLine,
  Wrench,
  FileEdit,
  Trash2,
  Palette,
  IndentIncrease,
  Search,
  CheckSquare,
  HelpCircle,
  Cog,
} from 'lucide-react';

export type LucideIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;

export interface ToolDisplayInfo {
  /** Lucide icon component for the tool */
  Icon: LucideIcon;
  /** Human-readable tool name */
  name: string;
  /** Status text shown while tool is running */
  activeLabel: string;
}

/**
 * Display information for each tool.
 * Keys must match tool IDs from the tool registry.
 */
export const TOOL_DISPLAY_INFO: Record<string, ToolDisplayInfo> = {
  // Document tools
  read_document: {
    Icon: BookOpen,
    name: 'Read Document',
    activeLabel: 'Reading document...',
  },
  write_content: {
    Icon: PenLine,
    name: 'Write Content',
    activeLabel: 'Writing content...',
  },
  edit_text: {
    Icon: Wrench,
    name: 'Edit Text',
    activeLabel: 'Editing text...',
  },
  insert_content: {
    Icon: FileEdit,
    name: 'Insert Content',
    activeLabel: 'Inserting content...',
  },
  clear_document: {
    Icon: Trash2,
    name: 'Clear Document',
    activeLabel: 'Clearing document...',
  },

  // Formatting tools
  format_text: {
    Icon: Palette,
    name: 'Format Text',
    activeLabel: 'Formatting text...',
  },
  indent_body_paragraphs: {
    Icon: IndentIncrease,
    name: 'Indent Paragraphs',
    activeLabel: 'Indenting paragraphs...',
  },

  // Search tools
  search_web: {
    Icon: Search,
    name: 'Search Web',
    activeLabel: 'Searching the web...',
  },

  // Task management
  todowrite: {
    Icon: CheckSquare,
    name: 'Update Tasks',
    activeLabel: 'Updating tasks...',
  },

  // User interaction
  ask_user: {
    Icon: HelpCircle,
    name: 'Ask User',
    activeLabel: 'Waiting for your response...',
  },
};

/** Default icon for unknown tools */
const DEFAULT_ICON: LucideIcon = Cog;

/**
 * Get display info for a tool, with fallback for unknown tools.
 */
export function getToolDisplayInfo(toolId: string): ToolDisplayInfo {
  return (
    TOOL_DISPLAY_INFO[toolId] ?? {
      Icon: DEFAULT_ICON,
      name: toolId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      activeLabel: `Running ${toolId}...`,
    }
  );
}

/**
 * Format tool arguments as a short preview string.
 * Shows the most relevant argument value for quick scanning.
 */
export function formatArgsPreview(args: unknown): string {
  if (!args || typeof args !== 'object') return '';

  const obj = args as Record<string, unknown>;

  // Priority order for preview - show the most informative field
  const previewFields = [
    'query', // search_web
    'content', // write_content, insert_content
    'text', // edit_text
    'question', // ask_user
    'todos', // todowrite
  ];

  for (const field of previewFields) {
    if (obj[field] !== undefined) {
      const value = obj[field];
      if (typeof value === 'string') {
        // Truncate long strings
        return value.length > 50 ? value.slice(0, 50) + '...' : value;
      }
      if (Array.isArray(value)) {
        return `${value.length} item${value.length === 1 ? '' : 's'}`;
      }
    }
  }

  // Fallback: show first string field
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string' && value.length > 0) {
      const preview = value.length > 40 ? value.slice(0, 40) + '...' : value;
      return `${key}: ${preview}`;
    }
  }

  return '';
}
