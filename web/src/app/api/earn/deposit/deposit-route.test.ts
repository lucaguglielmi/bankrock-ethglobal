import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `POST /api/earn/deposit` — every gate in front of the forward, and the forward itself.
 *
 * The one property that matters most: there is no path on which this route submits anything
 * the wallet did not sign, and no configuration in which a missing secret opens it.
 */

const requirePrivyIdentity = vi.fn();
const assertWalletBelongsTo = vi.fn();
const submitEarnAction = vi.fn();
const requireIpRateLimit = vi.fn();
const consumeIpRateLimit = vi.fn();

vi.mock("@/lib/auth/privy", () => ({
  requirePrivyIdentity: (...args: unknown[]) => requirePrivyIdentity(...args),
}));

vi.mock("@/lib/earn/privy-api", () => ({
  assertWalletBelongsTo: (...args: unknown[]) => assertWalletBelongsTo(...args),
  submitEarnAction: (...args: unknown[]) => submitEarnAction(...args),
}));

vi.mock("@/lib/rate-limit", () => ({
  requireIpRateLimit: (...args: unknown[]) => requireIpRateLimit(...args),
  consumeIpRateLimit: (...args: unknown[]) => consumeIpRateLimit(...args),
}));

const DID = "did:privy:user1";
const WALLET = "wallet_primary";
const VAULT = "vault_abc";

function signedRequest(overrides: Record<string, unknown> = {}) {
  return {
    walletId: WALLET,
    body: { vault_id: VAULT, raw_amount: "5000000" },
    signature: "c2lnbmF0dXJlLXNpZ25hdHVyZS12YWx1ZQ==",
    idempotencyKey: "0d5c1b0e-7c4d-4d4b-9f1e-0c1a2b3c4d5e",
    requestExpiry: String(Date.now() + 60_000),
    ...overrides,
  };
}

function post(body: unknown): Request {
  return new Request("https://bank-rock.com/api/earn/deposit", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer token" },
    body: JSON.stringify(body),
  });
}

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_PRIVY_APP_ID = "app_123";
  process.env.PRIVY_APP_SECRET = "s3cret";
  process.env.PRIVY_EARN_VAULT_ID = VAULT;
  requirePrivyIdentity.mockResolvedValue({ ok: true, identity: { did: DID } });
  requireIpRateLimit.mockResolvedValue({ ok: true });
  consumeIpRateLimit.mockResolvedValue({ allowed: true, enforced: true, remaining: 1 });
  assertWalletBelongsTo.mockResolvedValue({
    state: "REAL",
    value: { walletId: WALLET, address: "0x3333333333333333333333333333333333333333" },
  });
  submitEarnAction.mockResolvedValue({
    state: "REAL",
    value: { id: "act_1", walletId: WALLET, type: "earn_deposit", status: "pending" },
  });
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.PRIVY_APP_SECRET;
  delete process.env.PRIVY_EARN_VAULT_ID;
});

