import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `POST /api/rocks/[id]/claim` — the one unauthenticated route that spends money.
 *
 * Audit P-1: a valid attestation is a bearer token for its ten-minute TTL, so every gate in front
 * of the broadcast is what stands between a captured one and the relayer's balance. Each refusal
 * below is one of those gates, and each asserts the same two things: the response says why, and
 * `submitClaimHandover` was never called.
 */

const RELAYER_SUBJECT = "0x1111111111111111111111111111111111111111";
const OTHER_WALLET = "0x9999999999999999999999999999999999999999";

const verifyAttestation = vi.fn();
const submitClaimHandover = vi.fn();
const submitSignedUserOp = vi.fn();
const reserveRelayerSpend = vi.fn();
const releaseRelayerSpend = vi.fn();
const readRock = vi.fn();
const requireIpRateLimit = vi.fn();
const requireRateLimit = vi.fn();

vi.mock("@/lib/rock-account.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rock-account.server")>(
    "@/lib/rock-account.server",
  );
  return {
    ...actual,
    relayerAccount: () => ({ state: "REAL", value: { address: RELAYER_SUBJECT } }),
    verifyAttestation: (...args: unknown[]) => verifyAttestation(...args),
    submitClaimHandover: (...args: unknown[]) => submitClaimHandover(...args),
    submitSignedUserOp: (...args: unknown[]) => submitSignedUserOp(...args),
    reserveRelayerSpend: (...args: unknown[]) => reserveRelayerSpend(...args),
    releaseRelayerSpend: (...args: unknown[]) => releaseRelayerSpend(...args),
  };
});

vi.mock("@/lib/rock-account", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rock-account")>("@/lib/rock-account");
  return { ...actual, readRock: (...args: unknown[]) => readRock(...args) };
});

vi.mock("@/lib/rate-limit", () => ({
  requireIpRateLimit: (...args: unknown[]) => requireIpRateLimit(...args),
  requireRateLimit: (...args: unknown[]) => requireRateLimit(...args),
}));

let storedSwap: Record<string, unknown> | null = null;
const deletedSwap = vi.fn();

vi.mock("@/lib/db", () => ({
  NO_DATABASE_REASON: "no database",
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ get: async () => storedSwap }) }) }),
    delete: () => ({ where: async () => deletedSwap() }),
  }),
}));

const attestation = {
  state: "SIGNED",
  signature: `0x${"11".repeat(65)}`,
  signer: RELAYER_SUBJECT,
  primaryType: "Attestation",
  typeString: "Attestation(...)",
  domain: { name: "BankRockRegistry", version: "1", chainId: 11155111, verifyingContract: RELAYER_SUBJECT },
  message: {
    rockId: "1",
    uidHash: `0x${"ab".repeat(32)}`,
    counter: 7,
    deadline: Math.floor(Date.now() / 1000) + 600,
    subject: RELAYER_SUBJECT,
    // `claimHandover` rebinds the rock to this account, so it must be the one the registry holds.
    smartAccount: OTHER_WALLET,
  },
};

function rock(overrides: Record<string, unknown> = {}) {
  return {
    state: "REAL",
    value: {
      rockId: "1",
      owner: OTHER_WALLET,
      smartAccount: OTHER_WALLET,
      uidHash: `0x${"ab".repeat(32)}`,
      state: "handover_pending",
      lost: false,
      handover: {
        // Named, always: open gifts are refused outright now (review N-1).
        recipient: RELAYER_SUBJECT,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        initiatedAt: Math.floor(Date.now() / 1000) - 60,
        initiatedBy: OTHER_WALLET,
        messageHash: `0x${"00".repeat(32)}`,
      },
      ...overrides,
    },
  };
}

