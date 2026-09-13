/**
 * Addresses for the Aqua path, and nothing else.
 *
 * `lib/chain` is the single source of truth for every address the rest of the app knows about
 * (D-015), and it owns Aqua, USDC and WETH. The two contracts this integration deploys itself -
 * the `XYCSwap` app and the `XYCSwapTaker` periphery - are read here, in the same shape: one
 * literal `process.env.NEXT_PUBLIC_*` member access so Next.js can inline it, format-validated,
 * and returned as a `Capability` so an unset variable renders UNAVAILABLE rather than breaking.
 *
 * No address literal appears in this file or anywhere under `lib/aqua`.
 */

import { getAddress, isAddress, type Address } from "viem";
import { addresses, requireAddress } from "@/lib/chain";
import { real, unavailable, type Capability } from "@/lib/demo";

/**
 * Public, build-time configuration for the Aqua app path.
 *
 * Both addresses are outputs of `contracts/scripts/deploy-aqua-app.js`, which prints the two
 * lines to paste into the Cloudflare Pages environment.
 */
export const aquaEnv = {
  /** NEXT_PUBLIC_AQUA_APP_ADDRESS - our XYCSwap deployment (the AquaApp strategies are shipped to). */
  appAddress: process.env.NEXT_PUBLIC_AQUA_APP_ADDRESS || "",
  /** NEXT_PUBLIC_AQUA_TAKER_ADDRESS - the periphery a visitor's wallet calls to swap. */
  takerAddress: process.env.NEXT_PUBLIC_AQUA_TAKER_ADDRESS || "",
  /** AQUA_APP_DEPLOY_BLOCK - server-side only; the first block a strategy could exist in. */
  deployBlock: process.env.AQUA_APP_DEPLOY_BLOCK || "",
} as const;

function parse(name: string, value: string): Capability<Address> {
  const trimmed = value.trim();
  if (trimmed === "") {
    return unavailable(`${name} is not configured`);
  }
  if (!isAddress(trimmed, { strict: false })) {
    return unavailable(`${name} is not a valid 20-byte hex address`);
  }
  return real(getAddress(trimmed));
}

/** The XYCSwap app strategies are shipped to. */
export function getAquaAppAddress(): Capability<Address> {
  return parse("NEXT_PUBLIC_AQUA_APP_ADDRESS", aquaEnv.appAddress);
}

/** The periphery a taker calls. A swap is impossible without it - see lib/aqua/calls.ts. */
export function getAquaTakerAddress(): Capability<Address> {
  return parse("NEXT_PUBLIC_AQUA_TAKER_ADDRESS", aquaEnv.takerAddress);
}

/** The canonical Aqua deployment, from lib/chain. */
export function getAquaAddress(): Capability<Address> {
  return requireAddress("aqua");
}

export interface PairAddresses {
  /** token0 of every Bank Rock strategy, by role - not by address order. */
  usdc: Address;
  /** token1. */
  weth: Address;
}

/** The USDC/WETH pair every rock trades, from lib/chain. */
export function getPairAddresses(): Capability<PairAddresses> {
  const { usdc, weth } = addresses;
  if (!usdc || !weth) {
    return unavailable(
      "NEXT_PUBLIC_USDC_ADDRESS / NEXT_PUBLIC_WETH_ADDRESS are not configured",
    );
  }
  return real({ usdc, weth });
}

/**
 * Every address one strategy operation needs, or the first reason one is missing.
 * This is the single gate every builder and reader in `lib/aqua` passes through.
 */
export interface AquaAddresses extends PairAddresses {
  aqua: Address;
  app: Address;
}

export function getAquaAddresses(overrides?: { app?: Address }): Capability<AquaAddresses> {
  const aqua = getAquaAddress();
  if (aqua.state === "UNAVAILABLE") return unavailable(aqua.reason);

  const pair = getPairAddresses();
  if (pair.state === "UNAVAILABLE") return unavailable(pair.reason);

  if (overrides?.app) {
    return real({ aqua: aqua.value, app: overrides.app, ...pair.value });
  }
  const app = getAquaAppAddress();
  if (app.state === "UNAVAILABLE") return unavailable(app.reason);

  return real({ aqua: aqua.value, app: app.value, ...pair.value });
}

/**
 * The block the app was deployed in, if the operator recorded it.
 *
 * Used only to bound a log scan. Without it, fee history is read over a short recent window and
 * reported as partial rather than guessed at.
 */
export function getAppDeployBlock(): bigint | undefined {
  const raw = aquaEnv.deployBlock.trim();
  if (raw === "") return undefined;
  try {
    const value = BigInt(raw);
    return value >= BigInt(0) ? value : undefined;
  } catch {
    return undefined;
  }
}
