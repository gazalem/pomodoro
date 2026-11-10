"use client";

import Link from "next/link";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ambient } from "@/lib/ambient";
import type { AppDatabase } from "@/lib/db/browser";
import { formatDuration } from "@/lib/format";
import { localDate } from "@/lib/schedule";
import { readStored, useStoredString, writeStored } from "@/lib/storage";
import type { Exercise, Settings } from "@/lib/types";
import { useExercises } from "@/lib/use-exercises";
import { useNow } from "@/lib/use-now";
import { useWakeLock } from "@/lib/use-wake-lock";
import { INITIAL_WORKOUT, setDurationMs, workoutReducer, type WorkoutPhase, type WorkoutState } from "@/lib/workout";
import { ExercisePanel } from "./exercise-panel";
import { ExerciseSettingsForm } from "./exercise-settings-form";
import { CheckIcon, ListIcon, PauseIcon, PlayIcon, RestartIcon, SettingsIcon, SkipIcon, StatsIcon, StopIcon } from "./icons";
import { ModeNav } from "./mode-nav";
import { Sheet } from "./sheet";
import { TimerRing } from "./timer-ring";

const WORKOUT_KEY = "pomodoro.workout.v1";
const START_KEY = "pomodoro.exerciseStart.v1";
const RETRY_MS = 15_000;

interface WorkoutAppProps {
  db: AppDatabase;
  initialSettings: Settings;
  initialExercises: Exercise[];
}

