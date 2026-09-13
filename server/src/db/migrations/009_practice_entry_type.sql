-- Widens plan_entry.entry_type to add 'practice' — a session spent working
-- problems on material already studied, distinct from the first pass
-- ('study') and the automatic spaced-recall follow-ups ('revision'). SQLite
-- bakes CHECK constraints into the table definition, so this needs a full
-- rebuild rather than a plain ALTER.
CREATE TABLE plan_entry_new (
  id                         INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id                   INTEGER NOT NULL REFERENCES topic(id) ON DELETE CASCADE,
  scheduled_date             TEXT    NOT NULL,
  scheduled_start_time       TEXT,
  scheduled_duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (scheduled_duration_minutes > 0),
  entry_type                 TEXT    NOT NULL DEFAULT 'study'
                             CHECK (entry_type IN ('study','practice','revision')),
  revision_interval          TEXT    CHECK (revision_interval IN ('1day','3day','1week')),
  completed                  INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0,1)),
  created_at                 TEXT    NOT NULL DEFAULT (datetime('now')),
  parent_entry_id            INTEGER REFERENCES plan_entry(id) ON DELETE CASCADE,
  sub_topic_index            INTEGER
);

INSERT INTO plan_entry_new
  (id, topic_id, scheduled_date, scheduled_start_time, scheduled_duration_minutes,
   entry_type, revision_interval, completed, created_at, parent_entry_id, sub_topic_index)
SELECT id, topic_id, scheduled_date, scheduled_start_time, scheduled_duration_minutes,
       entry_type, revision_interval, completed, created_at, parent_entry_id, sub_topic_index
FROM plan_entry;

DROP TABLE plan_entry;
ALTER TABLE plan_entry_new RENAME TO plan_entry;

CREATE INDEX idx_plan_entry_date ON plan_entry (scheduled_date);
CREATE INDEX idx_plan_entry_topic ON plan_entry (topic_id);
CREATE INDEX idx_plan_entry_parent ON plan_entry (parent_entry_id);
