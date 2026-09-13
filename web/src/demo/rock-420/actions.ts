/**
 * The demo's mutations, as pure functions: `(state, params) -> { state, result }`.
 *
 * Every result is a `Capability` in state `DEMO` or `UNAVAILABLE` — never `REAL` — so the
 * components that already render the three states show the SIMULATED badge and the words
 * "no transaction — simulated" on their own (`rock/action-result.tsx`, `sheets/capability-result`).
 * No result carries a `txHash`: there was no transaction (D-014).
 *
 * The maths is the real maths. A swap is priced with `quoteExactIn`, the mirror of
 * `XYCSwap._quoteExactIn`, against the stream's virtual balances; the whole input is pushed into
 * the rock, the output leaves it, the fee is `amountIn * feeBps / 10000` in the input token, and
 * `executable = min(virtual, held, allowance)` caps what a stream can pay out — the same rules
 * `contracts/aqua/NOTES.md` §6–7 describe. A refused action returns the state untouched.
 */

import type { Address, Hex } from "viem";
import { quoteExactIn } from "@/lib/aqua/quote";
import { streamPresetFor } from "@/lib/aqua/strategy";
import { tokens } from "@/lib/chain";
import { demo, unavailable, type Capability } from "@/lib/demo";
import { formatAmount } from "@/lib/ui/format";
import { formatFeeRate } from "@/components/rock/util";
import {
  demoExecutable,
  demoStrategyFor,
  demoStreamLabel,
  ZERO,
  type DemoActivityRow,
  type DemoAmounts,
  type DemoRockState,
  type DemoStream,
} from "./state";

export interface DemoOutcome<T> {
  state: DemoRockState;
  result: Capability<T>;
}

export type DemoToken = "USDC" | "WETH";

function refuse<T>(state: DemoRockState, reason: string): DemoOutcome<T> {
  return { state, result: unavailable(reason) };
}

function fmt(amount: bigint, token: DemoToken): string {
  const meta = tokens[token];
  return `${formatAmount(amount, {
    decimals: meta.decimals,
    maxFractionDigits: token === "USDC" ? 2 : 4,
  })} ${token}`;
}

function withRow(
  state: DemoRockState,
  now: number,
  row: Omit<DemoActivityRow, "id" | "timestamp"> & { kind: string },
): DemoRockState {
  const { kind, ...rest } = row;
  const entry: DemoActivityRow = {
    id: `${kind}-${now}-${state.activity.length}`,
    timestamp: new Date(now).toISOString(),
    ...rest,
  };
  return { ...state, activity: [entry, ...state.activity] };
}

function liveStream(state: DemoRockState, streamIndex: number): DemoStream | undefined {
  return state.streams.find((stream) => stream.streamIndex === streamIndex);
}

/* -------------------------------------------------------------------------- */
/* Money in                                                                    */
/* -------------------------------------------------------------------------- */

/** Credits the rock. In the real app this is a wallet transfer to the Rock Account; here it is a line item. */
export function fundDemoRock(
  state: DemoRockState,
  amounts: DemoAmounts,
  now: number = Date.now(),
): DemoOutcome<DemoAmounts> {
  if (state.state === "archived") return refuse(state, "A retired rock cannot be funded");
  if (amounts.usdc < ZERO || amounts.weth < ZERO) return refuse(state, "An amount cannot be negative");
  if (amounts.usdc === ZERO && amounts.weth === ZERO) {
    return refuse(state, "Enter an amount of USDC or WETH to add");
  }

  const parts = [
    amounts.usdc > ZERO ? fmt(amounts.usdc, "USDC") : null,
    amounts.weth > ZERO ? fmt(amounts.weth, "WETH") : null,
  ].filter((part): part is string => part !== null);

  const next = withRow(
    {
      ...state,
      holdings: {
        usdc: state.holdings.usdc + amounts.usdc,
        weth: state.holdings.weth + amounts.weth,
      },
    },
    now,
    {
      kind: "fund",
      type: "hardware",
      title: "Funded",
      description: `${parts.join(" and ")} added to the rock's account.`,
    },
  );
  return { state: next, result: demo(amounts) };
}

/* -------------------------------------------------------------------------- */
/* Strategies                                                                  */
/* -------------------------------------------------------------------------- */

export interface ShipDemoParams {
  streamIndex: number;
  feeBps: number;
  usdcAmount: bigint;
  wethAmount: bigint;
}

