import { useEffect, useState } from 'react';
import { Modal } from './Modal.jsx';
import { SubTopicEditor } from './SubTopicEditor.jsx';
import { Button, Field, Select, TextArea, TextInput } from './ui.jsx';
import { DIFFICULTY_LABELS, STATUS_LABELS, STATUS_ORDER } from '../lib/format.js';

const blank = {
  title: '',
  unit: '',
  sub_topics: [],
  allocated_duration_minutes: 60,
  difficulty: 3,
  status: 'not_started',
  target_date: '',
  notes: '',
};

const fromTopic = (topic) =>
  topic
    ? {
        title: topic.title ?? '',
        unit: topic.unit ?? '',
        sub_topics: topic.sub_topics ?? [],
        allocated_duration_minutes: topic.allocated_duration_minutes ?? 60,
        difficulty: topic.difficulty ?? 3,
        status: topic.status ?? 'not_started',
        target_date: topic.target_date ?? '',
        notes: topic.notes ?? '',
      }
    : blank;

/** Add or edit a single topic. Used from the topic list. */
export function TopicForm({ open, onClose, onSave, topic, subjectName }) {
  const [draft, setDraft] = useState(blank);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(fromTopic(topic));
      setError(null);
    }
  }, [open, topic]);

  const set = (field) => (event) => setDraft((current) => ({ ...current, [field]: event.target.value }));

  const save = async () => {
    if (!draft.title.trim()) {
      setError('Give the topic a title first.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        ...draft,
        title: draft.title.trim(),
        unit: draft.unit.trim() || null,
        target_date: draft.target_date || null,
        notes: draft.notes.trim() || null,
        allocated_duration_minutes: Number(draft.allocated_duration_minutes) || 60,
        difficulty: Number(draft.difficulty) || 3,
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
      size="lg"
      title={topic ? `Edit ${topic.tracking_number}` : `New topic in ${subjectName}`}
      description={topic ? topic.title : 'Useful when the syllabus is short, or something was missed.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save topic'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Title">
          <TextInput value={draft.title} onChange={set('title')} placeholder="Motion in a Straight Line" />
        </Field>

        <Field label="Unit or chapter" hint="Optional — helps group topics from the same part of the syllabus.">
          <TextInput value={draft.unit} onChange={set('unit')} placeholder="Unit II — Kinematics" />
        </Field>

        <div>
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Sub-topics
          </span>
          <SubTopicEditor
            value={draft.sub_topics}
            onChange={(sub_topics) => setDraft((current) => ({ ...current, sub_topics }))}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Study time" hint="In minutes. You can change this any time.">
            <TextInput
              type="number"
              min="5"
              max="1440"
              step="5"
              value={draft.allocated_duration_minutes}
              onChange={set('allocated_duration_minutes')}
            />
          </Field>

          <Field label="How hard does it feel?">
            <Select value={draft.difficulty} onChange={set('difficulty')}>
              {[1, 2, 3, 4, 5].map((level) => (
                <option key={level} value={level}>
                  {level} — {DIFFICULTY_LABELS[level]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Where you are with it">
            <Select value={draft.status} onChange={set('status')}>
              {STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Aiming to finish by" hint="Optional.">
            <TextInput type="date" value={draft.target_date ?? ''} onChange={set('target_date')} />
          </Field>
        </div>

        <Field label="Notes" hint="Anything worth remembering — a page reference, a worked example, a worry.">
          <TextArea rows={3} value={draft.notes} onChange={set('notes')} />
        </Field>

        {error && <p className="text-sm text-amber-800">{error}</p>}
      </div>
    </Modal>
  );
}
