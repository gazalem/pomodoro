"use client";

import { useState, type FormEvent } from "react";
import type { AppDatabase } from "@/lib/db/browser";
import type { Settings } from "@/lib/types";
import { formatSeconds, NumberStepper } from "./exercise-panel";
import { DataSection, Group, Toggle } from "./settings-form";

interface ExerciseSettingsFormProps {
  db: AppDatabase;
  settings: Settings;
  onSave: (settings: Settings) => Promise<boolean>;
  onCancel: () => void;
}

/** Exercise-mode settings: default set length, rest length, sounds and screen. */
export function ExerciseSettingsForm({ db, settings, onSave, onCancel }: ExerciseSettingsFormProps) {
  const [draft, setDraft] = useState({
    exerciseSeconds: settings.exerciseSeconds,
    restSeconds: settings.restSeconds,
    workoutFlow: settings.workoutFlow,
    roundRestSeconds: settings.roundRestSeconds,
    chime: settings.chime,
    keepScreenAwake: settings.keepScreenAwake,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => setDraft((d) => ({ ...d, [key]: value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const ok = await onSave({ ...settings, ...draft });
    setSaving(false);
    if (!ok) setError("Couldn't save your settings. Try again.");
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6 pb-2">
      <Group title="Workout">
        <Toggle
          label="Circuit"
          hint="One set of each exercise per round, then a round rest. Off: all sets of one exercise, then the next."
          checked={draft.workoutFlow === "circuit"}
          onChange={(v) => set("workoutFlow", v ? "circuit" : "straight")}
        />
      </Group>

      <Group title="Timing">
        <div className="flex items-center justify-between gap-4 py-2.5">
          <span>
            Exercise time
            <span className="block text-xs text-ink-soft">Each timed set, unless the exercise sets its own</span>
          </span>
          <NumberStepper label="Seconds" ariaLabel="Exercise time in seconds" value={draft.exerciseSeconds} min={5} max={3600} step={5} onChange={(v) => set("exerciseSeconds", v)} />
        </div>
        <div className="flex items-center justify-between gap-4 py-2.5">
          <span>
            Rest time
            <span className="block text-xs text-ink-soft">Between sets and exercises; 0 for none</span>
          </span>
          <NumberStepper label="Seconds" ariaLabel="Rest time in seconds" value={draft.restSeconds} min={0} max={1800} step={5} onChange={(v) => set("restSeconds", v)} />
        </div>
        {draft.workoutFlow === "circuit" && (
          <div className="flex items-center justify-between gap-4 py-2.5">
            <span>
              Round rest
              <span className="block text-xs text-ink-soft">After the last exercise, before the next round; 0 = rest time</span>
            </span>
            <NumberStepper label="Seconds" ariaLabel="Round rest in seconds" value={draft.roundRestSeconds} min={0} max={1800} step={5} onChange={(v) => set("roundRestSeconds", v)} />
          </div>
        )}
      </Group>

      <p className="-mt-3 rounded-2xl bg-teal/10 px-4 py-3 text-sm text-ink">
        A timed set runs {formatSeconds(draft.exerciseSeconds)}, then{" "}
        {draft.restSeconds > 0 ? `${formatSeconds(draft.restSeconds)} of rest` : "the next set starts right away"}.
        Repetition sets wait for you to tap Done, then the rest starts.
        {draft.workoutFlow === "circuit" && ` After each round: ${formatSeconds(draft.roundRestSeconds || draft.restSeconds)} of rest.`}
      </p>

      <Group title="Sound & screen">
        <Toggle label="Beep 3-2-1 before each change" checked={draft.chime} onChange={(v) => set("chime", v)} />
        <Toggle label="Keep the screen awake during a workout" checked={draft.keepScreenAwake} onChange={(v) => set("keepScreenAwake", v)} />
      </Group>

      <DataSection db={db} />

      {error && (
        <p role="alert" className="text-sm font-medium text-tomato-deep">
          {error}
        </p>
      )}

      <div className="sticky bottom-0 -mx-5 flex justify-end gap-2 border-t border-ink/10 bg-paper px-5 pt-3">
        <button type="button" onClick={onCancel} className="rounded-full px-4 py-2.5 font-medium text-ink-soft hover:bg-ink/5">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="rounded-full bg-teal px-5 py-2.5 font-semibold text-white hover:bg-teal-deep disabled:opacity-40">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
