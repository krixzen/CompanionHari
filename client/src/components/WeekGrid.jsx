import { useDraggable, useDroppable } from '@dnd-kit/core';
import { anchorStyle } from '../lib/anchors.js';
import { DAY_NAMES, dayNumber, dayOfWeek, friendlyTime, toMinutes } from '../lib/week.js';

export const PX_PER_MINUTE = 0.85;

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
        <span className="text-[10px] font-medium leading-tight" style={{ color: tint }}>
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
      aria-label={`${entry.tracking_number} ${entry.topic_title}, ${friendlyTime(
        entry.scheduled_start_time
      )} to ${friendlyTime(entry.scheduled_end_time)}${entry.completed ? ', done' : ''}`}
      className={`absolute inset-x-0.5 cursor-grab touch-none overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5 text-left shadow-sm transition active:cursor-grabbing ${
        isRevision ? 'border-dashed bg-paper-raised/90' : ''
      } ${entry.completed ? 'opacity-55' : ''} ${isDragging ? 'shadow-soft ring-2 ring-sage-300' : ''}`}
    >
      <p
        className={`truncate text-[10px] font-semibold leading-tight ${
          entry.completed ? 'line-through' : ''
        }`}
        style={{ color: entry.subject_colour }}
      >
        {isRevision && (
          <span aria-hidden="true" title="Revision">
            ↻{' '}
          </span>
        )}
        {entry.tracking_number}
      </p>
      {height > 30 && (
        <p className="truncate text-[11px] leading-tight text-ink">{entry.topic_title}</p>
      )}
      {height > 46 && !compact && (
        <p className="truncate text-[10px] leading-tight text-ink-faint">
          {friendlyTime(entry.scheduled_start_time)}–{friendlyTime(entry.scheduled_end_time)}
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

  const columns = `3rem repeat(${dates.length}, minmax(0, 1fr))`;

  return (
    <div className="overflow-hidden rounded-xl2 bg-paper-raised shadow-soft">
      <div className="grid border-b border-black/5" style={{ gridTemplateColumns: columns }}>
        <div />
        {dates.map((date) => (
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
              className={`text-sm font-semibold ${date === today ? 'text-sage-700' : 'text-ink'}`}
            >
              {dayNumber(date)}
            </p>
          </div>
        ))}
      </div>

      <div className="max-h-[70vh] overflow-y-auto">
        <div className="grid" style={{ gridTemplateColumns: columns, height }}>
          <div className="relative">
            {hours.map((minute, index) => (
              <span
                key={minute}
                className={`absolute right-1.5 text-[10px] text-ink-faint ${
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
            </DayColumn>
          ))}
        </div>
      </div>
    </div>
  );
}
