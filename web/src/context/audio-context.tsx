"use client";

import React, { createContext, useContext, useSyncExternalStore } from "react";
// In a real production app we would host these as actual .mp3 or .wav files in the /public/sounds/ folder.
// For the sake of this implementation, we use synthetic beeps/boops or placeholder URLs that will fail gracefully if missing.
import useSound from "use-sound";

export interface AudioContextType {
  isMuted: boolean;
  toggleMute: () => void;
  playTap: () => void;
  playSuccess: () => void;
  playError: () => void;
  playSwipe: () => void;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

/**
 * The mute preference is an external store (localStorage) read through useSyncExternalStore,
 * not state hydrated inside an effect: the server snapshot is "not muted", the client snapshot is
 * whatever the visitor last chose, and there is no hydration flicker to paper over with a
 * `mounted` flag.
 */
const MUTE_KEY = "bankrock_muted";
const muteListeners = new Set<() => void>();
let muteCache: boolean | undefined;

function readMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(MUTE_KEY) === "true";
  } catch {
    return false;
  }
}

function getMutedSnapshot(): boolean {
  if (muteCache === undefined) {
    muteCache = readMuted();
  }
  return muteCache;
}

function getServerMutedSnapshot(): boolean {
  return false;
}

function subscribeMuted(callback: () => void): () => void {
  muteListeners.add(callback);
  const onStorage = () => {
    muteCache = readMuted();
    callback();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    muteListeners.delete(callback);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

function writeMuted(next: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, String(next));
  } catch {
    // Storage restricted: the preference simply does not persist across visits.
  }
  muteCache = next;
  muteListeners.forEach((listener) => listener());
}

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const isMuted = useSyncExternalStore(subscribeMuted, getMutedSnapshot, getServerMutedSnapshot);

  const toggleMute = () => {
    writeMuted(!isMuted);
  };

  // Replace these with your actual sound file paths in /public
  // E.g., "/sounds/tap.mp3"
  const [playTapSound] = useSound("/sounds/tap.mp3", { volume: 0.5, soundEnabled: !isMuted });
  const [playSuccessSound] = useSound("/sounds/success.mp3", { volume: 0.6, soundEnabled: !isMuted });
  const [playErrorSound] = useSound("/sounds/error.mp3", { volume: 0.5, soundEnabled: !isMuted });
  const [playSwipeSound] = useSound("/sounds/swipe.mp3", { volume: 0.4, soundEnabled: !isMuted });

  // Web Haptics API fallback
  const triggerHaptic = (pattern: number | number[]) => {
    if (!isMuted && typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
      try {
        window.navigator.vibrate(pattern);
      } catch {
        // Haptics are optional; a browser that blocks them changes nothing else.
      }
    }
  };

  const playTap = () => {
    playTapSound();
    triggerHaptic(10);
  };

  const playSuccess = () => {
    playSuccessSound();
    triggerHaptic([20, 50, 20]);
  };

  const playError = () => {
    playErrorSound();
    triggerHaptic([30, 50, 30, 50, 30]);
  };

  const playSwipe = () => {
    playSwipeSound();
    triggerHaptic(15);
  };

  return (
    <AudioContext.Provider
      value={{
        isMuted,
        toggleMute,
        playTap,
        playSuccess,
        playError,
        playSwipe,
      }}
    >
      {children}
    </AudioContext.Provider>
  );
}

export function useAudio() {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error("useAudio must be used within an AudioProvider");
  }
  return context;
}
