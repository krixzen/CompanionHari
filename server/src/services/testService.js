import { getDb } from '../db/index.js';
import { badRequest, notFound } from '../lib/httpError.js';

/**
 * A test's own totals (total_marks / marks_obtained) are entered by hand and
 * kept separate from anything computed off its per-question results — a
 * partially-marked breakdown should never silently overwrite the score on the
 * report card.
 */

const TEST_SELECT = `
  SELECT t.*,
    (SELECT COUNT(*) FROM test_result r WHERE r.test_id = t.id) AS result_count
  FROM test t
`;

export function listTests(studentId, { subjectId } = {}) {
  const db = getDb();

  if (subjectId) {
    return db
      .prepare(
        `${TEST_SELECT}
         WHERE t.student_id = ?
           AND EXISTS (SELECT 1 FROM test_result r WHERE r.test_id = t.id AND r.subject_id = ?)
         ORDER BY t.test_date DESC, t.id DESC`
      )
      .all(studentId, subjectId);
  }

  return db
    .prepare(`${TEST_SELECT} WHERE t.student_id = ? ORDER BY t.test_date DESC, t.id DESC`)
    .all(studentId);
}

/** Accuracy and time figures worked out from whatever results exist, no AI involved. */
function computeStats(results) {
  const attempted = results.filter((r) => r.attempted);
  const correct = results.filter((r) => r.correct);
  const timed = results.filter((r) => r.time_taken_seconds != null);

  const bySubjectMap = new Map();
  for (const r of results) {
    if (!r.subject_id) continue;
    if (!bySubjectMap.has(r.subject_id)) {
      bySubjectMap.set(r.subject_id, {
        subject_id: r.subject_id,
        subject_name: r.subject_name,
        subject_colour: r.subject_colour,
        total: 0,
        attempted: 0,
        correct: 0,
      });
    }
    const bucket = bySubjectMap.get(r.subject_id);
    bucket.total += 1;
    if (r.attempted) bucket.attempted += 1;
    if (r.correct) bucket.correct += 1;
  }

  return {
    questionCount: results.length,
    attempted: attempted.length,
    correct: correct.length,
    incorrectAttempted: attempted.length - correct.length,
    unattempted: results.length - attempted.length,
    accuracyOfAttempted:
      attempted.length > 0 ? Math.round((correct.length / attempted.length) * 1000) / 10 : null,
    accuracyOverall:
      results.length > 0 ? Math.round((correct.length / results.length) * 1000) / 10 : null,
    averageSeconds:
      timed.length > 0
        ? Math.round(timed.reduce((sum, r) => sum + r.time_taken_seconds, 0) / timed.length)
        : null,
    bySubject: [...bySubjectMap.values()].map((bucket) => ({
      ...bucket,
      accuracy:
        bucket.attempted > 0 ? Math.round((bucket.correct / bucket.attempted) * 1000) / 10 : null,
    })),
  };
}

export function getTest(studentId, testId) {
  const db = getDb();
  const test = db.prepare(`${TEST_SELECT} WHERE t.id = ? AND t.student_id = ?`).get(testId, studentId);
  if (!test) throw notFound('That test is no longer there.');

  const results = db
    .prepare(
      `SELECT r.*, s.name AS subject_name, s.colour AS subject_colour,
              top.tracking_number, top.title AS topic_title
       FROM test_result r
       LEFT JOIN subject s ON s.id = r.subject_id
       LEFT JOIN topic top ON top.id = r.topic_id
       WHERE r.test_id = ?
       ORDER BY (r.question_number IS NULL), r.question_number, r.id`
    )
    .all(testId)
    .map((row) => ({ ...row, attempted: Boolean(row.attempted), correct: Boolean(row.correct) }));

  return { ...test, results, stats: computeStats(results) };
}

function validateTest(input) {
  const name = String(input.test_name ?? '').trim();
  if (!name) throw badRequest('Give the test a name.');

  const numOrNull = (value, label) => {
    if (value === undefined || value === null || value === '') return null;
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) throw badRequest(`"${label}" must be a positive number.`);
    return number;
  };

  const test_date = input.test_date || null;
  if (test_date && !/^\d{4}-\d{2}-\d{2}$/.test(test_date)) {
    throw badRequest('The test date should look like 2026-09-14.');
  }

  const total_marks = numOrNull(input.total_marks, 'total_marks');
  const marks_obtained = numOrNull(input.marks_obtained, 'marks_obtained');
  if (total_marks !== null && marks_obtained !== null && marks_obtained > total_marks) {
    throw badRequest('Marks obtained cannot be more than the total marks.');
  }

  return {
    test_name: name.slice(0, 200),
    test_date,
    source: input.source ? String(input.source).trim().slice(0, 120) : null,
    total_marks,
    marks_obtained,
    notes: input.notes ? String(input.notes).trim().slice(0, 5000) : null,
  };
}

export function createTest(studentId, input) {
  const test = validateTest(input);
  const info = getDb()
    .prepare(
      `INSERT INTO test (student_id, test_name, test_date, source, total_marks, marks_obtained, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(studentId, test.test_name, test.test_date, test.source, test.total_marks, test.marks_obtained, test.notes);

  return getTest(studentId, info.lastInsertRowid);
}

export function updateTest(studentId, testId, input) {
  getTest(studentId, testId); // ownership + existence check
  const test = validateTest(input);

  getDb()
    .prepare(
      `UPDATE test SET test_name = ?, test_date = ?, source = ?, total_marks = ?, marks_obtained = ?, notes = ?
       WHERE id = ? AND student_id = ?`
    )
    .run(test.test_name, test.test_date, test.source, test.total_marks, test.marks_obtained, test.notes, testId, studentId);

  return getTest(studentId, testId);
}

export function deleteTest(studentId, testId) {
  const test = getTest(studentId, testId);
  // test_result rows cascade; analysis rows detach (test_id -> NULL) so a
  // saved analysis is never silently destroyed along with the test it came from.
  getDb().prepare('DELETE FROM test WHERE id = ? AND student_id = ?').run(testId, studentId);
  return { deleted: test.id, test_name: test.test_name };
}
