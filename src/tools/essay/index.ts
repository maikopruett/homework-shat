import { z } from 'zod';
import { Tool, toolError, toolSuccess } from '../Tool';
import {
  canTransitionEssayPhase,
  countWords,
  documentRevision,
  serializeEssayState,
  touchEssaySpec,
  verifyEssay,
} from '../../agent/essay';
import type { CitationStyle, EssayPhase, EssaySection } from '../../agent/types';
import { textToHtml } from '../document/utils';

const outlineSchema = z.array(z.object({
  id: z.string().min(1).describe('Stable section ID such as introduction or body_1.'),
  title: z.string().min(1).describe('Human-readable section title.'),
  purpose: z.string().min(1).describe('What this section must accomplish.'),
  target_words: z.number().int().positive().optional().describe('Approximate target word count for this section.'),
}));

export const inspectEssayTool = Tool.define({
  id: 'inspect_essay',
  name: 'Inspect Essay State',
  description: 'Read the canonical essay requirements, outline, source ledger, workflow phase, verification report, and current document revision.',
  parameters: z.object({}),
  execution: 'read',
  requiredContext: ['session'],
  async execute(_params, ctx) {
    ctx.session.essay.documentRevision = documentRevision(ctx.editor);
    return toolSuccess({
      essay: JSON.parse(serializeEssayState(ctx.session.essay)),
      sections: ctx.session.essay.outline.map((section) => ({
        id: section.id,
        title: section.title,
        status: section.status,
        word_count: countWords(section.content),
        source_ids: section.sourceIds,
      })),
      document_word_count: countWords(ctx.editor?.getText() ?? ''),
      document_revision: ctx.session.essay.documentRevision,
    });
  },
});

export const updateEssaySpecTool = Tool.define({
  id: 'update_essay_spec',
  name: 'Update Essay Requirements',
  description: 'Create or update the durable essay requirements and outline. Omitted fields remain unchanged. The outline is canonical and survives document clearing.',
  parameters: z.object({
    topic: z.string().min(1).optional().describe('Essay topic or assignment question.'),
    title: z.string().min(1).optional().describe('Working essay title.'),
    thesis: z.string().min(1).optional().describe('Current thesis statement.'),
    target_words: z.number().int().min(100).max(20_000).optional().describe('Target essay word count.'),
    citation_style: z.enum(['mla', 'apa', 'chicago', 'none']).optional().describe('Required citation style.'),
    rubric: z.array(z.string().min(1)).optional().describe('Assignment or rubric requirements.'),
    outline: outlineSchema.optional().describe('Ordered essay sections. Reuses existing section content when IDs match.'),
  }),
  execution: 'state-write',
  requiredContext: ['session'],
  async execute(params, ctx) {
    if (Object.keys(params).length === 0) return toolError('Provide at least one essay requirement to update.');
    const spec = ctx.session.essay;
    if (params.topic !== undefined) spec.topic = params.topic;
    if (params.title !== undefined) spec.title = params.title;
    if (params.thesis !== undefined) spec.thesis = params.thesis;
    if (params.target_words !== undefined) spec.targetWords = params.target_words;
    if (params.citation_style !== undefined) spec.citationStyle = params.citation_style as CitationStyle;
    if (params.rubric !== undefined) spec.rubric = params.rubric;
    if (params.outline !== undefined) {
      spec.outline = params.outline.map((item) => {
        const existing = spec.outline.find((section) => section.id === item.id);
        return {
          id: item.id,
          title: item.title,
          purpose: item.purpose,
          targetWords: item.target_words,
          content: existing?.content ?? '',
          sourceIds: existing?.sourceIds ?? [],
          includeHeading: existing?.includeHeading ?? false,
          status: existing?.status ?? 'pending',
        } satisfies EssaySection;
      });
    }
    touchEssaySpec(spec);
    return toolSuccess({ updated: true, revision: spec.revision, phase: spec.phase });
  },
});

export const setEssayPhaseTool = Tool.define({
  id: 'set_essay_phase',
  name: 'Advance Essay Phase',
  description: 'Advance or return the essay workflow to a specific phase. Forward transitions are validated against the canonical essay state.',
  parameters: z.object({
    phase: z.enum(['intake', 'research', 'outline', 'draft', 'verify', 'format', 'complete']).describe('The next workflow phase.'),
    reason: z.string().min(1).describe('Brief reason the current phase is complete or needs revision.'),
  }),
  execution: 'state-write',
  requiredContext: ['session'],
  async execute({ phase, reason }, ctx) {
    const next = phase as EssayPhase;
    const transition = canTransitionEssayPhase(ctx.session.essay, next, ctx.agent.mode);
    if (!transition.allowed) return toolError(transition.reason ?? 'Phase transition is not allowed.');
    ctx.session.essay.phase = next;
    touchEssaySpec(ctx.session.essay);
    return toolSuccess({ phase: next, reason, revision: ctx.session.essay.revision });
  },
});

