"use client";

import Link from "next/link";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ambient, type SoundKind } from "@/lib/ambient";
import { formatDuration, formatTimeOfDay } from "@/lib/format";
import { INITIAL_TIMER, localDate, timerReducer, type Phase, type TimerState } from "@/lib/schedule";
import { readStored, useStoredString, writeStored } from "@/lib/storage";
import type { Settings, Task, TodayStats } from "@/lib/types";
import { useTasks } from "@/lib/use-tasks";
import {
  ListIcon,
  PauseIcon,
  PlayIcon,
  RestartIcon,
  SettingsIcon,
  SkipIcon,
  StatsIcon,
  StopIcon,
  TomatoIcon,
} from "./icons";
import { SettingsForm } from "./settings-form";
import { Sheet } from "./sheet";
import { SoundTiles } from "./sound-tiles";
import { TaskPanel } from "./task-panel";
import { TimerRing } from "./timer-ring";

const TIMER_KEY = "pomodoro.timer.v1";
const SOUND_KEY = "pomodoro.sound.v1";
const RETRY_MS = 15_000;
const SOUND_KINDS: SoundKind[] = ["ocean", "fire", "rain", "nature"];

interface PomodoroAppProps {
  initialSettings: Settings;
  initialTasks: Task[];
}

export function PomodoroApp({ initialSettings, initialTasks }: PomodoroAppProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [timer, dispatch] = useReducer(timerReducer, INITIAL_TIMER);
  const [storedSound, setStoredSound] = useStoredString(SOUND_KEY);
  const sound = SOUND_KINDS.includes(storedSound as SoundKind) ? (storedSound as SoundKind) : null;
  const [panel, setPanel] = useState<"tasks" | "settings" | null>(null);
  const [today, setToday] = useState<TodayStats | null>(null);
  const [retry, setRetry] = useState(0);
  const tasks = useTasks(initialTasks);

  // Reducer actions need the latest settings without re-subscribing timers.
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
    ambient.setVolume(settings.ambientVolume);
  }, [settings]);

  const refreshToday = useCallback(() => {
    void fetchTodayStats().then((stats) => stats && setToday(stats));
  }, []);

  // Restore the running timer (and catch up on phases missed while closed).
  useEffect(() => {
    dispatch({
      type: "hydrate",
      saved: readStored<TimerState>(TIMER_KEY),
      now: Date.now(),
      settings: settingsRef.current,
    });
    void tasks.refresh();
    refreshToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (timer !== INITIAL_TIMER) writeStored(TIMER_KEY, timer);
  }, [timer]);

  // Drive phase changes. Uses wall-clock time, so throttled background tabs
  // and sleeping laptops still land on the right phase when they wake up.
  useEffect(() => {
    const tick = () => dispatch({ type: "tick", now: Date.now(), settings: settingsRef.current });
    const id = setInterval(tick, 500);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, []);

  // Write finished phases to SQLite. The server ignores duplicate clientIds,
  // so re-sending after a failure or a re-render is safe.
  const { outbox } = timer;
  const refreshTasks = tasks.refresh;
  useEffect(() => {
    if (outbox.length === 0) return;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const batch = outbox;
    fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessions: batch }),
    })
      .then((res) => {
        if (!res.ok && res.status !== 400) throw new Error(String(res.status));
        dispatch({ type: "flushed", clientIds: batch.map((l) => l.clientId) });
        refreshToday();
        if (batch.some((l) => l.type === "focus" && l.taskId !== null)) void refreshTasks();
      })
      .catch(() => {
        retryTimer = setTimeout(() => setRetry((n) => n + 1), RETRY_MS);
      });
    return () => clearTimeout(retryTimer);
  }, [outbox, retry, refreshToday, refreshTasks]);

  // Chime + notification when a phase ends on its own.
  const lastCompleted = useRef<string | null>(null);
  const lastLog = outbox.at(-1);
  useEffect(() => {
    if (!lastLog || lastLog.status !== "completed" || lastLog.clientId === lastCompleted.current) return;
    const isFirst = lastCompleted.current === null && Date.now() - lastLog.endedAt > 5_000;
    lastCompleted.current = lastLog.clientId;
    if (isFirst) return; // caught up after a reload; don't ring for stale phases
    const s = settingsRef.current;
    if (s.chime) ambient.chime(timer.phase?.type === "focus" ? "up" : "down");
    if (s.notifications && document.hidden && "Notification" in window && Notification.permission === "granted") {
      new Notification(phaseHeadline(timer, s), { body: "Pomodoro", tag: "pomodoro-phase", icon: "/icon.svg" });
    }
  }, [lastLog, timer]);

  // Ambient sound plays during focus (and breaks, if enabled).
  const running = timer.status === "running";
  const phaseType = timer.phase?.type;
  const audible = running && (phaseType === "focus" || (settings.ambientDuringBreaks && phaseType !== undefined));
  useEffect(() => {
    ambient.set(sound, audible);
  }, [sound, audible]);

  // Keep phones from sleeping while the timer runs.
  useEffect(() => {
    if (!running || !settings.keepScreenAwake || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (cancelled) void next.release();
        else lock = next;
      } catch {
        // Denied (battery saver, unsupported context): not critical.
      }
    };
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release();
    };
  }, [running, settings.keepScreenAwake]);

  const act = (type: "start" | "pause" | "resume" | "restart" | "skip" | "stop") => {
    ambient.unlock(); // user gesture: allowed to start audio now
    dispatch({ type, now: Date.now(), settings: settingsRef.current } as Parameters<typeof dispatch>[0]);
  };

  const chooseSound = (kind: SoundKind | null) => {
    ambient.unlock();
    setStoredSound(kind);
  };

  const selectTask = (taskId: number | null) => dispatch({ type: "setTask", taskId });

  const saveSettings = async (next: Settings) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) return false;
      setSettings(await res.json());
      setPanel(null);
      return true;
    } catch {
      return false;
    }
  };

  const activeTask = tasks.tasks.find((t) => t.id === timer.activeTaskId && !t.done) ?? null;
  const taskPanel = (
    <TaskPanel
      tasks={tasks.tasks}
      activeTaskId={activeTask?.id ?? null}
      error={tasks.error}
      onAdd={tasks.add}
      onToggle={(t) => void tasks.update(t.id, { done: !t.done })}
      onRemove={(t) => void tasks.remove(t.id)}
      onSelect={selectTask}
    />
  );

  return (
    <div className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-5 pt-3 md:px-8 md:pt-5">
        <Link
          href="/report"
          aria-label="Open report"
          className="grid size-11 place-items-center rounded-full text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-cream"
        >
          <StatsIcon className="text-[1.6rem]" />
        </Link>

        <p className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white/90 tabular-nums" aria-live="polite">
          <TomatoIcon className="text-base" />
          {today ? (
            <>
              {today.pomodoros}/{settings.dailyGoal}
              <span className="text-white/60">· {formatDuration(today.focusSeconds)}</span>
            </>
          ) : (
            <span className="text-white/60">Today</span>
          )}
        </p>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPanel("tasks")}
            aria-label="Tasks"
            className="grid size-11 place-items-center rounded-full text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-cream lg:hidden"
          >
            <ListIcon className="text-2xl" />
          </button>
          <button
            type="button"
            onClick={() => setPanel("settings")}
            aria-label="Settings"
            className="grid size-11 place-items-center rounded-full text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-cream"
          >
            <SettingsIcon className="text-2xl" />
          </button>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-4 pb-[max(env(safe-area-inset-bottom),1.5rem)] md:px-8 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section
          aria-label="Timer"
          // Until localStorage is read, the server HTML shows a generic idle timer; fade in once restored.
          className={`flex flex-col items-center gap-5 py-2 transition-opacity duration-300 md:gap-6 ${
            timer === INITIAL_TIMER ? "opacity-0" : "opacity-100"
          }`}
        >
          <TimerRing phase={timer.phase} idleMs={settings.focusMinutes * 60_000} />

          <CycleDots done={timer.cycleCount} total={settings.longBreakInterval} />

          <SoundTiles selected={sound} playing={audible} onSelect={chooseSound} />

          <div className="flex min-h-[4.5rem] flex-col items-center gap-1.5 text-center">
            <p className="max-w-md text-2xl leading-snug font-normal text-white md:text-3xl">{phaseHeadline(timer, settings)}</p>
            <PhaseDetail phase={timer.phase} activeTask={activeTask} onPickTask={() => setPanel("tasks")} />
          </div>

          <Controls state={timer} onAction={act} />
        </section>

        <aside className="hidden self-stretch py-4 lg:block" aria-label="Tasks">
          <div className="sticky top-6 rounded-3xl bg-paper p-5 text-ink shadow-xl shadow-black/10">
            <h2 className="mb-4 text-lg font-semibold">Tasks</h2>
            {taskPanel}
          </div>
        </aside>
      </main>

      <Sheet open={panel === "tasks"} title="Tasks" onClose={() => setPanel(null)} className="lg:hidden">
        {taskPanel}
      </Sheet>
      <Sheet open={panel === "settings"} title="Settings" onClose={() => setPanel(null)}>
        {panel === "settings" && (
          <SettingsForm settings={settings} onSave={saveSettings} onCancel={() => setPanel(null)} />
        )}
      </Sheet>
    </div>
  );
}

