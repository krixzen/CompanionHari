import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config.js';

let db;

/**
 * Opens (and creates, on first run) the SQLite file and returns a shared
 * connection. better-sqlite3 is synchronous, which keeps route handlers simple.
 */
export function getDb() {
  if (db) return db;

  fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
  db = new Database(config.databasePath);

  // WAL keeps reads fast while a write is in flight; foreign keys must be
  // switched on explicitly in SQLite.
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = undefined;
  }
}
