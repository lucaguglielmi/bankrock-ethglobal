"use client";

/**
 * Registers `public/sw.js` (spec 14 §4). Nothing renders — this is a mount-only side effect.
 *
 * Guarded on feature detection (`"serviceWorker" in navigator`) and `NODE_ENV === "production"`:
 * `public/sw.js` is only ever produced by the `prebuild` script (`scripts/build-sw.mjs`) ahead of
 * a real build, so registering it under `next dev` would 404 and spam the console on every reload.
 */

import { useEffect } from "react";

export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch((err: unknown) => {
      console.error("Service worker registration failed", err);
    });
  }, []);

  return null;
}
