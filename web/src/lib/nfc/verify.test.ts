import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

import { resetSharedMemoryCounterStore } from "./counter-store";
import { aesCbcEncrypt } from "./crypto";
import { computeSdmMac, deriveSessionKeys } from "./sdm";
import { uidSuffix, verifyTap } from "./verify";

const MASTER_KEY_HEX = "00112233445566778899AABBCCDDEEFF";
const MASTER_KEY = Buffer.from(MASTER_KEY_HEX, "hex");
const UID = Buffer.from("04AABBCCDDEE80", "hex");
const SIGNER_KEY = ("0x" + "11".repeat(32)) as Hex;
const REGISTRY_KEY = ("0x" + "22".repeat(32)) as Hex;
const SUBJECT_KEY = ("0x" + "33".repeat(32)) as Hex;

/** Forge the (e, c) a provisioned tag would emit. SELF-GENERATED, test-only. */
function tap(counter: number, key: Buffer = MASTER_KEY): { e: string; c: string } {
  const counterBytes = Buffer.from([counter & 0xff, (counter >> 8) & 0xff, (counter >> 16) & 0xff]);
  const plain = Buffer.concat([
    Buffer.from([0xc7]),
    UID,
    counterBytes,
    Buffer.from("0102030405", "hex"),
  ]);
  const session = deriveSessionKeys(key, UID, counterBytes);
  return {
    e: aesCbcEncrypt(key, plain).toString("hex").toUpperCase(),
    c: computeSdmMac(session.macKey, Buffer.alloc(0)).toString("hex").toUpperCase(),
  };
}

const ENV_KEYS = [
  "NXP_MASTER_KEY",
  "NXP_KEY_DIVERSIFY",
  "NXP_KEY_DIVERSIFY_APP_ID",
  "NEXT_PUBLIC_DEMO_MODE",
  "ATTESTATION_SIGNER_PRIVATE_KEY",
  "NEXT_PUBLIC_REGISTRY_ADDRESS",
  "NEXT_PUBLIC_CHAIN_ID",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  resetSharedMemoryCounterStore();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  resetSharedMemoryCounterStore();
});

/** Key set, plus the demo-mode flag that permits the in-memory counter store. */
function configureVerifier(): void {
  process.env.NXP_MASTER_KEY = MASTER_KEY_HEX;
  process.env.NEXT_PUBLIC_DEMO_MODE = "true";
}

describe("uidSuffix", () => {
  it("discloses two bytes only", () => {
    expect(uidSuffix(UID)).toBe("EE80");
  });
});

describe("fail closed", () => {
  it("returns unconfigured with NXP_MASTER_KEY unset, and never verified", async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";
    const { e, c } = tap(1);
    const outcome = await verifyTap({ rockId: "1", e, c });
    expect(outcome.body).toEqual({ verified: false, reason: "unconfigured" });
  });

  it("returns unconfigured for a master key of the wrong length or shape", async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";
    const { e, c } = tap(1);
    for (const value of ["", "00", MASTER_KEY_HEX.slice(0, 30), "zz".repeat(16)]) {
      process.env.NXP_MASTER_KEY = value;
      const outcome = await verifyTap({ rockId: "1", e, c });
      expect(outcome.body.verified).toBe(false);
      expect(outcome.body.reason).toBe("unconfigured");
    }
  });

  it("refuses to verify without a counter store, even with a valid CMAC", async () => {
    process.env.NXP_MASTER_KEY = MASTER_KEY_HEX;
    delete process.env.NEXT_PUBLIC_DEMO_MODE;
    const { e, c } = tap(1);
    const outcome = await verifyTap({ rockId: "1", e, c });
    expect(outcome.body).toEqual({ verified: false, reason: "counter_store_unavailable" });
  });
});

describe("malformed input", () => {
  beforeEach(configureVerifier);

  const cases: Array<[string, { e?: string; c?: string; enc?: string; subject?: string }]> = [
    ["no parameters", {}],
    ["e only", { e: tap(1).e }],
    ["c only", { c: tap(1).c }],
    ["e too short", { e: "00112233", c: tap(1).c }],
    ["e too long", { e: tap(1).e + "00", c: tap(1).c }],
    ["e not hex", { e: "z".repeat(32), c: tap(1).c }],
    ["c too short", { e: tap(1).e, c: "0011" }],
    ["c not hex", { e: tap(1).e, c: "z".repeat(16) }],
    ["enc not hex", { e: tap(1).e, c: tap(1).c, enc: "zzzz" }],
    ["subject not an address", { e: tap(1).e, c: tap(1).c, subject: "0xnope" }],
    ["subject too short", { e: tap(1).e, c: tap(1).c, subject: "0x1234" }],
    ["subject not hex at all", { e: tap(1).e, c: tap(1).c, subject: "vitalik.eth" }],
    ["empty strings", { e: "", c: "" }],
  ];

  it.each(cases)("400s on %s", async (_name, params) => {
    const outcome = await verifyTap({ rockId: "1", ...params });
    expect(outcome.status).toBe(400);
    expect(outcome.body).toEqual({ verified: false, reason: "malformed_request" });
  });
});

