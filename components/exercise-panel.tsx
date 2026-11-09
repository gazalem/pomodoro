"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { EXERCISE_LIMITS } from "@/lib/repo";
import type { Exercise, ExerciseMode } from "@/lib/types";
import type { ExerciseInput } from "@/lib/use-exercises";
import { CheckIcon, MinusIcon, PencilIcon, PlusIcon, TrashIcon } from "./icons";
import { SortableList, type DragProps } from "./sortable-list";

/** 45 → "45s", 90 → "1:30", 120 → "2 min". */
export function formatSeconds(total: number): string {
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return s === 0 ? `${m} min` : `${m}:${String(s).padStart(2, "0")}`;
}

/** "3 sets × 15 reps" or "3 sets × 45s". */
export function describeExercise(e: Pick<Exercise, "sets" | "mode" | "reps" | "durationSeconds">, defaultSeconds: number) {
  const each = e.mode === "reps" ? `${e.reps ?? 0} reps` : formatSeconds(e.durationSeconds ?? defaultSeconds);
  return `${e.sets} set${e.sets === 1 ? "" : "s"} × ${each}`;
}

// ---------------------------------------------------------------------------

interface ExercisePanelProps {
  exercises: Exercise[];
  error: string | null;
  /** Settings default for timed sets, in seconds. */
  defaultSeconds: number;
  /** Exercise the workout is on (or about to start, during a rest). */
  currentId: number | null;
  /** Where the next workout starts. */
  selectedId: number | null;
  workoutActive: boolean;
  onSelect: (id: number | null) => void;
  onAdd: (input: ExerciseInput) => Promise<Exercise | null>;
  onUpdate: (id: number, patch: Partial<ExerciseInput & { done: boolean }>) => void;
  onRemove: (id: number) => void;
  onReorder: (openIds: number[]) => void;
  onReset: () => void;
}

