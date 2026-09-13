import { STATUS_RAMP } from '../../lib/palette.js';
import { STATUS_LABELS } from '../../lib/format.js';

/**
 * Where the topics stand, as one bar.
 *
 * The four stages are a progression, not four unrelated things, so they take
 * one hue stepped light to dark rather than four colours. A 2px gap of surface
 * separates the segments — nothing is stroked.
 */
export function StatusBar({ status }) {
  const total = status.reduce((sum, part) => sum + part.count, 0);

  if (total === 0) {
    return <p className="py-6 text-center text-sm text-ink-faint">No topics yet.</p>;
  }

  const present = status.filter((part) => part.count > 0);

  return (
    <div>
      <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-full">
        {present.map((part) => (
          <div
            key={part.status}
            style={{
              width: `${(part.count / total) * 100}%`,
              backgroundColor: STATUS_RAMP[part.status],
            }}
            title={`${STATUS_LABELS[part.status]}: ${part.count}`}
          />
        ))}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {status.map((part) => (
          <li key={part.status} className="flex items-center gap-1.5 text-xs">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: STATUS_RAMP[part.status] }}
            />
            <span className="text-ink-soft">{STATUS_LABELS[part.status]}</span>
            <span className="font-semibold text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {part.count}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
