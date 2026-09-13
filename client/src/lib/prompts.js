import { formatMinutes } from './format.js';
import {
  schedulePlanSchema,
  testPatternSchema,
  topicListSchema,
  topicNotesSchema,
  weeklyActionPlanSchema,
} from './schemas.js';

const schemaBlock = (schema) => JSON.stringify(schema, null, 2);
const daysBetween = (from, to) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

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


/**
 * Builds the prompt for a full week's timetable, generated by an assistant
 * instead of the built-in planner — the same shape as the syllabus-to-topics
 * prompt: everything the app knows goes in, structured data comes back, and
 * nothing is scheduled until it is reviewed and confirmed on the Week page.
 *
 * Fixed commitments and anything already on the calendar are listed as busy
 * time so the assistant does not double-book them; the built-in "Plan my
 * week" button still exists for when a simple, predictable fill is enough —
 * this is for when a student wants to hand over the actual judgement calls
 * (which subject first, how to balance a heavy day) to a conversation.
 */
export function schedulePlanPrompt({ from, to, anchors, topics, existingEntries, settings, examDate, coverByDate }) {
  const examLines = [];
  if (examDate) {
    const daysToExam = daysBetween(from, examDate);
    examLines.push(
      daysToExam >= 0
        ? `The exam itself is on ${examDate} — ${daysToExam} day${daysToExam === 1 ? '' : 's'} from the start of this stretch.`
        : `The exam was ${examDate} — that has already passed; treat this as post-exam if it seems out of place.`
    );
  }

  let phaseLine = null;
  if (coverByDate) {
    if (to <= coverByDate) {
      const remainingMinutes = topics.reduce((sum, topic) => sum + topic.allocated_duration_minutes, 0);
      const daysLeft = Math.max(daysBetween(from, coverByDate), 1);
      phaseLine = `Every topic should have had its first pass by ${coverByDate} (${daysLeft} day${daysLeft === 1 ? '' : 's'} from the start of this stretch) — after that the plan should lean on revision instead of new material. Right now there is roughly ${formatMinutes(remainingMinutes)} of new topic content still waiting, so this stretch should still push to get through it: weight new coverage over deep revision.`;
    } else if (from > coverByDate) {
      phaseLine = `This stretch falls after the ${coverByDate} coverage deadline, so favour revision, consolidation and practice questions over new topics here — draw on what has already been studied rather than racing through what is left.`;
    } else {
      phaseLine = `This stretch straddles the ${coverByDate} coverage deadline — push to finish off any remaining new topics in the days before it, then shift the days after towards revision.`;
    }
  }

  const busyLines = [
    ...anchors
      .filter((anchor) => anchor.is_active)
      .map(
        (anchor) =>
          `- Every ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][anchor.day_of_week]}, ${anchor.start_time}–${anchor.end_time}: ${anchor.label}` +
          (anchor.effective_from ? ` (only ${anchor.effective_from} to ${anchor.effective_until})` : '')
      ),
    ...existingEntries.map(
      (entry) =>
        `- ${entry.scheduled_date}, ${entry.scheduled_start_time}–${entry.scheduled_end_time}: ${entry.tracking_label ?? entry.tracking_number} ${entry.sub_topic_title ?? entry.topic_title} (already on the calendar)`
    ),
  ].join('\n');

  const topicLines = topics
    .map((topic) => {
      const header = `- ${topic.tracking_number} ${topic.title} (${topic.subject_name}) — about ${topic.allocated_duration_minutes} minutes in total, difficulty ${topic.difficulty}/5${topic.target_date ? `, due ${topic.target_date}` : ''}`;
      if (!topic.sub_topics?.length) return header;
      const subLines = topic.sub_topics
        .map(
          (subTopic, index) =>
            `    - ${topic.tracking_number}/${String(index + 1).padStart(2, '0')}: ${subTopic}`
        )
        .join('\n');
      return `${header}\n${subLines}`;
    })
    .join('\n');

  return `You are building a study timetable for a school student, from ${from} to ${to} inclusive.
${examLines.length || phaseLine ? `\n${[...examLines, phaseLine].filter(Boolean).join('\n')}\n` : ''}
Rules for the day:
- Nothing before ${settings.day_start} or after ${settings.day_end}.
- Leave at least ${settings.break_minutes} minutes between blocks.
- No more than ${settings.daily_max_minutes} minutes of study on any one day.
- Never schedule over anything listed as busy below.

Busy time — fixed commitments and anything already booked:
${busyLines || '(nothing fixed recorded yet)'}

Topics waiting for a place on the calendar, with their sub-topics listed underneath where there are any:
${topicLines || '(nothing waiting — every topic already has a slot)'}

Schedule sub-topic by sub-topic wherever a topic has them listed, rather than booking the whole topic as one sitting — split its total minutes across its sub-topics however makes sense (a harder one can take longer than an easier one), and give each its own block using its own number, e.g. "PHY-001/01", "PHY-001/02". Only use the plain topic number, with no "/NN", for a topic that has no sub-topics listed. Do not invent a number that is not listed above.

Make it realistic and thoughtful, not a cram session:
- Interleave subjects rather than blocking one subject for hours straight. Mixing subjects within a day helps retention far more than marathon single-subject blocks — after at most one or two sittings of the same subject, move to a different one before coming back to it.
- The same goes within one topic: don't chain every one of its sub-topics back-to-back in a single stretch. Spread them across different days where you can, so the same material comes back after a gap rather than all at once.
- Spread sittings across the whole date range instead of front-loading a single day — not everything needs to fit in this one stretch, and a lighter day here and there is fine.
- Schedule only the first sitting for each sub-topic. This app books that sitting's own revision follow-ups (a day later, three days later, a week later) automatically the moment it is saved — you do not need to add revision blocks yourself, and doing so would only double them up.
- Where it genuinely helps — a problem-solving subject like maths or physics, or a sub-topic that is more about applying a method than remembering facts — add a separate practice sitting a few days after the study sitting, working questions on it rather than meeting it for the first time. Mark it with "session_type": "practice" (the study sitting itself needs no "session_type", or "study" if you'd rather be explicit). Not every sub-topic needs one; use judgement.

Lunch and dinner are not fixed commitments here — you decide when they happen each day, fitting them around everything else and giving each a sensible length (roughly 30–45 minutes). List one lunch and one dinner for every day in this stretch in a separate top-level "meals" array (not "entries", since they are not study blocks), each with "date", "label" ("Lunch" or "Dinner"), "start_time" and "end_time".

Reply with JSON only. No explanation before or after it, and no markdown code fence.

The JSON must match this schema:

${schemaBlock(schedulePlanSchema)}`;
}
