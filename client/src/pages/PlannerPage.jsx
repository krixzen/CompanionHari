import { useMemo, useState } from 'react';
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
import { PlannerSettingsDialog } from '../components/PlannerSettingsDialog.jsx';
import { UnscheduledPanel } from '../components/UnscheduledPanel.jsx';
import { PX_PER_MINUTE, WeekGrid, gridWindow } from '../components/WeekGrid.jsx';
import { Button, Card, EmptyState, ErrorNote, Spinner } from '../components/ui.jsx';
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
  startOfWeek,
  toMinutes,
  toTime,
  todayIso,
  weekDates,
} from '../lib/week.js';

export default function PlannerPage() {
  const today = todayIso();
  const [monday, setMonday] = useState(() => startOfWeek(today));
  const [selectedDay, setSelectedDay] = useState(today);

  const isNarrow = useMediaQuery('(max-width: 767px)');
  const { refreshSubjects } = useStudyData();
  const toast = useToast();

  const {
    entries,
    anchors,
    settings,
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
  const [planning, setPlanning] = useState(false);
  const [report, setReport] = useState(null);

  const dates = useMemo(() => weekDates(monday), [monday]);
  const visibleDates = isNarrow ? [selectedDay] : dates;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // A short hold before a drag starts, so the calendar still scrolls on a phone.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } })
  );

  const totals = useMemo(() => {
    const study = entries.filter((entry) => entry.entry_type === 'study');
    const revision = entries.filter((entry) => entry.entry_type === 'revision');
    return {
      study: study.length,
      revision: revision.length,
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

  const saveEntry = async (entry, changes) => {
    await api.plan.update(entry.id, changes);
    await refresh();
    await refreshSubjects();
    const updated = await api.plan.list(monday, addDays(monday, 6));
    setOpenEntry(updated.find((candidate) => candidate.id === entry.id) ?? null);
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
          totals.study + totals.revision === 0
            ? 'Nothing booked in yet. Plan the week and you can move anything afterwards.'
            : `${totals.study} study block${totals.study === 1 ? '' : 's'} and ${
                totals.revision
              } revision block${totals.revision === 1 ? '' : 's'} · ${formatMinutes(
                totals.minutes
              )} in total${totals.done ? ` · ${totals.done} done already` : ''}`
        }
        actions={
          <>
            <Button onClick={() => setSettingsOpen(true)}>Planner settings</Button>
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

      {isNarrow && (
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
        open={Boolean(openEntry)}
        onClose={() => setOpenEntry(null)}
        onSave={saveEntry}
        onDelete={deleteEntry}
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
