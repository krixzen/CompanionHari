import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { SubjectDot } from './bits.jsx';
import { Button, Card, TextInput } from './ui.jsx';
import { useToast } from '../hooks/useToast.jsx';

/**
 * A daily habit, not a one-off catch-up: tick off whatever class actually
 * got through today, whether or not you've studied it yourself yet.
 * Marking something here takes it out of the queue for fresh study the
 * same way the bulk "already covered" action on Subjects does — planning
 * switches it to revision instead — it's just quicker to reach for every day
 * from here than hunting it down subject by subject.
 */
export function ClassLogCard({ onChanged }) {
  const toast = useToast();
  const [topics, setTopics] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const all = await api.topics.list();
    setTopics(all.filter((topic) => topic.status === 'not_started' || topic.status === 'in_progress'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!topics || topics.length === 0) return null;

  const query = search.trim().toLowerCase();
  const filtered = query
    ? topics.filter((topic) => `${topic.tracking_number} ${topic.title}`.toLowerCase().includes(query))
    : topics;

  const toggle = (id) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const markCovered = async () => {
    setSaving(true);
    try {
      const ids = [...selected];
      await api.topics.bulkUpdate(ids, { status: 'revised' });
      setTopics((current) => current.filter((topic) => !selected.has(topic.id)));
      setSelected(new Set());
      toast.celebrate(
        `${ids.length} topic${ids.length === 1 ? '' : 's'} marked covered. Planning will give ${
          ids.length === 1 ? 'it' : 'them'
        } revision instead of a first pass from here on.`
      );
      onChanged?.();
    } catch (caught) {
      toast.warn(caught.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mb-8 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Covered in class today?</h2>
          <p className="mt-0.5 max-w-md text-xs text-ink-faint">
            Tick anything class got through, even if you haven't personally studied it yet. Planning
            stops treating it as new and switches to revision instead.
          </p>
        </div>
        {selected.size > 0 && (
          <Button size="sm" variant="primary" onClick={markCovered} disabled={saving}>
            {saving ? 'Saving…' : `Mark ${selected.size} covered`}
          </Button>
        )}
      </div>

      <TextInput
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search topics…"
        className="mt-3"
        aria-label="Search topics to mark covered"
      />

      <div className="mt-3 max-h-64 space-y-0.5 overflow-y-auto pr-1">
        {filtered.map((topic) => (
          <label
            key={topic.id}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-paper-sunk"
          >
            <input
              type="checkbox"
              checked={selected.has(topic.id)}
              onChange={() => toggle(topic.id)}
              className="h-4 w-4 shrink-0 rounded border-black/20 text-sage-600 focus:ring-sage-400"
            />
            <SubjectDot colour={topic.subject_colour} />
            <span className="shrink-0 font-mono text-xs text-ink-faint">{topic.tracking_number}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-ink">{topic.title}</span>
          </label>
        ))}
        {filtered.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-ink-faint">Nothing matches "{search}".</p>
        )}
      </div>
    </Card>
  );
}
