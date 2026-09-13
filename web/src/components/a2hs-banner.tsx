"use client";

/**
 * iOS "Add to Home Screen" banner (spec 14 §5).
 *
 * Shown only to iOS Safari, only when the app is not already installed (`display-mode:
 * standalone` / `navigator.standalone`), only on `/rock/*` - the page opened from an actual tap,
 * where installing pays off - and only until the visitor dismisses it once.
 *
 * Rendered in the normal document flow rather than `position: fixed` (spec 17 §4.9, L-4:
 * `<BottomDock>` is the only thing allowed to anchor to the bottom of the viewport, and this
 * banner is not one of its declared occupants).
 *
 * Not mounted anywhere yet - it never was (this component shipped on `main` without being
 * rendered from any page either). Wiring it in belongs on whichever route owns the rock page's
 * layout, outside this file.
 */

import * as React from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";

const DISMISSED_KEY = "a2hs_dismissed";

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "true";
  } catch {
    // Private browsing, blocked storage, or no `window` yet (SSR) - treat as not dismissed.
    return false;
  }
}

function writeDismissed(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, "true");
  } catch {
    // Nothing to fall back to; the banner simply reappears next visit.
  }
}

function noopSubscribe(): () => void {
  return () => {};
}

/**
 * True only for iOS Safari not already running standalone. Computed once from the environment
 * rather than in an effect: none of `userAgent`, `display-mode` or `navigator.standalone` change
 * while the page is open, so there is nothing to subscribe to and no `useEffect` + `setState`
 * round trip is needed to derive it - `useSyncExternalStore`'s server snapshot (`false`) also
 * keeps the server and first client render in agreement, so there is no hydration flash.
 */
function useIsEligibleDevice(): boolean {
  return React.useSyncExternalStore(
    noopSubscribe,
    () => {
      const userAgent = window.navigator.userAgent.toLowerCase();
      const isIOS = /iphone|ipad|ipod/.test(userAgent);
      const nav = window.navigator as Navigator & { standalone?: boolean };
      const isStandalone =
        window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
      return isIOS && !isStandalone;
    },
    () => false,
  );
}

export function A2HSBanner() {
  const pathname = usePathname();
  const eligibleDevice = useIsEligibleDevice();
  const [dismissed, setDismissed] = React.useState(readDismissed);

  const onRockPage = pathname?.startsWith("/rock") ?? false;
  if (!eligibleDevice || !onRockPage || dismissed) return null;

  return (
    <div className="flex w-full items-center gap-3 border-b border-border bg-neutral-50 px-[var(--gutter)] py-3">
      <p className="flex-1 text-sm text-ink-2">
        Install <strong className="text-ink">Bank Rock</strong> on your Home Screen for one-tap
        NFC scanning. Tap{" "}
        <span className="rounded border border-border px-1 text-caption text-ink-3">Share</span>{" "}
        then <strong className="text-ink">Add to Home Screen</strong>.
      </p>
      <IconButton
        aria-label="Dismiss"
        onClick={() => {
          writeDismissed();
          setDismissed(true);
        }}
      >
        <X />
      </IconButton>
    </div>
  );
}
