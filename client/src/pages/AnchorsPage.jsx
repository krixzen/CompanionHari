import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { PageHeader } from '../components/AppShell.jsx';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';
import { LLMBridge } from '../components/LLMBridge.jsx';
import { Modal } from '../components/Modal.jsx';
import { Button, Card, EmptyState, ErrorNote, Field, Select, Spinner, TextArea, TextInput } from '../components/ui.jsx';
import { useToast } from '../hooks/useToast.jsx';
import { ANCHOR_TYPES, anchorStyle } from '../lib/anchors.js';
import { formatDate } from '../lib/format.js';
import { studyBlockPrompt } from '../lib/prompts.js';
import { studyBlockSchema } from '../lib/schemas.js';
import { addDays, friendlyTime, startOfWeek, toMinutes, todayIso, weekBounds, weekNumberForDate } from '../lib/week.js';

const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const blank = {
  label: '',
  type: 'other',
  day_of_week: 0,
  start_time: '16:00',
  end_time: '17:00',
  buffer_after_minutes: '',
  days: [0],
  scope: 'always', // 'always' | 'weeks'
  weeks: [],
};

/** Collapses a list of week numbers into readable ranges: "Weeks 9–10, 15". */
function summarizeWeeks(weeks) {
  if (!weeks || weeks.length === 0) return '';
  const sorted = [...weeks].sort((a, b) => a - b);
  const ranges = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index] === prev + 1) {
      prev = sorted[index];
      continue;
    }
    ranges.push([start, prev]);
    start = sorted[index];
    prev = sorted[index];
  }
  ranges.push([start, prev]);
  return ranges.map(([from, to]) => (from === to ? `Week ${from}` : `Weeks ${from}–${to}`)).join(', ');
}

