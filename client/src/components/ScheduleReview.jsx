import { Button, Card, Select, TextInput } from './ui.jsx';
import { SubjectDot } from './bits.jsx';
import { formatMinutes } from '../lib/format.js';
import { longDate } from '../lib/week.js';

/**
 * The review screen for a schedule an assistant proposed — the same
 * review-before-write shape as the syllabus import: tick what you want,
 * adjust anything that needs it, then save. Nothing lands on the calendar
 * until "Save" is pressed.
 */
export function ScheduleReview({ rows, onChange, onSave, onDismiss, saving }) {
  const update = (key, changes) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, ...changes } : row)));

  const included = rows.filter((row) => row.include && row.topic);
  const unresolved = rows.filter((row) => !row.topic);

  return (
    <Card className="mt-4 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-ink">
            {rows.length} block{rows.length === 1 ? '' : 's'} suggested
          </h2>
          <p className="text-xs text-ink-faint">
            Check each one over — you can adjust the time, or untick anything you do not want.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onDismiss} disabled={saving}>
          Discard
        </Button>
      </div>

      {unresolved.length > 0 && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {unresolved.length} block{unresolved.length === 1 ? '' : 's'} named a tracking number that
          is not currently waiting for a slot ({unresolved.map((row) => row.tracking_number).join(', ')})
          — it may already be scheduled, or the number does not match anything on your list. Those
          are left out below.
        </p>
      )}

      <div className="space-y-2">
        {rows
          .filter((row) => row.topic)
          .map((row) => (
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
                aria-label={`Include ${row.tracking_number}`}
              />
              <SubjectDot colour={row.topic.subject_colour} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">
                  <span className="mr-1.5 font-mono text-xs text-ink-faint">{row.tracking_number}</span>
                  {row.sub_topic_title ?? row.topic.title}
                </p>
                <p className="text-xs text-ink-faint">
                  {row.sub_topic_title && <span className="mr-1.5">{row.topic.title} ·</span>}
                  {longDate(row.scheduled_date)}
                </p>
              </div>
              <Select
                value={row.entry_type}
                onChange={(event) => update(row.key, { entry_type: event.target.value })}
                style={{ width: 'auto' }}
                aria-label={`Kind of block for ${row.tracking_number}`}
              >
                <option value="study">Study</option>
                <option value="practice">Practice</option>
              </Select>
              <TextInput
                type="date"
                value={row.scheduled_date}
                onChange={(event) => update(row.key, { scheduled_date: event.target.value })}
                className="w-36"
                aria-label={`Date for ${row.tracking_number}`}
              />
              <TextInput
                type="time"
                step="300"
                value={row.scheduled_start_time}
                onChange={(event) => update(row.key, { scheduled_start_time: event.target.value })}
                className="w-28"
                aria-label={`Start time for ${row.tracking_number}`}
              />
              <div className="flex items-center gap-1">
                <TextInput
                  type="number"
                  min="5"
                  max="480"
                  step="5"
                  value={row.scheduled_duration_minutes}
                  onChange={(event) => update(row.key, { scheduled_duration_minutes: event.target.value })}
                  className="w-16"
                  aria-label={`Minutes for ${row.tracking_number}`}
                />
                <span className="text-xs text-ink-faint">min</span>
              </div>
            </div>
          ))}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <p className="text-xs text-ink-faint">
          {included.length} of {rows.filter((row) => row.topic).length} ticked
          {included.length > 0 &&
            ` · ${formatMinutes(
              included.reduce((sum, row) => sum + (Number(row.scheduled_duration_minutes) || 0), 0)
            )} total`}
        </p>
        <Button variant="primary" onClick={() => onSave(rows)} disabled={saving || included.length === 0}>
          {saving ? 'Saving…' : `Save ${included.length} block${included.length === 1 ? '' : 's'}`}
        </Button>
      </div>
    </Card>
  );
}