describe("POST /api/earn/deposit", () => {
  it("forwards a well-formed signed request and answers with the action", async () => {
    const { POST } = await loadRoute();
    const res = await POST(post(signedRequest()));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.state).toBe("REAL");
    expect(json.action.id).toBe("act_1");

    expect(submitEarnAction).toHaveBeenCalledTimes(1);
    const [cfg, kind, forwarded] = submitEarnAction.mock.calls[0];
    expect(kind).toBe("deposit");
    expect(cfg.vaultId).toBe(VAULT);
    expect(forwarded.body).toEqual({ vault_id: VAULT, raw_amount: "5000000" });
    expect(forwarded.signature).toBe("c2lnbmF0dXJlLXNpZ25hdHVyZS12YWx1ZQ==");
    expect(assertWalletBelongsTo).toHaveBeenCalledWith(expect.anything(), DID, WALLET);
  });

  it("refuses an unauthenticated caller before anything else", async () => {
    const { NextResponse } = await import("next/server");
    requirePrivyIdentity.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ state: "UNAVAILABLE", reason: "no" }, { status: 401 }),
    });
    const { POST } = await loadRoute();
    const res = await POST(post(signedRequest()));
    expect(res.status).toBe(401);
    expect(submitEarnAction).not.toHaveBeenCalled();
  });

  it("is UNAVAILABLE naming the variable when the secret is unset (D-017)", async () => {
    delete process.env.PRIVY_APP_SECRET;
    const { POST } = await loadRoute();
    const res = await POST(post(signedRequest()));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json).toEqual({ state: "UNAVAILABLE", reason: "PRIVY_APP_SECRET is not configured" });
    expect(submitEarnAction).not.toHaveBeenCalled();
  });

  it("is UNAVAILABLE naming the variable when no vault is configured", async () => {
    delete process.env.PRIVY_EARN_VAULT_ID;
    const { POST } = await loadRoute();
    const res = await POST(post(signedRequest()));
    expect(res.status).toBe(503);
    expect((await res.json()).reason).toBe("PRIVY_EARN_VAULT_ID is not configured");
  });

  it("fails closed when the rate limiter cannot be consulted", async () => {
    requireIpRateLimit.mockResolvedValue({ ok: false, status: 503, reason: "no ledger" });
    const { POST } = await loadRoute();
    const res = await POST(post(signedRequest()));
    expect(res.status).toBe(503);
    expect(submitEarnAction).not.toHaveBeenCalled();
  });

  it("refuses a request without a signature — there is no unsigned path", async () => {
    const { POST } = await loadRoute();
    const res = await POST(post(signedRequest({ signature: "" })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/signature/);
    expect(submitEarnAction).not.toHaveBeenCalled();
  });

  it("refuses a body that names another vault", async () => {
    const { POST } = await loadRoute();
    const res = await POST(post(signedRequest({ body: { vault_id: "other", raw_amount: "1" } })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/vault/);
    expect(submitEarnAction).not.toHaveBeenCalled();
  });

  it("refuses a body with extra or malformed fields", async () => {
    const { POST } = await loadRoute();
    const extra = await POST(
      post(signedRequest({ body: { vault_id: VAULT, raw_amount: "1", to: "0xabc" } })),
    );
    expect(extra.status).toBe(400);
    const zero = await POST(post(signedRequest({ body: { vault_id: VAULT, raw_amount: "0" } })));
    expect(zero.status).toBe(400);
    const decimal = await POST(
      post(signedRequest({ body: { vault_id: VAULT, raw_amount: "1.5" } })),
    );
    expect(decimal.status).toBe(400);
    expect(submitEarnAction).not.toHaveBeenCalled();
  });

  it("refuses an expired or far-future signed request", async () => {
    const { POST } = await loadRoute();
    const expired = await POST(post(signedRequest({ requestExpiry: String(Date.now() - 1000) })));
    expect(expired.status).toBe(400);
    expect((await expired.json()).error).toMatch(/expired/);
    const tooFar = await POST(
      post(signedRequest({ requestExpiry: String(Date.now() + 60 * 60 * 1000) })),
    );
    expect(tooFar.status).toBe(400);
    expect(submitEarnAction).not.toHaveBeenCalled();
  });

  it("refuses a wallet that is not the caller's", async () => {
    assertWalletBelongsTo.mockResolvedValue({
      state: "UNAVAILABLE",
      reason: "That wallet does not belong to the signed-in account",
    });
    const { POST } = await loadRoute();
    const res = await POST(post(signedRequest({ walletId: "wallet_of_someone_else" })));
    expect(res.status).toBe(403);
    expect(submitEarnAction).not.toHaveBeenCalled();
  });

  it("answers 502 UNAVAILABLE when Privy refuses the forward", async () => {
    submitEarnAction.mockResolvedValue({ state: "UNAVAILABLE", reason: "Privy refused" });
    const { POST } = await loadRoute();
    const res = await POST(post(signedRequest()));
    expect(res.status).toBe(502);
    expect((await res.json()).state).toBe("UNAVAILABLE");
  });
});
