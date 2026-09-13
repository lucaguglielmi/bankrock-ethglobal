"use client";

/**
 * The Ownership tab: who holds this rock, how to hand it on, and where it has been.
 *
 * In reading order on a phone:
 *
 *   one sentence of status → the handover, when one is open → "Change ownership" for the owner
 *   → provenance → alerts and naming, collapsed
 *
 * The owner's rarer actions (retire, mark lost, cancel a handover) stay in the header's owner
 * menu. This tab is the one place the owner's address is shown to a visitor; the default tab
 * shows no address at all.
 */

import { Address } from "@/components/ui/address";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { explorer } from "@/lib/chain";
import type { Capability } from "@/lib/demo";
import { RockActivity } from "@/components/rock-activity";
import { RockAlerts } from "@/components/rock-alerts";
import { SocialBridge } from "@/components/social-bridge";
import { HandoverRock, type HandoverDetails } from "@/components/rock/rock-handover";
import type { TapAttestation } from "@/components/rock/use-tap-attestation";

export type OwnershipState = "dormant" | "awake" | "handover_pending";

export interface OwnershipTabProps {
  rockId: string;
  state: OwnershipState;
  /** The registry's owner. Absent while the rock is dormant. */
  owner?: string;
  /** The open handover, only while `state` is `handover_pending`. */
  handover: HandoverDetails | null;
  isOwner: boolean;
  authenticated: boolean;
  address?: string;
  tap: TapAttestation;
  /**
   * Whether this wallet may act from the rock's account (D-037). Changing ownership pre-signs
   * the account's owner swap, so an UNAVAILABLE answer disables the button and is shown as the
   * reason.
   */
  ownerActions?: Capability<string>;
  onSignIn: () => void;
  /** Opens the "Change ownership" sheet. */
  onChangeOwnership: () => void;
  onChanged: () => void;
}

export function OwnershipTab({
  rockId,
  state,
  owner,
  handover,
  isOwner,
  authenticated,
  address,
  tap,
  ownerActions,
  onSignIn,
  onChangeOwnership,
  onChanged,
}: OwnershipTabProps) {
  if (state === "dormant") {
    return (
      <p className="max-w-prose text-lead text-ink-2">
        Nobody owns this rock yet. Whoever awakens it becomes its first owner.
      </p>
    );
  }

  const blockedReason =
    ownerActions && ownerActions.state === "UNAVAILABLE" ? ownerActions.reason : null;

  return (
    <>
      <p className="flex max-w-prose flex-wrap items-center gap-x-2 gap-y-1 text-lead text-ink-2">
        {isOwner ? (
          "You own this rock."
        ) : owner ? (
          <>
            Owned by
            <Address value={owner} explorerHref={explorer.address(owner)} />
          </>
        ) : (
          "This rock has an owner."
        )}
      </p>

      {state === "handover_pending" ? (
        <HandoverRock
          rockId={rockId}
          handover={handover}
          isOwner={isOwner}
          authenticated={authenticated}
          address={address}
          tap={tap}
          onSignIn={onSignIn}
          onChanged={onChanged}
        />
      ) : null}

      {state === "awake" && isOwner ? (
        <div className="flex flex-col gap-3">
          <Button
            size="lg"
            className="w-full"
            onClick={onChangeOwnership}
            disabled={blockedReason !== null}
          >
            Change ownership
          </Button>
          <p className="max-w-prose text-sm text-ink-3">
            {blockedReason ??
              "Hand this rock to someone else. It changes hands when they tap it."}
          </p>
        </div>
      ) : null}

      <RockActivity rockId={rockId} />

      <Accordion className="border-t border-border">
        {isOwner ? (
          <AccordionItem value="alerts">
            <AccordionTrigger className="min-h-12 items-center text-base font-medium text-ink">
              Alerts
            </AccordionTrigger>
            <AccordionContent className="pb-6">
              <RockAlerts rockId={rockId} />
            </AccordionContent>
          </AccordionItem>
        ) : null}
        <AccordionItem value="name">
          <AccordionTrigger className="min-h-12 items-center text-base font-medium text-ink">
            Name this rock
          </AccordionTrigger>
          <AccordionContent className="pb-6">
            <SocialBridge rockId={rockId} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </>
  );
}
