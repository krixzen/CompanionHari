import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { ConfirmDialog } from './ConfirmDialog.jsx';
import { Button, Card } from './ui.jsx';
import { STATUS_LABELS, formatMinutes } from '../lib/format.js';
import { longDate } from '../lib/week.js';

const CONFIDENCE_WORDS = {
  1: 'Lost',
  2: 'Shaky',
  3: 'Getting there',
  4: 'Comfortable',
  5: 'Could teach it',
};

const PAGE = 15;

/**
 * Every session, newest first.
 *
 * This is also the chart's table view: anything a mark encodes with colour or
 * length is written out here in words and numbers.
 */
export function SessionHistory({ onChanged }) {
  const [sessions, setSessions] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    const result = await api.sessions.list({ limit: PAGE, offset });
    setSessions(result.sessions);
    setTotal(result.total);
  }, [offset]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async () => {
    await api.sessions.remove(deleting.id);
    setDeleting(null);
    await load();
    onChanged?.();
  };

  if (total === 0) return null;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-4">
        <h2 className="text-sm font-semibold text-ink">Everything you have recorded</h2>
        <p className="text-xs text-ink-faint">
          {total} session{total === 1 ? '' : 's'}
        </p>
      </div>

      {/* On a phone the table's useful columns scroll out of sight, so the same
          rows are stacked instead. */}
      <ul className="divide-y divide-black/5 border-t border-black/5 sm:hidden">
        {sessions.map((session) => (
          <li key={session.id} className="px-5 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-ink-faint">{longDate(session.date)}</span>
              <span
                className="shrink-0 text-sm text-ink-soft"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {formatMinutes(session.minutes_spent)}
              </span>
            </div>
            <p className="mt-1 flex items-center gap-2 text-sm text-ink">
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: session.subject_colour }}
              />
              <span className="min-w-0 truncate">{session.topic_title}</span>
            </p>
            <p className="text-xs text-ink-faint">
              {session.tracking_number} · {session.subject_name}
              {session.confidence_score
                ? ` · ${CONFIDENCE_WORDS[session.confidence_score]} (${session.confidence_score}/5)`
                : ''}
            </p>
            {session.notes && (
              <p className="mt-1 text-xs italic text-ink-soft">{session.notes}</p>
            )}
            <Button size="sm" variant="ghost" className="mt-1 -ml-2.5" onClick={() => setDeleting(session)}>
              Delete
            </Button>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[34rem] border-t border-black/5 text-sm">
          <caption className="sr-only">Study sessions, newest first</caption>
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-ink-faint">
              <th scope="col" className="px-5 py-2 font-medium">Day</th>
              <th scope="col" className="px-3 py-2 font-medium">Topic</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Time</th>
              <th scope="col" className="px-3 py-2 font-medium">How it felt</th>
              <th scope="col" className="px-5 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {sessions.map((session) => (
              <tr key={session.id} className="align-top">
                <td className="whitespace-nowrap px-5 py-3 text-ink-soft">
                  {longDate(session.date)}
                </td>
                <td className="px-3 py-3">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: session.subject_colour }}
                    />
                    <span className="text-ink">{session.topic_title}</span>
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-faint">
                    {session.tracking_number} · {session.subject_name} ·{' '}
                    {STATUS_LABELS[session.topic_status]}
                  </span>
                  {session.notes && (
                    <span className="mt-1 block text-xs italic text-ink-soft">{session.notes}</span>
                  )}
                </td>
                <td
                  className="whitespace-nowrap px-3 py-3 text-right text-ink-soft"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {formatMinutes(session.minutes_spent)}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-ink-soft">
                  {session.confidence_score
                    ? `${CONFIDENCE_WORDS[session.confidence_score]} (${session.confidence_score}/5)`
                    : '—'}
                </td>
                <td className="px-5 py-3 text-right">
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(session)}>
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > PAGE && (
        <div className="flex items-center justify-between gap-2 border-t border-black/5 px-5 py-3">
          <Button size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
            Newer
          </Button>
          <span className="text-xs text-ink-faint">
            {offset + 1}–{Math.min(offset + PAGE, total)} of {total}
          </span>
          <Button
            size="sm"
            disabled={offset + PAGE >= total}
            onClick={() => setOffset(offset + PAGE)}
          >
            Older
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title="Delete this session?"
        confirmLabel="Delete it"
      >
        {deleting?.plan_entry_id
          ? 'The block it came from goes back to not done, and the time stops counting towards your totals.'
          : 'The time stops counting towards your totals. There is no undo.'}
      </ConfirmDialog>
    </Card>
  );
}
