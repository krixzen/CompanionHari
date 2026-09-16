-- Replaces the single "current stage" pointer and the plain question
-- tally (migration 012) with a real master list: one row per chapter per
-- stage of the five-stage practice cycle, each independently trackable.
-- Every topic gets its five rows generated automatically.
ALTER TABLE topic DROP COLUMN practice_stage;
ALTER TABLE topic DROP COLUMN question_target;
ALTER TABLE topic DROP COLUMN questions_done;

CREATE TABLE practice_item (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id           INTEGER NOT NULL REFERENCES topic(id) ON DELETE CASCADE,
  stage              INTEGER NOT NULL CHECK (stage BETWEEN 1 AND 5),
  label              TEXT NOT NULL,
  estimated_minutes  INTEGER NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'done')),
  minutes_logged     INTEGER NOT NULL DEFAULT 0,
  completed_at       TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (topic_id, stage)
);

CREATE INDEX idx_practice_item_topic ON practice_item (topic_id);
CREATE INDEX idx_practice_item_status ON practice_item (status);

-- A scheduled block can point at the master-list item it's for, so
-- ticking it off marks that item done and logs the time against it —
-- separately from the older topic-level study/practice/revision entries,
-- which keep working exactly as before (this column is nullable).
ALTER TABLE plan_entry ADD COLUMN practice_item_id INTEGER REFERENCES practice_item(id) ON DELETE SET NULL;
CREATE INDEX idx_plan_entry_practice_item ON plan_entry (practice_item_id);

-- A frozen baseline: how much pending work existed, per subject, at the
-- moment the plan was saved, plus the coverage deadline in effect then —
-- so "behind schedule by X" can be computed later against a stable
-- reference rather than a plan that's since moved.
CREATE TABLE schedule_snapshot (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id                  INTEGER NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  label                       TEXT NOT NULL,
  pending_minutes_by_subject  TEXT NOT NULL, -- JSON: { "<subject_id>": minutes }
  cover_by_date               TEXT,
  created_at                  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_schedule_snapshot_student ON schedule_snapshot (student_id, created_at);
