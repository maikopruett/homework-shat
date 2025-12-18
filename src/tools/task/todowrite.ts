import { z } from 'zod';
import { Tool, toolSuccess } from '../Tool';
import type { Todo } from '../../agent/types';

/**
 * Create or update the task list for tracking multi-step work.
 */
export const todoWriteTool = Tool.define({
  id: 'todowrite',
  name: 'Update Todos',
  description: `Create or update the task list to track multi-step work and show progress to the user.

WHEN TO USE: When working on complex tasks with multiple steps. Helps users see your progress and plan.

PARAMETERS (IMPORTANT - use "todos" NOT "tasks"):
- todos: Array of todo items. Each item has:
  * id: (optional) Include to update existing todo, omit for new todos
  * content: Brief task description (1-2 sentences max)
  * status: One of "pending" | "in_progress" | "completed" | "cancelled"
  * priority: (optional) "low" | "medium" | "high"

OUTPUT: Returns { total, pending, in_progress, completed, incomplete }

TIPS:
- Break complex work into 3-7 clear steps
- Update status as you complete each step
- Keep task descriptions brief and actionable
- Only one task should be "in_progress" at a time

EXAMPLE:
{
  "todos": [
    { "content": "Research topic", "status": "completed" },
    { "content": "Write introduction", "status": "in_progress" },
    { "content": "Write body paragraphs", "status": "pending" }
  ]
}`,
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
    ).describe('Array of todo items to create or update. Use "todos" NOT "tasks".'),
  }),
  requiredContext: ['session'],
  examples: [
    {
      todos: [
        { content: 'Research topic', status: 'in_progress' },
        { content: 'Write introduction', status: 'pending' },
        { content: 'Write conclusion', status: 'pending' },
      ],
    },
  ],

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
