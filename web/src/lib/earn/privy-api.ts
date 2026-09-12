/**
 * The Privy REST client for Earn — server-only (spec 20 Part 4).
 *
 * Every function returns a Capability (D-013): a missing configuration, an unreachable API and
 * a refused request are all UNAVAILABLE with a reason from a fixed set. The reason never quotes
 * Privy's response text (audit P-2 / P-15 — a `reason` that reaches a client is chosen here, not
 * interpolated from what came back); the detail goes to telemetry, which redacts and is readable
 * only with `ADMIN_API_KEY`.
 *
 * Two things are structural rather than conventional:
 *
 *  - **the server forwards what the wallet signed, unchanged.** A deposit or withdrawal is
 *    `POST` to the URL the client computed from the same `earnApiBase`, with the same body and
 *    the same two `privy-` headers, plus the user's `privy-authorization-signature`. The app
 *    secret only says which app is forwarding; it cannot authorise the action on its own, and
 *    the server has no path that submits an unsigned one;
 *  - **the wallet must belong to the caller.** Every read and write first resolves the caller's
 *    Privy user by DID and checks that the wallet id is one of their embedded wallets. Privy
 *    would refuse a foreign wallet's write anyway (the signature would not verify) — the check
 *    is what stops a read of someone else's position.
 *
 * The vault details Privy returns include `user_apy`, `app_apy` and `total_rewards_apr`. They
 * are dropped here, before any of it reaches a bundle (D-004, D-033).
 */

import { z } from "zod";
import { real, unavailable, type Capability } from "@/lib/demo";
import { logger } from "@/lib/telemetry";
import type { EarnConfig } from "@/lib/earn/config";
import {
  earnActionUrl,
  parseActionStatus,
  type EarnAction,
  type EarnActionKind,
  type EarnAsset,
  type EarnPosition,
  type EarnVault,
  type SignedEarnRequest,
} from "@/lib/earn/shared";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

let fetchImpl: FetchLike = (input, init) => fetch(input, init);

/** Test seam: no test may reach api.privy.io. */
export function __setFetchForTesting(impl: FetchLike | null): void {
  fetchImpl = impl ?? ((input, init) => fetch(input, init));
}

/* -------------------------------------------------------------------------- */
/* Transport                                                                   */
/* -------------------------------------------------------------------------- */

const REQUEST_TIMEOUT_MS = 20_000;

function authHeaders(cfg: EarnConfig): Record<string, string> {
  return {
    "privy-app-id": cfg.appId,
    Authorization: `Basic ${btoa(`${cfg.appId}:${cfg.appSecret}`)}`,
  };
}

/**
 * The reason a client may see for a Privy status code. Fixed sentences: none of them contains
 * anything from the response.
 */
export function reasonForStatus(status: number, what: string): string {
  if (status === 400 || status === 422) return `Privy rejected the ${what} as malformed`;
  if (status === 401) return `Privy refused this app's credentials for the ${what}`;
  if (status === 403) return `Privy refused the ${what} for this wallet`;
  if (status === 404) return `Privy does not know the wallet or vault named in the ${what}`;
  if (status === 409) return `Privy reported the ${what} as already in progress`;
  if (status === 429) return `Privy is rate-limiting this app; try the ${what} again shortly`;
  if (status >= 500) return `Privy could not complete the ${what}`;
  return `Privy answered the ${what} with an unexpected status`;
}

interface PrivyReply {
  status: number;
  json: unknown;
}

/** A short, log-safe slug from Privy's error body: its `code` when it is one, else nothing. */
function errorSlug(json: unknown): string | undefined {
  if (!json || typeof json !== "object") return undefined;
  const code = (json as { code?: unknown }).code;
  return typeof code === "string" && /^[a-z0-9_.-]{1,64}$/i.test(code) ? code : undefined;
}

