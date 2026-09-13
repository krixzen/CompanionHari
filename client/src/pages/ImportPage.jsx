import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { PageHeader } from '../components/AppShell.jsx';
import { LLMBridge } from '../components/LLMBridge.jsx';
import { SubTopicEditor } from '../components/SubTopicEditor.jsx';
import { Button, Card, EmptyState, Field, Select, Spinner, TextArea, TextInput } from '../components/ui.jsx';
import { useStudyData } from '../hooks/useStudyData.jsx';
import { useToast } from '../hooks/useToast.jsx';
import { DIFFICULTY_LABELS, formatMinutes } from '../lib/format.js';
import { syllabusToTopicsPrompt } from '../lib/prompts.js';
import { topicListSchema } from '../lib/schemas.js';

const DEFAULT_MINUTES = 60;

let draftKey = 0;
const toDraft = (topic) => ({
  key: `draft-${(draftKey += 1)}`,
  include: true,
  title: topic.title ?? '',
  unit: topic.unit ?? '',
  sub_topics: topic.sub_topics ?? topic.subTopics ?? [],
  allocated_duration_minutes: topic.allocated_duration_minutes ?? DEFAULT_MINUTES,
  difficulty: topic.difficulty ?? 3,
});

export default function ImportPage() {
  const { subjectId } = useParams();
  const id = Number(subjectId);
  const navigate = useNavigate();
  const toast = useToast();

  const { subjects, refreshSubjects, status: dataStatus } = useStudyData();
  const subject = subjects.find((candidate) => candidate.id === id);

  const [source, setSource] = useState(null); // { text, name }
  const [drafts, setDrafts] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [options, setOptions] = useState({ unitHandling: 'auto', splitColonLists: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [bridgeOpen, setBridgeOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  if (dataStatus === 'loading') return <Spinner label="Loading…" />;
  if (!subject) {
    return (
      <EmptyState title="That subject is not here any more.">
        <Link to="/subjects" className="text-sage-700 underline">
          Back to subjects
        </Link>
      </EmptyState>
    );
  }

  const runParse = async ({ file, text, nextOptions }) => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.syllabus.parse({ file, text, ...(nextOptions ?? options) });
      setSource({ text: result.sourceText, name: result.sourceName });
      setDrafts(result.topics.map(toDraft));
      setWarnings(result.warnings);
      setOptions({
        unitHandling: result.options.unitHandling,
        splitColonLists: result.options.splitColonLists,
      });
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(false);
    }
  };

  const reparse = (nextOptions) => {
    setOptions(nextOptions);
    runParse({ text: source.text, nextOptions });
  };

  const included = (drafts ?? []).filter((draft) => draft.include && draft.title.trim());

  const save = async () => {
    if (!included.length) {
      setError('Tick at least one topic to save.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.topics.create({
        subject_id: id,
        topics: included.map(({ title, unit, sub_topics, allocated_duration_minutes, difficulty }) => ({
          title: title.trim(),
          unit: unit.trim() || null,
          sub_topics,
          allocated_duration_minutes: Number(allocated_duration_minutes) || DEFAULT_MINUTES,
          difficulty: Number(difficulty) || 3,
        })),
      });
      await refreshSubjects();
      toast.celebrate(
        `${included.length} topic${included.length === 1 ? '' : 's'} added to ${subject.name}.`
      );
      navigate(`/subjects/${id}`);
    } catch (caught) {
      setError(caught.message);
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        backTo={`/subjects/${id}`}
        backLabel={`Back to ${subject.name}`}
        eyebrow={subject.name}
        title={drafts ? 'Check this over' : 'Bring in a syllabus'}
        description={
          drafts
            ? 'Nothing is saved yet. Fix anything that came out wrong, untick what you do not want, then save.'
            : 'Upload the syllabus outline or paste it in. It is read on this computer and turned into a list you can correct before anything is kept.'
        }
      />

      {!drafts && (
        <SourceStep
          busy={busy}
          error={error}
          onParse={runParse}
          onUseAssistant={() => setBridgeOpen(true)}
        />
      )}

      {drafts && (
        <ReviewStep
          drafts={drafts}
          setDrafts={setDrafts}
          warnings={warnings}
          options={options}
          onReparse={reparse}
          sourceName={source?.name}
          busy={busy}
          error={error}
          saving={saving}
          includedCount={included.length}
          onSave={save}
          onStartOver={() => {
            setDrafts(null);
            setSource(null);
            setWarnings([]);
            setError(null);
          }}
          onUseAssistant={() => setBridgeOpen(true)}
        />
      )}

      <LLMBridge
        open={bridgeOpen}
        onClose={() => setBridgeOpen(false)}
        title="Let Claude or ChatGPT tidy the syllabus"
        purpose="Useful when a syllabus is written as prose, or the automatic reading came out messy. This app never contacts an AI service — you carry the text across yourself."
        prompt={syllabusToTopicsPrompt({
          subjectName: subject.name,
          syllabusText: source?.text || '(Paste your syllabus text here before copying this prompt.)',
        })}
        schema={topicListSchema}
        saveLabel="Use these topics"
        renderPreview={(data) => (
          <div className="max-h-64 space-y-2 overflow-y-auto">
            <p className="text-sm text-sage-800">
              {data.topics.length} topic{data.topics.length === 1 ? '' : 's'} came back. They go to the
              review list next — nothing is saved yet.
            </p>
            <ul className="space-y-1 text-sm text-ink-soft">
              {data.topics.slice(0, 40).map((topic, index) => (
                // Titles from an assistant can repeat, so index is the key.
                // eslint-disable-next-line react/no-array-index-key
                <li key={index}>
                  <span className="text-ink">{topic.title}</span>
                  {topic.sub_topics?.length ? ` — ${topic.sub_topics.length} sub-topics` : ''}
                </li>
              ))}
              {data.topics.length > 40 && <li>…and {data.topics.length - 40} more.</li>}
            </ul>
          </div>
        )}
        onSave={(data) => {
          setDrafts(data.topics.map(toDraft));
          setWarnings([]);
          setBridgeOpen(false);
          toast.celebrate('Brought in. Check it over before saving.');
        }}
      />
    </div>
  );
}

function SourceStep({ busy, error, onParse, onUseAssistant }) {
  const [text, setText] = useState('');
  const fileRef = useRef(null);

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-ink">Upload a file</h2>
        <p className="mt-1 text-sm text-ink-soft">
          A PDF or plain text file of the syllabus outline — not a whole textbook.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.txt,.md,text/plain,application/pdf"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onParse({ file });
            event.target.value = '';
          }}
          className="mt-3 block w-full text-sm text-ink-soft file:mr-3 file:rounded-full file:border-0 file:bg-sage-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-sage-700"
        />
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-ink">Or paste the text</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Handy for a short syllabus, or when a PDF will not read properly.
        </p>
        <TextArea
          rows={8}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={'UNIT I: Kinematics\n1. Motion in a Straight Line\n   • Frame of reference\n2. Motion in a Plane'}
          className="mt-3 font-mono text-xs"
        />
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onUseAssistant}>
            Ask Claude or ChatGPT instead
          </Button>
          <Button variant="primary" disabled={!text.trim() || busy} onClick={() => onParse({ text })}>
            {busy ? 'Reading…' : 'Read this'}
          </Button>
        </div>
      </Card>

      {busy && <Spinner label="Reading the syllabus…" />}
      {error && <p className="text-sm text-amber-800">{error}</p>}
    </div>
  );
}

