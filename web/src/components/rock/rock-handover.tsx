"use client";

/**
 * A rock that has been given away but not yet collected (Flow E).
 *
 * The owner sees who it is waiting for and how long is left. Everyone else sees whether they can
 * take it — which requires a verified tap signed for their own wallet, so holding the link is
 * never enough (D-018).
 */

import { useEffect, useState } from "react";
import { Address } from "@/components/ui/address";
import { Button } from "@/components/ui/button";
import { explorer } from "@/lib/chain";
import { useAudio } from "@/context/audio-context";
import { useHaptics } from "@/hooks/useHaptics";
import { useRockActions } from "@/hooks/useBankRock";
import {
  ActionOutcomeNotice,
  outcomeFrom,
  type ActionOutcome,
} from "@/components/rock/action-result";
import { signedAttestation, type TapAttestation } from "@/components/rock/use-tap-attestation";
import { formatDateTime, formatDuration, sameAddress, toMillis } from "@/components/rock/util";

export interface HandoverDetails {
  recipient: string | null;
  expiresAt: number | bigint | string;
}

export interface HandoverRockProps {
  rockId: string;
  handover: HandoverDetails | null;
  isOwner: boolean;
  authenticated: boolean;
  address?: string;
  tap: TapAttestation;
  onSignIn: () => void;
  onChanged: () => void;
}

const CLOCK_INTERVAL_MS = 30_000;

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), CLOCK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function HandoverRock({
  rockId,
  handover,
  isOwner,
  authenticated,
  address,
  tap,
  onSignIn,
  onChanged,
}: HandoverRockProps) {
  const { claimHandover, cancelHandover, isPending, availability } = useRockActions();
  const { playTap, playSuccess, playError } = useAudio();
  const { hapticSuccess, hapticError } = useHaptics();
  const [outcome, setOutcome] = useState<ActionOutcome | null>(null);
  const now = useNow();

  const expiresAt = toMillis(handover?.expiresAt);
  const hasExpired = expiresAt !== null && expiresAt <= now;
  const recipient = handover?.recipient ?? null;
  const attestation = signedAttestation(tap, address);
  const isNamedRecipient = recipient === null || sameAddress(recipient, address);
  const registryReason =
    availability.registry.state === "UNAVAILABLE" ? availability.registry.reason : null;
  const canClaim =
    Boolean(attestation) && isNamedRecipient && !hasExpired && registryReason === null;

  const expiryLine = hasExpired
    ? `This handover expired on ${formatDateTime(expiresAt) ?? "an earlier date"}.`
    : expiresAt !== null
      ? `Time left: ${formatDuration(expiresAt - now)}.`
      : null;

  const runClaim = async () => {
    if (!authenticated) {
      playTap();
      onSignIn();
      return;
    }
    if (!attestation) return;
    playTap();
    const result = outcomeFrom(await claimHandover(rockId, attestation));
    setOutcome(result);
    if (result.kind === "error") {
      playError();
      hapticError();
      return;
    }
    playSuccess();
    hapticSuccess();
    onChanged();
  };

  const runCancel = async () => {
    const result = outcomeFrom(await cancelHandover(rockId));
    setOutcome(result);
    if (result.kind !== "error") onChanged();
  };

  if (isOwner) {
    return (
      <section className="flex flex-col gap-4">
        <p className="max-w-prose text-lead text-ink-2">
          You have given this rock away. It changes hands when the new owner taps it.
        </p>
        <div className="flex flex-col gap-2 rounded-2xl border border-border p-4">
          <span className="flex flex-wrap items-center gap-2 text-sm text-ink-3">
            Waiting for
            {recipient ? (
              <Address value={recipient} explorerHref={explorer.address(recipient)} />
            ) : (
              <span className="text-ink-2">anyone who taps this rock</span>
            )}
          </span>
          {expiryLine ? <p className="text-sm text-ink-2">{expiryLine}</p> : null}
        </div>
        <Button
          size="lg"
          variant="outline"
          className="w-full"
          onClick={runCancel}
          disabled={isPending || registryReason !== null}
        >
          Cancel handover
        </Button>
        {registryReason ? <p className="max-w-prose text-sm text-ink-3">{registryReason}</p> : null}
        <ActionOutcomeNotice outcome={outcome} successLabel="The handover is cancelled" />
      </section>
    );
  }

  if (canClaim) {
    return (
      <section className="flex flex-col gap-4">
        <p className="max-w-prose text-lead text-ink-2">
          This rock is waiting for you. Claiming it makes you its owner.
        </p>
        <Button size="lg" className="w-full" onClick={runClaim} disabled={isPending}>
          {isPending ? "Claiming…" : "Claim this rock"}
        </Button>
        {expiryLine ? <p className="text-sm text-ink-3">{expiryLine}</p> : null}
        <ActionOutcomeNotice outcome={outcome} successLabel="This rock is yours" />
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <p className="max-w-prose text-lead text-ink-2">
        This rock is being handed over and is waiting to be collected.
      </p>
      {registryReason ? (
        <p className="max-w-prose text-sm text-ink-2">{registryReason}</p>
      ) : hasExpired ? (
        <p className="max-w-prose text-sm text-ink-2">
          {expiryLine} The owner can start a new handover.
        </p>
      ) : recipient && !isNamedRecipient ? (
        <p className="flex max-w-prose flex-wrap items-center gap-2 text-sm text-ink-2">
          It was set aside for
          <Address value={recipient} explorerHref={explorer.address(recipient)} />
          and only that wallet can claim it.
        </p>
      ) : !authenticated ? (
        <>
          <p className="max-w-prose text-sm text-ink-2">
            Sign in with the wallet this rock was given to, then tap the rock to claim it.
          </p>
          <Button size="lg" className="w-full" onClick={onSignIn}>
            Sign in to claim
          </Button>
        </>
      ) : (
        <p className="max-w-prose text-sm text-ink-2">
          Tap this rock with your phone while signed in to claim it. Opening a copied link is not
          enough.
        </p>
      )}
      {expiryLine && !hasExpired ? <p className="text-sm text-ink-3">{expiryLine}</p> : null}
    </section>
  );
}
