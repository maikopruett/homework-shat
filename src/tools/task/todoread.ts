import { z } from 'zod';
import { Tool, toolSuccess } from '../Tool';

/**
 * Read the current task list.
 */
export const todoReadTool = Tool.define({
  id: 'todoread',
  name: 'Read Todos',
  description: `Read the current task list to check pending work and progress.

WHEN TO USE: To review what tasks are pending, in progress, or completed. Helpful when resuming work or checking what's left to do.

PARAMETERS: None required - pass empty object {}.

OUTPUT: Returns { todos, total, pending, in_progress, completed, incomplete } where:
- todos: Array of formatted task strings with status icons
  * [ ] = pending
  * [~] = in progress
  * [x] = completed
  * [-] = cancelled
- total: Total number of tasks
- pending: Count of pending tasks
- in_progress: Count of in-progress tasks
- completed: Count of completed tasks
- incomplete: Count of pending + in_progress tasks`,
  parameters: z.object({}),
  requiredContext: ['session'],

  async execute(_params, ctx) {
    const session = ctx.session;

    ctx.emitStatus({
      toolId: 'todoread',
      status: 'running',
      title: 'Reading task list...',
    });

    const todos = session.todos;
    const pending = todos.filter((t) => t.status === 'pending');
    const inProgress = todos.filter((t) => t.status === 'in_progress');
    const completed = todos.filter((t) => t.status === 'completed');

    // Format for display
    const formatted = todos.map((t) => {
      const statusIcon = {
        pending: '[ ]',
        in_progress: '[~]',
        completed: '[x]',
        cancelled: '[-]',
      }[t.status];
      const priority = t.priority ? ` (${t.priority})` : '';
      return `${statusIcon} ${t.content}${priority}`;
    });

    return toolSuccess({
      todos: formatted,
      total: todos.length,
      pending: pending.length,
      in_progress: inProgress.length,
      completed: completed.length,
      incomplete: pending.length + inProgress.length,
    });
  },
});
