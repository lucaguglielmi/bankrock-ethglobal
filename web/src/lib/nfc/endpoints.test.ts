/**
 * Covers the two callers of the single verifier: the route handler and the
 * server action. Both must produce the same verdict for the same tap, and
 * neither may report `verified: true` without a real CMAC match (D-018, F-1).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GET, POST } from "@/app/api/nfc/verify/route";
import { verifyNtagSignature } from "@/actions/verify-ntag";
import { resetSharedMemoryCounterStore } from "./counter-store";
import { aesCbcEncrypt } from "./crypto";
import { computeSdmMac, deriveSessionKeys } from "./sdm";

const MASTER_KEY_HEX = "00112233445566778899AABBCCDDEEFF";
const MASTER_KEY = Buffer.from(MASTER_KEY_HEX, "hex");
const UID = Buffer.from("04AABBCCDDEE80", "hex");

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
  "NEXT_PUBLIC_DEMO_MODE",
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
  process.env.NEXT_PUBLIC_DEMO_MODE = "true";
  resetSharedMemoryCounterStore();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  resetSharedMemoryCounterStore();
});

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

  it("fails closed when NXP_MASTER_KEY is unset", async () => {
    delete process.env.NXP_MASTER_KEY;
    const { e, c } = tap(7);
    const response = await GET(new Request(url({ rockId: "1", e, c })));
    await expect(response.json()).resolves.toEqual({ verified: false, reason: "unconfigured" });
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
