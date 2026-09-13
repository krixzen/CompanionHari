import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const SERVER_ROOT = path.resolve(here, '..');

export const config = {
  port: Number(process.env.PORT) || 4000,
  // The SQLite file lives on disk inside the project so nothing is ever lost
  // when a browser cache is cleared.
  databasePath: process.env.DATABASE_PATH || path.join(SERVER_ROOT, 'data', 'study-planner.db'),
  migrationsDir: path.join(here, 'db', 'migrations'),
};
