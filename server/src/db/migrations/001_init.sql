-- Phase 1: the complete data model.
--
-- Later phases fill these tables in; they are all created now so the schema
-- never has to be re-architected. Dates are stored as ISO 'YYYY-MM-DD' text
-- and times as 'HH:MM', which SQLite sorts and compares correctly as strings.
-- Columns documented as JSON hold a JSON string validated by the server.

CREATE TABLE student (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  class      TEXT,
  stream     TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Fixed weekly commitments that the Phase 2 timetable has to plan around.
CREATE TABLE anchor (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  INTEGER NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  label       TEXT    NOT NULL,
  type        TEXT    NOT NULL DEFAULT 'other'
              CHECK (type IN ('school','coaching','sport','meal','family','sleep','other')),
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0 = Monday
  start_time  TEXT    NOT NULL,
  end_time    TEXT    NOT NULL,
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE subject (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id    INTEGER NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  name          TEXT    NOT NULL,
  -- Short prefix used to build topic tracking numbers, e.g. 'PHY' -> PHY-001.
  code          TEXT    NOT NULL,
  colour        TEXT    NOT NULL DEFAULT '#4f8a73',
  display_order INTEGER NOT NULL DEFAULT 0,
  -- Counts up forever so a deleted topic's tracking number is never handed
  -- out again: PHY-012 always means the same topic it meant in September.
  next_topic_number INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_subject_code_per_student ON subject (student_id, code);
CREATE INDEX idx_subject_student ON subject (student_id, display_order);

CREATE TABLE topic (
  id                         INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id                 INTEGER NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
  tracking_number            TEXT    NOT NULL UNIQUE,
  title                      TEXT    NOT NULL,
  -- Unit / chapter this topic sits under in the syllabus, when the file had one.
  unit                       TEXT,
  sub_topics                 TEXT    NOT NULL DEFAULT '[]',  -- JSON array of strings
  key_concepts               TEXT,                            -- filled in Phase 4
  allocated_duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (allocated_duration_minutes > 0),
  estimated_hours            REAL,
  difficulty                 INTEGER NOT NULL DEFAULT 3 CHECK (difficulty BETWEEN 1 AND 5),
  status                     TEXT    NOT NULL DEFAULT 'not_started'
                             CHECK (status IN ('not_started','in_progress','revised','mastered')),
  target_date                TEXT,
  display_order              INTEGER NOT NULL DEFAULT 0,
  notes                      TEXT,
  resources                  TEXT    NOT NULL DEFAULT '[]',  -- JSON, filled in Phase 4
  created_at                 TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at                 TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_topic_subject ON topic (subject_id, display_order);
CREATE INDEX idx_topic_status ON topic (status);

-- Phase 3: what actually happened, as opposed to what was planned.
CREATE TABLE study_session (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id         INTEGER NOT NULL REFERENCES topic(id) ON DELETE CASCADE,
  date             TEXT    NOT NULL,
  minutes_spent    INTEGER NOT NULL DEFAULT 0 CHECK (minutes_spent >= 0),
  confidence_score INTEGER CHECK (confidence_score BETWEEN 1 AND 5),
  notes            TEXT,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_study_session_topic ON study_session (topic_id, date);

-- Phase 2: the timetable itself.
CREATE TABLE plan_entry (
  id                         INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id                   INTEGER NOT NULL REFERENCES topic(id) ON DELETE CASCADE,
  scheduled_date             TEXT    NOT NULL,
  scheduled_start_time       TEXT,
  scheduled_duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (scheduled_duration_minutes > 0),
  entry_type                 TEXT    NOT NULL DEFAULT 'study'
                             CHECK (entry_type IN ('study','revision')),
  revision_interval          TEXT    CHECK (revision_interval IN ('1day','3day','1week')),
  completed                  INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0,1)),
  created_at                 TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_plan_entry_date ON plan_entry (scheduled_date);
CREATE INDEX idx_plan_entry_topic ON plan_entry (topic_id);

-- Phase 4: tests and their per-question breakdown.
CREATE TABLE test (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id     INTEGER NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  test_name      TEXT    NOT NULL,
  test_date      TEXT,
  source         TEXT,
  total_marks    REAL,
  marks_obtained REAL,
  notes          TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_test_student ON test (student_id, test_date);

CREATE TABLE test_result (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id           INTEGER NOT NULL REFERENCES test(id) ON DELETE CASCADE,
  subject_id        INTEGER REFERENCES subject(id) ON DELETE SET NULL,
  topic_id          INTEGER REFERENCES topic(id) ON DELETE SET NULL,
  question_number   INTEGER,
  attempted         INTEGER NOT NULL DEFAULT 0 CHECK (attempted IN (0,1)),
  correct           INTEGER NOT NULL DEFAULT 0 CHECK (correct IN (0,1)),
  marks             REAL,
  time_taken_seconds INTEGER
);

CREATE INDEX idx_test_result_test ON test_result (test_id, question_number);
CREATE INDEX idx_test_result_topic ON test_result (topic_id);

-- Phase 4: whatever the LLM Bridge brings back, kept verbatim as JSON.
CREATE TABLE analysis (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id    INTEGER NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  test_id       INTEGER REFERENCES test(id) ON DELETE SET NULL,
  analysis_type TEXT    NOT NULL
                CHECK (analysis_type IN ('test_pattern','weekly_action_plan')),
  payload       TEXT    NOT NULL DEFAULT '{}',  -- JSON
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_analysis_student ON analysis (student_id, created_at);