describe("CMAC verification", () => {
  beforeEach(configureVerifier);

  it("rejects a hand-edited c as invalid_cmac", async () => {
    const { e } = tap(1);
    const outcome = await verifyTap({ rockId: "1", e, c: "DEADBEEFDEADBEEF" });
    expect(outcome.status).toBe(200);
    expect(outcome.body).toEqual({ verified: false, reason: "invalid_cmac" });
  });

  it("rejects a c from a different tap", async () => {
    const first = tap(1);
    const second = tap(2);
    const outcome = await verifyTap({ rockId: "1", e: first.e, c: second.c });
    expect(outcome.body).toEqual({ verified: false, reason: "invalid_cmac" });
  });

  it("rejects e encrypted under a different key", async () => {
    const foreign = tap(1, Buffer.from("FFEEDDCCBBAA99887766554433221100", "hex"));
    const outcome = await verifyTap({ rockId: "1", e: foreign.e, c: foreign.c });
    expect(outcome.body.verified).toBe(false);
    expect(["invalid_cmac", "invalid_picc_data"]).toContain(outcome.body.reason);
  });

  it("never leaks the full UID or the key on a rejection", async () => {
    const { e } = tap(1);
    const outcome = await verifyTap({ rockId: "1", e, c: "DEADBEEFDEADBEEF" });
    const serialised = JSON.stringify(outcome.body);
    expect(serialised).not.toContain(UID.toString("hex").toUpperCase());
    expect(serialised).not.toContain(MASTER_KEY_HEX);
  });
});

describe("verified taps and replay", () => {
  beforeEach(configureVerifier);

  it("verifies a genuine tap and discloses only the UID suffix", async () => {
    const { e, c } = tap(7);
    const outcome = await verifyTap({ rockId: "1", e, c });
    expect(outcome.status).toBe(200);
    expect(outcome.body.verified).toBe(true);
    expect(outcome.body.reason).toBeUndefined();
    expect(outcome.body.uid).toBe("EE80");
    expect(outcome.body.counter).toBe(7);
    expect(JSON.stringify(outcome.body)).not.toContain(UID.toString("hex").toUpperCase());
  });

  it("rejects the exact same URL replayed — the D-002 acceptance case", async () => {
    const { e, c } = tap(7);
    await expect(verifyTap({ rockId: "1", e, c })).resolves.toMatchObject({
      body: { verified: true },
    });
    const replay = await verifyTap({ rockId: "1", e, c });
    expect(replay.body).toMatchObject({
      verified: false,
      reason: "stale_counter",
      uid: "EE80",
      counter: 7,
    });
  });

  it("rejects an older counter after a newer tap", async () => {
    const newer = tap(9);
    const older = tap(3);
    await verifyTap({ rockId: "1", e: newer.e, c: newer.c });
    const outcome = await verifyTap({ rockId: "1", e: older.e, c: older.c });
    expect(outcome.body).toMatchObject({ verified: false, reason: "stale_counter" });
  });

  it("accepts a strictly increasing sequence of taps", async () => {
    for (const counter of [1, 2, 5, 100]) {
      const { e, c } = tap(counter);
      const outcome = await verifyTap({ rockId: "1", e, c });
      expect(outcome.body).toMatchObject({ verified: true, counter });
    }
  });

  it("lets exactly one of two concurrent identical taps win", async () => {
    const { e, c } = tap(7);
    const outcomes = await Promise.all([
      verifyTap({ rockId: "1", e, c }),
      verifyTap({ rockId: "1", e, c }),
    ]);
    expect(outcomes.filter((o) => o.body.verified)).toHaveLength(1);
  });

  it("honours NXP_KEY_DIVERSIFY", async () => {
    // Undiversified URL must fail once diversification is switched on.
    const plainTap = tap(4);
    process.env.NXP_KEY_DIVERSIFY = "true";
    const outcome = await verifyTap({ rockId: "1", e: plainTap.e, c: plainTap.c });
    expect(outcome.body).toEqual({ verified: false, reason: "invalid_cmac" });
  });
});

