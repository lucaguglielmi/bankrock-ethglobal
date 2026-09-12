"use client";

import { useEffect, useState } from "react";
import { RefreshCw, X, ArrowUpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { BottomDockSlot } from "@/components/ui/bottom-dock";

/**
 * Update-available notice. Lives in the root `<BottomDock>` (spec 17 §4.9,
 * L-4) rather than being its own fixed element — it is never `position:
 * fixed` itself, never `z-[100]`, and never pinned to `bottom-6`.
 */
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

    // Hard reload the page
    window.location.reload();
  };

  if (!updateAvailable || isDismissed) return null;

  return (
    <BottomDockSlot>
      <div className="flex w-full max-w-md flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background/95 px-4 py-3 shadow-xl backdrop-blur-xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <ArrowUpCircle size={18} strokeWidth={2.5} aria-hidden />
          </span>
          <p className="text-sm text-ink">A new version of Bank Rock is ready.</p>
        </div>

        <div className="flex items-center gap-1.5">
          <Button size="sm" onClick={handleRefresh}>
            <RefreshCw className="size-4" aria-hidden />
            Update now
          </Button>
          <IconButton aria-label="Dismiss update notice" onClick={() => setIsDismissed(true)}>
            <X />
          </IconButton>
        </div>
      </div>
    </BottomDockSlot>
  );
}
