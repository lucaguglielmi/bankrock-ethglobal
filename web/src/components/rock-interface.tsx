"use client";

/**
 * The rock page — the page a physical tap opens (spec 17 Part 5, spec 15 Phase 1).
 *
 * Rewritten from scratch. What is gone, and why:
 *
 *  - `INITIAL_EVENTS`, the hardcoded owner and smart-account literals, `currentApy = 18.4`, the
 *    `Math.random()` faucet hash and its BaseScan link, and the `setTimeout` "stages" that
 *    narrated work nobody was doing (S-1, S-4, C-7, C-8, N-11, D-014);
 *  - the client-side verification state the demo switcher used to set (F-7). The only producer
 *    of `verified` is the server verifier, called once here;
 *  - "Base Sepolia" everywhere. The network is Ethereum Sepolia and every explorer link comes
 *    from `lib/chain` (D-015, D-023).
 *
 * What is left is one of five honest states — dormant, awake, handover pending, retired, or
 * "we cannot read this rock and here is why" — each rendered from `useRock`, with the tap
 * attestation stated above it in every case.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { useRock } from "@/hooks/useRock";
import { isDemoMode } from "@/lib/demo";
import { tokens } from "@/lib/chain";
import { toDisplayNumber } from "@/lib/ui/format";
import { SimulatedBadge } from "@/components/ui/simulated-badge";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { DemoSwitcher, type DemoScenario } from "@/components/demo-switcher";
import { TradeModal } from "@/components/trade-modal";
import { TransferModal } from "@/components/transfer-modal";
import { CrossChainModal } from "@/components/cross-chain-modal";
import { PrivyOnboardingModal } from "@/components/privy-onboarding-modal";
import { AttestationLine } from "@/components/rock/attestation-line";
import { RockIdentity } from "@/components/rock/rock-identity";
import { DormantRock } from "@/components/rock/rock-dormant";
import { AwakeRock } from "@/components/rock/rock-awake";
import { HandoverRock } from "@/components/rock/rock-handover";
import { ArchivedRock } from "@/components/rock/rock-archived";
import { RockSample } from "@/components/rock/rock-sample";
import { OwnerMenu } from "@/components/rock/owner-menu";
import { useTapAttestation, type TapGate } from "@/components/rock/use-tap-attestation";
import { sameAddress } from "@/components/rock/util";

export interface RockPageParams {
  e?: string;
  c?: string;
  enc?: string;
  ctr?: string;
  uid?: string;
}

export interface RockInterfaceProps {
  rockId: string;
  searchParams: RockPageParams;
}

export function RockInterface({ rockId, searchParams }: RockInterfaceProps) {
  const router = useRouter();
  const { ready, authenticated, address } = useAuth();
  const { rock, reserves, isLoading, refresh } = useRock(rockId);

  const record = rock.state === "UNAVAILABLE" ? null : rock.value;

  /*
   * Verifying a tap consumes its counter, so it happens once, at the moment its answer is worth
   * the most. On a dormant rock that is after sign-in, when `subject` can be bound into the
   * attestation that awakening needs; everywhere else it is as soon as the rock's state is known.
   */
  const rockResolved = record !== null || !isLoading;
  const gate: TapGate = !ready || !rockResolved
    ? "wait"
    : record?.state === "dormant" && !authenticated
      ? "hold"
      : "verify";

  const tap = useTapAttestation({
    rockId,
    params: { e: searchParams.e, c: searchParams.c, enc: searchParams.enc },
    subject: address,
    gate,
  });

  const [scenario, setScenario] = useState<DemoScenario>("awake");
  const [isOnboardingOpen, setOnboardingOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<"give" | "trade" | null>(null);
  const [isTradeOpen, setTradeOpen] = useState(false);
  const [isGiveOpen, setGiveOpen] = useState(false);
  const [isCrossChainOpen, setCrossChainOpen] = useState(false);

  const isOwner = sameAddress(record?.owner, address);

  /* ---------------------------------------------------------------------- */
  /* Tag → rock. A verified tap knows which rock it belongs to; the URL only  */
  /* claims one. When they disagree, the tag wins — and the verification      */
  /* travels with us in memory, because the counter is already spent and the  */
  /* SDM parameters must not be carried into another URL.                     */
  /* ---------------------------------------------------------------------- */
  useEffect(() => {
    if (tap.status !== "checked" || !tap.verified) return;
    const target = tap.effectiveRockId;
    if (!target || target === rockId) return;
    router.replace(`/rock/${target}`);
  }, [tap, rockId, router]);

  const requireSignIn = useCallback((action: "give" | "trade" | null) => {
    setPendingAction(action);
    setOnboardingOpen(true);
  }, []);

  const handleTrade = useCallback(() => {
    if (!authenticated) {
      requireSignIn("trade");
      return;
    }
    setTradeOpen(true);
  }, [authenticated, requireSignIn]);

  const handleGive = useCallback(() => {
    if (!authenticated) {
      requireSignIn("give");
      return;
    }
    setGiveOpen(true);
  }, [authenticated, requireSignIn]);

  const usdcReserve =
    reserves.state === "UNAVAILABLE"
      ? 0
      : toDisplayNumber(reserves.value.usdc, tokens.USDC.decimals);

  const showSamples = isDemoMode() && rock.state === "UNAVAILABLE" && !isLoading;

  let body: ReactNode;

  if (isLoading && !record) {
    // The capabilities read UNAVAILABLE while the first read is in flight; saying why something
    // is missing before it has had a chance to arrive would be its own small lie.
    body = <p className="text-base text-ink-3">Reading this rock…</p>;
  } else if (rock.state === "UNAVAILABLE") {
    body = (
      <>
        <UnavailableState reason={rock.reason} />
        {showSamples ? <RockSample scenario={scenario} /> : null}
      </>
    );
  } else if (record?.state === "dormant") {
    body = (
      <DormantRock
        rockId={rockId}
        tap={tap}
        authenticated={authenticated}
        address={address}
        onSignIn={() => requireSignIn(null)}
        onAwakened={refresh}
      />
    );
  } else if (record?.state === "handover_pending") {
    body = (
      <HandoverRock
        rockId={rockId}
        handover={record.handover}
        isOwner={isOwner}
        authenticated={authenticated}
        address={address}
        tap={tap}
        onSignIn={() => requireSignIn(null)}
        onChanged={refresh}
      />
    );
  } else if (record?.state === "archived") {
    body = <ArchivedRock rockId={rockId} />;
  } else if (record) {
    body = (
      <AwakeRock
        rockId={rockId}
        smartAccount={record.smartAccount}
        reserves={reserves}
        isOwner={isOwner}
        onTrade={handleTrade}
        onGive={handleGive}
        onCrossChain={() => setCrossChainOpen(true)}
        onRefresh={refresh}
        isRefreshing={isLoading}
      />
    );
  } else {
    body = null;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 py-6">
      {tap.status === "checked" && tap.resolution === "next_free" ? (
        <p className="text-sm text-ink-2">This rock was retired; starting a new one</p>
      ) : null}

      <RockIdentity
        rockId={rockId}
        state={record?.state}
        owner={record?.owner}
        smartAccount={record?.smartAccount}
        lost={record?.lost}
        trailing={
          <span className="flex items-center gap-2">
            {rock.state === "DEMO" ? <SimulatedBadge /> : null}
            {isOwner && record && record.state !== "archived" ? (
              <OwnerMenu
                rockId={rockId}
                handoverPending={record.state === "handover_pending"}
                lost={record.lost}
                onChanged={refresh}
              />
            ) : null}
          </span>
        }
      />

      <AttestationLine tap={tap} />

      {body}

      <DemoSwitcher currentScenario={scenario} onSelectScenario={setScenario} />

      <TradeModal
        isOpen={isTradeOpen}
        onClose={() => setTradeOpen(false)}
        rockId={rockId}
        currentReserve={usdcReserve}
        onTradeSuccess={refresh}
      />

      <TransferModal
        isOpen={isGiveOpen}
        onClose={() => setGiveOpen(false)}
        rockId={rockId}
        currentOwner={record?.owner ?? ""}
        onTransferSuccess={refresh}
      />

      <CrossChainModal
        isOpen={isCrossChainOpen}
        onClose={() => setCrossChainOpen(false)}
        rockId={rockId}
        smartAccountAddress={record?.smartAccount ?? ""}
        onDepositSuccess={refresh}
      />

      <PrivyOnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => {
          setOnboardingOpen(false);
          setPendingAction(null);
        }}
        rockId={rockId}
        onAuthenticated={() => {
          const action = pendingAction;
          setPendingAction(null);
          if (action === "give") setGiveOpen(true);
          if (action === "trade") setTradeOpen(true);
        }}
      />
    </div>
  );
}
