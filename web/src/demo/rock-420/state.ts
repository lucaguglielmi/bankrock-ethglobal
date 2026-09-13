/**
 * The demo model for rock #420: what the browser pretends the chain holds.
 *
 * Pure data and pure builders — no React, no `localStorage`, no network — so the same module
 * serves the hooks in the browser, the quote route on the server, and the tests. Persistence is
 * `store.ts`; mutations are `actions.ts`.
 *
 * Amounts are `bigint` base units, exactly as the real reads deliver them, so every component
 * formats a demo figure with the same code path it formats a real one.
 */

import { parseUnits, type Address, type Hex } from "viem";
import { buildStrategy, DEFAULT_STREAMS, streamPresetFor } from "@/lib/aqua/strategy";
import type { ParsedStrategyView, ParsedStream } from "@/lib/aqua/serialize";
import { messageHashFor, type RockRecord, type RockState } from "@/lib/rock-account";
import { tokens } from "@/lib/chain";
import { DEMO_ADDRESSES, DEMO_ROCK_ID, DEMO_UID_HASH } from "./constants";

/* -------------------------------------------------------------------------- */
/* Shape                                                                       */
/* -------------------------------------------------------------------------- */

export interface DemoAmounts {
  usdc: bigint;
  weth: bigint;
}

export interface DemoStream {
  streamIndex: number;
  feeBps: number;
  label: string;
  /** What Aqua would track for this stream: an allowance against the reserve, not a deposit. */
  virtual: DemoAmounts;
  /** Fees the stream has earned, by token, and how many trades they came from. */
  fees: DemoAmounts & { swapCount: number };
}

export interface DemoHandover {
  recipient: Address;
  /** Unix seconds. */
  expiresAt: number;
  initiatedAt: number;
  message: string | null;
}

/** One provenance row. It carries no `txHash` and never will (D-014). */
export interface DemoActivityRow {
  id: string;
  type: "trade" | "transfer" | "awaken" | "hardware";
  title: string;
  description?: string;
  /** ISO 8601. */
  timestamp: string;
}

export interface DemoRockState {
  version: 1;
  state: Exclude<RockState, "dormant">;
  lost: boolean;
  /** Set after a claim. `null` means "whoever is signed in", which is the demo's premise. */
  owner: Address | null;
  /** The rock's real-looking token balances — one reserve, shared by every stream. */
  holdings: DemoAmounts;
  /** What the rock has "approved Aqua" for. `approve` sets, so this is the largest shipped amount. */
  allowance: DemoAmounts;
  streams: DemoStream[];
  /** Stream indexes that were shipped and later docked. Never offered again. */
  stopped: number[];
  handover: DemoHandover | null;
  /** The visitor's personal account in the Trade tab. Generous, and moved by every demo swap. */
  taker: DemoAmounts;
  /** Newest first. */
  activity: DemoActivityRow[];
  seededAt: number;
}

export const ZERO = BigInt(0);

export function usdc(amount: string | number): bigint {
  return parseUnits(String(amount), tokens.USDC.decimals);
}

export function weth(amount: string | number): bigint {
  return parseUnits(String(amount), tokens.WETH.decimals);
}

function min(...values: bigint[]): bigint {
  return values.reduce((a, b) => (a < b ? a : b));
}

/* -------------------------------------------------------------------------- */
/* Seed                                                                        */
/* -------------------------------------------------------------------------- */

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(now: number, days: number, hours = 0): string {
  return new Date(now - days * DAY_MS - hours * 60 * 60 * 1000).toISOString();
}

const WIDE = DEFAULT_STREAMS[0];
const TIGHT = DEFAULT_STREAMS[1];

/**
 * The starting position: a rock that has been busy for seven weeks.
 *
 *   held      25,000 USDC and 12.5 WETH — the same 2,000 USDC per WETH both streams price at
 *   Wide      allows 18,000 USDC / 9 WETH, 24 trades so far
 *   Tight     allows 12,000 USDC / 6 WETH, 43 trades so far
 *   allowance 18,000 USDC / 9 WETH — `approve` sets, so it is the larger shipment
 *   history   awakened, funded, two strategies started, ten recent trades, one gift received
 */
