import { getDb } from '../db/index.js';

const PAD = 3;

/**
 * Turns a subject name into a short tracking-number prefix:
 *   'Physics'                 -> 'PHY'
 *   'Artificial Intelligence' -> 'AI'
 *   'Business Studies'        -> 'BS'
 * Multi-word names use initials; single words use their first three letters.
 */
export function deriveSubjectCode(name) {
  const words = String(name)
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return 'SUB';

  const code =
    words.length > 1
      ? words.slice(0, 4).map((word) => word[0]).join('')
      : words[0].slice(0, 3);

  return code.toUpperCase();
}

/**
 * Returns a code that is not already used by another subject of this student,
 * appending a digit if the natural code is taken (PHY, PHY2, PHY3...).
 */
export function uniqueSubjectCode(studentId, desired, { excludeSubjectId = null } = {}) {
  const db = getDb();
  const base = (desired || 'SUB').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'SUB';

  const taken = new Set(
    db
      .prepare(
        `SELECT code FROM subject WHERE student_id = ? AND (? IS NULL OR id != ?)`
      )
      .all(studentId, excludeSubjectId, excludeSubjectId)
      .map((row) => row.code)
  );

  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = `${base}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(`Could not find a free tracking prefix based on "${base}".`);
}

/**
 * Allocates the next `count` tracking numbers for a subject.
 *
 * The subject carries a counter that only ever moves forward, so deleting
 * PHY-007 leaves a gap rather than freeing the number for the next topic — a
 * tracking number stays a stable reference for the whole year. Existing
 * numbers are checked too, in case the subject's prefix was changed to one
 * that has been used before.
 */
export function allocateTrackingNumbers(subjectId, subjectCode, count) {
  const db = getDb();
  const prefix = `${subjectCode}-`;

  const counter =
    db.prepare('SELECT next_topic_number FROM subject WHERE id = ?').get(subjectId)
      ?.next_topic_number ?? 1;

  const usedByPrefix = db
    .prepare('SELECT tracking_number FROM topic WHERE tracking_number LIKE ?')
    .all(`${prefix}%`)
    .map((row) => Number.parseInt(row.tracking_number.slice(prefix.length), 10))
    .filter((value) => Number.isFinite(value));

  let next = Math.max(counter, usedByPrefix.length ? Math.max(...usedByPrefix) + 1 : 1);

  const numbers = [];
  for (let index = 0; index < count; index += 1) {
    numbers.push(`${prefix}${String(next).padStart(PAD, '0')}`);
    next += 1;
  }

  db.prepare('UPDATE subject SET next_topic_number = ? WHERE id = ?').run(next, subjectId);

  return numbers;
}
