"use client";

/**
 * One place for sound and haptics (STEERING.md: "a strong, centralized audio library for
 * site-wide haptics and sounds").
 *
 * The primitives call this - `Button` on press, `Sheet` on open - so no surface has to remember
 * to, and muting stays in one place: the header's mute toggle drives `AudioProvider`, which is
 * what decides whether a sound plays at all.
 *
 * `useAudio()` throws when no `AudioProvider` is mounted (a test harness, a story, a page
 * rendered outside the app shell). A primitive must never take a page down over a sound effect,
 * so the context read is optional here: no provider simply means no sound. The hook is still
 * called unconditionally on every render, so hook order never changes.
 */

import { useCallback } from "react";
import { useAudio, type AudioContextType } from "@/context/audio-context";
import { useHaptics } from "@/hooks/useHaptics";

function useOptionalAudio(): AudioContextType | null {
  try {
    return useAudio();
  } catch {
    return null;
  }
}

export interface Feedback {
  /** A press: a light tick and the tap sound. */
  tap: () => void;
}

export function useFeedback(): Feedback {
  const audio = useOptionalAudio();
  const { hapticLight } = useHaptics();

  const tap = useCallback(() => {
    hapticLight();
    audio?.playTap();
  }, [hapticLight, audio]);

  return { tap };
}
