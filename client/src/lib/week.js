/**
 * Date arithmetic for the calendar. Mirrors server/src/lib/time.js so the two
 * halves of the app agree on what a week is: 'YYYY-MM-DD' strings, times as
 * minutes from midnight, and Monday as the first day.
 */

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function toMinutes(time) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time ?? '').trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function toTime(minutes) {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(minutes)));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

/** '16:30' -> '4:30 pm' — friendlier to read at a glance. */
export function friendlyTime(time) {
  const minutes = toMinutes(time);
  if (minutes === null) return time;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const suffix = hours < 12 ? 'am' : 'pm';
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return rest === 0 ? `${display}${suffix}` : `${display}:${String(rest).padStart(2, '0')}${suffix}`;
}

export function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
}

export function addDays(isoDate, days) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

/** 0 = Monday. */
export function dayOfWeek(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return (new Date(year, month - 1, day).getDay() + 6) % 7;
}

export function startOfWeek(isoDate) {
  return addDays(isoDate, -dayOfWeek(isoDate));
}

export function weekDates(mondayIso) {
  return Array.from({ length: 7 }, (_, index) => addDays(mondayIso, index));
}

export function dayNumber(isoDate) {
  return Number(isoDate.split('-')[2]);
}

/** "14 – 20 September 2026", collapsing the month when both ends share one. */
export function describeWeek(mondayIso) {
  const sunday = addDays(mondayIso, 6);
  const [, startMonth] = mondayIso.split('-').map(Number);
  const [, endMonth] = sunday.split('-').map(Number);

  const asDate = (iso) => {
    const [year, month, day] = iso.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  const month = (iso) => asDate(iso).toLocaleDateString(undefined, { month: 'long' });
  const year = asDate(sunday).getFullYear();

  return startMonth === endMonth
    ? `${dayNumber(mondayIso)} – ${dayNumber(sunday)} ${month(sunday)} ${year}`
    : `${dayNumber(mondayIso)} ${month(mondayIso)} – ${dayNumber(sunday)} ${month(sunday)} ${year}`;
}

export function longDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/** "in 3 days", "tomorrow", "today" — used to keep the tone conversational. */
export function relativeDay(isoDate, from = todayIso()) {
  const diff = Math.round(
    (new Date(`${isoDate}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000
  );
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  if (diff > 1 && diff < 7) return `in ${diff} days`;
  if (diff < -1 && diff > -7) return `${Math.abs(diff)} days ago`;
  return null;
}
