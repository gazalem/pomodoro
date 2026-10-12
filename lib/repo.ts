import { getDb } from "./db";
import { normalizeSettings } from "./settings";
import type { PhaseType, SessionLog, SessionStatus, Settings, Task, TodayStats } from "./types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PHASE_TYPES: readonly PhaseType[] = ["focus", "short_break", "long_break", "lunch"];
const STATUSES: readonly SessionStatus[] = ["completed", "skipped", "stopped"];

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && DATE_RE.test(value) && !Number.isNaN(Date.parse(value));
}

// ---------------------------------------------------------------------------
// Settings

export function getSettings(): Settings {
  const row = getDb().prepare("SELECT data FROM settings WHERE id = 1").get() as
    | { data: string }
    | undefined;
  return normalizeSettings(row ? JSON.parse(row.data) : {});
}

export function saveSettings(input: unknown): Settings {
  const settings = normalizeSettings(input);
  getDb()
    .prepare(
      `INSERT INTO settings (id, data, updated_at) VALUES (1, ?, ?)
       ON CONFLICT (id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    )
    .run(JSON.stringify(settings), Date.now());
  return settings;
}

// ---------------------------------------------------------------------------
// Tasks

interface TaskRow {
  id: number;
  title: string;
  estimated_pomodoros: number;
  spent_pomodoros: number;
  done: number;
  created_at: number;
  completed_at: number | null;
}

const TASK_SELECT = `
  SELECT t.id, t.title, t.estimated_pomodoros, t.done, t.created_at, t.completed_at,
         (SELECT COUNT(*) FROM sessions s
           WHERE s.task_id = t.id AND s.type = 'focus' AND s.status = 'completed') AS spent_pomodoros
  FROM tasks t`;

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    estimatedPomodoros: row.estimated_pomodoros,
    spentPomodoros: row.spent_pomodoros,
    done: row.done === 1,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

/** Open tasks plus tasks completed at or after `since` (epoch ms). */
export function listTasks(since: number): Task[] {
  const rows = getDb()
    .prepare(
      `${TASK_SELECT}
       WHERE t.done = 0 OR t.completed_at >= ?
       ORDER BY t.done ASC, CASE WHEN t.done = 0 THEN t.created_at ELSE -t.completed_at END ASC`,
    )
    .all(since) as unknown as TaskRow[];
  return rows.map(toTask);
}

function getTask(id: number): Task | null {
  const row = getDb().prepare(`${TASK_SELECT} WHERE t.id = ?`).get(id) as TaskRow | undefined;
  return row ? toTask(row) : null;
}

function cleanTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const title = value.trim().slice(0, 200);
  return title || null;
}

function cleanEstimate(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 50
    ? value
    : null;
}

export function createTask(input: { title?: unknown; estimatedPomodoros?: unknown }): Task | null {
  const title = cleanTitle(input.title);
  if (!title) return null;
  const estimate = cleanEstimate(input.estimatedPomodoros) ?? 1;
  const result = getDb()
    .prepare("INSERT INTO tasks (title, estimated_pomodoros, created_at) VALUES (?, ?, ?)")
    .run(title, estimate, Date.now());
  return getTask(Number(result.lastInsertRowid));
}

export function updateTask(
  id: number,
  patch: { title?: unknown; estimatedPomodoros?: unknown; done?: unknown; localDate?: unknown },
): Task | null {
  const db = getDb();
  const sets: string[] = [];
  const values: (string | number | null)[] = [];

  if (patch.title !== undefined) {
    const title = cleanTitle(patch.title);
    if (!title) return null;
    sets.push("title = ?");
    values.push(title);
  }
  if (patch.estimatedPomodoros !== undefined) {
    const estimate = cleanEstimate(patch.estimatedPomodoros);
    if (estimate === null) return null;
    sets.push("estimated_pomodoros = ?");
    values.push(estimate);
  }
  if (typeof patch.done === "boolean") {
    sets.push("done = ?", "completed_at = ?", "completed_date = ?");
    if (patch.done) {
      const now = Date.now();
      const date = isIsoDate(patch.localDate) ? patch.localDate : new Date(now).toISOString().slice(0, 10);
      values.push(1, now, date);
    } else {
      values.push(0, null, null);
    }
  }

  if (sets.length > 0) {
    db.prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`).run(...values, id);
  }
  return getTask(id);
}

