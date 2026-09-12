"use client";

/**
 * A retired rock. Its history stays readable forever; only its future is over.
 */

import { RockActivity } from "@/components/rock-activity";

export function ArchivedRock({ rockId }: { rockId: string }) {
  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="text-h2 font-bold text-ink">Retired rock</h2>
        <p className="max-w-prose text-lead text-ink-2">
          This rock was retired. Everything it ever did is still below, and stays readable.
        </p>
        <p className="max-w-prose text-sm text-ink-2">
          The tag itself can awaken a new rock, which starts with its own empty history.
        </p>
      </section>

      <RockActivity rockId={rockId} />
    </>
  );
}