/**
 * Opens a stream. Moves no tokens: the holdings stay put and the stream gains an allowance. The
 * ERC-20 allowance is raised to the shipped amount when it is lower — `approve` sets, it does not
 * add, which is exactly what `buildApprovals` does in the real hook.
 */
export function shipDemoStrategy(
  state: DemoRockState,
  params: ShipDemoParams,
  now: number = Date.now(),
): DemoOutcome<{ strategyHash: Hex }> {
  if (state.state === "archived") return refuse(state, "A retired rock has no owner actions left");
  if (state.state === "handover_pending") {
    return refuse(state, "This rock is being handed over, so its strategies cannot change");
  }
  if (!Number.isInteger(params.streamIndex) || params.streamIndex < 0) {
    return refuse(state, "That is not a stream index");
  }
  if (liveStream(state, params.streamIndex)) {
    return refuse(state, `Stream ${params.streamIndex + 1} is already live — a strategy is immutable`);
  }
  if (state.stopped.includes(params.streamIndex)) {
    return refuse(state, `Stream ${params.streamIndex + 1} was stopped, and a stopped stream cannot be restarted`);
  }
  const preset = streamPresetFor(params.streamIndex);
  if (preset && preset.feeBps !== params.feeBps) {
    return refuse(
      state,
      `Stream ${params.streamIndex + 1} is the ${preset.label} preset at ${formatFeeRate(preset.feeBps)}; no reader would find it at another fee`,
    );
  }
  if (params.usdcAmount <= ZERO || params.wethAmount <= ZERO) {
    return refuse(state, "A strategy needs both USDC and WETH to trade against");
  }
  if (params.usdcAmount > state.holdings.usdc || params.wethAmount > state.holdings.weth) {
    return refuse(state, "This rock does not hold that much");
  }

  const stream: DemoStream = {
    streamIndex: params.streamIndex,
    feeBps: params.feeBps,
    label: demoStreamLabel(params.streamIndex),
    virtual: { usdc: params.usdcAmount, weth: params.wethAmount },
    fees: { usdc: ZERO, weth: ZERO, swapCount: 0 },
  };
  const { strategyHash } = demoStrategyFor(stream.streamIndex, stream.feeBps);

  const next = withRow(
    {
      ...state,
      streams: [...state.streams, stream],
      allowance: {
        usdc: state.allowance.usdc >= params.usdcAmount ? state.allowance.usdc : params.usdcAmount,
        weth: state.allowance.weth >= params.wethAmount ? state.allowance.weth : params.wethAmount,
      },
    },
    now,
    {
      kind: "ship",
      type: "hardware",
      title: `Started earning — ${stream.label}`,
      description: `${fmt(params.usdcAmount, "USDC")} and ${fmt(params.wethAmount, "WETH")} allowed to trade at ${formatFeeRate(params.feeBps)} per trade. Nothing left the account.`,
    },
  );
  return { state: next, result: demo({ strategyHash }) };
}

/** Closes a stream. Docking *is* the withdrawal: nothing comes back because nothing ever left. */
export function dockDemoStrategy(
  state: DemoRockState,
  streamIndex: number,
  now: number = Date.now(),
): DemoOutcome<{ streamIndex: number }> {
  if (state.state === "archived") return refuse(state, "A retired rock has no owner actions left");
  if (state.state === "handover_pending") {
    return refuse(state, "This rock is being handed over, so its strategies cannot change");
  }
  const stream = liveStream(state, streamIndex);
  if (!stream) return refuse(state, `This rock has no live Aqua strategy at stream ${streamIndex}`);

  const next = withRow(
    {
      ...state,
      streams: state.streams.filter((candidate) => candidate.streamIndex !== streamIndex),
      stopped: [...state.stopped, streamIndex],
    },
    now,
    {
      kind: "dock",
      type: "hardware",
      title: `Stopped — ${stream.label}`,
      description: `The stream's allowance is closed. Its ${fmt(stream.fees.usdc, "USDC")} and ${fmt(stream.fees.weth, "WETH")} of fees were already in the rock's balance.`,
    },
  );
  return { state: next, result: demo({ streamIndex }) };
}

/* -------------------------------------------------------------------------- */
/* Trading                                                                     */
/* -------------------------------------------------------------------------- */