export const readSectionTool = Tool.define({
  id: 'read_section',
  name: 'Read Essay Section',
  description: 'Read one canonical essay section and the current optimistic document revision.',
  parameters: z.object({
    section_id: z.string().min(1).describe('Section ID from the essay outline.'),
  }),
  execution: 'read',
  requiredContext: ['session', 'editor'],
  async execute({ section_id }, ctx) {
    const section = ctx.session.essay.outline.find((item) => item.id === section_id);
    if (!section) return toolError(`Unknown section ID: ${section_id}`);
    const revision = documentRevision(ctx.editor);
    ctx.session.essay.documentRevision = revision;
    return toolSuccess({
      section: {
        id: section.id,
        title: section.title,
        purpose: section.purpose,
        target_words: section.targetWords,
        content: section.content,
        word_count: countWords(section.content),
        source_ids: section.sourceIds,
        status: section.status,
      },
      document_revision: revision,
    });
  },
});

export const writeSectionTool = Tool.define({
  id: 'write_section',
  name: 'Write Essay Section',
  description: 'Write or replace one canonical essay section. Requires the latest document revision returned by inspect_essay, read_section, or a previous write_section call.',
  parameters: z.object({
    section_id: z.string().min(1).describe('Section ID from the canonical outline.'),
    content: z.string().min(1).describe('Complete prose for this section. Plain text with blank lines between paragraphs.'),
    source_ids: z.array(z.string().min(1)).describe('Source IDs from the ledger that support this section. Use an empty array only when research is not required.'),
    expected_revision: z.string().min(1).describe('Current document revision from the latest essay/document read or write result.'),
    include_heading: z.boolean().optional().default(false).describe('Whether to insert the section title as a visible heading.'),
  }),
  execution: 'document-write',
  requiredContext: ['session', 'editor'],
  async execute({ section_id, content, source_ids, expected_revision, include_heading }, ctx) {
    const editor = ctx.editor;
    if (!editor) return toolError('Editor not available.');
    const spec = ctx.session.essay;
    const section = spec.outline.find((item) => item.id === section_id);
    if (!section) return toolError(`Unknown section ID: ${section_id}`);

    const actualRevision = documentRevision(editor);
    if (actualRevision !== expected_revision) {
      return toolError(`Document revision conflict. Expected ${expected_revision}, current revision is ${actualRevision}. Read the essay state again before writing.`);
    }

    const unknownSources = source_ids.filter((id) => !spec.sources.some((source) => source.id === id));
    if (unknownSources.length > 0) return toolError(`Unknown source IDs: ${unknownSources.join(', ')}`);

    const nextSection: EssaySection = {
      ...section,
      content,
      sourceIds: source_ids,
      includeHeading: include_heading,
      status: 'complete',
    };
    const nextOutline = spec.outline.map((item) => item.id === section_id ? nextSection : item);

    // Commit editor content first so a rendering/editor exception cannot leave
    // canonical section state ahead of the visible document.
    editor.setContent(renderEssayHtml({ ...spec, outline: nextOutline }));
    Object.assign(section, nextSection);
    spec.draftStarted = true;
    spec.lastVerification = undefined;
    spec.documentRevision = documentRevision(editor);
    touchEssaySpec(spec);
    return toolSuccess({
      written: true,
      section_id,
      section_word_count: countWords(content),
      document_word_count: countWords(editor.getText()),
      document_revision: spec.documentRevision,
      essay_revision: spec.revision,
    });
  },
});

export const verifyEssayTool = Tool.define({
  id: 'verify_essay',
  name: 'Verify Essay',
  description: 'Run deterministic acceptance checks for requirements, word count, outline completion, source references, placeholders, duplicate paragraphs, and rubric coverage.',
  parameters: z.object({}),
  execution: 'state-write',
  requiredContext: ['session', 'editor'],
  async execute(_params, ctx) {
    const report = verifyEssay(ctx.session.essay, ctx.editor?.getText() ?? '');
    report.documentRevision = documentRevision(ctx.editor);
    ctx.session.essay.documentRevision = report.documentRevision;
    ctx.session.essay.lastVerification = report;
    touchEssaySpec(ctx.session.essay);
    return toolSuccess(report);
  },
});

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[character] ?? character);
}

function renderEssayHtml(spec: { title: string; topic: string; outline: EssaySection[] }): string {
  const title = spec.title.trim() || spec.topic.trim();
  const sections = spec.outline
    .filter((section) => section.content.trim())
    .map((section) => `${section.includeHeading ? `<h2>${escapeHtml(section.title)}</h2>` : ''}${textToHtml(section.content)}`)
    .join('');
  return `${title ? `<h1>${escapeHtml(title)}</h1>` : ''}${sections}`;
}

export const essayTools = [
  inspectEssayTool,
  updateEssaySpecTool,
  setEssayPhaseTool,
  readSectionTool,
  writeSectionTool,
  verifyEssayTool,
];
