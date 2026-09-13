/**
 * Week templates: a whole named Monday-to-Sunday pattern that can be
 * assigned wholesale to specific calendar weeks — a "Regular week" that
 * governs most of the term, an "Exam week" that replaces it for the two
 * weeks that need to look different.
 *
 * A week with no explicit assignment uses the student's default template.
 * `resolveEffectiveAnchors` is the bridge back to the scheduler: it turns
 * "which template governs which week" into the same flat, date-scoped
 * anchor shape `buildBusyMap` already understands, so nothing downstream
 * needs to know templates exist. The `anchor` table itself remains the
 * "something extra on top" layer — one-off additions like an exam sitting
 * that apply in addition to whichever template governs the week.
 */
import { getDb } from '../db/index.js';
import { badRequest, notFound } from '../lib/httpError.js';
import { toMinutes, weekBounds, weekNumberForDate } from '../lib/time.js';
import { ANCHOR_TYPES, listAnchors } from './anchorService.js';
import { getTermSettings } from './settingsService.js';

function getTemplate(studentId, templateId) {
  const template = getDb()
    .prepare('SELECT * FROM week_template WHERE id = ? AND student_id = ?')
    .get(templateId, studentId);
  if (!template) throw notFound('That week pattern no longer exists.');
  return { ...template, is_default: Boolean(template.is_default) };
}

function blocksFor(templateId) {
  return getDb()
    .prepare('SELECT * FROM week_template_block WHERE template_id = ? ORDER BY day_of_week, start_time')
    .all(templateId)
    .map((block) => ({ ...block, is_active: Boolean(block.is_active) }));
}

export function listTemplates(studentId) {
  const templates = getDb()
    .prepare('SELECT * FROM week_template WHERE student_id = ? ORDER BY is_default DESC, name')
    .all(studentId)
    .map((template) => ({ ...template, is_default: Boolean(template.is_default) }));

  const assignments = getDb()
    .prepare('SELECT week_number, template_id FROM week_assignment WHERE student_id = ? ORDER BY week_number')
    .all(studentId);

  return templates.map((template) => ({
    ...template,
    blocks: blocksFor(template.id),
    weeks: assignments.filter((row) => row.template_id === template.id).map((row) => row.week_number),
  }));
}

export function createTemplate(studentId, { name } = {}) {
  if (!name || !String(name).trim()) throw badRequest('Give this week a name.');
  const info = getDb()
    .prepare('INSERT INTO week_template (student_id, name, is_default) VALUES (?, ?, 0)')
    .run(studentId, String(name).trim().slice(0, 80));
  return { ...getTemplate(studentId, info.lastInsertRowid), blocks: [], weeks: [] };
}

export function renameTemplate(studentId, templateId, name) {
  if (!name || !String(name).trim()) throw badRequest('Give this week a name.');
  getTemplate(studentId, templateId);
  getDb()
    .prepare('UPDATE week_template SET name = ? WHERE id = ? AND student_id = ?')
    .run(String(name).trim().slice(0, 80), templateId, studentId);
  return { ...getTemplate(studentId, templateId), blocks: blocksFor(templateId) };
}

export function deleteTemplate(studentId, templateId) {
  const template = getTemplate(studentId, templateId);
  if (template.is_default) {
    throw badRequest(
      'The default week cannot be deleted — edit its blocks instead, or build another template for the weeks that need to differ.'
    );
  }
  // Weeks assigned to it cascade-delete along with it, reverting those
  // weeks to the default template.
  getDb().prepare('DELETE FROM week_template WHERE id = ? AND student_id = ?').run(templateId, studentId);
  return { deleted: templateId };
}

function validateBlock({ label, type, day_of_week: day, start_time: start, end_time: end }) {
  if (!label || !String(label).trim()) throw badRequest('Give the block a name.');
  if (!ANCHOR_TYPES.includes(type)) throw badRequest(`"type" must be one of: ${ANCHOR_TYPES.join(', ')}.`);
  if (!Number.isInteger(day) || day < 0 || day > 6) throw badRequest('Pick a day of the week.');

  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  if (startMinutes === null) throw badRequest('The start time should look like 08:00.');
  if (endMinutes === null) throw badRequest('The end time should look like 14:30.');
  if (endMinutes <= startMinutes) {
    throw badRequest(
      'The end time has to be after the start time. For something that runs past midnight, add it as two blocks.'
    );
  }

  return { label: String(label).trim().slice(0, 120), type, day_of_week: day, start_time: start, end_time: end };
}

function getBlock(studentId, templateId, blockId) {
  getTemplate(studentId, templateId);
  const block = getDb()
    .prepare('SELECT * FROM week_template_block WHERE id = ? AND template_id = ?')
    .get(blockId, templateId);
  if (!block) throw notFound('That block no longer exists.');
  return { ...block, is_active: Boolean(block.is_active) };
}

