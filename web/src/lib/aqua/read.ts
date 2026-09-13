/**
 * Reading a rock's liquidity from the chain — the three numbers spec 04 insists are different.
 *
 *   actual      `ERC20.balanceOf(rockAccount)`. One balance, shared by every stream. Real tokens
 *               in the rock's own wallet.
 *   virtual     `Aqua.safeBalances(maker, app, strategyHash, USDC, WETH)`. Per stream. An
 *               allowance, not a deposit. Two streams' virtual balances may sum to more than the
 *               wallet holds, and that sum is not capital — never render it as one.
 *   executable  `min(virtual, actual, allowance to Aqua)`. What the stream can settle right now.
 *               A swap on one stream lowers this for the other while leaving its virtual balance
 *               untouched (`contracts/aqua/NOTES.md` §7, `SharedReserve.t.sol`).
 *
 * `safeBalances` reverts for a strategy that was never shipped or has been docked. That revert is
 * the "is this stream live?" probe, so it maps to UNAVAILABLE with a plain reason, never to an
 * error page — and, because a strategy hash is recomputable from the rock id, no stored list of
 * strategies is needed to ask the question.
 */

import { getAddress, type Address, type Hex } from "viem";
import { getPublicClient } from "@/lib/chain";
import { buildBlockRanges } from "@/lib/block-range";
import { AQUA_ABI } from "@/lib/chain/abi/aqua";
import { ERC20_ABI } from "@/lib/chain/abi/erc20";
import { real, unavailable, type Capability } from "@/lib/demo";
import { getAquaAddresses, getAppDeployBlock, type AquaAddresses } from "./config";
import { AQUA_EVENTS_ABI, matchesStrategy } from "./events";
import { BPS_BASE, buildStrategy, DEFAULT_STREAMS, type StreamIdentity } from "./strategy";

export interface TokenPairAmounts {
  usdc: bigint;
  weth: bigint;
}

/** One live stream. */
export interface StrategyBalances {
  strategyHash: Hex;
  /** The strategy bytes, if the caller built them — useful for a `Shipped` cross-check. */
  strategy?: Hex;
  feeBps: bigint;
  streamIndex: bigint;
  label?: string;
  /** The allowance this stream may trade against. Not a deposit. */
  virtual: TokenPairAmounts;
  /** What it can actually settle now: min(virtual, wallet, allowance). */
  executable: TokenPairAmounts;
}

/** Everything the position card needs for one rock. */
export interface RockStrategyView {
  rockId: string;
  maker: Address;
  app: Address;
  aqua: Address;
  /** The rock's real token balances. One reserve, shared by every stream below. */
  actual: TokenPairAmounts;
  /** What the rock has approved Aqua to move on its behalf. */
  allowance: TokenPairAmounts;
  /** The live streams, in catalogue order. */
  streams: StrategyBalances[];
  /**
   * Catalogue streams that were shipped and later docked. A docked slot is `0xff`, not `0`, so
   * the same strategy can never be shipped again (NOTES.md §4) — "Add another strategy" must not
   * offer these. Read from `rawBalances.tokensCount`; absent when the reader did not probe it.
   */
  stopped?: bigint[];
}

/** `Balance.tokensCount` after `dock`: the slot is marked, not cleared, so it can never be reused. */
const DOCKED_TOKENS_COUNT = 0xff;

function min(...values: bigint[]): bigint {
  return values.reduce((a, b) => (a < b ? a : b));
}

