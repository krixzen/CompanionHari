-- Real commitments away from home carry a trip home with them — school lets
-- out, but nothing is actually free until the walk or drive back is done
-- too. An optional buffer after a commitment lets the scheduler (and the
-- AI-scheduling prompt) treat that travel time as spoken for, without
-- inventing a separate visible calendar block for it.
ALTER TABLE anchor ADD COLUMN buffer_after_minutes INTEGER;
ALTER TABLE week_template_block ADD COLUMN buffer_after_minutes INTEGER;
