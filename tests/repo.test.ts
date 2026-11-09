import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { migrate } from "../lib/db/migrations.ts";
import { createRepo, type Repo } from "../lib/repo.ts";
import { DEFAULT_SETTINGS } from "../lib/settings.ts";
import type { SessionLog } from "../lib/types.ts";
import { nodeDriver } from "./node-driver.ts";

let repo: Repo;

beforeEach(async () => {
  const db = nodeDriver();
  await migrate(db);
  await migrate(db); // idempotent
  repo = createRepo(db);
});

let seq = 0;
function log(overrides: Partial<SessionLog> = {}): SessionLog {
  seq += 1;
  return {
    clientId: `c${seq}`,
    type: "focus",
    status: "completed",
    taskId: null,
    plannedSeconds: 1500,
    actualSeconds: 1500,
    startedAt: 1_000_000 + seq,
    endedAt: 1_001_500 + seq,
    localDate: "2026-10-12",
    localHour: 9,
    ...overrides,
  };
}

describe("settings", () => {
  it("defaults until saved, then round-trips normalized values", async () => {
    assert.deepEqual(await repo.getSettings(), DEFAULT_SETTINGS);
    await repo.saveSettings({ ...DEFAULT_SETTINGS, focusMinutes: 50, lunchStart: "nope" });
    const saved = await repo.getSettings();
    assert.equal(saved.focusMinutes, 50);
    assert.equal(saved.lunchStart, DEFAULT_SETTINGS.lunchStart);
  });
});

describe("tasks", () => {
  it("creates, completes and lists tasks", async () => {
    const task = await repo.createTask({ title: "  Write report  ", estimatedPomodoros: 3 });
    assert.equal(task?.title, "Write report");
    assert.equal(await repo.createTask({ title: "   " }), null);

    const done = await repo.updateTask(task!.id, { done: true }, "2026-10-12");
    assert.equal(done?.done, true);
    assert.equal((await repo.listTasks(0)).length, 1);
    assert.equal((await repo.listTasks(Date.now() + 60_000)).length, 0); // completed before `since`
  });

  it("edits a task's title and estimate, rejecting invalid values", async () => {
    const task = (await repo.createTask({ title: "Draft", estimatedPomodoros: 2 }))!;
    const edited = await repo.updateTask(task.id, { title: "  Final draft  ", estimatedPomodoros: 4 }, "2026-10-12");
    assert.equal(edited?.title, "Final draft");
    assert.equal(edited?.estimatedPomodoros, 4);

    assert.equal(await repo.updateTask(task.id, { title: "   " }, "2026-10-12"), null);
    assert.equal(await repo.updateTask(task.id, { estimatedPomodoros: 0 }, "2026-10-12"), null);
    const [unchanged] = await repo.listTasks(0);
    assert.deepEqual([unchanged.title, unchanged.estimatedPomodoros], ["Final draft", 4]);
  });

  it("keeps the user's order for open tasks; new tasks go last", async () => {
    const a = (await repo.createTask({ title: "A" }))!;
    const b = (await repo.createTask({ title: "B" }))!;
    const c = (await repo.createTask({ title: "C" }))!;
    await repo.reorderTasks([c.id, a.id, b.id]);
    await repo.createTask({ title: "D" });
    assert.deepEqual((await repo.listTasks(0)).map((t) => t.title), ["C", "A", "B", "D"]);

    // Completed tasks drop below the open ones; reopening restores their slot.
    await repo.updateTask(c.id, { done: true }, "2026-10-12");
    assert.deepEqual((await repo.listTasks(0)).map((t) => t.title), ["A", "B", "D", "C"]);
    await repo.updateTask(c.id, { done: false }, "2026-10-12");
    assert.equal((await repo.listTasks(0))[0].title, "C");
  });

  it("counts completed focus sessions toward a task", async () => {
    const task = (await repo.createTask({ title: "Review" }))!;
    await repo.insertSessions([log({ taskId: task.id }), log({ taskId: task.id, status: "stopped" })]);
    const [listed] = await repo.listTasks(0);
    assert.equal(listed.spentPomodoros, 1);
  });

  it("keeps sessions when a task is deleted", async () => {
    const task = (await repo.createTask({ title: "Temp" }))!;
    await repo.insertSessions([log({ taskId: task.id })]);
    assert.equal(await repo.deleteTask(task.id), true);
    assert.equal((await repo.getDayStats("2026-10-12")).pomodoros, 1);
  });
});

describe("sessions", () => {
  it("is idempotent on clientId and drops invalid entries", async () => {
    const a = log();
    const accepted = await repo.insertSessions([a, a, { ...log(), type: "nap" }, log({ taskId: 999 })]);
    assert.equal(accepted.length, 3);
    const stats = await repo.getDayStats("2026-10-12");
    assert.equal(stats.pomodoros, 2); // duplicate ignored, invalid dropped, unknown task kept unlinked
    assert.equal(stats.focusSeconds, 3000);
  });
});

