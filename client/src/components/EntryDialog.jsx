import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from './Modal.jsx';
import { Button, Field, TextInput } from './ui.jsx';
import { SubjectDot } from './bits.jsx';
import { REVISION_LABELS } from '../lib/anchors.js';
import { formatMinutes } from '../lib/format.js';
import { friendlyTime, longDate, relativeDay } from '../lib/week.js';

/** Opens when a block on the calendar is tapped: move it, resize it, tick it off. */
export function EntryDialog({ entry, open, onClose, onSave, onDelete, onRequestLog, onUndoLog }) {
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (open && entry) {
      setDraft({
        scheduled_date: entry.scheduled_date,
        scheduled_start_time: entry.scheduled_start_time,
        scheduled_duration_minutes: entry.scheduled_duration_minutes,
      });
      setError(null);
    }
  }, [open, entry]);

  if (!entry || !draft) return null;

  const isRevision = entry.entry_type === 'revision';
  const when = relativeDay(entry.scheduled_date);

  const run = async (action) => {
    setWorking(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={entry.sub_topic_title ?? entry.topic_title}
      description={
        entry.sub_topic_title
          ? `${entry.tracking_label} · ${entry.topic_title} · ${entry.subject_name}`
          : `${entry.tracking_number} · ${entry.subject_name}`
      }
      footer={
        <>
          <Button variant="ghost" onClick={() => run(() => onDelete(entry))} disabled={working}>
            Remove from calendar
          </Button>
          <Button
            variant="primary"
            onClick={() =>
              run(() =>
                onSave(entry, {
                  ...draft,
                  scheduled_duration_minutes: Number(draft.scheduled_duration_minutes),
                })
              )
            }
            disabled={working}
          >
            {working ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
          <SubjectDot colour={entry.subject_colour} />
          <span>
            {longDate(entry.scheduled_date)}
            {when ? ` · ${when}` : ''}
          </span>
          <span className="text-ink-faint">
            {friendlyTime(entry.scheduled_start_time)}–{friendlyTime(entry.scheduled_end_time)} ·{' '}
            {formatMinutes(entry.scheduled_duration_minutes)}
          </span>
        </div>

        {isRevision && (
          <p className="rounded-xl2 bg-paper-sunk px-3 py-2 text-sm text-ink-soft">
            A revision block — {REVISION_LABELS[entry.revision_interval] ?? 'a follow-up'} after the
            study session. Short on purpose: going back over something briefly is what makes it
            stick.
          </p>
        )}

        <label className="flex items-center gap-3 rounded-xl2 bg-paper-sunk px-3 py-2.5">
          <input
            type="checkbox"
            checked={entry.completed}
            onChange={() => (entry.completed ? run(() => onUndoLog(entry)) : onRequestLog(entry))}
            disabled={working}
            className="h-5 w-5 rounded border-black/20 text-sage-600 focus:ring-sage-400"
          />
          <span className="text-sm text-ink">
            {entry.completed ? 'Done — nice one.' : 'Mark this as done, and say how it went'}
          </span>
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Day">
            <TextInput
              type="date"
              value={draft.scheduled_date}
              onChange={(event) => setDraft({ ...draft, scheduled_date: event.target.value })}
            />
          </Field>
          <Field label="Starts">
            <TextInput
              type="time"
              step="300"
              value={draft.scheduled_start_time}
              onChange={(event) => setDraft({ ...draft, scheduled_start_time: event.target.value })}
            />
          </Field>
          <Field label="Minutes">
            <TextInput
              type="number"
              min="5"
              max="720"
              step="5"
              value={draft.scheduled_duration_minutes}
              onChange={(event) =>
                setDraft({ ...draft, scheduled_duration_minutes: event.target.value })
              }
            />
          </Field>
        </div>

        {entry.entry_type === 'study' && (
          <p className="text-xs text-ink-faint">
            Moving this to another day moves its revision blocks along with it.
          </p>
        )}

        <p className="text-sm">
          <Link
            to={`/subjects/${entry.subject_id}`}
            className="text-sage-700 underline-offset-2 hover:underline"
          >
            Open {entry.subject_name}
          </Link>
        </p>

        {error && <p className="text-sm text-amber-800">{error}</p>}
      </div>
    </Modal>
  );
}
