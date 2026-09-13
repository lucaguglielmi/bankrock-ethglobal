/**
 * Demo mode and capability states (specs/15-exit-demo-mode.md, D-013 / Part 3).
 *
 * Every user-visible capability is in exactly one of three states at runtime, and the state is
 * computed, never assumed:
 *
 *   REAL         backed by a live contract, RPC or database read
 *   DEMO         simulated, and NEXT_PUBLIC_DEMO_MODE === "true"
 *   UNAVAILABLE  real backing unreachable and demo mode off
 *
 * Simulation is never the silent fallback. A capability that cannot reach its real backing
 * service returns UNAVAILABLE with a reason; it never substitutes a plausible value.
 */

/** Capability state envelope. See Part 3 of spec 15. */
export type Capability<T> =
  | { state: "REAL"; value: T }
  | { state: "DEMO"; value: T }
  | { state: "UNAVAILABLE"; reason: string };

export type CapabilityState = Capability<unknown>["state"];

export function real<T>(value: T): Capability<T> {
  return { state: "REAL", value };
}

export function demo<T>(value: T): Capability<T> {
  return { state: "DEMO", value };
}

export function unavailable<T = never>(reason: string): Capability<T> {
  return { state: "UNAVAILABLE", reason };
}

export function isAvailable<T>(
  capability: Capability<T>,
): capability is Extract<Capability<T>, { value: T }> {
  return capability.state !== "UNAVAILABLE";
}

/**
 * Public, build-time configuration.
 *
 * Next.js only inlines `process.env.NEXT_PUBLIC_*` when it is written as a literal member
 * access, so every public variable is read literally exactly once, here.
 */
export const env = {
  /** NEXT_PUBLIC_DEMO_MODE — "true" enables badged simulation. Defaults to off. */
  demoMode: process.env.NEXT_PUBLIC_DEMO_MODE === "true",
  /** NEXT_PUBLIC_APP_URL — the single canonical origin (D-022). */
  appUrl: (process.env.NEXT_PUBLIC_APP_URL || "https://bank-rock.com").replace(/\/+$/, ""),
  /** NEXT_PUBLIC_CHAIN_ID — must be 11155111 (Ethereum Sepolia, D-023). */
  chainId: process.env.NEXT_PUBLIC_CHAIN_ID || "",
  /** NEXT_PUBLIC_PRIVY_APP_ID — empty when sign-in is not configured (A-1, A-2). */
  privyAppId: process.env.NEXT_PUBLIC_PRIVY_APP_ID || "",
  /** Addresses. Consumed only by lib/chain, which is the single source of truth (D-015). */
  aquaAddress: process.env.NEXT_PUBLIC_AQUA_ADDRESS || "",
  usdcAddress: process.env.NEXT_PUBLIC_USDC_ADDRESS || "",
  wethAddress: process.env.NEXT_PUBLIC_WETH_ADDRESS || "",
  registryAddress: process.env.NEXT_PUBLIC_REGISTRY_ADDRESS || "",
  /** Our XYCSwap deployment — the AquaApp strategies are shipped to. */
  aquaAppAddress: process.env.NEXT_PUBLIC_AQUA_APP_ADDRESS || "",
  /** The XYCSwapTaker periphery a visitor's wallet calls to swap (NOTES.md §5). */
  aquaTakerAddress: process.env.NEXT_PUBLIC_AQUA_TAKER_ADDRESS || "",
  /** Browser-visible Pimlico key. Restrict by origin in the Pimlico dashboard. */
  pimlicoApiKeyPublic: process.env.NEXT_PUBLIC_PIMLICO_API_KEY || "",
  /** The RPC the BROWSER reads Sepolia through; empty means viem's default public endpoint. */
  sepoliaRpcUrlPublic: process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || "",
} as const;

export type PublicEnv = typeof env;

/**
 * True only when NEXT_PUBLIC_DEMO_MODE is exactly the string "true" (D-013).
 * Any other value — unset, "1", "TRUE", "yes" — is false.
 */
export function isDemoMode(): boolean {
  return env.demoMode;
}

/** Thrown by requireEnv when a mandatory secret is unset. Never contains the value. */
export class MissingEnvError extends Error {
  readonly variable: string;

  constructor(name: string) {
    super(`Required environment variable ${name} is not set`);
    this.name = "MissingEnvError";
    this.variable = name;
  }
}

/**
 * Server-side mandatory configuration read (D-017 — fail closed).
 *
 * Throws at first use when the variable is unset or blank. Callers convert the throw into a
 * 503 UNAVAILABLE response; no code path may treat a missing secret as "no authentication
 * required".
 *
 * Only for server-side variables: `process.env` is not enumerable in the browser bundle and
 * public values must go through `env` above so Next can inline them.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new MissingEnvError(name);
  }
  return value.trim();
}

/** Server-side optional configuration read. Returns undefined when unset or blank. */
export function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string" || value.trim() === "") return undefined;
  return value.trim();
}

/**
 * Runs `fn`, converting a missing mandatory variable into an UNAVAILABLE capability instead of
 * an unhandled 500.
 */
export function withRequiredEnv<T>(fn: () => T): Capability<T> {
  try {
    return real(fn());
  } catch (err) {
    if (err instanceof MissingEnvError) {
      return unavailable(`${err.variable} is not configured`);
    }
    throw err;
  }
}
