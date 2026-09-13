import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/AppShell.jsx';
import { ProgressBar, SubjectDot } from '../components/bits.jsx';
import { TodayPanel } from '../components/TodayPanel.jsx';
import { Button, Card, ErrorNote, Field, Spinner, TextInput } from '../components/ui.jsx';
import { useStudyData } from '../hooks/useStudyData.jsx';
import { useToast } from '../hooks/useToast.jsx';
import { formatMinutes, greeting, progressMessage } from '../lib/format.js';

export default function HomePage() {
  const { student, subjects, status, error, reload, refreshSubjects } = useStudyData();

  if (status === 'loading') return <Spinner label="Getting your things together…" />;
  if (status === 'error') return <ErrorNote onRetry={reload}>{error}</ErrorNote>;

  const totals = subjects.reduce(
    (sum, subject) => ({
      total: sum.total + subject.topic_count,
      started: sum.started + subject.topics_started,
      mastered: sum.mastered + subject.topics_mastered,
      minutes: sum.minutes + subject.allocated_minutes,
    }),
    { total: 0, started: 0, mastered: 0, minutes: 0 }
  );

  return (
    <div>
      <PageHeader
        eyebrow={`${greeting()}${student?.name ? `, ${student.name}` : ''}`}
        title="Here is where things stand."
        description={progressMessage(totals)}
      />

      {totals.total > 0 && (
        <Card className="mb-8 p-5">
          <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 text-sm">
            <span className="text-ink-soft">
              <strong className="text-lg font-semibold text-ink">{totals.total}</strong> topics mapped
            </span>
            <span className="text-ink-soft">
              <strong className="text-lg font-semibold text-ink">{totals.mastered}</strong> feeling solid
            </span>
            <span className="text-ink-soft">
              <strong className="text-lg font-semibold text-ink">{formatMinutes(totals.minutes)}</strong> of
              study time planned
            </span>
          </div>
          <div className="mt-4">
            <ProgressBar {...totals} />
          </div>
        </Card>
      )}

      <TodayPanel onChanged={refreshSubjects} />

      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Your subjects</h2>
          <Link to="/subjects" className="text-sm text-sage-700 underline-offset-2 hover:underline">
            Manage subjects
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {subjects.map((subject) => (
            <Link
              key={subject.id}
              to={`/subjects/${subject.id}`}
              className="group rounded-xl2 bg-paper-raised p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="flex items-center gap-2">
                <SubjectDot colour={subject.colour} />
                <h3 className="truncate font-medium text-ink">{subject.name}</h3>
                <span className="ml-auto shrink-0 font-mono text-xs text-ink-faint">{subject.code}</span>
              </div>

              <p className="mt-2 text-sm text-ink-soft">
                {subject.topic_count === 0
                  ? 'No topics yet — add a syllabus to get going.'
                  : `${subject.topic_count} topics · ${formatMinutes(subject.allocated_minutes)} planned`}
              </p>

              {subject.topic_count > 0 && (
                <div className="mt-3">
                  <ProgressBar
                    total={subject.topic_count}
                    started={subject.topics_started}
                    mastered={subject.topics_mastered}
                    colour={subject.colour}
                  />
                </div>
              )}
            </Link>
          ))}
        </div>
      </section>

      <ProfileCard />
    </div>
  );
}

function ProfileCard() {
  const { student, saveStudent } = useStudyData();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  const start = () => {
    setDraft({
      name: student?.name ?? '',
      class: student?.class ?? '',
      stream: student?.stream ?? '',
    });
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveStudent(draft);
      toast.celebrate('Saved.');
      setOpen(false);
    } catch (error) {
      toast.warn(error.message);
    } finally {
      setSaving(false);
    }
  };

  const details = [student?.class, student?.stream].filter(Boolean).join(' · ');

  return (
    <section className="mt-10">
      {!open ? (
        <p className="text-sm text-ink-faint">
          {[student?.name, details].filter(Boolean).join(' · ')}
          {' · '}
          <button type="button" onClick={start} className="text-sage-700 underline-offset-2 hover:underline">
            Edit your details
          </button>
        </p>
      ) : (
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-ink">Your details</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="Name">
              <TextInput
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </Field>
            <Field label="Class">
              <TextInput
                value={draft.class}
                placeholder="11"
                onChange={(event) => setDraft({ ...draft, class: event.target.value })}
              />
            </Field>
            <Field label="Stream">
              <TextInput
                value={draft.stream}
                placeholder="Science"
                onChange={(event) => setDraft({ ...draft, stream: event.target.value })}
              />
            </Field>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </Card>
      )}
    </section>
  );
}
