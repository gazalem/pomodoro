/**
 * Pure workout engine for exercise mode. Like the pomodoro engine, every
 * function takes `now` explicitly so it can be unit tested.
 *
 * The workout walks the open exercise list in order, set by set:
 *   set 1 → rest → set 2 → rest → … → last set → rest → next exercise's set 1 …
 * Timed sets ("time" mode) end on their own; repetition sets ("reps" mode)
 * run until the user taps Done. The workout finishes after the last set of
 * the last exercise (no trailing rest).
 */
import { localDate } from "./schedule";
import type { Exercise, ExerciseLog, ExerciseMode, SessionStatus, Settings } from "./types";

/** A phase that ended longer ago than this (app closed, laptop asleep) isn't auto-completed. */
const STALE_MS = 5 * 60_000;
/** Abandoned phases shorter than this aren't recorded. */
const MIN_LOGGED_MS = 3_000;

export interface WorkoutPhase {
  id: string;
  kind: "set" | "rest";
  /** For a set: its exercise. For a rest: the exercise of the set that comes next. */
  exerciseId: number;
  exerciseTitle: string;
  setNumber: number;
  totalSets: number;
  mode: ExerciseMode;
  reps: number | null;
  startedAt: number;
  /** null = untimed repetition set, which runs until the user taps Done. */
  plannedMs: number | null;
  accumulatedMs: number;
  resumedAt: number | null;
  endsAt: number | null;
}

export type WorkoutStatus = "idle" | "running" | "paused" | "finished";

export interface WorkoutState {
  status: WorkoutStatus;
  phase: WorkoutPhase | null;
  /** Finished sets and rests waiting to be written to the database. */
  outbox: ExerciseLog[];
}

export const INITIAL_WORKOUT: WorkoutState = { status: "idle", phase: null, outbox: [] };

type Plan = Pick<Exercise, "id" | "title" | "sets" | "mode" | "reps" | "durationSeconds">;
type Timing = Pick<Settings, "exerciseSeconds" | "restSeconds">;

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function setDurationMs(exercise: Plan, s: Timing): number | null {
  return exercise.mode === "time" ? (exercise.durationSeconds ?? s.exerciseSeconds) * 1000 : null;
}

function makePhase(kind: WorkoutPhase["kind"], ex: Plan, setNumber: number, at: number, plannedMs: number | null): WorkoutPhase {
  return {
    id: newId(),
    kind,
    exerciseId: ex.id,
    exerciseTitle: ex.title,
    setNumber,
    totalSets: ex.sets,
    mode: ex.mode,
    reps: ex.reps,
    startedAt: at,
    plannedMs,
    accumulatedMs: 0,
    resumedAt: at,
    endsAt: plannedMs === null ? null : at + plannedMs,
  };
}

const startSet = (ex: Plan, setNumber: number, at: number, s: Timing) =>
  makePhase("set", ex, setNumber, at, setDurationMs(ex, s));

/** A rest before the given set, or the set itself when rest is turned off. */
const restBefore = (ex: Plan, setNumber: number, at: number, s: Timing) =>
  s.restSeconds > 0 ? makePhase("rest", ex, setNumber, at, s.restSeconds * 1000) : startSet(ex, setNumber, at, s);

export function elapsedMs(phase: WorkoutPhase, now: number): number {
  return phase.accumulatedMs + (phase.resumedAt !== null ? now - phase.resumedAt : 0);
}

/** What follows the given set: the next set, the next exercise's first set, or nothing. */
function nextAfterSet(phase: WorkoutPhase, list: Plan[]): { ex: Plan; setNumber: number } | null {
  const index = list.findIndex((e) => e.id === phase.exerciseId);
  const current = index >= 0 ? list[index] : null;
  if (current && phase.setNumber < current.sets) return { ex: current, setNumber: phase.setNumber + 1 };
  const following = index >= 0 ? list.slice(index + 1) : list.filter((e) => e.id !== phase.exerciseId);
  return following[0] ? { ex: following[0], setNumber: 1 } : null;
}

function toLog(phase: WorkoutPhase, status: SessionStatus, endedAt: number, actualMs: number, completesExercise: boolean): ExerciseLog {
  const actual = phase.plannedMs === null ? actualMs : Math.min(actualMs, phase.plannedMs);
  return {
    clientId: phase.id,
    kind: phase.kind,
    status,
    exerciseId: phase.exerciseId,
    exerciseTitle: phase.exerciseTitle,
    setNumber: phase.kind === "set" ? phase.setNumber : null,
    reps: phase.kind === "set" && phase.mode === "reps" ? phase.reps : null,
    plannedSeconds: phase.plannedMs === null ? null : Math.round(phase.plannedMs / 1000),
    actualSeconds: Math.max(0, Math.round(actual / 1000)),
    completesExercise,
    startedAt: phase.startedAt,
    endedAt,
    localDate: localDate(phase.startedAt),
    localHour: new Date(phase.startedAt).getHours(),
  };
}

