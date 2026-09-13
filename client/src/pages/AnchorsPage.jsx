import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { PageHeader } from '../components/AppShell.jsx';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';
import { Modal } from '../components/Modal.jsx';
import { Button, Card, EmptyState, ErrorNote, Field, Select, Spinner, TextInput } from '../components/ui.jsx';
import { useToast } from '../hooks/useToast.jsx';
import { ANCHOR_TYPES, anchorStyle } from '../lib/anchors.js';
import { friendlyTime, toMinutes } from '../lib/week.js';

const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const blank = {
  label: '',
  type: 'other',
  day_of_week: 0,
  start_time: '16:00',
  end_time: '17:00',
  days: [0],
};

export default function AnchorsPage() {
  const toast = useToast();
  const [anchors, setAnchors] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = async () => {
    setStatus('loading');
    try {
      setAnchors(await api.anchors.list());
      setStatus('ready');
    } catch (caught) {
      setError(caught.message);
      setStatus('error');
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (status === 'loading') return <Spinner label="Loading your week…" />;
  if (status === 'error') return <ErrorNote onRetry={load}>{error}</ErrorNote>;

  const byDay = DAY_LABELS.map((_, day) =>
    anchors
      .filter((anchor) => anchor.day_of_week === day)
      .sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time))
  );

  const startStarter = async () => {
    try {
      setAnchors(await api.anchors.starterWeek());
      toast.celebrate('A typical week added. Change anything that is not right.');
    } catch (caught) {
      toast.warn(caught.message);
    }
  };

  const toggleActive = async (anchor) => {
    try {
      const updated = await api.anchors.update(anchor.id, { is_active: !anchor.is_active });
      setAnchors((current) => current.map((item) => (item.id === anchor.id ? updated : item)));
    } catch (caught) {
      toast.warn(caught.message);
    }
  };

  const remove = async () => {
    try {
      await api.anchors.remove(deleting.id);
      setDeleting(null);
      await load();
      toast.celebrate('Removed.');
    } catch (caught) {
      toast.warn(caught.message);
    }
  };

  return (
    <div>
      <PageHeader
        backTo="/planner"
        backLabel="Back to your week"
        eyebrow="Fixed commitments"
        title="What your week already holds"
        description="School, coaching, meals, sleep, anything that is not up for negotiation. The planner works around these, so the more honest they are the better your timetable will be."
        actions={
          <Button variant="primary" onClick={() => setEditing('new')}>
            Add a commitment
          </Button>
        }
      />

      {anchors.length === 0 ? (
        <EmptyState
          title="Nothing here yet."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={startStarter}>
                Start from a typical school week
              </Button>
              <Button onClick={() => setEditing('new')}>Add one myself</Button>
            </div>
          }
        >
          Start from a typical week and edit it, or build your own from scratch. Either way you can
          change it whenever your term does.
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DAY_LABELS.map((dayLabel, day) => (
            <Card key={dayLabel} className="p-4">
              <h2 className="text-sm font-semibold text-ink">{dayLabel}</h2>

              {byDay[day].length === 0 ? (
                <p className="mt-2 text-xs text-ink-faint">Nothing fixed — the whole day is yours.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {byDay[day].map((anchor) => {
                    const { tint } = anchorStyle(anchor.type);
                    return (
                      <li
                        key={anchor.id}
                        className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${
                          anchor.is_active ? '' : 'opacity-50'
                        }`}
                        style={{ backgroundColor: `${tint}14` }}
                      >
                        <span
                          aria-hidden="true"
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: tint }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-ink">{anchor.label}</p>
                          <p className="text-[11px] text-ink-faint">
                            {friendlyTime(anchor.start_time)}–{friendlyTime(anchor.end_time)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleActive(anchor)}
                          className="text-[11px] text-ink-faint underline-offset-2 hover:text-ink hover:underline"
                        >
                          {anchor.is_active ? 'Pause' : 'Resume'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing(anchor)}
                          className="text-[11px] text-ink-faint underline-offset-2 hover:text-ink hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(anchor)}
                          className="text-[11px] text-ink-faint underline-offset-2 hover:text-ink hover:underline"
                        >
                          Delete
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}

      {anchors.length > 0 && (
        <p className="mt-6 text-sm text-ink-soft">
          Happy with this?{' '}
          <Link to="/planner" className="text-sage-700 underline-offset-2 hover:underline">
            Go and plan your week
          </Link>
          .
        </p>
      )}

      <AnchorDialog
        anchor={editing === 'new' ? null : editing}
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        onSaved={async (message) => {
          await load();
          setEditing(null);
          toast.celebrate(message);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title={`Remove ${deleting?.label}?`}
        confirmLabel="Remove it"
      >
        The planner will treat that time as free from now on. Blocks already on the calendar stay
        where they are.
      </ConfirmDialog>
    </div>
  );
}

function AnchorDialog({ anchor, open, onClose, onSaved }) {
  const [draft, setDraft] = useState(blank);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(
      anchor
        ? { ...anchor, days: [anchor.day_of_week] }
        : { ...blank, days: [0] }
    );
    setError(null);
  }, [open, anchor]);

  const toggleDay = (day) =>
    setDraft((current) => ({
      ...current,
      days: current.days.includes(day)
        ? current.days.filter((value) => value !== day)
        : [...current.days, day].sort(),
    }));

  const save = async () => {
    if (!draft.label.trim()) {
      setError('Give it a name — "School", "Football", "Dinner".');
      return;
    }
    if (draft.days.length === 0) {
      setError('Pick at least one day.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const body = {
        label: draft.label.trim(),
        type: draft.type,
        start_time: draft.start_time,
        end_time: draft.end_time,
      };

      if (anchor) {
        await api.anchors.update(anchor.id, { ...body, day_of_week: draft.days[0] });
        await onSaved(`${body.label} updated.`);
      } else {
        // One commitment across several days is really one per day.
        for (const day of draft.days) {
          await api.anchors.create({ ...body, day_of_week: day });
        }
        await onSaved(
          `${body.label} added to ${draft.days.length} day${draft.days.length === 1 ? '' : 's'}.`
        );
      }
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
      title={anchor ? `Edit ${anchor.label}` : 'Add a commitment'}
      description={anchor ? null : 'Tick every day it happens and it will be added to each one.'}
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
        <Field label="What is it?">
          <TextInput
            value={draft.label}
            placeholder="School"
            onChange={(event) => setDraft({ ...draft, label: event.target.value })}
          />
        </Field>

        <Field label="Kind">
          <Select
            value={draft.type}
            onChange={(event) => setDraft({ ...draft, type: event.target.value })}
          >
            {ANCHOR_TYPES.map((type) => (
              <option key={type} value={type}>
                {anchorStyle(type).label}
              </option>
            ))}
          </Select>
        </Field>

        <div>
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
            {anchor ? 'Day' : 'Days'}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {DAY_LABELS.map((label, day) => (
              <button
                key={label}
                type="button"
                aria-pressed={draft.days.includes(day)}
                onClick={() => (anchor ? setDraft({ ...draft, days: [day] }) : toggleDay(day))}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  draft.days.includes(day)
                    ? 'bg-sage-600 text-white'
                    : 'bg-paper-sunk text-ink-soft hover:bg-sage-100'
                }`}
              >
                {label.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Starts">
            <TextInput
              type="time"
              step="300"
              value={draft.start_time}
              onChange={(event) => setDraft({ ...draft, start_time: event.target.value })}
            />
          </Field>
          <Field label="Ends">
            <TextInput
              type="time"
              step="300"
              value={draft.end_time}
              onChange={(event) => setDraft({ ...draft, end_time: event.target.value })}
            />
          </Field>
        </div>

        <p className="text-xs text-ink-faint">
          Something that runs past midnight, like sleep, goes in as two commitments — one up to
          23:59 and one from 00:00.
        </p>

        {error && <p className="text-sm text-amber-800">{error}</p>}
      </div>
    </Modal>
  );
}
