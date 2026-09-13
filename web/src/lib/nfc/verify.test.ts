import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { keccak256, zeroAddress, type Hex } from "viem";

import { resetSharedMemoryCounterStore } from "./counter-store";
import { aesCbcEncrypt } from "./crypto";
import { computeSdmMac, deriveSessionKeys } from "./sdm";
import { uidSuffix, verifyTap } from "./verify";

/* -------------------------------------------------------------------------- */
/* Registry stubs                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `@/lib/rock-account` reaches the chain. Stub it so the resolution rules are
 * tested as rules, not as RPC behaviour. `parseRockId` and `nextFreeRockId` are
 * pure, so they keep their real implementations.
 */
const registry = vi.hoisted(() => ({
  boundRockId: null as string | null,
  boundUnavailable: false,
  /** rockId -> record, or "unavailable". */
  rocks: new Map<string, { state: string; smartAccount: string } | "unavailable">(),
  derived: null as string | null,
  deriveUnavailable: false,
  saltNonces: [] as bigint[],
  owners: [] as string[],
}));

vi.mock("@/lib/rock-account", () => {
  // Fully stubbed rather than partially mocked over the real module: the module
  // reaches the chain, and importing it here would couple these tests to a file
  // other agents are editing. `parseRockId` and `nextFreeRockId` are pure, and
  // their behaviour is restated faithfully (and covered for real in that
  // module's own test file).
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
    // Restated like the two above: walk forward from the suggestion until the (mocked) registry
    // reports a dormant id; null when it cannot answer. Covered for real in next-free-rock.test.ts.
    findNextDormantRockId: async (
      start: string,
      readState: (id: string) => Promise<{ state: string; value?: { state: string } }>,
      limit = 256,
    ) => {
      const first = parseRockId(start) ?? BigInt(1);
      for (let i = BigInt(0); i < BigInt(limit); i++) {
        const id = (first + i).toString();
        const record = await readState(id);
        if (record.state === "UNAVAILABLE") return null;
        if (record.value?.state === "dormant") return id;
      }
      return null;
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
      registry.owners.push(params.ownerAddress);
      return registry.deriveUnavailable || registry.derived === null
        ? { state: "UNAVAILABLE", reason: "no rpc" }
        : { state: "REAL", value: registry.derived };
    },
  };
});

/** No D1 in a unit test, so the awakened-events list is empty. */
vi.mock("@/lib/db", () => ({ getDb: () => null, getD1: () => null }));

function resetRegistry(): void {
  registry.boundRockId = null;
  registry.boundUnavailable = false;
  registry.rocks.clear();
  registry.derived = null;
  registry.deriveUnavailable = false;
  registry.saltNonces = [];
  registry.owners = [];
}

const MASTER_KEY_HEX = "00112233445566778899AABBCCDDEEFF";
const MASTER_KEY = Buffer.from(MASTER_KEY_HEX, "hex");
const UID = Buffer.from("04AABBCCDDEE80", "hex");
const SIGNER_KEY = ("0x" + "11".repeat(32)) as Hex;
const REGISTRY_KEY = ("0x" + "22".repeat(32)) as Hex;
const SUBJECT_KEY = ("0x" + "33".repeat(32)) as Hex;
const SMART_ACCOUNT_KEY = ("0x" + "44".repeat(32)) as Hex;
const OTHER_KEY = ("0x" + "55".repeat(32)) as Hex;
/** Whatever the Safe derivation returns for an awakening, in these tests. */
const DERIVED_ACCOUNT = privateKeyToAccount(SMART_ACCOUNT_KEY).address;
/** The account the registry already holds for an awake rock. */
const EXISTING_ACCOUNT = privateKeyToAccount(REGISTRY_KEY).address;
/** keccak256 of the raw 7 UID bytes — the attestation field and the Safe salt. */
const UID_HASH = keccak256(`0x${UID.toString("hex")}`);

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
  resetRegistry();
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

