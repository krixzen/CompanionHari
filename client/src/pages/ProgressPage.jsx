import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { PageHeader } from '../components/AppShell.jsx';
import { ConfidencePanels } from '../components/charts/ConfidencePanels.jsx';
import { DailyMinutesChart } from '../components/charts/DailyMinutesChart.jsx';
import { StatusBar } from '../components/charts/StatusBar.jsx';
import { SubjectMinutesChart } from '../components/charts/SubjectMinutesChart.jsx';
import { ChartFrame } from '../components/charts/chartBits.jsx';
import { SessionHistory } from '../components/SessionHistory.jsx';
import { WeeklyActionPlanCard } from '../components/WeeklyActionPlanCard.jsx';
import { Button, Card, EmptyState, ErrorNote, Spinner } from '../components/ui.jsx';
import { formatMinutes } from '../lib/format.js';
import { longDate } from '../lib/week.js';

const RANGES = [
  { days: 28, label: '4 weeks' },
  { days: 84, label: '3 months' },
  { days: 365, label: 'A year' },
];

export default function ProgressPage() {
  const [days, setDays] = useState(28);
  const [report, setReport] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      setReport(await api.progress.get({ days }));
      setStatus('ready');
    } catch (caught) {
      setError(caught.message);
      setStatus('error');
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  if (status === 'loading' && !report) return <Spinner label="Adding it all up…" />;
  if (status === 'error') return <ErrorNote onRetry={load}>{error}</ErrorNote>;

  const {
    summary,
    daily,
    bySubject,
    confidence,
    status: statusCounts,
    shaky,
    coverage,
    overdue,
    unscheduled,
    flagged,
    streak,
  } = report;
  const hasSessions = summary.allTime.sessions > 0;
  const hasSyllabus = coverage.overall.total_items > 0;
  const needsAttentionCount = shaky.length + overdue.length + unscheduled.length + flagged.length;

  return (
    <div>
      <PageHeader
        eyebrow="Progress"
        title={hasSessions ? headline(summary) : 'Nothing recorded yet.'}
        description={
          hasSessions
            ? subheadline(summary)
            : 'Tick a block off on your week, and how it went gets recorded here.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1">
              {RANGES.map((range) => (
                <Button
                  key={range.days}
                  size="sm"
                  variant={days === range.days ? 'primary' : 'quiet'}
                  onClick={() => setDays(range.days)}
                >
                  {range.label}
                </Button>
              ))}
            </div>
            <Link to="/parent" className="text-sm text-sage-700 underline-offset-2 hover:underline">
              Parent view →
            </Link>
          </div>
        }
      />

      <div className="space-y-4">
        {hasSyllabus && <SyllabusCoverage coverage={coverage} />}

        {needsAttentionCount > 0 && (
          <NeedsAttention shaky={shaky} overdue={overdue} unscheduled={unscheduled} flagged={flagged} />
        )}

        {!hasSessions ? (
          <EmptyState
            title="This page fills itself in."
            action={
              <Link to="/planner">
                <Button variant="primary">Go to your week</Button>
              </Link>
            }
          >
            Every session you record adds to the picture here — how much, on which subjects, and how
            it felt at the time.
          </EmptyState>
        ) : (
        <div className="space-y-4">
          <StreakLine streak={streak} />

          <StatRow summary={summary} />

          <WeeklyActionPlanCard progressSummary={summary} />

          <ChartFrame
            title="Minutes studied each day"
            subtitle={friendlyRange(report)}
            footnote="Days with nothing on them are just days off — they are not counted against anything."
          >
            <DailyMinutesChart data={daily} />
          </ChartFrame>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartFrame title="Where the time went" subtitle="Across this stretch">
              <SubjectMinutesChart subjects={bySubject} />
            </ChartFrame>

            <ChartFrame
              title="How the topics stand"
              subtitle={`${statusCounts.reduce((sum, part) => sum + part.count, 0)} topics mapped out`}
            >
              <StatusBar status={statusCounts} />
            </ChartFrame>
          </div>

          <ChartFrame
            title="How things have felt"
            subtitle={`Out of five, your own rating, averaged per day · ${friendlyRange(report)}`}
            footnote="A dip is information, not a verdict. It usually just means that was the week a topic got harder."
          >
            <ConfidencePanels series={confidence} />
          </ChartFrame>

          <SessionHistory onChanged={load} />
        </div>
        )}
      </div>
    </div>
  );
}

/** "17 Aug to 13 Sep" reads better than two ISO dates. */
function friendlyRange({ from, to }) {
  const format = (iso) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `${format(from)} to ${format(to)}`;
}

function headline(summary) {
  const { week } = summary;
  if (week.sessions === 0) return 'A quiet week so far.';
  return `${formatMinutes(week.minutes)} this week.`;
}

function subheadline(summary) {
  const { week, lastWeek, allTime } = summary;

  if (week.sessions === 0) {
    return allTime.sessions > 0
      ? `Nothing recorded since ${lastWeek.minutes > 0 ? 'last week' : 'a while back'} — ${formatMinutes(
          allTime.minutes
        )} logged in total, which does not go anywhere.`
      : '';
  }

  const days = `on ${week.days} day${week.days === 1 ? '' : 's'}`;
  const subjects = `across ${week.subjects} subject${week.subjects === 1 ? '' : 's'}`;
  const comparison =
    lastWeek.minutes > 0
      ? ` Last week came to ${formatMinutes(lastWeek.minutes)}.`
      : '';

  return `${days.charAt(0).toUpperCase()}${days.slice(1)}, ${subjects}.${comparison}`;
}

