"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type Modifier,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useId, type CSSProperties, type ReactNode } from "react";
import { GripIcon } from "./icons";

/** Handed to each rendered row so it can become draggable. */
export interface DragProps {
  setRowRef: (node: HTMLElement | null) => void;
  style: CSSProperties;
  dragging: boolean;
  /** The grip button, or null when the row can't be dragged. */
  handle: ReactNode;
}

interface SortableListProps<T extends { id: number }> {
  items: T[];
  /** Name used in screen-reader announcements and the handle's label. */
  itemLabel: (item: T) => string;
  onReorder: (ids: number[]) => void;
  /** Rows that should stay put (e.g. while being edited). */
  isLocked?: (item: T) => boolean;
  /** Must render the row's <li>, applying `drag` to it. */
  renderItem: (item: T, drag: DragProps) => ReactNode;
}

const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

/**
 * Reorderable list. Dragging starts from the grip handle only, so tapping a
 * row and scrolling on phones keep working. Pointer, touch and keyboard
 * (Space/Enter, arrows, Space/Enter or Escape) are supported.
 */
export function SortableList<T extends { id: number }>({ items, itemLabel, onReorder, isLocked, renderItem }: SortableListProps<T>) {
  const contextId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = items.map((t) => t.id);

  const label = (id: UniqueIdentifier) => {
    const item = items.find((t) => t.id === id);
    return item ? itemLabel(item) : "Item";
  };
  const position = (id: UniqueIdentifier) => `position ${ids.indexOf(Number(id)) + 1} of ${ids.length}`;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up "${label(active.id)}", ${position(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `"${label(active.id)}" moved to ${position(over.id)}.` : `"${label(active.id)}" is outside the list.`,
    onDragEnd: ({ active, over }) =>
      over ? `"${label(active.id)}" dropped at ${position(over.id)}.` : `"${label(active.id)}" dropped.`,
    onDragCancel: ({ active }) => `Reordering cancelled. "${label(active.id)}" is back where it was.`,
  };

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    onReorder(arrayMove(ids, ids.indexOf(Number(active.id)), ids.indexOf(Number(over.id))));
  }

  return (
    <DndContext
      id={contextId}
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[verticalOnly]}
      onDragEnd={handleDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "To reorder, press Space or Enter, move with the up and down arrow keys, then press Space or Enter to drop, or Escape to cancel.",
        },
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <SortableItem
              key={item.id}
              item={item}
              label={itemLabel(item)}
              enabled={items.length > 1 && !isLocked?.(item)}
              renderItem={renderItem}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableItem<T extends { id: number }>({
  item,
  label,
  enabled,
  renderItem,
}: {
  item: T;
  label: string;
  enabled: boolean;
  renderItem: (item: T, drag: DragProps) => ReactNode;
}) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !enabled,
  });

  return renderItem(item, {
    setRowRef: setNodeRef,
    style: { transform: CSS.Translate.toString(transform), transition },
    dragging: isDragging,
    handle: enabled ? (
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Reorder "${label}"`}
        className={`-ml-1.5 grid h-9 w-6 shrink-0 touch-none place-items-center rounded-lg text-ink-soft/60 hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-tomato ${
          isDragging ? "cursor-grabbing" : "cursor-grab"
        }`}
      >
        <GripIcon />
      </button>
    ) : null,
  });
}
