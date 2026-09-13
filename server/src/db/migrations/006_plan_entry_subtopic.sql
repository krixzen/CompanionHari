-- Lets a plan entry point at one specific sub-topic within its topic,
-- rather than always standing for the whole thing — needed so an
-- assistant-proposed schedule can book "PHY-001/02" instead of only
-- ever "PHY-001". Null means the entry covers the whole topic, exactly
-- as every entry did before this column existed.
ALTER TABLE plan_entry ADD COLUMN sub_topic_index INTEGER;
