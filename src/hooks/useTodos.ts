/**
 * useTodos Hook
 *
 * Manages todo state for agent task tracking.
 * Persists to localStorage per session/document.
 */

import { useState, useEffect, useCallback } from 'react';
import type { Todo } from '../agent/types';

const STORAGE_KEY_PREFIX = 'homework-todos-';

interface UseTodosOptions {
  sessionId?: string;
  documentId?: string;
}

interface UseTodosReturn {
  todos: Todo[];
  setTodos: (todos: Todo[]) => void;
  addTodo: (content: string, priority?: 'low' | 'medium' | 'high') => Todo;
  updateTodo: (id: string, updates: Partial<Omit<Todo, 'id' | 'createdAt'>>) => void;
  removeTodo: (id: string) => void;
  clearCompleted: () => void;
  getInProgress: () => Todo | undefined;
  getPending: () => Todo[];
  getCompleted: () => Todo[];
  progress: { total: number; completed: number; percentage: number };
}

/**
 * Get storage key for todos based on session or document ID.
 */
function getStorageKey(options: UseTodosOptions): string {
  if (options.sessionId) {
    return `${STORAGE_KEY_PREFIX}session-${options.sessionId}`;
  }
  if (options.documentId) {
    return `${STORAGE_KEY_PREFIX}doc-${options.documentId}`;
  }
  return `${STORAGE_KEY_PREFIX}global`;
}

/**
 * Load todos from localStorage.
 */
function loadTodos(key: string): Todo[] {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Save todos to localStorage.
 */
function saveTodos(key: string, todos: Todo[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(todos));
  } catch (err) {
    console.error('[useTodos] Failed to save:', err);
  }
}

/**
 * Hook for managing agent todos.
 */
export function useTodos(options: UseTodosOptions = {}): UseTodosReturn {
  const storageKey = getStorageKey(options);
  const [todos, setTodosState] = useState<Todo[]>(() => loadTodos(storageKey));

  // Persist on change
  useEffect(() => {
    saveTodos(storageKey, todos);
  }, [storageKey, todos]);

  // Reload when key changes
  useEffect(() => {
    setTodosState(loadTodos(storageKey));
  }, [storageKey]);

  const setTodos = useCallback((newTodos: Todo[]) => {
    setTodosState(newTodos);
  }, []);

  const addTodo = useCallback(
    (content: string, priority: 'low' | 'medium' | 'high' = 'medium'): Todo => {
      const now = Date.now();
      const todo: Todo = {
        id: crypto.randomUUID(),
        content,
        status: 'pending',
        priority,
        createdAt: now,
        updatedAt: now,
      };
      setTodosState((prev) => [...prev, todo]);
      return todo;
    },
    []
  );

  const updateTodo = useCallback(
    (id: string, updates: Partial<Omit<Todo, 'id' | 'createdAt'>>) => {
      setTodosState((prev) =>
        prev.map((todo) =>
          todo.id === id
            ? { ...todo, ...updates, updatedAt: Date.now() }
            : todo
        )
      );
    },
    []
  );

  const removeTodo = useCallback((id: string) => {
    setTodosState((prev) => prev.filter((todo) => todo.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setTodosState((prev) => prev.filter((todo) => todo.status !== 'completed'));
  }, []);

  const getInProgress = useCallback((): Todo | undefined => {
    return todos.find((todo) => todo.status === 'in_progress');
  }, [todos]);

  const getPending = useCallback((): Todo[] => {
    return todos.filter((todo) => todo.status === 'pending');
  }, [todos]);

  const getCompleted = useCallback((): Todo[] => {
    return todos.filter((todo) => todo.status === 'completed');
  }, [todos]);

  // Calculate progress
  const total = todos.length;
  const completed = todos.filter((t) => t.status === 'completed').length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    todos,
    setTodos,
    addTodo,
    updateTodo,
    removeTodo,
    clearCompleted,
    getInProgress,
    getPending,
    getCompleted,
    progress: { total, completed, percentage },
  };
}
