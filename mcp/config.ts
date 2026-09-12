import dotenv from "dotenv";

// `quiet` matters: this server speaks JSON-RPC over stdout, and dotenv's startup banner would
// otherwise be written there and corrupt the very first message the client reads.
dotenv.config({ quiet: true });

/**
 * Configuration for the Bank Rock Oracle MCP server.
 *
 * -------------------------------------------------------------------------------------------
 * A note on the address defaults below, because decision D-015 says addresses live in exactly
 * one module populated from the environment, with no literals elsewhere.
 *
 * This module is that one module, for this process. The MCP server is a stdio process started
 * by somebody's AI client (Claude Desktop, an IDE, a CLI). It has no build step that injects
 * environment values the way the Next.js app does, and no dashboard to configure: whatever the
 * client passes in `env` is all it gets, and in practice that is usually nothing. A server that
 * refused to start without four exported variables would simply never be used.
 *
 * So the two *token* addresses carry defaults — the Ethereum Sepolia values verified in
 * spec 16 §1.1 — and every one of them is overridable. They are constants of the target
 * network, not deployment output, and reading a balance at the wrong token address produces a
 * loudly wrong answer (a revert or a zero), never a plausible one.
 *
 * The registry address deliberately has NO default. It is deployment output; inventing one is
 * how the repository ended up with two disagreeing registry addresses, neither of which had
 * code (spec 15 C-1, C-2). Unset means the chain tools report `unavailable`.
 *
 * `SEPOLIA_RPC_URL` also has no default: without an RPC endpoint there is nothing to read, and
 * the honest answer is `unavailable`, not a guess.
 * -------------------------------------------------------------------------------------------
 */

/** Ethereum Sepolia, decision D-023. */
export const CHAIN_ID = 11155111;
export const CHAIN_NAME = "Ethereum Sepolia";
export const EXPLORER_BASE = "https://sepolia.etherscan.io";

/** Default token addresses for Ethereum Sepolia, verified in spec 16 §1.1. Overridable. */
const DEFAULT_USDC_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const DEFAULT_WETH_ADDRESS = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";

/** Canonical origin, decision D-022. */
const DEFAULT_API_URL = "https://bank-rock.com";

function env(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function address(name: string, fallback?: string): `0x${string}` | undefined {
  const raw = env(name) ?? fallback;
  if (raw === undefined) return undefined;
  if (!/^0x[0-9a-fA-F]{40}$/.test(raw)) {
    console.error(`[config] ${name}="${raw}" is not a 20-byte hex address; treating it as unset.`);
    return undefined;
  }
  return raw as `0x${string}`;
}

export const config = {
  /** Required for every chain read. No default. */
  rpcUrl: env("SEPOLIA_RPC_URL"),
  /** Deployment output. No default (spec 15 C-1/C-2). */
  registryAddress: address("REGISTRY_ADDRESS"),
  usdcAddress: address("USDC_ADDRESS", DEFAULT_USDC_ADDRESS),
  wethAddress: address("WETH_ADDRESS", DEFAULT_WETH_ADDRESS),
  /** Bank Rock web API. */
  apiUrl: (env("BANKROCK_API_URL") ?? DEFAULT_API_URL).replace(/\/+$/, ""),
  /** Operator key for the authenticated API routes (telemetry, newsletter, alerts). */
  adminApiKey: env("ADMIN_API_KEY"),
  /** Milliseconds before an HTTP call to the Bank Rock API is abandoned. */
  httpTimeoutMs: Number(env("BANKROCK_API_TIMEOUT_MS") ?? 8000),
} as const;

/** Reasons a tool reports `unavailable`, phrased for a human reading an agent transcript. */
export const REASONS = {
  noRpc: "SEPOLIA_RPC_URL is not set, so no chain read is possible.",
  noRegistry: "registry not deployed — REGISTRY_ADDRESS is not set for this MCP server.",
  noAdminKey:
    "ADMIN_API_KEY is not set. The Bank Rock telemetry and operator endpoints require an " +
    "admin key and reject anonymous requests.",
  noAqua: "Aqua strategy not integrated (spec 15 Phase 3).",
  noBridge: "cross-chain bridging is not integrated; it remains a labelled simulation in the web app only (spec 15 Part 6).",
  noIdleYield: "idle-yield routing (Aave/Morpho) was cut from scope (spec 15 Part 6).",
  noKeeper: "the keeper is a simulation and executes nothing on-chain (spec 15 Part 8).",
  noTokenConfig: "USDC_ADDRESS / WETH_ADDRESS are not configured, so no balance can be read.",
} as const;
