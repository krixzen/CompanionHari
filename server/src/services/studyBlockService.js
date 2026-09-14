/**
 * Study blocks: the weekly windows a student has actually agreed are for
 * studying, once school, coaching, meals and travel time are accounted
 * for. Unlike week templates, there is only ever one set — no per-week
 * scoping — since the point is a shape the student can live the same way
 * every week, not a calendar of exceptions.
 *
 * `proposeStudyBlocks` never writes anything: it is a read-only suggestion
 * the student reviews, edits and only then saves via `saveStudyBlocks`.
 */
import { getDb } from '../db/index.js';
import { badRequest, notFound } from '../lib/httpError.js';
import { addDays, datesBetween, dayOfWeek, freeRanges, toMinutes, toTime, todayIso } from '../lib/time.js';
import { buildBusyMap } from './scheduler.js';
import { getPlannerSettings } from './settingsService.js';
import { resolveEffectiveAnchors } from './templateService.js';

const DAY_COUNT = 7;
const MIN_SLOT_MINUTES = 30;

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

/**
 * Suggests a repeatable weekly set of study windows from what is actually
 * free after fixed commitments — sampled across the next two weeks so a
 * fortnight's worth of variation (an extra coaching day, say) is taken into
 * account, but collapsed into a single weekly shape since the student is
 * expected to live the same week on repeat. A gap only survives if it is
 * free on every occurrence of that weekday sampled, not just one.
 *
 * Returns a plain draft — nothing is written until `saveStudyBlocks` is
 * called with whatever the student kept and adjusted.
 */
export function proposeStudyBlocks(studentId) {
  const settings = getPlannerSettings();
  const windowStart = toMinutes(settings.day_start);
  const windowEnd = toMinutes(settings.day_end);

  const from = todayIso();
  const to = addDays(from, 13);
  const dates = datesBetween(from, to);
  const anchors = resolveEffectiveAnchors(studentId, dates);
  // Existing bookings don't make a slot unsuitable for study — quite the
  // opposite — so only fixed commitments count as busy here.
  const busy = buildBusyMap(dates, anchors, []);

  const busyByDay = new Map();
  for (const date of dates) {
    const day = dayOfWeek(date);
    if (!busyByDay.has(day)) busyByDay.set(day, []);
    busyByDay.get(day).push(...(busy.get(date) ?? []));
  }

  const proposals = [];
  for (let day = 0; day < DAY_COUNT; day += 1) {
    const gaps = freeRanges(windowStart, windowEnd, busyByDay.get(day) ?? []);
    for (const gap of gaps) {
      if (gap.end - gap.start < MIN_SLOT_MINUTES) continue;
      proposals.push({ day_of_week: day, start_time: toTime(gap.start), end_time: toTime(gap.end) });
    }
  }

  return proposals;
}
