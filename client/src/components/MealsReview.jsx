import { Button, Card, TextInput } from './ui.jsx';
import { longDate } from '../lib/week.js';

/**
 * The review screen for meal times an assistant proposed — lunch and dinner
 * are no longer fixed commitments, so each week's timetable includes its own
 * suggested times. Same review-before-write shape as everything else: tick
 * what you want, adjust anything that needs it, then save. Saving adds each
 * one as a one-off commitment scoped to that single day, so it never
 * disturbs any other week.
 */
export function MealsReview({ rows, onChange, onSave, onDismiss, saving }) {
  const update = (key, changes) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, ...changes } : row)));

  const included = rows.filter((row) => row.include);

  return (
    <Card className="mt-4 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-ink">
            {rows.length} meal time{rows.length === 1 ? '' : 's'} suggested
          </h2>
          <p className="text-xs text-ink-faint">
            Lunch and dinner aren't fixed any more — these are just for this stretch. Adjust
            anything, or untick what you don't want.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onDismiss} disabled={saving}>
          Discard
        </Button>
      </div>

      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.key}
            className={`flex flex-wrap items-center gap-2 rounded-lg bg-paper-sunk px-3 py-2 ${
              row.include ? '' : 'opacity-50'
            }`}
          >
            <input
              type="checkbox"
              checked={row.include}
              onChange={(event) => update(row.key, { include: event.target.checked })}
              className="h-4 w-4 shrink-0 rounded border-black/20 text-sage-600 focus:ring-sage-400"
              aria-label={`Include ${row.label} on ${row.scheduled_date}`}
            />
            <div className="min-w-0 flex-1">
              <TextInput
                value={row.label}
                onChange={(event) => update(row.key, { label: event.target.value })}
                className="w-32"
                aria-label={`Name for this meal on ${row.scheduled_date}`}
              />
              <p className="mt-1 text-xs text-ink-faint">{longDate(row.scheduled_date)}</p>
            </div>
            <TextInput
              type="time"
              step="300"
              value={row.start_time}
              onChange={(event) => update(row.key, { start_time: event.target.value })}
              className="w-28"
              aria-label={`Start time for ${row.label} on ${row.scheduled_date}`}
            />
            <TextInput
              type="time"
              step="300"
              value={row.end_time}
              onChange={(event) => update(row.key, { end_time: event.target.value })}
              className="w-28"
              aria-label={`End time for ${row.label} on ${row.scheduled_date}`}
            />
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <p className="text-xs text-ink-faint">
          {included.length} of {rows.length} ticked
        </p>
        <Button variant="primary" onClick={() => onSave(rows)} disabled={saving || included.length === 0}>
          {saving ? 'Saving…' : `Save ${included.length} meal time${included.length === 1 ? '' : 's'}`}
        </Button>
      </div>
    </Card>
  );
}
