"use client";

import { useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import type { AppDatabase } from "@/lib/db/browser";
import { downloadBlob } from "@/lib/download";
import { formatDuration, formatHHMM, formatTimeOfDay } from "@/lib/format";
import { localDate, previewDay } from "@/lib/schedule";
import { normalizeSettings } from "@/lib/settings";
import { useToday } from "@/lib/use-now";
import type { Settings } from "@/lib/types";

interface SettingsFormProps {
  db: AppDatabase;
  settings: Settings;
  onSave: (settings: Settings) => Promise<boolean>;
  onCancel: () => void;
}

export function SettingsForm({ db, settings, onSave, onCancel }: SettingsFormProps) {
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  // Preview for "today" using the same engine that runs the timer.
  const today = useToday() ?? "2000-01-03";
  const preview = useMemo(() => previewDay(normalizeSettings(draft), Date.parse(`${today}T12:00:00`)), [draft, today]);
  const timeError =
    draft.stopAtDayEnd && draft.dayEnd <= draft.dayStart
      ? "The workday has to end after it starts."
      : draft.lunchEnabled && (draft.lunchStart < draft.dayStart || draft.lunchStart >= draft.dayEnd)
        ? "Lunch should start inside your workday."
        : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (timeError) return;
    setSaving(true);
    const ok = await onSave(normalizeSettings(draft));
    setSaving(false);
    if (!ok) setError("Couldn't save your settings. Try again.");
  }

  async function toggleNotifications(on: boolean) {
    if (on && "Notification" in window && Notification.permission !== "granted") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError("Notifications are blocked for this site in your browser settings.");
        return;
      }
    }
    set("notifications", on);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6 pb-2">
      <Group title="Focus & breaks">
        <NumberField label="Focus" unit="min" value={draft.focusMinutes} min={1} max={180} onChange={(v) => set("focusMinutes", v)} />
        <NumberField label="Short break" unit="min" value={draft.shortBreakMinutes} min={1} max={60} onChange={(v) => set("shortBreakMinutes", v)} />
        <NumberField label="Long break" unit="min" value={draft.longBreakMinutes} min={1} max={120} onChange={(v) => set("longBreakMinutes", v)} />
        <NumberField label="Long break every" unit="focus blocks" value={draft.longBreakInterval} min={1} max={12} onChange={(v) => set("longBreakInterval", v)} />
      </Group>

      <Group title="Workday">
        <TimeField label="Starts at" value={draft.dayStart} onChange={(v) => set("dayStart", v)} />
        <TimeField label="Ends at" value={draft.dayEnd} onChange={(v) => set("dayEnd", v)} />
        <Toggle label="Stop the cycle when the day ends" checked={draft.stopAtDayEnd} onChange={(v) => set("stopAtDayEnd", v)} />
        <Toggle
          label="Start automatically at the start time"
          hint="Works while the app is open in a tab or installed."
          checked={draft.autoStartAtDayStart}
          onChange={(v) => set("autoStartAtDayStart", v)}
        />
      </Group>

      <Group title="Lunch">
        <Toggle label="Take a lunch break" checked={draft.lunchEnabled} onChange={(v) => set("lunchEnabled", v)} />
        {draft.lunchEnabled && (
          <>
            <TimeField label="Lunch at" value={draft.lunchStart} onChange={(v) => set("lunchStart", v)} />
            <NumberField label="Lunch length" unit="min" value={draft.lunchMinutes} min={5} max={240} onChange={(v) => set("lunchMinutes", v)} />
            <Toggle label="Resume focusing after lunch" checked={draft.resumeAfterLunch} onChange={(v) => set("resumeAfterLunch", v)} />
          </>
        )}
      </Group>

      <div className="rounded-2xl bg-tomato/10 px-4 py-3 text-sm text-ink" aria-live="polite">
        {timeError ? (
          <p className="font-medium text-tomato-deep">{timeError}</p>
        ) : (
          <p>
            <span className="font-semibold">Your day: </span>
            {formatHHMM(draft.dayStart)} start, {preview.focusBeforeLunch} focus blocks
            {preview.lunchAt !== null && <> before lunch at {formatTimeOfDay(preview.lunchAt)}</>}
            {preview.lunchAt !== null && draft.resumeAfterLunch && <>, {preview.focusAfterLunch} after</>}
            . About <span className="font-semibold">{formatDuration(preview.focusMinutes * 60)}</span> of focus, finishing
            around {formatTimeOfDay(preview.endsAt)}.
          </p>
        )}
      </div>

      <Group title="Goal & feedback">
        <NumberField label="Daily goal" unit="pomodoros" value={draft.dailyGoal} min={1} max={32} onChange={(v) => set("dailyGoal", v)} />
        <Toggle label="Chime when a phase ends" checked={draft.chime} onChange={(v) => set("chime", v)} />
        <Toggle label="Desktop / phone notifications" checked={draft.notifications} onChange={toggleNotifications} />
        <Toggle label="Keep the screen awake while running" checked={draft.keepScreenAwake} onChange={(v) => set("keepScreenAwake", v)} />
        <Toggle label="Play ambient sound during breaks" checked={draft.ambientDuringBreaks} onChange={(v) => set("ambientDuringBreaks", v)} />
        <label className="flex items-center justify-between gap-4 py-2.5">
          <span>Ambient volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={draft.ambientVolume}
            onChange={(e) => set("ambientVolume", Number(e.target.value))}
            className="w-40 accent-tomato"
          />
        </label>
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
        <button
          type="submit"
          disabled={saving || timeError !== null}
          className="rounded-full bg-tomato px-5 py-2.5 font-semibold text-white hover:bg-tomato-deep disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      <p className="-mt-3 text-xs text-ink-soft">Changes apply from the next phase.</p>
    </form>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-semibold tracking-wide text-ink-soft uppercase">{title}</legend>
      <div className="divide-y divide-ink/10 rounded-2xl border border-ink/10 bg-white px-4">{children}</div>
    </fieldset>
  );
}

