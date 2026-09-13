import { cn } from "@/lib/ui/cn";

/**
 * Marks a `DEMO`-state surface (spec 15 D-013, Part 3; spec 17 Part 5).
 * Persistent and non-dismissible - it is never conditionally hidden by user
 * interaction - and always rendered inline in normal flow, never absolutely
 * positioned or overlaid on top of content.
 */
export interface SimulatedBadgeProps {
  className?: string;
}

function SimulatedBadge({ className }: SimulatedBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full bg-warning-bg px-2 py-1 text-label text-ink",
        className
      )}
    >
      SIMULATED
    </span>
  );
}

export { SimulatedBadge };
