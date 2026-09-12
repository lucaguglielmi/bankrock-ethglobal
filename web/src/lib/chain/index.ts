/**
 * The single source of truth for chain identity and contract addresses (D-015).
 *
 * No address literal may appear in a component, hook, API route, keeper function or MCP tool.
 * Every address arrives here from an environment variable and is format-validated at module
 * load. A missing optional address yields `undefined`, and callers must render UNAVAILABLE
 * (D-013) rather than substitute anything.
 *
 * Target network: Ethereum Sepolia, chain id 11155111 (D-023, spec 16 §1.1).
 */

import { createPublicClient, http, fallback, isAddress, getAddress, type Address } from "viem";
import { sepolia, baseSepolia } from "viem/chains";
import { env, optionalEnv, unavailable, real, type Capability } from "@/lib/demo";
import { publicReasonWith } from "@/lib/errors";

export const SEPOLIA_CHAIN_ID = 11155111;

/** Validates the configured chain id. Unset is accepted and defaults to Sepolia. */
export function parseChainIdEnv(value: string | undefined): number {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") return SEPOLIA_CHAIN_ID;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed)) {
    throw new Error(
      `NEXT_PUBLIC_CHAIN_ID must be an integer; got "${trimmed}"`,
    );
  }
  return parsed;
}

/** Validated at module load — a malformed value fails the process, it never degrades silently. */
export const chainId = parseChainIdEnv(env.chainId);

/** The one chain this application targets. */
export const chain = chainId === 84532 ? baseSepolia : sepolia;

/**
 * Parses an address from configuration.
 *
 * - unset / blank -> undefined (the capability is UNAVAILABLE, not broken)
 * - malformed     -> throws at module load, loudly, naming the variable (D-015)
 */
export function parseAddressEnv(name: string, value: string | undefined): Address | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  if (!isAddress(trimmed, { strict: false })) {
    throw new Error(`${name} is not a valid 20-byte hex address: "${trimmed}"`);
  }
  return getAddress(trimmed);
}


/**
 * Every address the application knows about. `undefined` means "not deployed / not configured".
 *
 * aqua / usdc / weth      : fixed, published values (spec 16 §1.1)
 * registry                : output of our own deploy (Phase 2)
 * aquaApp / aquaTaker     : outputs of `contracts/scripts/deploy-aqua-app.js` (Phase 3)
 *
 * There is no SwapVM router address. That path was not taken — the reference `XYCSwap` AquaApp is
 * what is deployed — and the router's `quote` signature was never verified, so an ABI for it would
 * have been a guess. See `contracts/scripts/deploy-swapvm-router.md` if it is ever revisited.
 */
export const addresses = {
  aqua: parseAddressEnv("NEXT_PUBLIC_AQUA_ADDRESS", env.aquaAddress),
  usdc: parseAddressEnv("NEXT_PUBLIC_USDC_ADDRESS", env.usdcAddress),
  weth: parseAddressEnv("NEXT_PUBLIC_WETH_ADDRESS", env.wethAddress),
  registry: parseAddressEnv("NEXT_PUBLIC_REGISTRY_ADDRESS", env.registryAddress),
  aquaApp: parseAddressEnv("NEXT_PUBLIC_AQUA_APP_ADDRESS", env.aquaAppAddress),
  aquaTaker: parseAddressEnv("NEXT_PUBLIC_AQUA_TAKER_ADDRESS", env.aquaTakerAddress),
} as const;

export type AddressKey = keyof typeof addresses;

const ADDRESS_ENV_NAMES: Record<AddressKey, string> = {
  aqua: "NEXT_PUBLIC_AQUA_ADDRESS",
  usdc: "NEXT_PUBLIC_USDC_ADDRESS",
  weth: "NEXT_PUBLIC_WETH_ADDRESS",
  registry: "NEXT_PUBLIC_REGISTRY_ADDRESS",
  aquaApp: "NEXT_PUBLIC_AQUA_APP_ADDRESS",
  aquaTaker: "NEXT_PUBLIC_AQUA_TAKER_ADDRESS",
};

/**
 * Returns a configured address, or UNAVAILABLE naming the variable that is missing.
 * This is the only supported way to reach an address from a route or a hook.
 */
export function requireAddress(key: AddressKey): Capability<Address> {
  const value = addresses[key];
  if (!value) {
    return unavailable(`${ADDRESS_ENV_NAMES[key]} is not configured`);
  }
  return real(value);
}

