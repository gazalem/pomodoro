/**
 * Pure timer engine. Every function takes `now` explicitly, so the reducer
 * stays deterministic and the logic can be unit tested without fake timers.
 *
 * The cycle is: focus → short break → focus → … → long break (every N focus
 * blocks) and repeats on its own. Phases are clipped so they end exactly at
 * lunch start; lunch then runs as its own phase, and the cycle optionally
 * resumes after it. The cycle stops at the end of the workday.
 */
import type { PhaseType, SessionLog, SessionStatus, Settings } from "./types";

const MINUTE = 60_000;
/** Don't start a phase that would be shorter than this before a boundary. */
const MIN_PHASE_MS = MINUTE;
/** Abandoned phases shorter than this are not worth recording. */
const MIN_LOGGED_MS = MINUTE;
const AUTO_START_GRACE_MS = 15 * MINUTE;

export interface Phase {
  id: string;
  type: PhaseType;
  taskId: number | null;
  startedAt: number;
  /** Planned running time, after clipping to lunch / end of day. */
  plannedMs: number;
  /** Running time accumulated before the most recent resume. */
  accumulatedMs: number;
  /** When the phase last started running; null while paused. */
  resumedAt: number | null;
  /** Wall-clock end; null while paused. */
  endsAt: number | null;
  cutBy: "lunch" | "day-end" | null;
}

export type TimerStatus = "idle" | "running" | "paused";
export type TimerNotice = "lunch-over" | "day-done" | null;

export interface TimerState {
  status: TimerStatus;
  phase: Phase | null;
  activeTaskId: number | null;
  /** Focus blocks finished since the last long break. */
  cycleCount: number;
  /** Local date the counters above belong to. */
  date: string | null;
  lunchDoneDate: string | null;
  autoStartedDate: string | null;
  notice: TimerNotice;
  /** Finished phases waiting to be written to the server. */
  outbox: SessionLog[];
}

export const INITIAL_TIMER: TimerState = {
  status: "idle",
  phase: null,
  activeTaskId: null,
  cycleCount: 0,
  date: null,
  lunchDoneDate: null,
  autoStartedDate: null,
  notice: null,
  outbox: [],
};

// ---------------------------------------------------------------------------
// Clock helpers (local time)

