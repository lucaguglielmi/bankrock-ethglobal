"use client";

/**
 * The `?give=<address>` parameter a scanned link carries (B1, Flow E), read exactly once.
 *
 * It is a module-level store rather than component state for two reasons:
 *
 *  - the parameter is consumed, not observed. It is stripped from the URL the moment it is read,
 *    so a reload does not re-prefill a recipient; a second component asking for it later must
 *    still get the same answer rather than "nothing, the URL is clean now";
 *  - `useSyncExternalStore` is how this codebase already reads a value that only exists in the
 *    browser (`context/auth-context.tsx` does the same for the last sign-in method). It keeps the
 *    server render and the first client render agreeing on `null`, and it means no effect ever
 *    calls `setState` synchronously.
 *
 * The parsing and validation live in `lib/give-link.ts`, which is pure and unit-tested. This file
 * only owns *when* that happens and the one `history.replaceState` that follows it.
 */

import * as React from "react";
import { readGiveAddress, stripGiveParam } from "@/lib/give-link";

let consumed: `0x${string}` | null = null;
let hasConsumed = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/**
 * Reads the parameter and removes it from the address bar. Idempotent: every call after the
 * first is a no-op, so two sheets mounting together do not race.
 */
export function consumeGiveParam(): void {
  if (hasConsumed || typeof window === "undefined") return;
  hasConsumed = true;

  const named = readGiveAddress(window.location.search);
  if (named === null) return;

  consumed = named;
  const rest = stripGiveParam(window.location.search);
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${rest}${window.location.hash}`,
  );
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): `0x${string}` | null {
  return consumed;
}

/** The server has no URL bar and must render the same "nobody named yet" as the first client pass. */
function getServerSnapshot(): `0x${string}` | null {
  return null;
}

/** Forgets what was read. Tests only. */
export function resetGiveParam(): void {
  consumed = null;
  hasConsumed = false;
  listeners.clear();
}

/** The address a scanned link named, or null. */
export function useGiveParam(): `0x${string}` | null {
  React.useEffect(() => {
    consumeGiveParam();
  }, []);
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