/**
 * ERC-4337 EntryPoint v0.7, verified on Sepolia at 16,035 bytes (spec 16 §1.1).
 *
 * Canonical and identical on every chain, so it is a constant rather than a variable — and this
 * module is the only place an address literal may appear (D-015).
 */
export const ENTRY_POINT_07_ADDRESS: Address = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

/**
 * Safe's owner linked-list sentinel.
 *
 * The owner list of a single-owner Safe is `SENTINEL -> owner -> SENTINEL`, and `swapOwner` takes
 * the entry that points at the one being replaced — the sentinel, in that case. It is a protocol
 * constant, identical on every chain; it lives here because this module is the only place an
 * address literal may appear (D-015).
 */
export const SAFE_SENTINEL_OWNER: Address = "0x0000000000000000000000000000000000000001";

/** Token metadata. Decimals verified on Sepolia (spec 16 §1.1). */
export const tokens = {
  USDC: { symbol: "USDC", decimals: 6, address: addresses.usdc },
  WETH: { symbol: "WETH", decimals: 18, address: addresses.weth },
} as const;

export type TokenSymbol = keyof typeof tokens;

export function isTokenSymbol(value: string): value is TokenSymbol {
  return value === "USDC" || value === "WETH";
}

/** Block explorer for Sepolia. */
export const explorer = {
  name: "Sepolia Etherscan",
  baseUrl: "https://sepolia.etherscan.io",
  /** A transaction link may only ever be built from a real, broadcast hash (D-014). */
  tx(hash: string): string {
    return `https://sepolia.etherscan.io/tx/${hash}`;
  },
  address(address: string): string {
    return `https://sepolia.etherscan.io/address/${address}`;
  },
  block(blockNumber: bigint | number | string): string {
    return `https://sepolia.etherscan.io/block/${blockNumber.toString()}`;
  },
} as const;

/** The canonical application origin (D-022). */
export const appUrl = env.appUrl;

export function appPath(path: string): string {
  return `${appUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * A viem public client for Sepolia.
 *
 * Server-side the RPC comes from SEPOLIA_RPC_URL (a real provider — public RPCs reject wide
 * eth_getLogs, see X-5). In the browser, or when it is unset, viem's default Sepolia transport
 * is used; reads may then be rate-limited, which surfaces as UNAVAILABLE, never as a guess.
 */
function createSepoliaClient() {
  const rpcUrl = optionalEnv("SEPOLIA_RPC_URL");
  return createPublicClient({
    chain: sepolia,
    transport: rpcUrl
      ? fallback([http(rpcUrl, { timeout: 10_000, retryCount: 2 }), http()])
      : http(),
  });
}

let cachedPublicClient: ReturnType<typeof createSepoliaClient> | null = null;

export function getPublicClient(): ReturnType<typeof createSepoliaClient> {
  if (!cachedPublicClient) {
    cachedPublicClient = createSepoliaClient();
  }
  return cachedPublicClient;
}

/**
 * The block the Aqua app was deployed in, if the operator recorded it. Server-side only.
 *
 * Used to bound a log scan for fee history. Without it the scan covers a short recent window and
 * the figure is reported as partial rather than guessed at (NOTES.md §6).
 */
export function aquaAppDeployBlock(): bigint | undefined {
  const raw = optionalEnv("AQUA_APP_DEPLOY_BLOCK");
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  return BigInt(raw);
}

/** True when a dedicated RPC provider is configured (required by the indexer). */
export function hasRpcUrl(): boolean {
  return optionalEnv("SEPOLIA_RPC_URL") !== undefined;
}

/**
 * Server-only: asserts that the configured address actually has code on Sepolia (D-015).
 * Returns UNAVAILABLE rather than throwing, so a route can report the real reason.
 */
export async function assertDeployed(address: Address | undefined): Promise<Capability<Address>> {
  if (!address) {
    return unavailable("No address configured");
  }
  try {
    const code = await getPublicClient().getCode({ address });
    if (!code || code === "0x") {
      return unavailable(`No contract code at ${address} on ${chain.name}`);
    }
    return real(address);
  } catch (err) {
    return unavailable(
      publicReasonWith(`Could not reach the Sepolia RPC to verify ${address}`, err),
    );
  }
}