export default function AnchorsPage() {
  const toast = useToast();
  const [anchors, setAnchors] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [term, setTerm] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const [newTemplateOpen, setNewTemplateOpen] = useState(false);
  const [blockDialog, setBlockDialog] = useState(null); // { template, block } | null — block null means "adding"
  const [assignTemplate, setAssignTemplate] = useState(null);
  const [deletingTemplate, setDeletingTemplate] = useState(null);
  const [deletingBlock, setDeletingBlock] = useState(null);

  const load = async () => {
    setStatus('loading');
    try {
      const [loadedAnchors, loadedTerm, loadedTemplates] = await Promise.all([
        api.anchors.list(),
        api.settings.term(),
        api.templates.list(),
      ]);
      setAnchors(loadedAnchors);
      setTerm(loadedTerm);
      setTemplates(loadedTemplates);
      setStatus('ready');
    } catch (caught) {
      setError(caught.message);
      setStatus('error');
    }
  };

  const reloadTemplates = async () => setTemplates(await api.templates.list());

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
      const defaultTemplate = templates.find((template) => template.is_default);
      if (defaultTemplate && defaultTemplate.blocks.length > 0) {
        toast.warn('The regular week already has blocks in it — add the rest yourself so nothing is duplicated.');
        return;
      }
      await api.anchors.starterWeek();
      // The starter week lands as ordinary anchors; fold it straight into the
      // default template so it behaves exactly like every other week pattern.
      const fresh = await api.anchors.list();
      for (const anchor of fresh) {
        await api.templates.addBlock(defaultTemplate.id, {
          label: anchor.label,
          type: anchor.type,
          day_of_week: anchor.day_of_week,
          start_time: anchor.start_time,
          end_time: anchor.end_time,
        });
        await api.anchors.remove(anchor.id);
      }
      await load();
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

  const createTemplate = async (name) => {
    await api.templates.create(name);
    await reloadTemplates();
    setNewTemplateOpen(false);
    toast.celebrate(`"${name}" added — build it out, then apply it to whichever weeks need it.`);
  };

  const confirmDeleteTemplate = async () => {
    try {
      await api.templates.remove(deletingTemplate.id);
      setDeletingTemplate(null);
      await reloadTemplates();
      toast.celebrate(`"${deletingTemplate.name}" removed. Its weeks are back on the default.`);
    } catch (caught) {
      toast.warn(caught.message);
    }
  };

  const confirmDeleteBlock = async () => {
    try {
      await api.templates.removeBlock(deletingBlock.template.id, deletingBlock.block.id);
      setDeletingBlock(null);
      await reloadTemplates();
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
        description="Build the weeks you actually live — a regular week, an exam week, whatever else comes up — then say which calendar weeks each one covers. The planner works around whichever is active."
      />

      <TermRow term={term} onSaved={setTerm} />

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Week patterns</h2>
          <Button size="sm" variant="primary" onClick={() => setNewTemplateOpen(true)}>
            + New week pattern
          </Button>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              weekSummary={summarizeWeeks(template.weeks)}
              onAddBlock={() => setBlockDialog({ template, block: null })}
              onEditBlock={(block) => setBlockDialog({ template, block })}
              onDeleteBlock={(block) => setDeletingBlock({ template, block })}
              onDeleteTemplate={() => setDeletingTemplate(template)}
              onAssign={() => setAssignTemplate(template)}
            />
          ))}
        </div>
      </section>

      <section>
        <PageHeader
          eyebrow="On top of that"
          title="Anything extra"
          description="Things that are not part of any regular week — an exam sitting, a one-off extra class — added for specific weeks without touching the pattern underneath."
          actions={
            <Button variant="primary" onClick={() => setEditing('new')}>
              Add something extra
            </Button>
          }
        />

        {anchors.length === 0 ? (
          <EmptyState title="Nothing extra right now.">
            When something one-off comes up — an exam, an extra class — add it here and pick which
            weeks it applies to. It won't disturb your regular pattern.
          </EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {DAY_LABELS.map((dayLabel, day) => (
              <Card key={dayLabel} className="p-4">
                <h2 className="text-sm font-semibold text-ink">{dayLabel}</h2>

                {byDay[day].length === 0 ? (
                  <p className="mt-2 text-xs text-ink-faint">Nothing extra here.</p>
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
                              {anchor.buffer_after_minutes ? ` (+${anchor.buffer_after_minutes} min travel)` : ''}
                              {anchor.effective_from && (
                                <span className="ml-1.5 rounded-full bg-black/[0.06] px-1.5 py-0.5 text-ink-soft">
                                  Week {weekNumberForDate(term?.start_date ?? todayIso(), anchor.effective_from)} only
                                </span>
                              )}
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
      </section>

      <StudyBlocksSection />

      {(anchors.length > 0 || templates.some((template) => template.blocks.length > 0)) && (
        <p className="mt-6 text-sm text-ink-soft">
          Happy with this?{' '}
          <Link to="/planner" className="text-sage-700 underline-offset-2 hover:underline">
            Go and plan your week
          </Link>
          .
        </p>
      )}

      {templates.every((template) => template.blocks.length === 0) && anchors.length === 0 && (
        <EmptyState
          title="Nothing here yet."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={startStarter}>
                Start from a typical school week
              </Button>
            </div>
          }
        >
          Start from a typical week and edit it, or build your own from scratch. Either way you can
          change it whenever your term does.
        </EmptyState>
      )}

      <NewTemplateDialog open={newTemplateOpen} onClose={() => setNewTemplateOpen(false)} onCreate={createTemplate} />

      <TemplateBlockDialog
        template={blockDialog?.template}
        block={blockDialog?.block}
        open={Boolean(blockDialog)}
        onClose={() => setBlockDialog(null)}
        onSaved={async (message) => {
          await reloadTemplates();
          setBlockDialog(null);
          toast.celebrate(message);
        }}
      />

      <AssignWeeksDialog
        template={assignTemplate}
        templates={templates}
        term={term}
        open={Boolean(assignTemplate)}
        onClose={() => setAssignTemplate(null)}
        onSaved={async (message) => {
          await reloadTemplates();
          setAssignTemplate(null);
          toast.celebrate(message);
        }}
      />

      <AnchorDialog
        anchor={editing === 'new' ? null : editing}
        term={term}
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

      <ConfirmDialog
        open={Boolean(deletingTemplate)}
        onClose={() => setDeletingTemplate(null)}
        onConfirm={confirmDeleteTemplate}
        title={`Delete "${deletingTemplate?.name}"?`}
        confirmLabel="Delete it"
      >
        Any weeks currently using it go back to the default week pattern.
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(deletingBlock)}
        onClose={() => setDeletingBlock(null)}
        onConfirm={confirmDeleteBlock}
        title={`Remove ${deletingBlock?.block?.label}?`}
        confirmLabel="Remove it"
      >
        This only changes the "{deletingBlock?.template?.name}" pattern — weeks using a different
        pattern are not affected.
      </ConfirmDialog>
    </div>
  );
}

/**
 * When "Week 1" begins — the reference point every week pattern and every
 * "Week N only" extra is counted from. Defaults to the Monday of the current
 * week so the feature works immediately; correct it once to your actual term
 * start and every week number lines up with it from then on.
 */
function TermRow({ term, onSaved }) {
  if (!term) return null;

  return (
    <Card className="mb-5 p-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <DateSetting
          label="Counting weeks from"
          value={term.start_date}
          hint="Week 1 starts here — everything above and below is numbered from it."
          onSave={(value) => onSaved(api.settings.saveTerm({ start_date: value }))}
        />
        <DateSetting
          label="Cover every topic by"
          value={term.cover_by_date}
          hint="After this, an AI-planned schedule leans on revision rather than new topics."
          allowClear
          onSave={(value) => onSaved(api.settings.saveTerm({ cover_by_date: value }))}
        />
        <DateSetting
          label="Exam date"
          value={term.exam_date}
          hint="The AI scheduler paces itself against how much time is left until this."
          allowClear
          onSave={(value) => onSaved(api.settings.saveTerm({ exam_date: value }))}
        />
      </div>
    </Card>
  );
}

/** One inline-editable date setting, with an optional way to clear it back to unset. */
function DateSetting({ label, value, hint, onSave, allowClear = false }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const start = () => {
    setDraft(value ?? '');
    setEditing(true);
  };

  const commit = async (nextValue) => {
    setSaving(true);
    try {
      await onSave(nextValue);
      setEditing(false);
      toast.celebrate(`${label} ${nextValue ? 'saved' : 'cleared'}.`);
    } catch (caught) {
      toast.warn(caught.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</p>
      {editing ? (
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <input
            type="date"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="rounded-lg border border-black/10 bg-paper-raised px-2 py-1 text-sm text-ink"
          />
          <Button size="sm" variant="primary" onClick={() => commit(draft || null)} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
            Cancel
          </Button>
        </div>
      ) : (
        <p className="mt-1 text-sm text-ink">
          {value ? <strong className="text-ink">{formatDate(value)}</strong> : <span className="text-ink-faint">Not set</span>}
          {' — '}
          <button type="button" onClick={start} className="text-sage-700 underline-offset-2 hover:underline">
            {value ? 'change' : 'set'}
          </button>
          {allowClear && value && (
            <>
              {' · '}
              <button
                type="button"
                onClick={() => commit(null)}
                disabled={saving}
                className="text-ink-faint underline-offset-2 hover:underline"
              >
                clear
              </button>
            </>
          )}
        </p>
      )}
      {hint && <p className="mt-0.5 text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

/** One named week pattern: its blocks, and which calendar weeks use it. */
function TemplateCard({ template, weekSummary, onAddBlock, onEditBlock, onDeleteBlock, onDeleteTemplate, onAssign }) {
  const sortedBlocks = [...template.blocks].sort(
    (a, b) => a.day_of_week - b.day_of_week || toMinutes(a.start_time) - toMinutes(b.start_time)
  );

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
            {template.name}
            {template.is_default && (
              <span className="rounded-full bg-sage-100 px-2 py-0.5 text-[10px] font-medium text-sage-800">
                Default
              </span>
            )}
          </h3>
          <p className="mt-0.5 text-xs text-ink-faint">
            {template.is_default
              ? 'Every week uses this unless assigned a different pattern.'
              : weekSummary
                ? `Applied to ${weekSummary}.`
                : 'Not applied to any week yet.'}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="primary" onClick={onAssign}>
            Apply to weeks…
          </Button>
          {!template.is_default && (
            <Button size="sm" variant="ghost" onClick={onDeleteTemplate}>
              Delete
            </Button>
          )}
        </div>
      </div>

      {sortedBlocks.length === 0 ? (
        <p className="mt-3 text-xs text-ink-faint">Nothing added yet — the whole week is open.</p>
      ) : (
        <ul className="mt-3 max-h-[26rem] space-y-1.5 overflow-y-auto pr-0.5">
          {sortedBlocks.map((block) => {
            const { tint } = anchorStyle(block.type);
            return (
              <li
                key={block.id}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${block.is_active ? '' : 'opacity-50'}`}
                style={{ backgroundColor: `${tint}14` }}
              >
                <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: tint }} />
                <span className="w-9 shrink-0 text-[11px] font-medium text-ink-soft">
                  {DAY_LABELS[block.day_of_week].slice(0, 3)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{block.label}</p>
                  <p className="text-[11px] text-ink-faint">
                    {friendlyTime(block.start_time)}–{friendlyTime(block.end_time)}
                    {block.buffer_after_minutes ? ` (+${block.buffer_after_minutes} min travel)` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onEditBlock(block)}
                  className="text-[11px] text-ink-faint underline-offset-2 hover:text-ink hover:underline"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteBlock(block)}
                  className="text-[11px] text-ink-faint underline-offset-2 hover:text-ink hover:underline"
                >
                  Delete
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Button size="sm" className="mt-3" onClick={onAddBlock}>
        Add a block
      </Button>
    </Card>
  );
}

/** Names a brand new week pattern before it has any blocks in it. */
function NewTemplateDialog({ open, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setError(null);
    }
  }, [open]);

  const save = async () => {
    if (!name.trim()) {
      setError('Give it a name — "Exam week", "Holiday week".');
      return;
    }
    setSaving(true);
    try {
      await onCreate(name.trim());
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
      title="Name this week pattern"
      description="Build it out with blocks afterwards, then apply it to whichever calendar weeks need it."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? 'Creating…' : 'Create'}
          </Button>
        </>
      }
    >
      <Field label="Name" error={error}>
        <TextInput
          value={name}
          placeholder="Exam week"
          onChange={(event) => setName(event.target.value)}
          autoFocus
        />
      </Field>
    </Modal>
  );
}

const blankBlock = {
  label: '',
  type: 'other',
  days: [0],
  start_time: '16:00',
  end_time: '17:00',
  buffer_after_minutes: '',
};

/** Adds or edits one block inside a week pattern — no week-scope here, that happens at the template level. */
function TemplateBlockDialog({ template, block, open, onClose, onSaved }) {
  const [draft, setDraft] = useState(blankBlock);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(
      block
        ? { ...block, days: [block.day_of_week], buffer_after_minutes: block.buffer_after_minutes ?? '' }
        : { ...blankBlock }
    );
    setError(null);
  }, [open, block]);

  const toggleDay = (day) =>
    setDraft((current) => ({
      ...current,
      days: block
        ? [day]
        : current.days.includes(day)
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
        buffer_after_minutes: draft.buffer_after_minutes === '' ? null : Number(draft.buffer_after_minutes),
      };

      if (block) {
        await api.templates.updateBlock(template.id, block.id, { ...body, day_of_week: draft.days[0] });
        await onSaved(`${body.label} updated.`);
      } else {
        for (const day of draft.days) {
          await api.templates.addBlock(template.id, { ...body, day_of_week: day });
        }
        const count = draft.days.length;
        await onSaved(count === 1 ? `${body.label} added.` : `${body.label} added to ${count} days.`);
      }
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSaving(false);
    }
  };

  if (!template) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={block ? `Edit ${block.label}` : `Add a block to "${template.name}"`}
      description={block ? null : 'Tick every day it happens and it will be added to each one.'}
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
          <Select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })}>
            {ANCHOR_TYPES.map((type) => (
              <option key={type} value={type}>
                {anchorStyle(type).label}
              </option>
            ))}
          </Select>
        </Field>

        <div>
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
            {block ? 'Day' : 'Days'}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {DAY_LABELS.map((label, day) => (
              <button
                key={label}
                type="button"
                aria-pressed={draft.days.includes(day)}
                onClick={() => toggleDay(day)}
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

        <Field
          label="Travel time after (mins)"
          hint="Add a few minutes if this isn't at home, so nothing gets scheduled the instant it ends — lunch after school, say."
        >
          <TextInput
            type="number"
            min="0"
            max="120"
            step="5"
            value={draft.buffer_after_minutes}
            placeholder="0"
            onChange={(event) => setDraft({ ...draft, buffer_after_minutes: event.target.value })}
          />
        </Field>

        <p className="text-xs text-ink-faint">
          Something that runs past midnight, like sleep, goes in as two blocks — one up to 23:59 and
          one from 00:00.
        </p>

        {error && <p className="text-sm text-amber-800">{error}</p>}
      </div>
    </Modal>
  );
}

/** Assigns a week pattern to whichever calendar weeks it should replace the default for. */
function AssignWeeksDialog({ template, templates, term, open, onClose, onSaved }) {
  const [weeks, setWeeks] = useState([]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const termStart = term?.start_date ?? todayIso();

  useEffect(() => {
    if (open && template) {
      setWeeks(template.weeks ?? []);
      setError(null);
    }
  }, [open, template]);

  if (!template) return null;

  const defaultName = templates.find((candidate) => candidate.is_default)?.name ?? 'the default';

  const currentOwner = (week) => {
    const owner = templates.find((candidate) => candidate.id !== template.id && candidate.weeks.includes(week));
    return owner ? owner.name : defaultName;
  };

  const toggleWeek = (week) =>
    setWeeks((current) => (current.includes(week) ? current.filter((value) => value !== week) : [...current, week].sort((a, b) => a - b)));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const before = template.weeks ?? [];
      const toAssign = weeks.filter((week) => !before.includes(week));
      const toUnassign = before.filter((week) => !weeks.includes(week));
      if (toAssign.length > 0) await api.templates.assign(template.id, toAssign);
      if (toUnassign.length > 0) await api.templates.unassign(toUnassign);
      await onSaved(
        weeks.length === 0
          ? `"${template.name}" is not applied to any week now.`
          : `"${template.name}" now applies to ${weeks.length} week${weeks.length === 1 ? '' : 's'}.`
      );
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
      title={`Apply "${template.name}" to weeks`}
      description="Weeks you pick use this pattern instead of whatever would otherwise apply. Untick a week to put it back."
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
      <div className="grid max-h-72 grid-cols-4 gap-1.5 overflow-y-auto rounded-xl bg-paper-sunk p-2 sm:grid-cols-6">
        {Array.from({ length: 52 }, (_, index) => index + 1).map((week) => {
          const { from, until } = weekBounds(termStart, week);
          const isCurrent = weekNumberForDate(termStart, todayIso()) === week;
          const picked = weeks.includes(week);
          return (
            <button
              key={week}
              type="button"
              title={`${formatDate(from)} – ${formatDate(until)}${picked ? '' : ` · currently ${currentOwner(week)}`}`}
              aria-pressed={picked}
              onClick={() => toggleWeek(week)}
              className={`relative rounded-lg px-1.5 py-1.5 text-xs font-medium transition ${
                picked ? 'bg-sage-600 text-white' : 'bg-paper-raised text-ink-soft hover:bg-sage-100'
              }`}
            >
              {week}
              {isCurrent && (
                <span
                  aria-hidden="true"
                  className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${picked ? 'bg-white' : 'bg-sage-500'}`}
                />
              )}
            </button>
          );
        })}
      </div>
      {weeks.length > 0 && (
        <p className="mt-2 text-xs text-ink-faint">{summarizeWeeks(weeks)}.</p>
      )}
      {error && <p className="mt-2 text-sm text-amber-800">{error}</p>}
    </Modal>
  );
}

/** Adds or edits one extra, one-off thing that layers on top of whichever week pattern applies. */
function AnchorDialog({ anchor, term, open, onClose, onSaved }) {
  const [draft, setDraft] = useState(blank);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const termStart = term?.start_date ?? todayIso();

  useEffect(() => {
    if (!open) return;
    if (anchor) {
      setDraft({
        ...anchor,
        days: [anchor.day_of_week],
        buffer_after_minutes: anchor.buffer_after_minutes ?? '',
        scope: anchor.effective_from ? 'weeks' : 'always',
        weeks: anchor.effective_from ? [weekNumberForDate(termStart, anchor.effective_from)] : [],
      });
    } else {
      setDraft({ ...blank, days: [0] });
    }
    setError(null);
    // termStart only changes when the term settings load, which happens once
    // before this dialog can be opened — re-deriving on every render would
    // fight with the user's own week picks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, anchor]);

  const toggleWeek = (week) =>
    setDraft((current) => ({
      ...current,
      // Editing an existing extra occupies one week at a time — picking a
      // different one moves it rather than adding a second week to the same
      // row. Adding a brand new extra can span several at once.
      weeks: anchor
        ? [week]
        : current.weeks.includes(week)
          ? current.weeks.filter((value) => value !== week)
          : [...current.weeks, week].sort((a, b) => a - b),
    }));

  const toggleDay = (day) =>
    setDraft((current) => ({
      ...current,
      days: current.days.includes(day)
        ? current.days.filter((value) => value !== day)
        : [...current.days, day].sort(),
    }));

  const save = async () => {
    if (!draft.label.trim()) {
      setError('Give it a name — "Exam", "Extra class".');
      return;
    }
    if (draft.days.length === 0) {
      setError('Pick at least one day.');
      return;
    }
    if (draft.scope === 'weeks' && draft.weeks.length === 0) {
      setError('Pick at least one week, or switch back to "Every week".');
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
        buffer_after_minutes: draft.buffer_after_minutes === '' ? null : Number(draft.buffer_after_minutes),
      };

      // "Every week" clears any range; picking specific weeks sets one. An
      // existing range is only ever replaced here, never merged with itself.
      const rangeFor = (week) =>
        draft.scope === 'weeks'
          ? weekBounds(termStart, week)
          : { from: null, until: null };

      if (anchor) {
        const { from, until } = rangeFor(draft.weeks[0]);
        await api.anchors.update(anchor.id, {
          ...body,
          day_of_week: draft.days[0],
          effective_from: from,
          effective_until: until,
        });
        await onSaved(`${body.label} updated.`);
      } else {
        // One extra across several days — and, when scoped, several weeks —
        // is really one row per combination.
        const weeks = draft.scope === 'weeks' ? draft.weeks : [null];
        for (const day of draft.days) {
          for (const week of weeks) {
            const { from, until } = week === null ? { from: null, until: null } : rangeFor(week);
            await api.anchors.create({ ...body, day_of_week: day, effective_from: from, effective_until: until });
          }
        }
        const count = draft.days.length * weeks.length;
        await onSaved(
          count === 1
            ? `${body.label} added.`
            : `${body.label} added to ${count} slot${count === 1 ? '' : 's'}.`
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
      title={anchor ? `Edit ${anchor.label}` : 'Add something extra'}
      description={anchor ? null : 'On top of whichever week pattern applies — tick every day it happens.'}
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
            placeholder="Exam"
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

        <Field
          label="Travel time after (mins)"
          hint="Add a few minutes if this isn't at home, so nothing gets scheduled the instant it ends."
        >
          <TextInput
            type="number"
            min="0"
            max="120"
            step="5"
            value={draft.buffer_after_minutes}
            placeholder="0"
            onChange={(event) => setDraft({ ...draft, buffer_after_minutes: event.target.value })}
          />
        </Field>

        <p className="text-xs text-ink-faint">
          Something that runs past midnight, like sleep, goes in as two commitments — one up to
          23:59 and one from 00:00.
        </p>

        <div>
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Applies to
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setDraft({ ...draft, scope: 'always', weeks: [] })}
              aria-pressed={draft.scope === 'always'}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                draft.scope === 'always'
                  ? 'bg-sage-600 text-white'
                  : 'bg-paper-sunk text-ink-soft hover:bg-sage-100'
              }`}
            >
              Every week
            </button>
            <button
              type="button"
              onClick={() => setDraft((current) => ({ ...current, scope: 'weeks' }))}
              aria-pressed={draft.scope === 'weeks'}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                draft.scope === 'weeks'
                  ? 'bg-sage-600 text-white'
                  : 'bg-paper-sunk text-ink-soft hover:bg-sage-100'
              }`}
            >
              Just some weeks
            </button>
          </div>

          {draft.scope === 'weeks' && (
            <>
              <p className="mb-2 mt-3 text-xs text-ink-faint">
                {anchor
                  ? 'Pick the one week this applies to.'
                  : 'Pick every week this should happen — an exam, a run of extra classes.'}
              </p>
              <div className="grid max-h-48 grid-cols-4 gap-1.5 overflow-y-auto rounded-xl bg-paper-sunk p-2 sm:grid-cols-6">
                {Array.from({ length: 52 }, (_, index) => index + 1).map((week) => {
                  const { from, until } = weekBounds(termStart, week);
                  const isCurrent = weekNumberForDate(termStart, todayIso()) === week;
                  return (
                    <button
                      key={week}
                      type="button"
                      title={`${formatDate(from)} – ${formatDate(until)}`}
                      aria-pressed={draft.weeks.includes(week)}
                      onClick={() => toggleWeek(week)}
                      className={`relative rounded-lg px-1.5 py-1.5 text-xs font-medium transition ${
                        draft.weeks.includes(week)
                          ? 'bg-sage-600 text-white'
                          : 'bg-paper-raised text-ink-soft hover:bg-sage-100'
                      }`}
                    >
                      {week}
                      {isCurrent && (
                        <span
                          aria-hidden="true"
                          className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${
                            draft.weeks.includes(week) ? 'bg-white' : 'bg-sage-500'
                          }`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
              {draft.weeks.length > 0 && (
                <p className="mt-2 text-xs text-ink-faint">
                  {draft.weeks.length === 1
                    ? (() => {
                        const { from, until } = weekBounds(termStart, draft.weeks[0]);
                        return `Week ${draft.weeks[0]}: ${formatDate(from)} – ${formatDate(until)}`;
                      })()
                    : `${draft.weeks.length} weeks selected.`}
                </p>
              )}
            </>
          )}
        </div>

        {error && <p className="text-sm text-amber-800">{error}</p>}
      </div>
    </Modal>
  );
}

const durationLabel = (start, end) => {
  const total = toMinutes(end) - toMinutes(start);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return hours > 0 ? `${hours}h${mins ? ` ${mins}m` : ''}` : `${mins}m`;
};

/**
 * What's actually left for studying once everything else in the week is
 * accounted for — a repeatable weekly shape the student agrees to, rather
 * than the scheduler filling in whatever gap it finds. Proposing reads the
 * next two weeks of fixed commitments but never writes anything; only
 * saving what the student kept and adjusted does.
 */
const DAY_PARTS = ['morning', 'afternoon', 'evening', 'night'];

function StudyBlocksSection() {
  const toast = useToast();
  const [blocks, setBlocks] = useState(null); // null while loading
  const [draft, setDraft] = useState(null); // rows under review, or null
  const [saving, setSaving] = useState(false);
  const [editingBlock, setEditingBlock] = useState(null); // block or { day_of_week } for "new", or null
  const [deletingBlock, setDeletingBlock] = useState(null);

  const [formOpen, setFormOpen] = useState(false);
  const [dayParts, setDayParts] = useState({ morning: '', afternoon: '', evening: '', night: '' });
  const [notes, setNotes] = useState('');
  const [bridgeOpen, setBridgeOpen] = useState(false);
  const [promptAnchors, setPromptAnchors] = useState(null);

  const load = async () => setBlocks(await api.studyBlocks.list());

  useEffect(() => {
    load();
  }, []);

  if (blocks === null) return null;

  const byDay = DAY_LABELS.map((_, day) => blocks.filter((block) => block.day_of_week === day));

  const openBridge = async () => {
    try {
      const monday = startOfWeek(todayIso());
      setPromptAnchors(await api.anchors.effective(monday, addDays(monday, 6)));
      setFormOpen(false);
      setBridgeOpen(true);
    } catch (caught) {
      toast.warn(caught.message);
    }
  };

  const editDraftRow = (index, changes) =>
    setDraft((current) => current.map((row, i) => (i === index ? { ...row, ...changes } : row)));

  const saveDraft = async () => {
    setSaving(true);
    try {
      const kept = draft
        .filter((row) => row.keep)
        .map(({ day_of_week, start_time, end_time }) => ({ day_of_week, start_time, end_time }));
      const saved = await api.studyBlocks.save(kept);
      setBlocks(saved);
      setDraft(null);
      toast.celebrate('Study time set — this same shape repeats every week until you change it.');
    } catch (caught) {
      toast.warn(caught.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mb-8">
      <PageHeader
        eyebrow="What's left for studying"
        title="Study time"
        description="Once school, coaching, meals and travel are accounted for, these are the windows actually set aside for studying — the same shape every week. Subject scheduling only ever fills time inside them; a day left with none stays free."
        actions={
          <Button variant="primary" onClick={() => setFormOpen(true)}>
            {blocks.length > 0 ? 'Redesign with AI' : 'Design study time with AI'}
          </Button>
        }
      />

      {formOpen && (
        <Card className="mb-4 p-4">
          <h3 className="text-sm font-semibold text-ink">How much time do you actually have?</h3>
          <p className="mt-1 text-xs text-ink-faint">
            A general sense of a typical week is enough — the assistant already knows what's fixed. It'll design
            the actual blocks, mixing what each is good for, with breaks and leisure built in rather than every
            free minute becoming a study block.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {DAY_PARTS.map((part) => (
              <Field key={part} label={part[0].toUpperCase() + part.slice(1)}>
                <TextInput
                  value={dayParts[part]}
                  placeholder="e.g. maybe an hour on weekdays, more on weekends"
                  onChange={(event) => setDayParts((current) => ({ ...current, [part]: event.target.value }))}
                />
              </Field>
            ))}
          </div>
          <Field label="Anything else worth knowing (optional)" className="mt-3">
            <TextArea
              value={notes}
              rows={2}
              placeholder="Tired after Saturday coaching, prefers mornings for anything hard…"
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
          <div className="mt-3 flex gap-2">
            <Button variant="primary" onClick={openBridge}>
              Generate the prompt
            </Button>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <LLMBridge
        open={bridgeOpen}
        onClose={() => setBridgeOpen(false)}
        title="Design study time together"
        purpose="This app never contacts an AI service — copy the prompt across yourself, then bring the reply back. Nothing is saved until you review and confirm it below."
        prompt={promptAnchors ? studyBlockPrompt({ anchors: promptAnchors, dayParts, notes }) : ''}
        schema={studyBlockSchema}
        saveLabel="Review these blocks"
        renderPreview={(data) => (
          <p className="text-sm text-ink-soft">{data.blocks.length} study block{data.blocks.length === 1 ? '' : 's'} proposed.</p>
        )}
        onSave={(data) => {
          setDraft(data.blocks.map((row, index) => ({ ...row, key: index, keep: true })));
          setBridgeOpen(false);
        }}
      />

      {draft && (
        <Card className="mb-4 p-4">
          <h3 className="text-sm font-semibold text-ink">Here's what it came back with — tick what you want, adjust the rest</h3>
          <p className="mt-1 text-xs text-ink-faint">
            Nothing is saved yet. Move a start time or shorten one to fit real logistics, or untick anything you'd
            rather leave open.
          </p>
          <ul className="mt-3 space-y-2">
            {draft.map((row, index) => (
              <li
                key={row.key}
                className={`flex flex-wrap items-center gap-2 rounded-lg bg-black/[0.03] px-2 py-2 ${row.keep ? '' : 'opacity-50'}`}
              >
                <input
                  type="checkbox"
                  checked={row.keep}
                  onChange={(event) => editDraftRow(index, { keep: event.target.checked })}
                />
                <span className="w-9 shrink-0 text-[11px] font-medium text-ink-soft">
                  {DAY_LABELS[row.day_of_week].slice(0, 3)}
                </span>
                <input
                  type="time"
                  step="300"
                  value={row.start_time}
                  onChange={(event) => editDraftRow(index, { start_time: event.target.value })}
                  className="rounded-lg border border-black/10 bg-white px-2 py-1 text-sm text-ink"
                />
                <span className="text-ink-faint">–</span>
                <input
                  type="time"
                  step="300"
                  value={row.end_time}
                  onChange={(event) => editDraftRow(index, { end_time: event.target.value })}
                  className="rounded-lg border border-black/10 bg-white px-2 py-1 text-sm text-ink"
                />
                <span className="text-[11px] text-ink-faint">{durationLabel(row.start_time, row.end_time)}</span>
                {row.note && <span className="w-full text-[11px] italic text-ink-faint sm:w-auto">{row.note}</span>}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <Button variant="primary" onClick={saveDraft} disabled={saving}>
              {saving ? 'Saving…' : 'Save study time'}
            </Button>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={saving}>
              Discard
            </Button>
          </div>
        </Card>
      )}

      {!draft && blocks.length === 0 && (
        <EmptyState title="No study time set yet.">
          Say how much time you actually have and design it with AI — a proper weekly shape, not just whatever
          gaps are left. Until then, subject scheduling is free to use any open gap in the day.
        </EmptyState>
      )}

      {!draft && blocks.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DAY_LABELS.map((dayLabel, day) => (
            <Card key={dayLabel} className="p-4">
              <h2 className="text-sm font-semibold text-ink">{dayLabel}</h2>
              {byDay[day].length === 0 ? (
                <p className="mt-2 text-xs text-ink-faint">No study time this day.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {byDay[day].map((block) => (
                    <li
                      key={block.id}
                      className={`flex items-center gap-2 rounded-lg bg-sage-50 px-2 py-1.5 ${block.is_active ? '' : 'opacity-50'}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-ink">
                          {friendlyTime(block.start_time)}–{friendlyTime(block.end_time)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingBlock(block)}
                        className="text-[11px] text-ink-faint underline-offset-2 hover:text-ink hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingBlock(block)}
                        className="text-[11px] text-ink-faint underline-offset-2 hover:text-ink hover:underline"
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="mt-2"
                onClick={() => setEditingBlock({ day_of_week: day, start_time: '16:00', end_time: '18:00' })}
              >
                Add a block
              </Button>
            </Card>
          ))}
        </div>
      )}

      <StudyBlockDialog
        block={editingBlock}
        open={Boolean(editingBlock)}
        onClose={() => setEditingBlock(null)}
        onSaved={async (message) => {
          await load();
          setEditingBlock(null);
          toast.celebrate(message);
        }}
      />

      <ConfirmDialog
        open={Boolean(deletingBlock)}
        onClose={() => setDeletingBlock(null)}
        onConfirm={async () => {
          try {
            await api.studyBlocks.remove(deletingBlock.id);
            setDeletingBlock(null);
            await load();
            toast.celebrate('Removed.');
          } catch (caught) {
            toast.warn(caught.message);
          }
        }}
        title="Remove this study time?"
        confirmLabel="Remove it"
      >
        Subject scheduling will no longer use this window.
      </ConfirmDialog>
    </section>
  );
}

/** Adds or edits one hand-picked study window — day, start and end only, nothing else to set. */
function StudyBlockDialog({ block, open, onClose, onSaved }) {
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(block ? { ...block } : { day_of_week: 0, start_time: '16:00', end_time: '18:00' });
    setError(null);
  }, [open, block]);

  if (!open || !draft) return null;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = { day_of_week: draft.day_of_week, start_time: draft.start_time, end_time: draft.end_time };
      if (draft.id) {
        await api.studyBlocks.update(draft.id, body);
        await onSaved('Updated.');
      } else {
        await api.studyBlocks.create(body);
        await onSaved('Added.');
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
      title={draft.id ? 'Edit study time' : 'Add study time'}
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
        <div>
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-soft">Day</span>
          <div className="flex flex-wrap gap-1.5">
            {DAY_LABELS.map((label, day) => (
              <button
                key={label}
                type="button"
                aria-pressed={draft.day_of_week === day}
                onClick={() => setDraft((current) => ({ ...current, day_of_week: day }))}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  draft.day_of_week === day
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
              onChange={(event) => setDraft((current) => ({ ...current, start_time: event.target.value }))}
            />
          </Field>
          <Field label="Ends">
            <TextInput
              type="time"
              step="300"
              value={draft.end_time}
              onChange={(event) => setDraft((current) => ({ ...current, end_time: event.target.value }))}
            />
          </Field>
        </div>

        {error && <p className="text-sm text-amber-800">{error}</p>}
      </div>
    </Modal>
  );
}
