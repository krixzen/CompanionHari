import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { PageHeader } from '../components/AppShell.jsx';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';
import { DragHandle, SortableList, SortableRow } from '../components/SortableList.jsx';
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
      setTopics(await api.topics.reorder(id, order));
    } catch (caught) {
      setTopics(previous);
      toast.warn(caught.message);
    }
  };

  const patch = async (topicId, changes) => {
    try {
      const updated = await api.topics.update(topicId, changes);
      setTopics((current) => current.map((topic) => (topic.id === topicId ? updated : topic)));
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
          </>
        }
      />

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
          onApply={applyBulkDuration}
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
                      handleProps={handleProps}
                      dragDisabled={filtering}
                      selected={selected.has(topic.id)}
                      onToggleSelected={() => toggleSelected(topic.id)}
                      expanded={expanded.has(topic.id)}
                      onToggleExpanded={() => toggleExpanded(topic.id)}
                      onPatch={(changes) => patch(topic.id, changes)}
                      onEdit={() => setEditing(topic)}
                      onDelete={() => setDeleting(topic)}
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
  handleProps,
  dragDisabled,
  selected,
  onToggleSelected,
  expanded,
  onToggleExpanded,
  onPatch,
  onEdit,
  onDelete,
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
                <li key={index}>{subTopic}</li>
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
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
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

const QUICK_DURATIONS = [30, 45, 60, 90, 120];

function BulkBar({ count, onApply, onClear }) {
  const [custom, setCustom] = useState('');

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl2 bg-sage-50 px-4 py-3 text-sm">
      <span className="font-medium text-sage-800">
        {count} selected — set study time to
      </span>
      {QUICK_DURATIONS.map((minutes) => (
        <Button key={minutes} size="sm" onClick={() => onApply(minutes)}>
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
          onClick={() => onApply(Number(custom))}
        >
          Apply
        </Button>
      </span>
      <Button size="sm" variant="ghost" onClick={onClear} className="ml-auto">
        Clear selection
      </Button>
    </div>
  );
}
