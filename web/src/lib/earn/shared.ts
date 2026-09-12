/**
 * Privy Earn — the pure half, safe in a browser bundle (spec 20 Part 3).
 *
 * Everything the client and the server must agree on lives here, so that the request a wallet
 * signs is — byte for byte — the request the server forwards to Privy:
 *
 *  - the URL of each earn action, built from one `apiBase` that the server publishes through
 *    `GET /api/earn/vault` and uses itself;
 *  - the body shape, `{ vault_id, raw_amount }`, with the amount in the asset's smallest unit so
 *    no decimal formatting can differ between the two sides;
 *  - the arithmetic behind "earned so far", which is the one yield figure this app shows
 *    (D-004 as amended by D-033): realised, in the asset, never annualised.
 *
 * Nothing here reads an environment variable, holds a secret, or performs I/O.
 */

import { parseUnits } from "viem";

/** Privy's API origin. The earn family lives under `/api/v1`; users and actions under `/v1`. */
export const PRIVY_API_ORIGIN = "https://api.privy.io";

/** The earn endpoints' base, as documented on 2026-09-12 (spec 20 §3.2). Overridable server-side. */
export const DEFAULT_PRIVY_EARN_API_BASE = `${PRIVY_API_ORIGIN}/api/v1`;

export type EarnActionKind = "deposit" | "withdraw";

/** The wallet action types Privy reports for the two earn writes. */
export const EARN_ACTION_TYPES: Record<EarnActionKind, string> = {
  deposit: "earn_deposit",
  withdraw: "earn_withdraw",
};

/**
 * `POST {apiBase}/wallets/{walletId}/earn/ethereum/{deposit|withdraw}`.
 *
 * No trailing slash — Privy's signature payload rules require the URL "without trailing slash",
 * and the client signs exactly this string.
 */
export function earnActionUrl(apiBase: string, kind: EarnActionKind, walletId: string): string {
  return `${apiBase.replace(/\/+$/, "")}/wallets/${encodeURIComponent(walletId)}/earn/ethereum/${kind}`;
}

/** The body the wallet signs and the server forwards unchanged. Nothing else is ever in it. */
export interface EarnActionBody {
  vault_id: string;
  /** Integer string in the asset's smallest unit (6 decimals for USDC). */
  raw_amount: string;
}

/** A positive integer with no leading zero, sign or exponent: what `raw_amount` must be. */
export const RAW_AMOUNT_PATTERN = /^[1-9][0-9]{0,77}$/;

export function isRawAmount(value: unknown): value is string {
  return typeof value === "string" && RAW_AMOUNT_PATTERN.test(value);
}

/**
 * What a client sends to `POST /api/earn/{deposit|withdraw}`: the wallet, the body it signed,
 * the signature, and the two Privy headers that were part of the signed payload. The server
 * forwards the body and both headers verbatim; changing any of them invalidates the signature.
 */
export interface SignedEarnRequest {
  walletId: string;
  body: EarnActionBody;
  /** From `useAuthorizationSignature().generateAuthorizationSignature` — the user's own key. */
  signature: string;
  /** `privy-idempotency-key`: a UUID, so a retried submission cannot deposit twice. */
  idempotencyKey: string;
  /** `privy-request-expiry`: Unix milliseconds. A captured request dies with it. */
  requestExpiry: string;
}

export interface EarnAsset {
  address: string;
  symbol: string;
  decimals: number;
}

/**
 * The vault as the client may see it. Privy's vault object also carries `user_apy`, `app_apy`
 * and `total_rewards_apr`; the server drops them before they reach a bundle (D-004, D-033), which
 * is why this type has no field for them and the spec 20 grep can assert they never appear.
 */
export interface EarnVault {
  id: string;
  name: string;
  provider: string;
  vaultAddress: string;
  /** CAIP-2, e.g. `eip155:8453`. The chain the vault, the asset and every action live on. */
  caip2: string;
  asset: EarnAsset;
  /** Withdrawable liquidity right now, in USD, when the provider reports it. */
  availableLiquidityUsd: number | null;
}

/** A wallet's position in the vault. Every quantity is an integer string in the asset's unit. */
export interface EarnPosition {
  asset: EarnAsset;
  totalDeposited: string;
  totalWithdrawn: string;
  /** Current redeemable value of the shares, accrued yield included. */
  assetsInVault: string;
  sharesInVault: string;
}

export type EarnActionStatus = "pending" | "created" | "succeeded" | "rejected" | "failed";

export interface EarnAction {
  id: string;
  walletId: string;
  /** `earn_deposit` or `earn_withdraw`. */
  type: string;
  status: EarnActionStatus;
  caip2?: string;
  rawAmount?: string;
  shareAmount?: string | null;
  /** ISO 8601 or Unix milliseconds, as Privy sent it. */
  createdAt?: string | number;
  /** Only ever the hash Privy reported for a broadcast step (D-014). */
  txHash?: `0x${string}`;
}

/** `succeeded`, `rejected` and `failed` are terminal; `pending` and `created` are not. */
export function isTerminalStatus(status: string): status is "succeeded" | "rejected" | "failed" {
  return status === "succeeded" || status === "rejected" || status === "failed";
}

export function parseActionStatus(value: unknown): EarnActionStatus | null {
  return value === "pending" ||
    value === "created" ||
    value === "succeeded" ||
    value === "rejected" ||
    value === "failed"
    ? value
    : null;
}

function bigintOrZero(value: string): bigint {
  return /^[0-9]+$/.test(value) ? BigInt(value) : BigInt(0);
}

/**
 * Realised yield to date, in the asset's smallest unit:
 *
 *   assets_in_vault + total_withdrawn − total_deposited
 *
 * It is what the vault has paid this wallet so far — a chain-backed figure Privy reads from the
 * ERC-4626 share price — and it is the only yield number this app shows. It is not a rate, it is
 * not annualised, and it can be negative for a moment after a deposit while rounding settles.
 */
export function earnedSoFar(position: Pick<
  EarnPosition,
  "assetsInVault" | "totalWithdrawn" | "totalDeposited"
>): bigint {
  return (
    bigintOrZero(position.assetsInVault) +
    bigintOrZero(position.totalWithdrawn) -
    bigintOrZero(position.totalDeposited)
  );
}

const DECIMAL_INPUT = /^\d*(\.\d*)?$/;

/**
 * A typed amount ("12.5") to base units, or null for anything that is not a clean positive
 * number. Never rounds silently: more fraction digits than the asset has is a null, not a guess.
 */
export function parseAmountInput(value: string, decimals: number): bigint | null {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "." || !DECIMAL_INPUT.test(trimmed)) return null;
  const fraction = trimmed.split(".")[1] ?? "";
  if (fraction.length > decimals) return null;
  try {
    const parsed = parseUnits(trimmed, decimals);
    return parsed > BigInt(0) ? parsed : null;
  } catch {
    return null;
  }
}

/** `eip155:8453` -> 8453. Anything that is not an EVM CAIP-2 identifier is null. */
export function caip2ChainId(caip2: string): number | null {
  const match = /^eip155:(\d+)$/.exec(caip2.trim());
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** How long a signed request stays valid once the wallet has signed it. */
export const SIGNED_REQUEST_TTL_MS = 5 * 60 * 1000;
