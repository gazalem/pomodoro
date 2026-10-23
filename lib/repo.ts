import { isCategoryColor, MAX_CATEGORIES, nextFreeColor, type CategoryColor } from "./categories";
import { first, type SqlDriver, type SqlParam } from "./db/driver";
import { normalizeSettings } from "./settings";
import type { Category, PhaseType, SessionLog, SessionStatus, Settings, Task, TodayStats } from "./types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PHASE_TYPES: readonly PhaseType[] = ["focus", "short_break", "long_break", "lunch"];
const STATUSES: readonly SessionStatus[] = ["completed", "skipped", "stopped"];

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && DATE_RE.test(value) && !Number.isNaN(Date.parse(value));
}

export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end && out.length < 366; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Row shapes

interface TaskRow {
  id: number;
  title: string;
  estimated_pomodoros: number;
  spent_pomodoros: number;
  category_id: number | null;
  done: number;
  created_at: number;
  completed_at: number | null;
}

const TASK_SELECT = `
  SELECT t.id, t.title, t.estimated_pomodoros, t.category_id, t.done, t.created_at, t.completed_at,
         (SELECT COUNT(*) FROM sessions s
           WHERE s.task_id = t.id AND s.type = 'focus' AND s.status = 'completed') AS spent_pomodoros
  FROM tasks t`;

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    estimatedPomodoros: row.estimated_pomodoros,
    spentPomodoros: row.spent_pomodoros,
    categoryId: row.category_id,
    done: row.done === 1,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

function cleanTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const title = value.trim().slice(0, 200);
  return title || null;
}

function cleanCategoryName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ").slice(0, 40);
  return name || null;
}