describe("attestation", () => {
  beforeEach(configureVerifier);

  it("reports UNAVAILABLE when the signer key is unset, but still verifies", async () => {
    const { e, c } = tap(7);
    const outcome = await verifyTap({
      rockId: "1",
      e,
      c,
      subject: privateKeyToAccount(SUBJECT_KEY).address,
    });
    expect(outcome.body.verified).toBe(true);
    expect(outcome.body.attestation).toEqual({
      state: "UNAVAILABLE",
      reason: "signer_unconfigured",
    });
  });

  it("reports UNAVAILABLE when the registry address is unset, but still verifies", async () => {
    process.env.ATTESTATION_SIGNER_PRIVATE_KEY = SIGNER_KEY;
    const { e, c } = tap(7);
    const outcome = await verifyTap({
      rockId: "1",
      e,
      c,
      subject: privateKeyToAccount(SUBJECT_KEY).address,
    });
    expect(outcome.body.verified).toBe(true);
    expect(outcome.body.attestation).toEqual({
      state: "UNAVAILABLE",
      reason: "registry_unconfigured",
    });
  });

  it("signs when everything is configured, binding rockId, uid, counter and subject", async () => {
    process.env.ATTESTATION_SIGNER_PRIVATE_KEY = SIGNER_KEY;
    process.env.NEXT_PUBLIC_REGISTRY_ADDRESS = privateKeyToAccount(REGISTRY_KEY).address;
    const subject = privateKeyToAccount(SUBJECT_KEY).address;

    const { e, c } = tap(7);
    const outcome = await verifyTap({ rockId: "42", e, c, subject });
    expect(outcome.body.verified).toBe(true);
    expect(outcome.body.attestation).toMatchObject({
      state: "SIGNED",
      signer: privateKeyToAccount(SIGNER_KEY).address,
      primaryType: "Attestation",
      typeString:
        "Attestation(uint256 rockId,bytes32 uidHash,uint32 counter,uint256 deadline,address subject)",
      message: { rockId: "42", counter: 7, subject },
    });
  });

  it("verifies without a subject, but the attestation is UNAVAILABLE", async () => {
    process.env.ATTESTATION_SIGNER_PRIVATE_KEY = SIGNER_KEY;
    process.env.NEXT_PUBLIC_REGISTRY_ADDRESS = privateKeyToAccount(REGISTRY_KEY).address;

    const { e, c } = tap(7);
    const outcome = await verifyTap({ rockId: "42", e, c });
    expect(outcome.body.verified).toBe(true);
    expect(outcome.body.attestation).toEqual({
      state: "UNAVAILABLE",
      reason: "missing_subject",
    });
  });

  it("never signs for a subject when the CMAC is wrong, however valid the subject", async () => {
    process.env.ATTESTATION_SIGNER_PRIVATE_KEY = SIGNER_KEY;
    process.env.NEXT_PUBLIC_REGISTRY_ADDRESS = privateKeyToAccount(REGISTRY_KEY).address;

    const outcome = await verifyTap({
      rockId: "42",
      e: tap(7).e,
      c: "DEADBEEFDEADBEEF",
      subject: privateKeyToAccount(SUBJECT_KEY).address,
    });
    expect(outcome.body.verified).toBe(false);
    expect(outcome.body.attestation).toBeUndefined();
  });

  it("never signs for a subject on a replay", async () => {
    process.env.ATTESTATION_SIGNER_PRIVATE_KEY = SIGNER_KEY;
    process.env.NEXT_PUBLIC_REGISTRY_ADDRESS = privateKeyToAccount(REGISTRY_KEY).address;
    const subject = privateKeyToAccount(SUBJECT_KEY).address;

    const { e, c } = tap(7);
    await verifyTap({ rockId: "42", e, c, subject });
    const replay = await verifyTap({ rockId: "42", e, c, subject });
    expect(replay.body.reason).toBe("stale_counter");
    expect(replay.body.attestation).toBeUndefined();
  });

  it("is never present on a rejected tap", async () => {
    const { e } = tap(7);
    const outcome = await verifyTap({ rockId: "1", e, c: "DEADBEEFDEADBEEF" });
    expect(outcome.body.attestation).toBeUndefined();
  });
});
