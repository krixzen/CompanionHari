import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { PageHeader } from '../components/AppShell.jsx';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';
import { LLMBridge } from '../components/LLMBridge.jsx';
import { DragHandle, SortableList, SortableRow } from '../components/SortableList.jsx';
import { RevisionSuggestion, SessionDialog } from '../components/SessionDialog.jsx';
import { TopicForm } from '../components/TopicForm.jsx';
import { DifficultyDots, ProgressBar, SubjectDot } from '../components/bits.jsx';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Select,
  Spinner,
  TextInput,
} from '../components/ui.jsx';
import { useStudyData } from '../hooks/useStudyData.jsx';
import { useDebounced, useTopics } from '../hooks/useTopics.js';
import { useToast } from '../hooks/useToast.jsx';
import {
  DIFFICULTY_LABELS,
  STATUS_LABELS,
  STATUS_ORDER,
  STATUS_STYLES,
  formatDate,
  formatMinutes,
  progressMessage,
} from '../lib/format.js';
import { STAGES } from '../lib/practice.js';
import { topicEnrichmentPrompt } from '../lib/prompts.js';
import { topicEnrichmentSchema } from '../lib/schemas.js';

const ENRICH_CHUNK_SIZE = 20;

export default function TopicsPage() {
  const { subjectId } = useParams();
  const id = Number(subjectId);

  const { subjects, refreshSubjects, status: dataStatus } = useStudyData();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('');
  const debouncedSearch = useDebounced(search);

  const filters = useMemo(
    () => ({ status: statusFilter, difficulty: difficultyFilter, q: debouncedSearch }),
    [statusFilter, difficultyFilter, debouncedSearch]
  );

  const { topics, setTopics, status, error, reload } = useTopics(id, filters);

  const [selected, setSelected] = useState(() => new Set());
  const [editing, setEditing] = useState(null); // topic, or 'new'
  const [deleting, setDeleting] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());
  const [logging, setLogging] = useState(null);
  const [suggestion, setSuggestion] = useState(null);

  const [masterList, setMasterList] = useState([]);
  const loadMasterList = async () => setMasterList(await api.practiceItems.list({ subject_id: id }));
  useEffect(() => {
    if (id) loadMasterList();
  }, [id]);

  // Enrichment works over every topic in the subject, not whatever the
  // search/filter boxes above happen to be showing right now.
  const [enrichAllTopics, setEnrichAllTopics] = useState(null);
  const [enrichChunk, setEnrichChunk] = useState(0);
  const [enrichBridgeOpen, setEnrichBridgeOpen] = useState(false);
  const [enrichReview, setEnrichReview] = useState(null); // { items, chunkTopics } or null

  const openEnrichBridge = async () => {
    const all = await api.topics.list({ subject_id: id });
    if (all.length === 0) {
      toast.warn('There are no topics to enrich yet.');
      return;
    }
    setEnrichAllTopics(all);
    setEnrichChunk(0);
    // One chunk fits the whole subject — skip straight to the prompt rather
    // than showing a group picker with nothing to pick between.
    if (all.length <= ENRICH_CHUNK_SIZE) setEnrichBridgeOpen(true);
  };

  const enrichChunkCount = enrichAllTopics ? Math.ceil(enrichAllTopics.length / ENRICH_CHUNK_SIZE) : 1;
  const enrichChunkTopics = enrichAllTopics
    ? enrichAllTopics.slice(enrichChunk * ENRICH_CHUNK_SIZE, (enrichChunk + 1) * ENRICH_CHUNK_SIZE)
    : [];

  const itemsByTopic = useMemo(() => {
    const map = new Map();
    for (const item of masterList) {
      if (!map.has(item.topic_id)) map.set(item.topic_id, []);
      map.get(item.topic_id).push(item);
    }
    for (const items of map.values()) items.sort((a, b) => a.stage - b.stage);
    return map;
  }, [masterList]);

  const subject = subjects.find((candidate) => candidate.id === id);
  const filtering = Boolean(statusFilter || difficultyFilter || debouncedSearch);

  if (dataStatus === 'loading') return <Spinner label="Loading…" />;
  if (!subject) {
    return (
      <EmptyState title="That subject is not here any more.">
        It may have been deleted.{' '}
        <Link to="/subjects" className="text-sage-700 underline">
          Back to subjects
        </Link>
        .
      </EmptyState>
    );
  }

  const toggleSelected = (topicId) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  };

  const toggleExpanded = (topicId) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  };

  const afterChange = async () => {
    await reload();
    await refreshSubjects();
  };

  const reorder = async (order) => {
    const previous = topics;
    setTopics(order.map((topicId) => topics.find((topic) => topic.id === topicId)));
    try {
      const reordered = await api.topics.reorder(id, order);
      const byId = new Map(previous.map((topic) => [topic.id, topic]));
      setTopics(reordered.map((topic) => ({ ...byId.get(topic.id), ...topic })));
    } catch (caught) {
      setTopics(previous);
      toast.warn(caught.message);
    }
  };

  const patch = async (topicId, changes) => {
    try {
      const updated = await api.topics.update(topicId, changes);
      // update() doesn't recompute plan_summary, so keep whatever the list already had for it.
      setTopics((current) =>
        current.map((topic) => (topic.id === topicId ? { ...topic, ...updated } : topic))
      );
      await refreshSubjects();
    } catch (caught) {
      toast.warn(caught.message);
    }
  };

  const saveTopic = async (draft) => {
    if (editing === 'new') await api.topics.create({ subject_id: id, ...draft });
    else await api.topics.update(editing.id, draft);
    setEditing(null);
    await afterChange();
    toast.celebrate(editing === 'new' ? 'Topic added.' : 'Topic updated.');
  };

  const removeTopic = async () => {
    try {
      await api.topics.remove(deleting.id);
      setDeleting(null);
      await afterChange();
      toast.celebrate(`${deleting.tracking_number} removed.`);
    } catch (caught) {
      toast.warn(caught.message);
    }
  };

  const logSession = async (payload) => {
    const result = await api.sessions.create(payload);
    setLogging(null);
    await afterChange();
    toast.celebrate(`${formatMinutes(payload.minutes_spent)} recorded against ${logging.tracking_number}.`);
    if (result.suggestion) setSuggestion(result.suggestion);
  };

  const applyBulkDuration = async (minutes) => {
    try {
      await api.topics.bulkUpdate([...selected], { allocated_duration_minutes: minutes });
      setSelected(new Set());
      await afterChange();
      toast.celebrate(`Study time set to ${formatMinutes(minutes)}.`);
    } catch (caught) {
      toast.warn(caught.message);
    }
  };

  const applyBulkStatus = async (status) => {
    try {
      const count = selected.size;
      await api.topics.bulkUpdate([...selected], { status });
      setSelected(new Set());
      await afterChange();
      toast.celebrate(
        `${count} topic${count === 1 ? '' : 's'} marked "${STATUS_LABELS[status]}". Planning skips a topic once it's past Learning, and leans on revision instead.`
      );
    } catch (caught) {
      toast.warn(caught.message);
    }
  };

  return (
    <div>
      <PageHeader
        backTo="/subjects"
        backLabel="All subjects"
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <SubjectDot colour={subject.colour} /> {subject.code}
          </span>
        }
        title={subject.name}
        description={progressMessage({
          total: subject.topic_count,
          started: subject.topics_started,
          mastered: subject.topics_mastered,
        })}
        actions={
          <>
            <Button onClick={() => setEditing('new')}>Add a topic</Button>
            <Link to={`/subjects/${id}/import`}>
              <Button variant="primary">Import a syllabus</Button>
            </Link>
            {subject.topic_count > 0 && <Button onClick={openEnrichBridge}>Enrich with AI</Button>}
            {subject.topic_count > 0 && (
              <Link to={`/subjects/${id}/plan`}>
                <Button>Week-by-week plan</Button>
              </Link>
            )}
          </>
        }
      />

      {enrichAllTopics && enrichChunkCount > 1 && !enrichBridgeOpen && !enrichReview && (
        <Card className="mb-4 p-4">
          <p className="text-sm text-ink">
            {enrichAllTopics.length} topics — enriched in groups of {ENRICH_CHUNK_SIZE} so the prompt stays
            a manageable size.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {Array.from({ length: enrichChunkCount }, (_, index) => (
              <Button
                key={index}
                size="sm"
                variant={enrichChunk === index ? 'primary' : 'quiet'}
                onClick={() => setEnrichChunk(index)}
              >
                Topics {index * ENRICH_CHUNK_SIZE + 1}–
                {Math.min((index + 1) * ENRICH_CHUNK_SIZE, enrichAllTopics.length)}
              </Button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Button variant="primary" onClick={() => setEnrichBridgeOpen(true)}>
              Generate the prompt for this group
            </Button>
            <Button variant="ghost" onClick={() => setEnrichAllTopics(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <LLMBridge
        open={enrichBridgeOpen}
        onClose={() => setEnrichBridgeOpen(false)}
        title={`Enrich ${subject.name} topics`}
        purpose="This app never contacts an AI service — copy the prompt across yourself, then bring the reply back. Nothing changes until you review it below."
        prompt={enrichAllTopics ? topicEnrichmentPrompt({ subjectName: subject.name, topics: enrichChunkTopics }) : ''}
        schema={topicEnrichmentSchema}
        saveLabel="Review these changes"
        renderPreview={(data) => (
          <p className="text-sm text-ink-soft">{data.topics.length} topic{data.topics.length === 1 ? '' : 's'} came back.</p>
        )}
        onSave={(data) => {
          setEnrichReview({ items: data.topics, chunkTopics: enrichChunkTopics });
          setEnrichBridgeOpen(false);
        }}
      />

      {enrichReview && (
        <EnrichmentReview
          review={enrichReview}
          onCancel={() => setEnrichReview(null)}
          onSaved={async () => {
            setEnrichReview(null);
            setEnrichAllTopics(null);
            await reload();
          }}
        />
      )}

      {subject.topic_count > 0 && (
        <div className="mb-6">
          <ProgressBar
            total={subject.topic_count}
            started={subject.topics_started}
            mastered={subject.topics_mastered}
            colour={subject.colour}
          />
        </div>
      )}

      {topics.length > 0 && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          <PlanBreakdown topics={topics} filtered={filtering} />
          <MasterListBreakdown items={masterList} />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-72">
          <TextInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search titles, sub-topics or tracking numbers…"
            aria-label="Search topics"
          />
        </div>
        <div className="w-[48%] sm:w-40">
          <Select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filter by status"
          >
            <option value="">Any status</option>
            {STATUS_ORDER.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-[48%] sm:w-44">
          <Select
            value={difficultyFilter}
            onChange={(event) => setDifficultyFilter(event.target.value)}
            aria-label="Filter by difficulty"
          >
            <option value="">Any difficulty</option>
            {[1, 2, 3, 4, 5].map((level) => (
              <option key={level} value={level}>
                {level} — {DIFFICULTY_LABELS[level]}
              </option>
            ))}
          </Select>
        </div>
        {filtering && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('');
              setStatusFilter('');
              setDifficultyFilter('');
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {selected.size > 0 && (
        <BulkBar
          count={selected.size}
          onApplyDuration={applyBulkDuration}
          onApplyStatus={applyBulkStatus}
          onClear={() => setSelected(new Set())}
        />
      )}

      {status === 'loading' && <Spinner label="Loading topics…" />}
      {status === 'error' && <ErrorNote onRetry={reload}>{error}</ErrorNote>}

      {status === 'ready' && topics.length === 0 && (
        <EmptyState
          title={filtering ? 'Nothing matches that just now.' : 'No topics in here yet.'}
          action={
            filtering ? null : (
              <div className="flex flex-wrap justify-center gap-2">
                <Link to={`/subjects/${id}/import`}>
                  <Button variant="primary">Import a syllabus</Button>
                </Link>
                <Button onClick={() => setEditing('new')}>Add one by hand</Button>
              </div>
            )
          }
        >
          {filtering
            ? 'Try a different search, or clear the filters.'
            : 'Upload the syllabus and it will be broken into topics you can check over before saving.'}
        </EmptyState>
      )}

      {status === 'ready' && topics.length > 0 && (
        <>
          {filtering && (
            <p className="mb-2 text-xs text-ink-faint">
              Showing {topics.length} of {subject.topic_count}. Clear the filters to drag topics into a
              different order.
            </p>
          )}

          <SortableList
            ids={topics.map((topic) => topic.id)}
            onReorder={reorder}
            disabled={filtering}
          >
            <div className="space-y-2">
              {topics.map((topic) => (
                <SortableRow key={topic.id} id={topic.id} disabled={filtering}>
                  {({ handleProps }) => (
                    <TopicRow
                      topic={topic}
                      items={itemsByTopic.get(topic.id) ?? []}
                      onItemsChanged={loadMasterList}
                      handleProps={handleProps}
                      dragDisabled={filtering}
                      selected={selected.has(topic.id)}
                      onToggleSelected={() => toggleSelected(topic.id)}
                      expanded={expanded.has(topic.id)}
                      onToggleExpanded={() => toggleExpanded(topic.id)}
                      onPatch={(changes) => patch(topic.id, changes)}
                      onEdit={() => setEditing(topic)}
                      onDelete={() => setDeleting(topic)}
                      onLog={() => setLogging(topic)}
                    />
                  )}
                </SortableRow>
              ))}
            </div>
          </SortableList>
        </>
      )}

      <TopicForm
        open={Boolean(editing)}
        topic={editing === 'new' ? null : editing}
        subjectName={subject.name}
        onClose={() => setEditing(null)}
        onSave={saveTopic}
      />

      <SessionDialog
        open={Boolean(logging)}
        topic={logging}
        plannedMinutes={logging?.allocated_duration_minutes}
        onClose={() => setLogging(null)}
        onSave={logSession}
      />

      <RevisionSuggestion
        suggestion={suggestion}
        open={Boolean(suggestion)}
        onClose={() => setSuggestion(null)}
        onAccept={async (proposal) => {
          try {
            await api.plan.create({
              topic_id: proposal.topic_id,
              scheduled_date: proposal.scheduled_date,
              scheduled_start_time: proposal.scheduled_start_time,
              scheduled_duration_minutes: proposal.scheduled_duration_minutes,
              entry_type: 'revision',
              revision_interval: '3day',
            });
            toast.celebrate('Booked in.');
          } catch (caught) {
            toast.warn(caught.message);
          } finally {
            setSuggestion(null);
          }
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={removeTopic}
        title={`Delete ${deleting?.tracking_number}?`}
        confirmLabel="Delete topic"
      >
        {`“${deleting?.title}” and anything recorded against it will be removed. There is no undo.`}
      </ConfirmDialog>
    </div>
  );
}

function TopicRow({
  topic,
  items,
  onItemsChanged,
  handleProps,
  dragDisabled,
  selected,
  onToggleSelected,
  expanded,
  onToggleExpanded,
  onPatch,
  onEdit,
  onDelete,
  onLog,
}) {
  const [duration, setDuration] = useState(String(topic.allocated_duration_minutes));

  const commitDuration = () => {
    const minutes = Number(duration);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 1440) {
      setDuration(String(topic.allocated_duration_minutes));
      return;
    }
    if (minutes !== topic.allocated_duration_minutes) onPatch({ allocated_duration_minutes: minutes });
  };

  return (
    <Card className={`p-3 sm:p-4 ${selected ? 'ring-2 ring-sage-300' : ''}`}>
      <div className="flex items-start gap-2 sm:gap-3">
        <DragHandle handleProps={handleProps} disabled={dragDisabled} label={`Reorder ${topic.title}`} />

        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelected}
          className="mt-2 h-4 w-4 shrink-0 rounded border-black/20 text-sage-600 focus:ring-sage-400"
          aria-label={`Select ${topic.tracking_number}`}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-mono text-xs text-ink-faint">{topic.tracking_number}</span>
            <h3 className="font-medium text-ink">{topic.title}</h3>
          </div>

          {topic.unit && <p className="mt-0.5 text-xs text-ink-faint">{topic.unit}</p>}

          {topic.sub_topics.length > 0 && (
            <button
              type="button"
              onClick={onToggleExpanded}
              className="mt-1 inline-flex items-center gap-1 text-xs text-sage-700 underline decoration-dotted underline-offset-2 hover:decoration-solid"
              aria-expanded={expanded}
            >
              <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
              {expanded
                ? 'Hide sub-topics'
                : `${topic.sub_topics.length} sub-topic${topic.sub_topics.length === 1 ? '' : 's'}`}
            </button>
          )}

          {expanded && (
            <ul className="mt-2 space-y-1 border-l-2 border-black/5 pl-3 text-sm text-ink-soft">
              {topic.sub_topics.map((subTopic, index) => (
                // Sub-topics are free text and can repeat, so index is the key.
                // eslint-disable-next-line react/no-array-index-key
                <li key={index} className="flex gap-2">
                  <span className="shrink-0 font-mono text-xs text-ink-faint">
                    {topic.tracking_number}/{String(index + 1).padStart(2, '0')}
                  </span>
                  <span>{subTopic}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <label className="flex items-center gap-1.5 text-ink-soft">
              <span className="text-xs text-ink-faint">Study time</span>
              <input
                type="number"
                min="5"
                max="1440"
                step="5"
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                onBlur={commitDuration}
                onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
                aria-label={`Study minutes for ${topic.tracking_number}`}
                className="w-16 rounded-lg border border-black/10 bg-paper-raised px-2 py-1 text-sm focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-200"
              />
              <span className="text-xs text-ink-faint">min</span>
            </label>

            <DifficultyDots value={topic.difficulty} />

            <select
              value={topic.status}
              onChange={(event) => onPatch({ status: event.target.value })}
              aria-label={`Status of ${topic.tracking_number}`}
              className={`rounded-full border-0 px-2.5 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sage-300 ${STATUS_STYLES[topic.status]}`}
            >
              {STATUS_ORDER.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                </option>
              ))}
            </select>

            {topic.target_date && (
              <span className="text-xs text-ink-faint">by {formatDate(topic.target_date)}</span>
            )}
          </div>

          <MasterListChips items={items} onChanged={onItemsChanged} />

          <PlanSummaryBadges summary={topic.plan_summary} />
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
          <Button size="sm" variant="ghost" onClick={onLog}>
            Log time
          </Button>
          <Button size="sm" variant="ghost" onClick={onEdit}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>
    </Card>
  );
}

const ITEM_STATUS_STYLE = {
  pending: 'bg-paper-sunk text-ink-faint',
  scheduled: 'bg-amber-100 text-amber-800',
  done: 'bg-sage-600 text-white',
};

/**
 * The chapter's master list, right on its row: one chip per stage of the
 * five-stage practice cycle. A click cycles it between pending and done —
 * scheduled (amber) means it's already booked on the calendar and updates
 * itself when that block is ticked off.
 */
function MasterListChips({ items, onChanged }) {
  const toast = useToast();
  if (items.length === 0) return null;

  const toggle = async (item) => {
    if (item.status === 'scheduled') {
      toast.warn('This is already booked on the calendar — tick it off there, or take it off the calendar first.');
      return;
    }
    try {
      await api.practiceItems.mark(item.id, item.status !== 'done');
      await onChanged?.();
    } catch (caught) {
      toast.warn(caught.message);
    }
  };

  const done = items.filter((item) => item.status === 'done').length;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-ink-faint">
        Master list {done}/{items.length}
      </span>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => toggle(item)}
          title={`${item.label} · ${item.estimated_minutes} min · ${item.status}`}
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition ${ITEM_STATUS_STYLE[item.status]}`}
        >
          S{item.stage}
        </button>
      ))}
    </div>
  );
}

const QUICK_DURATIONS = [30, 45, 60, 90, 120];

function BulkBar({ count, onApplyDuration, onApplyStatus, onClear }) {
  const [custom, setCustom] = useState('');

  return (
    <div className="mb-4 space-y-3 rounded-xl2 bg-sage-50 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-sage-800">{count} selected</span>
        <Button size="sm" variant="ghost" onClick={onClear} className="ml-auto">
          Clear selection
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink-soft">Already covered — mark as</span>
        {STATUS_ORDER.map((value) => (
          <Button key={value} size="sm" onClick={() => onApplyStatus(value)}>
            {STATUS_LABELS[value]}
          </Button>
        ))}
      </div>
      <p className="text-xs text-ink-faint">
        "Revised" or "Confident" takes a topic out of the queue for fresh study — planning covers it
        with revision instead, at whatever level it's already at.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink-soft">Set study time to</span>
        {QUICK_DURATIONS.map((minutes) => (
          <Button key={minutes} size="sm" onClick={() => onApplyDuration(minutes)}>
            {formatMinutes(minutes)}
          </Button>
        ))}
        <span className="flex items-center gap-1">
          <input
            type="number"
            min="5"
            max="1440"
            step="5"
            value={custom}
            placeholder="other"
            onChange={(event) => setCustom(event.target.value)}
            aria-label="Custom study minutes"
            className="w-20 rounded-lg border border-black/10 bg-paper-raised px-2 py-1 text-sm focus:border-sage-400 focus:outline-none"
          />
          <Button
            size="sm"
            variant="primary"
            disabled={!custom || Number(custom) < 5}
            onClick={() => onApplyDuration(Number(custom))}
          >
            Apply
          </Button>
        </span>
      </div>
    </div>
  );
}

const PLAN_KINDS = ['study', 'practice', 'revision'];
const PLAN_KIND_META = {
  study: { label: 'Study', icon: null },
  practice: { label: 'Practice', icon: '✎' },
  revision: { label: 'Revision', icon: '↻' },
};

const blankPlanTotals = () => ({
  study: { total: 0, completed: 0 },
  practice: { total: 0, completed: 0 },
  revision: { total: 0, completed: 0 },
});

/** Small badges on a topic row: how much of it is planned, and how much of that is done, by kind. */
function PlanSummaryBadges({ summary }) {
  if (!summary) return null;
  const parts = PLAN_KINDS.map((kind) => ({ kind, ...summary[kind] })).filter((part) => part.total > 0);
  if (parts.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {parts.map((part) => (
        <span
          key={part.kind}
          className="inline-flex items-center gap-1 rounded-full bg-paper-sunk px-2 py-0.5 text-[11px] text-ink-soft"
        >
          {PLAN_KIND_META[part.kind].icon && <span aria-hidden="true">{PLAN_KIND_META[part.kind].icon}</span>}
          {PLAN_KIND_META[part.kind].label} {part.completed}/{part.total}
        </span>
      ))}
    </div>
  );
}

/** The master list's own rollup: how much of the five-stage cycle is actually done, across every topic shown. */
function MasterListBreakdown({ items }) {
  if (items.length === 0) return null;

  const done = items.filter((item) => item.status === 'done').length;
  const pendingMinutes = items
    .filter((item) => item.status !== 'done')
    .reduce((sum, item) => sum + item.estimated_minutes, 0);
  const pct = Math.round((done / items.length) * 100);

  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold text-ink">Master list — the five-stage cycle</h2>
      <p className="mt-0.5 text-lg font-semibold text-ink">
        {done}
        <span className="text-sm font-normal text-ink-faint"> / {items.length} stages done</span>
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper-sunk">
        <div className="h-full rounded-full bg-sage-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-ink-faint">{formatMinutes(pendingMinutes)} of backlog left.</p>
    </Card>
  );
}

/** The same three-way split, summed across every topic currently listed — the subject-level view. */
function PlanBreakdown({ topics, filtered }) {
  const totals = useMemo(() => {
    const totals = blankPlanTotals();
    for (const topic of topics) {
      if (!topic.plan_summary) continue;
      for (const kind of PLAN_KINDS) {
        totals[kind].total += topic.plan_summary[kind].total;
        totals[kind].completed += topic.plan_summary[kind].completed;
      }
    }
    return totals;
  }, [topics]);

  const grandTotal = PLAN_KINDS.reduce((sum, kind) => sum + totals[kind].total, 0);
  if (grandTotal === 0) return null;

  return (
    <Card className="mb-6 p-4">
      <h2 className="text-sm font-semibold text-ink">
        {filtered ? 'Across the topics shown below' : 'This subject, study through revision'}
      </h2>
      <div className="mt-2 grid grid-cols-3 gap-3">
        {PLAN_KINDS.map((kind) => (
          <div key={kind}>
            <p className="text-xs text-ink-faint">{PLAN_KIND_META[kind].label}</p>
            <p className="mt-0.5 text-lg font-semibold text-ink">
              {totals[kind].completed}
              <span className="text-sm font-normal text-ink-faint"> / {totals[kind].total}</span>
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Combines an enrichment reply's write-up into the plain-text shape `topic.key_concepts` already uses. */
function composeKeyConcepts(item) {
  const concepts = (item.key_concepts ?? []).map((line) => `- ${line}`).join('\n');
  return [item.what_to_understand, concepts].filter(Boolean).join('\n\n');
}

/**
 * The diff-preview screen for a batch enrichment reply: each item matched
 * to a real topic by tracking_number, old value next to new, nothing saved
 * until this is confirmed. Anything that didn't match a topic on this
 * subject is listed separately and always skipped.
 */
function EnrichmentReview({ review, onCancel, onSaved }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  const byTrackingNumber = new Map(review.chunkTopics.map((topic) => [topic.tracking_number, topic]));
  const matched = [];
  const unmatched = [];
  for (const item of review.items) {
    const topic = byTrackingNumber.get(item.tracking_number);
    if (topic) matched.push({ item, topic });
    else unmatched.push(item);
  }

  const [included, setIncluded] = useState(() => new Set(matched.map((row) => row.topic.id)));
  const toggle = (topicId) =>
    setIncluded((current) => {
      const next = new Set(current);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });

  const save = async () => {
    setSaving(true);
    try {
      const toSave = matched.filter((row) => included.has(row.topic.id));
      for (const { item, topic } of toSave) {
        await api.topics.update(topic.id, {
          difficulty: item.difficulty,
          allocated_duration_minutes: Math.max(5, Math.round((item.estimated_hours * 60) / 5) * 5),
          key_concepts: composeKeyConcepts(item),
          resources: item.resources ?? [],
        });
      }
      toast.celebrate(`${toSave.length} topic${toSave.length === 1 ? '' : 's'} updated.`);
      await onSaved();
    } catch (caught) {
      toast.warn(caught.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mb-4 p-4">
      <h3 className="text-sm font-semibold text-ink">Here's what it came back with — check it over</h3>
      <p className="mt-1 text-xs text-ink-faint">
        Nothing is saved yet. Untick anything you don't want to change.
      </p>

      <div className="mt-3 space-y-2">
        {matched.map(({ item, topic }) => {
          const newMinutes = Math.max(5, Math.round((item.estimated_hours * 60) / 5) * 5);
          const durationChanged = newMinutes !== topic.allocated_duration_minutes;
          const difficultyChanged = item.difficulty !== topic.difficulty;

          return (
            <label
              key={topic.id}
              className="flex cursor-pointer items-start gap-3 rounded-lg bg-paper-sunk px-3 py-2.5"
            >
              <input
                type="checkbox"
                checked={included.has(topic.id)}
                onChange={() => toggle(topic.id)}
                className="mt-1 h-4 w-4 shrink-0 rounded border-black/20 text-sage-600 focus:ring-sage-400"
              />
              <div className="min-w-0 flex-1 text-sm">
                <p className="text-ink">
                  <span className="mr-1.5 font-mono text-xs text-ink-faint">{topic.tracking_number}</span>
                  {topic.title}
                </p>
                <p className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink-faint">
                  <span>
                    Difficulty:{' '}
                    {difficultyChanged ? (
                      <>
                        {topic.difficulty} → <span className="font-medium text-ink">{item.difficulty}</span>
                      </>
                    ) : (
                      item.difficulty
                    )}
                  </span>
                  <span>
                    Study time:{' '}
                    {durationChanged ? (
                      <>
                        {formatMinutes(topic.allocated_duration_minutes)} →{' '}
                        <span className="font-medium text-ink">{formatMinutes(newMinutes)}</span>
                      </>
                    ) : (
                      formatMinutes(newMinutes)
                    )}
                  </span>
                  {item.resources?.length > 0 && <span>{item.resources.length} resources</span>}
                </p>
                <p className="mt-1 text-xs text-ink-soft">{item.what_to_understand}</p>
              </div>
            </label>
          );
        })}
      </div>

      {unmatched.length > 0 && (
        <p className="mt-3 text-xs text-amber-800">
          Skipped — no matching topic on this list: {unmatched.map((item) => item.tracking_number).join(', ')}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <Button variant="primary" onClick={save} disabled={saving || included.size === 0}>
          {saving ? 'Saving…' : `Save ${included.size} topic${included.size === 1 ? '' : 's'}`}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
