/**
 * Rock #420 — the stage demo rock (DEMO-STATE.md S-5).
 *
 * Rock 420 does not exist on chain. Every surface of its page is a badged pretend that lives in
 * the browser: there is no build flag; the id is the only gate, so it is served on the production
 * deployment too. Nothing in this directory reads the registry, Aqua, an RPC or the application database
 * for this id, and nothing in it ever produces a transaction hash (D-014).
 *
 * The mock addresses are derived at runtime from labels — never written as literals (D-015) —
 * and they are used only where a type demands an address. None of them is ever offered as a
 * place to send tokens.
 */

import { getAddress, keccak256, stringToHex, type Address, type Hex } from "viem";
import { addresses } from "@/lib/chain";

export const DEMO_ROCK_ID = "420";

/** The one gate. `"420"` exactly — not `"0420"`, not `" 420"`. */
export function isDemoRockId(rockId: string | undefined | null): boolean {
  return rockId === DEMO_ROCK_ID;
}

/** `localStorage` key of the persisted demo state. The version is part of the key: a changed shape gets a fresh key, never a half-parsed old one. */
export const DEMO_STORAGE_KEY = "bankrock.demo.rock420.v1";

/** The label-derived hash this mock rock's "tag" would have. Not a transaction hash. */
export const DEMO_UID_HASH: Hex = keccak256(stringToHex("bankrock.demo.rock420.tag"));

/** A 20-byte address derived from a label. Deterministic, recognisable in a debugger, and not a literal. */
function derivedAddress(label: string): Address {
  const hash = keccak256(stringToHex(`bankrock.demo.rock420.${label}`));
  return getAddress(`0x${hash.slice(2, 42)}`);
}

/**
 * Every address the mock needs, resolved once.
 *
 * The rock's account, the previous owner and the visitor's account are always derived. The
 * protocol and token addresses prefer the configured ones (so the strategy hashes the demo shows
 * are the ones this deployment would really compute for rock 420) and fall back to derived
 * values when the deployment has none — the demo must render on a machine with no `.env`.
 */
export const DEMO_ADDRESSES = {
  /** The Rock Account the mock pretends to hold its reserve in. Never a destination for tokens. */
  account: derivedAddress("account"),
  /** The owner before the gift in the seeded history, and the owner shown to a signed-out visitor. */
  giver: derivedAddress("giver"),
  /** The visitor's personal account in the Trade tab. */
  taker: derivedAddress("taker"),
  registry: addresses.registry ?? derivedAddress("registry"),
  aqua: addresses.aqua ?? derivedAddress("aqua"),
  app: addresses.aquaApp ?? derivedAddress("app"),
  usdc: addresses.usdc ?? derivedAddress("usdc"),
  weth: addresses.weth ?? derivedAddress("weth"),
} as const;

/** The reason the Contracts tab gives instead of an address. */
export const DEMO_NO_CHAIN_REASON =
  "Rock #420 is a demo rock. Its account exists only in this browser, so there is nothing on chain to show.";

/** How long a demo action pretends to take, so buttons show their pending label as they would for a real one. */
export const DEMO_ACTION_DELAY_MS = 600;
