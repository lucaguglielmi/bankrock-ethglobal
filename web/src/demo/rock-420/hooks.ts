"use client";

/**
 * The demo's stand-ins for the real hooks, one per seam.
 *
 * Each returns exactly the shape its real counterpart returns, so every sheet and tab on the rock
 * page works unchanged for rock #420. They are ordinary hooks and are called unconditionally by
 * the real hooks — `const demo = useDemoRock(); const mock = useDemo…(); const chain = useChain…();
 * return demo ? mock : chain;` — so hook order never depends on which rock is open.
 *
 * Every value is a `DEMO` capability (D-013). Every action result is `DEMO` or `UNAVAILABLE`, and
 * none carries a transaction hash (D-014): `demoOutcome` builds the value **without** a `txHash`
 * key, and the type the consumers declare is satisfied only because they read that field in the
 * `REAL` branch alone.
 */

import { useCallback, useMemo, useState } from "react";
import type { Address, Hex } from "viem";
import { useAuth } from "@/context/auth-context";
import { demo, unavailable, type Capability } from "@/lib/demo";
import type { HandoverKeyResult } from "@/lib/handover-key";
import {
  ARCHIVED_REASON,
  NOT_ROCK_OWNER_REASON,
  SIGNED_OUT_REASON,
  type RockReserves,
} from "@/lib/rock-account";
import type { UseRockResult } from "@/hooks/useRock";
import type { UseAquaStrategyResult } from "@/hooks/useAquaStrategy";
import type { UseRockAccountResult } from "@/hooks/useRockAccount";
import type {
  RockActionsAvailability,
  UseHandoverMessageResult,
  UseRockActions,
  UseRockOnchainEventsResult,
} from "@/hooks/useBankRock";
import type { SwapParams, UseTakerActions } from "@/hooks/useTakerActions";
import {
  archiveDemoRock,
  cancelDemoHandover,
  claimDemoHandover,
  dockDemoStrategy,
  fundDemoRock,
  openDemoHandover,
  setDemoLost,
  shipDemoStrategy,
  swapDemo,
  topUpDemoStrategy,
  type DemoOutcome,
} from "./actions";
import { DEMO_ACTION_DELAY_MS, DEMO_ADDRESSES, DEMO_ROCK_ID } from "./constants";
import {
  demoOwnerFor,
  demoRecordFor,
  demoStrategyViewFor,
  sameDemoAddress,
  type DemoActivityRow,
  type DemoAmounts,
} from "./state";
import { commitDemoRockState, readDemoRockState, useDemoRockState } from "./store";

const noop = () => undefined;

/**
 * A `DEMO` result for a consumer that declares `{ txHash: Hex }` in its value.
 *
 * There is no hash here and the returned object has no `txHash` property at all. The cast exists
 * because the sheets that consume these results declare the hash in their types and read it only
 * when `state === "REAL"`; a fabricated placeholder would be the exact lie D-014 forbids.
 */
function demoOutcome<T extends object>(value: T): Capability<T & { txHash: Hex }> {
  return { state: "DEMO", value: value as T & { txHash: Hex } };
}

/** A beat long enough for a button to show its pending label, as it would for a real operation. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, DEMO_ACTION_DELAY_MS));
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

export function useDemoRockRead(): UseRockResult {
  const state = useDemoRockState();
  const { address } = useAuth();
  return useMemo<UseRockResult>(() => {
    const record = demoRecordFor(state, address);
    const reserves: RockReserves = { ...state.holdings };
    return { rock: demo(record), reserves: demo(reserves), isLoading: false, refresh: noop };
  }, [state, address]);
}

export function useDemoAquaStrategy(): UseAquaStrategyResult {
  const state = useDemoRockState();
  return useMemo<UseAquaStrategyResult>(
    () => ({ strategy: demo(demoStrategyViewFor(state)), isLoading: false, refresh: noop }),
    [state],
  );
}

export function useDemoRockAccount(): UseRockAccountResult {
  const state = useDemoRockState();
  const { authenticated, address } = useAuth();
  return useMemo<UseRockAccountResult>(() => {
    const account: Capability<Address> = demo(DEMO_ADDRESSES.account);
    let authority: Capability<Address>;
    if (!authenticated || !address) authority = unavailable(SIGNED_OUT_REASON);
    else if (state.state === "archived") authority = unavailable(ARCHIVED_REASON);
    else if (!sameDemoAddress(demoOwnerFor(state, address), address)) {
      authority = unavailable(NOT_ROCK_OWNER_REASON);
    } else authority = demo(DEMO_ADDRESSES.account);
    return { address: account, source: "registry", authority };
  }, [state, authenticated, address]);
}

export function useDemoHandoverMessage(): UseHandoverMessageResult {
  const state = useDemoRockState();
  return useMemo<UseHandoverMessageResult>(
    () => ({ message: state.handover?.message ?? null, isLoading: false, unavailableReason: null }),
    [state],
  );
}

/** The demo has no indexed registry events: its history lives in the browser (`useDemoActivityRows`). */
export function useDemoOnchainEvents(): UseRockOnchainEventsResult {
  return useMemo<UseRockOnchainEventsResult>(
    () => ({
      events: [],
      isLoading: false,
      unavailableReason:
        "Rock #420 is a demo rock: its history lives in this browser and nothing is on chain",
      refetch: () => Promise.resolve(),
    }),
    [],
  );
}