export function WorkoutApp({ db, initialSettings, initialExercises }: WorkoutAppProps) {
  const { repo } = db;
  const [settings, setSettings] = useState(initialSettings);
  const [state, dispatch] = useReducer(workoutReducer, INITIAL_WORKOUT);
  const exercises = useExercises(repo, initialExercises);
  const open = exercises.exercises.filter((e) => !e.done);
  const [panel, setPanel] = useState<"list" | "settings" | null>(null);
  const [today, setToday] = useState<{ sets: number; activeSeconds: number } | null>(null);
  const [retry, setRetry] = useState(0);
  const [storedStart, setStoredStart] = useStoredString(START_KEY);

  // The engine needs the latest list and timing without re-subscribing timers.
  const listRef = useRef(open);
  const settingsRef = useRef(settings);
  useEffect(() => {
    listRef.current = open;
    settingsRef.current = settings;
  });

  const refreshToday = useCallback(() => {
    repo.getExerciseDayStats(localDate(Date.now())).then(setToday, () => {});
  }, [repo]);

  // Restore a workout in progress (a reload or a phone that locked mid-set).
  useEffect(() => {
    dispatch({
      type: "hydrate",
      saved: readStored<WorkoutState>(WORKOUT_KEY),
      now: Date.now(),
      list: listRef.current,
      settings: settingsRef.current,
    });
    refreshToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state !== INITIAL_WORKOUT) writeStored(WORKOUT_KEY, state);
  }, [state]);

  // Advance timed phases. Short interval so the 3-2-1 beeps land on time.
  useEffect(() => {
    const tick = () => dispatch({ type: "tick", now: Date.now(), list: listRef.current, settings: settingsRef.current });
    const id = setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, []);

  // Save finished sets/rests; check off exercises whose last set was completed.
  const { outbox } = state;
  const markDone = exercises.update;
  useEffect(() => {
    if (outbox.length === 0) return;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const batch = outbox;
    repo
      .insertExerciseLogs(batch)
      .then(() => {
        dispatch({ type: "flushed", clientIds: batch.map((l) => l.clientId) });
        for (const log of batch) {
          if (log.completesExercise && log.exerciseId !== null) void markDone(log.exerciseId, { done: true });
        }
        refreshToday();
      })
      .catch(() => {
        retryTimer = setTimeout(() => setRetry((n) => n + 1), RETRY_MS);
      });
    return () => clearTimeout(retryTimer);
  }, [outbox, retry, repo, markDone, refreshToday]);

  // Sounds on each change: a high "go" beep when a set starts, a soft chime for rest.
  const lastPhaseId = useRef<string | null | undefined>(undefined);
  const phase = state.phase;
  useEffect(() => {
    const id = phase?.id ?? null;
    const first = lastPhaseId.current === undefined;
    const changed = id !== lastPhaseId.current;
    lastPhaseId.current = id;
    if (first || !changed || !settingsRef.current.chime) return;
    if (phase?.kind === "set") ambient.beep(true);
    else if (phase?.kind === "rest") ambient.chime("down");
    else if (state.status === "finished") ambient.chime("up");
  }, [phase, state.status]);

  const running = state.status === "running";
  const active = state.status === "running" || state.status === "paused";
  useWakeLock(active && settings.keepScreenAwake);

  const selectedId = storedStart !== null && open.some((e) => e.id === Number(storedStart)) ? Number(storedStart) : null;

  const act = (type: Control) => {
    ambient.unlock();
    const now = Date.now();
    if (type === "pause" || type === "resume" || type === "stop") dispatch({ type, now });
    else dispatch({ type, now, list: listRef.current, settings: settingsRef.current });
  };
  const start = () => {
    ambient.unlock();
    dispatch({ type: "start", now: Date.now(), list: listRef.current, settings: settingsRef.current, exerciseId: selectedId ?? undefined });
  };

  const saveSettings = async (next: Settings) => {
    try {
      setSettings(await repo.saveSettings(next));
      setPanel(null);
      return true;
    } catch {
      return false;
    }
  };

  const exercisePanel = (
    <ExercisePanel
      exercises={exercises.exercises}
      error={exercises.error}
      defaultSeconds={settings.exerciseSeconds}
      currentId={phase?.exerciseId ?? null}
      selectedId={selectedId}
      workoutActive={active}
      onSelect={(id) => setStoredStart(id === null ? null : String(id))}
      onAdd={exercises.add}
      onUpdate={(id, patch) => void exercises.update(id, patch)}
      onRemove={(id) => void exercises.remove(id)}
      onReorder={(ids) => void exercises.reorder(ids)}
      onReset={() => void exercises.reset()}
    />
  );

  const first = open.find((e) => e.id === selectedId) ?? open[0];
  const idleMs = first ? (setDurationMs(first, settings) ?? 0) : settings.exerciseSeconds * 1000;
  const rest = phase?.kind === "rest" ? (phase.roundRest ? "round" : "short") : undefined;

  return (
    <div
      data-rest={rest}
      className={`flex min-h-dvh flex-col pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] transition-colors duration-500 ${
        rest === "round" ? "bg-rest-deep" : rest ? "bg-rest" : "bg-teal"
      }`}
    >
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-5 pt-3 md:px-8 md:pt-5">
        <Link
          href="/report?view=exercise"
          aria-label="Open report"
          className="grid size-11 place-items-center rounded-full text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-cream"
        >
          <StatsIcon className="text-[1.6rem]" />
        </Link>
        <ModeNav current="exercise" />
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPanel("list")}
            aria-label="Exercises"
            className="grid size-11 place-items-center rounded-full text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-cream lg:hidden"
          >
            <ListIcon className="text-2xl" />
          </button>
          <button
            type="button"
            onClick={() => setPanel("settings")}
            aria-label="Exercise settings"
            className="grid size-11 place-items-center rounded-full text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-cream"
          >
            <SettingsIcon className="text-2xl" />
          </button>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-4 pb-[max(env(safe-area-inset-bottom),1.5rem)] md:px-8 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section
          aria-label="Workout timer"
          className={`flex flex-col items-center gap-5 py-2 transition-opacity duration-300 md:gap-6 ${
            state === INITIAL_WORKOUT ? "opacity-0" : "opacity-100"
          }`}
        >
          <p className="-mb-2 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white/90 tabular-nums" aria-live="polite">
            {today ? (
              <>
                {today.sets} set{today.sets === 1 ? "" : "s"} today
                <span className="text-white/60"> · {formatDuration(today.activeSeconds)}</span>
              </>
            ) : (
              <span className="text-white/60">Today</span>
            )}
          </p>

          <TimerRing
            phase={phase}
            idleMs={idleMs}
            idleTitle="Exercise · Pomodoro"
            trackClassName={rest ? "stroke-rest-track" : "stroke-mint"}
            label={ringLabel(state)}
            center={
              state.status === "finished" ? (
                <CheckIcon className="text-[26cqw]" />
              ) : phase?.kind === "set" && phase.mode === "reps" ? (
                <span className="leading-none font-extralight tabular-nums">
                  <span className="text-[26cqw]">{phase.reps}</span>
                  <span className="ml-[1.5cqw] text-[7cqw]">reps</span>
                </span>
              ) : undefined
            }
          />

          {phase && <Countdown phase={phase} enabled={running && settings.chime} />}

          <div className="flex min-h-[4.5rem] flex-col items-center gap-1.5 text-center">
            <p className="max-w-md text-2xl leading-snug text-white md:text-3xl">{headline(state, open.length, first)}</p>
            <p className="text-sm text-white/80">{subline(state, open, settings.exerciseSeconds)}</p>
          </div>

          <WorkoutControls
            state={state}
            canStart={open.length > 0}
            onStart={start}
            onAction={act}
            onDismiss={() => dispatch({ type: "dismiss" })}
            onReset={() => {
              void exercises.reset();
              dispatch({ type: "dismiss" });
            }}
          />
        </section>

        <aside className="hidden self-stretch py-4 lg:block" aria-label="Exercises">
          <div className="sticky top-6 rounded-3xl bg-paper p-5 text-ink shadow-xl shadow-black/10">
            <h2 className="mb-4 text-lg font-semibold">Exercises</h2>
            {exercisePanel}
          </div>
        </aside>
      </main>

      <Sheet open={panel === "list"} title="Exercises" onClose={() => setPanel(null)} className="lg:hidden">
        {exercisePanel}
      </Sheet>
      <Sheet open={panel === "settings"} title="Exercise settings" onClose={() => setPanel(null)}>
        {panel === "settings" && <ExerciseSettingsForm db={db} settings={settings} onSave={saveSettings} onCancel={() => setPanel(null)} />}
      </Sheet>
    </div>
  );
}