async function fetchTodayStats(): Promise<TodayStats | null> {
  try {
    const res = await fetch(`/api/stats?date=${localDate(Date.now())}`);
    return res.ok ? ((await res.json()) as TodayStats) : null;
  } catch {
    return null; // offline: keep showing the last known numbers
  }
}

function phaseHeadline(state: TimerState, s: Settings): string {
  const { phase } = state;
  if (!phase) {
    if (state.notice === "day-done") return "Workday complete. Nice work!";
    if (state.notice === "lunch-over") return "Lunch is over. Ready to focus?";
    return `Ready to focus for ${s.focusMinutes} minutes`;
  }
  const minutes = Math.max(1, Math.round(phase.plannedMs / 60_000));
  const plural = minutes === 1 ? "minute" : "minutes";
  switch (phase.type) {
    case "focus":
      return `Focus for ${minutes} ${plural}`;
    case "short_break":
      return `Take a short break for ${minutes} ${plural}`;
    case "long_break":
      return `Take a long break for ${minutes} ${plural}`;
    case "lunch":
      return phase.endsAt ? `Enjoy your lunch until ${formatTimeOfDay(phase.endsAt)}` : "Lunch break";
  }
}

function PhaseDetail({
  phase,
  activeTask,
  onPickTask,
}: {
  phase: Phase | null;
  activeTask: Task | null;
  onPickTask: () => void;
}) {
  const cut =
    phase?.cutBy === "lunch" ? "Shortened to end at lunch" : phase?.cutBy === "day-end" ? "Shortened to end with your workday" : null;
  const showTask = !phase || phase.type === "focus";
  return (
    <div className="flex flex-col items-center gap-1 text-sm text-white/80">
      {cut && <span>{cut}</span>}
      {showTask && (
        <button
          type="button"
          onClick={onPickTask}
          className="max-w-[80vw] truncate rounded-full px-3 py-1 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-cream lg:pointer-events-none"
        >
          {activeTask ? (
            <>
              Working on <span className="font-semibold text-white">{activeTask.title}</span>
            </>
          ) : (
            <span className="underline decoration-white/40 underline-offset-4 lg:no-underline">Pick a task to track</span>
          )}
        </button>
      )}
    </div>
  );
}