async function post(body: unknown = { attestation }) {
  const { POST } = await import("./route");
  const response = await POST(
    new Request("https://bank-rock.com/api/rocks/1/claim", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.7" },
    }),
    { params: Promise.resolve({ id: "1" }) },
  );
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  vi.resetModules();
  for (const fn of [
    verifyAttestation,
    submitClaimHandover,
    submitSignedUserOp,
    reserveRelayerSpend,
    releaseRelayerSpend,
    readRock,
    requireIpRateLimit,
    requireRateLimit,
  ]) {
    fn.mockReset();
  }

  storedSwap = {
    rockId: "1",
    kind: "swap_owner",
    creatorDid: "did:privy:giver",
    recipient: RELAYER_SUBJECT,
    userOp: { sender: OTHER_WALLET, signature: `0x${"11".repeat(65)}` },
  };
  deletedSwap.mockReset();
  submitSignedUserOp.mockResolvedValue({
    state: "REAL",
    value: { txHash: `0x${"ef".repeat(32)}`, userOpHash: `0x${"ab".repeat(32)}` },
  });

  requireIpRateLimit.mockResolvedValue({ ok: true });
  requireRateLimit.mockResolvedValue({ ok: true });
  verifyAttestation.mockResolvedValue({
    state: "REAL",
    value: { subject: RELAYER_SUBJECT, counter: 7 },
  });
  readRock.mockResolvedValue(rock());
  reserveRelayerSpend.mockResolvedValue({
    state: "REAL",
    value: { day: "2026-09-12", reservedWei: BigInt(2_000_000_000_000_000) },
  });
  submitClaimHandover.mockResolvedValue({ state: "REAL", value: { txHash: `0x${"cd".repeat(32)}` } });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("the happy path", () => {
  it("hands over the account, then claims the rock", async () => {
    const { status, body } = await post();
    expect(status).toBe(200);
    expect(body.state).toBe("REAL");
    expect(body.txHash).toBe(`0x${"cd".repeat(32)}`);
    expect(body.rockAccountHandover).toEqual({ state: "REAL", txHash: `0x${"ef".repeat(32)}` });
    expect(submitClaimHandover).toHaveBeenCalledTimes(1);
    expect(submitSignedUserOp).toHaveBeenCalledTimes(1);
  });

  it("orders the three steps: reserve, swap the Safe, then claim (review N-1)", async () => {
    const order: string[] = [];
    reserveRelayerSpend.mockImplementation(async () => {
      order.push("reserve");
      return { state: "REAL", value: { day: "2026-09-12", reservedWei: BigInt(1) } };
    });
    submitSignedUserOp.mockImplementation(async () => {
      order.push("swap");
      return { state: "REAL", value: { txHash: `0x${"ef".repeat(32)}`, userOpHash: "0x" } };
    });
    submitClaimHandover.mockImplementation(async () => {
      order.push("claim");
      return { state: "REAL", value: { txHash: `0x${"cd".repeat(32)}` } };
    });

    await post();
    // The Safe must belong to the claimant before the registry says the rock does: a rock whose
    // account is still the giver's is one she can archive or re-gift.
    expect(order).toEqual(["reserve", "swap", "claim"]);
  });
});

