import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { getDb } from './index.js';

/**
 * Applies every .sql file in db/migrations that has not run yet, in filename
 * order. Each file runs inside a transaction and is recorded in
 * schema_migrations, so running this repeatedly is safe.
 */
export function runMigrations({ silent = false } = {}) {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  fs.mkdirSync(config.migrationsDir, { recursive: true });

  const applied = new Set(
    db.prepare('SELECT name FROM schema_migrations').all().map((row) => row.name)
  );

  const pending = fs
    .readdirSync(config.migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .filter((name) => !applied.has(name));

  for (const name of pending) {
    const sql = fs.readFileSync(path.join(config.migrationsDir, name), 'utf8');

    // A table rebuild (drop + recreate, needed to widen a CHECK constraint)
    // can otherwise trigger foreign key actions meant for row-level deletes —
    // SQLite treats DROP TABLE as deleting every row for FK purposes, which
    // can CASCADE or SET NULL in tables that reference it, including a
    // freshly-copied replacement table that references it by the same name.
    // Foreign keys can't be toggled inside a transaction, so this happens
    // around it, exactly as SQLite's own rebuild procedure recommends.
    db.pragma('foreign_keys = OFF');
    const apply = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(name);
    });
    apply();
    db.pragma('foreign_keys = ON');

    const violations = db.pragma('foreign_key_check');
    if (violations.length > 0) {
      throw new Error(
        `Migration ${name} left dangling foreign keys: ${JSON.stringify(violations)}`
      );
    }

    if (!silent) console.log(`  ✓ migration applied: ${name}`);
  }

  if (!silent && pending.length === 0) console.log('  ✓ database already up to date');

  return pending;
}

// Allow `npm run db:migrate` to run this file directly.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  console.log('Running migrations…');
  runMigrations();
  console.log('Done.');
}