function reason(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/* -------------------------------------------------------------------------- */
/* One strategy                                                                */
/* -------------------------------------------------------------------------- */

export interface ReadStrategyParams {
  maker: Address;
  strategyHash: Hex;
  /** Defaults to NEXT_PUBLIC_AQUA_APP_ADDRESS. */
  app?: Address;
}

export interface StrategyReading {
  strategyHash: Hex;
  maker: Address;
  addresses: AquaAddresses;
  virtual: TokenPairAmounts;
  actual: TokenPairAmounts;
  allowance: TokenPairAmounts;
  executable: TokenPairAmounts;
}

/**
 * Virtual, actual and executable balances for one shipped strategy.
 *
 * UNAVAILABLE covers all three honest failures — an unconfigured address, an unreachable RPC, and
 * a strategy that is not (or is no longer) shipped. None of them produces a number.
 */
export async function readStrategy(
  params: ReadStrategyParams,
): Promise<Capability<StrategyReading>> {
  const addresses = getAquaAddresses({ app: params.app });
  if (addresses.state === "UNAVAILABLE") return unavailable(addresses.reason);
  const { aqua, app, usdc, weth } = addresses.value;
  const maker = getAddress(params.maker);

  const client = getPublicClient();

  let virtualBalances: readonly [bigint, bigint];
  try {
    virtualBalances = (await client.readContract({
      address: aqua,
      abi: AQUA_ABI,
      functionName: "safeBalances",
      args: [maker, app, params.strategyHash, usdc, weth],
    })) as readonly [bigint, bigint];
  } catch (err) {
    // `SafeBalancesForTokenNotInActiveStrategy` is the normal "nothing shipped here" answer.
    return unavailable(
      `No live Aqua strategy for this rock at ${params.strategyHash.slice(0, 10)}… (${reason(err)})`,
    );
  }

  try {
    const [usdcBalance, wethBalance, usdcAllowance, wethAllowance] = await Promise.all([
      client.readContract({ address: usdc, abi: ERC20_ABI, functionName: "balanceOf", args: [maker] }),
      client.readContract({ address: weth, abi: ERC20_ABI, functionName: "balanceOf", args: [maker] }),
      client.readContract({ address: usdc, abi: ERC20_ABI, functionName: "allowance", args: [maker, aqua] }),
      client.readContract({ address: weth, abi: ERC20_ABI, functionName: "allowance", args: [maker, aqua] }),
    ]);

    const actual: TokenPairAmounts = { usdc: usdcBalance as bigint, weth: wethBalance as bigint };
    const allowance: TokenPairAmounts = {
      usdc: usdcAllowance as bigint,
      weth: wethAllowance as bigint,
    };
    const virtual: TokenPairAmounts = { usdc: virtualBalances[0], weth: virtualBalances[1] };

    return real({
      strategyHash: params.strategyHash,
      maker,
      addresses: addresses.value,
      virtual,
      actual,
      allowance,
      executable: {
        usdc: min(virtual.usdc, actual.usdc, allowance.usdc),
        weth: min(virtual.weth, actual.weth, allowance.weth),
      },
    });
  } catch (err) {
    return unavailable(`Token balances could not be read: ${reason(err)}`);
  }
}

/* -------------------------------------------------------------------------- */
/* A whole rock                                                                */
/* -------------------------------------------------------------------------- */

export interface ReadRockStreamsParams {
  rockId: bigint | number | string;
  maker: Address;
  /**
   * Which streams to probe. Defaults to the catalogue, `DEFAULT_STREAMS` — one `safeBalances`
   * call per preset, so adding a preset costs one more `eth_call` per read.
   */
  streams?: ReadonlyArray<{ streamIndex: number | bigint; feeBps: number | bigint; label?: string }>;
  app?: Address;
}

/**
 * Probe a rock's streams and return the live ones.
 *
 * No stream list is stored anywhere: each candidate's hash is recomputed from
 * `(rockId, streamIndex, feeBps, maker, tokens)` and asked of Aqua directly. The probes run
 * concurrently and the live streams come back in catalogue order. A rock with nothing shipped
 * comes back UNAVAILABLE, which is the honest empty state, not an error.
 */
export async function readRockStreams(
  params: ReadRockStreamsParams,
): Promise<Capability<RockStrategyView>> {
  const addresses = getAquaAddresses({ app: params.app });
  if (addresses.state === "UNAVAILABLE") return unavailable(addresses.reason);
  const { aqua, app, usdc, weth } = addresses.value;
  const maker = getAddress(params.maker);
  const presets = params.streams ?? DEFAULT_STREAMS;

  const client = getPublicClient();

  let actual: TokenPairAmounts;
  let allowance: TokenPairAmounts;
  try {
    const [usdcBalance, wethBalance, usdcAllowance, wethAllowance] = await Promise.all([
      client.readContract({ address: usdc, abi: ERC20_ABI, functionName: "balanceOf", args: [maker] }),
      client.readContract({ address: weth, abi: ERC20_ABI, functionName: "balanceOf", args: [maker] }),
      client.readContract({ address: usdc, abi: ERC20_ABI, functionName: "allowance", args: [maker, aqua] }),
      client.readContract({ address: weth, abi: ERC20_ABI, functionName: "allowance", args: [maker, aqua] }),
    ]);
    actual = { usdc: usdcBalance as bigint, weth: wethBalance as bigint };
    allowance = { usdc: usdcAllowance as bigint, weth: wethAllowance as bigint };
  } catch (err) {
    return unavailable(`The rock's token balances could not be read: ${reason(err)}`);
  }

  const probed = await Promise.all(
    presets.map(async (preset): Promise<StrategyBalances | { stopped: bigint } | null> => {
      const identity: StreamIdentity = { rockId: params.rockId, streamIndex: preset.streamIndex };
      const encoded = buildStrategy({
        maker,
        token0: usdc,
        token1: weth,
        feeBps: preset.feeBps,
        ...identity,
      });

      try {
        const balances = (await client.readContract({
          address: aqua,
          abi: AQUA_ABI,
          functionName: "safeBalances",
          args: [maker, app, encoded.strategyHash, usdc, weth],
        })) as readonly [bigint, bigint];

        const virtual: TokenPairAmounts = { usdc: balances[0], weth: balances[1] };
        return {
          strategyHash: encoded.strategyHash,
          strategy: encoded.strategy,
          feeBps: encoded.params.feeBps,
          streamIndex: encoded.params.streamIndex,
          label: preset.label,
          virtual,
          executable: {
            usdc: min(virtual.usdc, actual.usdc, allowance.usdc),
            weth: min(virtual.weth, actual.weth, allowance.weth),
          },
        };
      } catch {
        // Not shipped, or docked. Both are ordinary states; the stream is simply absent from
        // `streams`. Which of the two it is matters to the owner — a docked stream can never be
        // shipped again — so `rawBalances.tokensCount` is asked: 0 = never shipped, 0xff = docked.
        try {
          const [, tokensCount] = (await client.readContract({
            address: aqua,
            abi: AQUA_ABI,
            functionName: "rawBalances",
            args: [maker, app, encoded.strategyHash, usdc],
          })) as readonly [bigint, number];
          return Number(tokensCount) === DOCKED_TOKENS_COUNT
            ? { stopped: encoded.params.streamIndex }
            : null;
        } catch {
          return null;
        }
      }
    }),
  );
  const streams = probed.filter(
    (entry): entry is StrategyBalances => entry !== null && !("stopped" in entry),
  );
  const stopped = probed
    .filter((entry): entry is { stopped: bigint } => entry !== null && "stopped" in entry)
    .map((entry) => entry.stopped);

  if (streams.length === 0) {
    return unavailable("This rock has no live Aqua strategy");
  }

  return real({
    rockId: String(params.rockId),
    maker,
    app,
    aqua,
    actual,
    allowance,
    streams,
    stopped,
  });
}

/* -------------------------------------------------------------------------- */
/* Fees                                                                        */
/* -------------------------------------------------------------------------- */

export interface AccruedFees {
  /** Fees earned in each token, in base units. */
  earned: TokenPairAmounts;
  /** How many swaps they came from. */
  swapCount: number;
  /** The block range actually scanned, so the UI can say "since block N" rather than "ever". */
  fromBlock: bigint;
  toBlock: bigint;
  /** True when the scan started at the app's deploy block, i.e. the figure is complete. */
  complete: boolean;
}

export interface ReadAccruedFeesParams extends ReadStrategyParams {
  /** The strategy's immutable fee. It is authenticated by the hash: a different fee, a different
   *  strategy, no balances. */
  feeBps: bigint | number;
  /** Override the first block to scan. Defaults to AQUA_APP_DEPLOY_BLOCK, else a recent window. */
  fromBlock?: bigint;
  /** How far back to look when no deploy block is configured. */
  lookbackBlocks?: bigint;
}

/** Public RPCs reject wide `eth_getLogs` ranges (X-5), so an unbounded scan is never attempted. */
const DEFAULT_LOOKBACK_BLOCKS = BigInt(50_000);

/**
 * What has already been scanned for one strategy, so a poll only asks for new blocks.
 *
 * The fee figure is a running total over a block range, which makes it resumable: the same
 * `Pushed` log never needs reading twice. Before this cache the strategy route issued two
 * `eth_getLogs` per stream, each spanning deploy-block-to-head, every fifteen seconds — one
 * unchunked range that grows all demo long and that a public RPC eventually refuses outright
 * (D-036 proved 2,000-block chunks, not a 500,000-block sweep).
 *
 * Module scope, so it is per isolate and empty after a cold start. That is the right trade here:
 * losing it costs one full rescan, never a wrong number, because every entry records the exact
 * range it covers and that range is what the UI reports.
 */
interface FeeScanState {
  /** The first block this total covers. */
  fromBlock: bigint;
  /** The last block this total covers, inclusive. */
  scannedTo: bigint;
  earned: TokenPairAmounts;
  swapCount: number;
  /** True when the scan started at the app's deploy block, i.e. the figure is complete. */
  complete: boolean;
}

const feeScanCache = new Map<string, FeeScanState>();

/**
 * Keyed by everything the total depends on. `feeBps` is part of it: a different fee is a
 * different strategy and a different number, and `maker` because a strategy hash is only unique
 * with it.
 */
function feeScanKey(params: {
  maker: Address;
  app: Address;
  strategyHash: Hex;
  feeBps: bigint;
}): string {
  return [
    params.app.toLowerCase(),
    params.strategyHash.toLowerCase(),
    params.maker.toLowerCase(),
    params.feeBps.toString(),
  ].join(":");
}

/** Drops every cached scan. Tests use it; nothing in the request path does. */
export function resetFeeScanCache(): void {
  feeScanCache.clear();
}

/**
 * The blocks a poll still has to fetch, given what is already cached.
 *
 * Pure, and the part worth testing: a cached scan that already reaches the head asks for
 * nothing, a cached scan behind the head asks only for the gap, and a cached scan that starts
 * later than the caller wants is discarded rather than silently narrowing the reported range.
 */
export function planFeeScan(
  cached: { fromBlock: bigint; scannedTo: bigint } | undefined,
  desiredFrom: bigint,
): { reuse: boolean; fromBlock: bigint; scanFrom: bigint } {
  if (cached && cached.fromBlock <= desiredFrom && cached.scannedTo >= cached.fromBlock) {
    return {
      reuse: true,
      fromBlock: cached.fromBlock,
      scanFrom: cached.scannedTo + BigInt(1),
    };
  }
  return { reuse: false, fromBlock: desiredFrom, scanFrom: desiredFrom };
}

/**
 * Cumulative fees earned by one strategy, read from Aqua's own events.
 *
 * XYCSwap keeps no fee accumulator. The taker's whole `amountIn` is pushed into the maker's
 * reserve while the curve prices only `amountIn * (10000 - feeBps) / 10000`, so the fee is the
 * remainder — `amountIn * feeBps / 10000`, in the input token, per swap
 * (`contracts/aqua/NOTES.md` §6). Each swap's `amountIn` is one `Pushed` event, and the `Pushed`
 * events `ship` emits at launch are excluded by the transaction they share with `Shipped`.
 *
 * The scan is chunked at 2,000 blocks (`lib/block-range`, D-036) and resumed from the last block
 * already scanned for this (app, strategy) pair, so a fifteen-second poll fetches the handful of
 * blocks that are new instead of the whole history twice per stream. `Shipped` and `Pushed` are
 * fetched over the same chunk, which is what keeps the launch-push exclusion sound: `ship` emits
 * both in one transaction, therefore in one block, therefore never split across two chunks.
 *
 * When any chunk fails this returns UNAVAILABLE. A short scan is never reported as a total: the
 * whole chunks that did land are kept for the next poll to build on, and the caller is told the
 * figure could not be read. It never falls back to `virtual - shipped` either — that difference
 * is inventory P&L, not fees, and showing it as fees would be exactly the kind of confident wrong
 * number spec 15 exists to remove.
 */
export async function readAccruedFees(
  params: ReadAccruedFeesParams,
): Promise<Capability<AccruedFees>> {
  const addresses = getAquaAddresses({ app: params.app });
  if (addresses.state === "UNAVAILABLE") return unavailable(addresses.reason);
  const { aqua, app, usdc, weth } = addresses.value;
  const maker = getAddress(params.maker);
  const feeBps = BigInt(params.feeBps);

  const client = getPublicClient();

  let head: bigint;
  try {
    head = await client.getBlockNumber();
  } catch (err) {
    return unavailable(feeFailureReason(err));
  }

  const deployBlock = params.fromBlock ?? getAppDeployBlock();
  const lookback = params.lookbackBlocks ?? DEFAULT_LOOKBACK_BLOCKS;
  const desiredFrom = deployBlock ?? (head > lookback ? head - lookback : BigInt(0));

  const key = feeScanKey({ maker, app, strategyHash: params.strategyHash, feeBps });
  const cached = feeScanCache.get(key);
  const plan = planFeeScan(cached, desiredFrom);

  const state: FeeScanState =
    plan.reuse && cached
      ? { ...cached, earned: { ...cached.earned } }
      : {
          fromBlock: plan.fromBlock,
          // Nothing scanned yet: one block before the start, so the first chunk begins at it.
          scannedTo: plan.scanFrom - BigInt(1),
          earned: { usdc: BigInt(0), weth: BigInt(0) },
          swapCount: 0,
          complete: deployBlock !== undefined,
        };

  const filter = { maker, app, strategyHash: params.strategyHash };

  for (const range of buildBlockRanges(plan.scanFrom, head)) {
    try {
      const [pushed, shipped] = await Promise.all([
        client.getLogs({
          address: aqua,
          event: AQUA_EVENTS_ABI[3],
          fromBlock: range.fromBlock,
          toBlock: range.toBlock,
        }),
        client.getLogs({
          address: aqua,
          event: AQUA_EVENTS_ABI[0],
          fromBlock: range.fromBlock,
          toBlock: range.toBlock,
        }),
      ]);

      const shipTxs = new Set(
        shipped
          .filter((log) => matchesStrategy(log.args, filter))
          .map((log) => log.transactionHash?.toLowerCase() ?? ""),
      );

      // Counted per chunk and merged only once the chunk is whole, so a failure halfway through
      // can never leave a half-counted chunk behind a cursor that says it was scanned.
      const chunkEarned: TokenPairAmounts = { usdc: BigInt(0), weth: BigInt(0) };
      let chunkSwaps = 0;

      for (const log of pushed) {
        if (!matchesStrategy(log.args, filter)) continue;
        if (shipTxs.has(log.transactionHash?.toLowerCase() ?? "")) continue;
        const token = (log.args.token ?? "").toLowerCase();
        const amount = log.args.amount ?? BigInt(0);
        const fee = (amount * feeBps) / BPS_BASE;
        if (token === usdc.toLowerCase()) chunkEarned.usdc += fee;
        else if (token === weth.toLowerCase()) chunkEarned.weth += fee;
        else continue;
        chunkSwaps += 1;
      }

      state.earned.usdc += chunkEarned.usdc;
      state.earned.weth += chunkEarned.weth;
      state.swapCount += chunkSwaps;
      state.scannedTo = range.toBlock;
    } catch (err) {
      // Keep the whole chunks that did land — the next poll resumes from there — and refuse to
      // present a short scan as the total.
      if (state.scannedTo >= state.fromBlock) feeScanCache.set(key, state);
      return unavailable(feeFailureReason(err));
    }
  }

  // A head that has not moved since the last poll leaves the loop empty; the recorded range is
  // then still exactly what was scanned.
  if (state.scannedTo < state.fromBlock) state.scannedTo = state.fromBlock;
  feeScanCache.set(key, state);

  return real({
    earned: { ...state.earned },
    swapCount: state.swapCount,
    fromBlock: state.fromBlock,
    toBlock: state.scannedTo,
    complete: state.complete,
  });
}

function feeFailureReason(err: unknown): string {
  return (
    `Fee history could not be read from Aqua's events: ${reason(err)}. ` +
    "Set AQUA_APP_DEPLOY_BLOCK and a provider RPC (SEPOLIA_RPC_URL) to enable it."
  );
}
