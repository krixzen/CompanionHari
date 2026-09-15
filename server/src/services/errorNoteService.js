/**
 * The error notebook: one row per question that went wrong, tagged with
 * why (Concept gap, Application gap, Silly slip, or Time), so that after a
 * month the tag distribution says exactly what to work on rather than
 * leaving that to a guess. Every entry gets a re-do date — a wrong
 * question is not "done" until it has been re-attempted from scratch,
 * without looking at the correction.
 */
import { getDb } from '../db/index.js';
import { badRequest, notFound } from '../lib/httpError.js';
import { addDays, isIsoDate, todayIso } from '../lib/time.js';

export const ERROR_TAGS = ['C', 'A', 'S', 'T'];
const DEFAULT_REDO_DAYS = 14;

const ERROR_NOTE_SELECT = `
  SELECT e.*, s.name AS subject_name, s.colour AS subject_colour, s.code AS subject_code,
         t.tracking_number, t.title AS topic_title
  FROM error_note e
  JOIN subject s ON s.id = e.subject_id
  LEFT JOIN topic t ON t.id = e.topic_id
`;

const toNote = (row) => (row ? { ...row, redone: Boolean(row.redone) } : row);

function ownsSubject(studentId, subjectId) {
  const row = getDb().prepare('SELECT id FROM subject WHERE id = ? AND student_id = ?').get(subjectId, studentId);
  if (!row) throw notFound('That subject no longer exists.');
}

/** Validates a topic belongs to this student, or passes null through untouched. */
function ownsTopic(studentId, topicId) {
  if (topicId === null || topicId === undefined) return null;
  const row = getDb()
    .prepare(`SELECT t.id FROM topic t JOIN subject s ON s.id = t.subject_id WHERE t.id = ? AND s.student_id = ?`)
    .get(topicId, studentId);
  if (!row) throw notFound('That topic no longer exists.');
  return topicId;
}

function getNote(studentId, noteId) {
  const row = getDb().prepare(`${ERROR_NOTE_SELECT} WHERE e.id = ? AND e.student_id = ?`).get(noteId, studentId);
  if (!row) throw notFound('That error-notebook entry no longer exists.');
  return toNote(row);
}

export function listErrorNotes(studentId, { subjectId, tag, dueOnly } = {}) {
  const where = ['e.student_id = @studentId'];
  const params = { studentId };

  if (subjectId) {
    where.push('e.subject_id = @subjectId');
    params.subjectId = subjectId;
  }
  if (tag) {
    where.push('e.tag = @tag');
    params.tag = tag;
  }
  if (dueOnly) {
    where.push('e.redone = 0 AND e.redo_date <= @today');
    params.today = todayIso();
  }

  return getDb()
    .prepare(`${ERROR_NOTE_SELECT} WHERE ${where.join(' AND ')} ORDER BY e.redone, e.redo_date, e.id DESC`)
    .all(params)
    .map(toNote);
}

function readSource(value) {
  const source = String(value ?? '').trim();
  if (!source) throw badRequest('Say where the question came from — a chapter, a module set, anything that helps you find it again.');
  return source.slice(0, 300);
}

function readTag(value) {
  if (!ERROR_TAGS.includes(value)) throw badRequest(`"tag" must be one of: ${ERROR_TAGS.join(', ')}.`);
  return value;
}

export function createErrorNote(studentId, input) {
  const subjectId = Number(input.subject_id);
  ownsSubject(studentId, subjectId);
  const topicId = input.topic_id != null ? ownsTopic(studentId, Number(input.topic_id)) : null;

  const source = readSource(input.source);
  const tag = readTag(input.tag);
  const redoDate = input.redo_date && isIsoDate(input.redo_date) ? input.redo_date : addDays(todayIso(), DEFAULT_REDO_DAYS);

  const info = getDb()
    .prepare(
      `INSERT INTO error_note (student_id, subject_id, topic_id, source, tag, mistake, correct_idea, redo_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      studentId,
      subjectId,
      topicId,
      source,
      tag,
      input.mistake ? String(input.mistake).trim().slice(0, 2000) : null,
      input.correct_idea ? String(input.correct_idea).trim().slice(0, 2000) : null,
      redoDate
    );

  return getNote(studentId, info.lastInsertRowid);
}

export function updateErrorNote(studentId, noteId, changes) {
  const existing = getNote(studentId, noteId);

  const subjectId = changes.subject_id !== undefined ? Number(changes.subject_id) : existing.subject_id;
  if (changes.subject_id !== undefined) ownsSubject(studentId, subjectId);

  const topicId =
    changes.topic_id !== undefined
      ? changes.topic_id === null
        ? null
        : ownsTopic(studentId, Number(changes.topic_id))
      : existing.topic_id;

  const source = changes.source !== undefined ? readSource(changes.source) : existing.source;
  const tag = changes.tag !== undefined ? readTag(changes.tag) : existing.tag;

  const redoDate = changes.redo_date !== undefined ? changes.redo_date : existing.redo_date;
  if (!isIsoDate(redoDate)) throw badRequest('The re-do date should look like 2026-09-29.');

  const redone = changes.redone !== undefined ? Boolean(changes.redone) : existing.redone;
  // Ticking it off stamps today as when it was actually re-attempted;
  // unticking clears that stamp rather than leaving a stale date behind.
  const redoneAt = redone ? existing.redone_at ?? todayIso() : null;

  getDb()
    .prepare(
      `UPDATE error_note
         SET subject_id = ?, topic_id = ?, source = ?, tag = ?, mistake = ?, correct_idea = ?,
             redo_date = ?, redone = ?, redone_at = ?
       WHERE id = ? AND student_id = ?`
    )
    .run(
      subjectId,
      topicId,
      source,
      tag,
      changes.mistake !== undefined ? (changes.mistake ? String(changes.mistake).trim().slice(0, 2000) : null) : existing.mistake,
      changes.correct_idea !== undefined
        ? changes.correct_idea
          ? String(changes.correct_idea).trim().slice(0, 2000)
          : null
        : existing.correct_idea,
      redoDate,
      redone ? 1 : 0,
      redoneAt,
      noteId,
      studentId
    );

  return getNote(studentId, noteId);
}

export function deleteErrorNote(studentId, noteId) {
  getNote(studentId, noteId);
  getDb().prepare('DELETE FROM error_note WHERE id = ? AND student_id = ?').run(noteId, studentId);
  return { deleted: noteId };
}

/** After a month, count the tags — the distribution says what to fix, and it's almost never what's assumed. */
export function tagBreakdown(studentId, { from, to } = {}) {
  const where = ['student_id = @studentId'];
  const params = { studentId };
  if (from) {
    where.push('created_at >= @from');
    params.from = from;
  }
  if (to) {
    where.push('created_at <= @to');
    params.to = `${to} 23:59:59`;
  }

  const rows = getDb()
    .prepare(`SELECT tag, COUNT(*) AS count FROM error_note WHERE ${where.join(' AND ')} GROUP BY tag`)
    .all(params);

  const counts = { C: 0, A: 0, S: 0, T: 0 };
  for (const row of rows) counts[row.tag] = row.count;
  return counts;
}
