import { formatMinutes } from '../../lib/format.js';

const TRACK = 'rgba(47, 53, 66, 0.06)';

/**
 * Time spent per subject, most first.
 *
 * Each subject's name sits directly above its bar, so identity never rests on
 * colour alone — the colour is there to match the calendar, not to be decoded.
 */
export function SubjectMinutesChart({ subjects }) {
  const studied = subjects.filter((subject) => subject.minutes > 0);
  const untouched = subjects.filter((subject) => subject.minutes === 0);
  const max = Math.max(...studied.map((subject) => subject.minutes), 1);

  if (studied.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-faint">No sessions in this stretch yet.</p>;
  }

  return (
    <div>
      <ul className="space-y-3">
        {studied.map((subject) => (
          <li key={subject.subject_id}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: subject.colour }}
                />
                <span className="truncate text-ink">{subject.name}</span>
              </span>
              <span className="shrink-0 text-ink-soft" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatMinutes(subject.minutes)}
                <span className="ml-2 text-xs text-ink-faint">
                  {subject.sessions} session{subject.sessions === 1 ? '' : 's'}
                </span>
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: TRACK }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max((subject.minutes / max) * 100, 3)}%`,
                  backgroundColor: subject.colour,
                }}
              />
            </div>
          </li>
        ))}
      </ul>

      {untouched.length > 0 && (
        <p className="mt-4 text-xs text-ink-faint">
          {untouched.map((subject) => subject.name).join(' and ')}{' '}
          {untouched.length === 1 ? 'has' : 'have'} not come up in this stretch.
        </p>
      )}
    </div>
  );
}
