import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EarnConfig } from "./config";
import {
  __setFetchForTesting,
  assertWalletBelongsTo,
  getAction,
  getEmbeddedWallets,
  getPosition,
  getVaultDetails,
  listEarnActions,
  reasonForStatus,
  submitEarnAction,
} from "./privy-api";
import type { EarnVault } from "./shared";

/**
 * The Privy client, with `fetch` replaced: no test reaches api.privy.io, and every assertion is
 * about what this module sends and what it lets back in.
 */

const cfg: EarnConfig = {
  appId: "app_123",
  appSecret: "s3cret-value",
  vaultId: "vault_abc",
  earnApiBase: "https://api.privy.io/api/v1",
  apiOrigin: "https://api.privy.io",
};

const SECRET_IN_BODY = "leak-me-9f8e7d";

interface Call {
  url: string;
  init: RequestInit | undefined;
}

let calls: Call[];

function respond(status: number, json?: unknown) {
  return new Response(json === undefined ? null : JSON.stringify(json), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stub(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  __setFetchForTesting(async (url, init) => {
    calls.push({ url, init });
    return handler(url, init);
  });
}

function headerOf(init: RequestInit | undefined, name: string): string | undefined {
  const headers = (init?.headers ?? {}) as Record<string, string>;
  return headers[name];
}

const vaultReply = {
  id: "vault_abc",
  name: "Gauntlet USDC Prime",
  provider: "morpho",
  vault_address: "0x04422053aDDbc9bB2759b248B574e3FCA76Bc145",
  caip2: "eip155:8453",
  asset: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", symbol: "usdc", decimals: 6 },
  user_apy: 500,
  app_apy: 100,
  total_rewards_apr: 50,
  tvl_usd: 1000000,
  available_liquidity_usd: 500000,
  admin_wallet_id: "admin_1",
};

const vault: EarnVault = {
  id: "vault_abc",
  name: "Gauntlet USDC Prime",
  provider: "morpho",
  vaultAddress: vaultReply.vault_address,
  caip2: "eip155:8453",
  asset: { address: vaultReply.asset.address, symbol: "usdc", decimals: 6 },
  availableLiquidityUsd: 500000,
};

const userReply = {
  id: "did:privy:user1",
  linked_accounts: [
    { type: "email", address: "a@b.c" },
    {
      type: "wallet",
      chain_type: "ethereum",
      wallet_client_type: "metamask",
      connector_type: "injected",
      address: "0x1111111111111111111111111111111111111111",
    },
    {
      type: "wallet",
      chain_type: "ethereum",
      wallet_client_type: "privy",
      connector_type: "embedded",
      id: "wallet_second",
      wallet_index: 1,
      address: "0x2222222222222222222222222222222222222222",
    },
    {
      type: "wallet",
      chain_type: "ethereum",
      wallet_client_type: "privy",
      connector_type: "embedded",
      id: "wallet_primary",
      wallet_index: 0,
      address: "0x3333333333333333333333333333333333333333",
    },
    {
      type: "wallet",
      chain_type: "solana",
      wallet_client_type: "privy",
      connector_type: "embedded",
      id: "wallet_sol",
      address: "So1ana",
    },
  ],
};

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  __setFetchForTesting(null);
  vi.restoreAllMocks();
});

describe("authentication headers", () => {
  it("sends the app id and Basic credentials on every call", async () => {
    stub(() => respond(200, vaultReply));
    await getVaultDetails(cfg);
    expect(calls).toHaveLength(1);
    expect(headerOf(calls[0].init, "privy-app-id")).toBe("app_123");
    expect(headerOf(calls[0].init, "Authorization")).toBe(`Basic ${btoa("app_123:s3cret-value")}`);
  });
});

