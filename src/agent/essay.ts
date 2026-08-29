import type { TiptapEditorHandle } from '../components/TiptapEditor';
import type {
  CitationStyle,
  EssayPhase,
  EssaySection,
  EssaySpec,
  EssayVerificationIssue,
  EssayVerificationReport,
  SourceRecord,
} from './types';

const PHASE_ORDER: EssayPhase[] = ['intake', 'research', 'outline', 'draft', 'verify', 'format', 'complete'];

export const ESSAY_PHASE_TOOLS: Record<EssayPhase, string[]> = {
  intake: ['inspect_essay', 'update_essay_spec', 'ask_user', 'read_document', 'set_essay_phase'],
  research: ['inspect_essay', 'update_essay_spec', 'search_web', 'read_document', 'set_essay_phase', 'todowrite', 'todoread'],
  outline: ['inspect_essay', 'update_essay_spec', 'read_document', 'write_content', 'set_essay_phase', 'todowrite', 'todoread'],
  draft: ['inspect_essay', 'update_essay_spec', 'read_section', 'write_section', 'search_web', 'read_document', 'set_essay_phase', 'todowrite', 'todoread'],
  verify: ['inspect_essay', 'verify_essay', 'read_section', 'write_section', 'search_web', 'read_document', 'set_essay_phase', 'todowrite', 'todoread'],
  format: ['inspect_essay', 'verify_essay', 'read_document', 'format_text', 'indent_body_paragraphs', 'set_essay_phase'],
  complete: ['inspect_essay', 'verify_essay', 'read_document'],
};

export function createDefaultEssaySpec(): EssaySpec {
  return {
    topic: '',
    title: '',
    thesis: '',
    targetWords: 1000,
    citationStyle: 'none',
    rubric: [],
    outline: [],
    sources: [],
    phase: 'intake',
    revision: 0,
    documentRevision: '',
    draftStarted: false,
    updatedAt: Date.now(),
  };
}

export function normalizeEssaySpec(value?: Partial<EssaySpec> | null): EssaySpec {
  const base = createDefaultEssaySpec();
  if (!value) return base;
  const phase = PHASE_ORDER.includes(value.phase as EssayPhase) ? value.phase as EssayPhase : base.phase;
  return {
    ...base,
    ...value,
    phase,
    citationStyle: normalizeCitationStyle(value.citationStyle),
    rubric: Array.isArray(value.rubric) ? value.rubric.filter((item): item is string => typeof item === 'string') : [],
    outline: Array.isArray(value.outline) ? value.outline.map(normalizeSection) : [],
    sources: Array.isArray(value.sources) ? value.sources.map(normalizeSource) : [],
    revision: Number.isFinite(value.revision) ? Number(value.revision) : 0,
    updatedAt: Number.isFinite(value.updatedAt) ? Number(value.updatedAt) : Date.now(),
  };
}

function normalizeCitationStyle(value: unknown): CitationStyle {
  return value === 'mla' || value === 'apa' || value === 'chicago' || value === 'none' ? value : 'none';
}

function normalizeSection(section: Partial<EssaySection>, index: number): EssaySection {
  return {
    id: typeof section.id === 'string' && section.id ? section.id : `section_${index + 1}`,
    title: typeof section.title === 'string' && section.title ? section.title : `Section ${index + 1}`,
    purpose: typeof section.purpose === 'string' ? section.purpose : '',
    targetWords: Number.isFinite(section.targetWords) ? Number(section.targetWords) : undefined,
    content: typeof section.content === 'string' ? section.content : '',
    sourceIds: Array.isArray(section.sourceIds)
      ? section.sourceIds.filter((item): item is string => typeof item === 'string')
      : [],
    includeHeading: section.includeHeading === true,
    status: section.status === 'complete' || section.status === 'drafting' ? section.status : 'pending',
  };
}

function normalizeSource(source: Partial<SourceRecord>, index: number): SourceRecord {
  return {
    id: typeof source.id === 'string' && source.id ? source.id : `source_${index + 1}`,
    title: typeof source.title === 'string' ? source.title : 'Untitled source',
    url: typeof source.url === 'string' ? source.url : '',
    snippet: typeof source.snippet === 'string' ? source.snippet : '',
    author: typeof source.author === 'string' ? source.author : undefined,
    publishedDate: typeof source.publishedDate === 'string' ? source.publishedDate : undefined,
    accessedAt: typeof source.accessedAt === 'string' ? source.accessedAt : new Date().toISOString(),
    claims: Array.isArray(source.claims) ? source.claims.filter((item): item is string => typeof item === 'string') : [],
  };
}

