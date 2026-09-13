import type { LucideIcon } from "lucide-react";
import { CircleSlash } from "lucide-react";
import { cn } from "@/lib/ui/cn";
import { Button } from "@/components/ui/button";

/**
 * The honest empty state for a capability in the `UNAVAILABLE` state (spec
 * 15 Part 3; spec 17 Part 5): its real backing is unreachable, so nothing is
 * substituted for it - there is no simulated fallback to fall through to.
 */
export interface UnavailableStateProps {
  /** One sentence explaining what is missing, in plain language. */
  reason: string;
  icon?: LucideIcon;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

function UnavailableState({
  reason,
  icon: Icon = CircleSlash,
  action,
  className,
}: UnavailableStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-2xl border border-border px-4 py-10 text-center",
        className
      )}
    >
      <Icon aria-hidden className="size-8 text-ink-4" />
      <p className="max-w-prose text-base text-ink-2">{reason}</p>
      {action ? (
        <Button size="default" variant="outline" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}

export { UnavailableState };