describe("report", () => {
  it("aggregates days, hours, tasks and totals", async () => {
    const task = (await repo.createTask({ title: "Ship", estimatedPomodoros: 2 }))!;
    await repo.updateTask(task.id, { done: true }, "2026-10-12");
    await repo.insertSessions([
      log({ taskId: task.id, localDate: "2026-10-11", localHour: 9 }),
      log({ taskId: task.id, localDate: "2026-10-12", localHour: 14 }),
      log({ status: "stopped", actualSeconds: 600, localDate: "2026-10-12" }),
      log({ type: "short_break", plannedSeconds: 300, actualSeconds: 300 }),
      log({ type: "short_break", status: "skipped", plannedSeconds: 300, actualSeconds: 10 }),
      log({ localDate: "2026-09-01" }), // outside the range
    ]);

    const r = await repo.getReport("2026-10-10", "2026-10-12");
    assert.deepEqual(r.days.map((d) => [d.date, d.pomodoros]), [
      ["2026-10-10", 0],
      ["2026-10-11", 1],
      ["2026-10-12", 1],
    ]);
    assert.equal(r.totals.pomodoros, 2);
    assert.equal(r.totals.focusAttempts, 3);
    assert.equal(r.totals.focusSeconds, 3600);
    assert.equal(r.totals.breakSeconds, 310);
    assert.equal(r.totals.skippedBreaks, 1);
    assert.equal(r.totals.tasksCompleted, 1);
    assert.equal(r.totals.activeDays, 2);
    assert.equal(r.hours[9].pomodoros, 1);
    assert.equal(r.hours[14].pomodoros, 1);
    assert.deepEqual(
      r.tasks.map((t) => [t.title, t.spentInRange, t.spentTotal, t.done]),
      [["Ship", 2, 2, true]],
    );
    assert.equal((await repo.exportSessions("2026-10-10", "2026-10-12")).length, 5);
  });
});

describe("categories", () => {
  it("starts with Personal, Work, Assignments and Development", async () => {
    assert.deepEqual(
      (await repo.listCategories()).map((c) => [c.name, c.color]),
      [
        ["Personal", "blue"],
        ["Work", "orange"],
        ["Assignments", "aqua"],
        ["Development", "yellow"],
      ],
    );
  });

  it("gives new categories the next free color and rejects duplicates and blanks", async () => {
    const reading = await repo.createCategory({ name: "  Reading   list " });
    assert.deepEqual([reading.name, reading.color], ["Reading list", "magenta"]);
    await assert.rejects(repo.createCategory({ name: "work" }), /already a "work"/);
    await assert.rejects(repo.createCategory({ name: "  " }), /name/);

    // A deleted category's color becomes available again, in palette order.
    const work = (await repo.listCategories()).find((c) => c.name === "Work")!;
    await repo.deleteCategory(work.id);
    assert.equal((await repo.createCategory({ name: "Job" })).color, "orange");
  });

  it("caps categories at one per palette color", async () => {
    for (const name of ["E", "F", "G", "H"]) await repo.createCategory({ name });
    await assert.rejects(repo.createCategory({ name: "Ninth" }), /up to 8/);
  });

  it("renames and recolors, refusing a name another category uses", async () => {
    const [personal, work] = await repo.listCategories();
    assert.equal((await repo.updateCategory(personal.id, { name: "Home", color: "green" }))?.color, "green");
    await assert.rejects(repo.updateCategory(personal.id, { name: "WORK" }), /already/);
    assert.equal(await repo.updateCategory(work.id, { color: "chartreuse" }), null);
  });

  it("assigns tasks to categories; deleting a category keeps its tasks", async () => {
    const [personal, work] = await repo.listCategories();
    const task = (await repo.createTask({ title: "Gym", categoryId: personal.id }))!;
    assert.equal(task.categoryId, personal.id);
    assert.equal((await repo.createTask({ title: "Ghost", categoryId: 999 }))!.categoryId, null);

    assert.equal((await repo.updateTask(task.id, { categoryId: work.id }, "2026-10-12"))!.categoryId, work.id);
    assert.equal((await repo.updateTask(task.id, { categoryId: null }, "2026-10-12"))!.categoryId, null);

    await repo.updateTask(task.id, { categoryId: work.id }, "2026-10-12");
    await repo.deleteCategory(work.id);
    const [kept] = (await repo.listTasks(0)).filter((t) => t.title === "Gym");
    assert.equal(kept.categoryId, null);
  });

  it("reports focus time per category, largest first, with uncategorized focus", async () => {
    const [personal, work] = await repo.listCategories();
    const gym = (await repo.createTask({ title: "Gym", categoryId: personal.id }))!;
    const ticket = (await repo.createTask({ title: "Ticket", categoryId: work.id }))!;
    await repo.insertSessions([
      log({ taskId: ticket.id }),
      log({ taskId: ticket.id }),
      log({ taskId: gym.id, status: "stopped", actualSeconds: 600 }),
      log({ taskId: null }),
    ]);
    const r = await repo.getReport("2026-10-12", "2026-10-12");
    assert.deepEqual(
      r.categories.map((c) => [c.name, c.color, c.focusSeconds, c.pomodoros]),
      [
        ["Work", "orange", 3000, 2],
        ["Uncategorized", null, 1500, 1],
        ["Personal", "blue", 600, 0],
      ],
    );
    assert.equal(r.tasks.find((t) => t.title === "Ticket")?.categoryName, "Work");
  });
});

