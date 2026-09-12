"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/ui/cn";
import { IconButton } from "@/components/ui/icon-button";
import { useFeedback } from "@/components/sheets/use-feedback";

/**
 * The one overlay primitive (spec 17 §4.4). Below `sm` it is a full-width
 * bottom sheet; from `sm` up it is a centred dialog. Built on
 * `@base-ui/react` Dialog, which supplies focus trap, Escape, backdrop
 * dismissal, scroll lock and focus return — none of that is reimplemented
 * here, and nothing here ever writes an ad-hoc scroll lock on the body element.
 */
export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /**
   * Rendered in the sticky header, beside the title: a `SimulatedBadge` on a `DEMO` surface, a
   * state chip, a count. It stays put while the body scrolls, which is what a badge that must
   * survive a screenshot needs (spec 15 D-013).
   */
  headerAccessory?: React.ReactNode;
  footer?: React.ReactNode;
  /** `md` -> `max-w-md` above `sm`; `lg` -> `max-w-2xl`. @default "md" */
  size?: "md" | "lg";
  children: React.ReactNode;
}

function Sheet({
  open,
  onOpenChange,
  title,
  description,
  headerAccessory,
  footer,
  size = "md",
  children,
}: SheetProps) {
  const descriptionId = React.useId();
  const { tap } = useFeedback();
  const wasOpen = React.useRef(open);

  // One sound when the sheet arrives (STEERING.md), fired from the primitive so no surface has
  // to remember to. Nothing is set here, so this never cascades a render.
  React.useEffect(() => {
    const justOpened = open && !wasOpen.current;
    wasOpen.current = open;
    if (justOpened) tap();
  }, [open, tap]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className={cn(
            "fixed inset-0 bg-ink/40",
            "motion-safe:transition-opacity motion-safe:duration-150",
            "data-starting-style:opacity-0 data-ending-style:opacity-0"
          )}
          style={{ zIndex: "var(--z-sheet)" }}
        />
        <DialogPrimitive.Popup
          aria-describedby={description ? descriptionId : undefined}
          className={cn(
            "fixed flex flex-col overflow-hidden bg-background text-ink shadow-xl outline-none",
            // Mobile: bottom sheet, anchored to the viewport edge.
            "inset-x-0 bottom-0 max-h-[90dvh] w-full rounded-t-3xl",
            "motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out",
            "data-starting-style:translate-y-full data-ending-style:translate-y-full",
            // Desktop: centred dialog, sized to content via inset+auto-margin
            // (no transform, so it never fights the mobile slide animation).
            "sm:inset-0 sm:m-auto sm:bottom-auto sm:h-fit sm:max-h-[85dvh] sm:w-full sm:rounded-3xl",
            size === "lg" ? "sm:max-w-2xl" : "sm:max-w-md",
            "sm:data-starting-style:translate-y-0 sm:data-ending-style:translate-y-0",
            "sm:motion-safe:transition-[opacity,transform]",
            "sm:data-starting-style:scale-95 sm:data-starting-style:opacity-0",
            "sm:data-ending-style:scale-95 sm:data-ending-style:opacity-0"
          )}
          style={{ zIndex: "var(--z-sheet)" }}
        >
          <span
            aria-hidden
            className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border sm:hidden"
          />
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-4 pt-2 pb-3 sm:px-6 sm:pt-6 sm:pb-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <DialogPrimitive.Title className="text-h2 font-bold text-ink">
                  {title}
                </DialogPrimitive.Title>
                {headerAccessory}
              </div>
              {description ? (
                <DialogPrimitive.Description
                  id={descriptionId}
                  className="mt-1 text-sm text-ink-2"
                >
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close
              render={
                <IconButton aria-label="Close">
                  <X />
                </IconButton>
              }
              className="shrink-0"
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 sm:px-6">
            {children}
          </div>

          {footer ? <SheetFooter>{footer}</SheetFooter> : null}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** The scrollable body region. Wrap `Sheet` children in this for correct vertical padding. */
function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("py-4 sm:py-6", className)} {...props} />;
}

/**
 * The sticky footer holding the primary action. `Sheet` renders this itself
 * from its `footer` prop; exported so it can also be used when composing a
 * sheet-like layout from the raw Dialog parts.
 */
function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "shrink-0 border-t border-border bg-background px-4 pt-4 pb-[calc(1rem+var(--safe-bottom))] sm:px-6 sm:pb-6",
        className
      )}
      {...props}
    />
  );
}

export { Sheet, SheetBody, SheetFooter };
