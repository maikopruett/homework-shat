/**
 * Message Parts Renderer
 *
 * Renders message parts (text, tool calls, tool results) in the chat UI.
 * Based on OpenCode's part-based message display pattern.
 */

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { MessagePart, TextPart, ToolCallPart, ToolResultPart, MessageMetadata, ReasoningDetail } from '../../agent/types';
import { getToolDisplayInfo, formatArgsPreview } from '../../agent/toolDisplayInfo';
import { Check, X, Circle, Brain } from 'lucide-react';

// ==================== Props ====================

interface MessagePartsProps {
  parts: MessagePart[];
  isStreaming?: boolean;
  metadata?: MessageMetadata;
}

interface PartRendererProps {
  part: MessagePart;
  /** Tool results keyed by callId for pairing with tool calls */
  resultsByCallId: Map<string, ToolResultPart>;
}

// ==================== Main Component ====================

/**
 * Renders all parts of an assistant message.
 */
export function MessagePartsRenderer({ parts, isStreaming, metadata }: MessagePartsProps) {
  // Build a map of tool results by callId for pairing with tool calls
  const resultsByCallId = new Map<string, ToolResultPart>();
  for (const part of parts) {
    if (part.type === 'tool_result') {
      resultsByCallId.set(part.callId, part);
    }
  }

  // Filter to only render text and tool_call parts (results are embedded in tool calls)
  const renderableParts = parts.filter(
    (part): part is TextPart | ToolCallPart =>
      part.type === 'text' || part.type === 'tool_call'
  );

  if (renderableParts.length === 0 && isStreaming) {
    // Show thinking indicator when streaming but no parts yet
    return (
      <div className="flex items-center gap-2 text-gray-500 text-sm py-2">
        <Spinner />
        <span>Thinking...</span>
      </div>
    );
  }

  // Check if we have reasoning details to display
  const reasoningDetails = metadata?.reasoningDetails;
  const hasReasoning = reasoningDetails && reasoningDetails.length > 0;

  return (
    <div className="flex flex-col gap-2">
      {/* Show reasoning details first (collapsed by default) */}
      {hasReasoning && (
        <ReasoningDetailsDisplay details={reasoningDetails} />
      )}
      {renderableParts.map((part, index) => (
        <PartRenderer key={index} part={part} resultsByCallId={resultsByCallId} />
      ))}
    </div>
  );
}

// ==================== Part Dispatchers ====================

function PartRenderer({ part, resultsByCallId }: PartRendererProps) {
  switch (part.type) {
    case 'text':
      return <TextPartDisplay part={part} />;
    case 'tool_call':
      return (
        <ToolCallDisplay
          part={part}
          result={resultsByCallId.get(part.callId)}
        />
      );
    default:
      return null;
  }
}

// ==================== Text Part ====================

