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
}

export interface Task {
  id: number;
  title: string;
  estimatedPomodoros: number;
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