/** The provenance rows, newest first. None has a `txHash`. */
export function useDemoActivityRows(): DemoActivityRow[] {
  return useDemoRockState().activity;
}

/* -------------------------------------------------------------------------- */
/* Owner actions                                                               */
/* -------------------------------------------------------------------------- */

/** Applies a pure mutation to the current state and commits it when it was not refused. */
function apply<T>(run: () => DemoOutcome<T>): Capability<T> {
  const { state, result } = run();
  if (result.state !== "UNAVAILABLE") commitDemoRockState(state);
  return result;
}

export interface UseDemoRockActions extends UseRockActions {
  /** The demo's funding door: credits the rock in this browser. */
  fundDemo(amounts: DemoAmounts): Promise<Capability<DemoAmounts>>;
}

export function useDemoRockActions(): UseDemoRockActions {
  const { authenticated, address } = useAuth();
  const [isPending, setIsPending] = useState(false);

  const availability = useMemo<RockActionsAvailability>(
    () => ({
      registry: demo(DEMO_ADDRESSES.registry),
      accountAbstraction: demo(true),
      relayer: demo(true),
    }),
    [],
  );

  /** Signed in, and the owner of the demo rock as it stands right now. */
  const ownerOrReason = useCallback((): Capability<Address> => {
    if (!authenticated || !address) return unavailable(SIGNED_OUT_REASON);
    const state = readDemoRockState();
    if (state.state === "archived") return unavailable(ARCHIVED_REASON);
    if (!sameDemoAddress(demoOwnerFor(state, address), address)) {
      return unavailable(NOT_ROCK_OWNER_REASON);
    }
    return demo(address as Address);
  }, [authenticated, address]);

  const withPending = useCallback(async <T>(run: () => Promise<T>): Promise<T> => {
    setIsPending(true);
    try {
      await settle();
      return await run();
    } finally {
      setIsPending(false);
    }
  }, []);

  const notThisRock = (rockId: string) =>
    rockId !== DEMO_ROCK_ID ? unavailable<never>(`Rock #${rockId} is not the demo rock`) : null;

  // The demo rock is awake by construction; the signature is the interface's, the arguments unused.
  const awaken = useCallback(
    () =>
      withPending(async (): Promise<Capability<{ txHash: Hex; smartAccount: Address }>> =>
        unavailable("Rock #420 is a demo rock and is already awake"),
      ),
    [withPending],
  );

  const initiateHandover = useCallback(
    (rockId: string, recipient: Address | null, expiresAt: number, message?: string) =>
      withPending(
        async (): Promise<Capability<{ txHash: Hex; handoverKey: HandoverKeyResult }>> => {
          const wrong = notThisRock(rockId);
          if (wrong) return wrong;
          const owner = ownerOrReason();
          if (owner.state === "UNAVAILABLE") return unavailable(owner.reason);
          if (!recipient) {
            return unavailable("An open gift has no named recipient, so no hand-over key can be signed for it");
          }
          const result = apply(() =>
            openDemoHandover(readDemoRockState(), { recipient, expiresAt, message }),
          );
          if (result.state === "UNAVAILABLE") return unavailable(result.reason);
          const handoverKey: HandoverKeyResult = demo({ confirmed: true });
          return demoOutcome({ handoverKey });
        },
      ),
    [withPending, ownerOrReason],
  );

  const storeHandoverKey = useCallback(
    (rockId: string) =>
      withPending(async (): Promise<HandoverKeyResult> => {
        const wrong = notThisRock(rockId);
        if (wrong) return wrong;
        const owner = ownerOrReason();
        if (owner.state === "UNAVAILABLE") return unavailable(owner.reason);
        return demo({ confirmed: true });
      }),
    [withPending, ownerOrReason],
  );

  const claimHandover = useCallback(
    (rockId: string) =>
      withPending(async (): Promise<Capability<{ txHash: Hex }>> => {
        const wrong = notThisRock(rockId);
        if (wrong) return wrong;
        if (!authenticated || !address) return unavailable(SIGNED_OUT_REASON);
        const result = apply(() => claimDemoHandover(readDemoRockState(), address as Address));
        if (result.state === "UNAVAILABLE") return unavailable(result.reason);
        return demoOutcome({});
      }),
    [withPending, authenticated, address],
  );

  const ownerAction = useCallback(
    (rockId: string, run: () => DemoOutcome<object>) =>
      withPending(async (): Promise<Capability<{ txHash: Hex }>> => {
        const wrong = notThisRock(rockId);
        if (wrong) return wrong;
        const owner = ownerOrReason();
        if (owner.state === "UNAVAILABLE") return unavailable(owner.reason);
        const result = apply(run);
        if (result.state === "UNAVAILABLE") return unavailable(result.reason);
        return demoOutcome({});
      }),
    [withPending, ownerOrReason],
  );

  const cancelHandover = useCallback(
    (rockId: string) => ownerAction(rockId, () => cancelDemoHandover(readDemoRockState())),
    [ownerAction],
  );
  const archiveRock = useCallback(
    (rockId: string) => ownerAction(rockId, () => archiveDemoRock(readDemoRockState())),
    [ownerAction],
  );
  const markLost = useCallback(
    (rockId: string) => ownerAction(rockId, () => setDemoLost(readDemoRockState(), true)),
    [ownerAction],
  );
  const clearLost = useCallback(
    (rockId: string) => ownerAction(rockId, () => setDemoLost(readDemoRockState(), false)),
    [ownerAction],
  );

  const shipStrategy = useCallback(
    (
      rockId: string,
      params: { usdcAmount: bigint; wethAmount: bigint; feeBps: number; streamIndex?: number },
    ) =>
      withPending(async (): Promise<Capability<{ txHash: Hex; strategyHash: Hex }>> => {
        const wrong = notThisRock(rockId);
        if (wrong) return wrong;
        const owner = ownerOrReason();
        if (owner.state === "UNAVAILABLE") return unavailable(owner.reason);
        const result = apply(() =>
          shipDemoStrategy(readDemoRockState(), {
            streamIndex: params.streamIndex ?? 0,
            feeBps: params.feeBps,
            usdcAmount: params.usdcAmount,
            wethAmount: params.wethAmount,
          }),
        );
        if (result.state === "UNAVAILABLE") return unavailable(result.reason);
        return demoOutcome({ strategyHash: result.value.strategyHash });
      }),
    [withPending, ownerOrReason],
  );

  const dockStrategy = useCallback(
    (rockId: string, streamIndex: number) =>
      ownerAction(rockId, () => dockDemoStrategy(readDemoRockState(), streamIndex)),
    [ownerAction],
  );

  const topUpStrategy = useCallback(
    (rockId: string, params: { streamIndex: number; usdcAmount: bigint; wethAmount: bigint }) =>
      ownerAction(rockId, () => topUpDemoStrategy(readDemoRockState(), params)),
    [ownerAction],
  );

  const fundDemo = useCallback(
    (amounts: DemoAmounts) =>
      withPending(async (): Promise<Capability<DemoAmounts>> => {
        const owner = ownerOrReason();
        if (owner.state === "UNAVAILABLE") return unavailable(owner.reason);
        return apply(() => fundDemoRock(readDemoRockState(), amounts));
      }),
    [withPending, ownerOrReason],
  );

  return {
    awaken,
    initiateHandover,
    storeHandoverKey,
    claimHandover,
    cancelHandover,
    archiveRock,
    markLost,
    clearLost,
    shipStrategy,
    dockStrategy,
    topUpStrategy,
    fundDemo,
    isPending,
    availability,
  };
}

