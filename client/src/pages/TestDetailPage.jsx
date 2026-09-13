import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { PageHeader } from '../components/AppShell.jsx';
import { TestPatternCard, TestPatternView } from '../components/AnalysisCards.jsx';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';
import { LLMBridge } from '../components/LLMBridge.jsx';
import { TestForm } from '../components/TestForm.jsx';
import { TestResultsTable } from '../components/TestResultsTable.jsx';
import { Button, Card, ErrorNote, Spinner } from '../components/ui.jsx';
import { useStudyData } from '../hooks/useStudyData.jsx';
import { useToast } from '../hooks/useToast.jsx';
import { testPatternPrompt } from '../lib/prompts.js';
import { testPatternSchema } from '../lib/schemas.js';
import { longDate } from '../lib/week.js';

export default function TestDetailPage() {
  const { testId } = useParams();
  const id = Number(testId);
  const navigate = useNavigate();
  const toast = useToast();
  const { subjects } = useStudyData();

  const [test, setTest] = useState(null);
  const [topics, setTopics] = useState([]);
  const [analyses, setAnalyses] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [savingResults, setSavingResults] = useState(false);
  const [bridgeOpen, setBridgeOpen] = useState(false);

  const load = async () => {
    setStatus('loading');
    try {
      const [loadedTest, loadedTopics, loadedAnalyses] = await Promise.all([
        api.tests.get(id),
        api.topics.list(),
        api.analysis.list({ test_id: id, type: 'test_pattern' }),
      ]);
      setTest(loadedTest);
      setTopics(loadedTopics);
      setAnalyses(loadedAnalyses);
      setStatus('ready');
    } catch (caught) {
      setError(caught.message);
      setStatus('error');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (status === 'loading') return <Spinner label="Loading the test…" />;
  if (status === 'error') return <ErrorNote onRetry={load}>{error}</ErrorNote>;

  const saveResults = async (rows) => {
    setSavingResults(true);
    try {
      const updated = await api.tests.setResults(id, rows);
      setTest(updated);
      toast.celebrate('Results saved.');
    } catch (caught) {
      toast.warn(caught.message);
    } finally {
      setSavingResults(false);
    }
  };

  const saveTestInfo = async (payload) => {
    const updated = await api.tests.update(id, payload);
    setTest(updated);
    setEditing(false);
    toast.celebrate('Test updated.');
  };

  const removeTest = async () => {
    try {
      await api.tests.remove(id);
      toast.celebrate(`${test.test_name} removed.`);
      navigate('/tests');
    } catch (caught) {
      toast.warn(caught.message);
    }
  };

  const deleteAnalysis = async (analysis) => {
    try {
      await api.analysis.remove(analysis.id);
      setAnalyses((current) => current.filter((item) => item.id !== analysis.id));
    } catch (caught) {
      toast.warn(caught.message);
    }
  };

  const canAnalyse = test.results.length > 0 || (test.total_marks != null && test.marks_obtained != null);

  return (
    <div>
      <PageHeader
        backTo="/tests"
        backLabel="All tests"
        eyebrow={test.test_date ? longDate(test.test_date) : 'No date set'}
        title={test.test_name}
        description={
          test.total_marks != null && test.marks_obtained != null
            ? `${test.marks_obtained} out of ${test.total_marks}${test.source ? ` · ${test.source}` : ''}`
            : test.source ?? undefined
        }
        actions={
          <>
            <Button onClick={() => setEditing(true)}>Edit</Button>
            <Button variant="ghost" onClick={() => setDeleting(true)}>
              Delete
            </Button>
          </>
        }
      />

      {test.notes && (
        <Card className="mb-4 p-4 text-sm italic text-ink-soft">{test.notes}</Card>
      )}

      <Card className="mb-4 p-4">
        <h2 className="mb-1 text-sm font-semibold text-ink">Question by question</h2>
        <p className="mb-3 text-xs text-ink-faint">
          Optional, but this is what turns the analysis below from generic advice into something
          specific to this test.
        </p>

        {test.stats.questionCount > 0 && (
          <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
            <span>{test.stats.attempted} of {test.stats.questionCount} attempted</span>
            {test.stats.accuracyOfAttempted != null && (
              <span>{test.stats.accuracyOfAttempted}% correct of those attempted</span>
            )}
            {test.stats.averageSeconds != null && <span>{test.stats.averageSeconds}s average per question</span>}
          </div>
        )}

        <TestResultsTable
          results={test.results}
          subjects={subjects}
          topics={topics}
          onSave={saveResults}
          saving={savingResults}
        />
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-ink">What this test says</h2>
            <p className="text-xs text-ink-faint">
              Ask Claude or ChatGPT to look for the pattern in it — it never happens automatically.
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => setBridgeOpen(true)}
            disabled={!canAnalyse}
            title={canAnalyse ? undefined : 'Add a score or a few questions first.'}
          >
            Analyse this test
          </Button>
        </div>

        {analyses.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-faint">No analysis saved for this test yet.</p>
        ) : (
          <div className="space-y-3">
            {analyses.map((analysis) => (
              <TestPatternCard key={analysis.id} analysis={analysis} onDelete={deleteAnalysis} />
            ))}
          </div>
        )}
      </Card>

      <TestForm open={editing} test={test} onClose={() => setEditing(false)} onSave={saveTestInfo} />

      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={removeTest}
        title={`Delete ${test.test_name}?`}
        confirmLabel="Delete test"
      >
        Its question-by-question breakdown goes with it. Any analysis you saved from it stays, just
        no longer linked to a test.
      </ConfirmDialog>

      <LLMBridge
        open={bridgeOpen}
        onClose={() => setBridgeOpen(false)}
        title="Ask what this test shows"
        purpose="This app never contacts an AI service — copy the prompt across yourself, then bring the reply back."
        prompt={testPatternPrompt({ test, results: test.results })}
        schema={testPatternSchema}
        saveLabel="Save this analysis"
        renderPreview={(data) => <TestPatternView payload={data} />}
        onSave={async (data) => {
          const analysis = await api.analysis.create({
            test_id: id,
            analysis_type: 'test_pattern',
            payload: data,
          });
          setAnalyses((current) => [analysis, ...current]);
          setBridgeOpen(false);
          toast.celebrate('Analysis saved.');
        }}
      />
    </div>
  );
}
