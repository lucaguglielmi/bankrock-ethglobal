"use client";

import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";

export function VersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const currentVersion = process.env.NEXT_PUBLIC_APP_VERSION;
    // In dev mode or if undefined, don't check
    if (!currentVersion || currentVersion === "dev") return;

    const checkVersion = async () => {
      try {
        const res = await fetch(`/api/version?t=${Date.now()}`, {
          cache: "no-store",
        });
        const data = await res.json();
        
        if (data.version && data.version !== "dev" && data.version !== currentVersion) {
          setUpdateAvailable(true);
        }
      } catch (e) {
        console.error("Failed to check version", e);
      }
    };

    // Check a few seconds after mount to not block initial render/network
    const initialCheck = setTimeout(checkVersion, 3000);

    // Check every 5 minutes
    const interval = setInterval(checkVersion, 5 * 60 * 1000);
    
    // Check on window focus
    const onFocus = () => checkVersion();
    window.addEventListener("focus", onFocus);

    return () => {
      clearTimeout(initialCheck);
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const handleRefresh = async () => {
    // Attempt to clear caches (e.g., service workers, or fetch caches)
    if (typeof window !== "undefined" && "caches" in window) {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
      } catch (e) {
        console.error("Failed to clear caches", e);
      }
    }
    
    // Clear local storage and session storage if needed, but this might log out users. 
    // We'll skip clearing storage to keep user sessions, as PWA caching issue is usually related to the Service Worker Cache Storage or HTTP Cache.
    
    // Hard reload the page
    window.location.reload();
  };

  if (!updateAvailable || isDismissed) return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex w-[90%] -translate-x-1/2 items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4 text-black shadow-2xl sm:bottom-8 sm:w-auto sm:min-w-[400px]">
      <div className="flex flex-col">
        <p className="text-sm font-semibold">New version available</p>
        <p className="text-xs text-gray-500">Click refresh to update.</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleRefresh}
          className="flex cursor-pointer items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
        <button
          onClick={() => setIsDismissed(true)}
          className="flex p-2 text-gray-400 hover:text-gray-600 cursor-pointer"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
