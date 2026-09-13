import { useState } from 'react';
import { CHART_INK, MARK, MARK_SOFT } from '../../lib/palette.js';
import { formatMinutes } from '../../lib/format.js';
import { longDate } from '../../lib/week.js';
import { GridLine, Tooltip, barPath, useElementWidth } from './chartBits.jsx';

const HEIGHT = 190;
const PAD = { top: 16, right: 8, bottom: 26, left: 40 };
const MAX_BAR = 24;

/** Rounds the top of the scale up to something a person would say out loud. */
function niceMax(value) {
  if (value <= 60) return 60;
  const step = value <= 240 ? 30 : 60;
  return Math.ceil(value / step) * step;
}

/**
 * Minutes studied on each day. One series, so one hue — colour is doing no
 * identity work here, and the title says what is plotted, so there is no
 * legend to add.
 */
export function DailyMinutesChart({ data }) {
  const [ref, width] = useElementWidth();
  const [hover, setHover] = useState(null);

  const plotWidth = Math.max(width - PAD.left - PAD.right, 40);
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;

  const max = niceMax(Math.max(...data.map((day) => day.minutes), 0));
  const band = plotWidth / Math.max(data.length, 1);
  // A 2px gap of surface separates neighbouring bars; nothing is stroked.
  const barWidth = Math.max(2, Math.min(MAX_BAR, band - 2));

  const busiest = data.reduce(
    (best, day) => (day.minutes > (best?.minutes ?? 0) ? day : best),
    null
  );

  const yOf = (minutes) => PAD.top + plotHeight - (minutes / max) * plotHeight;

  return (
    <div ref={ref} className="relative">
      <svg width={width} height={HEIGHT} role="img" aria-label="Minutes studied each day">
        {[0, max / 2, max].map((tick) => (
          <g key={tick}>
            <GridLine x1={PAD.left} x2={PAD.left + plotWidth} y={yOf(tick)} />
            <text
              x={PAD.left - 6}
              y={yOf(tick) + 3}
              textAnchor="end"
              fontSize="10"
              fill={CHART_INK.muted}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {tick === 0 ? '0' : `${Math.round(tick / 60)}h`}
            </text>
          </g>
        ))}

        {data.map((day, index) => {
          const x = PAD.left + index * band + (band - barWidth) / 2;
          const height = (day.minutes / max) * plotHeight;
          const isBusiest = busiest && day.date === busiest.date && day.minutes > 0;

          return (
            <g key={day.date}>
              {day.minutes > 0 && (
                <path
                  d={barPath({ x, y: yOf(day.minutes), width: barWidth, height })}
                  fill={isBusiest ? MARK : MARK_SOFT}
                />
              )}
              {/* A hit target taller than the mark, so short days are reachable. */}
              <rect
                x={PAD.left + index * band}
                y={PAD.top}
                width={band}
                height={plotHeight}
                fill="transparent"
                onMouseEnter={() =>
                  setHover({ day, x: PAD.left + index * band + band / 2, y: yOf(day.minutes) })
                }
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}

        {/* Only the busiest day is labelled — a number on every bar goes unread. */}
        {busiest && busiest.minutes > 0 && (
          <text
            x={PAD.left + data.indexOf(busiest) * band + band / 2}
            y={yOf(busiest.minutes) - 5}
            textAnchor="middle"
            fontSize="10"
            fontWeight="600"
            fill={CHART_INK.secondary}
          >
            {formatMinutes(busiest.minutes)}
          </text>
        )}

        {data.map((day, index) =>
          index % 7 === 0 ? (
            <text
              key={`tick-${day.date}`}
              x={PAD.left + index * band + band / 2}
              y={HEIGHT - 8}
              textAnchor="middle"
              fontSize="10"
              fill={CHART_INK.muted}
            >
              {Number(day.date.slice(8))} {new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short' })}
            </text>
          ) : null
        )}
      </svg>

      <Tooltip point={hover && { x: hover.x, y: hover.y }}>
        {hover && (
          <>
            <span className="block font-medium">{longDate(hover.day.date)}</span>
            <span className="block text-white/80">
              {hover.day.minutes === 0
                ? 'a day off'
                : `${formatMinutes(hover.day.minutes)} · ${hover.day.sessions} session${
                    hover.day.sessions === 1 ? '' : 's'
                  }`}
            </span>
          </>
        )}
      </Tooltip>
    </div>
  );
}