export function ExercisePanel(props: ExercisePanelProps) {
  const { exercises, error, defaultSeconds, currentId, selectedId, workoutActive, onSelect, onAdd, onUpdate, onRemove, onReorder, onReset } = props;
  const [editingId, setEditingId] = useState<number | null>(null);
  const id = useId();
  const open = exercises.filter((e) => !e.done);
  const done = exercises.filter((e) => e.done);
  const startId = selectedId !== null && open.some((e) => e.id === selectedId) ? selectedId : (open[0]?.id ?? null);

  const rowProps = (e: Exercise) => ({
    exercise: e,
    defaultSeconds,
    current: e.id === currentId,
    startsHere: !workoutActive && !e.done && e.id === startId && open.length > 1,
    editing: editingId === e.id,
    onToggle: () => onUpdate(e.id, { done: !e.done }),
    onRemove: () => onRemove(e.id),
    onSelect: !e.done && !workoutActive ? () => onSelect(e.id) : undefined,
    onStartEdit: () => setEditingId(e.id),
    onCancelEdit: () => setEditingId(null),
    onSaveEdit: (patch: ExerciseInput) => {
      setEditingId(null);
      onUpdate(e.id, patch);
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <AddExerciseForm defaultSeconds={defaultSeconds} onAdd={onAdd} />

      {error && (
        <p role="alert" className="rounded-xl bg-tomato/10 px-3 py-2 text-sm text-tomato-deep">
          {error}
        </p>
      )}

      <section aria-labelledby={`${id}-open`}>
        <div className="mb-2 flex items-baseline justify-between">
          <h3 id={`${id}-open`} className="text-sm font-semibold tracking-wide text-ink-soft uppercase">
            Workout · {open.length}
          </h3>
          {open.length > 1 && !workoutActive && <span className="text-xs text-ink-soft">Tap an exercise to start there</span>}
        </div>
        {open.length === 0 ? (
          <p className="rounded-xl border border-dashed border-ink/15 px-3 py-6 text-center text-sm text-ink-soft">
            {done.length > 0 ? "All exercises done. Reset them below to go again." : "Add exercises to build your workout."}
          </p>
        ) : (
          <SortableList
            items={open}
            itemLabel={(e) => e.title}
            isLocked={(e) => e.id === editingId}
            onReorder={onReorder}
            renderItem={(e, drag) => <ExerciseRow drag={drag} {...rowProps(e)} />}
          />
        )}
      </section>

      {done.length > 0 && (
        <section aria-labelledby={`${id}-done`}>
          <div className="mb-2 flex items-center justify-between">
            <h3 id={`${id}-done`} className="text-sm font-semibold tracking-wide text-ink-soft uppercase">
              Done · {done.length}
            </h3>
            <button
              type="button"
              onClick={onReset}
              className="rounded-full px-3 py-1 text-sm font-medium text-teal hover:bg-teal/10"
            >
              Reset all
            </button>
          </div>
          <ul className="flex flex-col gap-2">
            {done.map((e) => (
              <ExerciseRow key={e.id} {...rowProps(e)} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add / edit

interface FieldsState {
  title: string;
  mode: ExerciseMode;
  sets: number;
  reps: number;
  seconds: number;
}

function fieldsFrom(e: Exercise | null, defaultSeconds: number): FieldsState {
  return {
    title: e?.title ?? "",
    mode: e?.mode ?? "reps",
    sets: e?.sets ?? 3,
    reps: e?.reps ?? 10,
    seconds: e?.durationSeconds ?? defaultSeconds,
  };
}

/** A timed exercise left at the default follows the setting (stored as null). */
function toInput(f: FieldsState, defaultSeconds: number): ExerciseInput {
  return {
    title: f.title.trim(),
    mode: f.mode,
    sets: f.sets,
    reps: f.mode === "reps" ? f.reps : null,
    durationSeconds: f.mode === "time" && f.seconds !== defaultSeconds ? f.seconds : null,
  };
}

function AddExerciseForm({ defaultSeconds, onAdd }: { defaultSeconds: number; onAdd: (input: ExerciseInput) => Promise<Exercise | null> }) {
  const [fields, setFields] = useState(() => fieldsFrom(null, defaultSeconds));
  const [saving, setSaving] = useState(false);
  const id = useId();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!fields.title.trim() || saving) return;
    setSaving(true);
    const created = await onAdd(toInput(fields, defaultSeconds));
    setSaving(false);
    // Keep mode/sets/amount for the next one: workouts usually repeat a pattern.
    if (created) setFields((f) => ({ ...f, title: "" }));
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-2xl bg-ink/[0.04] p-3">
      <label htmlFor={`${id}-title`} className="sr-only">
        New exercise
      </label>
      <input
        id={`${id}-title`}
        value={fields.title}
        onChange={(e) => setFields((f) => ({ ...f, title: e.target.value }))}
        placeholder="Add an exercise, e.g. Push-ups"
        maxLength={200}
        autoComplete="off"
        className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-base text-ink placeholder:text-ink-soft/70 focus:border-teal focus:outline-none"
      />
      <ExerciseFields fields={fields} onChange={setFields} defaultSeconds={defaultSeconds} />
      <button
        type="submit"
        disabled={!fields.title.trim() || saving}
        className="ml-auto rounded-full bg-teal px-4 py-2 text-sm font-semibold whitespace-nowrap text-white hover:bg-teal-deep disabled:opacity-40"
      >
        Add exercise
      </button>
    </form>
  );
}

function ExerciseFields({
  fields,
  onChange,
  defaultSeconds,
}: {
  fields: FieldsState;
  onChange: (update: (f: FieldsState) => FieldsState) => void;
  defaultSeconds: number;
}) {
  const set = <K extends keyof FieldsState>(key: K, value: FieldsState[K]) => onChange((f) => ({ ...f, [key]: value }));
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <ModeToggle value={fields.mode} onChange={(mode) => set("mode", mode)} />
      <NumberStepper label="Sets" value={fields.sets} min={EXERCISE_LIMITS.sets[0]} max={EXERCISE_LIMITS.sets[1]} onChange={(v) => set("sets", v)} />
      {fields.mode === "reps" ? (
        <NumberStepper label="Reps" value={fields.reps} min={EXERCISE_LIMITS.reps[0]} max={EXERCISE_LIMITS.reps[1]} onChange={(v) => set("reps", v)} />
      ) : (
        <NumberStepper
          label="Seconds"
          value={fields.seconds}
          step={5}
          min={EXERCISE_LIMITS.seconds[0]}
          max={EXERCISE_LIMITS.seconds[1]}
          onChange={(v) => set("seconds", v)}
          hint={fields.seconds === defaultSeconds ? "default" : undefined}
        />
      )}
    </div>
  );
}

function ModeToggle({ value, onChange }: { value: ExerciseMode; onChange: (mode: ExerciseMode) => void }) {
  const option = (mode: ExerciseMode, label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={value === mode}
      onClick={() => onChange(mode)}
      className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
        value === mode ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div role="radiogroup" aria-label="Measure sets by" className="flex rounded-full bg-ink/[0.07] p-0.5">
      {option("reps", "Reps")}
      {option("time", "Time")}
    </div>
  );
}

/** − [value] +, with a typeable value. */
export function NumberStepper({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  hint,
  ariaLabel,
}: {
  label: string;
  /** Accessible name when the visible label alone is ambiguous. */
  ariaLabel?: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  hint?: string;
}) {
  const id = useId();
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const button = "grid size-7 place-items-center rounded-full border border-ink/10 bg-white text-ink hover:bg-ink/5 disabled:opacity-40";
  return (
    <div className="flex items-center gap-1 text-sm text-ink-soft">
      <label htmlFor={id} className="mr-0.5">
        {label}
      </label>
      <button type="button" onClick={() => onChange(clamp(value - step))} disabled={value <= min} className={button} aria-label={`Fewer ${label.toLowerCase()}`}>
        <MinusIcon className="text-xs" />
      </button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => {
          const n = e.target.valueAsNumber;
          if (Number.isFinite(n)) onChange(clamp(Math.round(n)));
        }}
        className="w-12 rounded-lg border border-ink/10 bg-white py-1 text-center text-base font-semibold text-ink tabular-nums [appearance:textfield] focus:border-teal focus:outline-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button type="button" onClick={() => onChange(clamp(value + step))} disabled={value >= max} className={button} aria-label={`More ${label.toLowerCase()}`}>
        <PlusIcon className="text-xs" />
      </button>
      {hint && <span className="text-xs text-ink-soft/80">{hint}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rows

interface ExerciseRowProps {
  exercise: Exercise;
  defaultSeconds: number;
  current: boolean;
  startsHere: boolean;
  editing: boolean;
  drag?: DragProps;
  onToggle: () => void;
  onRemove: () => void;
  onSelect?: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (input: ExerciseInput) => void;
}

const ROW_ACTION =
  "grid size-8 shrink-0 place-items-center rounded-full text-ink-soft opacity-60 hover:bg-ink/5 hover:opacity-100 focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100";

function ExerciseRow({
  exercise: e,
  defaultSeconds,
  current,
  startsHere,
  editing,
  drag,
  onToggle,
  onRemove,
  onSelect,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
}: ExerciseRowProps) {
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(editing);
  useEffect(() => {
    if (wasEditing.current && !editing) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  if (editing) {
    return (
      <li ref={drag?.setRowRef} style={drag?.style} className="rounded-2xl border border-teal bg-white p-3 shadow-[0_0_0_1px_var(--color-teal)]">
        <ExerciseEditor exercise={e} defaultSeconds={defaultSeconds} onSave={onSaveEdit} onCancel={onCancelEdit} />
      </li>
    );
  }

  const highlighted = current || startsHere;
  return (
    <li
      ref={drag?.setRowRef}
      style={drag?.style}
      className={`group relative flex items-center gap-3 rounded-2xl border bg-white px-3 py-2.5 transition-colors ${
        highlighted ? "border-teal shadow-[0_0_0_1px_var(--color-teal)]" : "border-ink/10"
      } ${drag?.dragging ? "z-10 shadow-lg shadow-ink/15 ring-2 ring-teal/40" : ""}`}
    >
      {drag?.handle}
      <button
        type="button"
        role="checkbox"
        aria-checked={e.done}
        aria-label={e.done ? `Mark "${e.title}" as not done` : `Mark "${e.title}" as done`}
        onClick={onToggle}
        className={`grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors ${
          e.done ? "border-teal bg-teal text-white" : "border-ink/25 text-transparent hover:border-teal"
        }`}
      >
        <CheckIcon className="text-sm" />
      </button>

      <button
        type="button"
        onClick={onSelect}
        disabled={!onSelect}
        aria-pressed={onSelect ? startsHere : undefined}
        className="min-w-0 flex-1 text-left disabled:cursor-default"
      >
        <span className={`block truncate text-[0.95rem] ${e.done ? "text-ink-soft line-through" : "text-ink"}`}>{e.title}</span>
        <span className="flex flex-wrap items-center gap-x-2 text-xs text-ink-soft tabular-nums">
          {describeExercise(e, defaultSeconds)}
          {current && <span className="font-semibold text-teal">● Now</span>}
          {!current && startsHere && <span className="font-semibold text-teal">Starts here</span>}
        </span>
      </button>

      <div className="-mr-1 flex shrink-0 items-center">
        <button type="button" ref={editButton} onClick={onStartEdit} aria-label={`Edit "${e.title}"`} className={`${ROW_ACTION} hover:text-ink`}>
          <PencilIcon />
        </button>
        <button type="button" onClick={onRemove} aria-label={`Delete "${e.title}"`} className={`${ROW_ACTION} hover:text-tomato-deep`}>
          <TrashIcon />
        </button>
      </div>
    </li>
  );
}

function ExerciseEditor({
  exercise,
  defaultSeconds,
  onSave,
  onCancel,
}: {
  exercise: Exercise;
  defaultSeconds: number;
  onSave: (input: ExerciseInput) => void;
  onCancel: () => void;
}) {
  const [fields, setFields] = useState(() => fieldsFrom(exercise, defaultSeconds));
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const trimmed = fields.title.trim();

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (trimmed) onSave(toInput(fields, defaultSeconds));
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    e.preventDefault(); // cancel the edit only; don't close the sheet
    e.stopPropagation();
    onCancel();
  }

  return (
    <form onSubmit={submit} onKeyDown={onKeyDown} className="flex flex-col gap-2" aria-label={`Edit "${exercise.title}"`}>
      <label htmlFor={`${id}-title`} className="sr-only">
        Exercise name
      </label>
      <input
        id={`${id}-title`}
        ref={input}
        value={fields.title}
        onChange={(e) => setFields((f) => ({ ...f, title: e.target.value }))}
        maxLength={200}
        autoComplete="off"
        aria-invalid={!trimmed}
        className="w-full rounded-xl border border-ink/15 bg-paper px-3 py-2 text-base text-ink focus:border-teal focus:outline-none"
      />
      <ExerciseFields fields={fields} onChange={setFields} defaultSeconds={defaultSeconds} />
      <div className="ml-auto flex gap-1.5">
        <button type="button" onClick={onCancel} className="rounded-full px-3.5 py-1.5 text-sm font-medium text-ink-soft hover:bg-ink/5">
          Cancel
        </button>
        <button
          type="submit"
          disabled={!trimmed}
          className="rounded-full bg-teal px-4 py-1.5 text-sm font-semibold text-white hover:bg-teal-deep disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </form>
  );
}
