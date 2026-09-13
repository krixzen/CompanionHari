export const STATUS_LABELS = {
  not_started: 'Not started',
  in_progress: 'Learning',
  revised: 'Revised',
  mastered: 'Confident',
};

export const STATUS_ORDER = ['not_started', 'in_progress', 'revised', 'mastered'];

export const STATUS_STYLES = {
  not_started: 'bg-paper-sunk text-ink-soft',
  in_progress: 'bg-amber-50 text-amber-800',
  revised: 'bg-sky-50 text-sky-800',
  mastered: 'bg-sage-100 text-sage-800',
};

export const DIFFICULTY_LABELS = {
  1: 'Gentle',
  2: 'Light',
  3: 'Steady',
  4: 'Tough',
  5: 'Demanding',
};

/** 90 -> "1h 30m", 45 -> "45m", 120 -> "2h" */
export function formatMinutes(minutes) {
  const total = Number(minutes) || 0;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (!hours) return `${rest}m`;
  if (!rest) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

/** "2026-10-01" -> "1 Oct 2026" */
export function formatDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function greeting(hour = new Date().getHours()) {
  if (hour < 5) return 'Still up';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * An encouraging line about progress. Never scolds, never mentions what is
 * left undone as a failure.
 */
export function progressMessage({ total, started, mastered }) {
  if (!total) return 'Nothing mapped out yet — that is exactly where everyone starts.';
  if (mastered === total) return `Every one of your ${total} topics is in good shape. That is quite something.`;

  // "started" counts everything past not_started, mastered topics included.
  const underway = Math.max(started - mastered, 0);

  if (mastered > 0) {
    const feel = mastered === 1 ? 'feels' : 'feel';
    if (underway === 0) return `${mastered} of ${total} topics already ${feel} solid.`;
    return `${mastered} of ${total} topics ${feel} solid, and ${underway} more ${
      underway === 1 ? 'is' : 'are'
    } underway.`;
  }
  if (underway > 0) {
    return `${underway} of ${total} topics ${
      underway === 1 ? 'is' : 'are'
    } underway. Momentum counts more than speed.`;
  }
  return `${total} topics are mapped out and waiting. One is enough to begin.`;
}
