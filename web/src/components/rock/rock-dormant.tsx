"use client";

/**
 * A dormant rock: the state every rock is in before someone taps it and takes it (Flow B).
 *
 * Awakening needs two things and says which one is missing: a signed-in wallet, and a tap this
 * server verified and signed for that wallet. Neither can be faked from the client (D-018).
 *
 * It also shows **the account this rock would open** — the counterfactual Rock Account derived
 * from the verified tag and the signed-in wallet (D-029), which the page could not show at all
 * until `uidHash` was passed down from the tap. Flow B step 9 funds that address, and funding it
 * before awakening is legitimate: the Safe is deployed by the first sponsored UserOperation, and
 * tokens sent to the address beforehand are already the rock's when it wakes up. The one condition
 * is the wallet: the address is derived from `(subject, uidHash)`, so awakening with a different
 * wallet opens a different account, and the page says so next to the address rather than letting
 * an operator discover it after a transfer.
 */

import { useState } from "react";
import { Address } from "@/components/ui/address";
import { Button } from "@/components/ui/button";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { explorer } from "@/lib/chain";
import type { Capability } from "@/lib/demo";
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
  /**
   * The account this rock would open, from `useRockAccount` — derived from the verified tag and
   * the signed-in wallet (D-029). UNAVAILABLE carries the reason there is no address yet: signed
   * out, no tap, or the derivation could not be run.
   */
  rockAccount: Capability<string>;
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
  rockAccount,
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
  const tapBlocked = authenticated ? blockedReason(tap, address) : null;
  const reason = registryReason ?? tapBlocked;

  /*
   * Why there is no address yet. The tap is the more specific answer whenever it is the thing
   * that is missing: the derivation needs `uidHash` from a signed attestation, so "tap the rock
   * first" would otherwise be shown to somebody who has tapped it and whose tap could not be
   * signed.
   */
  const accountReason =
    rockAccount.state === "UNAVAILABLE" ? (tapBlocked ?? rockAccount.reason) : null;

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

      <div className="flex flex-col gap-2 rounded-2xl border border-border p-4">
        <h3 className="text-label text-ink-3">The account this rock would open</h3>
        {rockAccount.state === "UNAVAILABLE" ? (
          <UnavailableState reason={accountReason ?? rockAccount.reason} />
        ) : (
          <>
            <Address
              value={rockAccount.value}
              explorerHref={explorer.address(rockAccount.value)}
            />
            <p className="max-w-prose text-sm text-ink-2">
              Funds sent here before awakening belong to this rock once you awaken it with this
              wallet.
            </p>
            <p className="max-w-prose text-sm text-ink-3">
              The address comes from this tag and the wallet you are signed in with. Awaken with a
              different wallet and the rock opens a different account, and anything already sent
              here stays with this one.
            </p>
          </>
        )}
      </div>

      <ActionOutcomeNotice outcome={outcome} successLabel="This rock is awake" />
    </section>
  );
}
