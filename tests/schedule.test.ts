import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { advance, INITIAL_TIMER, previewDay, timerReducer, type TimerState } from "../lib/schedule.ts";
import { DEFAULT_SETTINGS } from "../lib/settings.ts";
import type { Settings } from "../lib/types.ts";

// Run with TZ=UTC (see package.json) so clock times below are deterministic.
const at = (hhmm: string, day = "2026-10-12") => Date.parse(`${day}T${hhmm}:00Z`);
const MIN = 60_000;
const s: Settings = { ...DEFAULT_SETTINGS }; // 25/5/15, long every 4, lunch 12:00–13:00, day 08:00–17:00

function startAt(hhmm: string, settings = s): TimerState {
  return timerReducer(INITIAL_TIMER, { type: "start", now: at(hhmm), settings });
}

describe("continuous cycle", () => {
  it("moves from focus to a short break on its own", () => {
    const state = advance(startAt("08:00"), at("08:25"), s);
    assert.equal(state.status, "running");
    assert.equal(state.phase?.type, "short_break");
    assert.equal(state.phase?.endsAt, at("08:30"));
    assert.equal(state.cycleCount, 1);
    assert.deepEqual(
      state.outbox.map((l) => [l.type, l.status, l.actualSeconds]),
      [["focus", "completed", 1500]],
    );
  });

  it("takes a long break after every 4th focus block, then resets the cycle", () => {
    // 4 × (25 + 5) − 5 = 115 min → 4th focus ends at 09:55
    const state = advance(startAt("08:00"), at("09:55"), s);
    assert.equal(state.phase?.type, "long_break");
    assert.equal(state.phase?.endsAt, at("10:10"));
    const after = advance(state, at("10:10"), s);
    assert.equal(after.phase?.type, "focus");
    assert.equal(after.cycleCount, 0);
  });

  it("catches up on every phase missed while the tab was asleep", () => {
    const state = advance(startAt("08:00"), at("09:01"), s);
    assert.equal(state.outbox.length, 4); // focus, break, focus, break
    assert.equal(state.phase?.type, "focus");
    assert.equal(state.phase?.startedAt, at("09:00"));
  });
});

describe("lunch", () => {
  it("shortens the phase that would cross lunch, then runs lunch", () => {
    const started = startAt("11:50");
    assert.equal(started.phase?.plannedMs, 10 * MIN);
    assert.equal(started.phase?.cutBy, "lunch");

    const lunch = advance(started, at("12:00"), s);
    assert.equal(lunch.phase?.type, "lunch");
    assert.equal(lunch.phase?.endsAt, at("13:00"));
  });

  it("resumes focusing after lunch and does not repeat lunch", () => {
    const state = advance(startAt("11:50"), at("13:00"), s);
    assert.equal(state.phase?.type, "focus");
    assert.equal(state.phase?.startedAt, at("13:00"));
    assert.equal(state.lunchDoneDate, "2026-10-12");
  });

  it("waits for the user after lunch when auto-resume is off", () => {
    const manual = { ...s, resumeAfterLunch: false };
    const state = advance(startAt("11:50", manual), at("13:00"), manual);
    assert.equal(state.status, "idle");
    assert.equal(state.notice, "lunch-over");
  });

  it("starts lunch straight away when started inside the lunch window", () => {
    assert.equal(startAt("12:20").phase?.type, "lunch");
  });

  it("skipping lunch lets focus run through the rest of the window", () => {
    const skipped = timerReducer(startAt("12:20"), { type: "skip", now: at("12:21"), settings: s });
    assert.equal(skipped.phase?.type, "focus");
    assert.equal(skipped.phase?.plannedMs, 25 * MIN);
  });

  it("goes to lunch if a paused focus block is resumed during lunch", () => {
    const paused = timerReducer(startAt("11:30"), { type: "pause", now: at("11:40") });
    const resumed = timerReducer(paused, { type: "resume", now: at("12:10"), settings: s });
    assert.equal(resumed.phase?.type, "lunch");
    assert.equal(resumed.outbox.at(-1)?.status, "stopped");
    assert.equal(resumed.outbox.at(-1)?.actualSeconds, 600);
  });
});

describe("end of day", () => {
  it("clips the last phase and stops at the end of the workday", () => {
    const started = startAt("16:50");
    assert.equal(started.phase?.plannedMs, 10 * MIN);
    const state = advance(started, at("17:00"), s);
    assert.equal(state.status, "idle");
    assert.equal(state.notice, "day-done");
  });

  it("never rolls a cycle over midnight", () => {
    const allDay = { ...s, stopAtDayEnd: false, lunchEnabled: false };
    const state = advance(startAt("23:50", allDay), at("00:30", "2026-10-13"), allDay);
    assert.equal(state.status, "idle");
  });
});

describe("pause, restart, stop", () => {
  it("pausing freezes the remaining time", () => {
    const paused = timerReducer(startAt("08:00"), { type: "pause", now: at("08:10") });
    const resumed = timerReducer(paused, { type: "resume", now: at("08:30"), settings: s });
    assert.equal(resumed.phase?.endsAt, at("08:45"));
    assert.equal(advance(resumed, at("08:44"), s).phase?.type, "focus");
  });

  it("does not record phases abandoned in under a minute", () => {
    const stopped = timerReducer(startAt("08:00"), { type: "stop", now: at("08:00") + 30_000 });
    assert.equal(stopped.status, "idle");
    assert.equal(stopped.outbox.length, 0);
  });

  it("records a stopped focus block with the time actually spent", () => {
    const stopped = timerReducer(startAt("08:00"), { type: "stop", now: at("08:12") });
    assert.deepEqual(
      stopped.outbox.map((l) => [l.status, l.actualSeconds]),
      [["stopped", 720]],
    );
  });

  it("links focus sessions to the active task", () => {
    const withTask = timerReducer(startAt("08:00"), { type: "setTask", taskId: 7 });
    const state = advance(withTask, at("08:25"), s);
    assert.equal(state.outbox[0].taskId, 7);
  });
});

describe("day preview", () => {
  it("counts focus blocks before and after lunch with the defaults", () => {
    const p = previewDay(s, at("06:00"));
    // 08:00–12:00: 7 full blocks + a 15-min block clipped by lunch.
    assert.equal(p.focusBeforeLunch, 8);
    assert.equal(p.lunchAt, at("12:00"));
    assert.ok(p.focusAfterLunch >= 7);
  });
});
