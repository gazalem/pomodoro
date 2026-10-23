"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useDatabase, type DatabaseState } from "@/lib/db/browser";
import type { Category, Settings, Task } from "@/lib/types";
import { PomodoroApp } from "./pomodoro-app";

interface Loaded {
  settings: Settings;
  tasks: Task[];
  categories: Category[];
}

/** Opens the in-browser database, loads the initial data, then shows the app. */
export function AppGate() {
  const state = useDatabase();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (state.status !== "ready") return;
    let active = true;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { repo } = state.db;
    Promise.all([repo.getSettings(), repo.listTasks(startOfDay.getTime()), repo.listCategories()]).then(
      ([settings, tasks, categories]) => active && setLoaded({ settings, tasks, categories }),
      (error: unknown) => active && setLoadError(error instanceof Error ? error.message : String(error)),
    );
    return () => {
      active = false;
    };
  }, [state]);

  if (state.status === "error" || loadError) {
    return <ErrorScreen state={state} message={loadError} />;
  }
  if (state.status === "waiting") {
    return (
      <CenteredMessage title="Pomodoro is open in another tab">
        Your data can only be used in one tab at a time. Close the other tab and this one will continue automatically.
      </CenteredMessage>
    );
  }
  if (state.status !== "ready" || !loaded) return <AppShell />;

  return (
    <PomodoroApp
      db={state.db}
      initialSettings={loaded.settings}
      initialTasks={loaded.tasks}
      initialCategories={loaded.categories}
    />
  );
}

/** Placeholder with the same silhouette as the timer, shown while the database opens. */
export function AppShell() {
  return (
    <div className="flex min-h-dvh items-center justify-center" aria-busy="true" aria-label="Loading">
      <div className="aspect-square w-[min(84vw,46dvh,440px)] rounded-full border-[6px] border-salmon motion-safe:animate-pulse" />
    </div>
  );
}

function ErrorScreen({ state, message }: { state: DatabaseState; message: string | null }) {
  const detail = state.status === "error" ? state.message : message;
  return (
    <CenteredMessage title="Couldn't open your data">
      <p>Pomodoro keeps everything in a SQLite database inside this browser, and it couldn&apos;t be opened.</p>
      {detail && <p className="mt-2 font-mono text-xs text-white/70">{detail}</p>}
      <button
        type="button"
        onClick={() => (state.status === "error" ? state.retry() : window.location.reload())}
        className="mt-5 rounded-full border-2 border-white bg-white/15 px-5 py-2 font-semibold text-white hover:bg-white/25"
      >
        Try again
      </button>
    </CenteredMessage>
  );
}

function CenteredMessage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold text-white">{title}</h1>
      <div className="mt-3 max-w-md text-white/85">{children}</div>
    </main>
  );
}
