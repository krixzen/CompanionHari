import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { PageHeader } from '../components/AppShell.jsx';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';
import { Modal } from '../components/Modal.jsx';
import { SubjectDot } from '../components/bits.jsx';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote as ErrorBanner,
  Select,
  Spinner,
  TextArea,
  TextInput,
} from '../components/ui.jsx';
import { useStudyData } from '../hooks/useStudyData.jsx';
import { useToast } from '../hooks/useToast.jsx';
import { formatDate } from '../lib/format.js';
import { ERROR_TAGS, ERROR_TAG_META } from '../lib/practice.js';
import { todayIso } from '../lib/week.js';

/**
 * The error notebook: one row per wrong question, tagged with why it went
 * wrong. After a month the tag counts say exactly what to work on —
 * mostly C means back to theory, mostly S means slow down and write
 * cleaner steps, and so on.
 */
export default function ErrorNotebookPage() {
  const { subjects, status: dataStatus } = useStudyData();
  const toast = useToast();

  const [notes, setNotes] = useState(null);
  const [error, setError] = useState(null);
  const [counts, setCounts] = useState(null);

  const [subjectFilter, setSubjectFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [dueOnly, setDueOnly] = useState(false);

  const [editing, setEditing] = useState(null); // note, or 'new'
  const [deleting, setDeleting] = useState(null);

  const load = async () => {
    try {
      const [loadedNotes, loadedCounts] = await Promise.all([
        api.errorNotes.list({
          subject_id: subjectFilter || undefined,
          tag: tagFilter || undefined,
          due: dueOnly ? 'true' : undefined,
        }),
        api.errorNotes.summary(),
      ]);
      setNotes(loadedNotes);
      setCounts(loadedCounts);
      setError(null);
    } catch (caught) {
      setError(caught.message);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectFilter, tagFilter, dueOnly]);

  const totalCounted = counts ? ERROR_TAGS.reduce((sum, tag) => sum + counts[tag.value], 0) : 0;

  const saveNote = async (draft) => {
    if (editing === 'new') await api.errorNotes.create(draft);
    else await api.errorNotes.update(editing.id, draft);
    setEditing(null);
    await load();
    toast.celebrate(editing === 'new' ? 'Added to the notebook.' : 'Updated.');
  };

  const toggleRedone = async (note) => {
    try {
      await api.errorNotes.update(note.id, { redone: !note.redone });
      await load();
    } catch (caught) {
      toast.warn(caught.message);
    }
  };

  const removeNote = async () => {
    try {
      await api.errorNotes.remove(deleting.id);
      setDeleting(null);
      await load();
      toast.celebrate('Removed.');
    } catch (caught) {
      toast.warn(caught.message);
    }
  };

  if (dataStatus === 'loading' || notes === null) return <Spinner label="Loading the error notebook…" />;
  if (error) return <ErrorBanner onRetry={load}>{error}</ErrorBanner>;

  const today = todayIso();
  const filtering = Boolean(subjectFilter || tagFilter || dueOnly);

  return (
    <div>
      <PageHeader
        eyebrow="One wrong question at a time"
        title="Error notebook"
        description="Question source, what went wrong, the right idea, and a re-do date two weeks out. A question isn't done until it's been solved cold, from scratch."
        actions={<Button variant="primary" onClick={() => setEditing('new')}>Add an entry</Button>}
      />

      {totalCounted > 0 && (
        <Card className="mb-6 p-4">
          <h2 className="text-sm font-semibold text-ink">The tag distribution says what to fix</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {ERROR_TAGS.map((tag) => (
              <div key={tag.value}>
                <p className="text-xs text-ink-faint">
                  {tag.value} · {tag.label}
                </p>
                <p className="mt-0.5 text-lg font-semibold text-ink">{counts[tag.value]}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="w-[48%] sm:w-48">
          <Select
            value={subjectFilter}
            onChange={(event) => setSubjectFilter(event.target.value)}
            aria-label="Filter by subject"
          >
            <option value="">Any subject</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-[48%] sm:w-48">
          <Select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)} aria-label="Filter by tag">
            <option value="">Any tag</option>
            {ERROR_TAGS.map((tag) => (
              <option key={tag.value} value={tag.value}>
                {tag.value} · {tag.label}
              </option>
            ))}
          </Select>
        </div>
        <Button
          size="sm"
          variant={dueOnly ? 'primary' : 'ghost'}
          onClick={() => setDueOnly((current) => !current)}
        >
          Due for re-do
        </Button>
        {filtering && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSubjectFilter('');
              setTagFilter('');
              setDueOnly(false);
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {notes.length === 0 ? (
        <EmptyState
          title={filtering ? 'Nothing matches that just now.' : 'Nothing logged yet.'}
          action={filtering ? null : <Button variant="primary" onClick={() => setEditing('new')}>Add the first one</Button>}
        >
          {filtering
            ? 'Try a different filter, or clear them.'
            : 'Every wrong question in a module, a PYQ set or a timed test goes here — tag it, and it comes back for a re-do two weeks later.'}
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => {
            const overdue = !note.redone && note.redo_date < today;
            return (
              <Card key={note.id} className={`p-3 sm:p-4 ${note.redone ? 'opacity-60' : ''}`}>
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={note.redone}
                    onChange={() => toggleRedone(note)}
                    className="mt-1 h-4 w-4 shrink-0 rounded border-black/20 text-sage-600 focus:ring-sage-400"
                    aria-label={`Mark ${note.source} as re-done`}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                        style={{ backgroundColor: tagColour(note.tag) }}
                        title={ERROR_TAG_META[note.tag].hint}
                      >
                        {note.tag}
                      </span>
                      <SubjectDot colour={note.subject_colour} />
                      <span className="text-xs text-ink-faint">{note.subject_name}</span>
                      {note.tracking_number && (
                        <span className="font-mono text-xs text-ink-faint">
                          {note.tracking_number} {note.topic_title}
                        </span>
                      )}
                    </div>

                    <p className={`mt-1 font-medium text-ink ${note.redone ? 'line-through' : ''}`}>
                      {note.source}
                    </p>
                    {note.mistake && <p className="mt-0.5 text-sm text-ink-soft">{note.mistake}</p>}
                    {note.correct_idea && (
                      <p className="mt-0.5 text-sm text-sage-700">→ {note.correct_idea}</p>
                    )}

                    <p className={`mt-1.5 text-xs ${overdue ? 'font-medium text-amber-700' : 'text-ink-faint'}`}>
                      {note.redone
                        ? `Re-done ${formatDate(note.redone_at)}`
                        : overdue
                          ? `Re-do was due ${formatDate(note.redo_date)}`
                          : `Re-do on ${formatDate(note.redo_date)}`}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(note)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleting(note)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ErrorNoteDialog
        note={editing === 'new' ? null : editing}
        open={Boolean(editing)}
        subjects={subjects}
        onClose={() => setEditing(null)}
        onSave={saveNote}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={removeNote}
        title="Delete this entry?"
        confirmLabel="Delete"
      >
        {`"${deleting?.source}" will be removed. There is no undo.`}
      </ConfirmDialog>
    </div>
  );
}

const TAG_COLOURS = { C: '#c0392b', A: '#c07a3e', S: '#7c6bb0', T: '#3f7fa8' };
const tagColour = (tag) => TAG_COLOURS[tag] ?? '#8b91a1';

const blankDraft = () => ({
  subject_id: '',
  topic_id: '',
  source: '',
  tag: 'S',
  mistake: '',
  correct_idea: '',
  redo_date: '',
});

function ErrorNoteDialog({ note, open, subjects, onClose, onSave }) {
  const [draft, setDraft] = useState(blankDraft());
  const [topics, setTopics] = useState([]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(
      note
        ? {
            subject_id: String(note.subject_id),
            topic_id: note.topic_id ? String(note.topic_id) : '',
            source: note.source,
            tag: note.tag,
            mistake: note.mistake ?? '',
            correct_idea: note.correct_idea ?? '',
            redo_date: note.redo_date,
          }
        : { ...blankDraft(), subject_id: subjects[0] ? String(subjects[0].id) : '' }
    );
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, note]);

  useEffect(() => {
    if (!draft.subject_id) {
      setTopics([]);
      return;
    }
    let cancelled = false;
    api.topics.list({ subject_id: draft.subject_id }).then((loaded) => {
      if (!cancelled) setTopics(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [draft.subject_id]);

  const save = async () => {
    if (!draft.subject_id) {
      setError('Pick which subject this belongs to.');
      return;
    }
    if (!draft.source.trim()) {
      setError('Say where the question came from.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        subject_id: Number(draft.subject_id),
        topic_id: draft.topic_id ? Number(draft.topic_id) : null,
        source: draft.source.trim(),
        tag: draft.tag,
        mistake: draft.mistake.trim() || null,
        correct_idea: draft.correct_idea.trim() || null,
        redo_date: draft.redo_date || undefined,
      });
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
      title={note ? 'Edit entry' : 'Add to the error notebook'}
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
          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Subject
            </span>
            <Select
              value={draft.subject_id}
              onChange={(event) => setDraft({ ...draft, subject_id: event.target.value, topic_id: '' })}
            >
              <option value="" disabled>
                Choose a subject
              </option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Chapter (optional)
            </span>
            <Select
              value={draft.topic_id}
              onChange={(event) => setDraft({ ...draft, topic_id: event.target.value })}
              disabled={topics.length === 0}
            >
              <option value="">Not linked to a chapter</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.tracking_number} {topic.title}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Question source
          </span>
          <TextInput
            value={draft.source}
            placeholder="Aakash Module Set 3 Q7"
            onChange={(event) => setDraft({ ...draft, source: event.target.value })}
            autoFocus
          />
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-soft">Tag</span>
          <div className="flex flex-wrap gap-1.5">
            {ERROR_TAGS.map((tag) => (
              <button
                key={tag.value}
                type="button"
                aria-pressed={draft.tag === tag.value}
                onClick={() => setDraft({ ...draft, tag: tag.value })}
                title={tag.hint}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  draft.tag === tag.value ? 'text-white' : 'bg-paper-sunk text-ink-soft hover:bg-sage-100'
                }`}
                style={draft.tag === tag.value ? { backgroundColor: tagColour(tag.value) } : undefined}
              >
                {tag.value} · {tag.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-ink-faint">{ERROR_TAG_META[draft.tag].hint}</p>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
            What went wrong
          </span>
          <TextArea
            value={draft.mistake}
            rows={2}
            placeholder="Sign error in the final step"
            onChange={(event) => setDraft({ ...draft, mistake: event.target.value })}
          />
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
            The correct idea
          </span>
          <TextArea
            value={draft.correct_idea}
            rows={2}
            placeholder="Careful with the direction convention"
            onChange={(event) => setDraft({ ...draft, correct_idea: event.target.value })}
          />
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Re-do date
          </span>
          <TextInput
            type="date"
            value={draft.redo_date}
            placeholder="Two weeks out by default"
            onChange={(event) => setDraft({ ...draft, redo_date: event.target.value })}
          />
          <p className="mt-1 text-xs text-ink-faint">Left blank, this defaults to two weeks from today.</p>
        </div>

        {error && <p className="text-sm text-amber-800">{error}</p>}
      </div>
    </Modal>
  );
}
