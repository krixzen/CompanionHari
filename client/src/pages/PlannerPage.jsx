import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { api } from '../api/client.js';
import { PageHeader } from '../components/AppShell.jsx';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';
import { EntryDialog } from '../components/EntryDialog.jsx';
import { LLMBridge } from '../components/LLMBridge.jsx';
import { PlannerSettingsDialog } from '../components/PlannerSettingsDialog.jsx';
import { RevisionSuggestion, SessionDialog } from '../components/SessionDialog.jsx';
import { MealsReview } from '../components/MealsReview.jsx';
import { ScheduleReview } from '../components/ScheduleReview.jsx';
import { UnscheduledPanel } from '../components/UnscheduledPanel.jsx';
import { PX_PER_MINUTE, WeekGrid, gridWindow } from '../components/WeekGrid.jsx';
import { Button, Card, EmptyState, ErrorNote, Select, Spinner } from '../components/ui.jsx';
import { schedulePlanPrompt } from '../lib/prompts.js';
import { schedulePlanSchema } from '../lib/schemas.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { usePlanner } from '../hooks/usePlanner.js';
import { useStudyData } from '../hooks/useStudyData.jsx';
import { useToast } from '../hooks/useToast.jsx';
import { formatMinutes } from '../lib/format.js';
import {
  DAY_NAMES,
  addDays,
  dayNumber,
  dayOfWeek,
  describeWeek,
  longDate,
  startOfWeek,
  toMinutes,
  toTime,
  todayIso,
  weekDates,
} from '../lib/week.js';

/** How far ahead "Ask Claude or ChatGPT to plan it" can be asked to look. */
const SCHEDULE_HORIZONS = [
  { key: 'week', label: 'This week', days: 6 },
  { key: '2weeks', label: 'Next 2 weeks', days: 13 },
  { key: '4weeks', label: 'Next 4 weeks', days: 27 },
];

