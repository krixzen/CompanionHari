import { getDb } from '../db/index.js';
import { badRequest, notFound } from '../lib/httpError.js';

export const ANALYSIS_TYPES = ['test_pattern', 'weekly_action_plan'];

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

const toAnalysis = (row) => ({
  ...row,
  payload: (() => {
    try {
      return JSON.parse(row.payload);
    } catch {
      return {};
    }
  })(),
});

export function listAnalyses(studentId, { testId, type } = {}) {
  const db = getDb();
  const where = ['student_id = ?'];
  const params = [studentId];

  if (testId) {
    where.push('test_id = ?');
    params.push(testId);
  }
  if (type) {
    where.push('analysis_type = ?');
    params.push(type);
  }

  return db
    .prepare(`SELECT * FROM analysis WHERE ${where.join(' AND ')} ORDER BY created_at DESC, id DESC`)
    .all(...params)
    .map(toAnalysis);
}

export function getAnalysis(studentId, analysisId) {
  const row = getDb()
    .prepare('SELECT * FROM analysis WHERE id = ? AND student_id = ?')
    .get(analysisId, studentId);
  if (!row) throw notFound('That analysis is no longer there.');
  return toAnalysis(row);
}

/**
 * Saves the result of a round trip through the LLM Bridge. The shape of
 * `payload` was already checked against a JSON schema in the browser before
 * the student confirmed it, so this only re-checks the two things a server
 * always has to: who owns what, and that nothing malformed slips into the
 * database even if a request bypasses the UI.
 */
export function createAnalysis(studentId, { test_id, analysis_type, payload }) {
  const db = getDb();

  if (!ANALYSIS_TYPES.includes(analysis_type)) {
    throw badRequest(`"analysis_type" must be one of: ${ANALYSIS_TYPES.join(', ')}.`);
  }
  if (!isPlainObject(payload)) throw badRequest('"payload" must be an object.');

  let testId = null;
  if (test_id != null) {
    const test = db.prepare('SELECT id FROM test WHERE id = ? AND student_id = ?').get(test_id, studentId);
    if (!test) throw notFound('That test is no longer there.');
    testId = test.id;
  }

  const info = db
    .prepare('INSERT INTO analysis (student_id, test_id, analysis_type, payload) VALUES (?, ?, ?, ?)')
    .run(studentId, testId, analysis_type, JSON.stringify(payload));

  return getAnalysis(studentId, info.lastInsertRowid);
}

export function deleteAnalysis(studentId, analysisId) {
  const analysis = getAnalysis(studentId, analysisId);
  getDb().prepare('DELETE FROM analysis WHERE id = ? AND student_id = ?').run(analysisId, studentId);
  return { deleted: analysis.id };
}

/**
 * Topics a recent test-pattern analysis called out by tracking number. Only
 * the last few analyses count — an issue from months ago that was never
 * mentioned again is not worth resurfacing forever.
 */
export function flaggedTopics(studentId, { recentAnalyses = 5, limit = 10 } = {}) {
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT payload FROM analysis
       WHERE student_id = ? AND analysis_type = 'test_pattern'
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    )
    .all(studentId, recentAnalyses);

  const trackingNumbers = new Set();
  for (const row of rows) {
    let payload;
    try {
      payload = JSON.parse(row.payload);
    } catch {
      continue;
    }
    for (const area of payload.weak_areas ?? []) {
      if (area.tracking_number) trackingNumbers.add(area.tracking_number);
    }
  }

  if (trackingNumbers.size === 0) return [];

  const placeholders = [...trackingNumbers].map(() => '?').join(',');
  return db
    .prepare(
      `SELECT t.id, t.tracking_number, t.title, t.status,
              s.name AS subject_name, s.colour AS subject_colour
       FROM topic t
       JOIN subject s ON s.id = t.subject_id
       WHERE s.student_id = ? AND t.tracking_number IN (${placeholders})
       ORDER BY s.display_order, t.display_order
       LIMIT ?`
    )
    .all(studentId, ...trackingNumbers, limit);
}