export function documentRevision(editor: TiptapEditorHandle | null): string {
  const html = editor?.getHTML() ?? '';
  let hash = 2166136261;
  for (let index = 0; index < html.length; index++) {
    hash ^= html.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `doc_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function mergeSources(spec: EssaySpec, sources: Omit<SourceRecord, 'id'>[]): SourceRecord[] {
  const merged = [...spec.sources];
  for (const candidate of sources) {
    const existing = merged.find((source) => source.url === candidate.url);
    if (existing) {
      Object.assign(existing, candidate, { id: existing.id });
      continue;
    }
    merged.push({ ...candidate, id: `source_${merged.length + 1}` });
  }
  spec.sources = merged;
  touchEssaySpec(spec);
  return merged;
}

export function touchEssaySpec(spec: EssaySpec): void {
  spec.revision += 1;
  spec.updatedAt = Date.now();
}

export function serializeEssayState(spec: EssaySpec): string {
  const outline = spec.outline.map((section) => ({
    id: section.id,
    title: section.title,
    purpose: section.purpose,
    targetWords: section.targetWords,
    status: section.status,
    wordCount: countWords(section.content),
    sourceIds: section.sourceIds,
    includeHeading: section.includeHeading,
  }));
  const sources = spec.sources.map(({ id, title, url, author, publishedDate, claims }) => ({
    id,
    title,
    url,
    author,
    publishedDate,
    claims,
  }));
  return JSON.stringify({
    phase: spec.phase,
    revision: spec.revision,
    documentRevision: spec.documentRevision,
    topic: spec.topic,
    title: spec.title,
    thesis: spec.thesis,
    targetWords: spec.targetWords,
    citationStyle: spec.citationStyle,
    rubric: spec.rubric,
    outline,
    sources,
    lastVerification: spec.lastVerification,
  });
}

export function essayPhasePrompt(spec: EssaySpec): string {
  const objectives: Record<EssayPhase, string> = {
    intake: 'Extract known requirements into update_essay_spec. Ask only for missing information that materially changes the essay.',
    research: 'Search focused questions, retain useful sources in the source ledger, then advance to outline.',
    outline: 'Create or refine a section outline with target word counts. In plan mode, show the plan in the document and stop. In build mode, read the visible plan first, reconcile any user edits into update_essay_spec, then advance to draft.',
    draft: 'Write one section at a time with write_section. Use only source IDs present in the ledger and continue until every section is complete.',
    verify: 'Call verify_essay. Repair every error before advancing; warnings should be addressed when practical.',
    format: 'Apply required formatting, run verify_essay once more, then advance to complete only if no errors remain.',
    complete: 'Do not make additional changes unless the user requested them. Briefly summarize the completed work.',
  };
  return `<essay_harness>
Current phase: ${spec.phase}
Objective: ${objectives[spec.phase]}
Canonical essay state: ${serializeEssayState(spec)}

Rules:
- Tool schemas are authoritative. Supply every required field exactly.
- Do not repeat an identical failed tool call. Change the input or choose another tool.
- Document revisions are optimistic locks. Inspect again after a revision conflict.
- Search tools may run concurrently. Document and state mutations must remain ordered.
- Continue until the phase objective is satisfied; do not stop after merely describing the next action.
- Never invent a source, source ID, quotation, author, date, or URL.
</essay_harness>`;
}

export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
}

export function verifyEssay(spec: EssaySpec, documentText: string): EssayVerificationReport {
  const issues: EssayVerificationIssue[] = [];
  const wordCount = countWords(documentText);
  const target = Math.max(0, spec.targetWords || 0);

  if (!spec.topic.trim()) issues.push(issue('missing_topic', 'error', 'Essay topic is missing.'));
  if (!spec.thesis.trim()) issues.push(issue('missing_thesis', 'error', 'Thesis statement is missing.'));
  if (spec.outline.length === 0) issues.push(issue('missing_outline', 'error', 'Essay outline has no sections.'));

  for (const section of spec.outline) {
    if (!section.content.trim()) {
      issues.push(issue('empty_section', 'error', `Section "${section.title}" has not been drafted.`, section.id));
    }
    for (const sourceId of section.sourceIds) {
      if (!spec.sources.some((source) => source.id === sourceId)) {
        issues.push(issue('unknown_source', 'error', `Section "${section.title}" references unknown source ${sourceId}.`, section.id));
      }
    }
    if (spec.citationStyle !== 'none' && countWords(section.content) >= 120 && section.sourceIds.length === 0) {
      issues.push(issue('unsupported_section', 'warning', `Section "${section.title}" has no linked research source.`, section.id));
    }
  }

  if (target > 0) {
    const lower = Math.floor(target * 0.9);
    const upper = Math.ceil(target * 1.1);
    if (wordCount < lower) issues.push(issue('under_word_count', 'error', `Essay has ${wordCount} words; target range starts at ${lower}.`));
    if (wordCount > upper) issues.push(issue('over_word_count', 'warning', `Essay has ${wordCount} words; target range ends at ${upper}.`));
  }

  if (/\b(?:TODO|TBD|PLACEHOLDER)\b|\[[^\]]{2,80}\]/i.test(documentText)) {
    issues.push(issue('placeholder_text', 'error', 'Document still contains placeholder text.'));
  }

  const paragraphs = documentText
    .split(/\n+/)
    .map((paragraph) => paragraph.trim().toLowerCase().replace(/\s+/g, ' '))
    .filter((paragraph) => paragraph.length >= 80);
  if (new Set(paragraphs).size !== paragraphs.length) {
    issues.push(issue('duplicate_paragraph', 'error', 'Document contains a duplicated paragraph.'));
  }

  for (const requirement of spec.rubric) {
    const terms = requirement.toLowerCase().match(/[a-z]{4,}/g)?.slice(0, 4) ?? [];
    if (terms.length > 0 && !terms.some((term) => documentText.toLowerCase().includes(term))) {
      issues.push(issue('rubric_gap', 'warning', `Rubric item may not be covered: ${requirement}`));
    }
  }

  if (spec.citationStyle !== 'none' && spec.sources.length === 0) {
    issues.push(issue('missing_sources', 'error', `Citation style is ${spec.citationStyle.toUpperCase()}, but the source ledger is empty.`));
  }

  return {
    passed: !issues.some((item) => item.severity === 'error'),
    wordCount,
    targetWords: target,
    checkedAt: Date.now(),
    issues,
  };
}

function issue(code: string, severity: 'error' | 'warning', message: string, sectionId?: string): EssayVerificationIssue {
  return { code, severity, message, sectionId };
}

export function canTransitionEssayPhase(spec: EssaySpec, next: EssayPhase, mode: string): { allowed: boolean; reason?: string } {
  const currentIndex = PHASE_ORDER.indexOf(spec.phase);
  const nextIndex = PHASE_ORDER.indexOf(next);
  if (nextIndex < 0) return { allowed: false, reason: 'Unknown essay phase.' };
  if (nextIndex > currentIndex + 1) return { allowed: false, reason: 'Essay phases must advance one step at a time.' };
  if (mode === 'plan' && nextIndex > PHASE_ORDER.indexOf('outline')) {
    return { allowed: false, reason: 'Planning mode cannot enter drafting. Ask the user to approve the plan first.' };
  }
  if (next === 'research' && !spec.topic.trim()) return { allowed: false, reason: 'Set the essay topic before research.' };
  if (next === 'outline' && !spec.topic.trim()) return { allowed: false, reason: 'Set the essay topic before outlining.' };
  if (next === 'outline' && spec.citationStyle !== 'none' && spec.sources.length === 0) {
    return { allowed: false, reason: 'Collect at least one research source before outlining a cited essay.' };
  }
  if (next === 'draft' && (!spec.thesis.trim() || spec.outline.length === 0)) {
    return { allowed: false, reason: 'Set the thesis and create the outline before drafting.' };
  }
  if (next === 'verify' && spec.outline.some((section) => section.status !== 'complete')) {
    return { allowed: false, reason: 'Draft every outline section before verification.' };
  }
  if ((next === 'format' || next === 'complete') && !spec.lastVerification?.passed) {
    return { allowed: false, reason: 'The essay must pass verification before advancing.' };
  }
  if (next === 'complete' && spec.lastVerification?.documentRevision !== spec.documentRevision) {
    return { allowed: false, reason: 'The document changed after verification. Run verify_essay again before completing.' };
  }
  return { allowed: true };
}

export function compactChatMessages<T extends {
  role: string;
  content: string | null;
  tool_calls?: Array<{ function: { arguments: string } }>;
}>(
  messages: T[],
  essayState: string,
  maxCharacters = 60_000
): T[] {
  const messageSize = (message: T) => (message.content?.length ?? 0)
    + (message.tool_calls?.reduce((sum, call) => sum + call.function.arguments.length, 0) ?? 0);
  const total = messages.reduce((sum, message) => sum + messageSize(message), 0);
  if (total <= maxCharacters) return messages;

  const system = messages.find((message) => message.role === 'system');
  const kept: T[] = [];
  let used = system?.content?.length ?? 0;
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message === system) continue;
    const size = messageSize(message);
    if (used + size > maxCharacters * 0.75 && kept.length >= 4) break;
    kept.unshift(message);
    used += size;
  }
  const summary = {
    role: 'system',
    content: `Older conversational and tool output was compacted. Continue from this canonical essay state: ${essayState}`,
  } as T;
  return [...(system ? [system] : []), summary, ...kept];
}
