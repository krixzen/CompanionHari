-- Lets a fixed commitment be scoped to specific weeks rather than applying
-- forever, so an exam week or a run of extra classes can be added without
-- disturbing the permanent weekly template.
--
-- Both null (the default for every existing row) means "every week, always".
-- When set, the commitment only counts on dates within [effective_from,
-- effective_until] inclusive.
ALTER TABLE anchor ADD COLUMN effective_from TEXT;
ALTER TABLE anchor ADD COLUMN effective_until TEXT;

CREATE INDEX idx_anchor_effective ON anchor (effective_from, effective_until);