function ReviewStep({
  drafts,
  setDrafts,
  warnings,
  options,
  onReparse,
  sourceName,
  busy,
  error,
  saving,
  includedCount,
  onSave,
  onStartOver,
  onUseAssistant,
}) {
  const update = (key, changes) =>
    setDrafts((current) =>
      current.map((draft) => (draft.key === key ? { ...draft, ...changes } : draft))
    );

  const remove = (key) => setDrafts((current) => current.filter((draft) => draft.key !== key));

  const setAllIncluded = (include) =>
    setDrafts((current) => current.map((draft) => ({ ...draft, include })));

  const setAllDurations = (minutes) =>
    setDrafts((current) => current.map((draft) => ({ ...draft, allocated_duration_minutes: minutes })));

  const addBlank = () => setDrafts((current) => [...current, toDraft({ title: '' })]);

  const totalMinutes = drafts
    .filter((draft) => draft.include)
    .reduce((sum, draft) => sum + (Number(draft.allocated_duration_minutes) || 0), 0);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-soft">
            Read from <span className="text-ink">{sourceName}</span> ·{' '}
            <strong className="text-ink">{includedCount}</strong> of {drafts.length} ticked ·{' '}
            {formatMinutes(totalMinutes)} of study time
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setAllIncluded(true)}>
              Tick all
            </Button>
            <Button size="sm" onClick={() => setAllIncluded(false)}>
              Untick all
            </Button>
            <Button size="sm" variant="ghost" onClick={onStartOver}>
              Start over
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 border-t border-black/5 pt-4 sm:grid-cols-2">
          <Field label="Units and chapters" hint="Change this if the split came out at the wrong level.">
            <Select
              value={options.unitHandling}
              disabled={busy}
              onChange={(event) => onReparse({ ...options, unitHandling: event.target.value })}
            >
              <option value="auto">Work it out automatically</option>
              <option value="unit-is-group">Units group the topics beneath them</option>
              <option value="unit-is-topic">Each unit is a topic of its own</option>
            </Select>
          </Field>

          <Field label="Study time for every topic">
            <div className="flex flex-wrap gap-1.5">
              {[30, 45, 60, 90].map((minutes) => (
                <Button key={minutes} size="sm" onClick={() => setAllDurations(minutes)}>
                  {formatMinutes(minutes)}
                </Button>
              ))}
            </div>
          </Field>

          <label className="flex items-center gap-2 text-sm text-ink-soft sm:col-span-2">
            <input
              type="checkbox"
              checked={options.splitColonLists}
              disabled={busy}
              onChange={(event) => onReparse({ ...options, splitColonLists: event.target.checked })}
              className="h-4 w-4 rounded border-black/20 text-sage-600 focus:ring-sage-400"
            />
            Split lines like “Sets: finite sets, subsets, power set” into sub-topics
          </label>
        </div>
      </Card>

      {warnings.length > 0 && (
        <div className="rounded-xl2 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      )}

      {busy && <Spinner label="Reading it again…" />}

      <div className="space-y-2">
        {drafts.map((draft, index) => (
          <DraftRow
            key={draft.key}
            draft={draft}
            index={index}
            onChange={(changes) => update(draft.key, changes)}
            onRemove={() => remove(draft.key)}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button onClick={addBlank}>Add a missing topic</Button>
          <Button variant="ghost" onClick={onUseAssistant}>
            Ask Claude or ChatGPT to tidy it
          </Button>
        </div>
        <Button variant="primary" size="lg" onClick={onSave} disabled={saving || !includedCount}>
          {saving
            ? 'Saving…'
            : `Save ${includedCount} topic${includedCount === 1 ? '' : 's'}`}
        </Button>
      </div>

      {error && <p className="text-right text-sm text-amber-800">{error}</p>}
    </div>
  );
}

function DraftRow({ draft, index, onChange, onRemove }) {
  const [open, setOpen] = useState(false);

  return (
    <Card className={`p-3 sm:p-4 ${draft.include ? '' : 'opacity-50'}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={draft.include}
          onChange={(event) => onChange({ include: event.target.checked })}
          className="mt-2.5 h-4 w-4 shrink-0 rounded border-black/20 text-sage-600 focus:ring-sage-400"
          aria-label={`Include ${draft.title || `topic ${index + 1}`}`}
        />

        <div className="min-w-0 flex-1 space-y-2">
          <TextInput
            value={draft.title}
            placeholder="Topic title"
            onChange={(event) => onChange({ title: event.target.value })}
            aria-label={`Title of topic ${index + 1}`}
          />

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <TextInput
              value={draft.unit}
              placeholder="Unit or chapter (optional)"
              onChange={(event) => onChange({ unit: event.target.value })}
              aria-label={`Unit of topic ${index + 1}`}
              className="w-full sm:w-64"
            />

            <label className="flex items-center gap-1.5 text-ink-soft">
              <input
                type="number"
                min="5"
                max="1440"
                step="5"
                value={draft.allocated_duration_minutes}
                onChange={(event) => onChange({ allocated_duration_minutes: event.target.value })}
                aria-label={`Study minutes for topic ${index + 1}`}
                className="w-16 rounded-lg border border-black/10 bg-paper-raised px-2 py-1 text-sm focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-200"
              />
              <span className="text-xs text-ink-faint">min</span>
            </label>

            <select
              value={draft.difficulty}
              onChange={(event) => onChange({ difficulty: Number(event.target.value) })}
              aria-label={`Difficulty of topic ${index + 1}`}
              className="rounded-lg border border-black/10 bg-paper-raised px-2 py-1 text-sm text-ink-soft focus:border-sage-400 focus:outline-none"
            >
              {[1, 2, 3, 4, 5].map((level) => (
                <option key={level} value={level}>
                  {level} — {DIFFICULTY_LABELS[level]}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setOpen((current) => !current)}
              className="text-xs text-sage-700 underline-offset-2 hover:underline"
              aria-expanded={open}
            >
              {open
                ? 'Hide sub-topics'
                : `${draft.sub_topics.length} sub-topic${draft.sub_topics.length === 1 ? '' : 's'}`}
            </button>
          </div>

          {open && (
            <div className="border-l-2 border-black/5 pl-3 pt-1">
              <SubTopicEditor
                value={draft.sub_topics}
                onChange={(sub_topics) => onChange({ sub_topics })}
              />
            </div>
          )}
        </div>

        <Button size="sm" variant="ghost" onClick={onRemove} aria-label={`Remove topic ${index + 1}`}>
          Remove
        </Button>
      </div>
    </Card>
  );
}
