"use client";

/**
 * Whether the page being rendered is the demo rock.
 *
 * `useDemoRock()` returns `null` on every other rock, and every seam in the real hooks reads
 * exactly that: `const demo = useDemoRock();` — null means the hook does what it always did.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { isDemoRockId } from "./constants";
import { resetDemoRock } from "./store";

export interface DemoRockHandle {
  rockId: string;
  /** Puts the demo back to its seed and forgets the stored copy. */
  reset(): void;
}

const DemoRockContext = createContext<DemoRockHandle | null>(null);

export function DemoRockProvider({ rockId, children }: { rockId: string; children: ReactNode }) {
  const handle = useMemo<DemoRockHandle | null>(
    () => (isDemoRockId(rockId) ? { rockId, reset: resetDemoRock } : null),
    [rockId],
  );
  return <DemoRockContext.Provider value={handle}>{children}</DemoRockContext.Provider>;
}

/** The demo handle inside `DemoRockProvider` for rock #420; `null` everywhere else. */
export function useDemoRock(): DemoRockHandle | null {
  return useContext(DemoRockContext);
}
