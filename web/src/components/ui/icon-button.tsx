import * as React from "react";
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cn } from "@/lib/ui/cn";

/**
 * The only way to render an icon-only control (spec 17 §4.5, L-8).
 * Always 44 × 44 CSS pixels with a 20 px icon; `aria-label` is required
 * because there is no visible text to name the control for assistive tech.
 */
export interface IconButtonProps
  extends Omit<ButtonPrimitive.Props, "children"> {
  /** Required — this control has no visible label. */
  "aria-label": string;
  variant?: "ghost" | "outline" | "solid";
  /** The icon element, e.g. `<Copy />` from lucide-react. Sized to 20 px automatically. */
  children: React.ReactNode;
}

const variantClasses: Record<NonNullable<IconButtonProps["variant"]>, string> = {
  ghost: "bg-transparent text-ink-2 hover:bg-muted hover:text-ink",
  outline: "border border-border bg-background text-ink-2 hover:bg-muted hover:text-ink",
  solid: "bg-primary text-primary-foreground hover:bg-primary/80",
};

function IconButton({
  className,
  variant = "ghost",
  ...props
}: IconButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="icon-button"
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-transparent motion-safe:transition-colors outline-none select-none",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        "disabled:pointer-events-none disabled:opacity-50",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}

export { IconButton };
