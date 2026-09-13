"use client";

/**
 * Where the demo state lives in the browser: one `localStorage` key, one in-memory copy, and a
 * subscription so every hook that reads it re-renders when it changes.
 *
 * A reload keeps the demo where it was; "Reset demo" (`resetDemoRock`) puts the seed back and
 * forgets the key. Storage that is blocked or full is not an error - the demo simply lives for the
 * page's lifetime.
 */

import { useSyncExternalStore } from "react";
import { DEMO_STORAGE_KEY } from "./constants";
import { deserializeDemoRock, seedDemoRock, serializeDemoRock, type DemoRockState } from "./state";

let cache: DemoRockState | null = null;
const listeners = new Set<() => void>();

/** One stable object for the server render; the client swaps in the browser's copy after hydration. */
const serverSnapshot: DemoRockState = seedDemoRock();

function load(): DemoRockState {
  if (typeof window === "undefined") return serverSnapshot;
  try {
    const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
    if (raw) {
      const parsed = deserializeDemoRock(raw);
      if (parsed) return parsed;
    }
  } catch {
    // Storage unavailable - start from the seed.
  }
  return seedDemoRock();
}

function persist(state: DemoRockState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DEMO_STORAGE_KEY, serializeDemoRock(state));
  } catch {
    // Storage unavailable or full - the in-memory copy still drives the page.
  }
}

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function readDemoRockState(): DemoRockState {
  if (!cache) cache = load();
  return cache;
}

/** Applies a pure mutation, persists the result and notifies every subscriber. */
export function commitDemoRockState(next: DemoRockState): void {
  cache = next;
  persist(next);
  emit();
}

/** Back to the seed. The stored copy is removed, not overwritten, so a stale shape cannot survive. */
export function resetDemoRock(): void {
  cache = seedDemoRock();
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(DEMO_STORAGE_KEY);
    } catch {
      // Nothing to forget.
    }
  }
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab of the same demo: pick up its writes.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== DEMO_STORAGE_KEY) return;
    cache = load();
    listener();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

function getServerSnapshot(): DemoRockState {
  return serverSnapshot;
}

/** The current demo state, re-rendering on every commit. Safe to call on any page: it only reads. */
export function useDemoRockState(): DemoRockState {
  return useSyncExternalStore(subscribe, readDemoRockState, getServerSnapshot);
}
