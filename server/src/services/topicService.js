import { getDb } from '../db/index.js';
import { badRequest, notFound } from '../lib/httpError.js';
import { getSubject } from './subjectService.js';
import { allocateTrackingNumbers } from './trackingNumber.js';

export const TOPIC_STATUSES = ['not_started', 'in_progress', 'revised', 'mastered'];

const parseJsonColumn = (value, fallback) => {
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

/** Turns a database row into the shape the frontend works with. */
export function toTopic(row) {
  if (!row) return row;
  return {
    ...row,
    sub_topics: parseJsonColumn(row.sub_topics, []),
    resources: parseJsonColumn(row.resources, []),
  };
}

const PLAN_ENTRY_TYPES = ['study', 'practice', 'revision'];

const blankPlanSummary = () => ({
  study: { total: 0, completed: 0 },
  practice: { total: 0, completed: 0 },
  revision: { total: 0, completed: 0 },
});

/**
 * How much of each topic's plan has actually happened, broken down by kind —
 * study (first pass), practice, and revision — so a subject or a topic can
 * be checked against the three-layer split rather than just a single
 * not-started/in-progress/revised/mastered status.
 */
export function getPlanSummaries(studentId, topicIds) {
  const summaries = {};
  for (const id of topicIds) summaries[id] = blankPlanSummary();
  if (topicIds.length === 0) return summaries;

  const placeholders = topicIds.map(() => '?').join(',');
  const rows = getDb()
    .prepare(
      `SELECT p.topic_id, p.entry_type, p.completed, COUNT(*) AS count
       FROM plan_entry p
       JOIN topic t ON t.id = p.topic_id
       JOIN subject s ON s.id = t.subject_id
       WHERE s.student_id = ? AND p.topic_id IN (${placeholders})
       GROUP BY p.topic_id, p.entry_type, p.completed`
    )
    .all(studentId, ...topicIds);

  for (const row of rows) {
    if (!PLAN_ENTRY_TYPES.includes(row.entry_type)) continue;
    const bucket = summaries[row.topic_id][row.entry_type];
    bucket.total += row.count;
    if (row.completed) bucket.completed += row.count;
  }

  return summaries;
}

export function listTopics(studentId, { subjectId, status, difficulty, search } = {}) {
  const db = getDb();

  const where = ['s.student_id = @studentId'];
  const params = { studentId };

  if (subjectId) {
    where.push('t.subject_id = @subjectId');
    params.subjectId = subjectId;
  }
  if (status) {
    where.push('t.status = @status');
    params.status = status;
  }
  if (difficulty) {
    where.push('t.difficulty = @difficulty');
    params.difficulty = difficulty;
  }
  if (search) {
    // Sub-topics are searched too, since they hold most of the detail.
    where.push(
      `(t.title LIKE @search
        OR t.tracking_number LIKE @search
        OR t.sub_topics LIKE @search
        OR COALESCE(t.unit, '') LIKE @search)`
    );
    params.search = `%${search}%`;
  }

  const topics = db
    .prepare(
      `SELECT t.*, s.name AS subject_name, s.colour AS subject_colour, s.code AS subject_code
       FROM topic t
       JOIN subject s ON s.id = t.subject_id
       WHERE ${where.join(' AND ')}
       ORDER BY s.display_order, t.display_order, t.id`
    )
    .all(params)
    .map(toTopic);

  const summaries = getPlanSummaries(studentId, topics.map((topic) => topic.id));
  return topics.map((topic) => ({ ...topic, plan_summary: summaries[topic.id] }));
}

export function getTopic(studentId, topicId) {
  const row = getDb()
    .prepare(
      `SELECT t.*, s.name AS subject_name, s.colour AS subject_colour, s.code AS subject_code
       FROM topic t JOIN subject s ON s.id = t.subject_id
       WHERE t.id = ? AND s.student_id = ?`
    )
    .get(topicId, studentId);
  if (!row) throw notFound('That topic no longer exists.');
  return toTopic(row);
}

/**
 * Inserts one or more topics into a subject in a single transaction, giving
 * each a fresh tracking number and appending them after any existing topics.
 */
export function createTopics(studentId, subjectId, drafts) {
  const db = getDb();
  const subject = getSubject(studentId, subjectId);

  if (!drafts.length) throw badRequest('There are no topics to save.');

  const startOrder =
    db
      .prepare('SELECT COALESCE(MAX(display_order), -1) + 1 AS next FROM topic WHERE subject_id = ?')
      .get(subjectId).next ?? 0;

  const insert = db.prepare(
    `INSERT INTO topic (
       subject_id, tracking_number, title, unit, sub_topics,
       allocated_duration_minutes, estimated_hours, difficulty, status,
       target_date, display_order, notes
     ) VALUES (
       @subject_id, @tracking_number, @title, @unit, @sub_topics,
       @allocated_duration_minutes, @estimated_hours, @difficulty, @status,
       @target_date, @display_order, @notes
     )`
  );

  const insertAll = db.transaction(() => {
    const numbers = allocateTrackingNumbers(subject.id, subject.code, drafts.length);
    const ids = [];
    drafts.forEach((draft, index) => {
      const minutes = draft.allocated_duration_minutes ?? 60;
      const info = insert.run({
        subject_id: subjectId,
        tracking_number: numbers[index],
        title: draft.title,
        unit: draft.unit ?? null,
        sub_topics: JSON.stringify(draft.sub_topics ?? []),
        allocated_duration_minutes: minutes,
        estimated_hours: draft.estimated_hours ?? Number((minutes / 60).toFixed(2)),
        difficulty: draft.difficulty ?? 3,
        status: draft.status ?? 'not_started',
        target_date: draft.target_date ?? null,
        display_order: startOrder + index,
        notes: draft.notes ?? null,
      });
      ids.push(info.lastInsertRowid);
    });
    return ids;
  });

  const ids = insertAll();
  return ids.map((id) => getTopic(studentId, id));
}

const UPDATABLE = [
  'title',
  'unit',
  'sub_topics',
  'key_concepts',
  'allocated_duration_minutes',
  'estimated_hours',
  'difficulty',
  'status',
  'target_date',
  'notes',
  'resources',
];

export function updateTopic(studentId, topicId, changes) {
  const db = getDb();
  getTopic(studentId, topicId); // ownership check

  const sets = [];
  const params = { id: topicId };

  for (const field of UPDATABLE) {
    if (changes[field] === undefined) continue;
    const value = changes[field];
    sets.push(`${field} = @${field}`);
    params[field] = Array.isArray(value) ? JSON.stringify(value) : value;
  }

  // Keep estimated_hours in step with the duration unless it was set by hand.
  if (changes.allocated_duration_minutes !== undefined && changes.estimated_hours === undefined) {
    sets.push('estimated_hours = @derived_hours');
    params.derived_hours = Number((changes.allocated_duration_minutes / 60).toFixed(2));
  }

  if (!sets.length) return getTopic(studentId, topicId);

  sets.push("updated_at = datetime('now')");
  db.prepare(`UPDATE topic SET ${sets.join(', ')} WHERE id = @id`).run(params);

  return getTopic(studentId, topicId);
}

export function deleteTopic(studentId, topicId) {
  const topic = getTopic(studentId, topicId);
  getDb().prepare('DELETE FROM topic WHERE id = ?').run(topicId);
  return { deleted: topic.id, tracking_number: topic.tracking_number };
}

export function reorderTopics(studentId, subjectId, orderedIds) {
  const db = getDb();
  getSubject(studentId, subjectId);

  const owned = new Set(
    db.prepare('SELECT id FROM topic WHERE subject_id = ?').all(subjectId).map((r) => r.id)
  );
  const unknown = orderedIds.filter((id) => !owned.has(id));
  if (unknown.length) throw notFound(`Unknown topic id: ${unknown[0]}.`);

  const update = db.prepare('UPDATE topic SET display_order = ? WHERE id = ? AND subject_id = ?');
  const apply = db.transaction(() => {
    orderedIds.forEach((id, index) => update.run(index, id, subjectId));
  });
  apply();

  return listTopics(studentId, { subjectId });
}

/** Sets the same allocated duration across many topics at once. */
export function bulkUpdateTopics(studentId, topicIds, changes) {
  const db = getDb();
  const owned = new Set(
    db
      .prepare(
        `SELECT t.id FROM topic t JOIN subject s ON s.id = t.subject_id WHERE s.student_id = ?`
      )
      .all(studentId)
      .map((r) => r.id)
  );
  const unknown = topicIds.filter((id) => !owned.has(id));
  if (unknown.length) throw notFound(`Unknown topic id: ${unknown[0]}.`);

  const apply = db.transaction(() => {
    topicIds.forEach((id) => updateTopic(studentId, id, changes));
  });
  apply();

  return topicIds.map((id) => getTopic(studentId, id));
}
