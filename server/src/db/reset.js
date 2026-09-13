import fs from 'node:fs';
import { config } from '../config.js';
import { closeDb } from './index.js';
import { runMigrations } from './migrate.js';

/**
 * Deletes the SQLite file and rebuilds it from the migrations. Destructive —
 * only meant for development when the schema has moved on.
 */
closeDb();
for (const suffix of ['', '-wal', '-shm']) {
  const file = `${config.databasePath}${suffix}`;
  if (fs.existsSync(file)) fs.rmSync(file);
}
console.log(`Removed ${config.databasePath}`);
runMigrations();
console.log('Fresh database ready.');
