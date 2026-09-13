-- Phase 2: what the timetable needs on top of the Phase 1 model.

-- Revision blocks belong to the study block that created them, so moving or
-- deleting the study block can take its revisions with it.
ALTER TABLE plan_entry ADD COLUMN parent_entry_id INTEGER
  REFERENCES plan_entry(id) ON DELETE CASCADE;

CREATE INDEX idx_plan_entry_parent ON plan_entry (parent_entry_id);

-- A small key/value store for preferences. The planner keeps its settings
-- under the key 'planner'; later phases can add their own keys without a
-- migration.
CREATE TABLE setting (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,          -- JSON
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