async function privyFetch(
  cfg: EarnConfig,
  url: string,
  init: RequestInit & { headers: Record<string, string> },
  what: string,
): Promise<Capability<PrivyReply>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      ...init,
      headers: { ...authHeaders(cfg), ...init.headers },
      signal: controller.signal,
    });
  } catch (error) {
    logger.warn("Privy could not be reached", {
      action: "PRIVY_EARN_UNREACHABLE",
      what,
      error: error instanceof Error ? error.name : "unknown",
    });
    return unavailable(`Privy could not be reached for the ${what}`);
  } finally {
    clearTimeout(timer);
  }

  let json: unknown = undefined;
  if (response.status !== 204) {
    try {
      json = await response.json();
    } catch {
      json = undefined;
    }
  }

  if (!response.ok) {
    logger.warn("Privy refused a request", {
      action: "PRIVY_EARN_REFUSED",
      what,
      status: response.status,
      code: errorSlug(json),
    });
    return unavailable(reasonForStatus(response.status, what));
  }
  return real({ status: response.status, json });
}

/* -------------------------------------------------------------------------- */
/* Schemas — what this app reads out of a reply, and nothing more               */
/* -------------------------------------------------------------------------- */

const AssetSchema = z.object({
  address: z.string(),
  symbol: z.string(),
  decimals: z.number().int().nonnegative(),
});

/** Strips by construction: `user_apy`, `app_apy`, `tvl_usd` and the rest never survive parsing. */
const VaultSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string(),
  vault_address: z.string(),
  caip2: z.string(),
  asset: AssetSchema,
  available_liquidity_usd: z.number().nullable().optional(),
});

const PositionSchema = z.object({
  asset: AssetSchema,
  total_deposited: z.string(),
  total_withdrawn: z.string(),
  assets_in_vault: z.string(),
  shares_in_vault: z.string(),
});

const ActionSchema = z.object({
  id: z.string(),
  wallet_id: z.string().optional(),
  type: z.string(),
  status: z.string(),
  caip2: z.string().optional(),
  raw_amount: z.string().optional(),
  share_amount: z.string().nullable().optional(),
  created_at: z.union([z.string(), z.number()]).optional(),
  steps: z.array(z.unknown()).optional(),
});

const LinkedWalletSchema = z.object({
  type: z.string(),
  chain_type: z.string().optional(),
  wallet_client_type: z.string().optional(),
  connector_type: z.string().optional(),
  id: z.string().nullable().optional(),
  address: z.string().optional(),
  wallet_index: z.number().nullable().optional(),
});

const UserSchema = z.object({
  id: z.string(),
  linked_accounts: z.array(z.unknown()),
});

function toAsset(asset: z.infer<typeof AssetSchema>): EarnAsset {
  return { address: asset.address, symbol: asset.symbol, decimals: asset.decimals };
}

const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

/**
 * The transaction hash of a broadcast step, if Privy reported one. Only a value that is a real
 * 32-byte hash under a key that names a hash is accepted (D-014); anything else is undefined.
 */
function txHashFromSteps(steps: unknown[] | undefined): `0x${string}` | undefined {
  if (!steps) return undefined;
  for (const step of steps) {
    if (!step || typeof step !== "object") continue;
    for (const [key, value] of Object.entries(step as Record<string, unknown>)) {
      if (/hash/i.test(key) && typeof value === "string" && TX_HASH.test(value)) {
        return value as `0x${string}`;
      }
    }
  }
  return undefined;
}

function toAction(raw: z.infer<typeof ActionSchema>, walletId: string): EarnAction | null {
  const status = parseActionStatus(raw.status);
  if (!status) return null;
  return {
    id: raw.id,
    walletId: raw.wallet_id ?? walletId,
    type: raw.type,
    status,
    caip2: raw.caip2,
    rawAmount: raw.raw_amount,
    shareAmount: raw.share_amount ?? null,
    createdAt: raw.created_at,
    txHash: txHashFromSteps(raw.steps),
  };
}

/* -------------------------------------------------------------------------- */
/* Vault                                                                       */
/* -------------------------------------------------------------------------- */

