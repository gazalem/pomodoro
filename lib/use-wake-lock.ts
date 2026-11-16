"use client";

import { useEffect } from "react";

/**
 * Keeps the screen on (phones, tablets) while `active` is true and the page is visible.
 * Asks again when the page comes back or on the next tap, since iOS can drop or refuse the lock.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== "visible" || (lock && !lock.released)) return;
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
    document.addEventListener("pointerdown", acquire);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", acquire);
      document.removeEventListener("pointerdown", acquire);
      void lock?.release();
    };
  }, [active]);
}
