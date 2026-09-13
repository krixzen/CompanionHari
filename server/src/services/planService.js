import { getDb } from '../db/index.js';
import { badRequest, notFound } from '../lib/httpError.js';
import { addDays, datesBetween, isIsoDate, toMinutes, toTime, todayIso } from '../lib/time.js';
import {
  REVISION_OFFSETS,
  buildBusyMap,
  buildLoadMap,
  planTopics,
  reserveSlot,
  revisionMinutes,
} from './scheduler.js';
import { getPlannerSettings } from './settingsService.js';
import { resolveEffectiveAnchors } from './templateService.js';

const ENTRY_SELECT = `
  SELECT
    p.*,
    t.tracking_number, t.title AS topic_title, t.sub_topics, t.difficulty, t.status AS topic_status,
    s.id AS subject_id, s.name AS subject_name, s.colour AS subject_colour, s.code AS subject_code
  FROM plan_entry p
  JOIN topic t   ON t.id = p.topic_id
  JOIN subject s ON s.id = t.subject_id
`;

const toEntry = (row) => {
  if (!row) return row;
  const subTopics = JSON.parse(row.sub_topics ?? '[]');
  const subTopicTitle =
    row.sub_topic_index != null ? subTopics[row.sub_topic_index] ?? null : null;

  return {
    ...row,
    sub_topics: undefined,
    completed: Boolean(row.completed),
    scheduled_end_time: toTime(toMinutes(row.scheduled_start_time) + row.scheduled_duration_minutes),
    sub_topic_title: subTopicTitle,
    tracking_label:
      row.sub_topic_index != null
        ? `${row.tracking_number}/${String(row.sub_topic_index + 1).padStart(2, '0')}`
        : row.tracking_number,
  };
};

export function listPlanEntries(studentId, from, to) {
  if (!isIsoDate(from) || !isIsoDate(to)) throw badRequest('Dates should look like 2026-09-14.');

  return getDb()
    .prepare(
      `${ENTRY_SELECT}
       WHERE s.student_id = ? AND p.scheduled_date BETWEEN ? AND ?
       ORDER BY p.scheduled_date, p.scheduled_start_time, p.id`
    )
    .all(studentId, from, to)
    .map(toEntry);
}

export function getPlanEntry(studentId, entryId) {
  const row = getDb()
    .prepare(`${ENTRY_SELECT} WHERE p.id = ? AND s.student_id = ?`)
    .get(entryId, studentId);
  if (!row) throw notFound('That block is no longer on the calendar.');
  return toEntry(row);
}

const ownsTopic = (studentId, topicId) =>
  getDb()
    .prepare(
      `SELECT t.id, t.sub_topics FROM topic t JOIN subject s ON s.id = t.subject_id
       WHERE t.id = ? AND s.student_id = ?`
    )
    .get(topicId, studentId);

/** Validates a sub-topic index against the topic it belongs to, or returns null. */
function readSubTopicIndex(topic, value) {
  if (value === undefined || value === null) return null;
  const index = Number(value);
  const subTopics = JSON.parse(topic.sub_topics ?? '[]');
  if (!Number.isInteger(index) || index < 0 || index >= subTopics.length) {
    throw badRequest('That sub-topic does not exist on this topic.');
  }
  return index;
}

function validateSlot({ scheduled_date: date, scheduled_start_time: start, scheduled_duration_minutes: minutes }) {
  if (!isIsoDate(date)) throw badRequest('The date should look like 2026-09-14.');

  const startMinutes = toMinutes(start);
  if (startMinutes === null) throw badRequest('The start time should look like 16:30.');

  const duration = Number(minutes);
  if (!Number.isInteger(duration) || duration < 5 || duration > 12 * 60) {
    throw badRequest('A block has to be between 5 minutes and 12 hours long.');
  }
  if (startMinutes + duration > 24 * 60) {
    throw badRequest('That block would run past midnight. Move it earlier, or make it shorter.');
  }

  return { date, start, duration };
}

