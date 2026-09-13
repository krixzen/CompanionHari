import { topicListSchema } from './schemas.js';

const schemaBlock = (schema) => JSON.stringify(schema, null, 2);

/**
 * Builds the prompt for turning a messy syllabus into a structured topic list.
 *
 * The app never calls an AI service itself. This text is copied by hand into
 * Claude or ChatGPT, and the reply is pasted back — so the prompt has to be
 * completely self-contained.
 */
export function syllabusToTopicsPrompt({ subjectName, syllabusText }) {
  return `You are helping a school student organise a syllabus into a study plan.

Below is the raw text of a ${subjectName} syllabus outline. Turn it into a clean list of study topics.

Rules:
- Each topic should be one sitting's worth of study — a chapter or a named section, not a whole unit and not a single definition.
- Keep the syllabus's own wording. Do not invent topics that are not in the text.
- Put the unit or chapter heading a topic belongs to in "unit". Use null if there isn't one.
- Put the smaller points listed under a topic in "sub_topics".
- "difficulty" is your honest estimate from 1 (straightforward) to 5 (demanding).
- "allocated_duration_minutes" is a sensible first guess at study time, in minutes.

Reply with JSON only. No explanation before or after it, and no markdown code fence.

The JSON must match this schema:

${schemaBlock(topicListSchema)}

Here is the syllabus text:

---
${syllabusText}
---`;
}