describe("getVaultDetails", () => {
  it("returns the vault without any rate field (D-004, D-033)", async () => {
    stub(() => respond(200, vaultReply));
    const result = await getVaultDetails(cfg);
    expect(result.state).toBe("REAL");
    if (result.state !== "REAL") return;
    expect(result.value).toEqual(vault);
    const serialised = JSON.stringify(result.value);
    expect(serialised).not.toContain("apy");
    expect(serialised).not.toContain("apr");
    expect(serialised).not.toContain("tvl");
    expect(calls[0].url).toBe("https://api.privy.io/api/v1/earn/ethereum/vaults/vault_abc");
  });

  it("is UNAVAILABLE with a fixed reason when Privy refuses, quoting nothing from the body", async () => {
    stub(() => respond(401, { error: SECRET_IN_BODY, code: "unauthorized" }));
    const result = await getVaultDetails(cfg);
    expect(result.state).toBe("UNAVAILABLE");
    if (result.state !== "UNAVAILABLE") return;
    expect(result.reason).toBe(reasonForStatus(401, "vault lookup"));
    expect(result.reason).not.toContain(SECRET_IN_BODY);
  });

  it("is UNAVAILABLE when the network fails", async () => {
    stub(() => {
      throw new TypeError("fetch failed");
    });
    const result = await getVaultDetails(cfg);
    expect(result.state).toBe("UNAVAILABLE");
    if (result.state === "UNAVAILABLE") expect(result.reason).toMatch(/could not be reached/);
  });

  it("is UNAVAILABLE when the reply has the wrong shape", async () => {
    stub(() => respond(200, { id: "vault_abc" }));
    const result = await getVaultDetails(cfg);
    expect(result.state).toBe("UNAVAILABLE");
  });
});

describe("the caller's wallets", () => {
  it("lists only embedded Ethereum wallets, primary first", async () => {
    stub(() => respond(200, userReply));
    const result = await getEmbeddedWallets(cfg, "did:privy:user1");
    expect(calls[0].url).toBe("https://api.privy.io/v1/users/did%3Aprivy%3Auser1");
    expect(result.state).toBe("REAL");
    if (result.state !== "REAL") return;
    expect(result.value).toEqual([
      { walletId: "wallet_primary", address: "0x3333333333333333333333333333333333333333" },
      { walletId: "wallet_second", address: "0x2222222222222222222222222222222222222222" },
    ]);
  });

  it("refuses a wallet id that is not the caller's", async () => {
    stub(() => respond(200, userReply));
    const foreign = await assertWalletBelongsTo(cfg, "did:privy:user1", "wallet_of_someone_else");
    expect(foreign.state).toBe("UNAVAILABLE");
    if (foreign.state === "UNAVAILABLE") expect(foreign.reason).toMatch(/does not belong/);

    const own = await assertWalletBelongsTo(cfg, "did:privy:user1", "wallet_second");
    expect(own.state).toBe("REAL");
  });
});

describe("getPosition", () => {
  it("treats 404 as a real zero position, not an error", async () => {
    stub(() => respond(404, { error: "not found" }));
    const result = await getPosition(cfg, "wallet_primary", vault);
    expect(result.state).toBe("REAL");
    if (result.state !== "REAL") return;
    expect(result.value.assetsInVault).toBe("0");
    expect(result.value.asset).toEqual(vault.asset);
    expect(calls[0].url).toBe(
      "https://api.privy.io/api/v1/wallets/wallet_primary/earn/ethereum/vaults?vault_id=vault_abc",
    );
  });

  it("maps a real position", async () => {
    stub(() =>
      respond(200, {
        asset: vaultReply.asset,
        total_deposited: "1000000",
        total_withdrawn: "0",
        assets_in_vault: "1050000",
        shares_in_vault: "1000000000000000000",
      }),
    );
    const result = await getPosition(cfg, "wallet_primary", vault);
    expect(result.state).toBe("REAL");
    if (result.state !== "REAL") return;
    expect(result.value.totalDeposited).toBe("1000000");
    expect(result.value.assetsInVault).toBe("1050000");
  });

  it("is UNAVAILABLE on any other refusal", async () => {
    stub(() => respond(500, { error: SECRET_IN_BODY }));
    const result = await getPosition(cfg, "wallet_primary", vault);
    expect(result.state).toBe("UNAVAILABLE");
    if (result.state === "UNAVAILABLE") expect(result.reason).not.toContain(SECRET_IN_BODY);
  });
});

