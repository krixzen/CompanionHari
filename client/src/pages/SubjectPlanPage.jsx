import { Fragment, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { PageHeader } from '../components/AppShell.jsx';
import { Card, EmptyState, ErrorNote, Spinner } from '../components/ui.jsx';
import { useStudyData } from '../hooks/useStudyData.jsx';
import { formatMinutes } from '../lib/format.js';
import { STAGES } from '../lib/practice.js';
import { addDays, startOfWeek, todayIso } from '../lib/week.js';

const WEEKS_BACK = 2;
const WEEKS_FORWARD = 8;

/** "14 Sep" — compact enough to fit a lot of these across a table header. */
function shortWeekLabel(monday) {
  return new Date(`${monday}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const STATUS_STYLE = {
  done: 'bg-sage-600 border-sage-600',
  scheduled: 'border-2 border-dashed bg-transparent',
  pending: '',
};

/**
 * One subject, laid out as a grid: every topic's five stages down the left,
 * a column per week across the top — a few weeks back (what actually
 * happened) through several weeks ahead (what's currently planned) — and a
 * plain-arithmetic "behind by" figure at the end, from the same gap report
 * the Week page's "Save as baseline" already computes.
 */
export default function SubjectPlanPage() {
  const { subjectId } = useParams();
  const id = Number(subjectId);
  const { subjects, status: dataStatus } = useStudyData();

  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    const today = todayIso();
    const from = addDays(startOfWeek(today), -7 * WEEKS_BACK);
    const to = addDays(startOfWeek(today), 7 * WEEKS_FORWARD + 6);

    Promise.all([
      api.topics.list({ subject_id: id }),
      api.practiceItems.list({ subject_id: id }),
      api.plan.list(from, to),
      api.scheduleSnapshots.list(),
    ])
      .then(async ([topics, items, entries, snapshots]) => {
        let gap = null;
        if (snapshots.length > 0) {
          const report = await api.scheduleSnapshots.gapReport(snapshots[0].id);
          gap = report.subjects.find((row) => row.subject_id === id) ?? null;
        }
        if (!cancelled) {
          setData({ topics, items, entries, gap });
          setStatus('ready');
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught.message);
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (dataStatus === 'loading' || status === 'loading') return <Spinner label="Laying out the plan…" />;
  if (status === 'error') return <ErrorNote>{error}</ErrorNote>;

  const subject = subjects.find((candidate) => candidate.id === id);
  if (!subject) {
    return (
      <EmptyState title="That subject is not here any more.">
        <Link to="/subjects" className="text-sage-700 underline">
          Back to subjects
        </Link>
      </EmptyState>
    );
  }

  const { topics, items, entries, gap } = data;

  const weeks = Array.from({ length: WEEKS_BACK + WEEKS_FORWARD + 1 }, (_, index) => {
    const monday = addDays(startOfWeek(todayIso()), (index - WEEKS_BACK) * 7);
    return { monday, label: shortWeekLabel(monday), isCurrent: monday === startOfWeek(todayIso()) };
  });

  // A scheduled item's week comes from its own booking; a done item's week
  // comes from when it was actually finished, not wherever it was booked —
  // those can differ if it was moved before being ticked off.
  const entryByPracticeItem = new Map(entries.filter((entry) => entry.practice_item_id).map((entry) => [entry.practice_item_id, entry]));

  const weekIndexForDate = (date) => {
    if (!date) return null;
    const monday = startOfWeek(date);
    const index = weeks.findIndex((week) => week.monday === monday);
    return index === -1 ? null : index;
  };

  const itemsByTopic = new Map();
  for (const item of items) {
    if (!itemsByTopic.has(item.topic_id)) itemsByTopic.set(item.topic_id, new Map());
    itemsByTopic.get(item.topic_id).set(item.stage, item);
  }

  return (
    <div>
      <PageHeader
        backTo={`/subjects/${id}`}
        backLabel={`Back to ${subject.name}`}
        eyebrow={subject.name}
        title="Week-by-week plan"
        description="Every chapter's five stages, plotted against the weeks — a few back to show what actually happened, several ahead to show what's currently planned."
      />

      {topics.length === 0 ? (
        <EmptyState title="No topics in this subject yet.">
          <Link to={`/subjects/${id}`} className="text-sage-700 underline">
            Add some first
          </Link>
        </EmptyState>
      ) : (
        <>
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-black/5">
                  <th className="sticky left-0 z-10 min-w-[220px] bg-paper-raised px-3 py-2 text-left text-xs font-semibold text-ink-faint">
                    Topic · stage
                  </th>
                  {weeks.map((week) => (
                    <th
                      key={week.monday}
                      className={`min-w-[52px] px-1 py-2 text-center text-[11px] font-medium ${
                        week.isCurrent ? 'bg-sage-50 text-sage-800' : 'text-ink-faint'
                      }`}
                    >
                      {week.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topics.map((topic) => {
                  const stagesByNumber = itemsByTopic.get(topic.id) ?? new Map();
                  return (
                    <Fragment key={topic.id}>
                      <tr className="border-t border-black/5 bg-paper-sunk/60">
                        <td
                          colSpan={weeks.length + 1}
                          className="sticky left-0 z-10 bg-paper-sunk/60 px-3 py-1.5 text-xs font-medium text-ink"
                        >
                          <span className="font-mono text-ink-faint">{topic.tracking_number}</span> {topic.title}
                        </td>
                      </tr>
                      {STAGES.map((stageInfo) => {
                        const item = stagesByNumber.get(stageInfo.stage);
                        const date =
                          item?.status === 'done'
                            ? item.completed_at
                            : item?.status === 'scheduled'
                              ? entryByPracticeItem.get(item.id)?.scheduled_date
                              : null;
                        const weekIndex = weekIndexForDate(date);

                        return (
                          <tr key={`${topic.id}-${stageInfo.stage}`} className="border-t border-black/5">
                            <td className="sticky left-0 z-10 bg-paper-raised px-3 py-1.5 text-xs text-ink-soft">
                              {stageInfo.short}
                            </td>
                            {weeks.map((week, index) => (
                              <td key={week.monday} className="px-1 py-1.5 text-center">
                                {index === weekIndex && item ? (
                                  <span
                                    title={`${topic.tracking_number}/S${stageInfo.stage} — ${item.status}${date ? ` · ${date}` : ''}`}
                                    className={`mx-auto block h-3 w-3 rounded-full ${STATUS_STYLE[item.status]}`}
                                    style={
                                      item.status !== 'pending'
                                        ? { backgroundColor: item.status === 'done' ? subject.colour : undefined, borderColor: subject.colour }
                                        : undefined
                                    }
                                  />
                                ) : null}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-ink-faint">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: subject.colour }} /> Done
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full border-2 border-dashed" style={{ borderColor: subject.colour }} /> Scheduled
            </span>
            <span>No dot yet — pending, not on the calendar</span>
          </div>

          <Card className="mt-4 p-5">
            <h2 className="text-sm font-semibold text-ink">Behind or on pace?</h2>
            {gap ? (
              <p className="mt-1 text-sm text-ink-soft">
                {gap.gap_minutes === null
                  ? 'No coverage deadline is set, so a pace figure cannot be worked out yet.'
                  : gap.gap_minutes > 15
                    ? `Behind by roughly ${formatMinutes(gap.gap_minutes)}, against the pace the last saved baseline implied.`
                    : gap.gap_minutes < -15
                      ? `Ahead by roughly ${formatMinutes(-gap.gap_minutes)}, against the last saved baseline.`
                      : 'On pace, against the last saved baseline.'}
              </p>
            ) : (
              <p className="mt-1 text-sm text-ink-soft">
                No baseline saved yet, so there's nothing to measure pace against. Save one from{' '}
                <Link to="/planner" className="text-sage-700 underline-offset-2 hover:underline">
                  the Week page
                </Link>{' '}
                and come back here.
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
