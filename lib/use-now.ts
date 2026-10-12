"use client";

import { useSyncExternalStore } from "react";
import { localDate } from "./schedule";

// One shared clock for every component that renders time, ticking 4x/second.
let current = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function emit() {
  current = Date.now();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    current = Date.now();
    timer = setInterval(emit, 250);
    document.addEventListener("visibilitychange", emit);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", emit);
    }
  };
}

/** Current epoch ms on the client; null during server rendering. */
export function useNow(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => (current ||= Date.now()),
    () => null,
  );
}

const noopSubscribe = () => () => {};

/** Today's local date ("YYYY-MM-DD") on the client; null during server rendering. */
export function useToday(): string | null {
  return useSyncExternalStore(noopSubscribe, () => localDate(Date.now()), () => null);
}

/** Shifts a "YYYY-MM-DD" date by whole days. */
export function shiftDate(iso: string, days: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}
