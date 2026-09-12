import { useCallback } from "react";

export function useHaptics() {
  const vibrate = useCallback((pattern: number | number[]) => {
    if (typeof window !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {
        // Ignore, some browsers might block this without user interaction
      }
    }
  }, []);

  const hapticLight = useCallback(() => vibrate(10), [vibrate]);
  const hapticMedium = useCallback(() => vibrate(20), [vibrate]);
  const hapticHeavy = useCallback(() => vibrate(40), [vibrate]);
  
  const hapticSuccess = useCallback(() => vibrate([15, 100, 20]), [vibrate]);
  const hapticError = useCallback(() => vibrate([50, 100, 50, 100, 50]), [vibrate]);
  const hapticWarning = useCallback(() => vibrate([30, 100, 30]), [vibrate]);

  return {
    hapticLight,
    hapticMedium,
    hapticHeavy,
    hapticSuccess,
    hapticError,
    hapticWarning,
  };
}
