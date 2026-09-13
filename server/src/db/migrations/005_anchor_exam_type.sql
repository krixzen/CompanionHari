-- Adds 'exam' as a recognised commitment type. SQLite bakes CHECK
-- constraints into the table definition, so widening one means rebuilding
-- the table: create it with the new constraint, copy every row across
-- (including the effective_from/until columns from migration 004), then
-- swap it in under the old name.
CREATE TABLE anchor_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  INTEGER NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  label       TEXT    NOT NULL,
  type        TEXT    NOT NULL DEFAULT 'other'
              CHECK (type IN ('school','coaching','sport','meal','family','sleep','exam','other')),
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time  TEXT    NOT NULL,
  end_time    TEXT    NOT NULL,
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  effective_from  TEXT,
  effective_until TEXT
);

INSERT INTO anchor_new
  (id, student_id, label, type, day_of_week, start_time, end_time, is_active,
   created_at, effective_from, effective_until)
SELECT
  id, student_id, label, type, day_of_week, start_time, end_time, is_active,
  created_at, effective_from, effective_until
FROM anchor;

DROP TABLE anchor;
ALTER TABLE anchor_new RENAME TO anchor;

CREATE INDEX idx_anchor_effective ON anchor (effective_from, effective_until);
