import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { PageHeader } from '../components/AppShell.jsx';
import { Card, ErrorNote, Spinner } from '../components/ui.jsx';
import { formatMinutes } from '../lib/format.js';
import { NeedsAttention, StreakLine, SyllabusCoverage } from './ProgressPage.jsx';

/**
 * A calm, read-only summary for a weekly check-in — not a second copy of
 * the Progress page. No editing, no session-log detail, nothing to click
 * through into: just the headline numbers a parent would ask about,
 * meant to be glanced at together rather than dug through alone.
 */
export default function ParentPage() {
  const [report, setReport] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const load = async () => {
    setStatus('loading');
    try {
      setReport(await api.progress.get({ days: 28 }));
      setStatus('ready');
    } catch (caught) {
      setError(caught.message);
      setStatus('error');
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (status === 'loading' && !report) return <Spinner label="Adding it all up…" />;
  if (status === 'error') return <ErrorNote onRetry={load}>{error}</ErrorNote>;

  const { summary, bySubject, coverage, shaky, overdue, unscheduled, flagged, streak } = report;
  const hasSyllabus = coverage.overall.total_items > 0;
  const needsAttentionCount = shaky.length + overdue.length + unscheduled.length + flagged.length;
  const studiedThisWeek = bySubject.filter((subject) => subject.minutes > 0);

  return (
    <div>
      <PageHeader
        eyebrow="For a weekly check-in"
        title="How the week's going"
        description="A summary, not a log — a good screen to look at together rather than something to check in on daily."
      />

      <div className="space-y-4">
        <StreakLine streak={streak} />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs text-ink-faint">This week</p>
            <p className="mt-1 text-xl font-semibold text-ink">{formatMinutes(summary.week.minutes)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-ink-faint">Days studied</p>
            <p className="mt-1 text-xl font-semibold text-ink">{summary.week.days} of 7</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-ink-faint">How it felt</p>
            <p className="mt-1 text-xl font-semibold text-ink">
              {summary.week.confidence === null ? '—' : `${summary.week.confidence} / 5`}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-ink-faint">Logged in total</p>
            <p className="mt-1 text-xl font-semibold text-ink">{formatMinutes(summary.allTime.minutes)}</p>
          </Card>
        </div>

        {hasSyllabus && <SyllabusCoverage coverage={coverage} />}

        {studiedThisWeek.length > 0 && (
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-ink">Where the time went this week</h2>
            <ul className="mt-3 space-y-2">
              {studiedThisWeek.map((subject) => (
                <li key={subject.subject_id} className="flex items-center gap-3 text-sm">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: subject.colour }}
                  />
                  <span className="min-w-0 flex-1 truncate text-ink">{subject.name}</span>
                  <span className="shrink-0 text-xs text-ink-faint">{formatMinutes(subject.minutes)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {needsAttentionCount > 0 && (
          <NeedsAttention shaky={shaky} overdue={overdue} unscheduled={unscheduled} flagged={flagged} />
        )}

        {summary.allTime.sessions === 0 && (
          <p className="text-sm text-ink-soft">Nothing recorded yet — check back once a session or two is logged.</p>
        )}
      </div>
    </div>
  );
}
