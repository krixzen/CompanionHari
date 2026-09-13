import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { PageHeader } from '../components/AppShell.jsx';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';
import { Modal } from '../components/Modal.jsx';
import { DragHandle, SortableList, SortableRow } from '../components/SortableList.jsx';
import { SubjectDot } from '../components/bits.jsx';
import { Button, Card, ErrorNote, Field, Spinner, TextInput } from '../components/ui.jsx';
import { useStudyData } from '../hooks/useStudyData.jsx';
import { useToast } from '../hooks/useToast.jsx';
import { formatMinutes } from '../lib/format.js';

// Calm, distinguishable choices — these become calendar blocks in Phase 2.
const PALETTE = [
  '#4f8a73', '#3f7fa8', '#7c6bb0', '#b05f7a', '#c07a3e',
  '#8a8f4f', '#5f8fb0', '#a0616a', '#6f7a8a', '#3d6f5c',
];

export default function SubjectsPage() {
  const { subjects, setSubjects, status, error, reload, refreshSubjects } = useStudyData();
  const toast = useToast();

  const [editing, setEditing] = useState(null); // subject object, or 'new'
  const [deleting, setDeleting] = useState(null);

  if (status === 'loading') return <Spinner label="Loading your subjects…" />;
  if (status === 'error') return <ErrorNote onRetry={reload}>{error}</ErrorNote>;

  const reorder = async (order) => {
    const previous = subjects;
    // Move it on screen first; put it back if the server disagrees.
    setSubjects(order.map((id) => subjects.find((subject) => subject.id === id)));
    try {
      setSubjects(await api.subjects.reorder(order));
    } catch (caught) {
      setSubjects(previous);
      toast.warn(caught.message);
    }
  };

  const remove = async (subject) => {
    try {
      await api.subjects.remove(subject.id);
      await refreshSubjects();
      setDeleting(null);
      toast.celebrate(`${subject.name} removed.`);
    } catch (caught) {
      toast.warn(caught.message);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Subjects"
        title="What you are studying"
        description="Drag to put them in the order you think about them. Each colour shows up on the calendar later."
        actions={
          <Button variant="primary" onClick={() => setEditing('new')}>
            Add a subject
          </Button>
        }
      />

      <SortableList ids={subjects.map((subject) => subject.id)} onReorder={reorder}>
        <div className="space-y-2">
          {subjects.map((subject) => (
            <SortableRow key={subject.id} id={subject.id}>
              {({ handleProps }) => (
                <Card className="flex items-center gap-3 p-3 sm:p-4">
                  <DragHandle handleProps={handleProps} label={`Reorder ${subject.name}`} />
                  <SubjectDot colour={subject.colour} className="h-3 w-3" />

                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/subjects/${subject.id}`}
                      className="block truncate font-medium text-ink underline-offset-2 hover:underline"
                    >
                      {subject.name}
                    </Link>
                    <p className="truncate text-xs text-ink-faint">
                      <span className="font-mono">{subject.code}-001</span>
                      {' · '}
                      {subject.topic_count === 0
                        ? 'no topics yet'
                        : `${subject.topic_count} topics · ${formatMinutes(subject.allocated_minutes)}`}
                    </p>
                  </div>

                  <Button size="sm" variant="ghost" onClick={() => setEditing(subject)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(subject)}>
                    Delete
                  </Button>
                </Card>
              )}
            </SortableRow>
          ))}
        </div>
      </SortableList>

      <SubjectDialog
        subject={editing === 'new' ? null : editing}
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        onSaved={async (message) => {
          await refreshSubjects();
          setEditing(null);
          toast.celebrate(message);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => remove(deleting)}
        title={`Delete ${deleting?.name}?`}
        confirmLabel="Delete subject"
      >
        {deleting?.topic_count
          ? `This also removes its ${deleting.topic_count} topics and everything recorded against them. There is no undo.`
          : 'It has no topics in it, so nothing else is affected.'}
      </ConfirmDialog>
    </div>
  );
}

function SubjectDialog({ subject, open, onClose, onSaved }) {
  const [draft, setDraft] = useState({ name: '', code: '', colour: PALETTE[0] });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [key, setKey] = useState(0);

  // Refill the form whenever a different subject is opened.
  const signature = `${open}-${subject?.id ?? 'new'}`;
  if (key !== signature) {
    setKey(signature);
    setDraft({
      name: subject?.name ?? '',
      code: subject?.code ?? '',
      colour: subject?.colour ?? PALETTE[0],
    });
    setError(null);
  }

  const save = async () => {
    if (!draft.name.trim()) {
      setError('Give the subject a name.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (subject) {
        await api.subjects.update(subject.id, {
          name: draft.name.trim(),
          code: draft.code.trim() || undefined,
          colour: draft.colour,
        });
        await onSaved(`${draft.name.trim()} updated.`);
      } else {
        await api.subjects.create({
          name: draft.name.trim(),
          code: draft.code.trim() || undefined,
          colour: draft.colour,
        });
        await onSaved(`${draft.name.trim()} added.`);
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
      title={subject ? `Edit ${subject.name}` : 'Add a subject'}
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
        <Field label="Name">
          <TextInput
            value={draft.name}
            placeholder="Biology"
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </Field>

        <Field
          label="Tracking prefix"
          hint={
            subject
              ? 'Topics already saved keep the numbers they have. New ones use this.'
              : 'Leave empty and one is worked out from the name.'
          }
        >
          <TextInput
            value={draft.code}
            placeholder="BIO"
            maxLength={8}
            className="font-mono uppercase"
            onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase() })}
          />
        </Field>

        <div>
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Colour
          </span>
          <div className="flex flex-wrap gap-2">
            {PALETTE.map((colour) => (
              <button
                key={colour}
                type="button"
                aria-label={`Use colour ${colour}`}
                aria-pressed={draft.colour === colour}
                onClick={() => setDraft({ ...draft, colour })}
                className={`h-8 w-8 rounded-full transition ${
                  draft.colour === colour ? 'ring-2 ring-ink ring-offset-2' : 'hover:scale-110'
                }`}
                style={{ backgroundColor: colour }}
              />
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-amber-800">{error}</p>}
      </div>
    </Modal>
  );
}