export function deleteTask(id: number): boolean {
  return getDb().prepare("DELETE FROM tasks WHERE id = ?").run(id).changes > 0;
}

// ---------------------------------------------------------------------------
// Sessions

function validLog(value: unknown): SessionLog | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const isInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;

  if (typeof v.clientId !== "string" || v.clientId.length === 0 || v.clientId.length > 64) return null;
  if (!PHASE_TYPES.includes(v.type as PhaseType)) return null;
  if (!STATUSES.includes(v.status as SessionStatus)) return null;
  if (!isInt(v.plannedSeconds) || !isInt(v.actualSeconds)) return null;
  if (!isInt(v.startedAt) || !isInt(v.endedAt) || v.endedAt < v.startedAt) return null;
  if (!isIsoDate(v.localDate) || !isInt(v.localHour) || v.localHour > 23) return null;
  if (v.taskId !== null && !isInt(v.taskId)) return null;

  return v as unknown as SessionLog;
}

/**
 * Stores finished phases. Idempotent on clientId, so the client can safely
 * retry a batch after a network failure. Returns the clientIds accepted.
 */
export function insertSessions(input: unknown[]): string[] {
  const db = getDb();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO sessions
       (client_id, type, status, task_id, planned_seconds, actual_seconds,
        started_at, ended_at, local_date, local_hour)
     VALUES (?, ?, ?, (SELECT id FROM tasks WHERE id = ?), ?, ?, ?, ?, ?, ?)`,
  );

  const accepted: string[] = [];
  db.exec("BEGIN");
  try {
    for (const item of input) {
      const log = validLog(item);
      if (!log) continue;
      insert.run(
        log.clientId,
        log.type,
        log.status,
        log.taskId,
        log.plannedSeconds,
        log.actualSeconds,
        log.startedAt,
        log.endedAt,
        log.localDate,
        log.localHour,
      );
      accepted.push(log.clientId);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return accepted;
}

export function getDayStats(date: string): TodayStats {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(actual_seconds), 0) AS focus_seconds,
              COALESCE(SUM(status = 'completed'), 0) AS pomodoros
       FROM sessions WHERE type = 'focus' AND local_date = ?`,
    )
    .get(date) as { focus_seconds: number; pomodoros: number };
  return { pomodoros: row.pomodoros, focusSeconds: row.focus_seconds };
}

// ---------------------------------------------------------------------------
// Report

export interface DayPoint {
  date: string;
  focusSeconds: number;
  pomodoros: number;
}

export interface HourPoint {
  hour: number;
  pomodoros: number;
}

export interface TaskPerformance {
  id: number;
  title: string;
  estimated: number;
  spentInRange: number;
  spentTotal: number;
  done: boolean;
  completedDate: string | null;
}

export interface SessionRow {
  id: number;
  type: PhaseType;
  status: SessionStatus;
  taskTitle: string | null;
  plannedSeconds: number;
  actualSeconds: number;
  startedAt: number;
  localDate: string;
}

export interface Report {
  from: string;
  to: string;
  dailyGoal: number;
  totals: {
    focusSeconds: number;
    pomodoros: number;
    focusAttempts: number;
    breakSeconds: number;
    skippedBreaks: number;
    tasksCompleted: number;
    activeDays: number;
    goalDays: number;
  };
  days: DayPoint[];
  hours: HourPoint[];
  tasks: TaskPerformance[];
  recent: SessionRow[];
}

export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end && out.length < 366; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

