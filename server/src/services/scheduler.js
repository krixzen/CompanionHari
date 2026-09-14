/**
 * The scheduling arithmetic, kept free of the database so it can be reasoned
 * about and tested on its own.
 *
 * Everything here works in minutes from midnight. The rule it follows is
 * deliberately simple and predictable: walk the topics in priority order and
 * drop each one into the first gap, on the earliest day, that it actually
 * fits. A student should be able to look at the result and see why it chose
 * what it chose.
 */

import { dayOfWeek, freeRanges, toMinutes } from '../lib/time.js';

const roundTo5 = (value) => Math.round(value / 5) * 5;

/** How long a revision block should be for a study block of `minutes`. */
export function revisionMinutes(minutes, settings) {
  const third = roundTo5(minutes / 3);
  return Math.min(
    Math.max(third, settings.revision_min_minutes),
    settings.revision_max_minutes,
    minutes
  );
}

/**
 * Builds a per-date picture of what is already spoken for: the active weekly
 * commitments for that weekday, plus anything already on the calendar.
 */
export function buildBusyMap(dates, anchors, entries, { entryPadding = 0 } = {}) {
  const byDay = new Map();
  for (const anchor of anchors) {
    if (!anchor.is_active) continue;
    const start = toMinutes(anchor.start_time);
    const rawEnd = toMinutes(anchor.end_time);
    if (start === null || rawEnd === null || rawEnd <= start) continue;
    // A commitment away from home isn't over the moment it ends — the trip
    // back takes a few minutes too, even though nothing on the calendar
    // names that time separately.
    const end = rawEnd + (Number(anchor.buffer_after_minutes) || 0);
    if (!byDay.has(anchor.day_of_week)) byDay.set(anchor.day_of_week, []);
    byDay.get(anchor.day_of_week).push({ start, end, from: anchor.effective_from, until: anchor.effective_until });
  }

  // A commitment scoped to specific weeks (an exam, a run of extra classes)
  // only counts on dates inside its own range — everything else applies as
  // it always has, on every matching weekday.
  const inRange = (date, range) =>
    (!range.from || date >= range.from) && (!range.until || date <= range.until);

  const busy = new Map();
  for (const date of dates) {
    const todaysAnchors = (byDay.get(dayOfWeek(date)) ?? []).filter((range) => inRange(date, range));
    busy.set(date, todaysAnchors.map(({ start, end }) => ({ start, end })));
  }

  for (const entry of entries) {
    if (!busy.has(entry.scheduled_date)) continue;
    const start = toMinutes(entry.scheduled_start_time);
    if (start === null) continue;
    busy.get(entry.scheduled_date).push({
      start,
      end: start + entry.scheduled_duration_minutes + entryPadding,
    });
  }

  return busy;
}

/** Minutes of study already booked on each date. */
export function buildLoadMap(dates, entries) {
  const load = new Map(dates.map((date) => [date, 0]));
  for (const entry of entries) {
    if (!load.has(entry.scheduled_date)) continue;
    load.set(entry.scheduled_date, load.get(entry.scheduled_date) + entry.scheduled_duration_minutes);
  }
  return load;
}

/**
 * The earliest start on this date where `minutes` fits, or null.
 * `busyRanges` is mutated to reserve the slot and the break after it.
 */
export function reserveSlot(busyRanges, minutes, settings) {
  const windowStart = toMinutes(settings.day_start);
  const windowEnd = toMinutes(settings.day_end);

  for (const gap of freeRanges(windowStart, windowEnd, busyRanges)) {
    if (gap.end - gap.start >= minutes) {
      busyRanges.push({ start: gap.start, end: gap.start + minutes + settings.break_minutes });
      return gap.start;
    }
  }
  return null;
}

/**
 * Places topics across a run of dates.
 *
 * Returns the study blocks it managed to place, and for anything left over,
 * a plain-English reason — a topic that does not fit is never dropped
 * silently.
 */
/**
 * How much of a day's study budget new material may use.
 *
 * Revision blocks are booked after the study blocks they follow, so without
 * this they would pile on top of a day that was already at its limit. Keeping
 * a quarter of the budget back means a day stays within its cap once the
 * revision that belongs to it arrives.
 */
function studyBudget(settings) {
  return settings.revision_enabled
    ? Math.round(settings.daily_max_minutes * 0.75)
    : settings.daily_max_minutes;
}

export function planTopics({ dates, anchors, existingEntries, topics, settings, notBefore }) {
  // A break belongs after every block, whether this run placed it or an
  // earlier one did.
  const busy = buildBusyMap(dates, anchors, existingEntries, {
    entryPadding: settings.break_minutes,
  });

  // Never schedule into hours that have already gone by today.
  if (notBefore && busy.has(notBefore.date)) {
    busy.get(notBefore.date).push({ start: 0, end: notBefore.minutes });
  }

  const load = buildLoadMap(dates, existingEntries);
  const budget = studyBudget(settings);
  const dayCapHours = Math.round((settings.daily_max_minutes / 60) * 10) / 10;

  const placements = [];
  const skipped = [];

  for (const topic of topics) {
    const minutes = topic.allocated_duration_minutes;

    if (minutes > budget) {
      skipped.push({
        topic,
        reason: `it is longer than a single day's study allows under the ${dayCapHours}-hour limit, so it needs splitting into shorter topics`,
      });
      continue;
    }

    let placed = false;
    let capBlockedEverywhere = true;

    for (const date of dates) {
      if (load.get(date) + minutes > budget) continue;
      capBlockedEverywhere = false;

      const start = reserveSlot(busy.get(date), minutes, settings);
      if (start === null) continue;

      placements.push({ topic, date, startMinutes: start, minutes });
      load.set(date, load.get(date) + minutes);
      placed = true;
      break;
    }

    if (!placed) {
      skipped.push({
        topic,
        reason: capBlockedEverywhere
          ? `every day in this stretch is already at its ${dayCapHours}-hour limit`
          : 'there was no free gap long enough for it',
      });
    }
  }

  // First-fit can put a later topic on an earlier day, so hand the result back
  // in the order it will actually be studied.
  placements.sort((a, b) =>
    a.date === b.date ? a.startMinutes - b.startMinutes : a.date < b.date ? -1 : 1
  );

  return { placements, skipped, busy };
}

/**
 * Finds homes for the three revision blocks that follow a study block, on the
 * days after it. A revision that will not fit is reported rather than forced.
 */
export const REVISION_OFFSETS = [
  { interval: '1day', days: 1 },
  { interval: '3day', days: 3 },
  { interval: '1week', days: 7 },
];
