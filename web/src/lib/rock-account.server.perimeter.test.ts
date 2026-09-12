/**
 * Perimeter audit regressions (`web/audit/2026-09-12-perimeter.md`, specs/19 Part 3 step 4).
 *
 * This file began as the audit's evidence: it demonstrated P-1 (a captured attestation is a bearer
 * token for its whole TTL, with no per-rock limit and no spend cap) and P-2 (an RPC failure
 * returned `SEPOLIA_RPC_URL`, API key included, to an unauthenticated caller). Both are fixed, so
 * the file now asserts the fixed behaviour instead — the demonstrations are preserved in the audit
 * document, and what lives here is what must not come back.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";

const SIGNER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const RELAYER_KEY = "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba";
const REGISTRY = "0x00000000000000000000000000000000000c0ffe";
/** A stand-in for a real provider URL: the API key is the last path segment. */
const RPC_WITH_KEY = "http://127.0.0.1:1/v2/SUPER-SECRET-ALCHEMY-KEY";

async function signAttestation(rockId: string, deadline: number) {
  const account = privateKeyToAccount(SIGNER_KEY);
  const message = {
    rockId,
    uidHash: `0x${"ab".repeat(32)}` as `0x${string}`,
    counter: 7,
    deadline,
    subject: "0x1111111111111111111111111111111111111111" as `0x${string}`,
    smartAccount: "0x2222222222222222222222222222222222222222" as `0x${string}`,
  };
  const { ATTESTATION_TYPES } = await import("@/lib/rock-account.server");
  const signature = await account.signTypedData({
    domain: {
      name: "BankRockRegistry",
      version: "1",
      chainId: 11155111,
      verifyingContract: REGISTRY as `0x${string}`,
    },
    types: ATTESTATION_TYPES,
    primaryType: "Attestation",
    message: {
      rockId: BigInt(message.rockId),
      uidHash: message.uidHash,
      counter: message.counter,
      deadline: BigInt(message.deadline),
      subject: message.subject,
      smartAccount: message.smartAccount,
    },
  });
  return { domain: {}, message, signature } as never;
}

beforeEach(() => {
  vi.resetModules();
  process.env.ATTESTATION_SIGNER_PRIVATE_KEY = SIGNER_KEY;
  process.env.NEXT_PUBLIC_REGISTRY_ADDRESS = REGISTRY;
  process.env.NEXT_PUBLIC_CHAIN_ID = "11155111";
});

describe("P-2: an RPC failure must not disclose the provider URL or its key", () => {
  it("submitClaimHandover's reason carries neither the URL nor the key", async () => {
    process.env.RELAYER_PRIVATE_KEY = RELAYER_KEY;
    process.env.SEPOLIA_RPC_URL = RPC_WITH_KEY;
    process.env.RELAYER_DAILY_CAP_WEI = "50000000000000000";

    const { submitClaimHandover } = await import("@/lib/rock-account.server");
    const attestation = await signAttestation("42", Math.floor(Date.now() / 1000) + 600);

    const result = await submitClaimHandover("42", attestation);

    expect(result.state).toBe("UNAVAILABLE");
    const reason = result.state === "UNAVAILABLE" ? result.reason : "";

    // The whole finding, in three assertions.
    expect(reason).not.toContain("SUPER-SECRET-ALCHEMY-KEY");
    expect(reason).not.toContain("127.0.0.1");
    expect(reason.toLowerCase()).not.toContain("http");

    // And it still says something useful.
    expect(reason).toMatch(/^The claim was not broadcast: /);
  }, 20000);
});

