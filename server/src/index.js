import { createApp } from './app.js';
import { config } from './config.js';
import { runMigrations } from './db/migrate.js';
import { ensureSeedData } from './db/seed.js';
import { backfillMasterLists } from './services/practiceItemService.js';

console.log('Preparing database…');
runMigrations();
ensureSeedData();
// Cheap and idempotent — only ever inserts the rows a topic is missing.
backfillMasterLists();

const app = createApp();

app.listen(config.port, () => {
  console.log(`Study Planner API listening on http://localhost:${config.port}`);
});
