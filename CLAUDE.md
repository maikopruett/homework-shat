# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a React-based homework assistance application with an AI-powered document editor. It uses OpenRouter for LLM access, Exa for web search, TipTap for rich text editing, and Cloudflare Workers for API proxying.

## Development Commands

### Local Development
```bash
# Start Vite dev server (frontend on http://localhost:5173)
npm run dev

# Start Cloudflare Worker (API proxy on http://localhost:8787)
npx wrangler dev worker/index.ts

# Run both simultaneously for full local development
```

### Building and Deployment
```bash
# Build frontend for production
npm run build

# Preview production build locally
npm run preview

# Lint the codebase
npm run lint

# Deploy to Cloudflare Pages
npx wrangler deploy

## btca

Trigger: user says "use btca" (for codebase/docs questions).

Run:
- btca ask -t <tech> -q "<question>"

Available <tech>: tailwindcss, react, opencode, effect, tiptap
```

### Environment Setup
- Copy `.env.example` to `.env.local`
- Set API keys using Cloudflare secrets: `npx wrangler secret put OPENROUTER_API_KEY`
- Set `EXA_API_KEY` secret for search functionality

## Architecture Overview

### Frontend Architecture (React + TypeScript + Vite)

**Core State Management:**
- `useDocuments` hook (`src/hooks/useDocuments.ts`) - Central state manager for documents, chat, personas, and templates. This is the largest and most complex hook (~700+ lines).
- Documents are persisted to localStorage with key `homework-documents`
- Each document has its own chat history, content (HTML), and metadata

**Key Components:**
- `GoogleDocsUI` - Main UI container orchestrating all features
- `TiptapEditor` - Rich text editor with toolbar (formatting, links, colors, alignment)
- `ChatSidebar` - Per-document AI chat interface
- `GlobalChatPanel` - Standalone chat not tied to any document

**API Integration:**
- `src/api/openrouter.ts` - OpenRouter API client with streaming support, tool calling, and metrics tracking
- `src/api/exa.ts` - Exa search API client for web search functionality
- Both APIs are proxied through Cloudflare Worker at `/api/chat` and `/api/search`

### Backend Architecture (Cloudflare Worker)

**Worker (`worker/index.ts`):**
- Serves static assets from `dist/` directory
- Proxies `/api/chat` → OpenRouter API (streaming chat completions)
- Proxies `/api/search` → Exa API (web search)
- Uses environment secrets: `OPENROUTER_API_KEY`, `EXA_API_KEY`

**Convex (Optional/Legacy):**
- `convex/` directory contains Convex backend setup (messages schema and chat queries)
- Currently not actively used in the main app flow

### AI Tool Calling System

The application implements OpenRouter tool calling for document manipulation:

**Document Tools:**
- `read_document` - AI reads current document content
- `write_content` - Append content to document
- `clear_document` - Clear all content
- `search_web` - Search the web using Exa API

**Tool Call Flow:**
1. User sends message with document context
2. AI can call tools (with strict schema validation)
3. Tool results are added to message history
4. AI makes follow-up call with tool results
5. Final response rendered to user

**Implementation:** See `useDocuments.ts` for tool definitions and execution handlers.

### Persona System

**Persona Features:**
- Custom document name (appears in header)
- Custom document content (AI character/role context)
- Profile image (base64 encoded)
- Ghost mode toggle (hides AI attribution)
- Persisted to localStorage with key `homework-persona-settings`

### Template System

**Essay Templates:**
- Preset templates (built-in, cannot be deleted)
- Custom templates (user-created from documents)
- Each template includes:
  - Full HTML content
  - Formatting instructions (AI-readable guide)
- When applied, AI analyzes template and formats user content to match
- Persisted to localStorage with key `homework-essay-templates`

## Code Patterns and Conventions

### State Management Pattern
- Use custom hooks for feature-specific state (see `useChat.ts`, `useDocuments.ts`)
- localStorage for persistence with try-catch error handling
- Auto-save on state changes via `useEffect`

### API Streaming Pattern
```typescript
// OpenRouter streaming with callbacks
await sendMessageStream(messages, {
  onToken: (token) => { /* handle streaming token */ },
  onToolCalls: async (toolCalls) => { /* execute tools, return results */ },
  onFollowUp: () => { /* called before follow-up request */ },
  onComplete: (metrics) => { /* handle completion */ },
  onError: (error) => { /* handle error */ }
}, model, abortSignal, tools, tool_choice);
```

### Component Props Pattern
- Props are explicitly typed and passed down from `App.tsx` → `GoogleDocsUI` → child components
- Use `TiptapEditorHandle` ref type for imperative editor control
- All document operations flow through `useDocuments` hook

### Tool Execution Pattern
When implementing tool handlers:
1. Update message status (e.g., 'reading', 'searching', 'writing')
2. Execute tool logic
3. Return tool result as ChatMessage with role='tool'
4. AI will process results and make follow-up request

## Important Technical Details

### Vite Proxy Configuration
- `/api/*` requests proxy to `http://localhost:8787` (Wrangler dev server)
- Production uses Cloudflare Workers routing directly

### TipTap Editor
- Uses ProseMirror under the hood
- Content is stored as HTML
- Supports: bold, italic, underline, strikethrough, headings, lists, links, colors, text alignment, font families
- Imperative API via ref: `insertContent()`, `clearContent()`, `getHTML()`, `getText()`

### Model Selection
- Available models defined in `AVAILABLE_MODELS` array in `openrouter.ts`
- Default: `x-ai/grok-4-fast`
- Persisted to localStorage with key `homework-selected-model`

### Search Integration
- Exa API provides high-quality web search results
- Results include title, URL, snippet, published date, author
- Formatted for AI context with `formatSearchResultsForAI()`

## File Upload Support
- `src/utils/fileParser.ts` handles PDF and DOCX parsing
- PDF: Uses `pdfjs-dist` library
- DOCX: Uses `mammoth` library
- Type definitions in `src/types/mammoth.d.ts`

## TypeScript Configuration
- `tsconfig.json` - Base config
- `tsconfig.app.json` - App-specific config (includes src/)
- `tsconfig.node.json` - Node/build tools config (includes vite.config.ts)

## Styling
- Tailwind CSS v4 with Vite plugin
- Styles in `src/index.css`
- Uses @tailwindcss/vite plugin for CSS processing

## Deployment
- Frontend: Cloudflare Pages (serves from `dist/` via worker)
- Worker: Cloudflare Workers (handles API routing and asset serving)
- Convex: Standalone backend (optional, not currently integrated in main flow)