export interface SwapDemoParams {
  streamIndex: number;
  tokenIn: DemoToken;
  /** Base units of `tokenIn`. */
  amountIn: bigint;
  /** The floor the visitor accepted, in base units of the other token. */
  minAmountOut: bigint;
}

/**
 * A visitor's swap against one stream, priced by the mirrored curve.
 *
 * Refused, with the reason, when the stream is not live, the visitor's account cannot pay, the
 * quote falls under the accepted floor, or the stream cannot settle the output — the same four
 * ways the real swap fails, minus the bundler.
 */
export function swapDemo(
  state: DemoRockState,
  params: SwapDemoParams,
  now: number = Date.now(),
): DemoOutcome<{ amountOut: bigint }> {
  if (state.state === "archived") return refuse(state, "A retired rock does not trade");
  if (params.amountIn <= ZERO) return refuse(state, "Enter an amount to swap");

  const stream = liveStream(state, params.streamIndex);
  if (!stream) return refuse(state, `This rock has no live Aqua strategy at stream ${params.streamIndex}`);

  const tokenOut: DemoToken = params.tokenIn === "USDC" ? "WETH" : "USDC";
  const inKey = params.tokenIn === "USDC" ? "usdc" : "weth";
  const outKey = tokenOut === "USDC" ? "usdc" : "weth";

  if (state.taker[inKey] < params.amountIn) {
    return refuse(
      state,
      `Your account holds ${fmt(state.taker[inKey], params.tokenIn)}, which is less than this swap needs`,
    );
  }

  const balanceIn = stream.virtual[inKey];
  const balanceOut = stream.virtual[outKey];
  if (balanceIn <= ZERO || balanceOut <= ZERO) {
    return refuse(state, "This strategy has no balance on one side, so it cannot price a trade");
  }

  let quote;
  try {
    quote = quoteExactIn({ balanceIn, balanceOut, feeBps: stream.feeBps }, params.amountIn);
  } catch (err) {
    return refuse(state, err instanceof Error ? err.message : String(err));
  }
  if (quote.amountOut <= ZERO) {
    return refuse(state, "This amount is too small to receive anything back at this strategy's size");
  }
  if (quote.amountOut < params.minAmountOut) {
    return refuse(
      state,
      "The price moved below the floor you accepted, so the swap was not made and nothing moved",
    );
  }

  const executableOut = demoExecutable(state, stream)[outKey];
  if (quote.amountOut > executableOut) {
    return refuse(
      state,
      `This strategy can pay out at most ${fmt(executableOut, tokenOut)} right now. Try a smaller amount.`,
    );
  }

  const nextStream: DemoStream = {
    ...stream,
    virtual: {
      ...stream.virtual,
      [inKey]: balanceIn + params.amountIn,
      [outKey]: balanceOut - quote.amountOut,
    },
    fees: {
      ...stream.fees,
      [inKey]: stream.fees[inKey] + quote.feeAmount,
      swapCount: stream.fees.swapCount + 1,
    },
  };

  const next = withRow(
    {
      ...state,
      streams: state.streams.map((candidate) =>
        candidate.streamIndex === stream.streamIndex ? nextStream : candidate,
      ),
      holdings: {
        ...state.holdings,
        [inKey]: state.holdings[inKey] + params.amountIn,
        [outKey]: state.holdings[outKey] - quote.amountOut,
      },
      // `pull` is a `transferFrom` out of the maker, so it spends the maker's allowance.
      allowance: { ...state.allowance, [outKey]: state.allowance[outKey] - quote.amountOut },
      taker: {
        ...state.taker,
        [inKey]: state.taker[inKey] - params.amountIn,
        [outKey]: state.taker[outKey] + quote.amountOut,
      },
    },
    now,
    {
      kind: "swap",
      type: "trade",
      title: `Traded ${fmt(params.amountIn, params.tokenIn)} for ${fmt(quote.amountOut, tokenOut)}`,
      description: `A visitor ${params.tokenIn === "USDC" ? "bought" : "sold"} WETH on the ${stream.label} stream. The rock kept ${fmt(quote.feeAmount, params.tokenIn)} in fees.`,
    },
  );
  return { state: next, result: demo({ amountOut: quote.amountOut }) };
}

/* -------------------------------------------------------------------------- */
/* Ownership                                                                   */
/* -------------------------------------------------------------------------- */

