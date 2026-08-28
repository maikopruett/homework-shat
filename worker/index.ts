interface WorkerEnv extends Env {
  EXA_API_KEY: string;
  OPENROUTER_API_KEY: string;
}

const DEFAULT_WORKERS_AI_MODEL = '@cf/google/gemma-4-26b-a4b-it';
const SUPPORTED_WORKERS_AI_MODELS = new Set([
  DEFAULT_WORKERS_AI_MODEL,
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/mistralai/mistral-small-3.1-24b-instruct',
]);
const SUPPORTED_OPENROUTER_MODELS = new Set([
  'z-ai/glm-5.3-flash',
]);

interface WorkersAiChatRequest extends Record<string, unknown> {
  model?: string;
  messages?: unknown[];
}

interface ExaSearchResult {
  title: string;
  url: string;
  text: string;
  publishedDate?: string;
  author?: string;
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
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
} satisfies ExportedHandler<WorkerEnv>;

async function handleChat(request: Request, env: WorkerEnv): Promise<Response> {
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
    const contentLength = Number(request.headers.get('Content-Length') || 0);
    if (contentLength > 1_000_000) {
      return Response.json({ error: 'Request body is too large' }, { status: 413 });
    }

    const body = await request.json<WorkersAiChatRequest>();
    const requestedModel = typeof body.model === 'string' ? body.model : DEFAULT_WORKERS_AI_MODEL;

    if (!SUPPORTED_WORKERS_AI_MODELS.has(requestedModel) && !SUPPORTED_OPENROUTER_MODELS.has(requestedModel)) {
      return Response.json({ error: 'Unsupported model' }, { status: 400 });
    }

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return Response.json({ error: 'Messages are required' }, { status: 400 });
    }

    let response: Response;

    if (SUPPORTED_OPENROUTER_MODELS.has(requestedModel)) {
      response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...body, model: requestedModel }),
        signal: request.signal,
      });
    } else {
      const inputs = { ...body };
      delete inputs.model;
      response = await env.AI.run(requestedModel, inputs, {
        returnRawResponse: true,
        signal: request.signal,
      });
    }

    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store');

    return new Response(response.body, { status: response.status, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(JSON.stringify({ message: 'AI chat failed', error: message }));
    return Response.json({ error: message }, { status: 500 });
  }
}

async function handleSearch(request: Request, env: WorkerEnv): Promise<Response> {
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
