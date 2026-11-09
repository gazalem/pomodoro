"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useDatabase, type AppDatabase, type DatabaseState } from "@/lib/db/browser";
import type { Repo } from "@/lib/repo";
import type { Category, Settings, Task } from "@/lib/types";
import { PomodoroApp } from "./pomodoro-app";

interface FocusData {
  settings: Settings;
  tasks: Task[];
  categories: Category[];
}

async function loadFocusData(repo: Repo): Promise<FocusData> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [settings, tasks, categories] = await Promise.all([
    repo.getSettings(),
    repo.listTasks(startOfDay.getTime()),
    repo.listCategories(),
  ]);
  return { settings, tasks, categories };
}

/** The focus (pomodoro) page. */
export function AppGate() {
  return (
    <DatabaseGate load={loadFocusData}>
      {(db, data) => (
        <PomodoroApp
          db={db}
          initialSettings={data.settings}
          initialTasks={data.tasks}
          initialCategories={data.categories}
        />
      )}
    </DatabaseGate>
  );
}

/**
 * Opens the in-browser database, runs `load` (pass a stable, module-level
 * function), then renders `children` with the result. Shows the loading,
 * "open in another tab" and error states meanwhile.
 */
export function DatabaseGate<T>({
  load,
  children,
  shellRingClassName,
}: {
  load: (repo: Repo) => Promise<T>;
  children: (db: AppDatabase, data: T) => ReactNode;
  /** Color of the loading placeholder ring, to match the page. */
  shellRingClassName?: string;
}) {
  const state = useDatabase();
  const [loaded, setLoaded] = useState<{ data: T } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (state.status !== "ready") return;
    let active = true;
    load(state.db.repo).then(
      (data) => active && setLoaded({ data }),
      (error: unknown) => active && setLoadError(error instanceof Error ? error.message : String(error)),
    );
    return () => {
      active = false;
    };
  }, [state, load]);

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
  if (state.status !== "ready" || !loaded) return <AppShell ringClassName={shellRingClassName} />;

  return <>{children(state.db, loaded.data)}</>;
}

/** Placeholder with the same silhouette as the timer, shown while the database opens. */
export function AppShell({ ringClassName = "border-salmon" }: { ringClassName?: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center" aria-busy="true" aria-label="Loading">
      <div className={`aspect-square w-[min(84vw,46dvh,440px)] rounded-full border-[6px] ${ringClassName} motion-safe:animate-pulse`} />
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
