import { getDb } from '../db/index.js';
import { badRequest, notFound } from '../lib/httpError.js';
import { addDays, isIsoDate, toTime, todayIso } from '../lib/time.js';
import { listPlanEntries } from './planService.js';
import { buildBusyMap, reserveSlot, revisionMinutes } from './scheduler.js';
import { getPlannerSettings } from './settingsService.js';
import { resolveEffectiveAnchors } from './templateService.js';

/** Below this, the app offers another look at the topic. */
export const SHAKY_CONFIDENCE = 2;

const SESSION_SELECT = `
  SELECT
    ss.*,
    t.tracking_number, t.title AS topic_title, t.status AS topic_status,
    s.id AS subject_id, s.name AS subject_name, s.colour AS subject_colour
  FROM study_session ss
  JOIN topic t   ON t.id = ss.topic_id
  JOIN subject s ON s.id = t.subject_id
`;

export function listSessions(studentId, { limit = 50, offset = 0, topicId, from, to } = {}) {
  const where = ['s.student_id = @studentId'];
  const params = { studentId, limit: Math.min(Number(limit) || 50, 200), offset: Number(offset) || 0 };

  if (topicId) {
    where.push('ss.topic_id = @topicId');
    params.topicId = Number(topicId);
  }
  if (from && to) {
    where.push('ss.date BETWEEN @from AND @to');
    params.from = from;
    params.to = to;
  }

  const db = getDb();
  const sessions = db
    .prepare(
      `${SESSION_SELECT} WHERE ${where.join(' AND ')}
       ORDER BY ss.date DESC, ss.id DESC
       LIMIT @limit OFFSET @offset`
    )
    .all(params);

  const { total } = db
    .prepare(
      `SELECT COUNT(*) AS total FROM study_session ss
       JOIN topic t ON t.id = ss.topic_id
       JOIN subject s ON s.id = t.subject_id
       WHERE ${where.join(' AND ')}`
    )
    .get(params);

  return { sessions, total };
}

function getSession(studentId, sessionId) {
  const session = getDb()
    .prepare(`${SESSION_SELECT} WHERE ss.id = ? AND s.student_id = ?`)
    .get(sessionId, studentId);
  if (!session) throw notFound('That session is no longer there.');
  return session;
}

const ownsTopic = (studentId, topicId) =>
  getDb()
    .prepare(
      `SELECT t.id FROM topic t JOIN subject s ON s.id = t.subject_id
       WHERE t.id = ? AND s.student_id = ?`
    )
    .get(topicId, studentId);

function validate(input) {
  const date = input.date ?? todayIso();
  if (!isIsoDate(date)) throw badRequest('The date should look like 2026-09-14.');
  if (date > addDays(todayIso(), 1)) throw badRequest('That date is in the future.');

  const minutes = Number(input.minutes_spent);
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 12 * 60) {
    throw badRequest('Minutes spent has to be a whole number between 0 and 720.');
  }

  let confidence = input.confidence_score;
  if (confidence === '' || confidence === undefined) confidence = null;
  if (confidence !== null) {
    confidence = Number(confidence);
    if (!Number.isInteger(confidence) || confidence < 1 || confidence > 5) {
      throw badRequest('Confidence has to be a whole number from 1 to 5.');
    }
  }

  const notes = typeof input.notes === 'string' ? input.notes.trim().slice(0, 5000) || null : null;

  return { date, minutes, confidence, notes };
}

/**
 * How a topic's status should read after a session.
 *
 * It only ever moves forwards, and never past 'revised' on its own — calling
 * something mastered is the student's judgement, not the app's.
 */
function advanceStatus(topic, entryType) {
  const order = ['not_started', 'in_progress', 'revised', 'mastered'];
  const target = entryType === 'revision' ? 'revised' : 'in_progress';
  return order.indexOf(topic.status) < order.indexOf(target) ? target : topic.status;
}

/**
 * Suggests where another look at a shaky topic could go, without booking it.
 * Returns null when confidence was fine or the next few days have no room.
 */
