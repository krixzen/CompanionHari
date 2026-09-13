import { useEffect, useState } from 'react';
import { Modal } from './Modal.jsx';
import { Button, Field, TextArea, TextInput } from './ui.jsx';

const blank = { test_name: '', test_date: '', source: '', total_marks: '', marks_obtained: '', notes: '' };

const fromTest = (test) =>
  test
    ? {
        test_name: test.test_name ?? '',
        test_date: test.test_date ?? '',
        source: test.source ?? '',
        total_marks: test.total_marks ?? '',
        marks_obtained: test.marks_obtained ?? '',
        notes: test.notes ?? '',
      }
    : blank;

/** Add or edit a test's own record — the score, not the per-question detail. */
export function TestForm({ open, onClose, onSave, test }) {
  const [draft, setDraft] = useState(blank);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(fromTest(test));
      setError(null);
    }
  }, [open, test]);

  const set = (field) => (event) => setDraft((current) => ({ ...current, [field]: event.target.value }));

  const save = async () => {
    if (!draft.test_name.trim()) {
      setError('Give the test a name.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        test_name: draft.test_name.trim(),
        test_date: draft.test_date || null,
        source: draft.source.trim() || null,
        total_marks: draft.total_marks === '' ? null : Number(draft.total_marks),
        marks_obtained: draft.marks_obtained === '' ? null : Number(draft.marks_obtained),
        notes: draft.notes.trim() || null,
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
      title={test ? `Edit ${test.test_name}` : 'Add a test'}
      description="The overall record. The question-by-question breakdown comes next, on the test's own page."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save test'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Test name">
          <TextInput
            value={draft.test_name}
            onChange={set('test_name')}
            placeholder="Aakash Weekly Test 4"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" hint="Optional.">
            <TextInput type="date" value={draft.test_date} onChange={set('test_date')} />
          </Field>
          <Field label="Source" hint="Optional — who set it.">
            <TextInput value={draft.source} onChange={set('source')} placeholder="Aakash, school, self" />
          </Field>
          <Field label="Total marks" hint="Optional.">
            <TextInput type="number" min="0" step="0.5" value={draft.total_marks} onChange={set('total_marks')} />
          </Field>
          <Field label="Marks obtained" hint="Optional.">
            <TextInput
              type="number"
              min="0"
              step="0.5"
              value={draft.marks_obtained}
              onChange={set('marks_obtained')}
            />
          </Field>
        </div>

        <Field label="Notes" hint="How it felt, anything unusual — this feeds into the analysis later.">
          <TextArea rows={3} value={draft.notes} onChange={set('notes')} />
        </Field>

        {error && <p className="text-sm text-amber-800">{error}</p>}
      </div>
    </Modal>
  );
}
