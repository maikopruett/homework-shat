/**
 * useAgent Hook
 *
 * React hook for using the new agent system.
 * Manages session state, tool execution, and streaming.
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import { runAgentLoop } from '../agent/Loop';
import { createAgentConfig, getPresetForMode } from '../agent/Agent';
import type {
  Session,
  Message,
  Todo,
  ToolStatus,
  AgentConfig,
  DocumentInfo,
} from '../agent/types';
import type { TiptapEditorHandle } from '../components/TiptapEditor';

// ==================== Types ====================

export type AgentStatus = 'idle' | 'thinking' | 'reading' | 'writing' | 'searching' | 'formatting';

interface UseAgentOptions {
  documentId?: string;
  initialMode?: 'edit' | 'plan';
  model?: string;
  onDocumentUpdate?: (content: string) => void;
}

interface UseAgentReturn {
  // Session state
  session: Session | null;
  messages: Message[];
  todos: Todo[];

  // Status
  isRunning: boolean;
  status: AgentStatus;
  statusDetail: string;
  currentToolStatus: ToolStatus | null;

  // Streaming content
  streamingContent: string;

  // Actions
  sendMessage: (
    content: string,
    editorRef: React.RefObject<TiptapEditorHandle | null>,
    systemPrompt: string,
    mode?: 'edit' | 'plan'
  ) => Promise<void>;
  stopGeneration: () => void;
  clearSession: () => void;
  setMode: (mode: 'edit' | 'plan') => void;

  // Configuration
  mode: 'edit' | 'plan';
  agentConfig: AgentConfig;
}

// ==================== Helper Functions ====================

function createNewSession(mode: 'edit' | 'plan', model: string, documentId?: string): Session {
  const preset = getPresetForMode(mode);
  const config = createAgentConfig(preset, { model });

  return {
    id: crypto.randomUUID(),
    documentId,
    agentConfig: config,
    messages: [],
    todos: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'active',
  };
}

function toolStatusToAgentStatus(toolId: string): AgentStatus {
  switch (toolId) {
    case 'read_document':
      return 'reading';
    case 'write_content':
    case 'edit_text':
    case 'insert_content':
    case 'clear_document':
      return 'writing';
    case 'format_text':
    case 'indent_body_paragraphs':
      return 'formatting';
    case 'search_web':
      return 'searching';
    default:
      return 'thinking';
  }
}

// ==================== Hook ====================

export function useAgent(options: UseAgentOptions = {}): UseAgentReturn {
  const {
    documentId,
    initialMode = 'edit',
    model = 'x-ai/grok-4-fast',
    onDocumentUpdate,
  } = options;

  // State
  const [session, setSession] = useState<Session | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [statusDetail, setStatusDetail] = useState('');
  const [currentToolStatus, setCurrentToolStatus] = useState<ToolStatus | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const [mode, setModeState] = useState<'edit' | 'plan'>(initialMode);

  // Refs
  const abortControllerRef = useRef<AbortController | null>(null);

  // Computed
  const messages = useMemo(() => session?.messages ?? [], [session]);
  const todos = useMemo(() => session?.todos ?? [], [session]);
  const agentConfig = useMemo(() => {
    if (session) return session.agentConfig;
    const preset = getPresetForMode(mode);
    return createAgentConfig(preset, { model });
  }, [session, mode, model]);

  // ==================== Actions ====================

  const sendMessage = useCallback(
    async (
      content: string,
      editorRef: React.RefObject<TiptapEditorHandle | null>,
      systemPrompt: string,
      messageMode?: 'edit' | 'plan'
    ) => {
      if (isRunning || !content.trim()) return;

      const effectiveMode = messageMode ?? mode;

      // Get or create session
      let currentSession = session;
      if (!currentSession || currentSession.agentConfig.mode !== effectiveMode) {
        currentSession = createNewSession(effectiveMode, model, documentId);
        setSession(currentSession);
      }

      // Create user message
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        parts: [{ type: 'text', content: content.trim() }],
        timestamp: Date.now(),
      };

      // Add to session
      currentSession.messages.push(userMessage);
      currentSession.updatedAt = Date.now();
      setSession({ ...currentSession });

      // Setup
      setIsRunning(true);
      setStatus('thinking');
      setStatusDetail('Processing...');
      setStreamingContent('');
      abortControllerRef.current = new AbortController();

      // Build document info
      const documentInfo: DocumentInfo | null = editorRef.current
        ? {
            id: documentId ?? 'unknown',
            title: 'Document',
            content: editorRef.current.getHTML(),
          }
        : null;

      try {
        const result = await runAgentLoop({
          session: currentSession,
          userMessage: content.trim(),
          editor: editorRef.current,
          document: documentInfo,
          systemPrompt,
          onStatusUpdate: (toolStatus) => {
            setCurrentToolStatus(toolStatus);
            setStatus(toolStatusToAgentStatus(toolStatus.toolId));
            setStatusDetail(toolStatus.title);
          },
          onMessageUpdate: (message) => {
            // Update the last message in session
            const idx = currentSession!.messages.findIndex((m) => m.id === message.id);
            if (idx >= 0) {
              currentSession!.messages[idx] = message;
            } else {
              currentSession!.messages.push(message);
            }
            setSession({ ...currentSession! });

            // Extract streaming text content
            const textContent = message.parts
              .filter((p): p is { type: 'text'; content: string } => p.type === 'text')
              .map((p) => p.content)
              .join('');
            setStreamingContent(textContent);
          },
          onTokenReceived: (token) => {
            setStreamingContent((prev) => prev + token);
          },
          abortSignal: abortControllerRef.current.signal,
        });

        // Sync document content after successful completion
        if (editorRef.current && onDocumentUpdate) {
          onDocumentUpdate(editorRef.current.getHTML());
        }

        console.log('[useAgent] Loop completed:', {
          success: result.success,
          toolCalls: result.toolCallCount,
          followUps: result.followUpCount,
        });
      } catch (error) {
        console.error('[useAgent] Error:', error);
      } finally {
        setIsRunning(false);
        setStatus('idle');
        setStatusDetail('');
        setCurrentToolStatus(null);
        abortControllerRef.current = null;
      }
    },
    [session, isRunning, mode, model, documentId, onDocumentUpdate]
  );

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsRunning(false);
    setStatus('idle');
  }, []);

  const clearSession = useCallback(() => {
    setSession(null);
    setStreamingContent('');
  }, []);

  const setMode = useCallback((newMode: 'edit' | 'plan') => {
    setModeState(newMode);
    // Session will be recreated on next message with new mode
  }, []);

  // ==================== Return ====================

  return {
    // Session state
    session,
    messages,
    todos,

    // Status
    isRunning,
    status,
    statusDetail,
    currentToolStatus,

    // Streaming
    streamingContent,

    // Actions
    sendMessage,
    stopGeneration,
    clearSession,
    setMode,

    // Configuration
    mode,
    agentConfig,
  };
}