function ringLabel(state: WorkoutState): string {
  const { phase } = state;
  if (!phase) return state.status === "finished" ? "Done" : "Ready";
  if (phase.kind === "rest") return phase.roundRest ? "Round rest" : "Rest";
  return `Set ${phase.setNumber} of ${phase.totalSets}`;
}

function headline(state: WorkoutState, openCount: number, first: Exercise | undefined): string {
  const { phase } = state;
  if (state.status === "finished") return "Workout complete. Great job!";
  if (!phase) {
    if (openCount === 0) return "Add exercises to start a workout";
    return first ? `Start with ${first.title}` : "Ready";
  }
  if (phase.roundRest) return `Round ${phase.setNumber} starts with ${phase.exerciseTitle}`;
  if (phase.kind === "rest") return phase.setNumber === 1 ? `Next: ${phase.exerciseTitle}` : `Rest · next set of ${phase.exerciseTitle}`;
  return phase.exerciseTitle;
}

function subline(state: WorkoutState, open: Exercise[], defaultSeconds: number): string {
  const { phase } = state;
  if (state.status === "paused") return "Paused";
  if (!phase) {
    if (open.length === 0) return "";
    const sets = open.reduce((n, e) => n + e.sets, 0);
    const timed = open.filter((e) => e.mode === "time");
    const secs = timed.reduce((n, e) => n + e.sets * (e.durationSeconds ?? defaultSeconds), 0);
    return `${open.length} exercise${open.length === 1 ? "" : "s"} · ${sets} sets${secs > 0 ? ` · ${formatDuration(secs)} timed` : ""}`;
  }
  if (phase.kind === "rest") return `Set ${phase.setNumber} of ${phase.totalSets} comes next`;
  return phase.mode === "reps" ? "Tap Done when you finish the set" : "Keep going!";
}