export function addBlock(studentId, templateId, input) {
  getTemplate(studentId, templateId);
  const block = validateBlock(input);
  const info = getDb()
    .prepare(
      `INSERT INTO week_template_block (template_id, label, type, day_of_week, start_time, end_time, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`
    )
    .run(templateId, block.label, block.type, block.day_of_week, block.start_time, block.end_time);
  return getBlock(studentId, templateId, info.lastInsertRowid);
}

export function updateBlock(studentId, templateId, blockId, changes) {
  const existing = getBlock(studentId, templateId, blockId);
  const merged = validateBlock({ ...existing, ...changes });
  const isActive = changes.is_active === undefined ? existing.is_active : Boolean(changes.is_active);

  getDb()
    .prepare(
      `UPDATE week_template_block
         SET label = ?, type = ?, day_of_week = ?, start_time = ?, end_time = ?, is_active = ?
       WHERE id = ? AND template_id = ?`
    )
    .run(
      merged.label,
      merged.type,
      merged.day_of_week,
      merged.start_time,
      merged.end_time,
      isActive ? 1 : 0,
      blockId,
      templateId
    );

  return getBlock(studentId, templateId, blockId);
}

export function deleteBlock(studentId, templateId, blockId) {
  getBlock(studentId, templateId, blockId);
  getDb().prepare('DELETE FROM week_template_block WHERE id = ? AND template_id = ?').run(blockId, templateId);
  return { deleted: blockId };
}

function cleanWeeks(weeks) {
  if (!Array.isArray(weeks) || weeks.length === 0) throw badRequest('Pick at least one week.');
  const cleaned = weeks.map(Number);
  if (cleaned.some((week) => !Number.isInteger(week) || week < 1 || week > 52)) {
    throw badRequest('Weeks must be between 1 and 52.');
  }
  return cleaned;
}

/** Makes `templateId` the pattern for each of `weeks`, replacing whatever governed them before. */
export function assignWeeks(studentId, templateId, weeks) {
  getTemplate(studentId, templateId);
  const cleaned = cleanWeeks(weeks);

  const db = getDb();
  const upsert = db.prepare(
    `INSERT INTO week_assignment (student_id, week_number, template_id) VALUES (?, ?, ?)
     ON CONFLICT(student_id, week_number) DO UPDATE SET template_id = excluded.template_id`
  );
  db.transaction(() => cleaned.forEach((week) => upsert.run(studentId, week, templateId)))();

  return listTemplates(studentId);
}

/** Reverts each of `weeks` back to the default template. */
export function unassignWeeks(studentId, weeks) {
  const cleaned = cleanWeeks(weeks);
  const db = getDb();
  const del = db.prepare('DELETE FROM week_assignment WHERE student_id = ? AND week_number = ?');
  db.transaction(() => cleaned.forEach((week) => del.run(studentId, week)))();
  return listTemplates(studentId);
}

/**
 * Turns "which template governs which week" into the flat, date-scoped
 * anchor shape the scheduler already understands: one virtual anchor per
 * template block, scoped to exactly the calendar week it came from, plus
 * the one-off extras layered on top of whichever template applies.
 */
export function resolveEffectiveAnchors(studentId, dates) {
  const extras = listAnchors(studentId);
  if (dates.length === 0) return extras;

  const termStart = getTermSettings().start_date;
  const db = getDb();

  const defaultTemplate = db
    .prepare('SELECT id FROM week_template WHERE student_id = ? AND is_default = 1')
    .get(studentId);

  const weekNumbers = [...new Set(dates.map((date) => weekNumberForDate(termStart, date)))];
  const placeholders = weekNumbers.map(() => '?').join(',');
  const assigned = new Map(
    db
      .prepare(
        `SELECT week_number, template_id FROM week_assignment
         WHERE student_id = ? AND week_number IN (${placeholders})`
      )
      .all(studentId, ...weekNumbers)
      .map((row) => [row.week_number, row.template_id])
  );

  const cache = new Map();
  const cachedBlocksFor = (templateId) => {
    if (!cache.has(templateId)) cache.set(templateId, blocksFor(templateId));
    return cache.get(templateId);
  };

  const virtual = [];
  for (const week of weekNumbers) {
    const templateId = assigned.get(week) ?? defaultTemplate?.id;
    if (!templateId) continue;
    const { from, until } = weekBounds(termStart, week);
    for (const block of cachedBlocksFor(templateId)) {
      virtual.push({
        id: `tpl-${block.id}-${week}`,
        label: block.label,
        type: block.type,
        day_of_week: block.day_of_week,
        start_time: block.start_time,
        end_time: block.end_time,
        is_active: block.is_active,
        effective_from: from,
        effective_until: until,
      });
    }
  }

  // Extras scoped to weeks outside this range simply do not apply here —
  // an exam booked for week 30 has no business showing up in week 3.
  const rangeFrom = dates[0];
  const rangeTo = dates[dates.length - 1];
  const relevantExtras = extras.filter(
    (extra) => !extra.effective_from || (extra.effective_from <= rangeTo && (extra.effective_until ?? extra.effective_from) >= rangeFrom)
  );

  return [...virtual, ...relevantExtras];
}