export function getReport(from: string, to: string): Report {
  const db = getDb();
  const settings = getSettings();

  const dayRows = db
    .prepare(
      `SELECT local_date AS date,
              SUM(actual_seconds) AS focusSeconds,
              SUM(status = 'completed') AS pomodoros
       FROM sessions
       WHERE type = 'focus' AND local_date BETWEEN ? AND ?
       GROUP BY local_date`,
    )
    .all(from, to) as unknown as DayPoint[];
  const byDate = new Map(dayRows.map((d) => [d.date, d]));
  const days = datesBetween(from, to).map(
    (date) => byDate.get(date) ?? { date, focusSeconds: 0, pomodoros: 0 },
  );

  const hourRows = db
    .prepare(
      `SELECT local_hour AS hour, COUNT(*) AS pomodoros
       FROM sessions
       WHERE type = 'focus' AND status = 'completed' AND local_date BETWEEN ? AND ?
       GROUP BY local_hour`,
    )
    .all(from, to) as unknown as HourPoint[];
  const byHour = new Map(hourRows.map((h) => [h.hour, h.pomodoros]));
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, pomodoros: byHour.get(hour) ?? 0 }));

  const agg = db
    .prepare(
      `SELECT
         COUNT(*) FILTER (WHERE type = 'focus')                                   AS focusAttempts,
         COALESCE(SUM(actual_seconds) FILTER (WHERE type IN ('short_break', 'long_break')), 0) AS breakSeconds,
         COUNT(*) FILTER (WHERE type IN ('short_break', 'long_break') AND status = 'skipped') AS skippedBreaks
       FROM sessions WHERE local_date BETWEEN ? AND ?`,
    )
    .get(from, to) as { focusAttempts: number; breakSeconds: number; skippedBreaks: number };

  const { tasksCompleted } = db
    .prepare(
      "SELECT COUNT(*) AS tasksCompleted FROM tasks WHERE done = 1 AND completed_date BETWEEN ? AND ?",
    )
    .get(from, to) as { tasksCompleted: number };

  const taskRows = db
    .prepare(
      `SELECT t.id, t.title, t.estimated_pomodoros AS estimated, t.done, t.completed_date AS completedDate,
              SUM(s.type = 'focus' AND s.status = 'completed' AND s.local_date BETWEEN ? AND ?) AS spentInRange,
              SUM(s.type = 'focus' AND s.status = 'completed') AS spentTotal
       FROM tasks t
       LEFT JOIN sessions s ON s.task_id = t.id
       GROUP BY t.id
       HAVING spentInRange > 0 OR (t.done = 1 AND t.completed_date BETWEEN ? AND ?)
       ORDER BY spentInRange DESC, t.title ASC
       LIMIT 50`,
    )
    .all(from, to, from, to) as unknown as (Omit<TaskPerformance, "done"> & { done: number })[];

  const recent = db
    .prepare(
      `SELECT s.id, s.type, s.status, t.title AS taskTitle, s.planned_seconds AS plannedSeconds,
              s.actual_seconds AS actualSeconds, s.started_at AS startedAt, s.local_date AS localDate
       FROM sessions s LEFT JOIN tasks t ON t.id = s.task_id
       WHERE s.local_date BETWEEN ? AND ?
       ORDER BY s.started_at DESC
       LIMIT 40`,
    )
    .all(from, to) as unknown as SessionRow[];

  const focusSeconds = days.reduce((sum, d) => sum + d.focusSeconds, 0);
  const pomodoros = days.reduce((sum, d) => sum + d.pomodoros, 0);

  return {
    from,
    to,
    dailyGoal: settings.dailyGoal,
    totals: {
      focusSeconds,
      pomodoros,
      focusAttempts: agg.focusAttempts,
      breakSeconds: agg.breakSeconds,
      skippedBreaks: agg.skippedBreaks,
      tasksCompleted,
      activeDays: days.filter((d) => d.focusSeconds > 0).length,
      goalDays: days.filter((d) => d.pomodoros >= settings.dailyGoal).length,
    },
    days,
    hours,
    tasks: taskRows.map((t) => ({
      ...t,
      spentInRange: t.spentInRange ?? 0,
      spentTotal: t.spentTotal ?? 0,
      done: t.done === 1,
    })),
    recent,
  };
}

/** Sessions in a date range, oldest first, for CSV export. */
export function exportSessions(from: string, to: string): SessionRow[] {
  return getDb()
    .prepare(
      `SELECT s.id, s.type, s.status, t.title AS taskTitle, s.planned_seconds AS plannedSeconds,
              s.actual_seconds AS actualSeconds, s.started_at AS startedAt, s.local_date AS localDate
       FROM sessions s LEFT JOIN tasks t ON t.id = s.task_id
       WHERE s.local_date BETWEEN ? AND ?
       ORDER BY s.started_at ASC`,
    )
    .all(from, to) as unknown as SessionRow[];
}
