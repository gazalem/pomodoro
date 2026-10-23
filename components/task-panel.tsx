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
import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import type { CategoryColor } from "@/lib/categories";
import { useStoredString } from "@/lib/storage";
import type { Category, Task } from "@/lib/types";
import { CategoryDot, CategoryFilter, CategoryManager, CategorySelect, type CategoryFilterValue } from "./categories";
import { CheckIcon, GripIcon, MinusIcon, PencilIcon, PlusIcon, TomatoIcon, TrashIcon } from "./icons";

const FILTER_KEY = "pomodoro.taskFilter.v1";

type TaskChanges = { title: string; estimatedPomodoros: number; categoryId: number | null };

/**
 * Puts the reordered visible tasks back into the full open-task order: each
 * visible task's slot is filled, in turn, by the visible tasks' new order,
 * so tasks hidden by the filter keep their positions.
 */
function mergeOrder(allIds: number[], visibleNewOrder: number[]): number[] {
  const visible = new Set(visibleNewOrder);
  let next = 0;
  return allIds.map((id) => (visible.has(id) ? visibleNewOrder[next++] : id));
}

interface TaskPanelProps {
  tasks: Task[];
  activeTaskId: number | null;
  error: string | null;
  onAdd: (title: string, estimate: number, categoryId: number | null) => Promise<Task | null>;
  onToggle: (task: Task) => void;
  onRemove: (task: Task) => void;
  onSelect: (taskId: number | null) => void;
  /** New order of the open tasks, first to last. */
  onReorder: (ids: number[]) => void;
  onEdit: (task: Task, changes: TaskChanges) => void;
  categories: Category[];
  onAddCategory: (name: string) => Promise<string | null>;
  onUpdateCategory: (id: number, patch: { name?: string; color?: CategoryColor }) => Promise<string | null>;
  onDeleteCategory: (id: number) => Promise<string | null>;
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
  onEdit,
  categories,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
}: TaskPanelProps) {
  const [title, setTitle] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [managing, setManaging] = useState(false);
  // undefined = follow the active filter (adding while viewing "Work" files the task under Work).
  const [newCategory, setNewCategory] = useState<number | null | undefined>(undefined);

  // The filter is remembered per device and shared by both copies of the panel.
  const [storedFilter, setStoredFilter] = useStoredString(FILTER_KEY);
  const categoryIds = new Set(categories.map((c) => c.id));
  const categoryOf = (t: Task) => (t.categoryId !== null && categoryIds.has(t.categoryId) ? t.categoryId : null);
  const filter: CategoryFilterValue =
    storedFilter === "none" ? "none" : categoryIds.has(Number(storedFilter)) ? Number(storedFilter) : "all";
  const matches = (t: Task) => filter === "all" || (filter === "none" ? categoryOf(t) === null : categoryOf(t) === filter);
  const filterName = typeof filter === "number" ? categories.find((c) => c.id === filter)?.name : null;
  const addCategoryId =
    newCategory !== undefined && (newCategory === null || categoryIds.has(newCategory))
      ? newCategory
      : typeof filter === "number"
        ? filter
        : null;
  const [estimate, setEstimate] = useState(1);
  const [saving, setSaving] = useState(false);
  const id = useId(); // the panel renders twice (sidebar + sheet), so ids must be unique

  const allOpen = tasks.filter((t) => !t.done);
  const open = allOpen.filter(matches);
  const done = tasks.filter((t) => t.done && matches(t));
  const counts = {
    total: allOpen.length,
    none: allOpen.filter((t) => categoryOf(t) === null).length,
    byId: allOpen.reduce((m, t) => {
      const c = categoryOf(t);
      return c === null ? m : m.set(c, (m.get(c) ?? 0) + 1);
    }, new Map<number, number>()),
  };
  const plannedLeft = open.reduce((sum, t) => sum + Math.max(0, t.estimatedPomodoros - t.spentPomodoros), 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = title.trim();
    if (!value || saving) return;
    setSaving(true);
    const task = await onAdd(value, estimate, addCategoryId);
    setSaving(false);
    if (task) {
      setTitle("");
      setEstimate(1);
      setNewCategory(undefined);
      if (activeTaskId === null) onSelect(task.id);
    }
  }

  // Only one task is edited at a time; opening another closes the first.
  const editProps = (task: Task): EditProps => ({
    editing: editingId === task.id,
    onStartEdit: () => setEditingId(task.id),
    onCancelEdit: () => setEditingId(null),
    onSaveEdit: (changes) => {
      setEditingId(null);
      if (
        changes.title !== task.title ||
        changes.estimatedPomodoros !== task.estimatedPomodoros ||
        changes.categoryId !== categoryOf(task)
      ) {
        onEdit(task, changes);
      }
    },
    categories,
  });

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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <EstimateStepper value={estimate} onChange={setEstimate} label="Estimate" />
            <CategorySelect categories={categories} value={addCategoryId} onChange={setNewCategory} />
          </div>
          <button
            type="submit"
            disabled={!title.trim() || saving}
            className="ml-auto rounded-full bg-tomato px-4 py-2 text-sm font-semibold whitespace-nowrap text-white hover:bg-tomato-deep disabled:opacity-40"
          >
            Add task
          </button>
        </div>
      </form>

      <CategoryFilter
        categories={categories}
        value={filter}
        counts={counts}
        onChange={(value) => setStoredFilter(String(value))}
        managing={managing}
        onToggleManage={() => setManaging((m) => !m)}
      />
      {managing && (
        <CategoryManager
          categories={categories}
          onAdd={onAddCategory}
          onUpdate={onUpdateCategory}
          onDelete={async (categoryId) => {
            if (filter === categoryId) setStoredFilter("all");
            return onDeleteCategory(categoryId);
          }}
        />
      )}

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
            {filter === "all"
              ? "Add a task, then pick it so your focus time is tracked against it."
              : `No open tasks in ${filterName ?? "Uncategorized"}.`}
          </p>
        ) : (
          <SortableTaskList
            tasks={open}
            onReorder={(visibleOrder) => onReorder(mergeOrder(allOpen.map((t) => t.id), visibleOrder))}
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
              ...editProps(task),
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
                {...editProps(task)}
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
            <SortableTaskRow key={task.id} task={task} sortable={tasks.length > 1} {...rowProps(task)} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableTaskRow({ task, sortable, ...props }: RowProps & { task: Task; sortable: boolean }) {
  // A row being edited stays put so its inputs can be used normally.
  const enabled = sortable && !props.editing;
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

interface EditProps {
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (changes: TaskChanges) => void;
  categories: Category[];
}

interface TaskRowProps extends EditProps {
  task: Task;
  active: boolean;
  drag?: DragProps;
  onToggle: () => void;
  onRemove: () => void;
  onSelect?: () => void;
}

const ROW_ACTION =
  "grid size-8 shrink-0 place-items-center rounded-full text-ink-soft opacity-60 hover:bg-ink/5 hover:opacity-100 focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100";

function TaskRow({
  task,
  active,
  drag,
  editing,
  onToggle,
  onRemove,
  onSelect,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  categories,
}: TaskRowProps) {
  const over = task.spentPomodoros > task.estimatedPomodoros;
  const category = categories.find((c) => c.id === task.categoryId) ?? null;

  // Return keyboard focus to the pencil button when the editor closes.
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(editing);
  useEffect(() => {
    if (wasEditing.current && !editing) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  if (editing) {
    return (
      <li
        ref={drag?.setRowRef}
        style={drag?.style}
        className="rounded-2xl border border-tomato bg-white p-3 shadow-[0_0_0_1px_var(--color-tomato)]"
      >
        <TaskEditor task={task} category={category} categories={categories} onSave={onSaveEdit} onCancel={onCancelEdit} />
      </li>
    );
  }

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
        <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-ink-soft">
          {category && (
            <>
              <CategoryDot color={category.color} className="size-2" />
              <span>{category.name}</span>
              <span aria-hidden="true">·</span>
            </>
          )}
          <span className={`tabular-nums ${over ? "text-tomato-deep" : ""}`}>
            {task.spentPomodoros}/{task.estimatedPomodoros} pomodoros
          </span>
          {active && <span className="ml-2 font-semibold text-tomato">● Focusing</span>}
        </span>
      </button>

      <div className="-mr-1 flex shrink-0 items-center">
        <button
          type="button"
          ref={editButton}
          onClick={onStartEdit}
          aria-label={`Edit "${task.title}"`}
          className={`${ROW_ACTION} hover:text-ink`}
        >
          <PencilIcon />
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Delete "${task.title}"`}
          className={`${ROW_ACTION} hover:text-tomato-deep`}
        >
          <TrashIcon />
        </button>
      </div>
    </li>
  );
}

/** Inline editor for a task's title and estimate. Enter saves, Escape cancels. */
function TaskEditor({
  task,
  category,
  categories,
  onSave,
  onCancel,
}: {
  task: Task;
  category: Category | null;
  categories: Category[];
  onSave: (changes: TaskChanges) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [estimate, setEstimate] = useState(task.estimatedPomodoros);
  const [categoryId, setCategoryId] = useState<number | null>(category?.id ?? null);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const trimmed = title.trim();

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (trimmed) onSave({ title: trimmed, estimatedPomodoros: estimate, categoryId });
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    // Cancel the edit only; don't let Escape also close the tasks sheet.
    e.preventDefault();
    e.stopPropagation();
    onCancel();
  }

  return (
    <form onSubmit={submit} onKeyDown={onKeyDown} className="flex flex-col gap-2" aria-label={`Edit "${task.title}"`}>
      <label htmlFor={`${id}-title`} className="sr-only">
        Task title
      </label>
      <input
        id={`${id}-title`}
        ref={input}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        autoComplete="off"
        aria-invalid={!trimmed}
        className="w-full rounded-xl border border-ink/15 bg-paper px-3 py-2 text-base text-ink focus:border-tomato focus:outline-none"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <EstimateStepper value={estimate} onChange={setEstimate} label="Estimate" />
        <CategorySelect categories={categories} value={categoryId} onChange={setCategoryId} />
        <div className="ml-auto flex gap-1.5">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full px-3.5 py-1.5 text-sm font-medium text-ink-soft hover:bg-ink/5"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!trimmed}
            className="rounded-full bg-tomato px-4 py-1.5 text-sm font-semibold text-white hover:bg-tomato-deep disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </form>
  );
}

const MAX_ESTIMATE = 20;

/** "− 3🍅 +" control for a pomodoro estimate. */
function EstimateStepper({
  value,
  onChange,
  label,
  min = 1,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  min?: number;
}) {
  const step = "grid size-8 place-items-center rounded-full border border-ink/10 bg-white hover:bg-ink/5 disabled:opacity-40";
  return (
    <div className="flex items-center gap-1 text-sm text-ink-soft" role="group" aria-label={`${label}: ${value} pomodoros`}>
      <span className="mr-1">{label}</span>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} className={step} aria-label="Fewer pomodoros">
        <MinusIcon />
      </button>
      <span className="flex w-10 items-center justify-center gap-0.5 font-semibold text-ink tabular-nums" aria-live="polite">
        {value}
        <TomatoIcon className="text-tomato" />
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(MAX_ESTIMATE, value + 1))}
        disabled={value >= MAX_ESTIMATE}
        className={step}
        aria-label="More pomodoros"
      >
        <PlusIcon />
      </button>
    </div>
  );
}
