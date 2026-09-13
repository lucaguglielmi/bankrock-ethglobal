"use client";

import * as React from "react";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cn } from "@/lib/ui/cn";

/**
 * The one tabs primitive (spec 17 §4.5, Part 5 "Rock page").
 *
 * Built on `@base-ui/react` Tabs, which supplies `role="tablist"` / `role="tab"` /
 * `role="tabpanel"`, `aria-selected`, `aria-controls`, roving focus and arrow-key navigation.
 * Nothing of that is reimplemented here; this file only decides how the tabs look:
 *
 *  - quiet underline tabs, 48 px tall, `text-sm` 500, equal width so four fit at 360 px;
 *  - the active tab is `text-ink` with a 2 px ink underline, the others `text-ink-3`;
 *  - the tab list sticks just under the fixed header, so switching stays one tap away while a
 *    long panel scrolls.
 *
 * Always controlled: the page owns the value, so another surface ("Trade" from the Liquidity
 * tab, a `#contracts` hash) can switch tabs without reaching into this component.
 */

export interface TabsProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  className?: string;
  children: React.ReactNode;
}

function Tabs<T extends string>({ value, onValueChange, className, children }: TabsProps<T>) {
  return (
    <TabsPrimitive.Root
      value={value}
      onValueChange={(next) => {
        // Base UI reports `null` when no tab can be active; the page always has one, so that
        // answer is not a change worth forwarding.
        if (typeof next === "string") onValueChange(next as T);
      }}
      className={cn("flex w-full flex-col gap-6", className)}
    >
      {children}
    </TabsPrimitive.Root>
  );
}

/** The sticky tab bar. Children are `TabsTab`s. */
function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      className={cn(
        "sticky top-[calc(var(--header-h)+var(--safe-top))] z-10 flex w-full border-b border-border bg-background",
        className,
      )}
      {...props}
    />
  );
}

function TabsTab({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      className={cn(
        "-mb-px flex h-12 min-w-0 flex-1 items-center justify-center border-b-2 border-transparent px-2 text-sm font-medium text-ink-3 select-none",
        "motion-safe:transition-colors hover:text-ink-2",
        "data-active:border-ink data-active:text-ink",
        "data-disabled:pointer-events-none data-disabled:text-ink-4",
        className,
      )}
      {...props}
    />
  );
}

/** One panel per tab. Unmounted while inactive, so a hidden tab does no work. */
function TabsPanel({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      className={cn("flex w-full flex-col gap-6 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTab, TabsPanel };
