import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { LLMBridge } from './LLMBridge.jsx';
import { Modal } from './Modal.jsx';
import { SubTopicEditor } from './SubTopicEditor.jsx';
import { Button, Field, Select, TextArea, TextInput } from './ui.jsx';
import { useToast } from '../hooks/useToast.jsx';
import { DIFFICULTY_LABELS, STATUS_LABELS, STATUS_ORDER } from '../lib/format.js';
import { topicNotesPrompt } from '../lib/prompts.js';
import { topicNotesSchema } from '../lib/schemas.js';

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
  const toast = useToast();
  const [draft, setDraft] = useState(blank);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Study notes are a separate, AI-generated field: saved straight to the
  // topic the moment they're confirmed, independent of the rest of this form.
  const [notes, setNotes] = useState({ key_concepts: null, resources: [] });
  const [notesBridgeOpen, setNotesBridgeOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(fromTopic(topic));
      setNotes({ key_concepts: topic?.key_concepts ?? null, resources: topic?.resources ?? [] });
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
            numberPrefix={topic ? `${topic.tracking_number}/` : undefined}
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

        {topic && (
          <div className="rounded-xl2 bg-paper-sunk p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                Study notes
              </span>
              <Button size="sm" onClick={() => setNotesBridgeOpen(true)}>
                {notes.key_concepts ? 'Regenerate' : 'Generate study notes'}
              </Button>
            </div>

            {notes.key_concepts ? (
              <div className="space-y-2 text-sm">
                <p className="whitespace-pre-line text-ink-soft">{notes.key_concepts}</p>
                {notes.resources.length > 0 && (
                  <ul className="space-y-1 border-t border-black/5 pt-2">
                    {notes.resources.map((resource) => (
                      <li key={resource.title} className="text-xs text-ink-soft">
                        <span className="font-medium text-ink">{resource.title}</span>
                        {resource.type ? ` · ${resource.type}` : ''}
                        {resource.note ? ` — ${resource.note}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="text-xs text-ink-faint">
                Not generated yet — ask Claude or ChatGPT for a quick summary and a few resources to
                look at.
              </p>
            )}
          </div>
        )}
      </div>

      {topic && (
        <LLMBridge
          open={notesBridgeOpen}
          onClose={() => setNotesBridgeOpen(false)}
          title={`Study notes for ${topic.tracking_number}`}
          purpose="This app never contacts an AI service — copy the prompt across yourself, then bring the reply back."
          prompt={topicNotesPrompt({ topic })}
          schema={topicNotesSchema}
          saveLabel="Save these notes"
          renderPreview={(data) => (
            <div className="space-y-2 text-sm">
              <p className="whitespace-pre-line text-ink-soft">{data.key_concepts}</p>
              {data.resources?.length > 0 && (
                <ul className="space-y-1 border-t border-black/5 pt-2">
                  {data.resources.map((resource) => (
                    <li key={resource.title} className="text-xs text-ink-soft">
                      <span className="font-medium text-ink">{resource.title}</span>
                      {resource.type ? ` · ${resource.type}` : ''}
                      {resource.note ? ` — ${resource.note}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          onSave={async (data) => {
            const resources = data.resources ?? [];
            await api.topics.update(topic.id, { key_concepts: data.key_concepts, resources });
            setNotes({ key_concepts: data.key_concepts, resources });
            setNotesBridgeOpen(false);
            toast.celebrate('Study notes saved.');
          }}
        />
      )}
    </Modal>
  );
}
