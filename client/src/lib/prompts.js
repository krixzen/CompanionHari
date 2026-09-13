import {
  testPatternSchema,
  topicListSchema,
  topicNotesSchema,
  weeklyActionPlanSchema,
} from './schemas.js';

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


/**
 * Builds the prompt for spotting patterns in one test's per-question results.
 *
 * The rows already carry whatever subject and topic they were tagged with in
 * the review table, so the assistant is not asked to invent structure — only
 * to read what actually happened and say something useful about it.
 */
export function testPatternPrompt({ test, results }) {
  const rows = results
    .map((row, index) => {
      const bits = [
        `Q${row.question_number ?? index + 1}`,
        row.subject_name ?? 'subject not set',
        row.topic_title ? `topic: ${row.topic_title}` : 'topic not set',
        row.attempted ? (row.correct ? 'correct' : 'attempted, incorrect') : 'not attempted',
        row.marks != null ? `${row.marks} marks` : null,
        row.time_taken_seconds != null ? `${row.time_taken_seconds}s` : null,
      ].filter(Boolean);
      return `- ${bits.join(' · ')}`;
    })
    .join('\n');

  const score =
    test.total_marks != null && test.marks_obtained != null
      ? `Scored ${test.marks_obtained} out of ${test.total_marks}.`
      : 'No overall score was recorded.';

  return `You are helping a school student understand their own test performance — kindly and specifically, not just "study harder."

Test: "${test.test_name}"${test.source ? ` (${test.source})` : ''}${test.test_date ? `, taken ${test.test_date}` : ''}.
${score}
${test.notes ? `The student's own note about the test: "${test.notes}"` : ''}

Here is the question-by-question breakdown:

${rows || '(no per-question breakdown was recorded — work from the overall score and notes above)'}

Look for real patterns, not just a list of wrong answers:
- Which subjects or topics is the trouble concentrated in?
- Are mistakes more like careless slips (fast, wrong) or real concept gaps (slow, wrong, or not attempted)?
- Does timing suggest the student was rushed, especially later in the test?
- What would actually help this coming week — specific and doable, not generic advice.

Reply with JSON only. No explanation before or after it, and no markdown code fence.

The JSON must match this schema:

${schemaBlock(testPatternSchema)}`;
}

/**
 * Builds the prompt for a weekly action plan, using recent test analyses and
 * the current state of the topic list as its raw material.
 */
export function weeklyActionPlanPrompt({ recentPatterns, topics, progressSummary }) {
  const patternBlock = recentPatterns.length
    ? recentPatterns
        .map((analysis) => {
          const payload = analysis.payload ?? {};
          const weak = (payload.weak_areas ?? [])
            .map((area) => `${area.subject}${area.topic ? ` (${area.topic})` : ''}: ${area.issue}`)
            .join('; ');
          return `- From "${analysis.test_name ?? 'a recent test'}" (${analysis.created_at.slice(0, 10)}): ${payload.overall_summary ?? ''}${weak ? ` Weak areas: ${weak}.` : ''}`;
        })
        .join('\n')
    : '(no recent test analyses — work from the topic list alone)';

  const topicBlock = topics
    .map(
      (topic) =>
        `- ${topic.tracking_number} ${topic.title} (${topic.subject_name}) — status: ${topic.status}, difficulty ${topic.difficulty}/5${topic.target_date ? `, due ${topic.target_date}` : ''}`
    )
    .join('\n');

  const progressLine = progressSummary
    ? `This week so far: ${progressSummary.week.minutes} minutes across ${progressSummary.week.subjects} subjects, average confidence ${progressSummary.week.confidence ?? 'not rated'}.`
    : '';

  return `You are helping a school student plan the coming week of study. Be specific and realistic — a handful of clear priorities, not an overwhelming list.

Recent test analysis:
${patternBlock}

${progressLine}

Topics currently on the list:
${topicBlock || '(no topics recorded yet)'}

Suggest a short, prioritised plan for this week. For each priority, name an actual topic from the list above (use its tracking number if you can) and say briefly why it matters now. Keep the total realistic for a school student alongside their normal week.

Reply with JSON only. No explanation before or after it, and no markdown code fence.

The JSON must match this schema:

${schemaBlock(weeklyActionPlanSchema)}`;
}

/**
 * Builds the prompt for generating key-concept notes and study resources for
 * one topic. Resources are asked for as suggestions to search for, not links —
 * an assistant cannot know which URLs still resolve.
 */
export function topicNotesPrompt({ topic }) {
  const subTopicLine = topic.sub_topics?.length ? `\nIt covers: ${topic.sub_topics.join(', ')}.` : '';

  return `You are helping a school student revise "${topic.title}" from ${topic.subject_name}.${subTopicLine}

Write a compact, exam-focused summary of the key concepts for this topic — the kind of notes a student would want the night before a test. Use plain text with short lines or a simple list; no markdown headings.

Then suggest a small number of study resources. Since you cannot know which links still work, describe each as something to search for (e.g. "Khan Academy: Newton's Laws") rather than a URL.

Reply with JSON only. No explanation before or after it, and no markdown code fence.

The JSON must match this schema:

${schemaBlock(topicNotesSchema)}`;
}
