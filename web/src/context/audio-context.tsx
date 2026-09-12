"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
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

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [isMuted, setIsMuted] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("bankrock_muted");
    if (saved === "true") {
      setIsMuted(true);
    }
  }, []);

  const toggleMute = () => {
    setIsMuted((prev) => {
      const next = !prev;
      localStorage.setItem("bankrock_muted", String(next));
      return next;
    });
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
      } catch (e) {
        // Ignore haptics error
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
        isMuted: !mounted ? false : isMuted,
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