function TextPartDisplay({ part }: { part: TextPart }) {
  const content = part.content.trim();
  if (!content) return null;

  return (
    <div className="rounded-2xl px-4 py-2.5 bg-gray-100 text-gray-800 rounded-bl-sm prose prose-sm prose-gray max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_code]:bg-gray-200 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[13px] [&_pre]:bg-gray-800 [&_pre]:text-gray-100 [&_pre]:p-2 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_a]:text-blue-600 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-gray-600">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}

// ==================== Tool Call Part ====================

interface ToolCallDisplayProps {
  part: ToolCallPart;
  result?: ToolResultPart;
}

function ToolCallDisplay({ part, result }: ToolCallDisplayProps) {
  const [expanded, setExpanded] = useState(false);
  const info = getToolDisplayInfo(part.toolId);
  const { Icon } = info;

  const status = part.status.status;
  const isRunning = status === 'running' || status === 'pending';
  const isCompleted = status === 'completed';
  const isError = status === 'error' || result?.error;

  // Use blue/gray color scheme to match Google Docs theme
  const containerClasses = isError
    ? 'border-gray-300 bg-gray-100'
    : isRunning
      ? 'border-blue-200 bg-blue-50'
      : 'border-gray-200 bg-gray-50';

  const argsPreview = formatArgsPreview(part.arguments);

  return (
    <div className={`rounded-lg border ${containerClasses} overflow-hidden`}>
      {/* Clickable header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm hover:bg-black/5 transition-colors"
      >
        {/* Status indicator */}
        <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
          {isRunning ? (
            <Spinner />
          ) : isError ? (
            <X className="w-3.5 h-3.5 text-gray-500" />
          ) : isCompleted ? (
            <Check className="w-3.5 h-3.5 text-blue-600" />
          ) : (
            <Circle className="w-3 h-3 text-gray-400" />
          )}
        </span>

        {/* Tool icon */}
        <Icon className="w-4 h-4 text-gray-600 flex-shrink-0" />

        {/* Tool name */}
        <span className="font-medium text-gray-700">{info.name}</span>

        {/* Arguments preview */}
        {argsPreview && (
          <span className="text-gray-500 truncate flex-1 text-xs">
            {argsPreview}
          </span>
        )}

        {/* Expand chevron */}
        <ChevronIcon expanded={expanded} />
      </button>

      {/* Expandable details */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-gray-200/50">
          {/* Arguments */}
          <div className="mb-2">
            <div className="text-xs font-medium text-gray-500 mb-1">Input</div>
            <pre className="text-xs text-gray-600 bg-white/50 rounded p-2 overflow-x-auto">
              {JSON.stringify(part.arguments, null, 2)}
            </pre>
          </div>

          {/* Result (if available) */}
          {result && (
            <div>
              <div className="text-xs font-medium text-gray-500 mb-1">
                {result.error ? 'Error' : 'Output'}
              </div>
              <pre
                className={`text-xs rounded p-2 overflow-x-auto ${
                  result.error
                    ? 'text-gray-700 bg-gray-200/50'
                    : 'text-gray-600 bg-white/50'
                }`}
              >
                {result.error || JSON.stringify(result.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ==================== Reasoning Details ====================

interface ReasoningDetailsDisplayProps {
  details: ReasoningDetail[];
}

/**
 * Displays reasoning details from reasoning models (Gemini, Claude 3.7+, etc.)
 * Shows as a collapsible box similar to tool calls.
 */
function ReasoningDetailsDisplay({ details }: ReasoningDetailsDisplayProps) {
  const [expanded, setExpanded] = useState(false);

  // Extract readable text from reasoning details
  const reasoningText = details.map((detail) => {
    if (detail.type === 'reasoning.text') {
      return detail.text;
    } else if (detail.type === 'reasoning.summary') {
      return detail.summary;
    } else if (detail.type === 'reasoning.encrypted') {
      return '[Encrypted reasoning]';
    }
    return '';
  }).filter(Boolean).join('\n\n');

  // Count the different types
  const textCount = details.filter(d => d.type === 'reasoning.text').length;
  const summaryCount = details.filter(d => d.type === 'reasoning.summary').length;
  const encryptedCount = details.filter(d => d.type === 'reasoning.encrypted').length;

  // Build preview text
  let previewText = `${details.length} reasoning block${details.length !== 1 ? 's' : ''}`;
  if (textCount > 0 || summaryCount > 0) {
    const wordCount = reasoningText.split(/\s+/).length;
    previewText = `${wordCount} words`;
  }

  return (
    <div className="rounded-lg border border-purple-200 bg-purple-50 overflow-hidden">
      {/* Clickable header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm hover:bg-black/5 transition-colors"
      >
        {/* Brain icon */}
        <Brain className="w-4 h-4 text-purple-600 shrink-0" />

        {/* Label */}
        <span className="font-medium text-purple-700">Reasoning</span>

        {/* Preview */}
        <span className="text-purple-500 truncate flex-1 text-xs">
          {previewText}
          {encryptedCount > 0 && ` (${encryptedCount} encrypted)`}
        </span>

        {/* Expand chevron */}
        <ChevronIcon expanded={expanded} />
      </button>

      {/* Expandable details */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-purple-200/50">
          {reasoningText ? (
            <div className="text-xs text-purple-800 bg-white/50 rounded p-2 whitespace-pre-wrap max-h-64 overflow-y-auto">
              {reasoningText}
            </div>
          ) : (
            <div className="text-xs text-purple-600 italic">
              Reasoning content is encrypted and cannot be displayed.
            </div>
          )}

          {/* Show detail type breakdown if multiple types */}
          {(textCount > 0 || summaryCount > 0 || encryptedCount > 0) && (
            <div className="mt-2 flex gap-2 text-xs text-purple-500">
              {textCount > 0 && <span>{textCount} text</span>}
              {summaryCount > 0 && <span>{summaryCount} summary</span>}
              {encryptedCount > 0 && <span>{encryptedCount} encrypted</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ==================== Helper Components ====================

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4 text-blue-600"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${
        expanded ? 'rotate-180' : ''
      }`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 9l-7 7-7-7"
      />
    </svg>
  );
}

// ==================== Streaming Status ====================

interface StreamingStatusProps {
  parts: MessagePart[];
}

/**
 * Shows the current status while a message is streaming.
 * Derives status from the last part in the message.
 */
export function StreamingStatus({ parts }: StreamingStatusProps) {
  const lastPart = parts[parts.length - 1];

  // Determine status text based on last part
  let statusText = 'Thinking...';

  if (lastPart?.type === 'tool_call') {
    const info = getToolDisplayInfo(lastPart.toolId);
    statusText = info.activeLabel;
  } else if (lastPart?.type === 'text') {
    statusText = 'Responding...';
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-500 py-0.5 ml-1">
      <Spinner />
      <span>{statusText}</span>
    </div>
  );
}

// ==================== Exports ====================

export { Spinner };