interface NumberFieldProps {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

function NumberField({ label, unit, value, min, max, onChange }: NumberFieldProps) {
  return (
    <label className="flex items-center justify-between gap-4 py-2.5">
      <span>{label}</span>
      <span className="flex items-center gap-2 text-sm text-ink-soft">
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => onChange(e.target.valueAsNumber)}
          className="w-20 rounded-lg border border-ink/15 bg-paper px-2 py-1.5 text-right text-base text-ink tabular-nums focus:border-tomato focus:outline-none"
        />
        <span className="w-24">{unit}</span>
      </span>
    </label>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 py-2.5">
      <span>{label}</span>
      <input
        type="time"
        value={value}
        required
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-ink/15 bg-paper px-2 py-1.5 text-base text-ink tabular-nums focus:border-tomato focus:outline-none"
      />
    </label>
  );
}

interface ToggleProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function Toggle({ label, hint, checked, onChange }: ToggleProps) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-2.5">
      <span>
        {label}
        {hint && <span className="block text-xs text-ink-soft">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden="true"
        className="relative h-7 w-12 shrink-0 rounded-full bg-ink/20 transition-colors peer-checked:bg-tomato peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-tomato after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5"
      />
    </label>
  );
}

/** Backup and restore: the database lives only in this browser. */
function DataSection({ db }: { db: AppDatabase }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function backup() {
    setBusy(true);
    try {
      const bytes = await db.exportDb();
      downloadBlob(
        new Blob([bytes as BlobPart], { type: "application/vnd.sqlite3" }),
        `pomodoro-backup-${localDate(Date.now())}.sqlite3`,
      );
      setStatus("Backup downloaded.");
    } catch {
      setStatus("Couldn't create the backup.");
    } finally {
      setBusy(false);
    }
  }

  async function restore(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!window.confirm("Replace all tasks, sessions and settings on this device with this backup?")) return;
    setBusy(true);
    try {
      await db.importDb(new Uint8Array(await file.arrayBuffer()));
      window.location.reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Couldn't restore that file.");
      setBusy(false);
    }
  }

  return (
    <Group title="Your data">
      <div className="py-3 text-sm text-ink-soft">
        {db.storage === "opfs"
          ? "Stored on this device in a SQLite database (browser private file system). Nothing is sent to a server."
          : "This browser doesn't allow file storage here (e.g. a private window), so data is kept in IndexedDB and may be cleared when the window closes."}
        <span className="mt-1 block text-xs">SQLite {db.sqliteVersion} · WebAssembly</span>
      </div>
      <div className="flex flex-wrap gap-2 py-3">
        <button
          type="button"
          onClick={backup}
          disabled={busy}
          className="rounded-full border border-ink/15 px-4 py-2 text-sm font-medium hover:bg-ink/5 disabled:opacity-40"
        >
          Download backup
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="rounded-full border border-ink/15 px-4 py-2 text-sm font-medium hover:bg-ink/5 disabled:opacity-40"
        >
          Restore from backup…
        </button>
        <input ref={fileRef} type="file" accept=".sqlite3,.sqlite,.db,application/vnd.sqlite3" hidden onChange={restore} />
      </div>
      {status && (
        <p role="status" className="pb-3 text-sm text-ink">
          {status}
        </p>
      )}
    </Group>
  );
}
