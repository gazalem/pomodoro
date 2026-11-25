/**
 * Builds a demo database with ~6 weeks of made-up focus and workout history,
 * ending at a given day (default: today, up to the current time). Restore it in
 * the app with Settings → Restore from backup….
 *
 *   node --import ./tests/register.mjs scripts/make-demo-db.ts [out.sqlite3] [YYYY-MM-DD]
 *
 * Runs in local time on purpose: report days and hours follow this machine's timezone.
 */
import { existsSync, rmSync } from "node:fs";
import { migrate } from "../lib/db/migrations.ts";
import { createRepo } from "../lib/repo.ts";
import { localDate } from "../lib/schedule.ts";
import { DEFAULT_SETTINGS } from "../lib/settings.ts";
import type { Exercise } from "../lib/types.ts";
import { nodeDriver } from "../tests/node-driver.ts";

const out = process.argv[2] ?? "demo/pomodoro-demo.sqlite3";
const endDate = process.argv[3] ?? localDate(Date.now());
const DAYS = 42;
const MIN = 60_000;

// Seeded so every run with the same end date gives the same data.
let seed = 42;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
const chance = (p: number) => rand() < p;

const at = (date: string, h: number, m = 0) => {
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(y, mo - 1, d, h, m).getTime();
};
const now = endDate === localDate(Date.now()) ? Date.now() : at(endDate, 23, 59);
const dayList = Array.from({ length: DAYS }, (_, i) => localDate(at(endDate, 12) - (DAYS - 1 - i) * 24 * 60 * MIN));

if (existsSync(out)) rmSync(out);
const db = nodeDriver(out);
await migrate(db);
const repo = createRepo(db);
await repo.saveSettings({ ...DEFAULT_SETTINGS, workoutFlow: "circuit", roundRestSeconds: 60 });

// ---------------------------------------------------------------------------
// Tasks: [title, category, estimate, first day index, pomodoros it gets, still open at the end?]
// Open tasks stop being picked once they reach their pomodoros, so they stay under estimate.

const categories = new Map((await repo.listCategories()).map((c) => [c.name, c.id]));
const TASKS: [string, string | null, number, number, number, boolean?][] = [
  // Week 1
  ["Quarterly report", "Work", 8, 0, 10],
  ["Algorithms homework 5", "Assignments", 4, 0, 5],
  ["Pomodoro app: exercise mode", "Development", 10, 1, 12],
  ["Code review backlog", "Work", 4, 2, 3],
  ["Database design essay", "Assignments", 6, 3, 7],
  ["Plan weekend trip", "Personal", 1, 4, 1],
  // Week 2
  ["Refactor auth module", "Development", 6, 7, 7],
  ["Inbox zero", null, 1, 8, 1],
  ["Sprint planning prep", "Work", 2, 9, 2],
  ["Statistics problem set", "Assignments", 3, 9, 4],
  ["Thesis outline", "Assignments", 8, 10, 9],
  ["Onboarding docs", "Work", 5, 11, 6],
  ["Research paper sources", "Assignments", 6, 12, 6],
  ["Budget review", "Personal", 2, 12, 2],
  // Week 3
  ["API pagination", "Development", 8, 14, 9],
  ["Midterm study: databases", "Assignments", 10, 14, 12],
  ["Customer survey analysis", "Work", 5, 15, 5],
  ["Learn Spanish: lesson 11", "Personal", 2, 16, 2],
  ["Workshop prep", "Work", 4, 17, 4],
  ["Lab report 3", "Assignments", 4, 18, 3],
  ["Expense report", "Work", 2, 19, 2],
  // Week 4
  ["Write unit tests", "Development", 4, 21, 5],
  ["Database migration script", "Development", 8, 21, 9],
  ["Read chapter 7: Networks", "Assignments", 2, 22, 2],
  ["Team retrospective notes", "Work", 1, 23, 1],
  ["Dark mode polish", "Development", 6, 24, 5],
  ["Group project: ER diagram", "Assignments", 6, 24, 7],
  ["Bug triage", "Work", 3, 25, 3],
  ["Read chapter 8: Security", "Assignments", 2, 26, 2],
  // Week 5
  ["Learn Spanish: lesson 12", "Personal", 2, 28, 3],
  ["Client follow-up emails", "Work", 1, 29, 1],
  ["Fix iOS restore bug", "Development", 2, 30, 2],
  ["Load testing", "Development", 6, 30, 7],
  ["Performance self-assessment", "Work", 4, 31, 4],
  ["Algorithms homework 6", "Assignments", 4, 32, 5],
  ["Budget forecast", "Work", 5, 33, 6],
  ["Presentation rehearsal", "Assignments", 3, 33, 3],
  // Week 6: the last few are still in progress
  ["Prepare demo slides", "Work", 4, 35, 5],
  ["Thesis literature review", "Assignments", 12, 36, 10, true],
  ["Side project: habit tracker", "Development", 10, 37, 8, true],
  ["Final project proposal", "Assignments", 8, 38, 7, true],
  ["Quarterly planning deck", "Work", 6, 39, 5, true],
  ["Reply to recruiter", "Personal", 1, DAYS - 1, 1],
  ["Update README", "Development", 1, DAYS - 1, 1],
];