describe("submitEarnAction — forwards exactly what the wallet signed", () => {
  const signed = {
    walletId: "wallet_primary",
    body: { vault_id: "vault_abc", raw_amount: "5000000" },
    signature: "c2lnbmF0dXJl",
    idempotencyKey: "0d5c1b0e-7c4d-4d4b-9f1e-0c1a2b3c4d5e",
    requestExpiry: "1789227256949",
  };

  it("POSTs the same URL, body and privy- headers, plus the signature", async () => {
    stub(() =>
      respond(200, {
        id: "act_1",
        wallet_id: "wallet_primary",
        type: "earn_deposit",
        status: "pending",
        caip2: "eip155:8453",
        raw_amount: "5000000",
        share_amount: null,
        created_at: "2026-09-12T12:00:00.000Z",
      }),
    );
    const result = await submitEarnAction(cfg, "deposit", signed);
    expect(result.state).toBe("REAL");
    if (result.state !== "REAL") return;
    expect(result.value.id).toBe("act_1");
    expect(result.value.status).toBe("pending");
    expect(result.value.txHash).toBeUndefined();

    const call = calls[0];
    expect(call.url).toBe("https://api.privy.io/api/v1/wallets/wallet_primary/earn/ethereum/deposit");
    expect(call.init?.method).toBe("POST");
    expect(call.init?.body).toBe(JSON.stringify({ vault_id: "vault_abc", raw_amount: "5000000" }));
    expect(headerOf(call.init, "privy-authorization-signature")).toBe("c2lnbmF0dXJl");
    expect(headerOf(call.init, "privy-idempotency-key")).toBe(signed.idempotencyKey);
    expect(headerOf(call.init, "privy-request-expiry")).toBe("1789227256949");
    expect(headerOf(call.init, "privy-app-id")).toBe("app_123");
  });

  it("reports a refusal without quoting Privy's text", async () => {
    stub(() => respond(403, { error: SECRET_IN_BODY }));
    const result = await submitEarnAction(cfg, "withdraw", signed);
    expect(result.state).toBe("UNAVAILABLE");
    if (result.state !== "UNAVAILABLE") return;
    expect(result.reason).toBe(reasonForStatus(403, "withdraw"));
    expect(result.reason).not.toContain(SECRET_IN_BODY);
  });

  it("says the action may have gone through when the reply is unreadable", async () => {
    stub(() => respond(200, { unexpected: true }));
    const result = await submitEarnAction(cfg, "deposit", signed);
    expect(result.state).toBe("UNAVAILABLE");
    if (result.state === "UNAVAILABLE") expect(result.reason).toMatch(/check the position/);
  });
});

describe("actions", () => {
  const hash = `0x${"ab".repeat(32)}`;

  it("reads a landed transaction hash out of the steps, and only a real one", async () => {
    stub(() =>
      respond(200, {
        id: "act_1",
        type: "earn_deposit",
        status: "succeeded",
        steps: [
          { kind: "approve", transaction_hash: "0xnot-a-hash" },
          { kind: "deposit", transaction_hash: hash },
        ],
      }),
    );
    const result = await getAction(cfg, "wallet_primary", "act_1");
    expect(calls[0].url).toBe(
      "https://api.privy.io/v1/wallets/wallet_primary/actions/act_1?include=steps",
    );
    expect(result.state).toBe("REAL");
    if (result.state === "REAL") expect(result.value.txHash).toBe(hash);
  });

  it("lists only earn actions", async () => {
    stub(() =>
      respond(200, {
        data: [
          { id: "a", type: "transfer", status: "succeeded" },
          { id: "b", type: "earn_withdraw", status: "succeeded", raw_amount: "1" },
          { id: "c", type: "earn_deposit", status: "weird" },
        ],
      }),
    );
    const result = await listEarnActions(cfg, "wallet_primary");
    expect(result.state).toBe("REAL");
    if (result.state === "REAL") expect(result.value.map((a) => a.id)).toEqual(["b"]);
  });
});

describe("reasonForStatus", () => {
  it("is a fixed sentence per status family", () => {
    expect(reasonForStatus(400, "deposit")).toMatch(/malformed/);
    expect(reasonForStatus(429, "deposit")).toMatch(/rate-limiting/);
    expect(reasonForStatus(503, "deposit")).toMatch(/could not complete/);
    expect(reasonForStatus(418, "deposit")).toMatch(/unexpected status/);
  });
});