/** undefined = leave unchanged, null = no category, number = category id. */
function cleanCategoryId(value: unknown): number | null | undefined {
  if (value === null) return null;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function cleanEstimate(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 50 ? value : null;
}

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

// ---------------------------------------------------------------------------
// Report types

export interface DayPoint {
  date: string;
  focusSeconds: number;
  pomodoros: number;
}

export interface HourPoint {
  hour: number;
  pomodoros: number;
}

export interface CategoryFocus {
  /** null = focus not linked to a categorized task. */
  categoryId: number | null;
  name: string;
  color: CategoryColor | null;
  focusSeconds: number;
  pomodoros: number;
}

export interface TaskPerformance {
  id: number;
  title: string;
  categoryName: string | null;
  categoryColor: CategoryColor | null;
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
  categories: CategoryFocus[];
  tasks: TaskPerformance[];
  recent: SessionRow[];
}

const SESSION_SELECT = `
  SELECT s.id, s.type, s.status, t.title AS taskTitle, s.planned_seconds AS plannedSeconds,
         s.actual_seconds AS actualSeconds, s.started_at AS startedAt, s.local_date AS localDate
  FROM sessions s LEFT JOIN tasks t ON t.id = s.task_id
  WHERE s.local_date BETWEEN ? AND ?`;

// ---------------------------------------------------------------------------

export type Repo = ReturnType<typeof createRepo>;

/** All persistence for the app. Every query goes through the given driver. */
export function createRepo(db: SqlDriver) {
  async function getTask(id: number): Promise<Task | null> {
    const row = await first<TaskRow>(db, `${TASK_SELECT} WHERE t.id = ?`, [id]);
    return row ? toTask(row) : null;
  }

  async function getSettings(): Promise<Settings> {
    const row = await first<{ data: string }>(db, "SELECT data FROM settings WHERE id = 1");
    return normalizeSettings(row ? JSON.parse(row.data) : {});
  }

  return {
    getSettings,

    async saveSettings(input: unknown): Promise<Settings> {
      const settings = normalizeSettings(input);
      await db.run(
        `INSERT INTO settings (id, data, updated_at) VALUES (1, ?, ?)
         ON CONFLICT (id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
        [JSON.stringify(settings), Date.now()],
      );
      return settings;
    },

    /** Open tasks plus tasks completed at or after `since` (epoch ms). */
    async listTasks(since: number): Promise<Task[]> {
      const rows = await db.all<TaskRow>(
        `${TASK_SELECT}
         WHERE t.done = 0 OR t.completed_at >= ?
         ORDER BY t.done ASC,
                  CASE WHEN t.done = 0 THEN t.sort_order ELSE -t.completed_at END ASC,
                  t.id ASC`,
        [since],
      );
      return rows.map(toTask);
    },

    async createTask(input: {
      title?: unknown;
      estimatedPomodoros?: unknown;
      categoryId?: unknown;
    }): Promise<Task | null> {
      const title = cleanTitle(input.title);
      if (!title) return null;
      const estimate = cleanEstimate(input.estimatedPomodoros) ?? 1;
      const categoryId = cleanCategoryId(input.categoryId) ?? null;
      // New tasks go to the bottom of the list. An unknown category id becomes NULL.
      const { lastInsertRowid } = await db.run(
        `INSERT INTO tasks (title, estimated_pomodoros, category_id, created_at, sort_order)
         VALUES (?, ?, (SELECT id FROM categories WHERE id = ?), ?,
                 (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM tasks))`,
        [title, estimate, categoryId, Date.now()],
      );
      return getTask(lastInsertRowid);
    },

    /** `localDate` is the user's "YYYY-MM-DD", recorded when a task is completed. */
    async updateTask(
      id: number,
      patch: { title?: unknown; estimatedPomodoros?: unknown; done?: unknown; categoryId?: unknown },
      localDate: string,
    ): Promise<Task | null> {
      const sets: string[] = [];
      const values: SqlParam[] = [];

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
      if (patch.categoryId !== undefined) {
        const categoryId = cleanCategoryId(patch.categoryId);
        if (categoryId === undefined) return null;
        sets.push("category_id = (SELECT id FROM categories WHERE id = ?)");
        values.push(categoryId);
      }
      if (typeof patch.done === "boolean") {
        sets.push("done = ?", "completed_at = ?", "completed_date = ?");
        values.push(...(patch.done ? [1, Date.now(), localDate] : [0, null, null]));
      }

      if (sets.length > 0) await db.run(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`, [...values, id]);
      return getTask(id);
    },

    // -- Categories ---------------------------------------------------------

    async listCategories(): Promise<Category[]> {
      return db.all<Category>("SELECT id, name, color FROM categories ORDER BY sort_order, id");
    },

    /** Throws an Error with a user-facing message when the name is taken or the limit is reached. */
    async createCategory(input: { name?: unknown }): Promise<Category> {
      const name = cleanCategoryName(input.name);
      if (!name) throw new Error("Give the category a name.");
      const existing = await db.all<{ name: string; color: string }>("SELECT name, color FROM categories");
      if (existing.length >= MAX_CATEGORIES) throw new Error(`You can have up to ${MAX_CATEGORIES} categories.`);
      if (existing.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
        throw new Error(`There's already a "${name}" category.`);
      }
      const color = nextFreeColor(existing.map((c) => c.color));
      const { lastInsertRowid } = await db.run(
        `INSERT INTO categories (name, color, sort_order, created_at)
         VALUES (?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories), ?)`,
        [name, color, Date.now()],
      );
      return { id: lastInsertRowid, name, color };
    },

    async updateCategory(id: number, patch: { name?: unknown; color?: unknown }): Promise<Category | null> {
      const sets: string[] = [];
      const values: SqlParam[] = [];
      if (patch.name !== undefined) {
        const name = cleanCategoryName(patch.name);
        if (!name) throw new Error("Give the category a name.");
        const clash = await first<{ id: number }>(
          db,
          "SELECT id FROM categories WHERE name = ? COLLATE NOCASE AND id != ?",
          [name, id],
        );
        if (clash) throw new Error(`There's already a "${name}" category.`);
        sets.push("name = ?");
        values.push(name);
      }
      if (patch.color !== undefined) {
        if (!isCategoryColor(patch.color)) return null;
        sets.push("color = ?");
        values.push(patch.color);
      }
      if (sets.length > 0) await db.run(`UPDATE categories SET ${sets.join(", ")} WHERE id = ?`, [...values, id]);
      return (await first<Category>(db, "SELECT id, name, color FROM categories WHERE id = ?", [id])) ?? null;
    },

    /** Deletes a category; its tasks are kept and become uncategorized. */
    async deleteCategory(id: number): Promise<boolean> {
      return (await db.run("DELETE FROM categories WHERE id = ?", [id])).changes > 0;
    },

    // -- Tasks ---------------------------------------------------------------

    /** Saves the to-do order: `ids[0]` first. Ids not in the list keep their position value. */
    async reorderTasks(ids: number[]): Promise<void> {
      const valid = ids.filter((id) => Number.isInteger(id) && id > 0);
      await db.batch(
        valid.map((id, index) => ({ sql: "UPDATE tasks SET sort_order = ? WHERE id = ?", params: [index + 1, id] })),
      );
    },

    async deleteTask(id: number): Promise<boolean> {
      return (await db.run("DELETE FROM tasks WHERE id = ?", [id])).changes > 0;
    },

    /**
     * Stores finished phases in one transaction. Idempotent on clientId, so a
     * batch can be retried safely. Returns the clientIds that were valid.
     */
    async insertSessions(input: unknown[]): Promise<string[]> {
      const logs = input.map(validLog).filter((l): l is SessionLog => l !== null);
      await db.batch(
        logs.map((log) => ({
          sql: `INSERT OR IGNORE INTO sessions
                  (client_id, type, status, task_id, planned_seconds, actual_seconds,
                   started_at, ended_at, local_date, local_hour)
                VALUES (?, ?, ?, (SELECT id FROM tasks WHERE id = ?), ?, ?, ?, ?, ?, ?)`,
          params: [
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
          ],
        })),
      );
      return logs.map((l) => l.clientId);
    },

    async getDayStats(date: string): Promise<TodayStats> {
      const row = await first<{ focus_seconds: number; pomodoros: number }>(
        db,
        `SELECT COALESCE(SUM(actual_seconds), 0) AS focus_seconds,
                COALESCE(SUM(status = 'completed'), 0) AS pomodoros
         FROM sessions WHERE type = 'focus' AND local_date = ?`,
        [date],
      );
      return { pomodoros: row?.pomodoros ?? 0, focusSeconds: row?.focus_seconds ?? 0 };
    },

    async getReport(from: string, to: string): Promise<Report> {
      const settings = await getSettings();

      const dayRows = await db.all<DayPoint>(
        `SELECT local_date AS date,
                SUM(actual_seconds) AS focusSeconds,
                SUM(status = 'completed') AS pomodoros
         FROM sessions
         WHERE type = 'focus' AND local_date BETWEEN ? AND ?
         GROUP BY local_date`,
        [from, to],
      );
      const byDate = new Map(dayRows.map((d) => [d.date, d]));
      const days = datesBetween(from, to).map(
        (date) => byDate.get(date) ?? { date, focusSeconds: 0, pomodoros: 0 },
      );

      const hourRows = await db.all<HourPoint>(
        `SELECT local_hour AS hour, COUNT(*) AS pomodoros
         FROM sessions
         WHERE type = 'focus' AND status = 'completed' AND local_date BETWEEN ? AND ?
         GROUP BY local_hour`,
        [from, to],
      );
      const byHour = new Map(hourRows.map((h) => [h.hour, h.pomodoros]));
      const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, pomodoros: byHour.get(hour) ?? 0 }));

      const agg = (await first<{ focusAttempts: number; breakSeconds: number; skippedBreaks: number }>(
        db,
        `SELECT
           COUNT(*) FILTER (WHERE type = 'focus') AS focusAttempts,
           COALESCE(SUM(actual_seconds) FILTER (WHERE type IN ('short_break', 'long_break')), 0) AS breakSeconds,
           COUNT(*) FILTER (WHERE type IN ('short_break', 'long_break') AND status = 'skipped') AS skippedBreaks
         FROM sessions WHERE local_date BETWEEN ? AND ?`,
        [from, to],
      ))!;

      const completed = await first<{ tasksCompleted: number }>(
        db,
        "SELECT COUNT(*) AS tasksCompleted FROM tasks WHERE done = 1 AND completed_date BETWEEN ? AND ?",
        [from, to],
      );

      const taskRows = await db.all<Omit<TaskPerformance, "done"> & { done: number }>(
        `SELECT t.id, t.title, t.estimated_pomodoros AS estimated, t.done, t.completed_date AS completedDate,
                c.name AS categoryName, c.color AS categoryColor,
                SUM(s.type = 'focus' AND s.status = 'completed' AND s.local_date BETWEEN ? AND ?) AS spentInRange,
                SUM(s.type = 'focus' AND s.status = 'completed') AS spentTotal
         FROM tasks t
         LEFT JOIN sessions s ON s.task_id = t.id
         LEFT JOIN categories c ON c.id = t.category_id
         GROUP BY t.id
         HAVING spentInRange > 0 OR (t.done = 1 AND t.completed_date BETWEEN ? AND ?)
         ORDER BY spentInRange DESC, t.title ASC
         LIMIT 50`,
        [from, to, from, to],
      );

      // Focus attributed through each session's task to the task's current category.
      const categoryRows = await db.all<{
        categoryId: number | null;
        name: string | null;
        color: CategoryColor | null;
        focusSeconds: number;
        pomodoros: number;
      }>(
        `SELECT c.id AS categoryId, c.name, c.color,
                SUM(s.actual_seconds) AS focusSeconds,
                SUM(s.status = 'completed') AS pomodoros
         FROM sessions s
         LEFT JOIN tasks t ON t.id = s.task_id
         LEFT JOIN categories c ON c.id = t.category_id
         WHERE s.type = 'focus' AND s.local_date BETWEEN ? AND ?
         GROUP BY c.id
         HAVING SUM(s.actual_seconds) > 0
         ORDER BY focusSeconds DESC, c.sort_order ASC`,
        [from, to],
      );
      const categories: CategoryFocus[] = categoryRows.map((r) => ({
        categoryId: r.categoryId,
        name: r.name ?? "Uncategorized",
        color: r.color,
        focusSeconds: r.focusSeconds,
        pomodoros: r.pomodoros,
      }));

      const recent = await db.all<SessionRow>(`${SESSION_SELECT} ORDER BY s.started_at DESC LIMIT 40`, [from, to]);

      return {
        from,
        to,
        dailyGoal: settings.dailyGoal,
        totals: {
          focusSeconds: days.reduce((sum, d) => sum + d.focusSeconds, 0),
          pomodoros: days.reduce((sum, d) => sum + d.pomodoros, 0),
          focusAttempts: agg.focusAttempts,
          breakSeconds: agg.breakSeconds,
          skippedBreaks: agg.skippedBreaks,
          tasksCompleted: completed?.tasksCompleted ?? 0,
          activeDays: days.filter((d) => d.focusSeconds > 0).length,
          goalDays: days.filter((d) => d.pomodoros >= settings.dailyGoal).length,
        },
        days,
        hours,
        categories,
        tasks: taskRows.map((t) => ({
          ...t,
          spentInRange: t.spentInRange ?? 0,
          spentTotal: t.spentTotal ?? 0,
          done: t.done === 1,
        })),
        recent,
      };
    },

    /** Sessions in a date range, oldest first, for CSV export. */
    exportSessions(from: string, to: string): Promise<SessionRow[]> {
      return db.all<SessionRow>(`${SESSION_SELECT} ORDER BY s.started_at ASC`, [from, to]);
    },
  };
}