export function suggestExtraRevision(studentId, topicId, confidence) {
  if (confidence === null || confidence > SHAKY_CONFIDENCE) return null;

  const db = getDb();
  const topic = db
    .prepare('SELECT id, tracking_number, title, allocated_duration_minutes FROM topic WHERE id = ?')
    .get(topicId);
  if (!topic) return null;

  const settings = getPlannerSettings();
  const minutes = revisionMinutes(topic.allocated_duration_minutes, settings);

  const from = addDays(todayIso(), 1);
  const to = addDays(from, 4);
  const dates = [];
  for (let cursor = from; cursor <= to; cursor = addDays(cursor, 1)) dates.push(cursor);

  const busy = buildBusyMap(dates, resolveEffectiveAnchors(studentId, dates), listPlanEntries(studentId, from, to), {
    entryPadding: settings.break_minutes,
  });

  for (const date of dates) {
    const start = reserveSlot(busy.get(date), minutes, settings);
    if (start !== null) {
      return {
        topic_id: topic.id,
        tracking_number: topic.tracking_number,
        title: topic.title,
        scheduled_date: date,
        scheduled_start_time: toTime(start),
        scheduled_duration_minutes: minutes,
      };
    }
  }

  return null;
}

/**
 * Records a study session. When it came from ticking a block off, the block is
 * marked done at the same time and the topic's status keeps up.
 */
export function createSession(studentId, input) {
  const db = getDb();
  const topicId = Number(input.topic_id);

  const topic = db
    .prepare(
      `SELECT t.* FROM topic t JOIN subject s ON s.id = t.subject_id
       WHERE t.id = ? AND s.student_id = ?`
    )
    .get(topicId, studentId);
  if (!topic) throw notFound('That topic no longer exists.');

  const { date, minutes, confidence, notes } = validate(input);

  let planEntry = null;
  if (input.plan_entry_id) {
    planEntry = db
      .prepare(
        `SELECT p.* FROM plan_entry p
         JOIN topic t ON t.id = p.topic_id
         JOIN subject s ON s.id = t.subject_id
         WHERE p.id = ? AND s.student_id = ?`
      )
      .get(Number(input.plan_entry_id), studentId);
    if (!planEntry) throw notFound('That block is no longer on the calendar.');
  }

  const run = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO study_session (topic_id, plan_entry_id, date, minutes_spent, confidence_score, notes)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(topicId, planEntry?.id ?? null, date, minutes, confidence, notes);

    if (planEntry) {
      db.prepare('UPDATE plan_entry SET completed = 1 WHERE id = ?').run(planEntry.id);
    }

    const nextStatus = advanceStatus(topic, planEntry?.entry_type ?? 'study');
    if (nextStatus !== topic.status) {
      db.prepare("UPDATE topic SET status = ?, updated_at = datetime('now') WHERE id = ?").run(
        nextStatus,
        topicId
      );
    }

    return Number(info.lastInsertRowid);
  });

  const id = run();

  return {
    session: getSession(studentId, id),
    suggestion: suggestExtraRevision(studentId, topicId, confidence),
  };
}

export function updateSession(studentId, sessionId, input) {
  const existing = getSession(studentId, sessionId);
  const { date, minutes, confidence, notes } = validate({ ...existing, ...input });

  getDb()
    .prepare(
      'UPDATE study_session SET date = ?, minutes_spent = ?, confidence_score = ?, notes = ? WHERE id = ?'
    )
    .run(date, minutes, confidence, notes, sessionId);

  return { session: getSession(studentId, sessionId) };
}

/** Removing a session un-ticks the block it came from. */
export function deleteSession(studentId, sessionId) {
  const db = getDb();
  const session = getSession(studentId, sessionId);

  const run = db.transaction(() => {
    if (session.plan_entry_id) {
      db.prepare('UPDATE plan_entry SET completed = 0 WHERE id = ?').run(session.plan_entry_id);
    }
    db.prepare('DELETE FROM study_session WHERE id = ?').run(sessionId);
  });
  run();

  return { deleted: session.id, plan_entry_id: session.plan_entry_id };
}

/** The session a calendar block produced, if it has one. */
export function sessionForPlanEntry(studentId, planEntryId) {
  return (
    getDb()
      .prepare(`${SESSION_SELECT} WHERE ss.plan_entry_id = ? AND s.student_id = ?`)
      .get(planEntryId, studentId) ?? null
  );
}

export { ownsTopic };
