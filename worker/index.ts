interface Env {
  OPENROUTER_API_KEY: string;
  EXA_API_KEY: string;
  ASSETS: Fetcher;
}

interface ExaSearchResult {
  title: string;
  url: string;
  text: string;
  publishedDate?: string;
  author?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle API routes
    if (url.pathname === '/api/chat') {
      return handleChat(request, env);
    }

    if (url.pathname === '/api/search') {
      return handleSearch(request, env);
    }

    // Serve static assets for all other routes
    return env.ASSETS.fetch(request);
  },
};

async function handleChat(request: Request, env: Env): Promise<Response> {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  // Only allow POST
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.text();

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': request.headers.get('Origin') || 'https://docfake.com',
        'X-Title': 'Homework Helper',
      },
      body,
    });

    const contentType = response.headers.get('Content-Type') || '';
    const isStreaming = contentType.includes('text/event-stream');

    if (isStreaming) {
      return new Response(response.body, {
        status: response.status,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    const data = await response.text();
    return new Response(data, {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function handleSearch(request: Request, env: Env): Promise<Response> {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  // Only allow POST
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { query } = await request.json() as { query: string };
    console.log('[Worker Search] Received query:', query);

    if (!query || typeof query !== 'string') {
      console.log('[Worker Search] Invalid query');
      return new Response(JSON.stringify({ error: 'Query is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Call Exa API
    console.log('[Worker Search] Calling Exa API...');
    const response = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.EXA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        numResults: 5,
        contents: {
          text: {
            maxCharacters: 2000,
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log('[Worker Search] Exa API error:', response.status, errorText);
      throw new Error(`Exa API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as { results: ExaSearchResult[] };
    console.log('[Worker Search] Got', data.results?.length || 0, 'results from Exa');

    // Transform results to a simpler format
    const results = data.results.map((result: ExaSearchResult) => ({
      title: result.title || 'Untitled',
      url: result.url,
      snippet: result.text || '',
      publishedDate: result.publishedDate,
      author: result.author,
    }));

    console.log('[Worker Search] Returning', results.length, 'results');
    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.log('[Worker Search] Error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

