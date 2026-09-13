import { DIFFICULTY_LABELS } from '../lib/format.js';

export function DifficultyDots({ value }) {
  const level = Number(value) || 1;
  return (
    <span className="inline-flex items-center gap-1" title={DIFFICULTY_LABELS[level]}>
      <span className="sr-only">{`Difficulty ${level} of 5 — ${DIFFICULTY_LABELS[level]}`}</span>
      {[1, 2, 3, 4, 5].map((dot) => (
        <span
          key={dot}
          aria-hidden="true"
          className={`h-1.5 w-1.5 rounded-full ${dot <= level ? 'bg-sage-500' : 'bg-black/10'}`}
        />
      ))}
    </span>
  );
}

export function SubjectDot({ colour, className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${className}`}
      style={{ backgroundColor: colour }}
    />
  );
}

/**
 * A progress bar that shows how much is confidently known. It never renders a
 * red "behind" portion — the empty part is simply space still to fill.
 */
export function ProgressBar({ total, started, mastered, colour = '#4f8a73' }) {
  const safeTotal = Math.max(total, 1);
  const masteredPercent = (mastered / safeTotal) * 100;
  const startedPercent = (Math.max(started - mastered, 0) / safeTotal) * 100;

  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06]"
      role="img"
      aria-label={`${mastered} of ${total} topics confident, ${started} started`}
    >
      <div className="flex h-full">
        <div style={{ width: `${masteredPercent}%`, backgroundColor: colour }} />
        <div style={{ width: `${startedPercent}%`, backgroundColor: colour, opacity: 0.35 }} />
      </div>
    </div>
  );
}
