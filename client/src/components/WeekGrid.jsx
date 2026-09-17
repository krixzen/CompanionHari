import { useDraggable, useDroppable } from '@dnd-kit/core';
import { anchorStyle } from '../lib/anchors.js';
import { formatMinutes } from '../lib/format.js';
import { DAY_NAMES, dayNumber, dayOfWeek, friendlyTime, toMinutes } from '../lib/week.js';

/**
 * Whether a day has more study/practice/revision booked than it has free
 * time for, given the day's fixed commitments (plus their travel buffer)
 * inside the usual day window. A soft warning, never a block — the student
 * can still choose to pack a day tight.
 */
function overloadedDay(date, dayAnchors, dayEntries, settings) {
  const dayStart = toMinutes(settings.day_start);
  const dayEnd = toMinutes(settings.day_end);

  const busyMinutes = dayAnchors.reduce((sum, anchor) => {
    const start = toMinutes(anchor.start_time);
    const end = toMinutes(anchor.end_time) + (anchor.buffer_after_minutes || 0);
    return sum + Math.max(0, Math.min(end, dayEnd) - Math.max(start, dayStart));
  }, 0);
  const freeMinutes = Math.max(dayEnd - dayStart - busyMinutes, 0);

  const scheduledMinutes = dayEntries.reduce((sum, entry) => sum + entry.scheduled_duration_minutes, 0);

  return scheduledMinutes > freeMinutes ? { scheduledMinutes, freeMinutes } : null;
}

// Sized to read like a real calendar app (Outlook, Google Calendar) rather
// than a cramped widget — tall enough that an hour's worth of blocks is
// comfortable to tap and read without squinting.
export const PX_PER_MINUTE = 1.5;

/** Rounds the visible window out to whole hours so the hour labels line up. */
export function gridWindow(settings, entries) {
  let start = toMinutes(settings.day_start);
  let end = toMinutes(settings.day_end);

  // A block moved outside the usual day must still be visible.
  for (const entry of entries) {
    const entryStart = toMinutes(entry.scheduled_start_time);
    if (entryStart === null) continue;
    start = Math.min(start, entryStart);
    end = Math.max(end, entryStart + entry.scheduled_duration_minutes);
  }

  return {
    start: Math.floor(start / 60) * 60,
    end: Math.min(24 * 60, Math.ceil(end / 60) * 60),
  };
}

function DayColumn({ date, children, isToday }) {
  const { setNodeRef, isOver } = useDroppable({ id: date });

  return (
    <div
      ref={setNodeRef}
      className={`relative border-l border-black/5 transition-colors ${
        isOver ? 'bg-sage-50' : isToday ? 'bg-sage-50/40' : ''
      }`}
    >
      {children}
    </div>
  );
}

/** The red "right now" line real calendar apps draw across today's column. */
function NowLine({ window }) {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes < window.start || minutes > window.end) return null;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
      style={{ top: (minutes - window.start) * PX_PER_MINUTE }}
    >
      <span className="-ml-[3px] h-2 w-2 shrink-0 rounded-full bg-red-500" />
      <span className="h-px flex-1 bg-red-500/70" />
    </div>
  );
}

function AnchorBlock({ anchor, window }) {
  const start = toMinutes(anchor.start_time);
  const end = toMinutes(anchor.end_time);
  const top = (Math.max(start, window.start) - window.start) * PX_PER_MINUTE;
  const height = (Math.min(end, window.end) - Math.max(start, window.start)) * PX_PER_MINUTE;

  if (height <= 0) return null;
  const { tint } = anchorStyle(anchor.type);

  return (
    <div
      className="pointer-events-none absolute inset-x-0.5 overflow-hidden rounded-md px-1.5 py-0.5"
      style={{ top, height, backgroundColor: `${tint}1f` }}
      title={`${anchor.label} · ${friendlyTime(anchor.start_time)}–${friendlyTime(anchor.end_time)}`}
    >
      {height > 22 && (
        <span className="text-[11px] font-medium leading-tight" style={{ color: tint }}>
          {anchor.label}
        </span>
      )}
    </div>
  );
}