export async function getVaultDetails(cfg: EarnConfig): Promise<Capability<EarnVault>> {
  const url = `${cfg.earnApiBase}/earn/ethereum/vaults/${encodeURIComponent(cfg.vaultId)}`;
  const reply = await privyFetch(cfg, url, { method: "GET", headers: {} }, "vault lookup");
  if (reply.state === "UNAVAILABLE") return reply;

  const parsed = VaultSchema.safeParse(reply.value.json);
  if (!parsed.success) {
    logger.warn("Privy's vault reply had an unexpected shape", { action: "PRIVY_EARN_SHAPE" });
    return unavailable("Privy described the vault in an unexpected shape");
  }
  const vault = parsed.data;
  return real({
    id: vault.id,
    name: vault.name,
    provider: vault.provider,
    vaultAddress: vault.vault_address,
    caip2: vault.caip2,
    asset: toAsset(vault.asset),
    availableLiquidityUsd: vault.available_liquidity_usd ?? null,
  });
}

/* -------------------------------------------------------------------------- */
/* The caller's wallets                                                        */
/* -------------------------------------------------------------------------- */

export interface EmbeddedWalletRef {
  walletId: string;
  address: string;
}

/**
 * The caller's embedded Ethereum wallets, from Privy's user record — never from the request.
 *
 * "Embedded" means `wallet_client_type: "privy"` and `connector_type: "embedded"`; an external
 * wallet the user linked has no Privy wallet id and cannot be acted on by the API at all.
 */
export async function getEmbeddedWallets(
  cfg: EarnConfig,
  did: string,
): Promise<Capability<EmbeddedWalletRef[]>> {
  const url = `${cfg.apiOrigin}/v1/users/${encodeURIComponent(did)}`;
  const reply = await privyFetch(cfg, url, { method: "GET", headers: {} }, "account lookup");
  if (reply.state === "UNAVAILABLE") return reply;

  const parsed = UserSchema.safeParse(reply.value.json);
  if (!parsed.success) {
    return unavailable("Privy described the account in an unexpected shape");
  }

  const wallets: Array<EmbeddedWalletRef & { index: number }> = [];
  for (const account of parsed.data.linked_accounts) {
    const wallet = LinkedWalletSchema.safeParse(account);
    if (!wallet.success) continue;
    const w = wallet.data;
    if (
      w.type === "wallet" &&
      w.chain_type === "ethereum" &&
      w.wallet_client_type === "privy" &&
      w.connector_type === "embedded" &&
      typeof w.id === "string" &&
      w.id !== "" &&
      typeof w.address === "string"
    ) {
      wallets.push({ walletId: w.id, address: w.address, index: w.wallet_index ?? 0 });
    }
  }
  wallets.sort((a, b) => a.index - b.index);
  return real(wallets.map(({ walletId, address }) => ({ walletId, address })));
}

/** The caller's primary embedded wallet — HD index 0 — or why there is none. */
export async function getPrimaryEmbeddedWallet(
  cfg: EarnConfig,
  did: string,
): Promise<Capability<EmbeddedWalletRef>> {
  const wallets = await getEmbeddedWallets(cfg, did);
  if (wallets.state === "UNAVAILABLE") return wallets;
  const primary = wallets.value[0];
  if (!primary) {
    return unavailable("This account has no embedded wallet yet");
  }
  return real(primary);
}

/** Refuses any wallet id that is not one of the caller's own embedded wallets. */
export async function assertWalletBelongsTo(
  cfg: EarnConfig,
  did: string,
  walletId: string,
): Promise<Capability<EmbeddedWalletRef>> {
  const wallets = await getEmbeddedWallets(cfg, did);
  if (wallets.state === "UNAVAILABLE") return wallets;
  const match = wallets.value.find((w) => w.walletId === walletId);
  if (!match) {
    return unavailable("That wallet does not belong to the signed-in account");
  }
  return real(match);
}

/* -------------------------------------------------------------------------- */
/* Position                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The wallet's position in the configured vault. A wallet that has never deposited is reported
 * by Privy as 404 or 204; that is a real, zero position, not an error.
 */
