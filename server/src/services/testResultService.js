import { getDb } from '../db/index.js';
import { badRequest, notFound } from '../lib/httpError.js';
import { getTest } from './testService.js';

const ownsSubject = (studentId, subjectId) =>
  !subjectId ||
  getDb().prepare('SELECT id FROM subject WHERE id = ? AND student_id = ?').get(subjectId, studentId);

const ownsTopic = (studentId, topicId) =>
  !topicId ||
  getDb()
    .prepare(
      `SELECT t.id FROM topic t JOIN subject s ON s.id = t.subject_id
       WHERE t.id = ? AND s.student_id = ?`
    )
    .get(topicId, studentId);

function validateRow(studentId, input, index) {
  const label = input.question_number != null ? `Question ${input.question_number}` : `Row ${index + 1}`;

  const subject_id = input.subject_id != null ? Number(input.subject_id) : null;
  if (subject_id !== null && !ownsSubject(studentId, subject_id)) {
    throw badRequest(`${label}: that subject does not exist.`);
  }

  const topic_id = input.topic_id != null ? Number(input.topic_id) : null;
  if (topic_id !== null && !ownsTopic(studentId, topic_id)) {
    throw badRequest(`${label}: that topic does not exist.`);
  }

  const question_number =
    input.question_number != null && input.question_number !== '' ? Number(input.question_number) : null;
  if (question_number !== null && (!Number.isInteger(question_number) || question_number < 1)) {
    throw badRequest(`${label}: the question number has to be a positive whole number.`);
  }

  const marks = input.marks != null && input.marks !== '' ? Number(input.marks) : null;
  if (marks !== null && !Number.isFinite(marks)) throw badRequest(`${label}: marks must be a number.`);

  const time_taken_seconds =
    input.time_taken_seconds != null && input.time_taken_seconds !== ''
      ? Number(input.time_taken_seconds)
      : null;
  if (time_taken_seconds !== null && (!Number.isInteger(time_taken_seconds) || time_taken_seconds < 0)) {
    throw badRequest(`${label}: time taken must be a whole number of seconds.`);
  }

  const attempted = Boolean(input.attempted);
  // A question marked correct without being marked attempted doesn't make sense.
  const correct = attempted && Boolean(input.correct);

  return { subject_id, topic_id, question_number, attempted, correct, marks, time_taken_seconds };
}

/**
 * Replaces every result row for a test in one transaction. This is the one
 * write path — used by the manual entry table and by the "paste the marked
 * paper" review screen alike — so a partial save can never leave stray rows
 * from a previous version behind.
 */
export function setTestResults(studentId, testId, rows) {
  const db = getDb();
  getTest(studentId, testId); // ownership check

  if (!Array.isArray(rows)) throw badRequest('"results" must be a list.');
  if (rows.length > 500) throw badRequest('That is more results than one test should have — check the list.');

  const validated = rows.map((row, index) => validateRow(studentId, row, index));

  const run = db.transaction(() => {
    db.prepare('DELETE FROM test_result WHERE test_id = ?').run(testId);
    const insert = db.prepare(
      `INSERT INTO test_result
         (test_id, subject_id, topic_id, question_number, attempted, correct, marks, time_taken_seconds)
       VALUES (@test_id, @subject_id, @topic_id, @question_number, @attempted, @correct, @marks, @time_taken_seconds)`
    );
    for (const row of validated) {
      insert.run({
        test_id: testId,
        ...row,
        attempted: row.attempted ? 1 : 0,
        correct: row.correct ? 1 : 0,
      });
    }
  });
  run();

  return getTest(studentId, testId);
}

export function updateTestResult(studentId, testId, resultId, input) {
  const db = getDb();
  getTest(studentId, testId);

  const existing = db.prepare('SELECT * FROM test_result WHERE id = ? AND test_id = ?').get(resultId, testId);
  if (!existing) throw notFound('That row is no longer there.');

  const merged = validateRow(studentId, { ...existing, ...input }, 0);

  db.prepare(
    `UPDATE test_result
       SET subject_id = ?, topic_id = ?, question_number = ?, attempted = ?, correct = ?, marks = ?, time_taken_seconds = ?
     WHERE id = ?`
  ).run(
    merged.subject_id,
    merged.topic_id,
    merged.question_number,
    merged.attempted ? 1 : 0,
    merged.correct ? 1 : 0,
    merged.marks,
    merged.time_taken_seconds,
    resultId
  );

  return getTest(studentId, testId);
}

export function deleteTestResult(studentId, testId, resultId) {
  const db = getDb();
  getTest(studentId, testId);
  const existing = db.prepare('SELECT id FROM test_result WHERE id = ? AND test_id = ?').get(resultId, testId);
  if (!existing) throw notFound('That row is no longer there.');
  db.prepare('DELETE FROM test_result WHERE id = ?').run(resultId);
  return getTest(studentId, testId);
}
