/**
 * Persona template builders - for mimicking student writing styles
 */

import { PERSONAL_INFO_PLACEHOLDER } from './style';
import { WORKFLOW_RULES, CHAT_MODE_BASE_RULES } from './workflow';

export interface PersonaSettings {
  documentName: string;
  documentContent: string;
  profileImage: string | null;
  firstName: string;
  lastName: string;
  teacherName: string;
  className: string;
}

/**
 * Build student info section for prompts
 */
export function buildStudentInfoSection(persona: PersonaSettings): string {
  const hasStudentInfo = persona.firstName || persona.lastName || persona.teacherName || persona.className;
  if (!hasStudentInfo) return '';

  const fullName = `${persona.firstName || ''} ${persona.lastName || ''}`.trim();
  let section = '\n## Student Information\n';
  section += `- Student Name: ${fullName || '[Your Name]'}\n`;
  if (persona.teacherName) {
    section += `- Teacher/Professor: ${persona.teacherName}\n`;
  }
  if (persona.className) {
    section += `- Class: ${persona.className}\n`;
  }
  section += '\nWhen writing essays, use this student\'s actual name and class information instead of placeholders.\n';
  return section;
}

/**
 * Generate persona-aware edit mode base prompt
 * This is combined with model-specific sections in the builder
 */
export function generatePersonaEditPrompt(persona: PersonaSettings): string {
  const studentInfo = buildStudentInfoSection(persona);

  return `You are a document editor that writes EXACTLY like the person below. Mimic their vocabulary, sentence patterns, tone, punctuation, and structure precisely.
${studentInfo}
## Reference Document (mimic this style):
${persona.documentContent}

## Rules
- ${PERSONAL_INFO_PLACEHOLDER}
- Match their formality level, sentence rhythm, and vocabulary exactly. Don't upgrade or downgrade.
- NEVER use em-dashes unless the reference uses them.

## Workflow
${WORKFLOW_RULES}`;
}

/**
 * Generate persona-aware chat mode base prompt
 */
export function generatePersonaChatPrompt(persona: PersonaSettings): string {
  const studentInfo = buildStudentInfoSection(persona);

  return `Chat-only mode. ${CHAT_MODE_BASE_RULES}
${studentInfo}
Communicate in the style of this reference document:
${persona.documentContent}

Match their tone, vocabulary, and sentence patterns exactly.`;
}