export async function getPosition(
  cfg: EarnConfig,
  walletId: string,
  vault: EarnVault,
): Promise<Capability<EarnPosition>> {
  const url =
    `${cfg.earnApiBase}/wallets/${encodeURIComponent(walletId)}/earn/ethereum/vaults` +
    `?vault_id=${encodeURIComponent(cfg.vaultId)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: authHeaders(cfg),
      signal: controller.signal,
    });
  } catch {
    return unavailable("Privy could not be reached for the position");
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 404 || response.status === 204) {
    return real({
      asset: vault.asset,
      totalDeposited: "0",
      totalWithdrawn: "0",
      assetsInVault: "0",
      sharesInVault: "0",
    });
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    json = undefined;
  }
  if (!response.ok) {
    logger.warn("Privy refused a request", {
      action: "PRIVY_EARN_REFUSED",
      what: "position",
      status: response.status,
      code: errorSlug(json),
    });
    return unavailable(reasonForStatus(response.status, "position"));
  }

  const parsed = PositionSchema.safeParse(json);
  if (!parsed.success) {
    return unavailable("Privy described the position in an unexpected shape");
  }
  const p = parsed.data;
  return real({
    asset: toAsset(p.asset),
    totalDeposited: p.total_deposited,
    totalWithdrawn: p.total_withdrawn,
    assetsInVault: p.assets_in_vault,
    sharesInVault: p.shares_in_vault,
  });
}

/* -------------------------------------------------------------------------- */
/* Actions                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Forwards a signed deposit or withdrawal. The URL, body and the two `privy-` headers are the
 * ones the wallet signed; the server adds only its own credentials and the signature header.
 */
export async function submitEarnAction(
  cfg: EarnConfig,
  kind: EarnActionKind,
  request: SignedEarnRequest,
): Promise<Capability<EarnAction>> {
  const url = earnActionUrl(cfg.earnApiBase, kind, request.walletId);
  const reply = await privyFetch(
    cfg,
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "privy-authorization-signature": request.signature,
        "privy-idempotency-key": request.idempotencyKey,
        "privy-request-expiry": request.requestExpiry,
      },
      body: JSON.stringify(request.body),
    },
    kind,
  );
  if (reply.state === "UNAVAILABLE") return reply;

  const parsed = ActionSchema.safeParse(reply.value.json);
  const action = parsed.success ? toAction(parsed.data, request.walletId) : null;
  if (!action) {
    // The request may well have gone through. Say so rather than pretend it did not.
    logger.warn("Privy's action reply had an unexpected shape", {
      action: "PRIVY_EARN_SHAPE",
      what: kind,
    });
    return unavailable(
      `Privy accepted the ${kind} but described it in an unexpected shape — check the position`,
    );
  }
  return real(action);
}

/** One action, with its steps, so a landed transaction's hash can be shown (D-014). */
export async function getAction(
  cfg: EarnConfig,
  walletId: string,
  actionId: string,
): Promise<Capability<EarnAction>> {
  const url =
    `${cfg.apiOrigin}/v1/wallets/${encodeURIComponent(walletId)}/actions/` +
    `${encodeURIComponent(actionId)}?include=steps`;
  const reply = await privyFetch(cfg, url, { method: "GET", headers: {} }, "status check");
  if (reply.state === "UNAVAILABLE") return reply;

  const parsed = ActionSchema.safeParse(reply.value.json);
  const action = parsed.success ? toAction(parsed.data, walletId) : null;
  if (!action) {
    return unavailable("Privy described the action in an unexpected shape");
  }
  return real(action);
}

/** The wallet's recent earn actions, newest first. Other action types are left out. */
export async function listEarnActions(
  cfg: EarnConfig,
  walletId: string,
  limit = 20,
): Promise<Capability<EarnAction[]>> {
  const url =
    `${cfg.apiOrigin}/v1/wallets/${encodeURIComponent(walletId)}/actions` +
    `?limit=${Math.max(1, Math.min(100, Math.floor(limit)))}&include=steps`;
  const reply = await privyFetch(cfg, url, { method: "GET", headers: {} }, "history");
  if (reply.state === "UNAVAILABLE") return reply;

  const json = reply.value.json;
  const rows: unknown[] = Array.isArray(json)
    ? json
    : json && typeof json === "object" && Array.isArray((json as { data?: unknown }).data)
      ? ((json as { data: unknown[] }).data)
      : [];

  const actions: EarnAction[] = [];
  for (const row of rows) {
    const parsed = ActionSchema.safeParse(row);
    if (!parsed.success) continue;
    if (!parsed.data.type.startsWith("earn_")) continue;
    const action = toAction(parsed.data, walletId);
    if (action) actions.push(action);
  }
  return real(actions);
}
