import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { Button, Card } from './ui.jsx';
import { SubjectDot } from './bits.jsx';
import { formatMinutes } from '../lib/format.js';
import { friendlyTime, todayIso } from '../lib/week.js';

/**
 * What is actually on today, on the home page, with a tick box for each block.
 * The whole point of a plan is being able to see the next thing without
 * hunting for it.
 */
export function TodayPanel({ onChanged }) {
  const today = todayIso();
  const [entries, setEntries] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    try {
      setEntries(await api.plan.list(today, today));
    } catch {
      setEntries([]);
    }
  };

  useEffect(() => {
    load();
    // The date is fixed for the life of this panel, so this runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (entries === null) return null;

  const toggle = async (entry) => {
    setBusyId(entry.id);
    try {
      await api.plan.update(entry.id, { completed: !entry.completed });
      await load();
      onChanged?.();
    } finally {
      setBusyId(null);
    }
  };

  const done = entries.filter((entry) => entry.completed).length;
  const minutes = entries.reduce((sum, entry) => sum + entry.scheduled_duration_minutes, 0);

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-end justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Today</h2>
        <Link to="/planner" className="text-sm text-sage-700 underline-offset-2 hover:underline">
          See the week
        </Link>
      </div>

      {entries.length === 0 ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-sm text-ink-soft">
            Nothing booked for today. A quiet day is allowed — or plan one in.
          </p>
          <Link to="/planner">
            <Button size="sm" variant="primary">
              Open the planner
            </Button>
          </Link>
        </Card>
      ) : (
        <Card className="divide-y divide-black/5 overflow-hidden">
          <p className="px-5 py-2.5 text-xs text-ink-faint">
            {entries.length} block{entries.length === 1 ? '' : 's'} · {formatMinutes(minutes)}
            {done > 0 && ` · ${done} done`}
          </p>
          {entries.map((entry) => (
            <label
              key={entry.id}
              className={`flex cursor-pointer items-center gap-3 px-5 py-3 transition hover:bg-paper-sunk/50 ${
                entry.completed ? 'opacity-60' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={entry.completed}
                disabled={busyId === entry.id}
                onChange={() => toggle(entry)}
                className="h-5 w-5 shrink-0 rounded border-black/20 text-sage-600 focus:ring-sage-400"
              />
              <span className="w-20 shrink-0 text-xs text-ink-faint">
                {friendlyTime(entry.scheduled_start_time)}
              </span>
              <SubjectDot colour={entry.subject_colour} />
              <span className="min-w-0 flex-1">
                <span
                  className={`block truncate text-sm text-ink ${
                    entry.completed ? 'line-through' : ''
                  }`}
                >
                  {entry.topic_title}
                </span>
                <span className="block truncate text-xs text-ink-faint">
                  {entry.tracking_number}
                  {entry.entry_type === 'revision' ? ' · revision' : ''} ·{' '}
                  {formatMinutes(entry.scheduled_duration_minutes)}
                </span>
              </span>
            </label>
          ))}
        </Card>
      )}
    </section>
  );
}
