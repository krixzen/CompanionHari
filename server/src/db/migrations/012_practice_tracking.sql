-- Three pieces of practice-methodology tracking, layered on top of the
-- existing study/practice/revision schedule rather than replacing any of
-- it:
--
-- 1. Every chapter (topic) moves through a five-stage practice cycle
--    (NCERT examples, NCERT exercises, an external module, previous-year
--    questions, timed sets) independently of its study status.
-- 2. A plain running tally against a per-chapter question-count goal —
--    targets vary a lot by subject (and even by type within a subject),
--    so both numbers are simple editable fields rather than derived.
ALTER TABLE topic ADD COLUMN practice_stage INTEGER NOT NULL DEFAULT 1;
ALTER TABLE topic ADD COLUMN question_target INTEGER;
ALTER TABLE topic ADD COLUMN questions_done INTEGER NOT NULL DEFAULT 0;

-- 3. The error notebook: one row per wrong question, tagged with why it
-- went wrong (concept gap, application gap, silly slip, or time) and a
-- re-do date to attempt it again from scratch.
CREATE TABLE error_note (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id    INTEGER NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  subject_id    INTEGER NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
  topic_id      INTEGER REFERENCES topic(id) ON DELETE SET NULL,
  source        TEXT NOT NULL,
  tag           TEXT NOT NULL CHECK (tag IN ('C','A','S','T')),
  mistake       TEXT,
  correct_idea  TEXT,
  redo_date     TEXT NOT NULL,
  redone        INTEGER NOT NULL DEFAULT 0 CHECK (redone IN (0,1)),
  redone_at     TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_error_note_student ON error_note (student_id, redo_date);
CREATE INDEX idx_error_note_subject ON error_note (subject_id);
