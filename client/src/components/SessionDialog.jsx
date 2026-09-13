import { useEffect, useState } from 'react';
import { Modal } from './Modal.jsx';
import { Button, Field, TextArea, TextInput } from './ui.jsx';
import { formatMinutes } from '../lib/format.js';
import { longDate, todayIso } from '../lib/week.js';

const CONFIDENCE = [
  { value: 5, label: 'I could teach it' },
  { value: 4, label: 'Comfortable' },
  { value: 3, label: 'Getting there' },
  { value: 2, label: 'Shaky' },
  { value: 1, label: 'Lost' },
];

/**
 * "How did that go?" — shown when a block is ticked off, and used on its own
 * for studying done away from the plan.
 *
 * The wording matters as much as the fields: the question is how it felt, not
 * whether the target was hit.
 */
export function SessionDialog({
  open,
  onClose,
  onSave,
  topic,
  planEntry,
  plannedMinutes,
  defaultDate,
}) {
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft({
      date: defaultDate ?? planEntry?.scheduled_date ?? todayIso(),
      minutes_spent: plannedMinutes ?? planEntry?.scheduled_duration_minutes ?? 45,
      confidence_score: 3,
      notes: '',
    });
    setError(null);
  }, [open, planEntry, plannedMinutes, defaultDate]);

  if (!draft) return null;

  const planned = planEntry?.scheduled_duration_minutes;
  const actual = Number(draft.minutes_spent) || 0;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave({
        topic_id: topic?.id ?? planEntry?.topic_id,
        plan_entry_id: planEntry?.id,
        date: draft.date,
        minutes_spent: Number(draft.minutes_spent),
        confidence_score: Number(draft.confidence_score),
        notes: draft.notes.trim() || null,
      });
    } catch (caught) {
      setError(caught.message);
      setSaving(false);
    }
  };

  const title = topic?.title ?? planEntry?.topic_title ?? 'this session';
  const reference = topic?.tracking_number ?? planEntry?.tracking_number;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="How did that go?"
      description={`${reference ? `${reference} · ` : ''}${title}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save this session'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
            How did it feel?
          </span>
          <div className="space-y-1.5">
            {CONFIDENCE.map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 transition ${
                  Number(draft.confidence_score) === option.value
                    ? 'bg-sage-100 text-sage-800'
                    : 'bg-paper-sunk text-ink-soft hover:bg-sage-50'
                }`}
              >
                <input
                  type="radio"
                  name="confidence"
                  value={option.value}
                  checked={Number(draft.confidence_score) === option.value}
                  onChange={() => setDraft({ ...draft, confidence_score: option.value })}
                  className="h-4 w-4 border-black/20 text-sage-600 focus:ring-sage-400"
                />
                <span className="text-sm">{option.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="How long, really?"
            hint={
              planned
                ? `Planned ${formatMinutes(planned)}.${
                    actual && actual !== planned ? ' Both are worth knowing.' : ''
                  }`
                : 'In minutes.'
            }
          >
            <TextInput
              type="number"
              min="0"
              max="720"
              step="5"
              value={draft.minutes_spent}
              onChange={(event) => setDraft({ ...draft, minutes_spent: event.target.value })}
            />
          </Field>

          <Field label="Which day?" hint={longDate(draft.date)}>
            <TextInput
              type="date"
              value={draft.date}
              max={todayIso()}
              onChange={(event) => setDraft({ ...draft, date: event.target.value })}
            />
          </Field>
        </div>

        <Field label="Anything to remember?" hint="Optional — what clicked, what didn't.">
          <TextArea
            rows={3}
            value={draft.notes}
            placeholder="The second worked example is the one that made it make sense."
            onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
          />
        </Field>

        {error && <p className="text-sm text-amber-800">{error}</p>}
      </div>
    </Modal>
  );
}

/** Follows a shaky session: offers another look, and books nothing on its own. */
export function RevisionSuggestion({
  suggestion,
  open,
  onClose,
  onAccept,
  title = 'Shall we look at that again?',
  lead = 'That one felt hard, which is worth knowing rather than worrying about.',
}) {
  const [working, setWorking] = useState(false);
  if (!suggestion) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={working}>
            No, leave it
          </Button>
          <Button
            variant="primary"
            disabled={working}
            onClick={async () => {
              setWorking(true);
              try {
                await onAccept(suggestion);
              } finally {
                setWorking(false);
              }
            }}
          >
            {working ? 'Booking…' : 'Yes, book it'}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-ink-soft">
        {lead} There is room for another {suggestion.scheduled_duration_minutes} minutes on{' '}
        <strong className="text-ink">{longDate(suggestion.scheduled_date)}</strong> at{' '}
        <strong className="text-ink">{suggestion.scheduled_start_time}</strong>. Nothing is booked
        unless you say so.
      </p>
    </Modal>
  );
}