export function seedDemoRock(now: number = Date.now()): DemoRockState {
  const trade = (id: number, days: number, hours: number, text: string, detail: string): DemoActivityRow => ({
    id: `seed-trade-${id}`,
    type: "trade",
    title: text,
    description: detail,
    timestamp: daysAgo(now, days, hours),
  });

  return {
    version: 1,
    state: "awake",
    lost: false,
    owner: null,
    holdings: { usdc: usdc("25000"), weth: weth("12.5") },
    allowance: { usdc: usdc("18000"), weth: weth("9") },
    streams: [
      {
        streamIndex: WIDE.streamIndex,
        feeBps: WIDE.feeBps,
        label: WIDE.label,
        virtual: { usdc: usdc("18000"), weth: weth("9") },
        fees: { usdc: usdc("41.85"), weth: weth("0.00614"), swapCount: 24 },
      },
      {
        streamIndex: TIGHT.streamIndex,
        feeBps: TIGHT.feeBps,
        label: TIGHT.label,
        virtual: { usdc: usdc("12000"), weth: weth("6") },
        fees: { usdc: usdc("5.12"), weth: weth("0.00173"), swapCount: 43 },
      },
    ],
    stopped: [],
    handover: null,
    taker: { usdc: usdc("50000"), weth: weth("25") },
    activity: [
      trade(10, 1, 3, "Traded 250 USDC for 0.1245 WETH", "A visitor bought WETH on the Tight stream."),
      trade(9, 3, 7, "Traded 0.5 WETH for 995.20 USDC", "A visitor sold WETH on the Wide stream."),
      trade(8, 6, 1, "Traded 1,200 USDC for 0.5964 WETH", "A visitor bought WETH on the Tight stream."),
      trade(7, 9, 5, "Traded 80 USDC for 0.0399 WETH", "A visitor bought WETH on the Tight stream."),
      trade(6, 13, 2, "Traded 0.25 WETH for 498.10 USDC", "A visitor sold WETH on the Wide stream."),
      trade(5, 16, 9, "Traded 2,000 USDC for 0.9925 WETH", "A visitor bought WETH on the Wide stream."),
      {
        id: "seed-gift-claimed",
        type: "transfer",
        title: "Received as a gift",
        description:
          "The previous owner handed this rock over and you claimed it with a tap. Its account and its liquidity came with it.",
        timestamp: daysAgo(now, 20, 4),
      },
      {
        id: "seed-gift-opened",
        type: "transfer",
        title: "Handover opened",
        description: "The previous owner named you as the recipient, with seven days to claim.",
        timestamp: daysAgo(now, 21, 6),
      },
      trade(4, 22, 8, "Traded 600 USDC for 0.2988 WETH", "A visitor bought WETH on the Wide stream."),
      trade(3, 27, 3, "Traded 0.1 WETH for 199.48 USDC", "A visitor sold WETH on the Tight stream."),
      trade(2, 31, 5, "Traded 450 USDC for 0.2242 WETH", "A visitor bought WETH on the Tight stream."),
      trade(1, 38, 2, "Traded 100 USDC for 0.0497 WETH", "The first trade, on the Wide stream."),
      {
        id: "seed-ship-tight",
        type: "hardware",
        title: "Started earning — Tight",
        description: "A second stream over the same reserve, at 0.05% per trade. 12,000 USDC and 6 WETH allowed.",
        timestamp: daysAgo(now, 40, 1),
      },
      {
        id: "seed-ship-wide",
        type: "hardware",
        title: "Started earning — Wide",
        description: "18,000 USDC and 9 WETH allowed to trade at 0.30% per trade. Nothing left the account.",
        timestamp: daysAgo(now, 45, 2),
      },
      {
        id: "seed-funded",
        type: "hardware",
        title: "Funded",
        description: "24,000 USDC and 12 WETH arrived in the rock's account.",
        timestamp: daysAgo(now, 46, 5),
      },
      {
        id: "seed-awakened",
        type: "awaken",
        title: "Awakened",
        description: "A first tap opened this rock's account and recorded its first owner.",
        timestamp: daysAgo(now, 47, 6),
      },
    ],
    seededAt: now,
  };
}

/* -------------------------------------------------------------------------- */
/* Serialisation — `bigint` does not survive JSON                              */
/* -------------------------------------------------------------------------- */

const BIGINT_TAG = "$bigint";

export function serializeDemoRock(state: DemoRockState): string {
  return JSON.stringify(state, (_key, value: unknown) =>
    typeof value === "bigint" ? { [BIGINT_TAG]: value.toString() } : value,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAmounts(value: unknown): value is DemoAmounts {
  return isRecord(value) && typeof value.usdc === "bigint" && typeof value.weth === "bigint";
}

/**
 * Parses a persisted state, or returns `null` for anything that is not exactly the current shape.
 * A broken or foreign payload means "start from the seed", never "render half a rock".
 */
export function deserializeDemoRock(raw: string): DemoRockState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw, (_key, value: unknown) => {
      if (isRecord(value) && typeof value[BIGINT_TAG] === "string") {
        try {
          return BigInt(value[BIGINT_TAG] as string);
        } catch {
          return value;
        }
      }
      return value;
    });
  } catch {
    return null;
  }

  if (!isRecord(parsed) || parsed.version !== 1) return null;
  const candidate = parsed as Partial<DemoRockState>;
  if (
    (candidate.state !== "awake" &&
      candidate.state !== "handover_pending" &&
      candidate.state !== "archived") ||
    typeof candidate.lost !== "boolean" ||
    !isAmounts(candidate.holdings) ||
    !isAmounts(candidate.allowance) ||
    !isAmounts(candidate.taker) ||
    !Array.isArray(candidate.streams) ||
    !Array.isArray(candidate.stopped) ||
    !Array.isArray(candidate.activity) ||
    typeof candidate.seededAt !== "number"
  ) {
    return null;
  }
  for (const stream of candidate.streams) {
    if (
      !isRecord(stream) ||
      typeof stream.streamIndex !== "number" ||
      typeof stream.feeBps !== "number" ||
      !isAmounts(stream.virtual) ||
      !isAmounts(stream.fees) ||
      typeof (stream.fees as { swapCount?: unknown }).swapCount !== "number"
    ) {
      return null;
    }
  }
  return candidate as DemoRockState;
}

