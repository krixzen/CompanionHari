import { useDraggable } from '@dnd-kit/core';
import { SubjectDot } from './bits.jsx';
import { formatMinutes } from '../lib/format.js';

function ItemChip({ item }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `item-${item.id}`,
    data: { kind: 'item', item },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        borderColor: item.subject_colour,
      }}
      className={`cursor-grab touch-none rounded-lg border-l-[3px] bg-paper-raised px-2.5 py-2 shadow-sm transition active:cursor-grabbing ${
        isDragging ? 'ring-2 ring-sage-300' : 'hover:shadow-soft'
      }`}
      aria-label={`${item.tracking_number} stage ${item.stage}, drag onto the calendar`}
    >
      <div className="flex items-center gap-1.5">
        <SubjectDot colour={item.subject_colour} />
        <span className="font-mono text-[10px] text-ink-faint">
          {item.tracking_number}/S{item.stage}
        </span>
        <span className="ml-auto text-[10px] text-ink-faint">{formatMinutes(item.estimated_minutes)}</span>
      </div>
      <p className="mt-0.5 truncate text-xs text-ink">{item.topic_title}</p>
      <p className="truncate text-[10px] text-ink-faint">{item.label}</p>
    </div>
  );
}

/** Master-list items with no place on the calendar yet, ready to be dragged onto it. */
export function UnscheduledPanel({ items }) {
  return (
    <aside className="rounded-xl2 bg-paper-sunk/60 p-3">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">
        Waiting for a slot
      </h2>

      {items.length === 0 ? (
        <p className="px-1 py-6 text-center text-xs text-ink-faint">
          Everything has a place. Nothing waiting.
        </p>
      ) : (
        <>
          <p className="px-1 pb-2 pt-1 text-[11px] text-ink-faint">
            Drag one onto a day, or use Plan my week.
          </p>
          <div className="max-h-[62vh] space-y-1.5 overflow-y-auto pr-0.5">
            {items.map((item) => (
              <ItemChip key={item.id} item={item} />
            ))}
          </div>
        </>
      )}
    </aside>
  );
}
