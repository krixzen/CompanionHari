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
import { Button, Card, EmptyState, ErrorNote, Spinner } from '../components/ui.jsx';
import { formatMinutes } from '../lib/format.js';

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

  const { summary, daily, bySubject, confidence, status: statusCounts, shaky } = report;
  const hasSessions = summary.allTime.sessions > 0;

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
        }
      />

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
          <StatRow summary={summary} />

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

          {shaky.length > 0 && <ShakyTopics topics={shaky} />}

          <SessionHistory onChanged={load} />
        </div>
      )}
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

function ShakyTopics({ topics }) {
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-ink">Worth another look</h2>
      <p className="mt-0.5 text-xs text-ink-faint">
        The topics you last rated as shaky. Knowing which ones they are is most of the work.
      </p>
      <ul className="mt-3 space-y-2">
        {topics.map((topic) => (
          <li key={topic.id} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: topic.subject_colour }}
            />
            <span className="font-mono text-xs text-ink-faint">{topic.tracking_number}</span>
            <span className="min-w-0 flex-1 truncate text-ink">{topic.title}</span>
            <span className="shrink-0 text-xs text-ink-faint">{topic.subject_name}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
