"use client";

import { useCallback, useSyncExternalStore } from "react";

/** localStorage access that never throws (private mode, blocked storage, SSR). */
export function readStored<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable: the timer still works for this page load.
  }
}

const storeListeners = new Set<() => void>();

function subscribeStore(listener: () => void) {
  storeListeners.add(listener);
  window.addEventListener("storage", listener); // other tabs
  return () => {
    storeListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** A small string preference persisted in localStorage, safe to read during hydration. */
export function useStoredString(key: string): [string | null, (value: string | null) => void] {
  const value = useSyncExternalStore(
    subscribeStore,
    () => {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null,
  );
  const set = useCallback(
    (next: string | null) => {
      try {
        if (next === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, next);
      } catch {
        // Unavailable storage: the choice just won't survive a reload.
      }
      storeListeners.forEach((listener) => listener());
    },
    [key],
  );
  return [value, set];
}
