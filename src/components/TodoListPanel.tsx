/**
 * TodoListPanel Component
 *
 * Displays the agent's task list above chat messages.
 * Shows progress and individual task statuses.
 */

import { useState } from 'react';
import type { Todo } from '../agent/types';

interface TodoListPanelProps {
  todos: Todo[];
  progress: {
    total: number;
    completed: number;
    percentage: number;
  };
}

function getStatusIcon(status: Todo['status']) {
  switch (status) {
    case 'pending':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400">
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
    case 'in_progress':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-500 animate-spin">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      );
    case 'completed':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-green-500">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
    case 'cancelled':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      );
    default:
      return null;
  }
}

function getStatusColor(status: Todo['status']) {
  switch (status) {
    case 'pending':
      return 'text-gray-600';
    case 'in_progress':
      return 'text-blue-600 font-medium';
    case 'completed':
      return 'text-gray-400 line-through';
    case 'cancelled':
      return 'text-gray-400 line-through';
    default:
      return 'text-gray-600';
  }
}

export default function TodoListPanel({ todos, progress }: TodoListPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Don't render if no todos
  if (todos.length === 0) {
    return null;
  }

  const inProgressTask = todos.find(t => t.status === 'in_progress');

  return (
    <div className="border-b border-gray-200 bg-gradient-to-b from-blue-50/50 to-white">
      {/* Header - always visible */}
      <button
        type="button"
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-blue-50/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-600">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          <span className="text-sm font-medium text-gray-800">
            Tasks ({progress.completed}/{progress.total})
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Progress bar */}
          <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>

          {/* Collapse icon */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`text-gray-500 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-180'}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {/* Current task preview when collapsed */}
      {isCollapsed && inProgressTask && (
        <div className="px-4 pb-2 flex items-center gap-2 text-xs text-blue-600">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span className="truncate">{inProgressTask.content}</span>
        </div>
      )}

      {/* Task list */}
      {!isCollapsed && (
        <div className="px-3 pb-3 max-h-40 overflow-y-auto">
          <div className="space-y-1">
            {todos.map((todo) => (
              <div
                key={todo.id}
                className={`flex items-start gap-2 px-2 py-1.5 rounded-lg transition-colors ${
                  todo.status === 'in_progress' ? 'bg-blue-50' : ''
                }`}
              >
                <div className="flex-shrink-0 mt-0.5">
                  {getStatusIcon(todo.status)}
                </div>
                <span className={`text-sm ${getStatusColor(todo.status)}`}>
                  {todo.content}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