describe("P-1: the relayer's daily spend cap", () => {
  it("is UNAVAILABLE when unset — 'no cap' must not be the permissive branch", async () => {
    delete process.env.RELAYER_DAILY_CAP_WEI;
    const { relayerDailyCapWei } = await import("@/lib/rock-account.server");
    const cap = relayerDailyCapWei();
    expect(cap.state).toBe("UNAVAILABLE");
    if (cap.state === "UNAVAILABLE") expect(cap.reason).toBe("relayer cap unset");
  });

  it("treats an explicit zero as 'relaying is off', not 'unlimited'", async () => {
    process.env.RELAYER_DAILY_CAP_WEI = "0";
    const { relayerDailyCapWei } = await import("@/lib/rock-account.server");
    const cap = relayerDailyCapWei();
    expect(cap.state).toBe("UNAVAILABLE");
    if (cap.state === "UNAVAILABLE") expect(cap.reason).toBe("relayer cap unset");
  });

  it("refuses a malformed cap rather than falling back to a default", async () => {
    process.env.RELAYER_DAILY_CAP_WEI = "0.05 ETH";
    const { relayerDailyCapWei } = await import("@/lib/rock-account.server");
    expect(relayerDailyCapWei().state).toBe("UNAVAILABLE");
  });

  it("refuses a cap the ledger's 64-bit arithmetic cannot hold", async () => {
    process.env.RELAYER_DAILY_CAP_WEI = "100000000000000000000"; // 100 ETH in wei
    const { relayerDailyCapWei } = await import("@/lib/rock-account.server");
    const cap = relayerDailyCapWei();
    expect(cap.state).toBe("UNAVAILABLE");
    if (cap.state === "UNAVAILABLE") expect(cap.reason).toMatch(/ledger can track/);
  });

  it("accepts a well-formed cap", async () => {
    process.env.RELAYER_DAILY_CAP_WEI = "50000000000000000";
    const { relayerDailyCapWei } = await import("@/lib/rock-account.server");
    const cap = relayerDailyCapWei();
    expect(cap.state).toBe("REAL");
    if (cap.state === "REAL") expect(cap.value).toBe(BigInt("50000000000000000"));
  });

  it("fails closed when the spend ledger is unreachable", async () => {
    process.env.RELAYER_DAILY_CAP_WEI = "50000000000000000";
    // No Cloudflare context in a unit test, so `getDb()` is null — the cap cannot be enforced.
    const { reserveRelayerSpend } = await import("@/lib/rock-account.server");
    const reservation = await reserveRelayerSpend();
    expect(reservation.state).toBe("UNAVAILABLE");
    if (reservation.state === "UNAVAILABLE") {
      expect(reservation.reason).toMatch(/ledger is unavailable/);
    }
  });

  it("refuses when one claim costs more than the whole daily cap", async () => {
    process.env.RELAYER_DAILY_CAP_WEI = "1";
    const { reserveRelayerSpend } = await import("@/lib/rock-account.server");
    const reservation = await reserveRelayerSpend();
    expect(reservation.state).toBe("UNAVAILABLE");
    if (reservation.state === "UNAVAILABLE") {
      expect(reservation.reason).toMatch(/smaller than one claim costs/);
    }
  });

  it("keys the ledger by UTC day, so a cap is a day and not a rolling window", async () => {
    const { spendDayKey } = await import("@/lib/rock-account.server");
    expect(spendDayKey(Date.UTC(2026, 8, 12, 23, 59))).toBe("2026-09-12");
    expect(spendDayKey(Date.UTC(2026, 8, 13, 0, 1))).toBe("2026-09-13");
  });
});

describe("N-6: an included-but-reverted UserOperation is not a success", () => {
  const BUNDLER_KEY = "pim_test_key";
  const TX = `0x${"ef".repeat(32)}`;
  const USEROP = `0x${"ab".repeat(32)}`;

  function bundlerAnswering(receipt: unknown) {
    return vi.fn(async (_url: string, init?: { body?: string }) => {
      const method = JSON.parse(String(init?.body ?? "{}")).method;
      const result = method === "eth_sendUserOperation" ? USEROP : receipt;
      return { json: async () => ({ jsonrpc: "2.0", id: 1, result }) } as Response;
    });
  }

  beforeEach(() => {
    process.env.PIMLICO_API_KEY = BUNDLER_KEY;
  });

  it("refuses a receipt with success: false, naming the transaction", async () => {
    vi.stubGlobal(
      "fetch",
      bundlerAnswering({ receipt: { transactionHash: TX }, success: false }),
    );
    const { submitSignedUserOp } = await import("@/lib/rock-account.server");

    const result = await submitSignedUserOp({
      sender: "0x2222222222222222222222222222222222222222",
      signature: "0x11",
    });

    expect(result.state).toBe("UNAVAILABLE");
    if (result.state === "UNAVAILABLE") {
      expect(result.reason).toContain("account handover reverted on-chain");
      expect(result.reason).toContain(TX);
    }
    vi.unstubAllGlobals();
  });

  it("refuses a receipt that omits the success flag entirely", async () => {
    vi.stubGlobal("fetch", bundlerAnswering({ receipt: { transactionHash: TX } }));
    const { submitSignedUserOp } = await import("@/lib/rock-account.server");

    const result = await submitSignedUserOp({
      sender: "0x2222222222222222222222222222222222222222",
      signature: "0x11",
    });
    expect(result.state).toBe("UNAVAILABLE");
    vi.unstubAllGlobals();
  });

  it("returns REAL only when the operation actually succeeded", async () => {
    vi.stubGlobal("fetch", bundlerAnswering({ receipt: { transactionHash: TX }, success: true }));
    const { submitSignedUserOp } = await import("@/lib/rock-account.server");

    const result = await submitSignedUserOp({
      sender: "0x2222222222222222222222222222222222222222",
      signature: "0x11",
    });
    expect(result.state).toBe("REAL");
    if (result.state === "REAL") expect(result.value.txHash).toBe(TX);
    vi.unstubAllGlobals();
  });
});