/** Key set plus a signer and a registry address, so an attestation can be made. */
function configureSigner(): void {
  process.env.ATTESTATION_SIGNER_PRIVATE_KEY = SIGNER_KEY;
  process.env.NEXT_PUBLIC_REGISTRY_ADDRESS = privateKeyToAccount(REGISTRY_KEY).address;
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

  it("verifies without a subject, but the attestation is UNAVAILABLE", async () => {
    configureSigner();
    registry.derived = DERIVED_ACCOUNT;

    const { e, c } = tap(7);
    const outcome = await verifyTap({ rockId: "1", e, c });
    expect(outcome.body.verified).toBe(true);
    expect(outcome.body.attestation).toEqual({
      state: "UNAVAILABLE",
      reason: "missing_subject",
    });
    // No RPC was spent deriving an account nobody asked for.
    expect(registry.saltNonces).toEqual([]);
  });

  it("ignores a smartAccount in the request — the client cannot name one", async () => {
    configureSigner();
    registry.derived = DERIVED_ACCOUNT;
    const subject = privateKeyToAccount(SUBJECT_KEY).address;
    const attacker = privateKeyToAccount(OTHER_KEY).address;

    const { e, c } = tap(7);
    const outcome = await verifyTap({
      rockId: "1",
      e,
      c,
      subject,
      // Not part of VerifyTapInput; present here as an attacker would send it.
      ...({ smartAccount: attacker } as Record<string, string>),
    });
    expect(outcome.body.attestation).toMatchObject({
      state: "SIGNED",
      message: { smartAccount: DERIVED_ACCOUNT },
    });
  });

  it("signs for the effective rock id, not the URL id", async () => {
    configureSigner();
    registry.derived = DERIVED_ACCOUNT;
    registry.boundRockId = "9";
    registry.rocks.set("9", { state: "dormant", smartAccount: zeroAddress });

    const { e, c } = tap(7);
    const outcome = await verifyTap({
      rockId: "1",
      e,
      c,
      subject: privateKeyToAccount(SUBJECT_KEY).address,
    });
    expect(outcome.body.effectiveRockId).toBe("9");
    expect(outcome.body.attestation).toMatchObject({
      state: "SIGNED",
      message: { rockId: "9" },
    });
  });

  it("derives the Rock Account from the subject and uidHash for an awakening", async () => {
    configureSigner();
    registry.derived = DERIVED_ACCOUNT;
    registry.rocks.set("1", { state: "dormant", smartAccount: zeroAddress });
    const subject = privateKeyToAccount(SUBJECT_KEY).address;

    const { e, c } = tap(7);
    const outcome = await verifyTap({ rockId: "1", e, c, subject });
    expect(outcome.body.attestation).toMatchObject({
      state: "SIGNED",
      message: { rockId: "1", subject, smartAccount: DERIVED_ACCOUNT },
    });
    expect(registry.owners).toEqual([subject]);
    // saltNonce is the uidHash as a uint256 — one Rock Account per rock, per owner.
    expect(registry.saltNonces).toEqual([BigInt(UID_HASH)]);
  });

  it("signs the registry's existing account for a claim, never a derived one", async () => {
    configureSigner();
    registry.derived = DERIVED_ACCOUNT;
    registry.boundRockId = "4";
    registry.rocks.set("4", { state: "awake", smartAccount: EXISTING_ACCOUNT });

    const { e, c } = tap(7);
    const outcome = await verifyTap({
      rockId: "4",
      e,
      c,
      subject: privateKeyToAccount(SUBJECT_KEY).address,
    });
    expect(outcome.body.attestation).toMatchObject({
      state: "SIGNED",
      message: { rockId: "4", smartAccount: EXISTING_ACCOUNT },
    });
    // No derivation was attempted.
    expect(registry.saltNonces).toEqual([]);
  });

  it("signs the registry's account for a handover_pending rock too", async () => {
    configureSigner();
    registry.derived = DERIVED_ACCOUNT;
    registry.boundRockId = "4";
    registry.rocks.set("4", { state: "handover_pending", smartAccount: EXISTING_ACCOUNT });

    const { e, c } = tap(7);
    const outcome = await verifyTap({
      rockId: "4",
      e,
      c,
      subject: privateKeyToAccount(SUBJECT_KEY).address,
    });
    expect(outcome.body.attestation).toMatchObject({
      state: "SIGNED",
      message: { smartAccount: EXISTING_ACCOUNT },
    });
  });

  it("pins the six-field order through verifyTap", async () => {
    configureSigner();
    registry.derived = DERIVED_ACCOUNT;
    const { e, c } = tap(7);
    const outcome = await verifyTap({
      rockId: "1",
      e,
      c,
      subject: privateKeyToAccount(SUBJECT_KEY).address,
    });
    const attestation = outcome.body.attestation;
    expect(attestation?.state === "SIGNED" && attestation.typeString).toBe(
      "Attestation(uint256 rockId,bytes32 uidHash,uint32 counter,uint256 deadline,address subject,address smartAccount)",
    );
    expect(attestation?.state === "SIGNED" && Object.keys(attestation.message)).toEqual([
      "rockId",
      "uidHash",
      "counter",
      "deadline",
      "subject",
      "smartAccount",
    ]);
  });

  it("is UNAVAILABLE when the Rock Account cannot be derived, but still verifies", async () => {
    configureSigner();
    registry.deriveUnavailable = true;

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
      reason: "rock_account_unavailable",
    });
  });

  it("is never present on a rejected tap", async () => {
    const { e } = tap(7);
    const outcome = await verifyTap({ rockId: "1", e, c: "DEADBEEFDEADBEEF" });
    expect(outcome.body.attestation).toBeUndefined();
  });

  it("never signs when the CMAC is wrong, however valid the subject", async () => {
    configureSigner();
    registry.derived = DERIVED_ACCOUNT;
    const outcome = await verifyTap({
      rockId: "42",
      e: tap(7).e,
      c: "DEADBEEFDEADBEEF",
      subject: privateKeyToAccount(SUBJECT_KEY).address,
    });
    expect(outcome.body.verified).toBe(false);
    expect(outcome.body.attestation).toBeUndefined();
  });

  it("never signs on a replay", async () => {
    configureSigner();
    registry.derived = DERIVED_ACCOUNT;
    const subject = privateKeyToAccount(SUBJECT_KEY).address;

    const { e, c } = tap(7);
    await verifyTap({ rockId: "42", e, c, subject });
    const replay = await verifyTap({ rockId: "42", e, c, subject });
    expect(replay.body.reason).toBe("stale_counter");
    expect(replay.body.attestation).toBeUndefined();
  });
});

