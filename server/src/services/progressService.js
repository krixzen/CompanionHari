import { getDb } from '../db/index.js';
import { addDays, datesBetween, startOfWeek, todayIso } from '../lib/time.js';
import { flaggedTopics } from './analysisService.js';
import { syllabusCoverage } from './practiceItemService.js';
import { overdueTopics, unscheduledTopics } from './topicService.js';

/**
 * The numbers behind the Progress screen.
 *
 * Everything here counts what happened, never what didn't. There is no
 * "missed" figure and no streak to break: a day with no session simply is not
 * counted. Progress should read as evidence that the work is adding up.
 */

/** Minutes studied on each day in a range, with empty days present as zero. */
export function dailyMinutes(studentId, from, to) {
  const rows = getDb()
    .prepare(
      `SELECT ss.date, SUM(ss.minutes_spent) AS minutes, COUNT(*) AS sessions
       FROM study_session ss
       JOIN topic t   ON t.id = ss.topic_id
       JOIN subject s ON s.id = t.subject_id
       WHERE s.student_id = ? AND ss.date BETWEEN ? AND ?
       GROUP BY ss.date`
    )
    .all(studentId, from, to);

  const byDate = new Map(rows.map((row) => [row.date, row]));

  return datesBetween(from, to).map((date) => ({
    date,
    minutes: byDate.get(date)?.minutes ?? 0,
    sessions: byDate.get(date)?.sessions ?? 0,
  }));
}

/** Time spent per subject, biggest first. */
export function minutesBySubject(studentId, from, to) {
  return getDb()
    .prepare(
      `SELECT s.id AS subject_id, s.name, s.colour, s.code,
              COALESCE(SUM(ss.minutes_spent), 0) AS minutes,
              COUNT(ss.id) AS sessions
       FROM subject s
       LEFT JOIN topic t ON t.subject_id = s.id
       LEFT JOIN study_session ss
              ON ss.topic_id = t.id AND ss.date BETWEEN ? AND ?
       WHERE s.student_id = ?
       GROUP BY s.id
       ORDER BY minutes DESC, s.display_order`
    )
    .all(from, to, studentId);
}

/**
 * Average confidence per subject over time, as one series per subject.
 *
 * Sessions without a score are left out rather than counted as zero — not
 * answering is not the same as feeling lost.
 */
export function confidenceBySubject(studentId, from, to) {
  const rows = getDb()
    .prepare(
      `SELECT s.id AS subject_id, s.name, s.colour, ss.date,
              AVG(ss.confidence_score) AS average, COUNT(*) AS sessions
       FROM study_session ss
       JOIN topic t   ON t.id = ss.topic_id
       JOIN subject s ON s.id = t.subject_id
       WHERE s.student_id = ? AND ss.date BETWEEN ? AND ?
         AND ss.confidence_score IS NOT NULL
       GROUP BY s.id, ss.date
       ORDER BY s.display_order, ss.date`
    )
    .all(studentId, from, to);

  const bySubject = new Map();
  for (const row of rows) {
    if (!bySubject.has(row.subject_id)) {
      bySubject.set(row.subject_id, {
        subject_id: row.subject_id,
        name: row.name,
        colour: row.colour,
        points: [],
      });
    }
    bySubject.get(row.subject_id).points.push({
      date: row.date,
      average: Math.round(row.average * 100) / 100,
      sessions: row.sessions,
    });
  }

  return [...bySubject.values()];
}

/** How many topics sit at each stage, across every subject. */
export function topicsByStatus(studentId) {
  const rows = getDb()
    .prepare(
      `SELECT t.status, COUNT(*) AS count
       FROM topic t JOIN subject s ON s.id = t.subject_id
       WHERE s.student_id = ?
       GROUP BY t.status`
    )
    .all(studentId);

  const byStatus = new Map(rows.map((row) => [row.status, row.count]));

  return ['not_started', 'in_progress', 'revised', 'mastered'].map((status) => ({
    status,
    count: byStatus.get(status) ?? 0,
  }));
}

/** The headline numbers: this week, and everything so far. */
export function summary(studentId) {
  const db = getDb();
  const today = todayIso();
  const weekStart = startOfWeek(today);

  const forRange = (from, to) =>
    db
      .prepare(
        `SELECT COALESCE(SUM(ss.minutes_spent), 0) AS minutes,
                COUNT(*)                          AS sessions,
                COUNT(DISTINCT ss.date)           AS days,
                COUNT(DISTINCT s.id)              AS subjects,
                AVG(ss.confidence_score)          AS confidence
         FROM study_session ss
         JOIN topic t   ON t.id = ss.topic_id
         JOIN subject s ON s.id = t.subject_id
         WHERE s.student_id = ? AND ss.date BETWEEN ? AND ?`
      )
      .get(studentId, from, to);

  const round = (row) => ({
    ...row,
    confidence: row.confidence === null ? null : Math.round(row.confidence * 10) / 10,
  });

  const first = db
    .prepare(
      `SELECT MIN(ss.date) AS first_date FROM study_session ss
       JOIN topic t ON t.id = ss.topic_id
       JOIN subject s ON s.id = t.subject_id
       WHERE s.student_id = ?`
    )
    .get(studentId).first_date;

  return {
    week: round(forRange(weekStart, addDays(weekStart, 6))),
    lastWeek: round(forRange(addDays(weekStart, -7), addDays(weekStart, -1))),
    allTime: round(forRange('0000-01-01', '9999-12-31')),
    firstSessionOn: first,
    weekStart,
    today,
  };
}

/**
 * Topics whose most recent score was low. These are the ones worth another
 * look, and they are presented as an invitation rather than a warning.
 */
export function shakyTopics(studentId, limit = 6) {
  return getDb()
    .prepare(
      `SELECT t.id, t.tracking_number, t.title, t.status,
              s.name AS subject_name, s.colour AS subject_colour,
              ss.confidence_score, ss.date
       FROM study_session ss
       JOIN topic t   ON t.id = ss.topic_id
       JOIN subject s ON s.id = t.subject_id
       WHERE s.student_id = ?
         AND ss.confidence_score IS NOT NULL
         AND ss.id = (
           SELECT id FROM study_session
           WHERE topic_id = t.id AND confidence_score IS NOT NULL
           ORDER BY date DESC, id DESC LIMIT 1
         )
         AND ss.confidence_score <= 2
         AND t.status != 'mastered'
       ORDER BY ss.confidence_score, ss.date DESC
       LIMIT ?`
    )
    .all(studentId, limit);
}

export function progressReport(studentId, { from, to }) {
  return {
    from,
    to,
    summary: summary(studentId),
    daily: dailyMinutes(studentId, from, to),
    bySubject: minutesBySubject(studentId, from, to),
    confidence: confidenceBySubject(studentId, from, to),
    status: topicsByStatus(studentId),
    shaky: shakyTopics(studentId),
    coverage: syllabusCoverage(studentId),
    overdue: overdueTopics(studentId),
    unscheduled: unscheduledTopics(studentId),
    flagged: flaggedTopics(studentId),
  };
}
