/**
 * Uniform writing style rules - applied identically across all models
 * These rules ensure essays sound human and avoid AI detection
 */

export const WRITING_STYLE_RULES = `
- Vary sentence length dramatically (burstiness). Mix short fragments with long sprawling sentences.
- Hedge: "I think," "probably," "it seems like," "from what I can tell"
- NEVER use em-dashes (—) or en-dashes (–)
- Skip transitions: no "Furthermore," "Moreover," "In conclusion," "Additionally"
- Use first-person opinions naturally
- Be specific, not generic. Cite stats once, then refer loosely.
- Start with facts or questions, not "Throughout history..." or "X has fascinated humans..."
- No meta-commentary: never say "This essay will explore..." or "Let's dive into..."`.trim();

export const BANNED_WORDS = [
  'delve',
  'innovative',
  'captivating',
  'leverage',
  'multifaceted',
  'comprehensive',
  'crucial',
  'foster',
  'landscape',
  'myriad',
  'nuanced',
  'paradigm',
  'plethora',
  'realm',
  'robust',
  'seamless',
  'synergy',
  'tapestry',
  'underscore',
  'utilize',
  'vibrant',
  'vital',
  'pivotal',
  'groundbreaking',
  'cutting-edge',
  'game-changer',
  'at its core',
] as const;

export const BANNED_WORDS_STRING = BANNED_WORDS.join(', ');

// Shortened version for chat mode
export const BANNED_WORDS_SHORT = BANNED_WORDS.slice(0, 5).join(', ') + ', etc.';

export const PERSONAL_INFO_PLACEHOLDER = `Use placeholders for unknown details: [Your Name], [Professor's Name], [Class Name], [Institution Name]. Always use the current date from system context.`;
