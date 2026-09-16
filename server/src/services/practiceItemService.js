/**
 * The master list: every chapter's five-stage practice cycle (NCERT solved
 * examples, NCERT exercises, an external module, previous-year questions,
 * timed sets), broken into independently trackable rows rather than a
 * single "current stage" pointer. This is the backlog everything else —
 * the LLM-scheduling prompt, progress tracking, the gap report — reads
 * from.
 */
import { getDb } from '../db/index.js';
import { badRequest, notFound } from '../lib/httpError.js';

export const STAGES = [
  { stage: 1, label: 'NCERT solved examples', default_minutes: 90 },
  { stage: 2, label: 'NCERT exercises', default_minutes: 75 },
  { stage: 3, label: 'Module (Aakash etc.)', default_minutes: 105 },
  { stage: 4, label: 'Previous-year questions', default_minutes: 60 },
  { stage: 5, label: 'Timed set', default_minutes: 30 },
];

const ITEM_SELECT = `
  SELECT pi.*, t.tracking_number, t.title AS topic_title, t.status AS topic_status, t.target_date,
         s.id AS subject_id, s.name AS subject_name, s.colour AS subject_colour, s.code AS subject_code
  FROM practice_item pi
  JOIN topic t   ON t.id = pi.topic_id
  JOIN subject s ON s.id = t.subject_id
`;

/** Creates the five stage rows for a topic that doesn't have them yet. Safe to call repeatedly. */
export function ensureMasterList(topicId) {
  const db = getDb();
  const existing = new Set(
    db.prepare('SELECT stage FROM practice_item WHERE topic_id = ?').all(topicId).map((r) => r.stage)
  );
  const missing = STAGES.filter((s) => !existing.has(s.stage));
  if (missing.length === 0) return;

  const insert = db.prepare(
    `INSERT INTO practice_item (topic_id, stage, label, estimated_minutes) VALUES (?, ?, ?, ?)`
  );
  const run = db.transaction(() => {
    for (const s of missing) insert.run(topicId, s.stage, s.label, s.default_minutes);
  });
  run();
}

/** Backfills the master list for every topic that doesn't have one yet — safe to call on every boot. */
export function backfillMasterLists() {
  const topicIds = getDb().prepare('SELECT id FROM topic').all().map((row) => row.id);
  for (const id of topicIds) ensureMasterList(id);
}

/** Generates the master list for every topic in a subject that's missing rows. */
export function generateMasterListForSubject(studentId, subjectId) {
  const topics = getDb()
    .prepare(`SELECT t.id FROM topic t JOIN subject s ON s.id = t.subject_id WHERE t.subject_id = ? AND s.student_id = ?`)
    .all(subjectId, studentId);
  for (const topic of topics) ensureMasterList(topic.id);
  return listMasterList(studentId, { subjectId });
}

export function listMasterList(studentId, { subjectId, topicId, status } = {}) {
  const where = ['s.student_id = @studentId'];
  const params = { studentId };
  if (subjectId) {
    where.push('s.id = @subjectId');
    params.subjectId = subjectId;
  }
  if (topicId) {
    where.push('t.id = @topicId');
    params.topicId = topicId;
  }
  if (status) {
    where.push('pi.status = @status');
    params.status = status;
  }

  return getDb()
    .prepare(
      `${ITEM_SELECT} WHERE ${where.join(' AND ')}
       ORDER BY (t.target_date IS NULL), t.target_date, s.display_order, t.display_order, pi.stage`
    )
    .all(params)
    .map((row) => ({ ...row, minutes_logged: row.minutes_logged ?? 0 }));
}

function getItem(studentId, itemId) {
  const row = getDb().prepare(`${ITEM_SELECT} WHERE pi.id = ? AND s.student_id = ?`).get(itemId, studentId);
  if (!row) throw notFound('That master-list item no longer exists.');
  return row;
}

const STATUSES = ['pending', 'scheduled', 'done'];

export function updatePracticeItem(studentId, itemId, changes) {
  const existing = getItem(studentId, itemId);
  const db = getDb();

  const estimatedMinutes =
    changes.estimated_minutes !== undefined ? Number(changes.estimated_minutes) : existing.estimated_minutes;
  if (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 5 || estimatedMinutes > 600) {
    throw badRequest('"estimated_minutes" must be a whole number between 5 and 600.');
  }

  const status = changes.status !== undefined ? changes.status : existing.status;
  if (!STATUSES.includes(status)) throw badRequest(`"status" must be one of: ${STATUSES.join(', ')}.`);

  const minutesLogged =
    changes.minutes_logged !== undefined ? Number(changes.minutes_logged) : existing.minutes_logged;
  if (!Number.isInteger(minutesLogged) || minutesLogged < 0) {
    throw badRequest('"minutes_logged" must be a non-negative whole number.');
  }

  const completedAt =
    status === 'done' ? existing.completed_at ?? new Date().toISOString().slice(0, 10) : status === 'pending' || status === 'scheduled' ? null : existing.completed_at;

  db.prepare(
    `UPDATE practice_item SET estimated_minutes = ?, status = ?, minutes_logged = ?, completed_at = ? WHERE id = ? AND EXISTS (
       SELECT 1 FROM topic t JOIN subject s ON s.id = t.subject_id WHERE t.id = practice_item.topic_id AND s.student_id = ?
     )`
  ).run(estimatedMinutes, status, minutesLogged, completedAt, itemId, studentId);

  return getItem(studentId, itemId);
}

/**
 * Marking a topic "already covered" (Revised/Confident, whether via the
 * bulk action or the daily "covered in class today" habit) means its
 * first pass has happened, whether or not it went through this app's own
 * calendar — so Stage 1 of its master list is done too, and scheduling
 * moves straight to the later stages instead of proposing it as new.
 * Safe to call repeatedly; does nothing if already done.
 */
export function markFirstStageDone(topicId) {
  const stageOne = getDb().prepare('SELECT id, status FROM practice_item WHERE topic_id = ? AND stage = 1').get(topicId);
  if (!stageOne || stageOne.status === 'done') return;
  getDb()
    .prepare("UPDATE practice_item SET status = 'done', minutes_logged = estimated_minutes, completed_at = ? WHERE id = ?")
    .run(new Date().toISOString().slice(0, 10), stageOne.id);
}

/** Marks an item done (or reopens it) directly, without going through the calendar. */
export function markPracticeItem(studentId, itemId, done) {
  return updatePracticeItem(studentId, itemId, {
    status: done ? 'done' : 'pending',
    minutes_logged: done ? getItem(studentId, itemId).estimated_minutes : 0,
  });
}

/** Pending items still waiting for a slot — what the scheduling prompt draws from. */
export function listPendingItems(studentId, { subjectId } = {}) {
  return listMasterList(studentId, { subjectId, status: 'pending' });
}

/** Total pending minutes per subject — the backlog size a snapshot freezes. */
export function pendingMinutesBySubject(studentId) {
  const rows = getDb()
    .prepare(
      `SELECT s.id AS subject_id, SUM(pi.estimated_minutes) AS minutes
       FROM practice_item pi
       JOIN topic t ON t.id = pi.topic_id
       JOIN subject s ON s.id = t.subject_id
       WHERE s.student_id = ? AND pi.status != 'done'
       GROUP BY s.id`
    )
    .all(studentId);

  const totals = {};
  for (const row of rows) totals[row.subject_id] = row.minutes;
  return totals;
}