describe("refusals before any gas is spent (P-1)", () => {
  it("refuses when the rock has no outstanding handover", async () => {
    readRock.mockResolvedValue(rock({ state: "awake", handover: null }));
    const { status, body } = await post();
    expect(status).toBe(409);
    expect(body.reason).toMatch(/no gift waiting/i);
    expect(submitClaimHandover).not.toHaveBeenCalled();
    expect(reserveRelayerSpend).not.toHaveBeenCalled();
  });

  it("refuses an expired handover", async () => {
    readRock.mockResolvedValue(
      rock({
        handover: {
          recipient: null,
          expiresAt: Math.floor(Date.now() / 1000) - 1,
          initiatedAt: 0,
          initiatedBy: OTHER_WALLET,
          messageHash: `0x${"00".repeat(32)}`,
        },
      }),
    );
    const { status, body } = await post();
    expect(status).toBe(409);
    expect(body.reason).toMatch(/expired/i);
    expect(submitClaimHandover).not.toHaveBeenCalled();
  });

  it("refuses an open gift outright (review N-1)", async () => {
    readRock.mockResolvedValue(
      rock({
        handover: {
          recipient: null,
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
          initiatedAt: 0,
          initiatedBy: OTHER_WALLET,
          messageHash: `0x${"00".repeat(32)}`,
        },
      }),
    );
    const { status, body } = await post();
    expect(status).toBe(409);
    expect(body.reason).toBe("open gifts are not supported by the app");
    expect(submitSignedUserOp).not.toHaveBeenCalled();
    expect(submitClaimHandover).not.toHaveBeenCalled();
  });

  it("refuses when the attestation names a different Rock Account", async () => {
    readRock.mockResolvedValue(rock({ smartAccount: "0x4444444444444444444444444444444444444444" }));
    const { status, body } = await post();
    expect(status).toBe(409);
    expect(body.reason).toMatch(/different Rock Account/i);
    expect(submitSignedUserOp).not.toHaveBeenCalled();
    expect(submitClaimHandover).not.toHaveBeenCalled();
  });

  it("refuses when no owner swap is stored for the rock", async () => {
    storedSwap = null;
    const { status, body } = await post();
    expect(status).toBe(503);
    expect(body.reason).toMatch(/no pre-signed Rock Account hand-over/i);
    expect(submitClaimHandover).not.toHaveBeenCalled();
    expect(releaseRelayerSpend).toHaveBeenCalledTimes(1);
  });

  it("refuses when the stored owner swap names a different recipient", async () => {
    storedSwap = {
      rockId: "1",
      kind: "swap_owner",
      recipient: OTHER_WALLET,
      userOp: { sender: OTHER_WALLET, signature: "0x11" },
    };
    const { status, body } = await post();
    expect(status).toBe(503);
    expect(body.reason).toMatch(/names a different recipient/i);
    expect(submitClaimHandover).not.toHaveBeenCalled();
  });

  it("does not claim when the owner swap was included but reverted (review N-6)", async () => {
    // ERC-4337 reports a reverted UserOperation with `success: false` and a good transaction hash.
    // Treating that as landed is N-1 reached through the check meant to prevent it.
    submitSignedUserOp.mockResolvedValue({
      state: "UNAVAILABLE",
      reason: `account handover reverted on-chain (0x${"ef".repeat(32)})`,
    });

    const { status, body } = await post();
    expect(status).toBe(503);
    expect(submitClaimHandover).not.toHaveBeenCalled();
    expect(releaseRelayerSpend).toHaveBeenCalledTimes(1);
    expect(body.rockAccountHandover.reason).toMatch(/reverted on-chain/);
  });

  it("refuses when the attestation is about to expire (review N-6)", async () => {
    const { POST } = await import("./route");
    const expiring = {
      ...attestation,
      message: { ...attestation.message, deadline: Math.floor(Date.now() / 1000) + 30 },
    };
    const response = await POST(
      new Request("https://bank-rock.com/api/rocks/1/claim", {
        method: "POST",
        body: JSON.stringify({ attestation: expiring }),
        headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.7" },
      }),
      { params: Promise.resolve({ id: "1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.reason).toBe("attestation too close to expiry; tap again");
    // Nothing irreversible ran: no swap, no claim, and no cap consumed.
    expect(submitSignedUserOp).not.toHaveBeenCalled();
    expect(submitClaimHandover).not.toHaveBeenCalled();
    expect(reserveRelayerSpend).not.toHaveBeenCalled();
  });

  it("accepts an attestation with comfortable lifetime left", async () => {
    const { status } = await post();
    expect(status).toBe(200);
  });

  it("does not claim when the owner swap fails to land, and releases the reservation", async () => {
    submitSignedUserOp.mockResolvedValue({
      state: "UNAVAILABLE",
      reason: "the bundler rejected the stored operation: internal error",
    });

    const { status, body } = await post();
    expect(status).toBe(503);
    expect(submitClaimHandover).not.toHaveBeenCalled();
    expect(releaseRelayerSpend).toHaveBeenCalledWith("2026-09-12", BigInt(2_000_000_000_000_000));
    expect(body.rockAccountHandover.state).toBe("UNAVAILABLE");
  });

  it("refuses when the gift names someone else", async () => {
    readRock.mockResolvedValue(
      rock({
        handover: {
          recipient: OTHER_WALLET,
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
          initiatedAt: 0,
          initiatedBy: OTHER_WALLET,
          messageHash: `0x${"00".repeat(32)}`,
        },
      }),
    );
    const { status, body } = await post();
    expect(status).toBe(409);
    expect(body.reason).toMatch(/different wallet/i);
    expect(submitClaimHandover).not.toHaveBeenCalled();
  });

  it("refuses when the registry cannot be read, rather than paying to find out", async () => {
    readRock.mockResolvedValue({ state: "UNAVAILABLE", reason: "rpc down" });
    const { status, body } = await post();
    expect(status).toBe(409);
    expect(submitClaimHandover).not.toHaveBeenCalled();
    // And the reason is ours, not the chain's (P-2).
    expect(body.reason).toBe("The registry could not be read, so this claim was not attempted");
  });

  it("refuses over the per-rock limit", async () => {
    requireRateLimit.mockResolvedValue({ ok: false, status: 429, reason: "Too Many Requests" });
    const { status } = await post();
    expect(status).toBe(429);
    expect(verifyAttestation).not.toHaveBeenCalled();
    expect(submitClaimHandover).not.toHaveBeenCalled();
  });

  it("refuses when the rate-limit ledger cannot be consulted — fail closed (P-11)", async () => {
    requireIpRateLimit.mockResolvedValue({
      ok: false,
      status: 503,
      reason: "The rate-limit ledger is unavailable, so this request cannot be accepted",
    });
    const { status, body } = await post();
    expect(status).toBe(503);
    expect(body.state).toBe("UNAVAILABLE");
    expect(submitClaimHandover).not.toHaveBeenCalled();
  });

  it("refuses when the daily cap is unset", async () => {
    reserveRelayerSpend.mockResolvedValue({ state: "UNAVAILABLE", reason: "relayer cap unset" });
    const { status, body } = await post();
    expect(status).toBe(503);
    expect(body.reason).toBe("relayer cap unset");
    expect(submitClaimHandover).not.toHaveBeenCalled();
  });

  it("refuses when today's cap is exhausted", async () => {
    reserveRelayerSpend.mockResolvedValue({
      state: "UNAVAILABLE",
      reason: "The relayer has reached its daily limit — try again tomorrow",
    });
    const { status } = await post();
    expect(status).toBe(503);
    expect(submitClaimHandover).not.toHaveBeenCalled();
  });

  it("refuses an attestation that does not verify", async () => {
    verifyAttestation.mockResolvedValue({ state: "UNAVAILABLE", reason: "bad signature" });
    const { status } = await post();
    expect(status).toBe(401);
    expect(readRock).not.toHaveBeenCalled();
    expect(submitClaimHandover).not.toHaveBeenCalled();
  });

  it("rejects a body without a signed attestation", async () => {
    const { status } = await post({ attestation: { state: "UNAVAILABLE" } });
    expect(status).toBe(400);
    expect(submitClaimHandover).not.toHaveBeenCalled();
  });
});

describe("when the broadcast itself fails", () => {
  it("releases the reservation, so a failed attempt does not consume the day's cap", async () => {
    submitClaimHandover.mockResolvedValue({
      state: "UNAVAILABLE",
      reason: "The claim was not broadcast: the network could not be reached",
    });

    const { status, body } = await post();
    expect(status).toBe(503);
    expect(releaseRelayerSpend).toHaveBeenCalledWith("2026-09-12", BigInt(2_000_000_000_000_000));
    // P-2: the reason is from the fixed set, with no URL in it.
    expect(body.reason).not.toMatch(/http/i);
    // The swap did land, and the response says so rather than implying nothing happened.
    expect(body.rockAccountHandover).toEqual({ state: "REAL", txHash: `0x${"ef".repeat(32)}` });
  });
});
