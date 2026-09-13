-- Phase 3: recording what actually happened, and a colour-safety fix.

-- A session usually comes from ticking a block off, and knowing which block
-- lets un-ticking it take the session away again. Sessions logged off-plan
-- leave this null, and deleting a block keeps the session that came from it.
ALTER TABLE study_session ADD COLUMN plan_entry_id INTEGER
  REFERENCES plan_entry(id) ON DELETE SET NULL;

CREATE INDEX idx_study_session_date_only ON study_session (date);
CREATE INDEX idx_study_session_plan_entry ON study_session (plan_entry_id);

-- The subject colours shipped in Phase 1 were picked by eye and fail a
-- colourblind-safety check: under deuteranopia the Mathematics and AI colours
-- were all but identical, and two more read as grey. The replacements are a
-- validated palette, assigned by position so that neighbouring subjects are
-- always distinguishable. Colours are re-assigned only where the subject still
-- has one of the old defaults.
UPDATE subject
SET colour = CASE display_order % 8
  WHEN 0 THEN '#3973bc'
  WHEN 1 THEN '#bb5e3b'
  WHEN 2 THEN '#009364'
  WHEN 3 THEN '#b27802'
  WHEN 4 THEN '#bc5c81'
  WHEN 5 THEN '#3a8035'
  WHEN 6 THEN '#5c57ab'
  ELSE '#b7544f'
END
WHERE colour IN (
  '#4f8a73', '#3f7fa8', '#7c6bb0', '#b05f7a', '#c07a3e',
  '#8a8f4f', '#5f8fb0', '#a0616a', '#6f7a8a', '#3d6f5c'
);
