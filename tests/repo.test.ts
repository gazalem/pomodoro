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
