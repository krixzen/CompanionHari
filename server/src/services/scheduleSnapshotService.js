/**
 * A frozen baseline for "how far behind am I really." Saving a snapshot
 * records the pending backlog (in minutes) per subject, plus the coverage
 * deadline in effect at that moment. Any time later, the gap report
 * compares the pace that backlog implied against what's actually been
 * completed since — a plain, deterministic calculation rather than
 * something left to an LLM to get right.
 */
import { getDb } from '../db/index.js';
import { badRequest, notFound } from '../lib/httpError.js';
import { todayIso } from '../lib/time.js';
import { pendingMinutesBySubject } from './practiceItemService.js';
import { getTermSettings } from './settingsService.js';

export function saveSnapshot(studentId, label) {
  if (!label || !String(label).trim()) throw badRequest('Give this snapshot a name.');

  const pending = pendingMinutesBySubject(studentId);
  const { cover_by_date: coverByDate } = getTermSettings();

  const info = getDb()
    .prepare(
      `INSERT INTO schedule_snapshot (student_id, label, pending_minutes_by_subject, cover_by_date)
       VALUES (?, ?, ?, ?)`
    )
    .run(studentId, String(label).trim().slice(0, 120), JSON.stringify(pending), coverByDate);

  return getSnapshot(studentId, info.lastInsertRowid);
}

export function listSnapshots(studentId) {
  return getDb()
    .prepare('SELECT * FROM schedule_snapshot WHERE student_id = ? ORDER BY created_at DESC')
    .all(studentId)
    .map((row) => ({ ...row, pending_minutes_by_subject: JSON.parse(row.pending_minutes_by_subject) }));
}

export function getSnapshot(studentId, snapshotId) {
  const row = getDb()
    .prepare('SELECT * FROM schedule_snapshot WHERE id = ? AND student_id = ?')
    .get(snapshotId, studentId);
  if (!row) throw notFound('That snapshot no longer exists.');
  return { ...row, pending_minutes_by_subject: JSON.parse(row.pending_minutes_by_subject) };
}

export function deleteSnapshot(studentId, snapshotId) {
  getSnapshot(studentId, snapshotId);
  getDb().prepare('DELETE FROM schedule_snapshot WHERE id = ? AND student_id = ?').run(snapshotId, studentId);
  return { deleted: snapshotId };
}

const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

/**
 * For each subject in the snapshot: the pace its backlog implied (minutes
 * per day, from the snapshot date to whatever the coverage deadline was
 * then), how much should be done by today at that pace, how much has
 * actually been completed since, and the gap between the two — positive
 * means behind, negative means ahead.
 */
export function gapReport(studentId, snapshotId) {
  const snapshot = getSnapshot(studentId, snapshotId);
  const today = todayIso();
  const snapshotDate = snapshot.created_at.slice(0, 10);

  const subjects = getDb().prepare('SELECT id, name, colour, code FROM subject WHERE student_id = ?').all(studentId);

  const doneSince = getDb()
    .prepare(
      `SELECT s.id AS subject_id, SUM(pi.minutes_logged) AS minutes
       FROM practice_item pi
       JOIN topic t ON t.id = pi.topic_id
       JOIN subject s ON s.id = t.subject_id
       WHERE s.student_id = ? AND pi.status = 'done' AND pi.completed_at >= ?
       GROUP BY s.id`
    )
    .all(studentId, snapshotDate);
  const doneById = Object.fromEntries(doneSince.map((row) => [row.subject_id, row.minutes ?? 0]));

  const daysElapsed = Math.max(daysBetween(snapshotDate, today), 0);
  const daysTotal = snapshot.cover_by_date ? daysBetween(snapshotDate, snapshot.cover_by_date) : null;

  const rows = subjects
    .map((subject) => {
      const pendingAtSnapshot = snapshot.pending_minutes_by_subject[subject.id] ?? 0;
      if (pendingAtSnapshot === 0) return null;

      const actualMinutes = doneById[subject.id] ?? 0;
      let expectedMinutes = null;
      let gapMinutes = null;
      if (daysTotal && daysTotal > 0) {
        const pacePerDay = pendingAtSnapshot / daysTotal;
        expectedMinutes = Math.round(Math.min(daysElapsed, daysTotal) * pacePerDay);
        gapMinutes = expectedMinutes - actualMinutes;
      }

      return {
        subject_id: subject.id,
        subject_name: subject.name,
        subject_colour: subject.colour,
        subject_code: subject.code,
        pending_at_snapshot: pendingAtSnapshot,
        actual_minutes: actualMinutes,
        expected_minutes: expectedMinutes,
        gap_minutes: gapMinutes,
      };
    })
    .filter(Boolean);

  return {
    snapshot: { id: snapshot.id, label: snapshot.label, created_at: snapshot.created_at, cover_by_date: snapshot.cover_by_date },
    days_elapsed: daysElapsed,
    days_total: daysTotal,
    subjects: rows,
  };
}