/**
 * One quiet, positive number: consecutive days studied. It only ever counts
 * up — there is deliberately no broken-streak warning, no red X for a
 * missed day, and no "longest streak" to fall short of.
 */
export function StreakLine({ streak }) {
  if (streak.days === 0) {
    return <p className="text-sm text-ink-soft">Every streak starts with day one — log today's session to begin.</p>;
  }

  const day = streak.days === 1 ? 'day' : 'days';
  const tail = streak.studiedToday ? '' : ' — log today\'s to keep it going';

  return (
    <p className="text-sm text-ink-soft">
      <span className="font-semibold text-sage-700">
        {streak.days} {day} in a row
      </span>
      {tail}.
    </p>
  );
}

function StatRow({ summary }) {
  const tiles = [
    { label: 'This week', value: formatMinutes(summary.week.minutes) },
    { label: 'Days studied', value: String(summary.week.days) },
    {
      label: 'How it felt',
      value: summary.week.confidence === null ? '—' : `${summary.week.confidence} / 5`,
    },
    { label: 'Logged in total', value: formatMinutes(summary.allTime.minutes) },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((tile) => (
        <Card key={tile.label} className="p-4">
          <p className="text-xs text-ink-faint">{tile.label}</p>
          <p className="mt-1 text-xl font-semibold text-ink">{tile.value}</p>
        </Card>
      ))}
    </div>
  );
}

/**
 * A thin bar out of the whole syllabus: a lighter fill out to "planned",
 * a solid fill out to "done" laid on top of it (done is always a subset of
 * planned, so the solid fill never has to exceed the lighter one).
 */
function CoverageBar({ percentPlanned, percentDone, colour }) {
  return (
    <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-paper-sunk">
      <div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: `${percentPlanned}%`, backgroundColor: `${colour}40` }}
      />
      <div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: `${percentDone}%`, backgroundColor: colour }}
      />
    </div>
  );
}

/**
 * How much of the syllabus (every chapter's five stages, counted
 * individually) has a slot on the calendar at all, and how much of that is
 * actually finished — overall, and broken down by subject.
 */
export function SyllabusCoverage({ coverage }) {
  const { overall, bySubject } = coverage;

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-ink">Syllabus coverage</h2>
      <p className="mt-0.5 text-xs text-ink-faint">
        Planned counts anything with a slot on the calendar; done is what's actually finished.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-2">
        <div className="rounded-xl2 bg-paper-sunk px-4 py-3">
          <p className="text-xs text-ink-faint">Planned overall</p>
          <p className="mt-1 text-xl font-semibold text-ink">{overall.percent_planned}%</p>
        </div>
        <div className="rounded-xl2 bg-paper-sunk px-4 py-3">
          <p className="text-xs text-ink-faint">Done overall</p>
          <p className="mt-1 text-xl font-semibold text-ink">{overall.percent_done}%</p>
        </div>
      </div>

      <ul className="mt-4 space-y-2.5">
        {bySubject.map((subject) => (
          <li key={subject.subject_id} className="flex items-center gap-3 text-sm">
            <span className="w-24 shrink-0 truncate text-ink-soft">{subject.name}</span>
            <CoverageBar
              percentPlanned={subject.percent_planned}
              percentDone={subject.percent_done}
              colour={subject.colour}
            />
            <span className="w-28 shrink-0 text-right text-xs text-ink-faint">
              {subject.percent_planned}% planned · {subject.percent_done}% done
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const ATTENTION_REASONS = {
  shaky: { label: 'Shaky', tone: 'text-amber-700 bg-amber-50' },
  overdue: { label: 'Overdue', tone: 'text-rose-700 bg-rose-50' },
  unscheduled: { label: 'Not scheduled', tone: 'text-ink-soft bg-paper-sunk' },
  flagged: { label: 'From a test', tone: 'text-sage-700 bg-sage-50' },
};

/**
 * Everything worth a second look, in one list: topics last rated shaky,
 * topics whose target date has passed without being revised or mastered,
 * topics that have never had a single stage booked, and topics a recent
 * test analysis called out by name. A topic can appear more than once if
 * more than one reason applies — that's the point, it means it needs it
 * most.
 */
export function NeedsAttention({ shaky, overdue, unscheduled, flagged }) {
  const rows = [
    ...shaky.map((topic) => ({ ...topic, reason: 'shaky', detail: null })),
    ...overdue.map((topic) => ({ ...topic, reason: 'overdue', detail: `due ${longDate(topic.target_date)}` })),
    ...unscheduled.map((topic) => ({ ...topic, reason: 'unscheduled', detail: null })),
    ...flagged.map((topic) => ({ ...topic, reason: 'flagged', detail: null })),
  ];

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-ink">Needs attention</h2>
      <p className="mt-0.5 text-xs text-ink-faint">
        Shaky from your own ratings, overdue against a target date, or never scheduled at all.
      </p>
      <ul className="mt-3 space-y-2">
        {rows.map((topic, index) => {
          const reason = ATTENTION_REASONS[topic.reason];
          return (
            // A topic can carry more than one reason, so the key includes it.
            <li key={`${topic.id}-${topic.reason}-${index}`} className="flex items-center gap-2 text-sm">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: topic.subject_colour }}
              />
              <span className="font-mono text-xs text-ink-faint">{topic.tracking_number}</span>
              <span className="min-w-0 flex-1 truncate text-ink">{topic.title}</span>
              {topic.detail && <span className="shrink-0 text-xs text-ink-faint">{topic.detail}</span>}
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${reason.tone}`}>
                {reason.label}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
