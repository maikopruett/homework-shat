import { z } from 'zod';
import { Tool, toolSuccess, toolError } from '../Tool';
import { searchExa, formatSearchResultsForAI } from '../../api/exa';

/**
 * Search the web for information.
 */
export const searchWebTool = Tool.define({
  id: 'search_web',
  name: 'Search Web',
  description:
    'Search the web for information to include in the document. Use this when writing essays that need citations, researching topics, or finding facts. Returns search results that you should use for citations.',
  parameters: z.object({
    query: z.string().describe('The search query to find relevant information.'),
  }),

  async execute({ query }, ctx) {
    ctx.emitStatus({
      toolId: 'search_web',
      status: 'running',
      title: `Searching for "${query.slice(0, 50)}${query.length > 50 ? '...' : ''}"...`,
    });

    try {
      const results = await searchExa(query);
      const formattedResults = formatSearchResultsForAI(results);
      const currentDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      return toolSuccess(
        {
          results_count: results.length,
          results: formattedResults,
          current_date: currentDate,
        },
        { searchResults: results }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Search failed';
      return toolError(message);
    }
  },
});
