import { useEffect, useRef, useState } from 'react';
import { CHART_INK } from '../../lib/palette.js';

/** Measures a container so charts can be drawn at real pixel sizes. */
export function useElementWidth(fallback = 640) {
  const ref = useRef(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const observer = new ResizeObserver(([entry]) => {
      const next = entry.contentRect.width;
      if (next > 0) setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}

/**
 * A bar with a rounded data-end and a square baseline, so the mark reads as
 * growing from the axis rather than floating.
 */
export function barPath({ x, y, width, height, radius = 4, direction = 'up' }) {
  const r = Math.max(0, Math.min(radius, width / 2, height));

  if (direction === 'up') {
    return `M${x},${y + height} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + width - r},${y} Q${x + width},${y} ${x + width},${y + r} L${x + width},${y + height} Z`;
  }
  // Grows to the right from a baseline on the left.
  return `M${x},${y} L${x + width - r},${y} Q${x + width},${y} ${x + width},${y + r} L${x + width},${y + height - r} Q${x + width},${y + height} ${x + width - r},${y + height} L${x},${y + height} Z`;
}

/** A hairline, solid and one step off the surface — never dashed. */
export function GridLine({ x1, x2, y }) {
  return <line x1={x1} x2={x2} y1={y} y2={y} stroke={CHART_INK.grid} strokeWidth="1" />;
}

/** Follows the pointer inside a chart; positioned by the chart that owns it. */
export function Tooltip({ point, children }) {
  if (!point) return null;

  return (
    <div
      className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg bg-ink px-2.5 py-1.5 text-xs leading-snug text-white shadow-soft"
      style={{ left: point.x, top: point.y - 8 }}
      role="status"
    >
      {children}
    </div>
  );
}

export function ChartFrame({ title, subtitle, action, children, footnote }) {
  return (
    <section className="rounded-xl2 bg-paper-raised p-5 shadow-soft">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-ink-faint">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
      {footnote && <p className="mt-3 text-xs text-ink-faint">{footnote}</p>}
    </section>
  );
}
