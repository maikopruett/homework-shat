const SEARCH_API_URL = '/api/search';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
  author?: string;
}

export interface SearchResponse {
  results: SearchResult[];
  error?: string;
}

export async function searchExa(query: string): Promise<SearchResult[]> {
  console.log('[Exa Client] Starting search for:', query);
  try {
    const response = await fetch(SEARCH_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    console.log('[Exa Client] Response status:', response.status);

    if (!response.ok) {
      const error = await response.text();
      console.error('[Exa Client] Error response:', error);
      throw new Error(`Search API error: ${response.status} - ${error}`);
    }

    const data: SearchResponse = await response.json();
    console.log('[Exa Client] Got data:', data.results?.length || 0, 'results');
    
    if (data.error) {
      console.error('[Exa Client] API returned error:', data.error);
      throw new Error(data.error);
    }

    return data.results || [];
  } catch (error) {
    console.error('[Exa Client] Search error:', error);
    throw error;
  }
}

// Format search results for AI context
export function formatSearchResultsForAI(results: SearchResult[]): string {
  if (results.length === 0) {
    return 'No search results found.';
  }

  const formatted = results.map((result, index) => {
    const parts = [`[${index + 1}] "${result.title}"`];
    if (result.author) {
      parts.push(`by ${result.author}`);
    }
    if (result.publishedDate) {
      const date = new Date(result.publishedDate);
      parts.push(`(${date.toLocaleDateString()})`);
    }
    parts.push(`\nURL: ${result.url}`);
    parts.push(`\n${result.snippet}`);
    return parts.join(' ');
  }).join('\n\n---\n\n');

  return `Search Results:\n\n${formatted}`;
}

