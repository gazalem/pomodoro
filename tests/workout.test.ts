import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { advance, INITIAL_WORKOUT, workoutReducer, type WorkoutState } from "../lib/workout.ts";
import type { Exercise, Settings } from "../lib/types.ts";

const T0 = Date.parse("2026-11-09T09:00:00Z");
const sec = (n: number) => T0 + n * 1000;
const timing: Pick<Settings, "exerciseSeconds" | "restSeconds" | "workoutFlow" | "roundRestSeconds"> = { exerciseSeconds: 45, restSeconds: 15, workoutFlow: "straight", roundRestSeconds: 60 };

function ex(id: number, title: string, sets: number, mode: "reps" | "time", extra: Partial<Exercise> = {}): Exercise {
  return {
    id,
    title,
    sets,
    mode,
    reps: mode === "reps" ? 10 : null,
    durationSeconds: null,
    done: false,
    createdAt: 0,
    completedAt: null,
    ...extra,
  };
}

const plank = ex(1, "Plank", 2, "time", { durationSeconds: 30 });
const pushups = ex(2, "Push-ups", 2, "reps", { reps: 15 });
const squats = ex(3, "Squats", 1, "time"); // uses the 45s default
const list = [plank, pushups, squats];

const start = (l = list, s = timing): WorkoutState =>
  workoutReducer(INITIAL_WORKOUT, { type: "start", now: T0, list: l, settings: s });

const shape = (state: WorkoutState) =>
  state.phase ? `${state.phase.kind}:${state.phase.exerciseTitle}#${state.phase.setNumber}` : state.status;

describe("timed sets", () => {
  it("runs set → rest → set on its own, using the exercise's own duration", () => {
    const s0 = start();
    assert.equal(shape(s0), "set:Plank#1");
    assert.equal(s0.phase?.endsAt, sec(30));
    const s1 = advance(s0, sec(30), list, timing);
    assert.equal(shape(s1), "rest:Plank#2"); // rest announces the next set
    assert.equal(s1.phase?.endsAt, sec(45));
    assert.equal(shape(advance(s1, sec(45), list, timing)), "set:Plank#2");
  });

  it("uses the default exercise time when the exercise has none", () => {
    const s = start([squats]);
    assert.equal(s.phase?.plannedMs, 45_000);
  });

  it("skips rest entirely when rest time is 0", () => {
    const noRest = { ...timing, restSeconds: 0 };
    assert.equal(shape(advance(start(list, noRest), sec(30), list, noRest)), "set:Plank#2");
  });
});

describe("repetition sets", () => {
  it("wait for Done, then rest, then the next set", () => {
    // Plank 2 sets (60s) + 2 rests (30s) → Push-ups set 1 at 90s.
    const atPushups = advance(start(), sec(90), list, timing);
    assert.equal(shape(atPushups), "set:Push-ups#1");
    assert.equal(atPushups.phase?.endsAt, null);
    // Time passing doesn't end a reps set.
    assert.equal(shape(advance(atPushups, sec(400), list, timing)), "set:Push-ups#1");
    const done = workoutReducer(atPushups, { type: "finish", now: sec(120), list, settings: timing });
    assert.equal(shape(done), "rest:Push-ups#2");
    assert.equal(done.outbox.at(-1)?.reps, 15);
    assert.equal(done.outbox.at(-1)?.actualSeconds, 30);
  });
});

