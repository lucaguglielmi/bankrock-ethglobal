/**
 * Covers the two callers of the single verifier: the route handler and the
 * server action. Both must produce the same verdict for the same tap, and
 * neither may report `verified: true` without a real CMAC match (D-018, F-1).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { keccak256, zeroAddress, type Hex } from "viem";

import { GET, POST } from "@/app/api/nfc/verify/route";
import { verifyNtagSignature } from "@/actions/verify-ntag";
import { aesCbcEncrypt } from "./crypto";
import { computeSdmMac, deriveSessionKeys } from "./sdm";

/**
 * Same injected counter store as verify.test.ts, for the same reason: the verifier fails closed
 * without D1, so a unit test hands it a `MemoryCounterStore` explicitly, and flips `available`
 * off to see the production refusal.
 */
const counterStore = vi.hoisted(() => ({
  available: true,
  reset: () => {},
}));

vi.mock("./counter-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./counter-store")>();
  const memory = new actual.MemoryCounterStore();
  counterStore.reset = () => memory.reset();
  return {
    ...actual,
    resolveCounterStore: async () =>
      counterStore.available
        ? { available: true, kind: "memory", store: memory }
        : { available: false, reason: "counter_store_unavailable" },
  };
});

const MASTER_KEY_HEX = "00112233445566778899AABBCCDDEEFF";
const MASTER_KEY = Buffer.from(MASTER_KEY_HEX, "hex");
const UID = Buffer.from("04AABBCCDDEE80", "hex");
const SIGNER_KEY = ("0x" + "11".repeat(32)) as Hex;
const REGISTRY_KEY = ("0x" + "22".repeat(32)) as Hex;
const SUBJECT_KEY = ("0x" + "33".repeat(32)) as Hex;
const SMART_ACCOUNT_KEY = ("0x" + "44".repeat(32)) as Hex;
const DERIVED_ACCOUNT = privateKeyToAccount(SMART_ACCOUNT_KEY).address;
const EXISTING_ACCOUNT = privateKeyToAccount(REGISTRY_KEY).address;

/** Same registry stub as verify.test.ts; see the note there on why it is total. */
const registry = vi.hoisted(() => ({
  boundRockId: null as string | null,
  boundUnavailable: false,
  rocks: new Map<string, { state: string; smartAccount: string } | "unavailable">(),
  derived: null as string | null,
  saltNonces: [] as bigint[],
}));

vi.mock("@/lib/rock-account", () => {
  const parseRockId = (value: string) => {
    const trimmed = String(value ?? "").trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const parsed = BigInt(trimmed);
    return parsed > BigInt(0) ? parsed : null;
  };
  return {
    parseRockId,
    nextFreeRockId: (ids: readonly string[]) => {
      let highest = BigInt(0);
      for (const raw of ids) {
        const parsed = parseRockId(String(raw));
        if (parsed !== null && parsed > highest) highest = parsed;
      }
      return (highest + BigInt(1)).toString();
    },
    resolveRockForTag: async () =>
      registry.boundUnavailable
        ? { state: "UNAVAILABLE", reason: "no registry" }
        : { state: "REAL", value: { rockId: registry.boundRockId } },
    readRock: async (rockId: string) => {
      const record = registry.rocks.get(rockId);
      if (!record || record === "unavailable") {
        return { state: "UNAVAILABLE", reason: "no registry" };
      }
      return { state: "REAL", value: { rockId, ...record } };
    },
    computeRockAccountAddress: async (params: { ownerAddress: string; saltNonce: bigint }) => {
      registry.saltNonces.push(params.saltNonce);
      return registry.derived === null
        ? { state: "UNAVAILABLE", reason: "no rpc" }
        : { state: "REAL", value: registry.derived };
    },
  };
});

vi.mock("@/lib/db", () => ({ getDb: () => null, getD1: () => null }));

/**
 * The route refuses when the limiter cannot enforce, so the limiter is stubbed
 * and every branch of that decision is exercised explicitly below. The default
 * is an enforced allow, which is what the rest of these tests assume.
 */
const rateLimit = vi.hoisted(() => ({
  decision: { allowed: true, enforced: true, remaining: 29 } as {
    allowed: boolean;
    enforced: boolean;
    remaining: number;
    reason?: string;
  },
  calls: [] as Array<{ scope: string; limit: number; windowMs: number }>,
}));

vi.mock("@/lib/rate-limit", () => ({
  consumeIpRateLimit: async (_req: Request, scope: string, limit: number, windowMs: number) => {
    rateLimit.calls.push({ scope, limit, windowMs });
    return rateLimit.decision;
  },
}));

