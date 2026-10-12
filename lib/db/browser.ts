"use client";

import { useEffect, useState } from "react";
import { createRepo, type Repo } from "../repo";
import { createWorkerDriver } from "./client";
import { migrate } from "./migrations";
import type { StorageKind } from "./protocol";

export interface AppDatabase {
  repo: Repo;
  storage: StorageKind;
  sqliteVersion: string;
  /** Raw SQLite file, for backups. */
  exportDb(): Promise<Uint8Array>;
  /** Replaces all data with a backup file. */
  importDb(bytes: Uint8Array): Promise<void>;
}

const LOCK_NAME = "pomodoro-db";

/**
 * Only one tab may hold the OPFS database at a time. Resolves once this tab
 * owns it, calling `onWaiting` if another tab has it first; the lock is
 * held until the tab closes, then the next waiting tab takes over.
 */
function acquireTabLock(onWaiting: () => void): Promise<void> {
  if (!navigator.locks) return Promise.resolve();
  return new Promise((resolve) => {
    const hold = () => {
      resolve();
      return new Promise<never>(() => {});
    };
    void navigator.locks.request(LOCK_NAME, { ifAvailable: true }, (lock) => {
      if (lock) return hold();
      onWaiting();
      void navigator.locks.request(LOCK_NAME, hold);
      return undefined;
    });
  });
}

let opening: Promise<AppDatabase> | null = null;
const waitingListeners = new Set<() => void>();

function openDatabase(): Promise<AppDatabase> {
  opening ??= (async () => {
    await acquireTabLock(() => waitingListeners.forEach((l) => l()));
    const driver = createWorkerDriver();
    const info = await driver.open();
    await migrate(driver);
    // Ask the browser not to evict our data under storage pressure.
    void navigator.storage?.persist?.().catch(() => false);

    return {
      repo: createRepo(driver),
      storage: info.storage,
      sqliteVersion: info.sqliteVersion,
      exportDb: () => driver.exportDb(),
      async importDb(bytes) {
        await driver.importDb(bytes);
        await migrate(driver);
      },
    };
  })();
  opening.catch(() => {
    opening = null; // allow a retry
  });
  return opening;
}

export type DatabaseState =
  | { status: "loading" }
  | { status: "waiting" }
  | { status: "ready"; db: AppDatabase }
  | { status: "error"; message: string; retry: () => void };

/** Opens (once per page) the in-browser SQLite database. */
export function useDatabase(): DatabaseState {
  const [state, setState] = useState<DatabaseState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const onWaiting = () => active && setState({ status: "waiting" });
    waitingListeners.add(onWaiting);
    openDatabase().then(
      (db) => active && setState({ status: "ready", db }),
      (error: unknown) =>
        active &&
        setState({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
          retry: () => {
            setState({ status: "loading" });
            setAttempt((n) => n + 1);
          },
        }),
    );
    return () => {
      active = false;
      waitingListeners.delete(onWaiting);
    };
  }, [attempt]);

  return state;
}
