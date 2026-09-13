import { useEffect, useState } from 'react';
import { Modal } from './Modal.jsx';
import { Button, Field, TextInput } from './ui.jsx';
import { formatMinutes } from '../lib/format.js';

/** The handful of rules the automatic planner works to. */
export function PlannerSettingsDialog({ open, onClose, settings, onSave }) {
  const [draft, setDraft] = useState(settings);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(settings);
      setError(null);
    }
  }, [open, settings]);

  if (!draft) return null;

  const set = (field) => (event) =>
    setDraft({ ...draft, [field]: event.target.type === 'checkbox' ? event.target.checked : event.target.value });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave({
        ...draft,
        break_minutes: Number(draft.break_minutes),
        daily_max_minutes: Number(draft.daily_max_minutes),
        revision_min_minutes: Number(draft.revision_min_minutes),
        revision_max_minutes: Number(draft.revision_max_minutes),
      });
      onClose();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="How the planner works"
      description="These decide where it will and will not put a study block."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Earliest it may start">
            <TextInput type="time" step="300" value={draft.day_start} onChange={set('day_start')} />
          </Field>
          <Field label="Latest it may run to">
            <TextInput type="time" step="300" value={draft.day_end} onChange={set('day_end')} />
          </Field>
          <Field label="Break between blocks" hint="Minutes.">
            <TextInput
              type="number"
              min="0"
              max="60"
              step="5"
              value={draft.break_minutes}
              onChange={set('break_minutes')}
            />
          </Field>
          <Field
            label="Most in one day"
            hint={`Minutes. Currently ${formatMinutes(Number(draft.daily_max_minutes) || 0)}, revision included.`}
          >
            <TextInput
              type="number"
              min="30"
              max="960"
              step="15"
              value={draft.daily_max_minutes}
              onChange={set('daily_max_minutes')}
            />
          </Field>
        </div>

        <div className="rounded-xl2 bg-paper-sunk p-3">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={draft.revision_enabled}
              onChange={set('revision_enabled')}
              className="h-5 w-5 rounded border-black/20 text-sage-600 focus:ring-sage-400"
            />
            <span className="text-sm text-ink">
              Book revision a day, three days and a week after each study block
            </span>
          </label>

          {draft.revision_enabled && (
            <>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Shortest revision" hint="Minutes.">
                  <TextInput
                    type="number"
                    min="5"
                    max="120"
                    step="5"
                    value={draft.revision_min_minutes}
                    onChange={set('revision_min_minutes')}
                  />
                </Field>
                <Field label="Longest revision" hint="Minutes.">
                  <TextInput
                    type="number"
                    min="5"
                    max="180"
                    step="5"
                    value={draft.revision_max_minutes}
                    onChange={set('revision_max_minutes')}
                  />
                </Field>
              </div>
              <p className="mt-2 text-xs text-ink-faint">
                A revision block is about a third of the study block it follows, kept between these
                two. A quarter of each day is held back for revision so a day stays inside its
                limit.
              </p>
            </>
          )}
        </div>

        {error && <p className="text-sm text-amber-800">{error}</p>}
      </div>
    </Modal>
  );
}
