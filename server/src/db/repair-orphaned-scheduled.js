import { getDb } from './index.js';

/**
 * One-time repair for a bug in clearRange (the "Clear unfinished" action):
 * it deleted the calendar bookings for a stretch but never put the
 * master-list items behind them back in the backlog, the way removing a
 * single booking always has. Anything left stuck on "scheduled" with no
 * booking actually pointing at it any more is exactly that — put it back
 * to "pending" so it's schedulable again. A stage that's genuinely booked
 * (a real plan_entry still points at it) or already done is left alone.
 */
const db = getDb();

const orphaned = db
  .prepare(
    `SELECT p.id, t.tracking_number, p.stage FROM practice_item p
     JOIN topic t ON t.id = p.topic_id
     WHERE p.status = 'scheduled'
       AND p.id NOT IN (SELECT practice_item_id FROM plan_entry WHERE practice_item_id IS NOT NULL)`
  )
  .all();

if (orphaned.length === 0) {
  console.log('Nothing to repair — no orphaned "scheduled" items found.');
} else {
  const revert = db.prepare(`UPDATE practice_item SET status = 'pending', minutes_logged = 0 WHERE id = ?`);
  db.transaction(() => orphaned.forEach((item) => revert.run(item.id)))();
  console.log(`Repaired ${orphaned.length} item(s), put back in the backlog:`);
  for (const item of orphaned) {
    console.log(`  ${item.tracking_number}/S${item.stage}`);
  }
}
