import { createApp } from './app.js';
import { config } from './config.js';
import { runMigrations } from './db/migrate.js';

console.log('Preparing database…');
runMigrations();

const app = createApp();

app.listen(config.port, () => {
  console.log(`Study Planner API listening on http://localhost:${config.port}`);
});