/* -------------------------------------------------------------------------- */
/* The visitor's side                                                          */
/* -------------------------------------------------------------------------- */

const SIGNED_OUT_TO_SWAP = "Sign in to swap";

export function useDemoTakerActions(): UseTakerActions {
  const state = useDemoRockState();
  const { authenticated } = useAuth();
  const [isPending, setIsPending] = useState(false);

  const account: Capability<Address> = useMemo(
    () => (authenticated ? demo(DEMO_ADDRESSES.taker) : unavailable(SIGNED_OUT_TO_SWAP)),
    [authenticated],
  );

  const balances: Capability<RockReserves> = useMemo(
    () => (authenticated ? demo({ ...state.taker }) : unavailable(SIGNED_OUT_TO_SWAP)),
    [authenticated, state],
  );

  const swap = useCallback(
    async (params: SwapParams): Promise<Capability<{ txHash: Hex; amountOut: bigint }>> => {
      setIsPending(true);
      try {
        await settle();
        if (params.rockId !== DEMO_ROCK_ID) {
          return unavailable(`Rock #${params.rockId} is not the demo rock`);
        }
        if (!authenticated) return unavailable(SIGNED_OUT_TO_SWAP);
        const result = apply(() =>
          swapDemo(readDemoRockState(), {
            streamIndex: params.streamIndex,
            tokenIn: params.tokenIn,
            amountIn: params.amountIn,
            minAmountOut: params.minAmountOut,
          }),
        );
        if (result.state === "UNAVAILABLE") return unavailable(result.reason);
        return demoOutcome({ amountOut: result.value.amountOut });
      } finally {
        setIsPending(false);
      }
    },
    [authenticated],
  );

  return { account, balances, swap, isPending };
}