export interface OpenHandoverDemoParams {
  recipient: Address;
  /** Unix seconds. */
  expiresAt: number;
  message?: string;
}

export function openDemoHandover(
  state: DemoRockState,
  params: OpenHandoverDemoParams,
  now: number = Date.now(),
): DemoOutcome<{ recipient: Address }> {
  if (state.state === "archived") return refuse(state, "A retired rock cannot be given away");
  if (state.state === "handover_pending") {
    return refuse(state, "This rock already has an open handover. Cancel it before opening another.");
  }
  if (!Number.isInteger(params.expiresAt) || params.expiresAt * 1000 <= now) {
    return refuse(state, "The handover expiry must be in the future");
  }
  const message = params.message?.trim() || null;

  const next = withRow(
    {
      ...state,
      state: "handover_pending",
      handover: {
        recipient: params.recipient,
        expiresAt: params.expiresAt,
        initiatedAt: Math.floor(now / 1000),
        message,
      },
    },
    now,
    {
      kind: "handover-open",
      type: "transfer",
      title: "Handover opened",
      description: `Set aside for a named recipient until ${new Date(params.expiresAt * 1000).toLocaleDateString("en-GB", { dateStyle: "medium" })}. The rock stays yours until they tap it.`,
    },
  );
  return { state: next, result: demo({ recipient: params.recipient }) };
}

export function cancelDemoHandover(
  state: DemoRockState,
  now: number = Date.now(),
): DemoOutcome<{ cancelled: true }> {
  if (state.state !== "handover_pending" || !state.handover) {
    return refuse(state, "This rock has no open handover to cancel");
  }
  const next = withRow(
    { ...state, state: "awake", handover: null },
    now,
    {
      kind: "handover-cancel",
      type: "transfer",
      title: "Handover cancelled",
      description: "The gift was withdrawn before it was claimed. Nothing about the rock changed.",
    },
  );
  return { state: next, result: demo({ cancelled: true }) };
}

/** The recipient collects the rock. Only reachable with a verified tap, which the demo has none of. */
export function claimDemoHandover(
  state: DemoRockState,
  claimant: Address,
  now: number = Date.now(),
): DemoOutcome<{ owner: Address }> {
  if (state.state !== "handover_pending" || !state.handover) {
    return refuse(state, "This rock is not being handed over");
  }
  if (state.handover.expiresAt * 1000 <= now) {
    return refuse(state, "This handover has expired");
  }
  if (state.handover.recipient.toLowerCase() !== claimant.toLowerCase()) {
    return refuse(state, "This rock was set aside for a different wallet");
  }
  const next = withRow(
    { ...state, state: "awake", handover: null, owner: claimant },
    now,
    {
      kind: "handover-claim",
      type: "transfer",
      title: "Claimed",
      description: "The rock changed hands. Its account and its liquidity came with it.",
    },
  );
  return { state: next, result: demo({ owner: claimant }) };
}

export function setDemoLost(
  state: DemoRockState,
  lost: boolean,
  now: number = Date.now(),
): DemoOutcome<{ lost: boolean }> {
  if (state.state === "archived") return refuse(state, "A retired rock has no owner actions left");
  if (state.lost === lost) {
    return refuse(state, lost ? "This rock is already marked lost" : "This rock is not marked lost");
  }
  const next = withRow(
    { ...state, lost },
    now,
    {
      kind: lost ? "lost" : "found",
      type: "hardware",
      title: lost ? "Marked lost" : "Lost mark cleared",
      description: lost
        ? "The owner marked the tag as lost. It warns people who tap it; it freezes nothing."
        : "The owner cleared the lost mark.",
    },
  );
  return { state: next, result: demo({ lost }) };
}

export function archiveDemoRock(
  state: DemoRockState,
  now: number = Date.now(),
): DemoOutcome<{ archived: true }> {
  if (state.state === "archived") return refuse(state, "This rock is already retired");
  if (state.state === "handover_pending") {
    return refuse(state, "Cancel the open handover before retiring this rock");
  }
  const next = withRow(
    { ...state, state: "archived", streams: [], handover: null },
    now,
    {
      kind: "archive",
      type: "hardware",
      title: "Retired",
      description: "The rock's life in the app ended. Its history stays readable.",
    },
  );
  return { state: next, result: demo({ archived: true }) };
}