interface DemoTask { id: number; start: number; needs: number; open: boolean; spent: number; done: boolean }
const tasks: DemoTask[] = [];
for (const [title, category, estimate, start, needs, open = false] of TASKS) {
  const task = await repo.createTask({ title, estimatedPomodoros: estimate, categoryId: category ? categories.get(category) : null });
  if (!task) throw new Error(`Couldn't create ${title}`);
  await db.run("UPDATE tasks SET created_at = ? WHERE id = ?", [at(dayList[start], 7, 50), task.id]);
  tasks.push({ id: task.id, start, needs, open, spent: 0, done: false });
}

// ---------------------------------------------------------------------------
// Focus sessions

const sessions: object[] = [];
const log = (type: string, status: string, taskId: number | null, planned: number, actualMs: number, start: number) => {
  const end = start + actualMs;
  sessions.push({
    clientId: `demo-s${sessions.length}`,
    type,
    status,
    taskId,
    plannedSeconds: planned,
    actualSeconds: Math.round(actualMs / 1000),
    startedAt: start,
    endedAt: end,
    localDate: localDate(start),
    localHour: new Date(start).getHours(),
  });
  return end;
};

for (const [i, date] of dayList.entries()) {
  const weekday = new Date(at(date, 12)).getDay();
  const weekend = weekday === 0 || weekday === 6;
  if (weekend && chance(0.5)) continue;
  let goal = weekend ? between(1, 4) : between(4, 11);
  if (i === DAYS - 1) goal = 11; // today: as many as fit before now
  let t = weekend ? at(date, 10, between(0, 30)) : at(date, 8, between(0, 40));
  let completed = 0;
  let hadLunch = false;

  while (completed < goal) {
    if (!hadLunch && t >= at(date, 11, 50)) {
      t = Math.max(t, at(date, 12));
      if (t + 60 * MIN > now) break;
      t = log("lunch", "completed", null, 3600, 60 * MIN, t);
      hadLunch = true;
      continue;
    }
    if (t + 25 * MIN > Math.min(now, at(date, 17))) break;

    const open = tasks.filter((x) => x.start <= i && !x.done && x.spent < x.needs);
    // A task added today gets the first pomodoro; otherwise any open task, and sometimes none.
    const task = open.find((x) => x.start === i && x.spent === 0) ?? (open.length > 0 && !chance(0.06) ? open[Math.floor(rand() * open.length)] : null);
    if (chance(0.1)) {
      t = log("focus", "stopped", task?.id ?? null, 1500, between(4, 20) * MIN, t) + between(2, 6) * MIN;
      continue;
    }
    t = log("focus", "completed", task?.id ?? null, 1500, 25 * MIN, t);
    completed++;
    if (task && ++task.spent >= task.needs && !task.open) {
      task.done = true;
      await db.run("UPDATE tasks SET done = 1, completed_at = ?, completed_date = ? WHERE id = ?", [t, localDate(t), task.id]);
    }
    const long = completed % 4 === 0;
    const planned = long ? 900 : 300;
    if (t + planned * 1000 > now) break;
    t = chance(0.15)
      ? log(long ? "long_break" : "short_break", "skipped", null, planned, between(0, 40) * 1000, t)
      : log(long ? "long_break" : "short_break", "completed", null, planned, planned * 1000, t);
  }
}
await repo.insertSessions(sessions);

