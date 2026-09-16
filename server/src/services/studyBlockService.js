/**
 * Study blocks: the weekly windows a student has actually agreed are for
 * studying, once school, coaching, meals and travel time are accounted
 * for. Unlike week templates, there is only ever one set — no per-week
 * scoping — since the point is a shape the student can live the same way
 * every week, not a calendar of exceptions.
 *
 * The layout itself comes from an LLM prompt (see lib/prompts.js on the
 * client — it's given the fixed commitments and the hours the student
 * says they actually have free, and designs blocks, breaks and leisure
 * time around them) rather than a mechanical free-gap scan, so there is
 * no server-side "propose" step here — only plain CRUD on the saved set.
 */
import { badRequest, notFound } from '../lib/httpError.js';
import { getDb } from '../db/index.js';
import { toMinutes } from '../lib/time.js';

export function listStudyBlocks(studentId) {
  return getDb()
    .prepare('SELECT * FROM study_block WHERE student_id = ? ORDER BY day_of_week, start_time')
    .all(studentId)
    .map((row) => ({ ...row, is_active: Boolean(row.is_active) }));
}

function validateBlock({ day_of_week: day, start_time: start, end_time: end }) {
  const parsedDay = Number(day);
  if (!Number.isInteger(parsedDay) || parsedDay < 0 || parsedDay > 6) {
    throw badRequest('Pick a day of the week.');
  }
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  if (startMinutes === null) throw badRequest('The start time should look like 15:30.');
  if (endMinutes === null) throw badRequest('The end time should look like 18:00.');
  if (endMinutes <= startMinutes) throw badRequest('The end time has to be after the start time.');

  return { day_of_week: parsedDay, start_time: start, end_time: end };
}

/** Replaces the student's whole set of study windows in one go — the save behind the review screen. */
export function saveStudyBlocks(studentId, blocks) {
  if (!Array.isArray(blocks)) throw badRequest('Expected a list of study blocks.');
  const cleaned = blocks.map(validateBlock);

  const db = getDb();
  const del = db.prepare('DELETE FROM study_block WHERE student_id = ?');
  const insert = db.prepare(
    `INSERT INTO study_block (student_id, day_of_week, start_time, end_time, is_active) VALUES (?, ?, ?, ?, 1)`
  );

  db.transaction(() => {
    del.run(studentId);
    cleaned.forEach((block) => insert.run(studentId, block.day_of_week, block.start_time, block.end_time));
  })();

  return listStudyBlocks(studentId);
}

export function addStudyBlock(studentId, input) {
  const block = validateBlock(input);
  const info = getDb()
    .prepare(
      `INSERT INTO study_block (student_id, day_of_week, start_time, end_time, is_active) VALUES (?, ?, ?, ?, 1)`
    )
    .run(studentId, block.day_of_week, block.start_time, block.end_time);
  return getDb().prepare('SELECT * FROM study_block WHERE id = ?').get(info.lastInsertRowid);
}

function getBlock(studentId, blockId) {
  const block = getDb().prepare('SELECT * FROM study_block WHERE id = ? AND student_id = ?').get(blockId, studentId);
  if (!block) throw notFound('That study time no longer exists.');
  return { ...block, is_active: Boolean(block.is_active) };
}

export function updateStudyBlock(studentId, blockId, changes) {
  const existing = getBlock(studentId, blockId);
  const merged = validateBlock({ ...existing, ...changes });
  const isActive = changes.is_active === undefined ? existing.is_active : Boolean(changes.is_active);

  getDb()
    .prepare(
      `UPDATE study_block SET day_of_week = ?, start_time = ?, end_time = ?, is_active = ?
       WHERE id = ? AND student_id = ?`
    )
    .run(merged.day_of_week, merged.start_time, merged.end_time, isActive ? 1 : 0, blockId, studentId);

  return getBlock(studentId, blockId);
}

export function deleteStudyBlock(studentId, blockId) {
  getBlock(studentId, blockId);
  getDb().prepare('DELETE FROM study_block WHERE id = ? AND student_id = ?').run(blockId, studentId);
  return { deleted: blockId };
}
