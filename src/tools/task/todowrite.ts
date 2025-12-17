import { z } from 'zod';
import { Tool, toolSuccess } from '../Tool';
import type { Todo } from '../../agent/types';

/**
 * Create or update the task list for tracking multi-step work.
 */
export const todoWriteTool = Tool.define({
  id: 'todowrite',
  name: 'Update Todos',
  description:
    'Create or update the task list for tracking multi-step work. Use this to break down complex tasks, track progress, and show the user what you are working on.',
  parameters: z.object({
    todos: z.array(
      z.object({
        id: z.string().optional().describe('Optional ID to update existing todo. Omit for new todos.'),
        content: z.string().describe('Brief description of the task (1-2 sentences max).'),
        status: z
          .enum(['pending', 'in_progress', 'completed', 'cancelled'])
          .describe('Current status of the task.'),
        priority: z.enum(['low', 'medium', 'high']).optional().describe('Task priority level.'),
      })
    ),
  }),
  requiredContext: ['session'],

  async execute({ todos }, ctx) {
    const session = ctx.session;
    const now = Date.now();

    ctx.emitStatus({
      toolId: 'todowrite',
      status: 'running',
      title: 'Updating task list...',
    });

    // Build updated todo list
    const updatedTodos: Todo[] = [];

    for (const todo of todos) {
      const id = todo.id || crypto.randomUUID();
      const existing = session.todos.find((t) => t.id === id);

      updatedTodos.push({
        id,
        content: todo.content,
        status: todo.status,
        priority: todo.priority ?? existing?.priority ?? 'medium',
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
    }

    // Update session todos
    session.todos = updatedTodos;

    // Count by status
    const pending = updatedTodos.filter((t) => t.status === 'pending').length;
    const inProgress = updatedTodos.filter((t) => t.status === 'in_progress').length;
    const completed = updatedTodos.filter((t) => t.status === 'completed').length;

    return toolSuccess({
      total: updatedTodos.length,
      pending,
      in_progress: inProgress,
      completed,
      incomplete: pending + inProgress,
    });
  },
});
