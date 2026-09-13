-- A week template is a whole named Monday-to-Sunday pattern (a "Regular
-- week", an "Exam week", ...) that can be swapped in wholesale for specific
-- calendar weeks, instead of editing individual commitments by hand.
CREATE TABLE week_template (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Only one default template per student — the pattern every week uses
-- unless that week has been explicitly assigned another one.
CREATE UNIQUE INDEX idx_week_template_one_default
  ON week_template (student_id)
  WHERE is_default = 1;

CREATE TABLE week_template_block (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL REFERENCES week_template(id) ON DELETE CASCADE,
  label       TEXT    NOT NULL,
  type        TEXT    NOT NULL DEFAULT 'other'
              CHECK (type IN ('school','coaching','sport','meal','family','sleep','exam','other')),
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time  TEXT    NOT NULL,
  end_time    TEXT    NOT NULL,
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_week_template_block_template ON week_template_block (template_id, day_of_week);

-- Which template governs a given calendar week (1-52, counted from the
-- term's start date). A week with no row here uses the default template.
CREATE TABLE week_assignment (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  INTEGER NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL CHECK (week_number BETWEEN 1 AND 52),
  template_id INTEGER NOT NULL REFERENCES week_template(id) ON DELETE CASCADE,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_week_assignment_week ON week_assignment (student_id, week_number);

-- Every existing commitment that ran every week becomes the "Regular week"
-- default template, so nobody's timetable changes the moment this ships.
-- Anything already scoped to specific weeks (an exam already added, say)
-- is left in place in `anchor` — that table is now the "something extra on
-- top" layer, unaffected by whichever template governs the week underneath.
INSERT INTO week_template (student_id, name, is_default)
SELECT id, 'Regular week', 1 FROM student;

INSERT INTO week_template_block (template_id, label, type, day_of_week, start_time, end_time, is_active)
SELECT wt.id, a.label, a.type, a.day_of_week, a.start_time, a.end_time, a.is_active
FROM anchor a
JOIN week_template wt ON wt.student_id = a.student_id AND wt.is_default = 1
WHERE a.effective_from IS NULL;

DELETE FROM anchor WHERE effective_from IS NULL;
