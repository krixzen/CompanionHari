-- A second layer underneath the study/practice/revision schedule: once
-- school, coaching, meals and travel are accounted for, the student agrees
-- — once — which stretches of an ordinary week are actually for studying.
-- Subject scheduling (both "Plan my week" and the AI-scheduling prompt)
-- then only ever places blocks inside these windows.
--
-- Deliberately simpler than week templates: no per-week scoping and no
-- alternate patterns, just one set of weekday windows the student is
-- trusted to update if their week genuinely changes shape.
CREATE TABLE study_block (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  INTEGER NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time  TEXT    NOT NULL,
  end_time    TEXT    NOT NULL,
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_study_block_student ON study_block (student_id, day_of_week);
