"use client";

/**
 * The Ownership tab: who holds this rock, how to hand it on, and where it has been.
 *
 * In reading order on a phone:
 *
 *   one sentence of status → the handover, when one is open → "Gift this rock" for the owner
 *   → provenance → alerts and naming, collapsed
 *
 * The owner's rarer actions (retire, mark lost, cancel a handover) stay in the header's owner
 * menu. This tab is the one place the owner's address is shown to a visitor; the default tab
 * shows no address at all.
 */

import { Gift } from "lucide-react";
import { Address } from "@/components/ui/address";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Term } from "@/components/ui/term";
import { explorer } from "@/lib/chain";
import type { Capability } from "@/lib/demo";
import { RockActivity } from "@/components/rock-activity";
import { RockAlerts } from "@/components/rock-alerts";
import { SocialBridge } from "@/components/social-bridge";
import { HandoverRock, type HandoverDetails } from "@/components/rock/rock-handover";
import { ReserveArt } from "@/components/rock/strategy-art";
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
  /** Opens the "Gift this rock" sheet. */
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
      <>
        <p className="max-w-prose text-lead text-ink-2">
          Nobody owns this rock yet. Whoever <Term k="awaken">awakens</Term> it becomes its first
          owner.
        </p>
        <p className="max-w-prose text-base text-ink-2">
          That first <Term k="tap" /> is checked by our server, recorded in the{" "}
          <Term k="registry" />, and opens the rock&rsquo;s own <Term k="rockAccount" />. Holding
          the rock is never enough on its own: the owner is the wallet that awakened it.
        </p>
      </>
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

      <p className="max-w-prose text-base text-ink-2">
        Ownership is written in the <Term k="registry" />, and the rock&rsquo;s tokens sit in its{" "}
        <Term k="rockAccount" />. When a rock is given away, both move to the new owner in one{" "}
        <Term k="claim" />, and every step is kept as public <Term k="provenance" /> below.
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
        <section className="flex flex-col gap-5 rounded-3xl border border-border bg-neutral-50/50 p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-6 lg:p-8">
          <div className="hidden shrink-0 sm:block sm:w-28 lg:w-32">
            <ReserveArt className="h-auto w-full text-ink opacity-80" />
          </div>
          <div className="flex flex-1 flex-col gap-4">
            <div className="flex flex-col gap-2">
              <h2 className="flex items-center gap-2 text-h3 font-semibold text-ink">
                <Gift aria-hidden className="size-5 shrink-0 text-ink-3" />
                Gift this rock to someone
              </h2>
              <p className="max-w-prose text-base text-ink-2">
                Bank Rocks are meant to be shared. When you gift the physical rock, its liquidity
                goes with it.
              </p>
            </div>
            <p className="max-w-prose text-sm text-ink-3">
              {blockedReason ??
                "Name who it is for. It changes hands the moment they tap it with their phone."}
            </p>
          </div>
          <div className="shrink-0 sm:w-auto">
            <Button
              size="lg"
              className="w-full sm:w-auto sm:px-8"
              onClick={onChangeOwnership}
              disabled={blockedReason !== null}
            >
              Gift this rock
            </Button>
          </div>
        </section>
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