/** SELF-GENERATED, test-only: the (e, c) a provisioned tag would emit. */
function tap(counter: number): { e: string; c: string } {
  const counterBytes = Buffer.from([counter & 0xff, (counter >> 8) & 0xff, (counter >> 16) & 0xff]);
  const plain = Buffer.concat([
    Buffer.from([0xc7]),
    UID,
    counterBytes,
    Buffer.from("0102030405", "hex"),
  ]);
  const session = deriveSessionKeys(MASTER_KEY, UID, counterBytes);
  return {
    e: aesCbcEncrypt(MASTER_KEY, plain).toString("hex").toUpperCase(),
    c: computeSdmMac(session.macKey, Buffer.alloc(0)).toString("hex").toUpperCase(),
  };
}

const ENV_KEYS = [
  "NXP_MASTER_KEY",
  "ATTESTATION_SIGNER_PRIVATE_KEY",
  "NEXT_PUBLIC_REGISTRY_ADDRESS",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  process.env.NXP_MASTER_KEY = MASTER_KEY_HEX;
  counterStore.available = true;
  counterStore.reset();
  registry.boundRockId = null;
  registry.boundUnavailable = false;
  registry.rocks.clear();
  registry.derived = null;
  registry.saltNonces = [];
  rateLimit.decision = { allowed: true, enforced: true, remaining: 29 };
  rateLimit.calls = [];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  counterStore.reset();
});

function configureSigner(): void {
  process.env.ATTESTATION_SIGNER_PRIVATE_KEY = SIGNER_KEY;
  process.env.NEXT_PUBLIC_REGISTRY_ADDRESS = privateKeyToAccount(REGISTRY_KEY).address;
}

function url(params: Record<string, string>): string {
  const query = new URLSearchParams(params).toString();
  return `https://bank-rock.com/api/nfc/verify?${query}`;
}

describe("GET /api/nfc/verify", () => {
  it("verifies a genuine tap", async () => {
    const { e, c } = tap(7);
    const response = await GET(new Request(url({ rockId: "1", e, c })));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      verified: true,
      uid: "EE80",
      counter: 7,
    });
  });

  it("accepts the NXP parameter names picc_data and cmac", async () => {
    const { e, c } = tap(8);
    const response = await GET(new Request(url({ rockId: "1", picc_data: e, cmac: c })));
    await expect(response.json()).resolves.toMatchObject({ verified: true, counter: 8 });
  });

  it("rejects a replayed URL with stale_counter", async () => {
    const { e, c } = tap(7);
    await GET(new Request(url({ rockId: "1", e, c })));
    const replay = await GET(new Request(url({ rockId: "1", e, c })));
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({
      verified: false,
      reason: "stale_counter",
    });
  });

  it("rejects a hand-edited c with invalid_cmac", async () => {
    const { e } = tap(7);
    const response = await GET(new Request(url({ rockId: "1", e, c: "DEADBEEFDEADBEEF" })));
    await expect(response.json()).resolves.toEqual({ verified: false, reason: "invalid_cmac" });
  });

  it("400s on malformed input", async () => {
    const response = await GET(new Request(url({ rockId: "1", e: "nope" })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      verified: false,
      reason: "malformed_request",
    });
  });

  it("400s on a subject that is not an address", async () => {
    const { e, c } = tap(7);
    const response = await GET(new Request(url({ rockId: "1", e, c, subject: "0xnope" })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      verified: false,
      reason: "malformed_request",
    });
  });

  it("ignores a smartAccount in the query string and derives its own", async () => {
    configureSigner();
    registry.derived = DERIVED_ACCOUNT;
    const subject = privateKeyToAccount(SUBJECT_KEY).address;

    const { e, c } = tap(7);
    const response = await GET(
      new Request(url({ rockId: "1", e, c, subject, smartAccount: zeroAddress })),
    );
    const body = await response.json();
    expect(body.attestation.message.smartAccount).toBe(DERIVED_ACCOUNT);
  });

  it("signs an attestation for the effective rock and the derived account", async () => {
    configureSigner();
    registry.derived = DERIVED_ACCOUNT;
    registry.boundRockId = "9";
    registry.rocks.set("9", { state: "dormant", smartAccount: zeroAddress });
    const subject = privateKeyToAccount(SUBJECT_KEY).address;

    const { e, c } = tap(7);
    const response = await GET(new Request(url({ rockId: "1", e, c, subject })));
    const body = await response.json();
    expect(body).toMatchObject({
      verified: true,
      effectiveRockId: "9",
      resolution: "bound",
    });
    expect(body.attestation).toMatchObject({
      state: "SIGNED",
      typeString:
        "Attestation(uint256 rockId,bytes32 uidHash,uint32 counter,uint256 deadline,address subject,address smartAccount)",
      message: { rockId: "9", counter: 7, subject, smartAccount: DERIVED_ACCOUNT },
    });
    expect(Object.keys(body.attestation.message)).toEqual([
      "rockId",
      "uidHash",
      "counter",
      "deadline",
      "subject",
      "smartAccount",
    ]);
  });

  it("signs the registry's account for a claim", async () => {
    configureSigner();
    registry.derived = DERIVED_ACCOUNT;
    registry.boundRockId = "4";
    registry.rocks.set("4", { state: "awake", smartAccount: EXISTING_ACCOUNT });

    const { e, c } = tap(7);
    const response = await GET(
      new Request(
        url({ rockId: "4", e, c, subject: privateKeyToAccount(SUBJECT_KEY).address }),
      ),
    );
    const body = await response.json();
    expect(body.attestation.message.smartAccount).toBe(EXISTING_ACCOUNT);
    expect(registry.saltNonces).toEqual([]);
  });

  it("reports the resolution even with no subject", async () => {
    registry.boundRockId = null;
    registry.rocks.set("1", { state: "dormant", smartAccount: zeroAddress });

    const { e, c } = tap(7);
    const response = await GET(new Request(url({ rockId: "1", e, c })));
    await expect(response.json()).resolves.toMatchObject({
      verified: true,
      effectiveRockId: "1",
      resolution: "url",
    });
  });

  it("fails closed when NXP_MASTER_KEY is unset", async () => {
    delete process.env.NXP_MASTER_KEY;
    const { e, c } = tap(7);
    const response = await GET(new Request(url({ rockId: "1", e, c })));
    await expect(response.json()).resolves.toEqual({ verified: false, reason: "unconfigured" });
  });

  it("fails closed when no durable counter store is reachable, with a valid CMAC", async () => {
    counterStore.available = false;
    const { e, c } = tap(7);
    const response = await GET(new Request(url({ rockId: "1", e, c })));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      verified: false,
      reason: "counter_store_unavailable",
    });
  });
});