function EntryBlock({ entry, window, onOpen, compact }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `entry-${entry.id}`,
    data: { kind: 'entry', entry },
  });

  const start = toMinutes(entry.scheduled_start_time);
  const top = (start - window.start) * PX_PER_MINUTE;
  const height = Math.max(entry.scheduled_duration_minutes * PX_PER_MINUTE, 18);
  const isRevision = entry.entry_type === 'revision';
  const isPractice = entry.entry_type === 'practice';

  const style = {
    top,
    height,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    borderColor: entry.subject_colour,
    backgroundColor: isRevision ? 'transparent' : `${entry.subject_colour}1c`,
    zIndex: isDragging ? 30 : 10,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => !isDragging && onOpen(entry)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onOpen(entry);
      }}
      aria-label={`${entry.tracking_label ?? entry.tracking_number} ${
        entry.sub_topic_title ?? entry.topic_title
      }, ${friendlyTime(entry.scheduled_start_time)} to ${friendlyTime(entry.scheduled_end_time)}${
        entry.completed ? ', done' : ''
      }`}
      className={`absolute inset-x-0.5 cursor-grab touch-none overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5 text-left shadow-sm transition active:cursor-grabbing ${
        isRevision ? 'border-dashed bg-paper-raised/90' : ''
      } ${isPractice ? 'border-dotted' : ''} ${entry.completed ? 'opacity-55' : ''} ${
        isDragging ? 'shadow-soft ring-2 ring-sage-300' : ''
      }`}
    >
      <p
        className={`truncate text-xs font-semibold leading-tight ${
          entry.completed ? 'line-through' : ''
        }`}
        style={{ color: entry.subject_colour }}
      >
        {isRevision && (
          <span aria-hidden="true" title="Revision">
            ↻{' '}
          </span>
        )}
        {isPractice && (
          <span aria-hidden="true" title="Practice">
            ✎{' '}
          </span>
        )}
        {entry.subject_name}
      </p>
      {height > 30 && (
        <p className="truncate text-[11px] leading-tight text-ink-faint">
          {friendlyTime(entry.scheduled_start_time)}
          {!compact && height > 40 ? `–${friendlyTime(entry.scheduled_end_time)}` : ''}
        </p>
      )}
    </div>
  );
}

/**
 * The week itself: hours down the side, one column per day, commitments as
 * washes behind study and revision blocks.
 */
export function WeekGrid({ dates, entries, anchors, settings, today, onOpenEntry, compact = false }) {
  const window = gridWindow(settings, entries);
  const totalMinutes = window.end - window.start;
  const height = totalMinutes * PX_PER_MINUTE;

  const hours = [];
  for (let minute = window.start; minute <= window.end; minute += 60) hours.push(minute);

  const anchorsByDay = new Map();
  for (const anchor of anchors) {
    if (!anchor.is_active) continue;
    if (!anchorsByDay.has(anchor.day_of_week)) anchorsByDay.set(anchor.day_of_week, []);
    anchorsByDay.get(anchor.day_of_week).push(anchor);
  }

  const entriesByDate = new Map(dates.map((date) => [date, []]));
  for (const entry of entries) {
    if (entriesByDate.has(entry.scheduled_date)) entriesByDate.get(entry.scheduled_date).push(entry);
  }

  const columns = `3.5rem repeat(${dates.length}, minmax(0, 1fr))`;

  return (
    <div className="overflow-hidden rounded-xl2 bg-paper-raised shadow-soft">
      <div className="grid border-b border-black/5" style={{ gridTemplateColumns: columns }}>
        <div />
        {dates.map((date) => {
          const overload = overloadedDay(
            date,
            anchorsByDay.get(dayOfWeek(date)) ?? [],
            entriesByDate.get(date) ?? [],
            settings
          );

          return (
            <div
              key={date}
              className={`border-l border-black/5 px-2 py-2 text-center ${
                date === today ? 'bg-sage-50' : ''
              }`}
            >
              <p className="text-[11px] uppercase tracking-wide text-ink-faint">
                {DAY_NAMES[dayOfWeek(date)]}
              </p>
              <p
                className={`flex items-center justify-center gap-1 text-sm font-semibold ${
                  date === today ? 'text-sage-700' : 'text-ink'
                }`}
              >
                {dayNumber(date)}
                {overload && (
                  <span
                    aria-label={`More is booked (${formatMinutes(overload.scheduledMinutes)}) than there is free time for (${formatMinutes(overload.freeMinutes)})`}
                    title={`${formatMinutes(overload.scheduledMinutes)} booked, but only ${formatMinutes(overload.freeMinutes)} free today`}
                    className="text-amber-600"
                  >
                    ⚠
                  </span>
                )}
              </p>
            </div>
          );
        })}
      </div>

      <div className="max-h-[calc(100vh-13rem)] overflow-y-auto">
        <div className="grid" style={{ gridTemplateColumns: columns, height }}>
          <div className="relative">
            {hours.map((minute, index) => (
              <span
                key={minute}
                className={`absolute right-1.5 text-[11px] text-ink-faint ${
                  index === 0 ? '' : '-translate-y-1/2'
                }`}
                style={{ top: (minute - window.start) * PX_PER_MINUTE }}
              >
                {friendlyTime(
                  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
                )}
              </span>
            ))}
          </div>

          {dates.map((date) => (
            <DayColumn key={date} date={date} isToday={date === today}>
              {hours.slice(1).map((minute) => (
                <div
                  key={minute}
                  className="pointer-events-none absolute inset-x-0 border-t border-black/[0.04]"
                  style={{ top: (minute - window.start) * PX_PER_MINUTE }}
                />
              ))}

              {(anchorsByDay.get(dayOfWeek(date)) ?? []).map((anchor) => (
                <AnchorBlock key={anchor.id} anchor={anchor} window={window} />
              ))}

              {entriesByDate.get(date).map((entry) => (
                <EntryBlock
                  key={entry.id}
                  entry={entry}
                  window={window}
                  onOpen={onOpenEntry}
                  compact={compact}
                />
              ))}

              {date === today && <NowLine window={window} />}
            </DayColumn>
          ))}
        </div>
      </div>
    </div>
  );
}
