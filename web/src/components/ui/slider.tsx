"use client";

import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { cn } from "@/lib/ui/cn";

/**
 * The one slider primitive (spec 17 §4.5): a single thumb on a thin track.
 *
 * Built on `@base-ui/react` Slider, which supplies the hidden `<input type="range">`, keyboard
 * stepping (arrows, Home/End, Page Up/Down) and pointer handling. Nothing about that is
 * reimplemented here. The control band is 44 px tall so a thumb of 24 px is still comfortable to
 * grab; the thumb itself carries a 44 px invisible hit area on top of that.
 *
 * Always controlled: the value is state the surface owns, because it is turned into token
 * amounts elsewhere and the two must never disagree.
 */
export interface SliderProps {
  value: number;
  onValueChange: (value: number) => void;
  /** Required - the thumb has no visible label of its own. */
  "aria-label": string;
  /** Spoken value for assistive tech, e.g. `(v) => \`${v}%\``. Defaults to the plain number. */
  formatValueText?: (value: number) => string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
}

function Slider({
  value,
  onValueChange,
  "aria-label": ariaLabel,
  formatValueText,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  className,
}: SliderProps) {
  return (
    <SliderPrimitive.Root
      value={value}
      onValueChange={(next) => onValueChange(next)}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      thumbAlignment="edge"
      className={cn("w-full", className)}
    >
      <SliderPrimitive.Control className="flex h-11 w-full touch-none items-center select-none">
        <SliderPrimitive.Track className="h-1.5 w-full rounded-full bg-border select-none">
          <SliderPrimitive.Indicator className="rounded-full bg-ink select-none data-disabled:bg-ink-4" />
          <SliderPrimitive.Thumb
            aria-label={ariaLabel}
            getAriaValueText={
              formatValueText ? (_formatted, current) => formatValueText(current) : undefined
            }
            className={cn(
              "relative size-6 rounded-full border-2 border-ink bg-background select-none",
              "motion-safe:transition-shadow",
              // A 44 px hit area around a 24 px thumb.
              "before:absolute before:-inset-2.5 before:rounded-full before:content-['']",
              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background",
              "data-disabled:border-ink-4",
            )}
          />
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider };
