/**
 * Aqua keeper (S-3, N-1).
 *
 * What this module used to be: an in-memory `Map` seeded with 1,250 USDC and 0.45 WETH, a
 * hardcoded ETH price of 2,850, fee accrual invented from wall-clock time, and a rebalance that
 * mutated the Map and returned a random 64-hex string as a transaction hash, which
 * `POST /api/keeper` served as `success: true`.
 *
 * What it is now: nothing is synthesized. A keeper needs a shipped Aqua strategy to read and a
 * signer to act with (spec 15, Phase 3). Neither exists — the registry is not deployed (C-1) and
 * no strategy has ever been shipped (C-5) — so both entry points return UNAVAILABLE naming what
 * is missing. No transaction hash is produced anywhere in this file: a hash may only originate
 * from a signed, broadcast transaction (D-014).
 *
 * Keeper rebalancing stays a DEMO capability in the UI (spec 15 Part 3 and Part 8). The badge is
 * the UI's job; this module's job is to never hand it a fabricated number to badge.
 */

import { addresses } from "@/lib/chain";
import { unavailable, type Capability } from "@/lib/demo";

export interface AquaPositionState {
  rockId: string | number;
  /** Actual ERC-20 balances held by the Rock Account. */
  usdcReserve: number;
  wethReserve: number;
  /** Virtual balances exposed to the strategy, read from Aqua.safeBalances. */
  virtualUsdc: number;
  virtualWeth: number;
  targetRatioUsdcPercent: number;
  currentRatioUsdcPercent: number;
  deviationPercent: number;
  needsRebalance: boolean;
  rebalanceAction?: "SWAP_USDC_FOR_WETH" | "SWAP_WETH_FOR_USDC" | "OPTIMAL";
}

export interface RebalanceExecutionResult {
  rockId: string | number;
  actionTaken: string;
  /** Present only when a real transaction was broadcast. */
  txHash: `0x${string}`;
  executionLatencyMs: number;
  timestamp: string;
}

function missingPrerequisites(): string[] {
  const missing: string[] = [];
  if (!addresses.registry) missing.push("NEXT_PUBLIC_REGISTRY_ADDRESS");
  if (!addresses.aqua) missing.push("NEXT_PUBLIC_AQUA_ADDRESS");
  if (!addresses.swapVmRouter) missing.push("NEXT_PUBLIC_SWAPVM_ROUTER_ADDRESS");
  return missing;
}

/**
 * Reads a rock's Aqua position.
 *
 * Requires: the registry (to resolve the Rock Account), the Aqua address, the AquaApp address and
 * a shipped strategy hash for the rock. Until those exist there is nothing to read, and a
 * plausible-looking position would be a fabrication.
 */
export async function evaluateAquaPosition(
  rockId: string | number,
): Promise<Capability<AquaPositionState>> {
  const missing = missingPrerequisites();
  if (missing.length > 0) {
    return unavailable(
      `No Aqua position can be read for rock ${rockId}: ${missing.join(", ")} ${
        missing.length === 1 ? "is" : "are"
      } not configured`,
    );
  }
  return unavailable(
    `No Aqua strategy has been shipped for rock ${rockId}, so it has no virtual balances to read`,
  );
}

/**
 * Executes a keeper rebalance.
 *
 * A rebalance is a signed transaction from the Rock Account against Aqua. There is no keeper
 * signer, no shipped strategy and no deployed registry, so this cannot execute — and it will
 * never report that it did.
 */
export async function executeAquaRebalance(
  rockId: string | number,
): Promise<Capability<RebalanceExecutionResult>> {
  return unavailable(
    `No keeper is able to rebalance rock ${rockId}: the Aqua strategy path is not implemented and no keeper signer is configured`,
  );
}
