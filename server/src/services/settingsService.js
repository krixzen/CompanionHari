import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { getDb } from '../db/index.js';
import { badRequest } from '../lib/httpError.js';
import { isIsoDate, startOfWeek, toMinutes, todayIso } from '../lib/time.js';

const PLANNER_KEY = 'planner';
const TERM_KEY = 'term';
const AI_KEY = 'ai';

/**
 * How the automatic planner behaves. The defaults describe an ordinary school
 * day with room to breathe: nothing before six, nothing after ten, a short
 * break between blocks and a cap so no single day turns into a marathon.
 */
export const PLANNER_DEFAULTS = {
  day_start: '06:00',
  day_end: '22:00',
  break_minutes: 10,
  daily_max_minutes: 240,
  revision_enabled: true,
  revision_min_minutes: 15,
  revision_max_minutes: 45,
};

export function getPlannerSettings() {
  const row = getDb().prepare('SELECT value FROM setting WHERE key = ?').get(PLANNER_KEY);
  if (!row) return { ...PLANNER_DEFAULTS };

  try {
    return { ...PLANNER_DEFAULTS, ...JSON.parse(row.value) };
  } catch {
    // A hand-edited or corrupted value should never stop the app booting.
    return { ...PLANNER_DEFAULTS };
  }
}

const TIME_FIELDS = ['day_start', 'day_end'];
const NUMBER_FIELDS = {
  break_minutes: { min: 0, max: 60 },
  daily_max_minutes: { min: 30, max: 16 * 60 },
  revision_min_minutes: { min: 5, max: 120 },
  revision_max_minutes: { min: 5, max: 180 },
};