describe("rate limiting (P-4)", () => {
  it("consumes one unit per request: 30 per minute, per IP, under its own scope", async () => {
    const { e, c } = tap(7);
    await GET(new Request(url({ rockId: "1", e, c })));
    expect(rateLimit.calls).toEqual([{ scope: "nfc-verify", limit: 30, windowMs: 60_000 }]);
  });

  it("429s when the caller is over the limit", async () => {
    rateLimit.decision = { allowed: false, enforced: true, remaining: 0 };
    const { e, c } = tap(7);
    const response = await GET(new Request(url({ rockId: "1", e, c })));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    await expect(response.json()).resolves.toEqual({ verified: false, reason: "rate_limited" });
  });

  it("503s when the limiter store is unreachable — fail closed", async () => {
    rateLimit.decision = {
      allowed: true,
      enforced: false,
      remaining: 30,
      reason: "no database",
    };
    const { e, c } = tap(7);
    const response = await GET(new Request(url({ rockId: "1", e, c })));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      state: "UNAVAILABLE",
      verified: false,
      reason: "rate_limit_unavailable",
    });
  });

  it("does no crypto work when refused — a refusal never advances the counter", async () => {
    const { e, c } = tap(7);

    rateLimit.decision = { allowed: false, enforced: true, remaining: 0 };
    expect((await GET(new Request(url({ rockId: "1", e, c })))).status).toBe(429);

    rateLimit.decision = { allowed: true, enforced: true, remaining: 29 };
    // The same URL still verifies, so the refused request consumed nothing.
    await expect(
      (await GET(new Request(url({ rockId: "1", e, c })))).json(),
    ).resolves.toMatchObject({ verified: true, counter: 7 });
  });

  it("refuses POST before the body is read", async () => {
    rateLimit.decision = { allowed: true, enforced: false, remaining: 30 };
    const response = await POST(
      new Request("https://bank-rock.com/api/nfc/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rockId: "1", ...tap(7) }),
      }),
    );
    expect(response.status).toBe(503);
  });

  it("is applied to both methods", async () => {
    rateLimit.decision = { allowed: false, enforced: true, remaining: 0 };
    const { e, c } = tap(7);
    expect((await GET(new Request(url({ rockId: "1", e, c })))).status).toBe(429);
    expect(
      (
        await POST(
          new Request("https://bank-rock.com/api/nfc/verify", {
            method: "POST",
            body: JSON.stringify({ rockId: "1", e, c }),
          }),
        )
      ).status,
    ).toBe(429);
  });
});

