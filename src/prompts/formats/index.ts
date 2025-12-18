/**
 * Essay Format Templates
 *
 * This module exports preset academic essay formats (APA, MLA)
 * and validation utilities for checking formatting compliance.
 */

import type { EssayTemplate } from '../builder';

// Preset templates
export { APA_TEMPLATE } from './apa';
export { MLA_TEMPLATE } from './mla';

// Import for array construction
import { APA_TEMPLATE } from './apa';
import { MLA_TEMPLATE } from './mla';

/**
 * All preset templates combined into a single array.
 * Use this when you need to list all available presets.
 */
export const PRESET_TEMPLATES: EssayTemplate[] = [APA_TEMPLATE, MLA_TEMPLATE];

// Validation utilities
export {
  validateFormatting,
  parseTemplateRequirements,
  type FormatValidationResult,
  type FormatIssue,
  type FormatCorrection,
  type TemplateRequirements,
} from './validation';
