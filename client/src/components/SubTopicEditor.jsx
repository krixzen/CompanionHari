import { useState } from 'react';
import { Button, TextInput } from './ui.jsx';

/** Edits the list of sub-topics under a topic: add, rename, remove. */
export function SubTopicEditor({ value = [], onChange }) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onChange([...value, trimmed]);
    setDraft('');
  };

  const replace = (index, text) => {
    const next = [...value];
    next[index] = text;
    onChange(next);
  };

  const remove = (index) => onChange(value.filter((_, position) => position !== index));

  return (
    <div className="space-y-2">
      {value.map((subTopic, index) => (
        // Sub-topics can repeat while being typed, so position is the only
        // stable key here.
        // eslint-disable-next-line react/no-array-index-key
        <div key={index} className="flex items-center gap-2">
          <span aria-hidden="true" className="text-ink-faint">
            ·
          </span>
          <TextInput
            value={subTopic}
            onChange={(event) => replace(index, event.target.value)}
            aria-label={`Sub-topic ${index + 1}`}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => remove(index)}
            aria-label={`Remove ${subTopic || 'this sub-topic'}`}
          >
            Remove
          </Button>
        </div>
      ))}

      <div className="flex items-center gap-2 pl-4">
        <TextInput
          value={draft}
          placeholder="Add a sub-topic…"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
          aria-label="New sub-topic"
        />
        <Button size="sm" onClick={add} disabled={!draft.trim()}>
          Add
        </Button>
      </div>
    </div>
  );
}
