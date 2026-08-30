/**
 * Chat message rendering.
 * Tool calls remain in message data for agent continuity but are intentionally
 * hidden from the conversation UI. StreamingStatus is the single activity row.
 */

import ReactMarkdown from 'react-markdown';
import { X } from 'lucide-react';
import type { MessagePart, TextPart, MessageMetadata, ToolCallPart } from '../../agent/types';
import { getToolDisplayInfo } from '../../agent/toolDisplayInfo';

interface MessagePartsProps {
  parts: MessagePart[];
  metadata?: MessageMetadata;
}

export function MessagePartsRenderer({ parts, metadata }: MessagePartsProps) {
  const textParts = parts.filter((part): part is TextPart => part.type === 'text');

  return (
    <div className="flex flex-col gap-2">
      {metadata?.essayPhase && <EssayProgress metadata={metadata} />}
      {textParts.map((part, index) => <TextPartDisplay key={index} part={part} />)}
    </div>
  );
}

function EssayProgress({ metadata }: { metadata: MessageMetadata }) {
  const steps = metadata.steps ?? [];
  const latest = steps[steps.length - 1];
  const completed = steps.filter((step) => step.status === 'completed').length;
  const phase = metadata.essayPhase ?? latest?.phase;
  if (!phase) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-blue-100 bg-blue-50/70 text-xs text-blue-800">
      <span className="font-medium capitalize">{phase}</span>
      {steps.length > 0 && <span className="text-blue-600">{completed}/{steps.length} steps</span>}
      {latest?.status === 'running' && <span className="text-blue-600">running</span>}
      {latest?.status === 'error' && <X className="w-3.5 h-3.5" />}
    </div>
  );
}

function TextPartDisplay({ part }: { part: TextPart }) {
  const content = part.content.trim();
  if (!content) return null;

  return (
    <div className="rounded-2xl px-4 py-2.5 bg-gray-100 text-gray-800 rounded-bl-sm prose prose-sm prose-gray max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_code]:bg-gray-200 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[13px] [&_pre]:bg-gray-800 [&_pre]:text-gray-100 [&_pre]:p-2 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_a]:text-blue-600 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-gray-600">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

interface StreamingStatusProps {
  parts: MessagePart[];
}

export function StreamingStatus({ parts }: StreamingStatusProps) {
  const activeTool = [...parts].reverse().find(
    (part): part is ToolCallPart => part.type === 'tool_call'
      && (part.status.status === 'pending' || part.status.status === 'running')
  );
  const lastPart = parts[parts.length - 1];

  let statusText = 'Thinking...';
  if (activeTool) {
    statusText = activeTool.status.title || getToolDisplayInfo(activeTool.toolId).activeLabel;
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

export { Spinner };