/** Beeps at 3, 2 and 1 seconds left in a timed phase. */
function Countdown({ phase, enabled }: { phase: WorkoutPhase; enabled: boolean }) {
  const now = useNow();
  const beeped = useRef<string>("");
  const left =
    phase.plannedMs === null || now === null || phase.resumedAt === null
      ? null
      : Math.ceil((phase.plannedMs - phase.accumulatedMs - (now - phase.resumedAt)) / 1000);

  useEffect(() => {
    if (!enabled || left === null || left < 1 || left > 3) return;
    const key = `${phase.id}:${left}`;
    if (beeped.current === key) return;
    beeped.current = key;
    ambient.beep();
  }, [enabled, left, phase.id]);

  return null;
}

type Control = "pause" | "resume" | "finish" | "skip" | "restart" | "stop";

function WorkoutControls({
  state,
  canStart,
  onStart,
  onAction,
  onDismiss,
  onReset,
}: {
  state: WorkoutState;
  canStart: boolean;
  onStart: () => void;
  onAction: (a: Control) => void;
  onDismiss: () => void;
  onReset: () => void;
}) {
  const side =
    "grid size-16 place-items-center rounded-full border-[3px] border-white bg-white/15 text-white transition hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cream disabled:opacity-40 disabled:hover:bg-white/15 md:size-[4.5rem]";
  const main =
    "grid size-[5.5rem] place-items-center rounded-full border-[3px] border-white bg-white/20 text-white transition hover:bg-white/30 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cream disabled:opacity-40 md:size-24";
  const doneButton =
    "grid size-[5.5rem] place-items-center rounded-full border-[3px] border-white bg-white text-teal-deep shadow-lg transition hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cream md:size-24";
  const { phase, status } = state;

  if (status === "finished") {
    return (
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={onReset} className="rounded-full bg-white px-5 py-2.5 font-semibold text-teal-deep hover:bg-cream">
          Reset list &amp; go again
        </button>
        <button type="button" onClick={onDismiss} className="rounded-full border-2 border-white px-5 py-2.5 font-semibold text-white hover:bg-white/10">
          Done
        </button>
      </div>
    );
  }

  const idle = !phase;
  const repsSet = phase?.kind === "set" && phase.mode === "reps";
  const running = status === "running";

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-6 md:gap-8">
        <button type="button" className={side} disabled={idle} onClick={() => onAction("restart")} aria-label="Restart this set">
          <RestartIcon className="text-[1.6rem]" />
        </button>
        {idle ? (
          <button type="button" onClick={onStart} disabled={!canStart} aria-label="Start workout" className={main}>
            <PlayIcon className="ml-1 text-[2.2rem]" />
          </button>
        ) : repsSet ? (
          <button type="button" onClick={() => onAction("finish")} aria-label="Done with this set" className={doneButton}>
            <CheckIcon className="text-[2.4rem]" />
          </button>
        ) : (
          <button type="button" onClick={() => onAction(running ? "pause" : "resume")} aria-label={running ? "Pause" : "Resume"} className={main}>
            {running ? <PauseIcon className="text-[2.2rem]" /> : <PlayIcon className="ml-1 text-[2.2rem]" />}
          </button>
        )}
        <button type="button" className={side} disabled={idle} onClick={() => onAction("stop")} aria-label="Stop the workout">
          <StopIcon className="text-[1.6rem]" />
        </button>
      </div>
      <button
        type="button"
        onClick={() => onAction("skip")}
        disabled={idle}
        className="flex items-center gap-1.5 rounded-full px-3 py-1 text-sm text-white/80 hover:bg-white/10 hover:text-white disabled:invisible"
      >
        {phase?.kind === "rest" ? "Skip rest" : "Skip set"} <SkipIcon className="text-xs" />
      </button>
    </div>
  );
}
