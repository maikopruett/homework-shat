import { z } from 'zod';
import { Tool, toolSuccess, toolError } from '../Tool';
import { searchExa, formatSearchResultsForAI } from '../../api/exa';

/**
 * Search the web for information.
 */
export const searchWebTool = Tool.define({
  id: 'search_web',
  name: 'Search Web',
  description: `Search the web for information using the Exa search API.

WHEN TO USE: When writing essays that need citations, researching topics, fact-checking, or finding supporting evidence. Essential for academic papers.

PARAMETERS:
- query: Search terms to find relevant information. Be specific for better results (e.g., "climate change effects on coral reefs 2024" rather than just "climate change").

OUTPUT: Returns { results_count, results, current_date } where results contains:
- title: Article title
- url: Source URL for citation
- snippet: Relevant excerpt from the content
- author: Author name (if available)
- published_date: Publication date (if available)

TIPS:
- Use specific, focused queries for better results
- Include the results in your essay with proper citations
- Use current_date for "accessed on" in citations
- Search multiple times for different aspects of a topic

ERRORS: Returns error if search service is unavailable.`,
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
