"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "@/lib/ui/cn";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";

/**
 * Tap-friendly popover for glossary terms and other content that a
 * hover-only tooltip cannot reach on touch (spec 17 §4.4, L-12).
 */
function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

/**
 * An underlined-dotted inline trigger with a 44 px hit area. The visible
 * underline sits on the text; the extra hit area is added with padding and
 * cancelled out with a matching negative margin so surrounding text layout
 * is unaffected.
 */
function PopoverTrigger({ className, ...props }: PopoverPrimitive.Trigger.Props) {
  return (
    <PopoverPrimitive.Trigger
      data-slot="popover-trigger"
      className={cn(
        "inline-flex -my-2.5 -mx-1 items-center px-1 py-2.5 align-baseline",
        "underline decoration-dotted decoration-ink-3 underline-offset-4",
        "outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring/50",
        className
      )}
      {...props}
    />
  );
}

function PopoverContent({
  className,
  side = "top",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  children,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Backdrop className="fixed inset-0" />
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-[var(--z-sheet)]"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "w-72 max-w-[calc(100vw-2rem)] origin-(--transform-origin) rounded-2xl border border-border bg-background p-4 text-sm text-ink-2 shadow-xl outline-none",
            "motion-safe:transition-[opacity,transform] motion-safe:duration-150",
            "data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0",
            className
          )}
          {...props}
        >
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

/**
 * A tappable glossary term. Renders a `Popover` on coarse (touch) pointers,
 * where hover tooltips are unreachable, and a `Tooltip` everywhere else.
 * Detected once on mount via `matchMedia("(hover: none)")`; defaults to the
 * pointer (tooltip) presentation until that check resolves.
 */
export interface HelpTermProps {
  /** The underlined term shown inline in running text. */
  term: React.ReactNode;
  /** The explanation shown in the popover/tooltip. */
  children: React.ReactNode;
  className?: string;
}

function subscribeToCoarsePointer(callback: () => void) {
  const mql = window.matchMedia("(hover: none)");
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getCoarsePointerSnapshot() {
  return window.matchMedia("(hover: none)").matches;
}

function getCoarsePointerServerSnapshot() {
  return false;
}

function HelpTerm({ term, children, className }: HelpTermProps) {
  const isCoarsePointer = React.useSyncExternalStore(
    subscribeToCoarsePointer,
    getCoarsePointerSnapshot,
    getCoarsePointerServerSnapshot
  );

  if (isCoarsePointer) {
    return (
      <Popover>
        <PopoverTrigger className={className}>{term}</PopoverTrigger>
        <PopoverContent>{children}</PopoverContent>
      </Popover>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          className={cn(
            "inline-flex -my-2.5 -mx-1 items-center px-1 py-2.5 align-baseline",
            "underline decoration-dotted decoration-ink-3 underline-offset-4",
            "outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring/50",
            className
          )}
        >
          {term}
        </TooltipTrigger>
        <TooltipContent className="text-sm">{children}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export { Popover, PopoverTrigger, PopoverContent, HelpTerm };
