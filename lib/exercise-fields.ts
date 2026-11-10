import type { Exercise, ExerciseMode } from "./types";
import type { ExerciseInput } from "./use-exercises";

export interface FieldsState {
  title: string;
  mode: ExerciseMode;
  sets: number;
  reps: number;
  /** null = follow the exercise-time setting. */
  seconds: number | null;
}

export function fieldsFrom(e: Exercise | null): FieldsState {
  return {
    title: e?.title ?? "",
    mode: e?.mode ?? "reps",
    sets: e?.sets ?? 3,
    reps: e?.reps ?? 10,
    seconds: e?.durationSeconds ?? null,
  };
}

/** A timed exercise left at the default follows the setting (stored as null). */
export function toInput(f: FieldsState, defaultSeconds: number): ExerciseInput {
  return {
    title: f.title.trim(),
    mode: f.mode,
    sets: f.sets,
    reps: f.mode === "reps" ? f.reps : null,
    durationSeconds: f.mode === "time" && f.seconds !== null && f.seconds !== defaultSeconds ? f.seconds : null,
  };
}