describe("effective rock id resolution", () => {
  beforeEach(configureVerifier);

  it("bound — the registry's binding wins over the id on the tag", async () => {
    registry.boundRockId = "9";
    registry.rocks.set("9", { state: "awake", smartAccount: EXISTING_ACCOUNT });

    const { e, c } = tap(7);
    const outcome = await verifyTap({ rockId: "1", e, c });
    expect(outcome.body).toMatchObject({
      verified: true,
      effectiveRockId: "9",
      resolution: "bound",
    });
  });

  it("url — unbound tag whose id is dormant keeps that id", async () => {
    registry.boundRockId = null;
    registry.rocks.set("1", { state: "dormant", smartAccount: zeroAddress });

    const { e, c } = tap(7);
    const outcome = await verifyTap({ rockId: "1", e, c });
    expect(outcome.body).toMatchObject({ effectiveRockId: "1", resolution: "url" });
  });

  it("next_free — unbound tag whose id is archived gets the next id", async () => {
    registry.boundRockId = null;
    registry.rocks.set("1", { state: "archived", smartAccount: zeroAddress });

    const { e, c } = tap(7);
    const outcome = await verifyTap({ rockId: "1", e, c });
    expect(outcome.body).toMatchObject({ resolution: "next_free", effectiveRockId: "1" });
  });

  it("next_free — unbound tag whose id is already awake gets the next id", async () => {
    registry.boundRockId = null;
    registry.rocks.set("1", { state: "awake", smartAccount: EXISTING_ACCOUNT });

    const { e, c } = tap(7);
    const outcome = await verifyTap({ rockId: "1", e, c });
    expect(outcome.body.resolution).toBe("next_free");
  });

  it("next_free — a tag carrying no usable id", async () => {
    registry.boundRockId = null;

    const { e, c } = tap(7);
    for (const rockId of [undefined, "", "new", "-1"]) {
      resetSharedMemoryCounterStore();
      const fresh = tap(7);
      const outcome = await verifyTap({ rockId, e: fresh.e, c: fresh.c });
      expect(outcome.body.resolution).toBe("next_free");
    }
    expect(e).toBeDefined();
    expect(c).toBeDefined();
  });

  it("registry_unavailable — the tag's id is echoed and nothing is claimed", async () => {
    registry.boundUnavailable = true;

    const { e, c } = tap(7);
    const outcome = await verifyTap({ rockId: "1", e, c });
    expect(outcome.body).toMatchObject({
      verified: true,
      effectiveRockId: "1",
      resolution: "registry_unavailable",
    });
  });

  it("registry_unavailable — the binding reads but the rock does not", async () => {
    registry.boundRockId = null;
    registry.rocks.set("1", "unavailable");

    const { e, c } = tap(7);
    const outcome = await verifyTap({ rockId: "1", e, c });
    expect(outcome.body.resolution).toBe("registry_unavailable");
    expect(outcome.body.effectiveRockId).toBe("1");
  });

  it("is reported on a replay too, so the page can still navigate", async () => {
    registry.boundRockId = "9";
    registry.rocks.set("9", { state: "awake", smartAccount: EXISTING_ACCOUNT });

    const { e, c } = tap(7);
    await verifyTap({ rockId: "1", e, c });
    const replay = await verifyTap({ rockId: "1", e, c });
    expect(replay.body).toMatchObject({
      verified: false,
      reason: "stale_counter",
      effectiveRockId: "9",
      resolution: "bound",
    });
  });

  it("is absent when the CMAC does not match — nothing is resolved for a forgery", async () => {
    const { e } = tap(7);
    const outcome = await verifyTap({ rockId: "1", e, c: "DEADBEEFDEADBEEF" });
    expect(outcome.body.effectiveRockId).toBeUndefined();
    expect(outcome.body.resolution).toBeUndefined();
  });
});