export function savePlannerSettings(changes) {
  const next = { ...getPlannerSettings() };

  for (const field of TIME_FIELDS) {
    if (changes[field] === undefined) continue;
    if (toMinutes(changes[field]) === null) {
      throw badRequest(`"${field}" must be a time like 07:30.`);
    }
    next[field] = changes[field];
  }

  for (const [field, bounds] of Object.entries(NUMBER_FIELDS)) {
    if (changes[field] === undefined) continue;
    const value = Number(changes[field]);
    if (!Number.isInteger(value) || value < bounds.min || value > bounds.max) {
      throw badRequest(`"${field}" must be a whole number between ${bounds.min} and ${bounds.max}.`);
    }
    next[field] = value;
  }

  if (changes.revision_enabled !== undefined) {
    next.revision_enabled = Boolean(changes.revision_enabled);
  }

  if (toMinutes(next.day_end) - toMinutes(next.day_start) < 60) {
    throw badRequest('The day needs to be at least an hour long — check the start and end times.');
  }
  if (next.revision_max_minutes < next.revision_min_minutes) {
    throw badRequest('The longest revision block cannot be shorter than the shortest one.');
  }

  getDb()
    .prepare(
      `INSERT INTO setting (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .run(PLANNER_KEY, JSON.stringify(next));

  return next;
}

const TERM_DEFAULTS = { exam_date: null, cover_by_date: null };

/**
 * When "Week 1" begins, so that a fixed commitment can be scoped to a
 * specific week ("Week 14 only") rather than repeating forever. Defaults to
 * the Monday of the current week, purely so the feature is usable the moment
 * it's opened — the student is expected to correct it to their actual term
 * start once, after which it sticks.
 *
 * `exam_date` and `cover_by_date` are optional and both null until set: the
 * exam itself, and the date by which every topic should have had its first
 * pass, so whatever plans a schedule can tell a coverage push from a
 * revision-and-consolidation stretch.
 */
export function getTermSettings() {
  const row = getDb().prepare('SELECT value FROM setting WHERE key = ?').get(TERM_KEY);
  if (!row) return { start_date: startOfWeek(todayIso()), ...TERM_DEFAULTS };

  try {
    const parsed = JSON.parse(row.value);
    return {
      start_date: parsed.start_date || startOfWeek(todayIso()),
      exam_date: parsed.exam_date ?? null,
      cover_by_date: parsed.cover_by_date ?? null,
    };
  } catch {
    return { start_date: startOfWeek(todayIso()), ...TERM_DEFAULTS };
  }
}

/** Every field is optional here — only what's provided is changed. */
export function saveTermSettings(changes) {
  const next = { ...getTermSettings() };
  const isDateOrNull = (value) => value === null || isIsoDate(value);

  if (changes.start_date !== undefined) {
    if (!isIsoDate(changes.start_date)) {
      throw badRequest('The term start date should look like 2026-06-01.');
    }
    next.start_date = changes.start_date;
  }

  if (changes.exam_date !== undefined) {
    if (!isDateOrNull(changes.exam_date)) throw badRequest('The exam date should look like 2027-03-27.');
    next.exam_date = changes.exam_date;
  }

  if (changes.cover_by_date !== undefined) {
    if (!isDateOrNull(changes.cover_by_date)) {
      throw badRequest('The "cover everything by" date should look like 2027-01-31.');
    }
    next.cover_by_date = changes.cover_by_date;
  }

  if (next.cover_by_date && next.exam_date && next.cover_by_date > next.exam_date) {
    throw badRequest('The coverage deadline has to be on or before the exam date.');
  }

  getDb()
    .prepare(
      `INSERT INTO setting (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .run(TERM_KEY, JSON.stringify(next));

  return next;
}

const AI_DEFAULTS = { model: 'claude-sonnet-5', api_key: null, pin_hash: null, pin_salt: null };

function readAiRecord() {
  const row = getDb().prepare('SELECT value FROM setting WHERE key = ?').get(AI_KEY);
  if (!row) return { ...AI_DEFAULTS };
  try {
    return { ...AI_DEFAULTS, ...JSON.parse(row.value) };
  } catch {
    return { ...AI_DEFAULTS };
  }
}

function hashPin(pin, salt) {
  return scryptSync(pin, salt, 32).toString('hex');
}

/**
 * The API key and the PIN's own hash are never handed back to the client
 * once saved — only whether each is set. The key only ever leaves this
 * machine in the one request that actually calls the AI service.
 */
export function getAiSettings() {
  const record = readAiRecord();
  return { model: record.model, has_key: Boolean(record.api_key), has_pin: Boolean(record.pin_hash) };
}

export function getAiApiKey() {
  return readAiRecord().api_key;
}

export function getAiModel() {
  return readAiRecord().model;
}

/**
 * A PIN is optional — most households running this locally have no reason
 * for one. When it is set, it exists to stop the student from firing off
 * paid API calls on their own; it is checked here, server-side, on every
 * automatic-planning request, not just prompted for in the UI, so it can't
 * be skipped by calling the endpoint directly.
 */
export function verifyAiPin(pin) {
  const record = readAiRecord();
  if (!record.pin_hash) return true;
  if (!pin) return false;
  const candidate = Buffer.from(hashPin(String(pin), record.pin_salt), 'hex');
  const expected = Buffer.from(record.pin_hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function saveAiSettings(changes) {
  const next = readAiRecord();

  if (changes.api_key !== undefined) {
    const trimmed = String(changes.api_key ?? '').trim();
    next.api_key = trimmed || null;
  }

  if (changes.model !== undefined) {
    const trimmed = String(changes.model ?? '').trim();
    if (!trimmed) throw badRequest('Pick a model name.');
    next.model = trimmed;
  }

  if (changes.pin !== undefined) {
    const trimmed = String(changes.pin ?? '').trim();
    if (!trimmed) {
      next.pin_hash = null;
      next.pin_salt = null;
    } else {
      if (!/^\d{4,8}$/.test(trimmed)) throw badRequest('The PIN should be 4 to 8 digits.');
      const salt = randomBytes(16).toString('hex');
      next.pin_hash = hashPin(trimmed, salt);
      next.pin_salt = salt;
    }
  }

  getDb()
    .prepare(
      `INSERT INTO setting (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .run(AI_KEY, JSON.stringify(next));

  return { model: next.model, has_key: Boolean(next.api_key), has_pin: Boolean(next.pin_hash) };
}