describe("exercises", () => {
  it("creates reps and time exercises with sensible defaults", async () => {
    const pushups = (await repo.createExercise({ title: "Push-ups", sets: 3, mode: "reps", reps: 15 }))!;
    assert.deepEqual([pushups.mode, pushups.sets, pushups.reps, pushups.durationSeconds], ["reps", 3, 15, null]);
    const plank = (await repo.createExercise({ title: "Plank", mode: "time" }))!;
    assert.deepEqual([plank.sets, plank.reps, plank.durationSeconds], [3, null, null]);
    assert.equal(await repo.createExercise({ title: "Bad", mode: "jog" }), null);
    assert.equal(await repo.createExercise({ title: " ", mode: "reps" }), null);
  });

  it("switching mode clears the other mode's value", async () => {
    const e = (await repo.createExercise({ title: "Burpees", mode: "reps", reps: 12 }))!;
    const timed = (await repo.updateExercise(e.id, { mode: "time", durationSeconds: 40 }))!;
    assert.deepEqual([timed.mode, timed.reps, timed.durationSeconds], ["time", null, 40]);
    const back = (await repo.updateExercise(e.id, { mode: "reps" }))!;
    assert.deepEqual([back.mode, back.reps, back.durationSeconds], ["reps", 10, null]);
    assert.equal(await repo.updateExercise(e.id, { sets: 0 }), null);
  });

  it("orders, completes and resets exercises", async () => {
    const a = (await repo.createExercise({ title: "A", mode: "reps" }))!;
    const b = (await repo.createExercise({ title: "B", mode: "reps" }))!;
    await repo.reorderExercises([b.id, a.id]);
    await repo.updateExercise(b.id, { done: true });
    assert.deepEqual((await repo.listExercises()).map((e) => [e.title, e.done]), [["A", false], ["B", true]]);
    assert.equal(await repo.resetExercises(), 1);
    assert.deepEqual((await repo.listExercises()).map((e) => e.title), ["B", "A"]);
  });

  it("logs sets idempotently and reports workout totals", async () => {
    const e = (await repo.createExercise({ title: "Push-ups", sets: 2, mode: "reps", reps: 15 }))!;
    const base = {
      kind: "set" as const,
      status: "completed" as const,
      exerciseId: e.id,
      exerciseTitle: "Push-ups",
      reps: 15,
      plannedSeconds: null,
      completesExercise: false,
      startedAt: 1,
      endedAt: 31,
      localDate: "2026-11-09",
      localHour: 9,
    };
    const logs = [
      { ...base, clientId: "s1", setNumber: 1, actualSeconds: 30 },
      { ...base, clientId: "r1", kind: "rest" as const, setNumber: null, reps: null, plannedSeconds: 15, actualSeconds: 15 },
      { ...base, clientId: "s2", setNumber: 2, actualSeconds: 25, completesExercise: true },
      { ...base, clientId: "bad", kind: "nap" },
    ];
    assert.equal((await repo.insertExerciseLogs(logs)).length, 3);
    await repo.insertExerciseLogs(logs); // retry is harmless

    const r = await repo.getExerciseReport("2026-11-08", "2026-11-09");
    assert.deepEqual(r.totals, { activeSeconds: 55, restSeconds: 15, sets: 2, reps: 30, exercisesCompleted: 1, activeDays: 1 });
    assert.deepEqual(r.days.map((d) => [d.date, d.sets]), [["2026-11-08", 0], ["2026-11-09", 2]]);
    // node:sqlite rows have a null prototype; compare their values.
    assert.deepEqual(r.exercises.map((x) => ({ ...x })), [{ title: "Push-ups", sets: 2, reps: 30, activeSeconds: 55 }]);
    assert.deepEqual({ ...(await repo.getExerciseDayStats("2026-11-09")) }, { sets: 2, activeSeconds: 55 });

    // Deleting the exercise keeps its history under the saved title.
    await repo.deleteExercise(e.id);
    assert.equal((await repo.getExerciseReport("2026-11-09", "2026-11-09")).exercises[0].title, "Push-ups");
  });
});
