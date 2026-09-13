import { useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/**
 * Vertical drag-and-drop reordering.
 *
 * A pointer sensor with a small activation distance means a tap still counts
 * as a tap on a touchscreen, and the keyboard sensor keeps reordering possible
 * without a mouse.
 */
export function SortableList({ ids, onReorder, children, disabled = false }) {
  // Pinning a drag to the vertical axis looks right with a pointer, but it
  // confuses the keyboard sensor's idea of where the next row is — so the
  // modifier is applied only when the drag was started by a pointer.
  const [pointerDrag, setPointerDrag] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = ({ activatorEvent }) => {
    setPointerDrag(!(activatorEvent instanceof KeyboardEvent));
  };

  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(active.id);
    const to = ids.indexOf(over.id);
    if (from === -1 || to === -1) return;
    onReorder(arrayMove(ids, from, to));
  };

  if (disabled) return children;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      modifiers={pointerDrag ? [restrictToVerticalAxis] : []}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

/** Renders one draggable row and hands the drag handle's props to its child. */
export function SortableRow({ id, disabled = false, children, className = '' }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${className} ${isDragging ? 'relative shadow-soft' : ''}`}
    >
      {children({ handleProps: { ...attributes, ...listeners }, isDragging, disabled })}
    </div>
  );
}

/** The little grip that starts a drag. */
export function DragHandle({ handleProps, disabled, label = 'Drag to reorder' }) {
  return (
    <button
      type="button"
      {...(disabled ? {} : handleProps)}
      disabled={disabled}
      aria-label={label}
      title={disabled ? 'Clear the search and filters to reorder' : label}
      className={`shrink-0 rounded-lg p-1.5 text-ink-faint transition ${
        disabled ? 'cursor-not-allowed opacity-30' : 'cursor-grab hover:bg-paper-sunk hover:text-ink active:cursor-grabbing'
      }`}
    >
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
        <circle cx="7" cy="5" r="1.4" />
        <circle cx="13" cy="5" r="1.4" />
        <circle cx="7" cy="10" r="1.4" />
        <circle cx="13" cy="10" r="1.4" />
        <circle cx="7" cy="15" r="1.4" />
        <circle cx="13" cy="15" r="1.4" />
      </svg>
    </button>
  );
}
