import { useEffect, useState } from 'react';
import { Button, Select, TextInput } from './ui.jsx';

let draftKey = 0;
const toDraft = (row) => ({
  key: `row-${(draftKey += 1)}`,
  id: row.id ?? null,
  question_number: row.question_number ?? '',
  subject_id: row.subject_id ?? '',
  topic_id: row.topic_id ?? '',
  attempted: Boolean(row.attempted),
  correct: Boolean(row.correct),
  marks: row.marks ?? '',
  time_taken_seconds: row.time_taken_seconds ?? '',
});

const blankRow = (nextNumber) => toDraft({ question_number: nextNumber });

/**
 * The question-by-question breakdown for one test.
 *
 * Edited entirely as a local draft — add a row, tick a box, pick a topic —
 * and written to the database in one go with "Save results", the same
 * review-before-write shape as everywhere else in the app.
 */
export function TestResultsTable({ results, subjects, topics, onSave, saving }) {
  const [rows, setRows] = useState(() => results.map(toDraft));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setRows(results.map(toDraft));
    setDirty(false);
  }, [results]);

  const update = (key, changes) => {
    setRows((current) =>
      current.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row, ...changes };
        // Clearing the subject clears whatever topic was chosen under it.
        if ('subject_id' in changes && changes.subject_id !== row.subject_id) next.topic_id = '';
        // A question can't be correct without having been attempted.
        if ('attempted' in changes && !changes.attempted) next.correct = false;
        return next;
      })
    );
    setDirty(true);
  };

  const addRow = () => {
    const nextNumber = rows.length ? Math.max(...rows.map((r) => Number(r.question_number) || 0)) + 1 : 1;
    setRows((current) => [...current, blankRow(nextNumber)]);
    setDirty(true);
  };

  const removeRow = (key) => {
    setRows((current) => current.filter((row) => row.key !== key));
    setDirty(true);
  };

  const save = async () => {
    await onSave(
      rows.map((row) => ({
        question_number: row.question_number === '' ? null : Number(row.question_number),
        subject_id: row.subject_id === '' ? null : Number(row.subject_id),
        topic_id: row.topic_id === '' ? null : Number(row.topic_id),
        attempted: row.attempted,
        correct: row.correct,
        marks: row.marks === '' ? null : Number(row.marks),
        time_taken_seconds: row.time_taken_seconds === '' ? null : Number(row.time_taken_seconds),
      }))
    );
    setDirty(false);
  };

  return (
    <div>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-faint">
          No questions logged yet. Add one to start the breakdown.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[42rem] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink-faint">
                <th scope="col" className="py-1.5 pr-2 font-medium">Q#</th>
                <th scope="col" className="py-1.5 pr-2 font-medium">Subject</th>
                <th scope="col" className="py-1.5 pr-2 font-medium">Topic</th>
                <th scope="col" className="py-1.5 pr-2 text-center font-medium">Attempted</th>
                <th scope="col" className="py-1.5 pr-2 text-center font-medium">Correct</th>
                <th scope="col" className="py-1.5 pr-2 font-medium">Marks</th>
                <th scope="col" className="py-1.5 pr-2 font-medium">Seconds</th>
                <th scope="col" className="py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {rows.map((row) => {
                const rowTopics = topics.filter((topic) => String(topic.subject_id) === String(row.subject_id));
                return (
                  <tr key={row.key}>
                    <td className="py-1.5 pr-2">
                      <TextInput
                        type="number"
                        min="1"
                        value={row.question_number}
                        onChange={(event) => update(row.key, { question_number: event.target.value })}
                        className="w-14"
                        aria-label="Question number"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <Select
                        value={row.subject_id}
                        onChange={(event) => update(row.key, { subject_id: event.target.value })}
                        className="w-28"
                        aria-label="Subject"
                      >
                        <option value="">—</option>
                        {subjects.map((subject) => (
                          <option key={subject.id} value={subject.id}>
                            {subject.name}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="py-1.5 pr-2">
                      <Select
                        value={row.topic_id}
                        onChange={(event) => update(row.key, { topic_id: event.target.value })}
                        className="w-48"
                        disabled={!row.subject_id}
                        aria-label="Topic"
                      >
                        <option value="">—</option>
                        {rowTopics.map((topic) => (
                          <option key={topic.id} value={topic.id}>
                            {topic.title}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="py-1.5 pr-2 text-center">
                      <input
                        type="checkbox"
                        checked={row.attempted}
                        onChange={(event) => update(row.key, { attempted: event.target.checked })}
                        className="h-4 w-4 rounded border-black/20 text-sage-600 focus:ring-sage-400"
                        aria-label="Attempted"
                      />
                    </td>
                    <td className="py-1.5 pr-2 text-center">
                      <input
                        type="checkbox"
                        checked={row.correct}
                        disabled={!row.attempted}
                        onChange={(event) => update(row.key, { correct: event.target.checked })}
                        className="h-4 w-4 rounded border-black/20 text-sage-600 focus:ring-sage-400 disabled:opacity-30"
                        aria-label="Correct"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <TextInput
                        type="number"
                        step="0.5"
                        value={row.marks}
                        onChange={(event) => update(row.key, { marks: event.target.value })}
                        className="w-16"
                        aria-label="Marks"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <TextInput
                        type="number"
                        min="0"
                        value={row.time_taken_seconds}
                        onChange={(event) => update(row.key, { time_taken_seconds: event.target.value })}
                        className="w-16"
                        aria-label="Seconds taken"
                      />
                    </td>
                    <td className="py-1.5">
                      <Button size="sm" variant="ghost" onClick={() => removeRow(row.key)}>
                        Remove
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={addRow}>
          Add a question
        </Button>
        <Button size="sm" variant="primary" onClick={save} disabled={saving || !dirty}>
          {saving ? 'Saving…' : dirty ? 'Save results' : 'Saved'}
        </Button>
        {dirty && <span className="text-xs text-ink-faint">Not saved yet.</span>}
      </div>
    </div>
  );
}