export function localDate(ms: number): string {
  const d = new Date(ms);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Epoch ms of "HH:MM" on the same local day as `ms`. */
export function atClock(ms: number, hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(ms);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

function newId(): string {
  // crypto.randomUUID is unavailable on plain-http LAN origins (e.g. testing on a phone).
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Planning

export function phaseMinutes(type: PhaseType, s: Settings): number {
  switch (type) {
    case "focus":
      return s.focusMinutes;
    case "short_break":
      return s.shortBreakMinutes;
    case "long_break":
      return s.longBreakMinutes;
    case "lunch":
      return s.lunchMinutes;
  }
}

function lunchWindow(state: TimerState, s: Settings, at: number) {
  if (!s.lunchEnabled || state.lunchDoneDate === localDate(at)) return null;
  const start = atClock(at, s.lunchStart);
  return { start, end: start + s.lunchMinutes * MINUTE };
}

function nextType(prev: PhaseType | null, cycleCount: number, s: Settings): PhaseType {
  if (prev !== "focus") return "focus";
  return cycleCount >= s.longBreakInterval ? "long_break" : "short_break";
}

/**
 * Builds the phase that should start at `at`, or null when the workday is over.
 * A manual start after the end of the day is allowed (overtime) and not clipped.
 */
export function planPhase(
  requested: PhaseType,
  at: number,
  state: TimerState,
  s: Settings,
  manual: boolean,
): Phase | null {
  let dayEnd = s.stopAtDayEnd ? atClock(at, s.dayEnd) : null;
  if (dayEnd !== null && at >= dayEnd - MIN_PHASE_MS) {
    if (!manual) return null;
    dayEnd = null;
  }

  const lunch = lunchWindow(state, s, at);
  let type = requested;
  if (lunch && at >= lunch.start - MIN_PHASE_MS && at < lunch.end) type = "lunch";

  let plannedMs: number;
  let cutBy: Phase["cutBy"] = null;
  if (type === "lunch") {
    plannedMs = lunch ? lunch.end - at : s.lunchMinutes * MINUTE;
  } else {
    plannedMs = phaseMinutes(type, s) * MINUTE;
    if (lunch && at < lunch.start && at + plannedMs > lunch.start) {
      plannedMs = lunch.start - at;
      cutBy = "lunch";
    }
    if (dayEnd !== null && at + plannedMs > dayEnd) {
      plannedMs = dayEnd - at;
      cutBy = "day-end";
    }
  }

  return {
    id: newId(),
    type,
    taskId: type === "focus" ? state.activeTaskId : null,
    startedAt: at,
    plannedMs,
    accumulatedMs: 0,
    resumedAt: at,
    endsAt: at + plannedMs,
    cutBy,
  };
}

// ---------------------------------------------------------------------------
// Transitions

export function elapsedMs(phase: Phase, now: number): number {
  return phase.accumulatedMs + (phase.resumedAt !== null ? now - phase.resumedAt : 0);
}

export function remainingMs(phase: Phase, now: number): number {
  return Math.max(0, phase.plannedMs - elapsedMs(phase, now));
}

function toLog(phase: Phase, status: SessionStatus, endedAt: number, actualMs: number): SessionLog {
  return {
    clientId: phase.id,
    type: phase.type,
    status,
    taskId: phase.taskId,
    plannedSeconds: Math.round(phase.plannedMs / 1000),
    actualSeconds: Math.round(Math.min(actualMs, phase.plannedMs) / 1000),
    startedAt: phase.startedAt,
    endedAt,
    localDate: localDate(phase.startedAt),
    localHour: new Date(phase.startedAt).getHours(),
  };
}

/** Records an unfinished phase if enough time was spent on it. */
function logAbandoned(state: TimerState, status: SessionStatus, now: number): SessionLog[] {
  const { phase } = state;
  if (!phase) return state.outbox;
  const actual = elapsedMs(phase, now);
  if (actual < MIN_LOGGED_MS) return state.outbox;
  return [...state.outbox, toLog(phase, status, now, actual)];
}

/** Updates cycle counters once `phase` is over. */
function countPhase(state: TimerState, phase: Phase, completed: boolean): TimerState {
  let { cycleCount, lunchDoneDate } = state;
  if (phase.type === "focus" && completed) cycleCount += 1;
  if (phase.type === "long_break") cycleCount = 0;
  if (phase.type === "lunch") {
    lunchDoneDate = localDate(phase.startedAt);
    cycleCount = 0;
  }
  return { ...state, cycleCount, lunchDoneDate };
}

/** Moves on to whatever follows `prev`, starting at `at`. */
function chainNext(state: TimerState, prev: Phase, at: number, s: Settings): TimerState {
  if (prev.type === "lunch" && !s.resumeAfterLunch) {
    return { ...state, status: "idle", phase: null, notice: "lunch-over" };
  }
  const next = planPhase(nextType(prev.type, state.cycleCount, s), at, state, s, false);
  if (!next) return { ...state, status: "idle", phase: null, notice: "day-done" };
  return { ...state, status: "running", phase: next, notice: null };
}

/**
 * Completes every phase whose end time has passed. Runs in a loop so a tab
 * that was asleep for an hour catches up on all the phases it missed.
 */
export function advance(state: TimerState, now: number, s: Settings): TimerState {
  let next = state;
  for (let guard = 0; guard < 200; guard++) {
    const phase = next.phase;
    if (next.status !== "running" || !phase || phase.endsAt === null || now < phase.endsAt) break;

    const at = phase.endsAt;
    next = countPhase(next, phase, true);
    next = { ...next, outbox: [...next.outbox, toLog(phase, "completed", at, phase.plannedMs)] };
    // Never roll a cycle across midnight (e.g. laptop closed overnight).
    if (localDate(at) !== localDate(phase.startedAt) || localDate(at) !== localDate(now)) {
      return { ...next, status: "idle", phase: null, notice: null };
    }
    next = chainNext(next, phase, at, s);
  }
  return next;
}

// ---------------------------------------------------------------------------
// Reducer

export type TimerAction =
  | { type: "hydrate"; saved: TimerState | null; now: number; settings: Settings }
  | { type: "tick"; now: number; settings: Settings }
  | { type: "start"; now: number; settings: Settings }
  | { type: "pause"; now: number }
  | { type: "resume"; now: number; settings: Settings }
  | { type: "restart"; now: number; settings: Settings }
  | { type: "skip"; now: number; settings: Settings }
  | { type: "stop"; now: number }
  | { type: "setTask"; taskId: number | null }
  | { type: "flushed"; clientIds: string[] };

/** Resets per-day counters when the date rolls over. */
function onDate(state: TimerState, now: number): TimerState {
  const today = localDate(now);
  if (state.date === today) return state;
  if (state.status !== "idle") return { ...state, date: today };
  return { ...state, date: today, cycleCount: 0, notice: null };
}

export function timerReducer(state: TimerState, action: TimerAction): TimerState {
  switch (action.type) {
    case "hydrate": {
      const restored = action.saved ? { ...INITIAL_TIMER, ...action.saved } : state;
      return onDate(advance(restored, action.now, action.settings), action.now);
    }

    case "tick": {
      const { now, settings } = action;
      let next = advance(state, now, settings);
      const today = localDate(now);
      const dayStart = atClock(now, settings.dayStart);
      if (
        settings.autoStartAtDayStart &&
        next.status === "idle" &&
        next.autoStartedDate !== today &&
        now >= dayStart &&
        now < dayStart + AUTO_START_GRACE_MS
      ) {
        next = timerReducer({ ...next, autoStartedDate: today }, { type: "start", now, settings });
      }
      return next === state ? state : onDate(next, now);
    }

    case "start": {
      if (state.status !== "idle") return state;
      const base = onDate(state, action.now);
      const phase = planPhase("focus", action.now, base, action.settings, true);
      if (!phase) return state;
      return { ...base, status: "running", phase, notice: null };
    }

    case "pause": {
      const { phase } = state;
      if (state.status !== "running" || !phase) return state;
      return {
        ...state,
        status: "paused",
        phase: {
          ...phase,
          accumulatedMs: elapsedMs(phase, action.now),
          resumedAt: null,
          endsAt: null,
        },
      };
    }

    case "resume": {
      const { phase } = state;
      const { now, settings } = action;
      if (state.status !== "paused" || !phase) return state;

      // Resumed in the middle of lunch: close this phase and go to lunch.
      const lunch = lunchWindow(state, settings, now);
      if (phase.type !== "lunch" && lunch && now >= lunch.start && now < lunch.end) {
        const closed = { ...state, outbox: logAbandoned(state, "stopped", now) };
        const lunchPhase = planPhase("lunch", now, closed, settings, true);
        return { ...closed, status: "running", phase: lunchPhase };
      }

      let plannedMs = phase.plannedMs;
      let cutBy = phase.cutBy;
      if (phase.type !== "lunch" && lunch && now < lunch.start) {
        const maxMs = phase.accumulatedMs + (lunch.start - now);
        if (plannedMs > maxMs) {
          plannedMs = maxMs;
          cutBy = "lunch";
        }
      }
      const resumed = { ...phase, plannedMs, cutBy, resumedAt: now };
      return {
        ...state,
        status: "running",
        phase: { ...resumed, endsAt: now + remainingMs(resumed, now) },
      };
    }

    case "restart": {
      const { phase } = state;
      if (!phase) return state;
      const base = { ...state, outbox: logAbandoned(state, "stopped", action.now) };
      const fresh = planPhase(phase.type, action.now, base, action.settings, true);
      return fresh ? { ...base, status: "running", phase: fresh } : state;
    }

    case "skip": {
      const { phase } = state;
      if (!phase) return state;
      const elapsed = elapsedMs(phase, action.now);
      let next: TimerState = {
        ...state,
        outbox: [...state.outbox, toLog(phase, "skipped", action.now, elapsed)],
      };
      next = countPhase(next, phase, false);
      return chainNext(next, phase, action.now, action.settings);
    }

    case "stop": {
      if (!state.phase) return state;
      return {
        ...state,
        status: "idle",
        phase: null,
        notice: null,
        outbox: logAbandoned(state, "stopped", action.now),
      };
    }

    case "setTask": {
      const { phase } = state;
      return {
        ...state,
        activeTaskId: action.taskId,
        phase: phase?.type === "focus" ? { ...phase, taskId: action.taskId } : phase,
      };
    }

    case "flushed": {
      const done = new Set(action.clientIds);
      return { ...state, outbox: state.outbox.filter((l) => !done.has(l.clientId)) };
    }
  }
}

// ---------------------------------------------------------------------------
// Day preview

export interface DayPreview {
  focusBeforeLunch: number;
  focusAfterLunch: number;
  focusMinutes: number;
  lunchAt: number | null;
  endsAt: number;
}

/** Simulates a full uninterrupted day with the real engine, for the settings preview. */
export function previewDay(s: Settings, dayMs: number): DayPreview {
  const start = atClock(dayMs, s.dayStart);
  const until = s.stopAtDayEnd ? atClock(dayMs, s.dayEnd) : atClock(dayMs, "23:59");
  const started = timerReducer({ ...INITIAL_TIMER }, { type: "start", now: start, settings: s });
  const finished = advance(started, until, s);

  const lunch = finished.outbox.find((l) => l.type === "lunch");
  const lunchAt = lunch ? lunch.startedAt : null;
  let focusBeforeLunch = 0;
  let focusAfterLunch = 0;
  let focusMinutes = 0;
  for (const log of finished.outbox) {
    if (log.type !== "focus") continue;
    focusMinutes += log.actualSeconds / 60;
    if (lunchAt === null || log.startedAt < lunchAt) focusBeforeLunch++;
    else focusAfterLunch++;
  }
  const last = finished.outbox.at(-1);
  return { focusBeforeLunch, focusAfterLunch, focusMinutes, lunchAt, endsAt: last ? last.endedAt : start };
}
