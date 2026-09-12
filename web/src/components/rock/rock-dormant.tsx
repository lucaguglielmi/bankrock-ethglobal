"use client";

/**
 * A dormant rock: the state every rock is in before someone taps it and takes it (Flow B).
 *
 * Awakening needs two things and says which one is missing: a signed-in wallet, and a tap this
 * server verified and signed for that wallet. Neither can be faked from the client (D-018).
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAudio } from "@/context/audio-context";
import { useHaptics } from "@/hooks/useHaptics";
import { useRockActions } from "@/hooks/useBankRock";
import {
  ActionOutcomeNotice,
  outcomeFrom,
  type ActionOutcome,
} from "@/components/rock/action-result";
import { signedAttestation, type TapAttestation } from "@/components/rock/use-tap-attestation";

export interface DormantRockProps {
  rockId: string;
  tap: TapAttestation;
  authenticated: boolean;
  address?: string;
  /** Opens the onboarding sheet — a dormant rock cannot be awakened by a visitor without a wallet. */
  onSignIn: () => void;
  onAwakened: () => void;
}

/** Why the button cannot be pressed yet, or null when it can. Signed-out is handled separately. */
function blockedReason(tap: TapAttestation, address?: string): string | null {
  if (tap.status === "absent") return "Tap the rock with your phone to awaken it";
  if (tap.status === "waiting" || tap.status === "checking" || tap.status === "held") {
    return "Checking this tap…";
  }
  if (!tap.verified) return "Tap the rock with your phone to awaken it";
  const attestation = tap.attestation;
  if (!attestation || attestation.state !== "SIGNED") {
    return "This tap could not be signed for your wallet. Sign in, then tap the rock again.";
  }
  if (!signedAttestation(tap, address)) {
    return "This tap names a different wallet. Tap the rock again while signed in with this one.";
  }
  return null;
}

export function DormantRock({
  rockId,
  tap,
  authenticated,
  address,
  onSignIn,
  onAwakened,
}: DormantRockProps) {
  const { awaken, isPending, availability } = useRockActions();
  const { playTap, playSuccess, playError } = useAudio();
  const { hapticHeavy, hapticSuccess, hapticError } = useHaptics();
  const [outcome, setOutcome] = useState<ActionOutcome | null>(null);

  const attestation = signedAttestation(tap, address);
  const registryReason =
    availability.registry.state === "UNAVAILABLE" ? availability.registry.reason : null;
  const reason = registryReason ?? (authenticated ? blockedReason(tap, address) : null);

  const handleAwaken = async () => {
    if (!authenticated) {
      playTap();
      onSignIn();
      return;
    }
    if (!attestation) return;

    playTap();
    hapticHeavy();
    const result = await awaken(rockId, attestation);
    const next = outcomeFrom(result);
    setOutcome(next);
    if (next.kind === "error") {
      playError();
      hapticError();
      return;
    }
    playSuccess();
    hapticSuccess();
    onAwakened();
  };

  return (
    <section className="flex flex-col gap-4">
      <p className="max-w-prose text-lead text-ink-2">
        This rock is asleep. Awaken it to open its account and put it in your hands.
      </p>

      <Button
        size="lg"
        className="w-full"
        onClick={handleAwaken}
        disabled={isPending || Boolean(registryReason) || (authenticated && !attestation)}
      >
        {isPending ? "Awakening…" : "Awaken this rock"}
      </Button>

      {reason ? (
        <p className="max-w-prose text-sm text-ink-3">{reason}</p>
      ) : !authenticated ? (
        <p className="text-sm text-ink-3">You will be asked to sign in first.</p>
      ) : null}

      <ActionOutcomeNotice outcome={outcome} successLabel="This rock is awake" />
    </section>
  );
}
