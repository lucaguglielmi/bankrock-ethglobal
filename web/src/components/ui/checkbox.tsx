import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/ui/cn";

/**
 * A checkbox whose `<input>` is the whole 44 × 44 px tap target (spec 17 Part 7 item 3), drawn as
 * a 24 px box. A native checkbox paints its glyph to fill whatever size it is given, so making one
 * 44 px makes a 44 px glyph; instead the input is `appearance-none`, transparent and stretched
 * over a `size-11` wrapper, and the box beside it is drawn from the input's own state (Tailwind's
 * `peer`), in the page's ink with lucide's `Check`, close to what `accent-ink` used to draw.
 *
 * The focus ring `globals.css` gives every input is moved from the (invisible) input onto the box,
 * where a native checkbox showed it.
 *
 * `className` goes on the 44 px wrapper. Pass `-m-2.5` to let it sit in a row exactly where a
 * 24 px checkbox would, its extra 10 px on each side overlapping the label around it.
 */
function Checkbox({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <span
      className={cn(
        "relative inline-flex size-11 shrink-0 items-center justify-center",
        className,
      )}
    >
      <input
        type="checkbox"
        data-slot="checkbox"
        className="peer absolute inset-0 cursor-pointer appearance-none outline-none focus-visible:ring-0 disabled:cursor-not-allowed"
        {...props}
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none flex size-6 items-center justify-center rounded-md border border-ink-4 bg-background text-transparent motion-safe:transition-colors",
          "peer-checked:border-ink peer-checked:bg-ink peer-checked:text-white",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-foreground peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
          "peer-disabled:opacity-50",
        )}
      >
        <Check className="size-4" strokeWidth={3} />
      </span>
    </span>
  );
}

export { Checkbox };
