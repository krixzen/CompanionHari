import { getDb } from '../db/index.js';
import { badRequest, notFound } from '../lib/httpError.js';
import { isIsoDate, toMinutes } from '../lib/time.js';

export const ANCHOR_TYPES = ['school', 'coaching', 'sport', 'meal', 'family', 'sleep', 'exam', 'other'];

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** A believable school week, offered as a starting point rather than assumed. */
const STARTER_WEEK = [
  { label: 'Sleep', type: 'sleep', days: [0, 1, 2, 3, 4, 5, 6], start_time: '22:30', end_time: '23:59' },
  { label: 'Sleep', type: 'sleep', days: [0, 1, 2, 3, 4, 5, 6], start_time: '00:00', end_time: '06:30' },
  { label: 'Breakfast', type: 'meal', days: [0, 1, 2, 3, 4, 5, 6], start_time: '07:00', end_time: '07:30' },
  { label: 'School', type: 'school', days: [0, 1, 2, 3, 4], start_time: '08:00', end_time: '14:30' },
  { label: 'Lunch', type: 'meal', days: [0, 1, 2, 3, 4, 5, 6], start_time: '14:45', end_time: '15:15' },
  { label: 'Coaching', type: 'coaching', days: [0, 2, 4], start_time: '16:00', end_time: '18:00' },
  { label: 'Sport', type: 'sport', days: [1, 3], start_time: '16:30', end_time: '17:30' },
  { label: 'Dinner', type: 'meal', days: [0, 1, 2, 3, 4, 5, 6], start_time: '20:00', end_time: '20:45' },
  { label: 'Family time', type: 'family', days: [5, 6], start_time: '18:00', end_time: '20:00' },
];

export function listAnchors(studentId) {
  return getDb()
    .prepare(
      `SELECT * FROM anchor WHERE student_id = ?
       ORDER BY day_of_week, start_time, id`
    )
    .all(studentId)
    .map((anchor) => ({ ...anchor, is_active: Boolean(anchor.is_active) }));
}

function getAnchor(studentId, anchorId) {
  const anchor = getDb()
    .prepare('SELECT * FROM anchor WHERE id = ? AND student_id = ?')
    .get(anchorId, studentId);
  if (!anchor) throw notFound('That commitment is no longer there.');
  return { ...anchor, is_active: Boolean(anchor.is_active) };
}

/**
 * Checks the shape of a commitment and normalises its times.
 *
 * effective_from/effective_until scope a commitment to a run of dates —
 * an exam week, a stretch of extra classes — instead of it repeating
 * forever. Both null (the default) means "every week, always".
 */
function validate({
  label,
  type,
  day_of_week: day,
  start_time: start,
  end_time: end,
  effective_from: effectiveFrom,
  effective_until: effectiveUntil,
}) {
  if (!label || !String(label).trim()) throw badRequest('Give the commitment a name.');
  if (!ANCHOR_TYPES.includes(type)) {
    throw badRequest(`"type" must be one of: ${ANCHOR_TYPES.join(', ')}.`);
  }
  if (!Number.isInteger(day) || day < 0 || day > 6) {
    throw badRequest('Pick a day of the week.');
  }

  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  if (startMinutes === null) throw badRequest('The start time should look like 08:00.');
  if (endMinutes === null) throw badRequest('The end time should look like 14:30.');
  if (endMinutes <= startMinutes) {
    throw badRequest(
      'The end time has to be after the start time. For something that runs past midnight, add it as two commitments.'
    );
  }

  const from = effectiveFrom ?? null;
  const until = effectiveUntil ?? null;
  if (from !== null && !isIsoDate(from)) throw badRequest('The start date should look like 2026-09-14.');
  if (until !== null && !isIsoDate(until)) throw badRequest('The end date should look like 2026-09-20.');
  if (from !== null && until !== null && until < from) {
    throw badRequest('That range ends before it starts.');
  }

  return {
    label: String(label).trim().slice(0, 120),
    type,
    day_of_week: day,
    start_time: start,
    end_time: end,
    effective_from: from,
    effective_until: until,
  };
}

export function createAnchor(studentId, input) {
  const anchor = validate(input);
  const info = getDb()
    .prepare(
      `INSERT INTO anchor
         (student_id, label, type, day_of_week, start_time, end_time, is_active, effective_from, effective_until)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
    )
    .run(
      studentId,
      anchor.label,
      anchor.type,
      anchor.day_of_week,
      anchor.start_time,
      anchor.end_time,
      anchor.effective_from,
      anchor.effective_until
    );

  return getAnchor(studentId, info.lastInsertRowid);
}

export function updateAnchor(studentId, anchorId, changes) {
  const existing = getAnchor(studentId, anchorId);
  const merged = validate({ ...existing, ...changes });

  const isActive =
    changes.is_active === undefined ? existing.is_active : Boolean(changes.is_active);

  getDb()
    .prepare(
      `UPDATE anchor
         SET label = ?, type = ?, day_of_week = ?, start_time = ?, end_time = ?, is_active = ?,
             effective_from = ?, effective_until = ?
       WHERE id = ? AND student_id = ?`
    )
    .run(
      merged.label,
      merged.type,
      merged.day_of_week,
      merged.start_time,
      merged.end_time,
      isActive ? 1 : 0,
      merged.effective_from,
      merged.effective_until,
      anchorId,
      studentId
    );

  return getAnchor(studentId, anchorId);
}

export function deleteAnchor(studentId, anchorId) {
  const anchor = getAnchor(studentId, anchorId);
  getDb().prepare('DELETE FROM anchor WHERE id = ? AND student_id = ?').run(anchorId, studentId);
  return { deleted: anchor.id };
}

/**
 * Adds a typical school week. Only ever runs when there are no commitments at
 * all, so it cannot quietly duplicate what someone has already entered.
 */
export function addStarterWeek(studentId) {
  const db = getDb();
  const existing = db
    .prepare('SELECT COUNT(*) AS count FROM anchor WHERE student_id = ?')
    .get(studentId).count;

  if (existing > 0) {
    throw badRequest('You already have some commitments — add the rest yourself so nothing is duplicated.');
  }

  const insert = db.prepare(
    `INSERT INTO anchor (student_id, label, type, day_of_week, start_time, end_time, is_active)
     VALUES (?, ?, ?, ?, ?, ?, 1)`
  );

  const addAll = db.transaction(() => {
    for (const template of STARTER_WEEK) {
      for (const day of template.days) {
        insert.run(studentId, template.label, template.type, day, template.start_time, template.end_time);
      }
    }
  });
  addAll();

  return listAnchors(studentId);
}