describe("moving through the list", () => {
  it("flags the last set, moves to the next exercise and finishes after the last one", () => {
    let s = advance(start(), sec(90), list, timing); // Push-ups #1
    s = workoutReducer(s, { type: "finish", now: sec(100), list, settings: timing });
    s = advance(s, sec(115), list, timing); // Push-ups #2
    s = workoutReducer(s, { type: "finish", now: sec(125), list, settings: timing });
    assert.equal(shape(s), "rest:Squats#1");
    assert.equal(s.outbox.filter((l) => l.completesExercise).map((l) => l.exerciseTitle).join(), "Plank,Push-ups");

    s = advance(s, sec(140 + 45), list, timing); // rest, then 45s squats
    assert.equal(s.status, "finished");
    assert.equal(s.phase, null);
    const sets = s.outbox.filter((l) => l.kind === "set" && l.status === "completed");
    assert.equal(sets.length, 5);
    assert.equal(s.outbox.at(-1)?.completesExercise, true);
  });

  it("continues with the remaining list when the current exercise was checked off meanwhile", () => {
    const s = start();
    const without = [pushups, squats]; // Plank marked done elsewhere
    assert.equal(shape(advance(s, sec(30), without, timing)), "rest:Push-ups#1");
  });

  it("can start from a chosen exercise", () => {
    const s = workoutReducer(INITIAL_WORKOUT, { type: "start", now: T0, list, settings: timing, exerciseId: 3 });
    assert.equal(shape(s), "set:Squats#1");
  });
});

describe("controls", () => {
  it("pause freezes a timed set", () => {
    const paused = workoutReducer(start(), { type: "pause", now: sec(10) });
    const resumed = workoutReducer(paused, { type: "resume", now: sec(100) });
    assert.equal(resumed.phase?.endsAt, sec(120));
  });

  it("skip records the set as skipped and does not complete the exercise", () => {
    let s = start([squats]);
    s = workoutReducer(s, { type: "skip", now: sec(5), list: [squats], settings: timing });
    assert.equal(s.status, "finished");
    assert.deepEqual([s.outbox[0].status, s.outbox[0].completesExercise], ["skipped", false]);
  });

  it("stop ends the workout and drops very short attempts", () => {
    const quick = workoutReducer(start(), { type: "stop", now: sec(2) });
    assert.deepEqual([quick.status, quick.outbox.length], ["idle", 0]);
    const longer = workoutReducer(start(), { type: "stop", now: sec(20) });
    assert.deepEqual([longer.outbox[0].status, longer.outbox[0].actualSeconds], ["stopped", 20]);
  });

  it("does not invent sets after the app was closed for a long time", () => {
    const s = advance(start(), sec(30 + 10 * 60), list, timing);
    assert.equal(s.status, "idle");
    assert.equal(s.outbox[0].status, "stopped");
  });
});

describe("circuit", () => {
  const circuit = { ...timing, workoutFlow: "circuit" as const };
  const a = ex(1, "A", 2, "time", { durationSeconds: 30 });
  const b = ex(2, "B", 2, "time", { durationSeconds: 30 });
  const c = ex(3, "C", 1, "time", { durationSeconds: 30 });
  const l = [a, b, c];

  it("runs one set of each exercise per round, with a long rest between rounds", () => {
    let s = start(l, circuit);
    const seen: string[] = [];
    for (let i = 0; i < 20 && s.phase; i++) {
      seen.push(`${shape(s)}/${(s.phase.plannedMs ?? 0) / 1000}`);
      s = advance(s, s.phase.endsAt!, l, circuit);
    }
    assert.deepEqual(seen, [
      "set:A#1/30", "rest:B#1/15", "set:B#1/30", "rest:C#1/15", "set:C#1/30",
      "rest:A#2/60", "set:A#2/30", "rest:B#2/15", "set:B#2/30", // C has only 1 set
    ]);
    assert.equal(s.status, "finished");
    assert.equal(s.outbox.filter((x) => x.completesExercise).map((x) => x.exerciseTitle).join(), "C,A,B");
  });

  it("uses the short rest between rounds when round rest is 0", () => {
    const s = { ...circuit, roundRestSeconds: 0 };
    const atRound2 = advance(start(l, s), sec(30 + 15 + 30 + 15 + 30), l, s);
    assert.equal(shape(atRound2), "rest:A#2");
    assert.equal(atRound2.phase?.plannedMs, 15_000);
  });
});
