import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { PageHeader } from '../components/AppShell.jsx';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';
import { TestForm } from '../components/TestForm.jsx';
import { Button, Card, EmptyState, ErrorNote, Spinner } from '../components/ui.jsx';
import { useToast } from '../hooks/useToast.jsx';
import { longDate } from '../lib/week.js';

/** A test's own score, or a dash when nothing was entered for it yet. */
function ScoreLine({ test }) {
  if (test.total_marks == null || test.marks_obtained == null) {
    return <span className="text-ink-faint">No score recorded</span>;
  }
  const percent = test.total_marks > 0 ? Math.round((test.marks_obtained / test.total_marks) * 100) : null;
  return (
    <span>
      {test.marks_obtained} / {test.total_marks}
      {percent !== null && <span className="text-ink-faint"> · {percent}%</span>}
    </span>
  );
}

export default function TestsPage() {
  const toast = useToast();
  const [tests, setTests] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // test, or 'new'
  const [deleting, setDeleting] = useState(null);

  const load = async () => {
    setStatus('loading');
    try {
      setTests(await api.tests.list());
      setStatus('ready');
    } catch (caught) {
      setError(caught.message);
      setStatus('error');
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (status === 'loading') return <Spinner label="Loading your tests…" />;
  if (status === 'error') return <ErrorNote onRetry={load}>{error}</ErrorNote>;

  const save = async (payload) => {
    if (editing === 'new') {
      const test = await api.tests.create(payload);
      setEditing(null);
      await load();
      toast.celebrate(`${test.test_name} added.`);
    } else {
      await api.tests.update(editing.id, payload);
      setEditing(null);
      await load();
      toast.celebrate('Test updated.');
    }
  };

  const remove = async () => {
    try {
      await api.tests.remove(deleting.id);
      setDeleting(null);
      await load();
      toast.celebrate(`${deleting.test_name} removed.`);
    } catch (caught) {
      toast.warn(caught.message);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Tests"
        title="What the tests are telling you"
        description="Log a score, break it down question by question, and let an assistant help you spot the pattern in it."
        actions={
          <Button variant="primary" onClick={() => setEditing('new')}>
            Add a test
          </Button>
        }
      />

      {tests.length === 0 ? (
        <EmptyState
          title="No tests logged yet."
          action={
            <Button variant="primary" onClick={() => setEditing('new')}>
              Add your first test
            </Button>
          }
        >
          Start with just the score — the per-question breakdown and the analysis can come later,
          whenever you have a few minutes for it.
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {tests.map((test) => (
            <Card key={test.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <Link
                  to={`/tests/${test.id}`}
                  className="block truncate font-medium text-ink underline-offset-2 hover:underline"
                >
                  {test.test_name}
                </Link>
                <p className="mt-0.5 truncate text-xs text-ink-faint">
                  {test.test_date ? longDate(test.test_date) : 'No date set'}
                  {test.source ? ` · ${test.source}` : ''}
                  {test.result_count > 0 ? ` · ${test.result_count} questions logged` : ''}
                </p>
              </div>
              <div className="shrink-0 text-sm text-ink-soft">
                <ScoreLine test={test} />
              </div>
              <Button size="sm" variant="ghost" onClick={() => setEditing(test)}>
                Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDeleting(test)}>
                Delete
              </Button>
            </Card>
          ))}
        </div>
      )}

      <TestForm
        open={Boolean(editing)}
        test={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSave={save}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title={`Delete ${deleting?.test_name}?`}
        confirmLabel="Delete test"
      >
        Its question-by-question breakdown goes with it. Any analysis you saved from it stays, just
        no longer linked to a test.
      </ConfirmDialog>
    </div>
  );
}
