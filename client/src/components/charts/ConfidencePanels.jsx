import { useState } from 'react';
import { CHART_INK } from '../../lib/palette.js';
import { longDate } from '../../lib/week.js';
import { Tooltip, useElementWidth } from './chartBits.jsx';

const HEIGHT = 78;
const PAD = { top: 10, right: 12, bottom: 14, left: 18 };

/**
 * One small panel per subject rather than several lines on one plot.
 *
 * When lines converge — and confidence scores between 1 and 5 converge
 * constantly — a single plot becomes a knot that only the legend can untangle.
 * Split apart, each panel is one series with its name on it, so nothing has to
 * be decoded at all.
 */
function Panel({ series }) {
  const [ref, width] = useElementWidth(220);
  const [hover, setHover] = useState(null);

  const plotWidth = Math.max(width - PAD.left - PAD.right, 20);
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;

  const points = series.points;
  const xOf = (index) =>
    PAD.left + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
  // Confidence runs 1 to 5; the scale is fixed so panels compare honestly.
  const yOf = (value) => PAD.top + plotHeight - ((value - 1) / 4) * plotHeight;

  const latest = points[points.length - 1];
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${xOf(index)},${yOf(point.average)}`).join(' ');

  return (
    <div ref={ref} className="relative">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: series.colour }}
          />
          <span className="truncate text-xs font-medium text-ink">{series.name}</span>
        </span>
        <span className="shrink-0 text-xs text-ink-soft" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {latest.average.toFixed(1)}
        </span>
      </div>

      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={`${series.name}: confidence from ${points[0].average} to ${latest.average} out of 5`}
      >
        {[1, 3, 5].map((value) => (
          <g key={value}>
            <line
              x1={PAD.left}
              x2={PAD.left + plotWidth}
              y1={yOf(value)}
              y2={yOf(value)}
              stroke={CHART_INK.grid}
              strokeWidth="1"
            />
            <text x={PAD.left - 5} y={yOf(value) + 3} textAnchor="end" fontSize="9" fill={CHART_INK.muted}>
              {value}
            </text>
          </g>
        ))}

        {points.length > 1 && (
          <path
            d={path}
            fill="none"
            stroke={series.colour}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {points.map((point, index) => (
          <g key={point.date}>
            {/* A ring in the surface colour keeps the dot legible where it meets the line. */}
            {(index === points.length - 1 || points.length === 1) && (
              <circle
                cx={xOf(index)}
                cy={yOf(point.average)}
                r="4.5"
                fill={series.colour}
                stroke={CHART_INK.surface}
                strokeWidth="2"
              />
            )}
            <circle
              cx={xOf(index)}
              cy={yOf(point.average)}
              r="9"
              fill="transparent"
              onMouseEnter={() => setHover({ point, x: xOf(index), y: yOf(point.average) })}
              onMouseLeave={() => setHover(null)}
            />
          </g>
        ))}
      </svg>

      <Tooltip point={hover && { x: hover.x, y: hover.y }}>
        {hover && (
          <>
            <span className="block font-medium">{longDate(hover.point.date)}</span>
            <span className="block text-white/80">
              felt {hover.point.average.toFixed(1)} out of 5
            </span>
          </>
        )}
      </Tooltip>
    </div>
  );
}

export function ConfidencePanels({ series }) {
  if (series.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-ink-faint">
        Rate a session out of five and the shape of it will show up here.
      </p>
    );
  }

  return (
    <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      {series.map((subject) => (
        <Panel key={subject.subject_id} series={subject} />
      ))}
    </div>
  );
}