function CycleDots({ done, total }: { done: number; total: number }) {
  return (
    <div className="flex items-center gap-2" aria-label={`${Math.min(done, total)} of ${total} focus blocks until a long break`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`size-2 rounded-full ${i < done ? "bg-cream" : "bg-white/25"}`} />
      ))}
    </div>
  );
}

type ControlAction = "start" | "pause" | "resume" | "restart" | "skip" | "stop";

function Controls({ state, onAction }: { state: TimerState; onAction: (a: ControlAction) => void }) {
  const idle = state.status === "idle";
  const running = state.status === "running";
  const side =
    "grid size-16 place-items-center rounded-full border-[3px] border-white bg-white/15 text-white transition hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cream disabled:opacity-40 disabled:hover:bg-white/15 md:size-[4.5rem]";

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-6 md:gap-8">
        <button type="button" className={side} disabled={idle} onClick={() => onAction("restart")} aria-label="Restart this phase">
          <RestartIcon className="text-[1.6rem]" />
        </button>
        <button
          type="button"
          onClick={() => onAction(idle ? "start" : running ? "pause" : "resume")}
          aria-label={idle ? "Start" : running ? "Pause" : "Resume"}
          className="grid size-[5.5rem] place-items-center rounded-full border-[3px] border-white bg-white/20 text-white transition hover:bg-white/30 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cream md:size-24"
        >
          {running ? <PauseIcon className="text-[2.2rem]" /> : <PlayIcon className="ml-1 text-[2.2rem]" />}
        </button>
        <button type="button" className={side} disabled={idle} onClick={() => onAction("stop")} aria-label="Stop the cycle">
          <StopIcon className="text-[1.6rem]" />
        </button>
      </div>
      <button
        type="button"
        onClick={() => onAction("skip")}
        disabled={idle}
        className="flex items-center gap-1.5 rounded-full px-3 py-1 text-sm text-white/80 hover:bg-white/10 hover:text-white disabled:invisible"
      >
        Skip to next <SkipIcon className="text-xs" />
      </button>
    </div>
  );
}
