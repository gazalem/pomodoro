import type { CategoryColor } from "./categories";

export type PhaseType = "focus" | "short_break" | "long_break" | "lunch";

export type SessionStatus = "completed" | "skipped" | "stopped";

export interface Settings {
  /** Length of one focus block, in minutes. */
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  /** A long break replaces the short one after this many focus blocks. */
  longBreakInterval: number;
  /** Workday window, "HH:MM" in the user's local time. */
  dayStart: string;
  dayEnd: string;
  /** Start the cycle automatically at `dayStart` when the app is open. */
  autoStartAtDayStart: boolean;
  /** Stop the cycle at `dayEnd`. */
  stopAtDayEnd: boolean;
  lunchEnabled: boolean;
  lunchStart: string;
  lunchMinutes: number;
  /** Start focusing again automatically when lunch ends. */
  resumeAfterLunch: boolean;
  /** Pomodoros per day you are aiming for (used by the report). */
  dailyGoal: number;
  ambientDuringBreaks: boolean;
  ambientVolume: number;
  chime: boolean;
  notifications: boolean;
  keepScreenAwake: boolean;
  /** Exercise mode: default length of a timed set, in seconds. */
  exerciseSeconds: number;
  /** Exercise mode: rest between sets, in seconds (0 = no rest). */
  restSeconds: number;
}

export interface Task {
  id: number;
  title: string;
  estimatedPomodoros: number;
  categoryId: number | null;
  /** Completed focus sessions linked to this task (all time). */
  spentPomodoros: number;
  done: boolean;
  createdAt: number;
  completedAt: number | null;
}

/** One finished (or abandoned) phase, sent by the client to be stored. */
export interface SessionLog {
  clientId: string;
  type: PhaseType;
  status: SessionStatus;
  taskId: number | null;
  plannedSeconds: number;
  actualSeconds: number;
  startedAt: number;
  endedAt: number;
  /** "YYYY-MM-DD" in the user's local time zone when the phase started. */
  localDate: string;
  /** 0-23, the user's local hour when the phase started. */
  localHour: number;
}

export interface TodayStats {
  pomodoros: number;
  focusSeconds: number;
}

export interface Category {
  id: number;
  name: string;
  color: CategoryColor;
}

/** "reps": do N repetitions, tap Done. "time": the set runs for a fixed time. */
export type ExerciseMode = "reps" | "time";

export interface Exercise {
  id: number;
  title: string;
  sets: number;
  mode: ExerciseMode;
  /** Repetitions per set (reps mode). */
  reps: number | null;
  /** Seconds per set (time mode); null = the default from settings. */
  durationSeconds: number | null;
  done: boolean;
  createdAt: number;
  completedAt: number | null;
}

/** One finished (or abandoned) exercise set or rest, stored for the report. */
export interface ExerciseLog {
  clientId: string;
  kind: "set" | "rest";
  status: SessionStatus;
  exerciseId: number | null;
  /** Snapshot, so the report keeps the name if the exercise is renamed or deleted. */
  exerciseTitle: string | null;
  setNumber: number | null;
  reps: number | null;
  /** null for untimed (reps) sets. */
  plannedSeconds: number | null;
  actualSeconds: number;
  /** True on the set that finished the exercise's last set. */
  completesExercise: boolean;
  startedAt: number;
  endedAt: number;
  localDate: string;
  localHour: number;
}
