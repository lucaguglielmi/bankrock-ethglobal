"use client";

import { useEffect, useState } from "react";
import { RefreshCw, X, ArrowUpCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
        const data = await res.json() as any;
        
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
    
    // Hard reload the page
    window.location.reload();
  };

  return (
    <AnimatePresence>
      {updateAvailable && !isDismissed && (
        <motion.div
          initial={{ opacity: 0, y: 50, x: "-50%" }}
          animate={{ opacity: 1, y: 0, x: "-50%" }}
          exit={{ opacity: 0, y: 20, x: "-50%" }}
          className="fixed bottom-6 left-1/2 z-[100] flex w-[92%] -translate-x-1/2 items-center justify-between gap-4 rounded-2xl border border-gray-200/60 bg-white/90 p-3 pl-4 shadow-2xl backdrop-blur-xl sm:bottom-8 sm:w-auto sm:min-w-[420px]"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-white shadow-sm">
              <ArrowUpCircle size={22} strokeWidth={2.5} />
            </div>
            <div className="flex flex-col">
              <p className="text-[15px] font-bold tracking-tight text-gray-900">Update Available</p>
              <p className="text-[13px] font-medium text-gray-500">A new version is ready.</p>
            </div>
          </div>
          
          <div className="flex items-center gap-1.5 pl-2">
            <button
              onClick={handleRefresh}
              className="flex cursor-pointer items-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-gray-800 active:scale-95"
            >
              <RefreshCw size={16} />
              Update Now
            </button>
            <button
              onClick={() => setIsDismissed(true)}
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-900 active:scale-95"
              aria-label="Dismiss"
            >
              <X size={20} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