export default function PlannerPage() {
  const today = todayIso();
  const [monday, setMonday] = useState(() => startOfWeek(today));
  const [selectedDay, setSelectedDay] = useState(today);
  const [viewMode, setViewMode] = useState('week'); // 'week' | 'day' — a phone is always 'day' regardless

  const isNarrow = useMediaQuery('(max-width: 767px)');
  const { refreshSubjects } = useStudyData();
  const toast = useToast();

  const {
    entries,
    anchors,
    settings,
    term,
    unscheduled,
    status,
    error,
    reload,
    refresh,
    setSettings,
  } = usePlanner(monday);

  const [openEntry, setOpenEntry] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [dragging, setDragging] = useState(null);
  const [logging, setLogging] = useState(null);
  const [suggestion, setSuggestion] = useState(null);
  const [planning, setPlanning] = useState(false);
  const [report, setReport] = useState(null);
  const [scheduleBridgeOpen, setScheduleBridgeOpen] = useState(false);
  const [scheduleDraft, setScheduleDraft] = useState(null); // rows awaiting review, or null when closed
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [mealDraft, setMealDraft] = useState(null); // meal-time rows awaiting review, or null when closed
  const [savingMeals, setSavingMeals] = useState(false);

  // Which stretch "Ask Claude or ChatGPT to plan it" should cover — the
  // visible week by default, or further out when replanning a bigger chunk
  // (after falling behind, say, or setting up a fresh coverage push).
  const [scheduleHorizon, setScheduleHorizon] = useState('week');
  const [scheduleContext, setScheduleContext] = useState({ from: monday, to: addDays(monday, 6), anchors, entries });
  const [loadingScheduleContext, setLoadingScheduleContext] = useState(false);

  const coverageAvailable = Boolean(term?.cover_by_date && term.cover_by_date > monday);
  const scheduleTo =
    scheduleHorizon === 'coverage' && coverageAvailable
      ? term.cover_by_date
      : addDays(monday, SCHEDULE_HORIZONS.find((option) => option.key === scheduleHorizon)?.days ?? 6);

  useEffect(() => {
    if (!coverageAvailable && scheduleHorizon === 'coverage') setScheduleHorizon('week');
  }, [coverageAvailable, scheduleHorizon]);

  useEffect(() => {
    let cancelled = false;
    setLoadingScheduleContext(true);
    Promise.all([api.anchors.effective(monday, scheduleTo), api.plan.list(monday, scheduleTo)])
      .then(([rangedAnchors, rangedEntries]) => {
        if (cancelled) return;
        setScheduleContext({ from: monday, to: scheduleTo, anchors: rangedAnchors, entries: rangedEntries });
      })
      .finally(() => {
        if (!cancelled) setLoadingScheduleContext(false);
      });
    return () => {
      cancelled = true;
    };
  }, [monday, scheduleTo]);

  const dates = useMemo(() => weekDates(monday), [monday]);
  const showingOneDay = isNarrow || viewMode === 'day';
  const visibleDates = showingOneDay ? [selectedDay] : dates;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // A short hold before a drag starts, so the calendar still scrolls on a phone.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } })
  );

  const totals = useMemo(() => {
    const countOf = (type) => entries.filter((entry) => entry.entry_type === type).length;
    return {
      study: countOf('study'),
      practice: countOf('practice'),
      revision: countOf('revision'),
      minutes: entries.reduce((sum, entry) => sum + entry.scheduled_duration_minutes, 0),
      done: entries.filter((entry) => entry.completed).length,
    };
  }, [entries]);

  const goToWeek = (nextMonday) => {
    setMonday(nextMonday);
    // Keep the day picker inside the week being looked at.
    const days = weekDates(nextMonday);
    setSelectedDay(days.includes(today) ? today : days[0]);
  };

  if (status === 'loading') return <Spinner label="Opening your week…" />;
  if (status === 'error') return <ErrorNote onRetry={reload}>{error}</ErrorNote>;

  /** Turns a drop onto a day column into a date and a start time. */
  const handleDragEnd = async ({ active, over }) => {
    setDragging(null);
    if (!over) return;

    const date = String(over.id);
    const window = gridWindow(settings, entries);

    const rect = active.rect.current.translated ?? active.rect.current.initial;
    const offsetTop = (rect?.top ?? 0) - over.rect.top;
    const snapped = Math.round((window.start + offsetTop / PX_PER_MINUTE) / 5) * 5;

    const payload = active.data.current;
    const duration =
      payload.kind === 'entry'
        ? payload.entry.scheduled_duration_minutes
        : payload.topic.allocated_duration_minutes;

    const start = Math.max(0, Math.min(snapped, 24 * 60 - duration));

    try {
      if (payload.kind === 'entry') {
        const entry = payload.entry;
        // A tap that barely moves should not cost a round trip.
        if (entry.scheduled_date === date && start === toMinutes(entry.scheduled_start_time)) return;
        await api.plan.update(entry.id, {
          scheduled_date: date,
          scheduled_start_time: toTime(start),
        });
      } else {
        await api.plan.create({
          topic_id: payload.topic.id,
          scheduled_date: date,
          scheduled_start_time: toTime(start),
          scheduled_duration_minutes: duration,
        });
        toast.celebrate(`${payload.topic.tracking_number} is on the calendar.`);
      }
      await refresh();
    } catch (caught) {
      toast.warn(caught.message);
    }
  };

  const planWeek = async () => {
    setPlanning(true);
    setReport(null);
    try {
      const result = await api.plan.auto(monday, addDays(monday, 6));
      await refresh();
      await refreshSubjects();

      if (result.placed === 0) {
        toast.warn(result.message ?? 'Nothing new could be fitted in this week.');
      } else {
        toast.celebrate(
          `${result.placed} study block${result.placed === 1 ? '' : 's'} planned${
            result.revisions ? `, plus ${result.revisions} revision blocks` : ''
          }.`
        );
      }
      if (result.skipped?.length) setReport(result);
    } catch (caught) {
      toast.warn(caught.message);
    } finally {
      setPlanning(false);
    }
  };

  /**
   * Resolves the assistant's tracking numbers against topics actually waiting
   * for a slot. A number ending in "/NN" (e.g. "PHY-001/02") names one
   * sub-topic rather than the whole thing — anything else is treated as
   * unresolved, the same as a tracking number that does not exist at all.
   */
  const resolveScheduleDraft = (data) => {
    let key = 0;
    return data.entries.map((entry) => {
      const match = entry.tracking_number.match(/^(.*)\/(\d{1,2})$/);
      const baseNumber = match ? match[1] : entry.tracking_number;
      const subTopicIndex = match ? Number(match[2]) - 1 : null;

      const baseTopic = unscheduled.find((candidate) => candidate.tracking_number === baseNumber);
      const inRange = subTopicIndex === null || (baseTopic && subTopicIndex < baseTopic.sub_topics.length);
      const topic = inRange ? baseTopic : undefined;

      return {
        key: `sched-${(key += 1)}`,
        tracking_number: entry.tracking_number,
        topic,
        sub_topic_index: inRange ? subTopicIndex : null,
        sub_topic_title: topic && subTopicIndex !== null ? topic.sub_topics[subTopicIndex] : null,
        include: Boolean(topic),
        entry_type: entry.session_type === 'practice' ? 'practice' : 'study',
        scheduled_date: entry.date,
        scheduled_start_time: entry.start_time,
        scheduled_duration_minutes: entry.duration_minutes,
      };
    });
  };

  const saveSchedule = async (rows) => {
    const chosen = rows.filter((row) => row.include && row.topic);
    if (chosen.length === 0) {
      setScheduleDraft(null);
      return;
    }

    setSavingSchedule(true);
    let failed = 0;
    for (const row of chosen) {
      try {
        await api.plan.create({
          topic_id: row.topic.id,
          scheduled_date: row.scheduled_date,
          scheduled_start_time: row.scheduled_start_time,
          scheduled_duration_minutes: Number(row.scheduled_duration_minutes),
          sub_topic_index: row.sub_topic_index,
          entry_type: row.entry_type,
        });
      } catch {
        failed += 1;
      }
    }
    await refresh();
    await refreshSubjects();
    setSavingSchedule(false);
    setScheduleDraft(null);

    const placed = chosen.length - failed;
    if (placed > 0) {
      toast.celebrate(`${placed} block${placed === 1 ? '' : 's'} added to the calendar.`);
    }
    if (failed > 0) {
      toast.warn(`${failed} block${failed === 1 ? '' : 's'} could not be placed — check for a clash and try again.`);
    }
  };

  /** Meal times the assistant proposed — not tied to any topic, so they become one-off extras. */
  const resolveMealDraft = (data) => {
    let key = 0;
    return (data.meals ?? []).map((meal) => ({
      key: `meal-${(key += 1)}`,
      label: meal.label,
      scheduled_date: meal.date,
      start_time: meal.start_time,
      end_time: meal.end_time,
      include: true,
    }));
  };

  const saveMeals = async (rows) => {
    const chosen = rows.filter((row) => row.include);
    if (chosen.length === 0) {
      setMealDraft(null);
      return;
    }

    setSavingMeals(true);
    let failed = 0;
    for (const row of chosen) {
      try {
        await api.anchors.create({
          label: row.label.trim() || 'Meal',
          type: 'meal',
          day_of_week: dayOfWeek(row.scheduled_date),
          start_time: row.start_time,
          end_time: row.end_time,
          effective_from: row.scheduled_date,
          effective_until: row.scheduled_date,
        });
      } catch {
        failed += 1;
      }
    }
    await refresh();
    setSavingMeals(false);
    setMealDraft(null);

    const placed = chosen.length - failed;
    if (placed > 0) toast.celebrate(`${placed} meal time${placed === 1 ? '' : 's'} added.`);
    if (failed > 0) {
      toast.warn(`${failed} meal time${failed === 1 ? '' : 's'} could not be added — check for a clash and try again.`);
    }
  };

  const saveEntry = async (entry, changes) => {
    await api.plan.update(entry.id, changes);
    await refresh();
    await refreshSubjects();
    const updated = await api.plan.list(monday, addDays(monday, 6));
    setOpenEntry(updated.find((candidate) => candidate.id === entry.id) ?? null);
  };

  /** Ticking a block off asks how it went; the session is what marks it done. */
  const logSession = async (payload) => {
    const result = await api.sessions.create(payload);
    setLogging(null);
    await refresh();
    await refreshSubjects();
    toast.celebrate(`${formatMinutes(payload.minutes_spent)} recorded. That counts.`);
    if (result.suggestion) setSuggestion(result.suggestion);
  };

  const undoLog = async (entry) => {
    const session = await api.sessions.forPlanEntry(entry.id);
    if (session) await api.sessions.remove(session.id);
    else await api.plan.update(entry.id, { completed: false });
    await refresh();
    await refreshSubjects();
    setOpenEntry(null);
  };

  const bookSuggestion = async (proposal) => {
    try {
      await api.plan.create({
        topic_id: proposal.topic_id,
        scheduled_date: proposal.scheduled_date,
        scheduled_start_time: proposal.scheduled_start_time,
        scheduled_duration_minutes: proposal.scheduled_duration_minutes,
        entry_type: 'revision',
        revision_interval: '3day',
      });
      await refresh();
      toast.celebrate('Booked in. Nothing else to do about it now.');
    } catch (caught) {
      toast.warn(caught.message);
    } finally {
      setSuggestion(null);
    }
  };

  const deleteEntry = async (entry) => {
    await api.plan.remove(entry.id);
    setOpenEntry(null);
    await refresh();
    toast.celebrate(`${entry.tracking_number} taken off the calendar.`);
  };

  const clearWeek = async () => {
    try {
      const { removed } = await api.plan.clear(monday, addDays(monday, 6));
      setClearOpen(false);
      await refresh();
      toast.celebrate(
        removed === 0 ? 'There was nothing left to clear.' : `${removed} blocks cleared.`
      );
    } catch (caught) {
      toast.warn(caught.message);
    }
  };

  const noAnchors = anchors.length === 0;

  return (
    <div>
      <PageHeader
        eyebrow="Your week"
        title={describeWeek(monday)}
        description={
          totals.study + totals.practice + totals.revision === 0
            ? 'Nothing booked in yet. Plan the week and you can move anything afterwards.'
            : `${totals.study} study block${totals.study === 1 ? '' : 's'}${
                totals.practice ? `, ${totals.practice} practice block${totals.practice === 1 ? '' : 's'}` : ''
              } and ${totals.revision} revision block${
                totals.revision === 1 ? '' : 's'
              } · ${formatMinutes(totals.minutes)} in total${
                totals.done ? ` · ${totals.done} done already` : ''
              }`
        }
        actions={
          <>
            <Link to="/anchors">
              <Button>Fixed commitments</Button>
            </Link>
            <Button onClick={() => setSettingsOpen(true)}>Planner settings</Button>
            <Select
              value={scheduleHorizon}
              onChange={(event) => setScheduleHorizon(event.target.value)}
              style={{ width: 'auto' }}
              aria-label="How far ahead to plan with an assistant"
            >
              {SCHEDULE_HORIZONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
              {coverageAvailable && <option value="coverage">Until my coverage deadline</option>}
            </Select>
            <Button onClick={() => setScheduleBridgeOpen(true)} disabled={loadingScheduleContext}>
              {loadingScheduleContext ? 'Preparing…' : 'Ask Claude or ChatGPT to plan it'}
            </Button>
            <Button variant="primary" onClick={planWeek} disabled={planning}>
              {planning ? 'Planning…' : 'Plan my week'}
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => goToWeek(addDays(monday, -7))}>
          ‹ Previous
        </Button>
        <Button size="sm" onClick={() => goToWeek(startOfWeek(today))}>
          This week
        </Button>
        <Button size="sm" onClick={() => goToWeek(addDays(monday, 7))}>
          Next ›
        </Button>
        {!isNarrow && (
          <div className="flex gap-1 rounded-full bg-paper-sunk p-0.5" role="group" aria-label="Week or day view">
            <button
              type="button"
              onClick={() => setViewMode('week')}
              aria-pressed={viewMode === 'week'}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                viewMode === 'week' ? 'bg-sage-600 text-white' : 'text-ink-soft hover:bg-sage-100'
              }`}
            >
              Week
            </button>
            <button
              type="button"
              onClick={() => setViewMode('day')}
              aria-pressed={viewMode === 'day'}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                viewMode === 'day' ? 'bg-sage-600 text-white' : 'text-ink-soft hover:bg-sage-100'
              }`}
            >
              Day
            </button>
          </div>
        )}
        <Button size="sm" variant="ghost" onClick={() => setClearOpen(true)} className="ml-auto">
          Clear unfinished
        </Button>
      </div>

      {noAnchors && (
        <Card className="mb-4 p-4">
          <p className="text-sm text-ink">
            The planner does not know when you are busy yet, so it will fill the whole day.
          </p>
          <Link to="/anchors" className="mt-2 inline-block">
            <Button size="sm" variant="primary">
              Set up your week first
            </Button>
          </Link>
        </Card>
      )}

      {showingOneDay && (
        <div className="mb-3 flex gap-1 overflow-x-auto pb-1">
          {dates.map((date) => (
            <button
              key={date}
              type="button"
              onClick={() => setSelectedDay(date)}
              className={`flex min-w-[3rem] flex-col items-center rounded-xl px-2 py-1.5 text-xs transition ${
                date === selectedDay
                  ? 'bg-sage-600 text-white'
                  : date === today
                    ? 'bg-sage-100 text-sage-800'
                    : 'bg-paper-sunk text-ink-soft'
              }`}
            >
              <span>{DAY_NAMES[dayOfWeek(date)]}</span>
              <span className="text-sm font-semibold">{dayNumber(date)}</span>
            </button>
          ))}
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={({ active }) => setDragging(active.data.current)}
        onDragCancel={() => setDragging(null)}
        onDragEnd={handleDragEnd}
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_15rem]">
          <WeekGrid
            dates={visibleDates}
            entries={entries}
            anchors={anchors}
            settings={settings}
            today={today}
            onOpenEntry={setOpenEntry}
            compact={isNarrow}
          />
          <UnscheduledPanel topics={unscheduled} />
        </div>

        <DragOverlay dropAnimation={null}>
          {dragging && (
            <div className="rounded-lg bg-sage-700 px-2.5 py-1.5 text-xs font-medium text-white shadow-soft">
              {dragging.kind === 'entry'
                ? dragging.entry.tracking_number
                : dragging.topic.tracking_number}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {report?.skipped?.length > 0 && (
        <Card className="mt-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-sm font-semibold text-ink">
              {report.skipped.length} topic{report.skipped.length === 1 ? '' : 's'} could not be
              fitted into this week
            </h2>
            <Button size="sm" variant="ghost" onClick={() => setReport(null)}>
              Dismiss
            </Button>
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            They are still waiting on the right. Try next week, or shorten a few blocks.
          </p>
          <ul className="mt-3 space-y-1 text-sm text-ink-soft">
            {report.skipped.slice(0, 8).map((item) => (
              <li key={item.tracking_number}>
                <span className="font-mono text-xs text-ink-faint">{item.tracking_number}</span>{' '}
                {item.title} — {item.reason}.
              </li>
            ))}
            {report.skipped.length > 8 && <li>…and {report.skipped.length - 8} more.</li>}
          </ul>
        </Card>
      )}

      {scheduleDraft && scheduleDraft.length > 0 && (
        <ScheduleReview
          rows={scheduleDraft}
          onChange={setScheduleDraft}
          onSave={saveSchedule}
          onDismiss={() => setScheduleDraft(null)}
          saving={savingSchedule}
        />
      )}

      {mealDraft && mealDraft.length > 0 && (
        <MealsReview
          rows={mealDraft}
          onChange={setMealDraft}
          onSave={saveMeals}
          onDismiss={() => setMealDraft(null)}
          saving={savingMeals}
        />
      )}

      {entries.length === 0 && unscheduled.length === 0 && (
        <div className="mt-4">
          <EmptyState
            title="There are no topics to plan yet."
            action={
              <Link to="/subjects">
                <Button variant="primary">Add a syllabus first</Button>
              </Link>
            }
          >
            Once a subject has topics in it, the planner can find them a place in your week.
          </EmptyState>
        </div>
      )}

      <EntryDialog
        entry={openEntry}
        open={Boolean(openEntry) && !logging}
        onClose={() => setOpenEntry(null)}
        onSave={saveEntry}
        onDelete={deleteEntry}
        onRequestLog={(entry) => setLogging(entry)}
        onUndoLog={undoLog}
      />

      <SessionDialog
        open={Boolean(logging)}
        planEntry={logging}
        onClose={() => setLogging(null)}
        onSave={logSession}
      />

      <RevisionSuggestion
        suggestion={suggestion}
        open={Boolean(suggestion)}
        onClose={() => setSuggestion(null)}
        onAccept={bookSuggestion}
      />

      <PlannerSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSave={async (changes) => {
          setSettings(await api.settings.savePlanner(changes));
          toast.celebrate('Saved. Plan the week again to use the new settings.');
        }}
      />

      <LLMBridge
        open={scheduleBridgeOpen}
        onClose={() => setScheduleBridgeOpen(false)}
        title={`Plan ${longDate(scheduleContext.from)} – ${longDate(scheduleContext.to)} together`}
        purpose="This app never contacts an AI service — copy the prompt across yourself, then bring the reply back. Nothing is booked until you review and save it below. Only what's still waiting for a slot is included, so re-running this later automatically picks up wherever you've got to."
        prompt={schedulePlanPrompt({
          from: scheduleContext.from,
          to: scheduleContext.to,
          anchors: scheduleContext.anchors,
          topics: unscheduled,
          existingEntries: scheduleContext.entries,
          settings,
          examDate: term?.exam_date,
          coverByDate: term?.cover_by_date,
        })}
        schema={schedulePlanSchema}
        saveLabel="Review this schedule"
        renderPreview={(data) => (
          <p className="text-sm text-sage-800">
            {data.entries.length} block{data.entries.length === 1 ? '' : 's'}
            {data.meals?.length ? ` and ${data.meals.length} meal time${data.meals.length === 1 ? '' : 's'}` : ''} came
            back. They go to a review list next — nothing is booked yet.
          </p>
        )}
        onSave={(data) => {
          setScheduleDraft(resolveScheduleDraft(data));
          setMealDraft(resolveMealDraft(data));
          setScheduleBridgeOpen(false);
        }}
      />

      <ConfirmDialog
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        onConfirm={clearWeek}
        title="Clear this week?"
        confirmLabel="Clear unfinished blocks"
      >
        Everything not yet ticked off is taken off this week. Blocks you have already done stay
        where they are.
      </ConfirmDialog>
    </div>
  );
}
