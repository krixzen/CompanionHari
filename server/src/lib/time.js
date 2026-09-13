/**
 * Dates are 'YYYY-MM-DD' strings and times are 'HH:MM' strings everywhere in
 * this app, so they sort and compare correctly in SQLite. These helpers move
 * between those strings and plain numbers, and never touch time zones: a
 * school timetable is local by definition.
 */

export const MINUTES_IN_DAY = 24 * 60;

/** '07:30' -> 450 */
export function toMinutes(time) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time).trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** 450 -> '07:30' */
export function toTime(minutes) {
  const clamped = Math.max(0, Math.min(MINUTES_IN_DAY, Math.round(minutes)));
  const hours = Math.floor(clamped / 60);
  return `${String(hours).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

export const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value));

/** 0 = Monday, matching the day_of_week column. */
export function dayOfWeek(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

export function addDays(isoDate, days) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Every date from `from` to `to`, inclusive. */
export function datesBetween(from, to) {
  const dates = [];
  let cursor = from;
  // A guard rail rather than a real limit: a year of days is plenty.
  for (let index = 0; index < 400 && cursor <= to; index += 1) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

/** The Monday of the week containing this date. */
export function startOfWeek(isoDate) {
  return addDays(isoDate, -dayOfWeek(isoDate));
}

export function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
}

/**
 * Merges overlapping or touching [start, end) minute ranges into the smallest
 * set that covers the same time.
 */
export function mergeRanges(ranges) {
  const sorted = [...ranges].filter((r) => r.end > r.start).sort((a, b) => a.start - b.start);
  const merged = [];

  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ start: range.start, end: range.end });
  }
  return merged;
}

/** The parts of [windowStart, windowEnd) that `busy` does not cover. */
export function freeRanges(windowStart, windowEnd, busy) {
  const gaps = [];
  let cursor = windowStart;

  for (const range of mergeRanges(busy)) {
    if (range.end <= windowStart || range.start >= windowEnd) continue;
    if (range.start > cursor) gaps.push({ start: cursor, end: Math.min(range.start, windowEnd) });
    cursor = Math.max(cursor, range.end);
    if (cursor >= windowEnd) break;
  }
  if (cursor < windowEnd) gaps.push({ start: cursor, end: windowEnd });

  return gaps.filter((gap) => gap.end > gap.start);
}