const insertEntry = (db) =>
  db.prepare(
    `INSERT INTO plan_entry
       (topic_id, scheduled_date, scheduled_start_time, scheduled_duration_minutes,
        entry_type, revision_interval, parent_entry_id, sub_topic_index)
     VALUES (@topic_id, @date, @start, @duration, @entry_type, @revision_interval, @parent_entry_id, @sub_topic_index)`
  );

/**
 * Books the 1 day / 3 day / 1 week revision blocks that follow study blocks.
 *
 * Each one goes in the first free gap on its day. If a day has no room, that
 * revision is reported rather than squeezed in on top of something else.
 */
function placeRevisions(studentId, studyEntries, settings) {
  if (!settings.revision_enabled || studyEntries.length === 0) return { created: [], skipped: [] };

  const db = getDb();
  const dates = studyEntries.map((entry) => entry.scheduled_date).sort();
  const from = dates[0];
  const to = addDays(dates[dates.length - 1], 7);
  const range = datesBetween(from, to);

  const booked = listPlanEntries(studentId, from, to);
  const busy = buildBusyMap(range, resolveEffectiveAnchors(studentId, range), booked, {
    entryPadding: settings.break_minutes,
  });
  // Revisions count towards the same daily limit as study does.
  const load = buildLoadMap(range, booked);

  const insert = insertEntry(db);
  const created = [];
  const skipped = [];

  for (const study of studyEntries) {
    const minutes = revisionMinutes(study.scheduled_duration_minutes, settings);

    for (const offset of REVISION_OFFSETS) {
      const date = addDays(study.scheduled_date, offset.days);
      const ranges = busy.get(date);

      const overBudget = (load.get(date) ?? 0) + minutes > settings.daily_max_minutes;
      const start = ranges && !overBudget ? reserveSlot(ranges, minutes, settings) : null;

      if (start === null) {
        skipped.push({
          tracking_number: study.tracking_number,
          interval: offset.interval,
          date,
          reason: overBudget ? 'that day is already full' : 'there was no free gap on that day',
        });
        continue;
      }

      load.set(date, (load.get(date) ?? 0) + minutes);

      const info = insert.run({
        topic_id: study.topic_id,
        date,
        start: toTime(start),
        duration: minutes,
        entry_type: 'revision',
        revision_interval: offset.interval,
        parent_entry_id: study.id,
        sub_topic_index: study.sub_topic_index ?? null,
      });
      created.push(Number(info.lastInsertRowid));
    }
  }

  return { created, skipped };
}

/** Adds one block by hand, with its revisions if it is a study block. */
export function createPlanEntry(studentId, input) {
  const db = getDb();
  const topicId = Number(input.topic_id);

  const topic = ownsTopic(studentId, topicId);
  if (!topic) throw notFound('That topic no longer exists.');

  const entryType = input.entry_type === 'revision' ? 'revision' : 'study';
  const slot = validateSlot(input);
  const subTopicIndex = readSubTopicIndex(topic, input.sub_topic_index);
  const settings = getPlannerSettings();

  const run = db.transaction(() => {
    const info = insertEntry(db).run({
      topic_id: topicId,
      date: slot.date,
      start: slot.start,
      duration: slot.duration,
      entry_type: entryType,
      revision_interval: entryType === 'revision' ? input.revision_interval ?? null : null,
      parent_entry_id: null,
      sub_topic_index: subTopicIndex,
    });

    const entry = getPlanEntry(studentId, Number(info.lastInsertRowid));
    const revisions = entryType === 'study' ? placeRevisions(studentId, [entry], settings) : null;
    return { entry, revisions };
  });

  return run();
}

/**
 * Nudges the topic's own status along when a block is ticked off, so the topic
 * list keeps up without anything extra to remember.
 */
