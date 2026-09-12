"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

export function A2HSBanner() {
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Check if device is iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    // Check if app is running in standalone mode (installed)
    const isRunningStandalone = window.matchMedia('(display-mode: standalone)').matches || ('standalone' in window.navigator && (window.navigator as any).standalone === true);
    setIsStandalone(isRunningStandalone);

    // Show banner if on iOS and not installed
    if (isIosDevice && !isRunningStandalone) {
      // Optional: check localStorage so we don't annoy them every time
      const dismissed = localStorage.getItem("a2hs_dismissed");
      if (!dismissed) {
        setShowBanner(true);
      }
    }
  }, []);

  const dismiss = () => {
    setShowBanner(false);
    localStorage.setItem("a2hs_dismissed", "true");
  };

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 shadow-xl flex items-center justify-between pb-safe">
      <div className="flex-1 pr-4 text-sm text-zinc-700 dark:text-zinc-300">
        Install <strong>Bank Rock</strong> on your iPhone for offline access and NFC tapping. Tap <span className="inline-block border border-zinc-300 dark:border-zinc-700 rounded px-1 text-xs">Share</span> and then <strong>Add to Home Screen</strong>.
      </div>
      <button onClick={dismiss} className="p-2 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
        <X size={16} className="text-zinc-500" />
      </button>
    </div>
  );
}