/** Ends the current phase at `at` and moves on to whatever follows it. */
function finishPhase(state: WorkoutState, at: number, actualMs: number, status: SessionStatus, list: Plan[], s: Timing): WorkoutState {
  const phase = state.phase!;
  const totalSets = list.find((e) => e.id === phase.exerciseId)?.sets ?? phase.totalSets;
  const completesExercise = phase.kind === "set" && status === "completed" && phase.setNumber >= totalSets;
  const outbox = [...state.outbox, toLog(phase, status, at, actualMs, completesExercise)];

  let next: WorkoutPhase | null = null;
  if (phase.kind === "set") {
    const following = nextAfterSet(phase, list);
    if (following) next = restBefore(following.ex, following.setNumber, at, s);
  } else {
    // After a rest comes the set it announced, using the exercise's current settings.
    const ex = list.find((e) => e.id === phase.exerciseId) ?? list[0];
    if (ex) next = startSet(ex, ex.id === phase.exerciseId ? phase.setNumber : 1, at, s);
  }
  return next ? { ...state, outbox, status: "running", phase: next } : { ...state, outbox, status: "finished", phase: null };
}

/** Records an abandoned phase if enough time was spent on it. */
function logAbandoned(state: WorkoutState, now: number): ExerciseLog[] {
  const { phase } = state;
  if (!phase) return state.outbox;
  const actual = elapsedMs(phase, now);
  return actual < MIN_LOGGED_MS ? state.outbox : [...state.outbox, toLog(phase, "stopped", now, actual, false)];
}

/** Completes every timed phase whose end has passed (catch-up after a background tab). */
export function advance(state: WorkoutState, now: number, list: Plan[], s: Timing): WorkoutState {
  let next = state;
  for (let guard = 0; guard < 500; guard++) {
    const phase = next.phase;
    if (next.status !== "running" || !phase || phase.endsAt === null || now < phase.endsAt) break;
    if (now - phase.endsAt > STALE_MS) {
      // Away too long to know what really happened: stop rather than invent sets.
      return { ...next, status: "idle", phase: null, outbox: logAbandoned(next, phase.endsAt) };
    }
    next = finishPhase(next, phase.endsAt, phase.plannedMs ?? 0, "completed", list, s);
  }
  return next;
}

export type WorkoutAction =
  | { type: "hydrate"; saved: WorkoutState | null; now: number; list: Plan[]; settings: Timing }
  | { type: "tick"; now: number; list: Plan[]; settings: Timing }
  | { type: "start"; now: number; list: Plan[]; settings: Timing; exerciseId?: number }
  | { type: "pause"; now: number }
  | { type: "resume"; now: number }
  /** Ends the current set as done (the Done button), or ends a rest early. */
  | { type: "finish"; now: number; list: Plan[]; settings: Timing }
  | { type: "skip"; now: number; list: Plan[]; settings: Timing }
  | { type: "restart"; now: number; list: Plan[]; settings: Timing }
  | { type: "stop"; now: number }
  /** Clears the "workout complete" screen. */
  | { type: "dismiss" }
  | { type: "flushed"; clientIds: string[] };

export function workoutReducer(state: WorkoutState, action: WorkoutAction): WorkoutState {
  switch (action.type) {
    case "hydrate": {
      // Always a new object: the UI treats "still INITIAL_WORKOUT" as "not restored yet".
      const restored = { ...INITIAL_WORKOUT, ...state, ...(action.saved ?? {}) };
      return advance(restored, action.now, action.list, action.settings);
    }

    case "tick":
      return advance(state, action.now, action.list, action.settings);

    case "start": {
      if (state.status === "running" || state.status === "paused") return state;
      const ex = action.list.find((e) => e.id === action.exerciseId) ?? action.list[0];
      if (!ex) return state;
      return { ...state, status: "running", phase: startSet(ex, 1, action.now, action.settings) };
    }

    case "pause": {
      const { phase } = state;
      if (state.status !== "running" || !phase) return state;
      return {
        ...state,
        status: "paused",
        phase: { ...phase, accumulatedMs: elapsedMs(phase, action.now), resumedAt: null, endsAt: null },
      };
    }

    case "resume": {
      const { phase } = state;
      if (state.status !== "paused" || !phase) return state;
      const endsAt = phase.plannedMs === null ? null : action.now + Math.max(0, phase.plannedMs - phase.accumulatedMs);
      return { ...state, status: "running", phase: { ...phase, resumedAt: action.now, endsAt } };
    }

    case "finish":
    case "skip": {
      const { phase } = state;
      if (!phase) return state;
      const status: SessionStatus = action.type === "finish" && phase.kind === "set" ? "completed" : "skipped";
      return finishPhase(state, action.now, elapsedMs(phase, action.now), status, action.list, action.settings);
    }

    case "restart": {
      const { phase } = state;
      if (!phase) return state;
      const ex = action.list.find((e) => e.id === phase.exerciseId);
      if (!ex) return state;
      const base = { ...state, outbox: logAbandoned(state, action.now) };
      const fresh =
        phase.kind === "set"
          ? startSet(ex, phase.setNumber, action.now, action.settings)
          : restBefore(ex, phase.setNumber, action.now, action.settings);
      return { ...base, status: "running", phase: fresh };
    }

    case "stop": {
      if (!state.phase) return state;
      return { ...state, status: "idle", phase: null, outbox: logAbandoned(state, action.now) };
    }

    case "dismiss":
      return state.status === "finished" ? { ...state, status: "idle" } : state;

    case "flushed": {
      const done = new Set(action.clientIds);
      return { ...state, outbox: state.outbox.filter((l) => !done.has(l.clientId)) };
    }
  }
}
