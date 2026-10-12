"use client";

import { useEffect } from "react";
import { BASE_PATH } from "@/lib/base-path";

/** Registers the offline service worker in production builds. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(`${BASE_PATH}/sw.js`, { scope: `${BASE_PATH}/` }).catch(() => {
      // Offline support is a bonus; the app works without it.
    });
  }, []);
  return null;
}
