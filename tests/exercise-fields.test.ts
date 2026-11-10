import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fieldsFrom, toInput } from "../lib/exercise-fields.ts";

describe("exercise form fields", () => {
  it("follows the exercise-time setting after it changes", () => {
    // Form opened while the setting was 45s; the user then saves 60s and adds a timed exercise.
    const fields = { ...fieldsFrom(null), title: "Plank", mode: "time" as const };
    assert.equal(toInput(fields, 60).durationSeconds, null); // follows the setting
  });

  it("keeps a time the user picked", () => {
    const fields = { ...fieldsFrom(null), title: "Plank", mode: "time" as const, seconds: 30 };
    assert.equal(toInput(fields, 60).durationSeconds, 30);
  });
});
