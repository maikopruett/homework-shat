import { z } from 'zod';
import { Tool, toolSuccess, toolError } from '../Tool';
import { searchExa } from '../../api/exa';
import { MAX_ESSAY_SEARCH_QUERIES, MAX_ESSAY_SOURCES, mergeSources, touchEssaySpec } from '../../agent/essay';

interface SearchSourceOutput {
  source_id: string;
  title: string;
  url: string;
  snippet: string;
  author?: string;
  published_date?: string;
}

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

OUTPUT: Returns { results_count, sources, current_date } where each source contains a stable source_id plus:
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
    query: z.string().trim().min(1).describe('Specific search terms to find relevant information.'),
  }),
  examples: [
    { query: 'effects of climate change on coral reefs 2025' },
  ],
  execution: 'state-write',

  async execute({ query }, ctx) {
    const spec = ctx.session.essay;
    const remaining = Math.max(0, MAX_ESSAY_SOURCES - spec.searchResultsUsed);
    if (remaining === 0 || spec.searchQueriesUsed >= MAX_ESSAY_SEARCH_QUERIES) {
      return toolSuccess({
        results_count: 0,
        sources: [] as SearchSourceOutput[],
        current_date: new Date().toLocaleDateString('en-US'),
        total_sources: spec.sources.length,
        budget_exhausted: true,
        instruction: 'Research is complete. Do not search again; advance to outlining or continue drafting with the retained sources.',
      });
    }

    spec.searchQueriesUsed += 1;
    touchEssaySpec(spec);

    ctx.emitStatus({
      toolId: 'search_web',
      status: 'running',
      title: `Searching for "${query.slice(0, 50)}${query.length > 50 ? '...' : ''}"...`,
    });

    try {
      const results = (await searchExa(query)).slice(0, remaining);
      spec.searchResultsUsed += results.length;
      const currentDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      const ledger = mergeSources(spec, results.map((result) => ({
        title: result.title,
        url: result.url,
        snippet: result.snippet.slice(0, 1200),
        author: result.author,
        publishedDate: result.publishedDate,
        accessedAt: new Date().toISOString(),
        claims: [],
      })));
      const resultUrls = new Set(results.map((result) => result.url));

      return toolSuccess(
        {
          results_count: results.length,
          sources: ledger
            .filter((source) => resultUrls.has(source.url))
            .map((source) => ({
              source_id: source.id,
              title: source.title,
              url: source.url,
              snippet: source.snippet,
              author: source.author,
              published_date: source.publishedDate,
            })),
          current_date: currentDate,
          total_sources: ledger.length,
          budget_exhausted: spec.searchResultsUsed >= MAX_ESSAY_SOURCES
            || spec.searchQueriesUsed >= MAX_ESSAY_SEARCH_QUERIES,
          instruction: ledger.length >= MAX_ESSAY_SOURCES
            ? 'Research budget reached. Advance the essay workflow using the retained sources.'
            : 'Use these sources and continue the essay workflow.',
        },
        { searchResults: results }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Search failed';
      return toolError(message);
    }
  },
});
