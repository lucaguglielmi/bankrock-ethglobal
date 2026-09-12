import { createPublicClient, http, formatUnits, type PublicClient } from "viem";
import { sepolia } from "viem/chains";

import { CHAIN_ID, config } from "./config.js";
import { registryAbi } from "./registry-abi.js";

/**
 * Chain reads for the MCP server. Every function here either returns data that came back from
 * an RPC call, or throws. Nothing in this file has a fallback value (decision D-019): a tool
 * that cannot reach the chain reports `unavailable`, it does not substitute a plausible number.
 */

const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

let client: PublicClient | undefined;

/** The viem client, or `undefined` when no RPC endpoint is configured. */
export function publicClient(): PublicClient | undefined {
  if (config.rpcUrl === undefined) return undefined;
  if (client === undefined) {
    client = createPublicClient({
      chain: sepolia,
      transport: http(config.rpcUrl, { timeout: config.httpTimeoutMs }),
    });
  }
  return client;
}

/**
 * Lifecycle states, in the order the registry's `RockState` enum declares them.
 *
 * `archived` is terminal: the rock was retired by its owner and its NFC tag released, so the
 * same physical tag may now back a different rock id. The archived record keeps its owner,
 * smart account and UID hash as history.
 */
const ROCK_STATES = ["dormant", "awake", "handover_pending", "archived"] as const;

export type RockRecord = {
  rockId: string;
  state: (typeof ROCK_STATES)[number] | "unknown";
  owner: `0x${string}` | null;
  smartAccount: `0x${string}` | null;
  uidHash: `0x${string}` | null;
  lost: boolean;
  handover: {
    recipient: `0x${string}` | null;
    expiresAt: string | null;
    initiatedAt: string | null;
    initiatedBy: `0x${string}` | null;
    messageHash: `0x${string}` | null;
  } | null;
};

const ZERO_ADDRESS = `0x${"0".repeat(40)}` as const;
const ZERO_BYTES32 = `0x${"0".repeat(64)}` as const;

function orNull<T extends string>(value: T, zero: string): T | null {
  return value.toLowerCase() === zero ? null : value;
}

/** Reads `getRock(rockId)` from the deployed registry. Throws if the call fails. */
export async function readRock(
  viem: PublicClient,
  registry: `0x${string}`,
  rockId: bigint,
): Promise<RockRecord> {
  const [owner, smartAccount, uidHash, state, lost, handover] = await viem.readContract({
    address: registry,
    abi: registryAbi,
    functionName: "getRock",
    args: [rockId],
  });

  // An out-of-range value means this server is reading a registry newer than its ABI. Say so
  // rather than guessing at a state name.
  const stateName: RockRecord["state"] = ROCK_STATES[state] ?? "unknown";
  const pending = stateName === "handover_pending";

  return {
    rockId: rockId.toString(),
    state: stateName,
    owner: orNull(owner, ZERO_ADDRESS),
    smartAccount: orNull(smartAccount, ZERO_ADDRESS),
    uidHash: orNull(uidHash, ZERO_BYTES32),
    lost,
    handover: pending
      ? {
          recipient: orNull(handover.recipient, ZERO_ADDRESS),
          expiresAt: new Date(Number(handover.expiresAt) * 1000).toISOString(),
          initiatedAt: new Date(Number(handover.initiatedAt) * 1000).toISOString(),
          initiatedBy: orNull(handover.initiatedBy, ZERO_ADDRESS),
          messageHash: orNull(handover.messageHash, ZERO_BYTES32),
        }
      : null,
  };
}

export type TokenBalance = {
  token: `0x${string}`;
  symbol: string;
  decimals: number;
  raw: string;
  formatted: string;
};

/** Reads one ERC-20 balance, with the token's own `symbol()` and `decimals()`. */
export async function readTokenBalance(
  viem: PublicClient,
  token: `0x${string}`,
  holder: `0x${string}`,
): Promise<TokenBalance> {
  const [raw, decimals, symbol] = await Promise.all([
    viem.readContract({ address: token, abi: ERC20_ABI, functionName: "balanceOf", args: [holder] }),
    viem.readContract({ address: token, abi: ERC20_ABI, functionName: "decimals" }),
    viem.readContract({ address: token, abi: ERC20_ABI, functionName: "symbol" }),
  ]);

  return {
    token,
    symbol,
    decimals,
    raw: raw.toString(),
    formatted: formatUnits(raw, decimals),
  };
}

/** True when the address has non-empty bytecode on the configured chain. */
export async function hasCode(viem: PublicClient, address: `0x${string}`): Promise<boolean> {
  const code = await viem.getCode({ address });
  return code !== undefined && code !== "0x";
}

export { CHAIN_ID };
