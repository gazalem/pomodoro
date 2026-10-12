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
import { useId, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import type { Task } from "@/lib/types";
import { CheckIcon, GripIcon, MinusIcon, PlusIcon, TomatoIcon, TrashIcon } from "./icons";

interface TaskPanelProps {
  tasks: Task[];
  activeTaskId: number | null;
  error: string | null;
  onAdd: (title: string, estimate: number) => Promise<Task | null>;
  onToggle: (task: Task) => void;
  onRemove: (task: Task) => void;
  onSelect: (taskId: number | null) => void;
  /** New order of the open tasks, first to last. */
  onReorder: (ids: number[]) => void;
}

export function TaskPanel({
  tasks,
  activeTaskId,
  error,
  onAdd,
  onToggle,
  onRemove,
  onSelect,
  onReorder,
}: TaskPanelProps) {
  const [title, setTitle] = useState("");
  const [estimate, setEstimate] = useState(1);
  const [saving, setSaving] = useState(false);
  const id = useId(); // the panel renders twice (sidebar + sheet), so ids must be unique

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  const plannedLeft = open.reduce((sum, t) => sum + Math.max(0, t.estimatedPomodoros - t.spentPomodoros), 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = title.trim();
    if (!value || saving) return;
    setSaving(true);
    const task = await onAdd(value, estimate);
    setSaving(false);
    if (task) {
      setTitle("");
      setEstimate(1);
      if (activeTaskId === null) onSelect(task.id);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} className="flex flex-col gap-2 rounded-2xl bg-ink/[0.04] p-3">
        <label htmlFor={`${id}-new`} className="sr-only">
          New task
        </label>
        <input
          id={`${id}-new`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What are you working on?"
          maxLength={200}
          autoComplete="off"
          className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-base text-ink placeholder:text-ink-soft/70 focus:border-tomato focus:outline-none"
        />
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 text-sm text-ink-soft">
            <span className="mr-1">Estimate</span>
            <button
              type="button"
              onClick={() => setEstimate((n) => Math.max(1, n - 1))}
              className="grid size-8 place-items-center rounded-full border border-ink/10 bg-white hover:bg-ink/5"
              aria-label="Fewer pomodoros"
            >
              <MinusIcon />
            </button>
            <span className="flex w-10 items-center justify-center gap-0.5 font-semibold text-ink tabular-nums" aria-live="polite">
              {estimate}
              <TomatoIcon className="text-tomato" />
            </span>
            <button
              type="button"
              onClick={() => setEstimate((n) => Math.min(20, n + 1))}
              className="grid size-8 place-items-center rounded-full border border-ink/10 bg-white hover:bg-ink/5"
              aria-label="More pomodoros"
            >
              <PlusIcon />
            </button>
          </div>
          <button
            type="submit"
            disabled={!title.trim() || saving}
            className="rounded-full bg-tomato px-4 py-2 text-sm font-semibold text-white hover:bg-tomato-deep disabled:opacity-40"
          >
            Add task
          </button>
        </div>
      </form>

      {error && (
        <p role="alert" className="rounded-xl bg-tomato/10 px-3 py-2 text-sm text-tomato-deep">
          {error}
        </p>
      )}

      <section aria-labelledby={`${id}-open`}>
        <div className="mb-2 flex items-baseline justify-between">
          <h3 id={`${id}-open`} className="text-sm font-semibold tracking-wide text-ink-soft uppercase">
            To do · {open.length}
          </h3>
          {plannedLeft > 0 && <span className="text-xs text-ink-soft">{plannedLeft} pomodoros left</span>}
        </div>
        {open.length === 0 ? (
          <p className="rounded-xl border border-dashed border-ink/15 px-3 py-6 text-center text-sm text-ink-soft">
            Add a task, then pick it so your focus time is tracked against it.
          </p>
        ) : (
          <SortableTaskList
            tasks={open}
            onReorder={onReorder}
            rowProps={(task) => ({
              active: task.id === activeTaskId,
              onToggle: () => {
                if (task.id === activeTaskId) onSelect(null);
                onToggle(task);
              },
              onRemove: () => {
                if (task.id === activeTaskId) onSelect(null);
                onRemove(task);
              },
              onSelect: () => onSelect(task.id === activeTaskId ? null : task.id),
            })}
          />
        )}
      </section>

      {done.length > 0 && (
        <section aria-labelledby={`${id}-done`}>
          <h3 id={`${id}-done`} className="mb-2 text-sm font-semibold tracking-wide text-ink-soft uppercase">
            Done today · {done.length}
          </h3>
          <ul className="flex flex-col gap-2">
            {done.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                active={false}
                onToggle={() => onToggle(task)}
                onRemove={() => onRemove(task)}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drag and drop

type RowProps = Omit<TaskRowProps, "task" | "drag">;

const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

/**
 * Reorderable list. Dragging starts from the grip handle only, so tapping a
 * task (to select it) and scrolling on phones keep working. Pointer, touch
 * and keyboard (Space/Enter, arrows, Space/Enter or Escape) are supported.
 */
function SortableTaskList({
  tasks,
  onReorder,
  rowProps,
}: {
  tasks: Task[];
  onReorder: (ids: number[]) => void;
  rowProps: (task: Task) => RowProps;
}) {
  const contextId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = tasks.map((t) => t.id);

  const title = (id: UniqueIdentifier) => tasks.find((t) => t.id === id)?.title ?? "Task";
  const position = (id: UniqueIdentifier) => `position ${ids.indexOf(Number(id)) + 1} of ${ids.length}`;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up "${title(active.id)}", ${position(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `"${title(active.id)}" moved to ${position(over.id)}.` : `"${title(active.id)}" is outside the list.`,
    onDragEnd: ({ active, over }) =>
      over ? `"${title(active.id)}" dropped at ${position(over.id)}.` : `"${title(active.id)}" dropped.`,
    onDragCancel: ({ active }) => `Reordering cancelled. "${title(active.id)}" is back where it was.`,
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
          {tasks.map((task) => (
            <SortableTaskRow key={task.id} task={task} enabled={tasks.length > 1} {...rowProps(task)} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableTaskRow({ task, enabled, ...props }: RowProps & { task: Task; enabled: boolean }) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !enabled,
  });

  return (
    <TaskRow
      {...props}
      task={task}
      drag={{
        setRowRef: setNodeRef,
        style: { transform: CSS.Translate.toString(transform), transition },
        dragging: isDragging,
        handle: enabled ? (
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Reorder "${task.title}"`}
            className={`-ml-1.5 grid h-9 w-6 shrink-0 touch-none place-items-center rounded-lg text-ink-soft/60 hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-tomato ${
              isDragging ? "cursor-grabbing" : "cursor-grab"
            }`}
          >
            <GripIcon />
          </button>
        ) : null,
      }}
    />
  );
}

// ---------------------------------------------------------------------------

/** Present when the row is in the reorderable list. */
interface DragProps {
  setRowRef: (node: HTMLElement | null) => void;
  style: CSSProperties;
  dragging: boolean;
  handle: ReactNode;
}

interface TaskRowProps {
  task: Task;
  active: boolean;
  drag?: DragProps;
  onToggle: () => void;
  onRemove: () => void;
  onSelect?: () => void;
}

function TaskRow({ task, active, drag, onToggle, onRemove, onSelect }: TaskRowProps) {
  const over = task.spentPomodoros > task.estimatedPomodoros;
  return (
    <li
      ref={drag?.setRowRef}
      style={drag?.style}
      className={`group relative flex items-center gap-3 rounded-2xl border bg-white px-3 py-2.5 transition-colors ${
        active ? "border-tomato shadow-[0_0_0_1px_var(--color-tomato)]" : "border-ink/10"
      } ${drag?.dragging ? "z-10 shadow-lg shadow-ink/15 ring-2 ring-tomato/40" : ""}`}
    >
      {drag?.handle}
      <button
        type="button"
        role="checkbox"
        aria-checked={task.done}
        aria-label={task.done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
        onClick={onToggle}
        className={`grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors ${
          task.done ? "border-tomato bg-tomato text-white" : "border-ink/25 text-transparent hover:border-tomato"
        }`}
      >
        <CheckIcon className="text-sm" />
      </button>

      <button
        type="button"
        onClick={onSelect}
        disabled={!onSelect}
        aria-pressed={onSelect ? active : undefined}
        className="min-w-0 flex-1 text-left disabled:cursor-default"
      >
        <span className={`block truncate text-[0.95rem] ${task.done ? "text-ink-soft line-through" : "text-ink"}`}>
          {task.title}
        </span>
        <span className={`text-xs tabular-nums ${over ? "text-tomato-deep" : "text-ink-soft"}`}>
          {task.spentPomodoros}/{task.estimatedPomodoros} pomodoros
          {active && <span className="ml-2 font-semibold text-tomato">● Focusing</span>}
        </span>
      </button>

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Delete "${task.title}"`}
        className="grid size-8 shrink-0 place-items-center rounded-full text-ink-soft opacity-60 hover:bg-ink/5 hover:text-tomato-deep hover:opacity-100 focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
      >
        <TrashIcon />
      </button>
    </li>
  );
}
