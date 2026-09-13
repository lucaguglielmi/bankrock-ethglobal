"use client";

/**
 * The one place the page states whether the tap was real (spec 15 D-018).
 *
 * "Verified physical" appears only when the server verified a CMAC. Everything else - a shared
 * link, a replayed URL, an unconfigured verifier, a page opened from a bookmark - reads
 * "Unverified", with an explanation a visitor can act on.
 *
 * A held tap is a fourth case: the parameters are there and untouched, and the single
 * verification is being saved for the moment it can also authorise awakening.
 */

import { ShieldCheck, ShieldQuestion } from "lucide-react";
import { HelpTerm } from "@/components/ui/popover";
import { tapReasonText, type TapAttestation } from "@/components/rock/use-tap-attestation";

const HELP_TEXT =
  "Only a real tap on this rock produces a verified badge. Opening a copied or shared link cannot.";

export function AttestationLine({ tap }: { tap: TapAttestation }) {
  if (tap.status === "waiting" || tap.status === "checking") {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-3">
        <ShieldQuestion aria-hidden className="size-4 shrink-0" />
        Checking this tap…
      </p>
    );
  }

  if (tap.status === "held") {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-3">
        <ShieldQuestion aria-hidden className="size-4 shrink-0" />
        Tap detected, sign in to awaken
      </p>
    );
  }

  if (tap.status === "checked" && tap.verified) {
    return (
      <p className="flex items-center gap-2 text-sm font-medium text-link">
        <ShieldCheck aria-hidden className="size-4 shrink-0" />
        Verified physical
      </p>
    );
  }

  const reason =
    tap.status === "checked" ? tapReasonText(tap.reason, tap.message ?? undefined) : null;

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-3">
      <span className="inline-flex items-center gap-2">
        <ShieldQuestion aria-hidden className="size-4 shrink-0" />
        <HelpTerm term="Unverified">{HELP_TEXT}</HelpTerm>
      </span>
      {reason ? <span>· {reason}</span> : null}
    </p>
  );
}
