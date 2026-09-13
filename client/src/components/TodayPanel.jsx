import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { RevisionSuggestion, SessionDialog } from './SessionDialog.jsx';
import { Button, Card } from './ui.jsx';
import { SubjectDot } from './bits.jsx';
import { useToast } from '../hooks/useToast.jsx';
import { formatMinutes } from '../lib/format.js';
import { friendlyTime, todayIso } from '../lib/week.js';

/**
 * What is on today, with a tick box for each block. Ticking one off asks how it
 * went rather than just marking it done — the record of how it felt is the
 * point, not the tick.
 */
export function TodayPanel({ onChanged }) {
  const today = todayIso();
  const toast = useToast();

  const [entries, setEntries] = useState(null);
  const [logging, setLogging] = useState(null);
  const [suggestion, setSuggestion] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      setEntries(await api.plan.list(today, today));
    } catch {
      setEntries([]);
    }
  }, [today]);

  useEffect(() => {
    load();
  }, [load]);

  if (entries === null) return null;

  const untick = async (entry) => {
    setBusyId(entry.id);
    try {
      const session = await api.sessions.forPlanEntry(entry.id);
      if (session) await api.sessions.remove(session.id);
      else await api.plan.update(entry.id, { completed: false });
      await load();
      onChanged?.();
    } catch (caught) {
      toast.warn(caught.message);
    } finally {
      setBusyId(null);
    }
  };

  const saveSession = async (payload) => {
    const result = await api.sessions.create(payload);
    setLogging(null);
    await load();
    onChanged?.();
    toast.celebrate(`${formatMinutes(payload.minutes_spent)} recorded. That counts.`);
    if (result.suggestion) setSuggestion(result.suggestion);
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
            <div
              key={entry.id}
              className={`flex items-center gap-3 px-5 py-3 transition ${
                entry.completed ? 'opacity-60' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={entry.completed}
                disabled={busyId === entry.id}
                onChange={() => (entry.completed ? untick(entry) : setLogging(entry))}
                aria-label={`${entry.completed ? 'Undo' : 'Record'} ${
                  entry.sub_topic_title ?? entry.topic_title
                }`}
                className="h-5 w-5 shrink-0 rounded border-black/20 text-sage-600 focus:ring-sage-400"
              />
              <span className="w-20 shrink-0 text-xs text-ink-faint">
                {friendlyTime(entry.scheduled_start_time)}
              </span>
              <SubjectDot colour={entry.subject_colour} />
              <span className="min-w-0 flex-1">
                <span
                  className={`block truncate text-sm text-ink ${entry.completed ? 'line-through' : ''}`}
                >
                  {entry.sub_topic_title ?? entry.topic_title}
                </span>
                <span className="block truncate text-xs text-ink-faint">
                  {entry.tracking_label ?? entry.tracking_number}
                  {entry.entry_type !== 'study' ? ` · ${entry.entry_type}` : ''} ·{' '}
                  {formatMinutes(entry.scheduled_duration_minutes)}
                </span>
              </span>
            </div>
          ))}
        </Card>
      )}

      <SessionDialog
        open={Boolean(logging)}
        planEntry={logging}
        onClose={() => setLogging(null)}
        onSave={saveSession}
      />

      <RevisionSuggestion
        suggestion={suggestion}
        open={Boolean(suggestion)}
        onClose={() => setSuggestion(null)}
        onAccept={async (proposal) => {
          try {
            await api.plan.create({
              topic_id: proposal.topic_id,
              scheduled_date: proposal.scheduled_date,
              scheduled_start_time: proposal.scheduled_start_time,
              scheduled_duration_minutes: proposal.scheduled_duration_minutes,
              entry_type: 'revision',
              revision_interval: '3day',
            });
            toast.celebrate('Booked in. Nothing else to do about it now.');
          } catch (caught) {
            toast.warn(caught.message);
          } finally {
            setSuggestion(null);
          }
        }}
      />
    </section>
  );
}
