import { formatMinutes } from './format.js';
import {
  schedulePlanSchema,
  studyBlockSchema,
  testPatternSchema,
  topicEnrichmentSchema,
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
export function testPatternPrompt({ test, results, topics = [] }) {
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

  const topicBlock = topics
    .map((topic) => `- ${topic.tracking_number}: ${topic.title} (${topic.subject_name})`)
    .join('\n');

  return `You are helping a school student understand their own test performance — kindly and specifically, not just "study harder."

Test: "${test.test_name}"${test.source ? ` (${test.source})` : ''}${test.test_date ? `, taken ${test.test_date}` : ''}.
${score}
${test.notes ? `The student's own note about the test: "${test.notes}"` : ''}

Here is the question-by-question breakdown:

${rows || '(no per-question breakdown was recorded — work from the overall score and notes above)'}

Here is the student's current topic list, for reference — each has a tracking number:

${topicBlock || '(no topics recorded yet)'}

Look for real patterns, not just a list of wrong answers:
- Which subjects or topics is the trouble concentrated in? When a weak area clearly matches one of the topics listed above, include its tracking_number so it can be linked up directly — leave tracking_number out (null) rather than guessing if nothing matches well.
- Are mistakes more like careless slips (fast, wrong) or real concept gaps (slow, wrong, or not attempted)?
- Does timing suggest the student was rushed, especially later in the test?
- What would actually help this coming week — specific and doable, not generic advice.

However you phrase things, be constructive and specific rather than harsh: never describe the student as lazy, careless, or unmotivated as if it were a trait. Every observation should read as a specific, fixable habit — something a 16-year-old could act on without feeling labelled.

Reply with JSON only. No explanation before or after it, and no markdown code fence.

The JSON must match this schema:

${schemaBlock(testPatternSchema)}`;
}

/**
 * Builds the prompt for a weekly action plan, using recent test analyses and
 * the current state of the topic list as its raw material.
 */
export function weeklyActionPlanPrompt({ recentPatterns, topics, progressSummary, lastWeekGoals }) {
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

  const lastWeekBlock = lastWeekGoals?.length
    ? lastWeekGoals.map((goal) => `- "${goal.goal}" (measured by: ${goal.how_to_measure})`).join('\n')
    : null;

  return `You are helping a school student plan the coming week of study. Be specific and realistic — a handful of clear priorities, not an overwhelming list.

Recent test analysis:
${patternBlock}

${progressLine}

Topics currently on the list:
${topicBlock || '(no topics recorded yet)'}
${lastWeekBlock ? `\nLast week's behavioural goals, for context (comment on these only if genuinely relevant — don't force it):\n${lastWeekBlock}\n` : ''}
Suggest a short, prioritised plan for this week. For each priority, name an actual topic from the list above (use its tracking number if you can) and say briefly why it matters now. Keep the total realistic for a school student alongside their normal week.

Also suggest 1–2 behavioural goals for the week — not "study more," but something specific and genuinely measurable, so it's obvious next week whether it happened (e.g. "log a confidence rating after every session" measured by "count of sessions with a rating, out of total sessions," not "be more consistent"). If last week's goals are shown above, it's fine to carry one forward if it's still the right thing to work on, or to note if it's now solid and pick a new one — but don't force a callback that doesn't fit.

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
 * instead of the built-in planner. It works over the master list (every
 * chapter's five-stage practice cycle) rather than raw topics — each
 * pending stage is its own schedulable item, referenced as
 * "PHY-001/S3" (tracking number + stage number). Nothing is booked until
 * the reply is reviewed and confirmed on the Week page.
 */
const buildItemLines = (pendingItems) => {
  const byTopic = new Map();
  for (const item of pendingItems) {
    if (!byTopic.has(item.topic_id)) byTopic.set(item.topic_id, []);
    byTopic.get(item.topic_id).push(item);
  }

  return [...byTopic.values()]
    .map((items) => {
      const first = items[0];
      const header = `- ${first.tracking_number} ${first.topic_title} (${first.subject_name})`;
      const stageLines = items
        .sort((a, b) => a.stage - b.stage)
        .map((item) => `    - ${item.tracking_number}/S${item.stage}: ${item.label} — about ${item.estimated_minutes} minutes`)
        .join('\n');
      return `${header}\n${stageLines}`;
    })
    .join('\n');
};

export function schedulePlanPrompt({
  from,
  to,
  anchors,
  pendingItems,
  existingEntries,
  settings,
  examDate,
  coverByDate,
  studyBlocks = [],
  gapSummary,
}) {
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
    const remainingMinutes = pendingItems.reduce((sum, item) => sum + item.estimated_minutes, 0);
    const daysLeft = Math.max(daysBetween(from, coverByDate), 1);
    if (to <= coverByDate) {
      phaseLine = `Every chapter should be through its full five-stage cycle by ${coverByDate} (${daysLeft} day${daysLeft === 1 ? '' : 's'} from the start of this stretch). Right now there is roughly ${formatMinutes(remainingMinutes)} of master-list work still pending across every subject, so this stretch should push to make real progress on it.`;
    } else if (from > coverByDate) {
      phaseLine = `This stretch falls after the ${coverByDate} coverage deadline, so favour the later stages — previous-year questions and timed sets — over first-pass stages here.`;
    } else {
      phaseLine = `This stretch straddles the ${coverByDate} coverage deadline — push to finish off earlier-stage work in the days before it, then shift the days after towards the later stages.`;
    }
  }

  const gapLines = gapSummary ? `\nProgress against the saved plan: ${gapSummary}\n` : '';

  const busyLines = [
    ...anchors
      .filter((anchor) => anchor.is_active)
      .map(
        (anchor) =>
          `- Every ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][anchor.day_of_week]}, ${anchor.start_time}–${anchor.end_time}: ${anchor.label}` +
          (anchor.buffer_after_minutes ? ` (plus ${anchor.buffer_after_minutes} min travel after — not free until then)` : '') +
          (anchor.effective_from ? ` (only ${anchor.effective_from} to ${anchor.effective_until})` : '')
      ),
    ...existingEntries.map(
      (entry) =>
        `- ${entry.scheduled_date}, ${entry.scheduled_start_time}–${entry.scheduled_end_time}: ${entry.tracking_label ?? entry.tracking_number} ${entry.topic_title} (already on the calendar)`
    ),
  ].join('\n');

  const itemLines = buildItemLines(pendingItems);

  const studyWindowLines = studyBlocks
    .filter((block) => block.is_active)
    .map(
      (block) =>
        `- Every ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][block.day_of_week]}, ${block.start_time}–${block.end_time}`
    )
    .join('\n');

  return `You are building a study timetable for a school student, from ${from} to ${to} inclusive.
${examLines.length || phaseLine ? `\n${[...examLines, phaseLine].filter(Boolean).join('\n')}\n` : ''}${gapLines}
Rules for the day:
- Nothing before ${settings.day_start} or after ${settings.day_end}.
- Leave at least ${settings.break_minutes} minutes between blocks.
- No more than ${settings.daily_max_minutes} minutes of study on any one day.
- Never schedule over anything listed as busy below.
${
  studyWindowLines
    ? `- The student has already agreed which stretches of the week are for studying at all. Only place blocks inside these windows — never outside them, even if a gap elsewhere looks free:\n${studyWindowLines}\n`
    : ''
}
Busy time — fixed commitments and anything already booked:
${busyLines || '(nothing fixed recorded yet)'}

The master list — every chapter's five-stage practice cycle (NCERT solved examples, NCERT exercises, a module, previous-year questions, a timed set), with only what's still pending listed. Use each stage's own reference (e.g. "PHY-001/S3") — do not invent one that isn't listed:
${itemLines || '(nothing pending — every chapter is through its full cycle)'}

Schedule stage by stage, not the whole chapter as one sitting. A few things about the cycle itself:
- The stages are deliberately spread apart — this is spaced repetition, not a checklist to clear in one sitting. Prefer chapters at different stages across the week over racing one chapter through all five.
- Stage 1 (NCERT examples) is first-pass learning and suits a fresher part of the day. Stages 2-4 are the bulk of problem-solving practice. Stage 5 (timed set) needs a genuinely uninterrupted stretch, phone away — don't place it in a short gap.
- A chapter's stages don't need to be scheduled all at once — only schedule what reasonably fits in this stretch; later stages can wait for a future run once earlier ones are actually done.

Make it realistic and thoughtful, not a cram session — this is a schedule a person has to actually live through, not a machine executing a plan:
- Respect travel time. Where a busy item above says "travel after," the student is not free the moment it ends — do not open a block right at that end time. Lunch in particular usually happens at home after school, not at school, so it needs the travel time to have passed first, same for anything straight after coaching or another commitment away from home.
- Leave real breathing room, not just the minimum gap between blocks. A block right after getting home from somewhere, or right after a long single-subject stretch, should have a bit of slack before it — a few minutes to actually arrive, eat, or just exist, not an instant hand-off from one obligation to the next.
- Interleave subjects rather than blocking one subject for hours straight. Mixing subjects within a day helps retention far more than marathon single-subject blocks.
- Spread sittings across the whole date range instead of front-loading a single day — not everything needs to fit in this one stretch, and a lighter day here and there is fine.

Breakfast, lunch and dinner are not fixed commitments here — you decide when they happen each day, fitting them around everything else. Breakfast should come before the school or coaching day gets going (roughly 15–20 minutes); lunch and dinner get a more relaxed length (roughly 30–45 minutes). List all three for every day in this stretch in a separate top-level "meals" array (not "entries", since they are not study blocks), each with "date", "label" ("Breakfast", "Lunch" or "Dinner"), "start_time" and "end_time".

Family time and leisure aren't fixed either, and this is not optional to include — a student who only ever studies burns out, so build real downtime in rather than filling every free minute with something productive. Every day in this stretch should have at least a bit of unstructured time in it somewhere, even a short one; across the whole stretch, propose a mix of some family time (with parents, or the kind of thing the busy list already calls "Family time" if that's still there for older weeks) and some pure leisure — free time, phone, TV, games, whatever a teenager actually wants to do with a gap. They don't need to be the same length or happen at the same time every day like meals do; a solid stretch on a couple of days beats a token five minutes on all of them, as long as no day is left with nothing at all. List them in a separate top-level "personal_time" array, each with "date", "label" (whatever fits — "Family time", "Free time", "Phone time", "TV time"), "kind" ("family" or "leisure"), "start_time" and "end_time".

At the very end, in a top-level "gap_note" string, give one honest sentence on whether this stretch's plan is enough to keep pace given the progress note above — if behind, say roughly how much more time per week would close the gap. Use null if there was no progress note to react to.

Reply with JSON only. No explanation before or after it, and no markdown code fence.

The JSON must match this schema:

${schemaBlock(schedulePlanSchema)}`;
}

const DAY_LABELS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Builds the prompt for designing the weekly shape of study time itself —
 * which windows across an ordinary week are for studying at all, before
 * any subject gets scheduled into them. Unlike the scheduling prompt
 * above, this one is not told what's free — it's told what's already
 * fixed, and what the student says they actually have left in each part
 * of the day, and asked to design the blocks (with breaks and leisure
 * folded in) rather than just filling every open gap.
 */
export function studyBlockPrompt({ anchors, dayParts, notes }) {
  const busyLines = anchors
    .filter((anchor) => anchor.is_active)
    .map(
      (anchor) =>
        `- Every ${DAY_LABELS_FULL[anchor.day_of_week].slice(0, 3)}, ${anchor.start_time}–${anchor.end_time}: ${anchor.label}` +
        (anchor.buffer_after_minutes ? ` (plus ${anchor.buffer_after_minutes} min travel after — not free until then)` : '')
    )
    .join('\n');

  const dayPartLines = Object.entries(dayParts)
    .filter(([, value]) => value && value.trim())
    .map(([part, value]) => `- ${part[0].toUpperCase()}${part.slice(1)}: ${value.trim()}`)
    .join('\n');

  return `You are designing the weekly shape of study time for a school student — which stretches of an ordinary week are actually set aside for studying, not what happens inside them (that's a separate step, later).

This is a repeating weekly pattern, the same shape every week, not a specific dated calendar — think "every Tuesday," not "this coming Tuesday."

Already fixed every week — never place a study block over any of this, and remember a commitment away from home isn't over the moment it ends if it says so:
${busyLines || '(nothing fixed recorded yet)'}

What the student says they actually have left over, by part of the day — these are hard limits, not inspiration. Read each one carefully: it may list different clock times for different days within the same part of the day (e.g. "Monday, Tuesday 2:30–3:15pm" as one clause and "Wednesday, Friday 4–5pm" as another within "Afternoon"), so match each day to its own clause rather than one single time for the whole day-part:
${dayPartLines || '(not specified — use your judgement from what is already fixed)'}
${notes && notes.trim() ? `\nAnything else worth knowing: ${notes.trim()}\n` : ''}
Hard constraint, non-negotiable: every block's start_time and end_time must fall entirely inside one of the windows stated above for that exact day. Never place a block on a day with no stated window, and never place a block outside the clock times given for that day even by a few minutes — if you want breathing room, start the block later within the window or make it shorter, but do not shift or invent a window that wasn't stated. Double-check every block against the source text above before including it.

Within that constraint, use real judgement:
- You don't have to fill a whole window — a stated 5:30–6:15am slot can host a 30-minute block starting at 5:35, leaving the rest as breathing room or unused.
- Mix what a block is good for across the week — some blocks suit focused problem-solving (a longer stretch, mid-afternoon or a free morning), some suit a short low-effort review (right after a tiring commitment), some suit calm first-pass learning (fresher parts of the day). Say which, briefly, in each block's "note".
- Build in actual leisure and rest, not just study — a day that is wall-to-wall blocks is a worse plan than one with fewer, better-placed blocks and real gaps left alone. Not every stated window needs a block — skipping one entirely for rest is fine.
- A short block (20–30 minutes) is fine and often better than a long one, especially on a tired day — don't pad a block out just to fill a whole window.
- Keep it realistic for a teenager to actually follow, not a machine executing a schedule.

Reply with JSON only. No explanation before or after it, and no markdown code fence.

The JSON must match this schema:

${schemaBlock(studyBlockSchema)}`;
}

/**
 * Builds the prompt for batch topic enrichment: for each topic in this
 * chunk, what to understand, key concepts, a difficulty rating, an
 * estimated study time, and a few resources to look for. Topics are
 * referenced by tracking_number so the reply can be matched back to the
 * right one and reviewed as a diff before anything is changed.
 */
export function topicEnrichmentPrompt({ subjectName, topics }) {
  const topicBlock = topics
    .map((topic) => {
      const subTopicLine = topic.sub_topics?.length ? ` — covers: ${topic.sub_topics.join(', ')}` : '';
      return `- ${topic.tracking_number}: ${topic.title}${subTopicLine}`;
    })
    .join('\n');

  return `You are helping enrich a CBSE Class 11 study syllabus for an engineering-entrance aspirant who is also attending Aakash coaching alongside school — so treat each topic at that level, not a general-audience explainer.

Here are the topics in "${subjectName}" to enrich, each with its tracking number:

${topicBlock}

For every topic listed above, return:
- "what_to_understand": one or two sentences on the core idea the student actually needs to grasp, not a topic restatement.
- "key_concepts": a short list of the specific concepts, formulas or terms this topic covers.
- "difficulty": your honest rating from 1 (straightforward) to 5 (demanding), for a student at this level.
- "estimated_hours": a realistic total study time for this topic, in hours (can be a fraction, e.g. 1.5).
- "resources" (optional): 2–3 things to search for — since you cannot know which links still resolve, describe each as something to look up (e.g. "Khan Academy: Newton's Laws") rather than a URL.

Include every topic listed above — do not skip any, and do not invent topics that were not listed.

Reply with JSON only. No explanation before or after it, and no markdown code fence.

The JSON must match this schema:

${schemaBlock(topicEnrichmentSchema)}`;
}