function reflectCompletion(entry) {
  const db = getDb();
  if (entry.entry_type === 'study' && entry.topic_status === 'not_started') {
    db.prepare("UPDATE topic SET status = 'in_progress', updated_at = datetime('now') WHERE id = ?").run(
      entry.topic_id
    );
  }
  if (entry.entry_type === 'revision' && ['not_started', 'in_progress'].includes(entry.topic_status)) {
    db.prepare("UPDATE topic SET status = 'revised', updated_at = datetime('now') WHERE id = ?").run(
      entry.topic_id
    );
  }
}

export function updatePlanEntry(studentId, entryId, changes) {
  const db = getDb();
  const existing = getPlanEntry(studentId, entryId);

  const slot = validateSlot({
    scheduled_date: changes.scheduled_date ?? existing.scheduled_date,
    scheduled_start_time: changes.scheduled_start_time ?? existing.scheduled_start_time,
    scheduled_duration_minutes:
      changes.scheduled_duration_minutes ?? existing.scheduled_duration_minutes,
  });

  const completed =
    changes.completed === undefined ? existing.completed : Boolean(changes.completed);

  const dateMoved = slot.date !== existing.scheduled_date;

  const run = db.transaction(() => {
    db.prepare(
      `UPDATE plan_entry
         SET scheduled_date = ?, scheduled_start_time = ?, scheduled_duration_minutes = ?, completed = ?
       WHERE id = ?`
    ).run(slot.date, slot.start, slot.duration, completed ? 1 : 0, entryId);

    // Revisions are relative to their study block, so moving the study block
    // to another day moves the ones not yet done along with it.
    let rebooked = null;
    if (dateMoved && existing.entry_type === 'study') {
      db.prepare('DELETE FROM plan_entry WHERE parent_entry_id = ? AND completed = 0').run(entryId);
      rebooked = placeRevisions(studentId, [getPlanEntry(studentId, entryId)], getPlannerSettings());
    }

    const entry = getPlanEntry(studentId, entryId);
    if (completed && !existing.completed) reflectCompletion(entry);

    return { entry, revisions: rebooked };
  });

  return run();
}

export function deletePlanEntry(studentId, entryId) {
  const entry = getPlanEntry(studentId, entryId);
  // Revisions hang off the study block by foreign key, so they go too.
  getDb().prepare('DELETE FROM plan_entry WHERE id = ?').run(entryId);
  return { deleted: entry.id, tracking_number: entry.tracking_number };
}

/** Empties a stretch of the calendar. Finished blocks are kept by default. */
export function clearRange(studentId, from, to, { includeCompleted = false } = {}) {
  const entries = listPlanEntries(studentId, from, to).filter(
    (entry) => includeCompleted || !entry.completed
  );

  const db = getDb();
  const remove = db.prepare('DELETE FROM plan_entry WHERE id = ?');
  const run = db.transaction(() => entries.forEach((entry) => remove.run(entry.id)));
  run();

  return { removed: entries.length };
}

/**
 * Finds the next free gap for a topic without booking anything — used when a
 * suggestion (a weekly action plan priority, a shaky-topic revision) needs to
 * show where it would go before the student decides whether they want it.
 */
export function suggestStudySlot(studentId, topicId, { minutes, from, days = 7 } = {}) {
  const db = getDb();
  const topic = db
    .prepare(
      `SELECT t.id, t.tracking_number, t.title, t.allocated_duration_minutes
       FROM topic t JOIN subject s ON s.id = t.subject_id
       WHERE t.id = ? AND s.student_id = ?`
    )
    .get(topicId, studentId);
  if (!topic) throw notFound('That topic no longer exists.');

  const duration = Number(minutes) > 0 ? Number(minutes) : topic.allocated_duration_minutes;
  const settings = getPlannerSettings();

  const startDate = from && isIsoDate(from) ? from : todayIso();
  const range = datesBetween(startDate, addDays(startDate, days - 1));

  const busy = buildBusyMap(
    range,
    resolveEffectiveAnchors(studentId, range),
    listPlanEntries(studentId, range[0], range[range.length - 1]),
    { entryPadding: settings.break_minutes }
  );

  for (const date of range) {
    const start = reserveSlot(busy.get(date), duration, settings);
    if (start !== null) {
      return {
        topic_id: topic.id,
        tracking_number: topic.tracking_number,
        title: topic.title,
        scheduled_date: date,
        scheduled_start_time: toTime(start),
        scheduled_duration_minutes: duration,
      };
    }
  }

  return null;
}

