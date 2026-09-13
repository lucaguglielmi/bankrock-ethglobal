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

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

/**
 * The inline shape `HelpTerm` gives both of its triggers. The term is ordinary
 * inline text with the dotted underline in an `inline-block`, so a sentence
 * wraps and spaces around it exactly as it would around a plain word (and, as
 * a flex item — the header's "Sign-in unavailable" chip — it can still shrink
 * and wrap its own words at 320 px), and the `<button>` is a transparent hit
 * area laid over it: absolutely positioned, centred on the word and never
 * smaller than 44 × 44 px (spec 17 Part 7 item 3). Padding with
 * a matching negative margin used to do this, but it could only add height —
 * a short word such as "tap" stayed narrower than 44 px, and widening it would
 * have opened up the sentence. The text is hidden from assistive tech and
 * names the button instead (`aria-labelledby`), so a screen reader meets one
 * button, in place, named by the word — as when the word was its content.
 */
const termTextClassName =
  "relative inline-block underline decoration-dotted decoration-ink-3 underline-offset-4";

const termHitAreaClassName =
  "absolute inset-0 m-auto min-h-11 min-w-11 cursor-[inherit] outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring/50";

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
  const termId = React.useId();
  const text = (
    <span id={termId} aria-hidden>
      {term}
    </span>
  );

  if (isCoarsePointer) {
    return (
      <Popover>
        <span className={cn(termTextClassName, className)}>
          {text}
          <PopoverTrigger aria-labelledby={termId} className={termHitAreaClassName} />
        </span>
        <PopoverContent>{children}</PopoverContent>
      </Popover>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <span className={cn(termTextClassName, className)}>
          {text}
          <TooltipTrigger aria-labelledby={termId} className={termHitAreaClassName} />
        </span>
        <TooltipContent className="text-sm">{children}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export { Popover, PopoverTrigger, PopoverContent, HelpTerm };
