/**
 * Plan Mode Detector
 *
 * Detects when a user message indicates they want to write an essay
 * or other complex document that would benefit from planning mode.
 */

export interface PlanModeResult {
  shouldUsePlanMode: boolean;
  confidence: number; // 0.0 to 1.0
  detectedIntent: 'essay' | 'research_paper' | 'report' | 'general_writing' | 'none';
  suggestedQuestions: string[];
}

// Patterns that strongly indicate essay/paper writing
const STRONG_ESSAY_PATTERNS = [
  /write\s+(me\s+)?(an?\s+)?essay/i,
  /write\s+(me\s+)?(an?\s+)?paper/i,
  /write\s+(me\s+)?(an?\s+)?research\s+paper/i,
  /need\s+(an?\s+)?essay/i,
  /need\s+(an?\s+)?paper/i,
  /help\s+(me\s+)?write\s+(an?\s+)?essay/i,
  /help\s+(me\s+)?write\s+(an?\s+)?paper/i,
  /argumentative\s+essay/i,
  /persuasive\s+essay/i,
  /expository\s+essay/i,
  /narrative\s+essay/i,
  /compare\s+and\s+contrast/i,
  /literary\s+analysis/i,
  /book\s+report/i,
  /term\s+paper/i,
  /thesis\s+(statement|paper)/i,
];

// Patterns that indicate document requirements
const REQUIREMENT_PATTERNS = [
  /(\d+)\s*words?/i,
  /(\d+)\s*pages?/i,
  /word\s+count/i,
  /page\s+(count|limit|requirement)/i,
  /due\s+(date|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
  /deadline/i,
  /apa\s+(format|style|citation)/i,
  /mla\s+(format|style|citation)/i,
  /chicago\s+(format|style|citation)/i,
  /harvard\s+(format|style|citation)/i,
  /bibliography/i,
  /works\s+cited/i,
  /references?\s+page/i,
];

// Patterns that suggest general writing but less specific
const WEAK_WRITING_PATTERNS = [
  /write\s+(about|on)/i,
  /help\s+(me\s+)?write/i,
  /need\s+to\s+write/i,
  /assignment/i,
  /homework/i,
  /project/i,
];

// Topics that often indicate academic writing
const ACADEMIC_TOPIC_PATTERNS = [
  /climate\s+change/i,
  /global\s+warming/i,
  /social\s+media/i,
  /artificial\s+intelligence/i,
  /technology/i,
  /history\s+of/i,
  /impact\s+of/i,
  /effects?\s+of/i,
  /causes?\s+of/i,
  /analysis\s+of/i,
  /significance\s+of/i,
];

/**
 * Detect if a user message should trigger plan mode.
 */
export function detectPlanMode(userMessage: string): PlanModeResult {
  const message = userMessage.toLowerCase();
  let confidence = 0;
  let detectedIntent: PlanModeResult['detectedIntent'] = 'none';
  const suggestedQuestions: string[] = [];

  // Check strong essay patterns (+0.5 each, max 0.6)
  let strongMatches = 0;
  for (const pattern of STRONG_ESSAY_PATTERNS) {
    if (pattern.test(message)) {
      strongMatches++;
    }
  }
  if (strongMatches > 0) {
    confidence += Math.min(0.6, strongMatches * 0.5);

    // Determine specific intent
    if (/research\s+paper/i.test(message)) {
      detectedIntent = 'research_paper';
    } else if (/essay/i.test(message)) {
      detectedIntent = 'essay';
    } else if (/report/i.test(message)) {
      detectedIntent = 'report';
    } else {
      detectedIntent = 'general_writing';
    }
  }

  // Check requirement patterns (+0.15 each, max 0.3)
  let requirementMatches = 0;
  const hasWordCount = /(\d+)\s*words?/i.test(message);
  const hasPageCount = /(\d+)\s*pages?/i.test(message);
  const hasCitationFormat = /(apa|mla|chicago|harvard)/i.test(message);
  const hasDueDate = /due|deadline/i.test(message);

  for (const pattern of REQUIREMENT_PATTERNS) {
    if (pattern.test(message)) {
      requirementMatches++;
    }
  }
  if (requirementMatches > 0) {
    confidence += Math.min(0.3, requirementMatches * 0.15);
  }

  // Check weak writing patterns (+0.2 each, max 0.2)
  if (detectedIntent === 'none') {
    for (const pattern of WEAK_WRITING_PATTERNS) {
      if (pattern.test(message)) {
        confidence += 0.2;
        detectedIntent = 'general_writing';
        break;
      }
    }
  }

  // Check academic topics (+0.1 each, max 0.2)
  let topicMatches = 0;
  for (const pattern of ACADEMIC_TOPIC_PATTERNS) {
    if (pattern.test(message)) {
      topicMatches++;
    }
  }
  if (topicMatches > 0) {
    confidence += Math.min(0.2, topicMatches * 0.1);
  }

  // Cap confidence at 1.0
  confidence = Math.min(1.0, confidence);

  // Generate suggested questions based on what's missing
  if (confidence > 0.3) {
    // Check what info we already have
    const hasTopic = ACADEMIC_TOPIC_PATTERNS.some(p => p.test(message)) ||
                     message.length > 50; // Longer messages likely have topic

    if (!hasTopic) {
      suggestedQuestions.push('What topic or thesis should the essay cover?');
    }

    if (!hasWordCount && !hasPageCount) {
      suggestedQuestions.push('How long should this be? (word count or pages)');
    }

    if (!hasCitationFormat) {
      suggestedQuestions.push('What citation format should be used? (APA, MLA, etc.)');
    }

    if (!hasDueDate) {
      suggestedQuestions.push('When is this due?');
    }

    // Always ask about specific requirements
    suggestedQuestions.push('Are there any specific requirements or rubric points to address?');
  }

  return {
    shouldUsePlanMode: confidence >= 0.5,
    confidence,
    detectedIntent,
    suggestedQuestions: suggestedQuestions.slice(0, 4), // Max 4 questions
  };
}

/**
 * Get the plan mode system prompt addition.
 * This instructs the AI to ask questions before writing.
 */
export function getPlanModeInstructions(): string {
  return `
## Planning Mode Instructions

When the user asks you to write an essay, paper, or other document:

1. FIRST, use the ask_user tool to clarify any missing requirements:
   - Topic or thesis (if not clearly stated)
   - Required length (word count or number of pages)
   - Citation format (APA, MLA, Chicago, etc.)
   - Due date or urgency level
   - Specific requirements, rubric points, or guidelines

2. AFTER gathering requirements, use the todowrite tool to create a task list:
   - Break down the writing into logical sections
   - Include research steps if sources are needed
   - Add formatting and citation tasks

3. THEN execute the plan step by step:
   - Update task status as you complete each step
   - Use search_web for research if needed
   - Write content using document tools

Always ask clarifying questions BEFORE starting to write. This ensures the final document meets the user's exact needs.

When using ask_user:
- Keep questions concise and specific
- Provide helpful option choices when possible
- Don't ask more than 2-3 questions at a time
`;
}