// ---------------------------------------------------------------------------
// Exercises (left open so a workout can be started in the demo) and circuit workouts

const EXERCISES = [
  { title: "Push-ups", mode: "reps" as const, reps: 15 },
  { title: "Squats", mode: "reps" as const, reps: 20 },
  { title: "Mountain Climbers", mode: "time" as const, durationSeconds: 30 },
  { title: "Plank", mode: "time" as const, durationSeconds: 45 },
  { title: "Jumping Jacks", mode: "time" as const, durationSeconds: 30 },
];
const exercises: Exercise[] = [];
for (const e of EXERCISES) {
  const created = await repo.createExercise({ ...e, sets: 3 });
  if (!created) throw new Error(`Couldn't create ${e.title}`);
  exercises.push(created);
}

const logs: object[] = [];
const exLog = (kind: "set" | "rest", status: string, ex: Exercise, round: number, planned: number | null, actualS: number, start: number, last = false) => {
  logs.push({
    clientId: `demo-e${logs.length}`,
    kind,
    status,
    exerciseId: ex.id,
    exerciseTitle: ex.title,
    setNumber: kind === "set" ? round : null,
    reps: kind === "set" && ex.mode === "reps" && status === "completed" ? ex.reps : null,
    plannedSeconds: planned,
    actualSeconds: actualS,
    completesExercise: last,
    startedAt: start,
    endedAt: start + actualS * 1000,
    localDate: localDate(start),
    localHour: new Date(start).getHours(),
  });
  return start + actualS * 1000;
};

for (const [i, date] of dayList.entries()) {
  const weekday = new Date(at(date, 12)).getDay();
  if (i !== DAYS - 1 && !chance([1, 3, 5, 6].includes(weekday) ? 0.8 : 0.25)) continue;
  let t = at(date, 6, between(30, 59));
  const rounds = chance(0.12) ? between(1, 2) : 3; // sometimes cut short
  workout: for (let round = 1; round <= 3; round++) {
    for (const [k, ex] of exercises.entries()) {
      if (round > rounds) {
        exLog("set", "stopped", ex, round, ex.mode === "time" ? ex.durationSeconds ?? 45 : null, between(5, 15), t);
        break workout;
      }
      const planned = ex.mode === "time" ? (ex.durationSeconds ?? 45) : null;
      const skipped = chance(0.05);
      const seconds = skipped ? between(3, 10) : (planned ?? between(30, 55));
      t = exLog("set", skipped ? "skipped" : "completed", ex, round, planned, seconds, t, round === 3 && !skipped);
      const lastOfRound = k === exercises.length - 1;
      if (round === 3 && lastOfRound) break;
      const rest = lastOfRound ? 60 : 15;
      const next = lastOfRound ? exercises[0] : exercises[k + 1];
      t = exLog("rest", "completed", next, lastOfRound ? round + 1 : round, rest, rest, t);
    }
  }
}
await repo.insertExerciseLogs(logs);

// ---------------------------------------------------------------------------
// Every generated row must have landed (inserts silently skip invalid rows).

const count = async (table: string) => (await db.all<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))[0].n;
const [s, e] = [await count("sessions"), await count("exercise_logs")];
if (s !== sessions.length || e !== logs.length) throw new Error(`Inserted ${s}/${sessions.length} sessions, ${e}/${logs.length} exercise logs`);
const done = tasks.filter((x) => x.done).length;
console.log(`${out}: ${dayList[0]} → ${endDate} · ${s} sessions · ${tasks.length} tasks (${done} done) · ${e} exercise logs`);
