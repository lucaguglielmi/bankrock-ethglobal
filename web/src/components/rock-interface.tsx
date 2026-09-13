"use client";

/**
 * The rock page — the page a physical tap opens (spec 17 Part 5, spec 15 Phase 1).
 *
 * It is a small dashboard with four tabs: Liquidity, Trade, Ownership and Contracts. The default
 * tab shows no Ethereum address at all; addresses live in the last two tabs, where a visitor goes
 * looking for them. The header above the tabs says only which rock this is, what state it is in,
 * and whether the tap that opened it was real.
 *
 * Every value on the page is one of `REAL` / `DEMO` / `UNAVAILABLE`, read once here and shared
 * with the tabs (a reserve caption, a trade button and a position card must never disagree). An
 * `UNAVAILABLE` capability is shown with its reason, after the first read has had its chance to
 * land.
 *
 * Per rock state:
 *
 *  - **dormant**       Liquidity holds the awaken prompt and the account the rock would open;
 *                      Trade and Ownership are one sentence each; Contracts works as normal.
 *  - **awake**         all four tabs.
 *  - **handover**      Ownership opens by default and holds the handover; the other tabs are
 *                      read-only until the rock changes hands.
 *  - **archived**      no tabs — the retired rock and its history.
 *  - **unavailable**   the reason, and under demo mode a badged sample.
 */

import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { useRock } from "@/hooks/useRock";
import { useRockAccount } from "@/hooks/useRockAccount";
import { useAquaStrategy } from "@/hooks/useAquaStrategy";
import { isDemoMode, real, unavailable, type Capability } from "@/lib/demo";
import { SimulatedBadge } from "@/components/ui/simulated-badge";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { DemoSwitcher, type DemoScenario } from "@/components/demo-switcher";
import { TransferModal } from "@/components/transfer-modal";
import { CrossChainModal } from "@/components/cross-chain-modal";
import { PrivyOnboardingModal } from "@/components/privy-onboarding-modal";
import { AttestationLine } from "@/components/rock/attestation-line";
import { RockIdentity } from "@/components/rock/rock-identity";
import { DormantRock } from "@/components/rock/rock-dormant";
import { ArchivedRock } from "@/components/rock/rock-archived";
import { RockSample } from "@/components/rock/rock-sample";
import { OwnerMenu } from "@/components/rock/owner-menu";
import { LiquidityTab } from "@/components/rock/tabs/liquidity-tab";
import { TradeTab } from "@/components/rock/tabs/trade-tab";
import { OwnershipTab } from "@/components/rock/tabs/ownership-tab";
import { ContractsTab } from "@/components/rock/tabs/contracts-tab";
import { useTapAttestation } from "@/components/rock/use-tap-attestation";
import { tapGateFor } from "@/components/rock/tap-gate";
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

/* -------------------------------------------------------------------------- */
/* Tabs                                                                        */
/* -------------------------------------------------------------------------- */

export const ROCK_TABS = ["liquidity", "trade", "ownership", "contracts"] as const;

export type RockTab = (typeof ROCK_TABS)[number];

const TAB_LABELS: Record<RockTab, string> = {
  liquidity: "Liquidity",
  trade: "Trade",
  ownership: "Ownership",
  contracts: "Contracts",
};

function isRockTab(value: string): value is RockTab {
  return (ROCK_TABS as readonly string[]).includes(value);
}

function subscribeToHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function readHashTab(): RockTab | null {
  const hash = window.location.hash.replace(/^#/, "");
  return isRockTab(hash) ? hash : null;
}

/**
 * The tab a `#trade` / `#ownership` / `#contracts` hash asks for. Null on the server and when
 * there is none, so the page hydrates on the default tab and moves once the hash is readable.
 */
function useHashTab(): RockTab | null {
  return useSyncExternalStore(subscribeToHash, readHashTab, () => null);
}

const HANDOVER_READ_ONLY_REASON =
  "This rock is being handed over. Owner actions come back when it changes hands or the handover is cancelled.";

const NO_ACCOUNT_YET_REASON = "This rock has no account yet. Awakening it opens one.";

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export function RockInterface({ rockId, searchParams }: RockInterfaceProps) {
  const router = useRouter();
  const { ready, authenticated, address } = useAuth();
  const { rock, reserves, isLoading, refresh } = useRock(rockId);

  const record = rock.state === "UNAVAILABLE" ? null : rock.value;

  // One strategy read for the whole page: the Liquidity and Trade tabs and the owner menu all
  // describe the same streams and must not disagree.
  const {
    strategy,
    isLoading: isStrategyLoading,
    refresh: refreshStrategy,
  } = useAquaStrategy(rockId, record?.smartAccount);

  const refreshAll = useCallback(() => {
    refresh();
    refreshStrategy();
  }, [refresh, refreshStrategy]);

  /*
   * Verifying a tap consumes its counter, so it happens once, at the moment its answer is worth
   * the most: after sign-in wherever the attestation has to name a subject — a dormant rock, and a
   * rock waiting to be claimed — and as soon as the rock's state is known everywhere else. The
   * rule is `tap-gate.ts`, so the irreversible decision is stated in one tested place.
   */
  const rockResolved = record !== null || !isLoading;
  const gate = tapGateFor({
    ready,
    rockResolved,
    state: record?.state,
    authenticated,
  });

  const tap = useTapAttestation({
    rockId,
    params: { e: searchParams.e, c: searchParams.c, enc: searchParams.enc },
    subject: address,
    gate,
  });

  /*
   * The tag, as the server hashed it. It comes only from a signed attestation, so it cannot be
   * supplied by a URL, and it is the missing half of the Rock Account derivation on a rock that
   * has not been awakened yet (D-029).
   */
  const tapUidHash =
    tap.status === "checked" && tap.verified && tap.attestation?.state === "SIGNED"
      ? tap.attestation.message.uidHash
      : undefined;

  /*
   * Two answers about this rock's account (`useRockAccount`):
   *
   *  - `rockAccount` — which account holds the money. For an awakened rock that is the registry's,
   *    read and never re-derived (D-037); before the awakening it is the counterfactual address
   *    this wallet and this tag derive, which is what a dormant rock shows so it can be funded
   *    before it is awakened;
   *  - `authority` — whether that account still answers to the signed-in wallet. `isOwner` below is
   *    the other half, object ownership as the registry records it. Asking both means the owner's
   *    buttons are never offered when the transaction behind them would revert.
   */
  const { address: rockAccount, authority } = useRockAccount({
    record,
    uidHash: tapUidHash,
  });

  const [scenario, setScenario] = useState<DemoScenario>("awake");
  const [isOnboardingOpen, setOnboardingOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<"give" | null>(null);
  const [isGiveOpen, setGiveOpen] = useState(false);
  const [isCrossChainOpen, setCrossChainOpen] = useState(false);

  const isOwner = sameAddress(record?.owner, address);

  /*
   * Which tab is open. The visitor's own choice wins; before that, a hash in the URL; before
   * that, the tab the rock's state makes most useful — Ownership for a rock waiting to be
   * claimed, Liquidity for everything else.
   */
  const hashTab = useHashTab();
  const [chosenTab, setChosenTab] = useState<RockTab | null>(null);
  const defaultTab: RockTab = record?.state === "handover_pending" ? "ownership" : "liquidity";
  const tab: RockTab = chosenTab ?? hashTab ?? defaultTab;
  const selectTab = useCallback((next: RockTab) => setChosenTab(next), []);

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

  const requireSignIn = useCallback((action: "give" | null) => {
    setPendingAction(action);
    setOnboardingOpen(true);
  }, []);

  const handleChangeOwnership = useCallback(() => {
    if (!authenticated) {
      requireSignIn("give");
      return;
    }
    setGiveOpen(true);
  }, [authenticated, requireSignIn]);

  /*
   * What the tabs may let the owner do from the rock's account. While a handover is open the
   * rock is spoken for, so the tabs are read-only and say so; the owner menu keeps the real
   * answer, because cancelling the handover is exactly what it is for.
   */
  const tabOwnerActions: Capability<string> =
    record?.state === "handover_pending" ? unavailable(HANDOVER_READ_ONLY_REASON) : authority;

  const contractsAccount: Capability<string> =
    !record || record.state === "dormant"
      ? unavailable(NO_ACCOUNT_YET_REASON)
      : real(record.smartAccount);

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
  } else if (record) {
    const state = record.state;

    if (state === "archived") {
      body = <ArchivedRock rockId={rockId} />;
    } else {
      const isDormant = state === "dormant";

      body = (
        <Tabs value={tab} onValueChange={selectTab}>
          <TabsList aria-label="This rock">
            {ROCK_TABS.map((value) => (
              <TabsTab key={value} value={value}>
                {TAB_LABELS[value]}
              </TabsTab>
            ))}
          </TabsList>

          <TabsPanel value="liquidity">
            {isDormant ? (
              <DormantRock
                rockId={rockId}
                tap={tap}
                authenticated={authenticated}
                address={address}
                rockAccount={rockAccount}
                onSignIn={() => requireSignIn(null)}
                onAwakened={refreshAll}
              />
            ) : (
              <LiquidityTab
                rockId={rockId}
                smartAccount={record.smartAccount}
                reserves={reserves}
                strategy={strategy}
                isStrategyLoading={isStrategyLoading}
                isRefreshing={isLoading}
                isOwner={isOwner}
                ownerActions={tabOwnerActions}
                onRefresh={refreshAll}
                onGoToTrade={() => selectTab("trade")}
                onCrossChain={isDemoMode() ? () => setCrossChainOpen(true) : undefined}
              />
            )}
          </TabsPanel>

          <TabsPanel value="trade">
            {isDormant ? (
              <p className="max-w-prose text-lead text-ink-2">
                This rock is asleep. Once awakened and funded, anyone can trade with it.
              </p>
            ) : (
              <TradeTab
                rockId={rockId}
                maker={record.smartAccount}
                strategy={strategy}
                isStrategyLoading={isStrategyLoading}
                isOwner={isOwner}
                authenticated={authenticated}
                onRequestSignIn={() => requireSignIn(null)}
                onTradeSuccess={refreshAll}
                onGoToLiquidity={() => selectTab("liquidity")}
              />
            )}
          </TabsPanel>

          <TabsPanel value="ownership">
            <OwnershipTab
              rockId={rockId}
              state={state}
              owner={isDormant ? undefined : record.owner}
              handover={record.handover}
              isOwner={isOwner}
              authenticated={authenticated}
              address={address}
              tap={tap}
              ownerActions={authority}
              onSignIn={() => requireSignIn(null)}
              onChangeOwnership={handleChangeOwnership}
              onChanged={refreshAll}
            />
          </TabsPanel>

          <TabsPanel value="contracts">
            <ContractsTab smartAccount={contractsAccount} />
          </TabsPanel>
        </Tabs>
      );
    }
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
        lost={record?.lost}
        trailing={
          <span className="flex items-center gap-2">
            {rock.state === "DEMO" ? <SimulatedBadge /> : null}
            {isOwner && record && record.state !== "archived" ? (
              <OwnerMenu
                rockId={rockId}
                ownerActions={authority}
                handoverPending={record.state === "handover_pending"}
                lost={record.lost}
                onChanged={refreshAll}
              />
            ) : null}
          </span>
        }
      />

      <AttestationLine tap={tap} />

      {body}

      <DemoSwitcher currentScenario={scenario} onSelectScenario={setScenario} />

      <TransferModal
        isOpen={isGiveOpen}
        onClose={() => setGiveOpen(false)}
        rockId={rockId}
        currentOwner={record?.owner ?? ""}
        onTransferSuccess={refreshAll}
      />

      {isDemoMode() ? (
        <CrossChainModal
          isOpen={isCrossChainOpen}
          onClose={() => setCrossChainOpen(false)}
          rockId={rockId}
          smartAccountAddress={record?.smartAccount ?? ""}
          onDepositSuccess={refreshAll}
        />
      ) : null}

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
        }}
      />
    </div>
  );
}
