"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/ui/cn";

/**
 * The single fixed-bottom container (spec 17 §4.9, L-4). Rendered once in
 * the root layout. Its only occupants are things like the demo switcher,
 * the update toast and the `sonner` `Toaster` — nothing else may be
 * `position: fixed` at the bottom of the viewport.
 *
 * Measures its own height with `ResizeObserver` and writes it to
 * `--dock-h` on the document root, so `main`'s bottom padding (spec 17
 * §4.2) always clears it.
 */
export interface BottomDockProps {
  children?: React.ReactNode;
  className?: string;
}

function BottomDock({ children, className }: BottomDockProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height ?? 0;
      document.documentElement.style.setProperty("--dock-h", `${height}px`);
    });
    observer.observe(node);

    return () => {
      observer.disconnect();
      document.documentElement.style.setProperty("--dock-h", "0px");
    };
  }, []);

  return (
    <div
      ref={containerRef}
      id="bottom-dock"
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 flex flex-col items-stretch gap-2",
        "px-[var(--gutter)] pb-[var(--safe-bottom)]",
        className
      )}
      style={{ zIndex: "var(--z-dock)" }}
    >
      {React.Children.map(children, (child, index) =>
        child == null ? null : (
          <div key={index} className="pointer-events-auto">
            {child}
          </div>
        )
      )}
    </div>
  );
}

function subscribeToBottomDock(onChange: () => void) {
  // The node itself never changes after mount, but a caller's first render
  // can happen before `<BottomDock>` has committed to the DOM in the same
  // pass; queue one recheck right after mount to pick that up.
  const id = requestAnimationFrame(onChange);
  return () => cancelAnimationFrame(id);
}

function getBottomDockSnapshot(): HTMLElement | null {
  return document.getElementById("bottom-dock");
}

function getBottomDockServerSnapshot(): HTMLElement | null {
  return null;
}

/**
 * Returns the live `#bottom-dock` DOM node once it has mounted, or `null`
 * before that (always `null` during server rendering). `<BottomDock>` is
 * rendered once at the root.
 */
function useBottomDock(): HTMLElement | null {
  return React.useSyncExternalStore(
    subscribeToBottomDock,
    getBottomDockSnapshot,
    getBottomDockServerSnapshot
  );
}

/**
 * Portals its children into the root `<BottomDock>` from anywhere in the
 * tree. Each portalled child is automatically wrapped so it is interactive
 * (`pointer-events-auto`) inside the otherwise click-through dock container.
 */
function BottomDockSlot({ children }: { children: React.ReactNode }) {
  const container = useBottomDock();
  if (!container) return null;
  return createPortal(<div className="pointer-events-auto">{children}</div>, container);
}

export { BottomDock, BottomDockSlot, useBottomDock };
