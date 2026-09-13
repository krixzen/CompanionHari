import { getDb } from '../db/index.js';
import { conflict, notFound } from '../lib/httpError.js';
import { colourForPosition } from '../lib/palette.js';
import { deriveSubjectCode, uniqueSubjectCode } from './trackingNumber.js';

const SELECT_WITH_COUNTS = `
  SELECT
    s.*,
    (SELECT COUNT(*) FROM topic t WHERE t.subject_id = s.id) AS topic_count,
    (SELECT COUNT(*) FROM topic t WHERE t.subject_id = s.id AND t.status != 'not_started')
      AS topics_started,
    (SELECT COUNT(*) FROM topic t WHERE t.subject_id = s.id AND t.status = 'mastered')
      AS topics_mastered,
    (SELECT COALESCE(SUM(t.allocated_duration_minutes), 0) FROM topic t WHERE t.subject_id = s.id)
      AS allocated_minutes
  FROM subject s
`;

export function listSubjects(studentId) {
  return getDb()
    .prepare(`${SELECT_WITH_COUNTS} WHERE s.student_id = ? ORDER BY s.display_order, s.id`)
    .all(studentId);
}

export function getSubject(studentId, subjectId) {
  const subject = getDb()
    .prepare(`${SELECT_WITH_COUNTS} WHERE s.id = ? AND s.student_id = ?`)
    .get(subjectId, studentId);
  if (!subject) throw notFound('That subject no longer exists.');
  return subject;
}

export function createSubject(studentId, { name, colour, code }) {
  const db = getDb();

  const duplicate = db
    .prepare('SELECT id FROM subject WHERE student_id = ? AND lower(name) = lower(?)')
    .get(studentId, name);
  if (duplicate) throw conflict(`You already have a subject called "${name}".`);

  const finalCode = uniqueSubjectCode(studentId, code || deriveSubjectCode(name));

  const nextOrder =
    db
      .prepare('SELECT COALESCE(MAX(display_order), -1) + 1 AS next FROM subject WHERE student_id = ?')
      .get(studentId).next ?? 0;

  const info = db
    .prepare(
      `INSERT INTO subject (student_id, name, code, colour, display_order)
       VALUES (?, ?, ?, ?, ?)`
    )
    // Without a chosen colour, take the palette slot for this position so the
    // set stays distinguishable.
    .run(studentId, name, finalCode, colour || colourForPosition(nextOrder), nextOrder);

  return getSubject(studentId, info.lastInsertRowid);
}

export function updateSubject(studentId, subjectId, changes) {
  const db = getDb();
  const existing = getSubject(studentId, subjectId);

  if (changes.name && changes.name.toLowerCase() !== existing.name.toLowerCase()) {
    const duplicate = db
      .prepare('SELECT id FROM subject WHERE student_id = ? AND lower(name) = lower(?) AND id != ?')
      .get(studentId, changes.name, subjectId);
    if (duplicate) throw conflict(`You already have a subject called "${changes.name}".`);
  }

  // The code is baked into existing tracking numbers, so changing it only
  // affects topics added from here on. Old numbers are left untouched.
  const nextCode =
    changes.code && changes.code !== existing.code
      ? uniqueSubjectCode(studentId, changes.code, { excludeSubjectId: subjectId })
      : existing.code;

  db.prepare(
    `UPDATE subject SET name = ?, code = ?, colour = ? WHERE id = ? AND student_id = ?`
  ).run(
    changes.name ?? existing.name,
    nextCode,
    changes.colour ?? existing.colour,
    subjectId,
    studentId
  );

  return getSubject(studentId, subjectId);
}

export function deleteSubject(studentId, subjectId) {
  const subject = getSubject(studentId, subjectId);
  getDb().prepare('DELETE FROM subject WHERE id = ? AND student_id = ?').run(subjectId, studentId);
  return { deleted: subject.id, topicsRemoved: subject.topic_count };
}

/** Persists a new order given the full list of subject ids, first to last. */
export function reorderSubjects(studentId, orderedIds) {
  const db = getDb();
  const owned = new Set(
    db.prepare('SELECT id FROM subject WHERE student_id = ?').all(studentId).map((r) => r.id)
  );

  const unknown = orderedIds.filter((id) => !owned.has(id));
  if (unknown.length) throw notFound(`Unknown subject id: ${unknown[0]}.`);

  const update = db.prepare('UPDATE subject SET display_order = ? WHERE id = ? AND student_id = ?');
  const apply = db.transaction(() => {
    orderedIds.forEach((id, index) => update.run(index, id, studentId));
  });
  apply();

  return listSubjects(studentId);
}