describe("POST /api/nfc/verify", () => {
  it("reads the parameters from a JSON body", async () => {
    const { e, c } = tap(7);
    const response = await POST(
      new Request("https://bank-rock.com/api/nfc/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rockId: "1", e, c }),
      }),
    );
    await expect(response.json()).resolves.toMatchObject({ verified: true, counter: 7 });
  });

  it("reads subject from the JSON body", async () => {
    configureSigner();
    registry.derived = DERIVED_ACCOUNT;
    const subject = privateKeyToAccount(SUBJECT_KEY).address;

    const { e, c } = tap(7);
    const response = await POST(
      new Request("https://bank-rock.com/api/nfc/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rockId: "42", e, c, subject }),
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      verified: true,
      attestation: { state: "SIGNED", message: { subject } },
    });
  });

  it("400s on an empty body", async () => {
    const response = await POST(
      new Request("https://bank-rock.com/api/nfc/verify", { method: "POST", body: "{}" }),
    );
    expect(response.status).toBe(400);
  });
});

describe("verifyNtagSignature (server action)", () => {
  it("verifies a genuine tap and mirrors the route's fields", async () => {
    const { e, c } = tap(7);
    const result = await verifyNtagSignature({ rockId: "1", e, c });
    expect(result).toMatchObject({
      success: true,
      verified: true,
      isAuthentic: true,
      uid: "EE80",
      counter: 7,
      readCount: 7,
    });
    expect(result.attestation).toEqual({
      state: "UNAVAILABLE",
      reason: "signer_unconfigured",
    });
  });

  it("passes subject through and returns the resolved rock and account", async () => {
    configureSigner();
    registry.derived = DERIVED_ACCOUNT;
    registry.rocks.set("42", { state: "dormant", smartAccount: zeroAddress });
    const subject = privateKeyToAccount(SUBJECT_KEY).address;

    const { e, c } = tap(7);
    const result = await verifyNtagSignature({ rockId: "42", e, c, subject });
    expect(result.verified).toBe(true);
    expect(result.effectiveRockId).toBe("42");
    expect(result.resolution).toBe("url");
    expect(result.attestation).toMatchObject({
      state: "SIGNED",
      message: { rockId: "42", counter: 7, subject, smartAccount: DERIVED_ACCOUNT },
    });
    expect(registry.saltNonces).toEqual([BigInt(keccak256(`0x${UID.toString("hex")}`))]);
    const attestation = result.attestation;
    expect(attestation?.state === "SIGNED" && Object.keys(attestation.message)).toEqual([
      "rockId",
      "uidHash",
      "counter",
      "deadline",
      "subject",
      "smartAccount",
    ]);
  });

  it("reports rock_account_unavailable when the derivation cannot run", async () => {
    configureSigner();
    registry.derived = null;

    const { e, c } = tap(7);
    const result = await verifyNtagSignature({
      rockId: "42",
      e,
      c,
      subject: privateKeyToAccount(SUBJECT_KEY).address,
    });
    expect(result.verified).toBe(true);
    expect(result.attestation).toEqual({
      state: "UNAVAILABLE",
      reason: "rock_account_unavailable",
    });
  });

  it("rejects an invalid subject as malformed_request", async () => {
    const { e, c } = tap(7);
    const result = await verifyNtagSignature({ rockId: "42", e, c, subject: "0xnope" });
    expect(result.verified).toBe(false);
    expect(result.reason).toBe("malformed_request");
  });

  it("is never authentic for an arbitrary c — the F-1 regression", async () => {
    const { e } = tap(7);
    for (const c of ["deadbeefdeadbeef", "0000000000000000", "FFFFFFFFFFFFFFFF"]) {
      const result = await verifyNtagSignature({ rockId: "1", e, c });
      expect(result.verified).toBe(false);
      expect(result.isAuthentic).toBe(false);
      expect(result.reason).toBe("invalid_cmac");
    }
  });

  it("no longer treats the literal invalid_signature as the only failure", async () => {
    const result = await verifyNtagSignature({ rockId: "1", e: tap(7).e, c: "invalid_signature" });
    expect(result.isAuthentic).toBe(false);
    expect(result.reason).toBe("malformed_request");
  });

  it("ignores attacker-supplied uid and ctr parameters", async () => {
    const { e, c } = tap(7);
    const result = await verifyNtagSignature({
      rockId: "1",
      e,
      c,
      uid: "04FFFFFFFFFFFF",
      ctr: "FFFFFF",
    });
    expect(result.uid).toBe("EE80");
    expect(result.counter).toBe(7);
  });

  it("rejects a replay", async () => {
    const { e, c } = tap(7);
    await verifyNtagSignature({ rockId: "1", e, c });
    const replay = await verifyNtagSignature({ rockId: "1", e, c });
    expect(replay.isAuthentic).toBe(false);
    expect(replay.reason).toBe("stale_counter");
    expect(replay.message).toContain("already been used");
  });

  it("fails closed with no key configured", async () => {
    delete process.env.NXP_MASTER_KEY;
    const { e, c } = tap(7);
    const result = await verifyNtagSignature({ rockId: "1", e, c });
    expect(result.isAuthentic).toBe(false);
    expect(result.reason).toBe("unconfigured");
  });
});