/** Topics waiting for a place on the calendar, in the order they should get one. */
export function listUnscheduledTopics(studentId) {
  return getDb()
    .prepare(
      `SELECT t.id, t.tracking_number, t.title, t.sub_topics, t.allocated_duration_minutes, t.difficulty,
              t.target_date, t.status,
              s.name AS subject_name, s.colour AS subject_colour, s.code AS subject_code
       FROM topic t
       JOIN subject s ON s.id = t.subject_id
       WHERE s.student_id = ?
         AND t.status != 'mastered'
         AND NOT EXISTS (
           SELECT 1 FROM plan_entry p
           WHERE p.topic_id = t.id AND p.entry_type = 'study' AND p.completed = 0
         )
       ORDER BY (t.target_date IS NULL), t.target_date, s.display_order, t.display_order, t.id`
    )
    .all(studentId)
    .map((topic) => ({ ...topic, sub_topics: JSON.parse(topic.sub_topics ?? '[]') }));
}

/**
 * Fills the free time between `from` and `to` with the topics that need it
 * most, then books their revisions. Days that have already gone by are left
 * alone, as are the hours earlier today.
 */
export function autoPlan(studentId, from, to) {
  if (!isIsoDate(from) || !isIsoDate(to)) throw badRequest('Dates should look like 2026-09-14.');
  if (to < from) throw badRequest('The end of the stretch comes before the start of it.');

  const today = todayIso();
  const dates = datesBetween(from, to).filter((date) => date >= today);

  if (dates.length === 0) {
    return {
      placed: 0,
      revisions: 0,
      entries: [],
      skipped: [],
      message: 'That week has already been and gone, so there is nothing left to plan in it.',
    };
  }

  const settings = getPlannerSettings();
  const topics = listUnscheduledTopics(studentId);

  if (topics.length === 0) {
    return {
      placed: 0,
      revisions: 0,
      entries: [],
      skipped: [],
      message: 'Every topic already has a place on the calendar. Nothing more to do.',
    };
  }

  const now = new Date();
  const { placements, skipped } = planTopics({
    dates,
    anchors: resolveEffectiveAnchors(studentId, dates),
    existingEntries: listPlanEntries(studentId, dates[0], dates[dates.length - 1]),
    topics,
    settings,
    notBefore: { date: today, minutes: now.getHours() * 60 + now.getMinutes() },
  });

  const db = getDb();

  const run = db.transaction(() => {
    const insert = insertEntry(db);
    const created = placements.map((placement) => {
      const info = insert.run({
        topic_id: placement.topic.id,
        date: placement.date,
        start: toTime(placement.startMinutes),
        duration: placement.minutes,
        entry_type: 'study',
        revision_interval: null,
        parent_entry_id: null,
        sub_topic_index: null,
      });
      return getPlanEntry(studentId, Number(info.lastInsertRowid));
    });

    const revisions = placeRevisions(studentId, created, settings);
    return { created, revisions };
  });

  const { created, revisions } = run();

  return {
    placed: created.length,
    revisions: revisions.created.length,
    entries: created,
    skipped: skipped.map(({ topic, reason }) => ({
      tracking_number: topic.tracking_number,
      title: topic.title,
      reason,
    })),
    revisionsSkipped: revisions.skipped.length,
  };
}
