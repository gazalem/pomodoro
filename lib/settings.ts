import type { Settings } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakInterval: 4,
  dayStart: "08:00",
  dayEnd: "17:00",
  autoStartAtDayStart: false,
  stopAtDayEnd: true,
  lunchEnabled: true,
  lunchStart: "12:00",
  lunchMinutes: 60,
  resumeAfterLunch: true,
  dailyGoal: 8,
  ambientDuringBreaks: false,
  ambientVolume: 0.6,
  chime: true,
  notifications: false,
  keepScreenAwake: true,
};

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function int(value: unknown, fallback: number, min: number, max: number) {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function time(value: unknown, fallback: string) {
  return typeof value === "string" && TIME_RE.test(value) ? value : fallback;
}

function bool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Coerces untrusted input (request bodies, stored JSON from older versions)
 * into a complete, valid Settings object. Unknown keys are dropped.
 */
export function normalizeSettings(input: unknown): Settings {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const volume = typeof raw.ambientVolume === "number" ? raw.ambientVolume : d.ambientVolume;

  return {
    focusMinutes: int(raw.focusMinutes, d.focusMinutes, 1, 180),
    shortBreakMinutes: int(raw.shortBreakMinutes, d.shortBreakMinutes, 1, 60),
    longBreakMinutes: int(raw.longBreakMinutes, d.longBreakMinutes, 1, 120),
    longBreakInterval: int(raw.longBreakInterval, d.longBreakInterval, 1, 12),
    dayStart: time(raw.dayStart, d.dayStart),
    dayEnd: time(raw.dayEnd, d.dayEnd),
    autoStartAtDayStart: bool(raw.autoStartAtDayStart, d.autoStartAtDayStart),
    stopAtDayEnd: bool(raw.stopAtDayEnd, d.stopAtDayEnd),
    lunchEnabled: bool(raw.lunchEnabled, d.lunchEnabled),
    lunchStart: time(raw.lunchStart, d.lunchStart),
    lunchMinutes: int(raw.lunchMinutes, d.lunchMinutes, 5, 240),
    resumeAfterLunch: bool(raw.resumeAfterLunch, d.resumeAfterLunch),
    dailyGoal: int(raw.dailyGoal, d.dailyGoal, 1, 32),
    ambientDuringBreaks: bool(raw.ambientDuringBreaks, d.ambientDuringBreaks),
    ambientVolume: Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : d.ambientVolume,
    chime: bool(raw.chime, d.chime),
    notifications: bool(raw.notifications, d.notifications),
    keepScreenAwake: bool(raw.keepScreenAwake, d.keepScreenAwake),
  };
}