/* -------------------------------------------------------------------------- */
/* Views — what the hooks hand to the components                               */
/* -------------------------------------------------------------------------- */

/** Case-insensitive address comparison, tolerant of either side missing. */
export function sameDemoAddress(a?: string | null, b?: string | null): boolean {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

/**
 * Who owns the demo rock, as seen by `viewer`.
 *
 * The premise is "the signed-in user owns it", so with no explicit owner recorded the viewer is
 * the owner. Two exceptions keep the gift story straight: an explicit owner (set by a claim) wins,
 * and a viewer who is the *named recipient* of the open handover is not the owner yet — the
 * previous owner is. Signed out, the rock belongs to the seeded previous owner.
 */
export function demoOwnerFor(state: DemoRockState, viewer?: string): Address {
  if (state.owner) return state.owner;
  if (!viewer) return DEMO_ADDRESSES.giver;
  if (state.handover && sameDemoAddress(state.handover.recipient, viewer)) {
    return DEMO_ADDRESSES.giver;
  }
  return viewer as Address;
}

export function demoRecordFor(state: DemoRockState, viewer?: string): RockRecord {
  const owner = demoOwnerFor(state, viewer);
  return {
    rockId: DEMO_ROCK_ID,
    owner,
    smartAccount: DEMO_ADDRESSES.account,
    uidHash: DEMO_UID_HASH,
    state: state.state,
    lost: state.lost,
    handover:
      state.state === "handover_pending" && state.handover
        ? {
            recipient: state.handover.recipient,
            expiresAt: state.handover.expiresAt,
            initiatedAt: state.handover.initiatedAt,
            initiatedBy: owner,
            messageHash: messageHashFor(state.handover.message),
          }
        : null,
  };
}

/** The strategy bytes and hash rock 420 would really have for this stream, from `buildStrategy`. */
export function demoStrategyFor(streamIndex: number, feeBps: number): { strategy: Hex; strategyHash: Hex } {
  const encoded = buildStrategy({
    maker: DEMO_ADDRESSES.account,
    token0: DEMO_ADDRESSES.usdc,
    token1: DEMO_ADDRESSES.weth,
    feeBps,
    rockId: DEMO_ROCK_ID,
    streamIndex,
  });
  return { strategy: encoded.strategy, strategyHash: encoded.strategyHash };
}

/** `executable = min(virtual, held, allowance)` — the same rule `lib/aqua/read.ts` applies. */
export function demoExecutable(state: DemoRockState, stream: DemoStream): DemoAmounts {
  return {
    usdc: min(stream.virtual.usdc, state.holdings.usdc, state.allowance.usdc),
    weth: min(stream.virtual.weth, state.holdings.weth, state.allowance.weth),
  };
}

export function demoParsedStream(state: DemoRockState, stream: DemoStream): ParsedStream {
  const { strategy, strategyHash } = demoStrategyFor(stream.streamIndex, stream.feeBps);
  return {
    strategyHash,
    strategy,
    feeBps: BigInt(stream.feeBps),
    streamIndex: BigInt(stream.streamIndex),
    label: stream.label,
    virtual: { ...stream.virtual },
    executable: demoExecutable(state, stream),
    fees: {
      earned: { usdc: stream.fees.usdc, weth: stream.fees.weth },
      swapCount: stream.fees.swapCount,
      // No blocks were scanned: the figure is complete by construction, so the range is not shown.
      fromBlock: ZERO,
      toBlock: ZERO,
      complete: true,
    },
  };
}

export function demoStrategyViewFor(state: DemoRockState): ParsedStrategyView {
  return {
    rockId: DEMO_ROCK_ID,
    maker: DEMO_ADDRESSES.account,
    app: DEMO_ADDRESSES.app,
    aqua: DEMO_ADDRESSES.aqua,
    actual: { ...state.holdings },
    allowance: { ...state.allowance },
    streams: [...state.streams]
      .sort((a, b) => a.streamIndex - b.streamIndex)
      .map((stream) => demoParsedStream(state, stream)),
    stopped: state.stopped.map((index) => BigInt(index)),
  };
}

/** The catalogue label for a stream index, so a shipped demo stream is named like a real one. */
export function demoStreamLabel(streamIndex: number): string {
  return streamPresetFor(streamIndex)?.label ?? `Stream ${streamIndex + 1}`;
}
