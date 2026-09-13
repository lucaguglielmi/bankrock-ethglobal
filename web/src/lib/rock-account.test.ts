import { describe, expect, it } from "vitest";
import { decodeFunctionData, zeroAddress } from "viem";
import { BANK_ROCK_REGISTRY_ABI } from "@/lib/chain/abi/registry";
import {
  checkAwakenAttestation,
  encodeArchiveRock,
  encodeCancelHandover,
  encodeClearLost,
  encodeMarkLost,
  mapRockRecord,
  rockAccountSaltFor,
  messageHashFor,
  nextFreeRockId,
  parseRockId,
  isSignedAttestation,
  ZERO_MESSAGE_HASH,
  type GetRockResult,
} from "./rock-account";

// Addresses are built rather than written out, so the repository-wide "no address literals
// outside lib/chain" check (D-015, spec 15 Part 7) stays true of the test suite too.
function sampleAddress(digit: string): `0x${string}` {
  return `0x${digit.repeat(40)}`;
}

/** Same idea for a 32-byte hash: built, never written out as a hex literal. */
function sampleHash(pair: string): `0x${string}` {
  return `0x${pair.repeat(32)}`;
}

const OWNER = sampleAddress("1");
const SAFE = sampleAddress("2");
const RECIPIENT = sampleAddress("3");
const UID_HASH = sampleHash("ab");
const MESSAGE_HASH = sampleHash("cd");

function result(overrides: Partial<{
  owner: string;
  smartAccount: string;
  uidHash: string;
  state: number;
  lost: boolean;
  handover: {
    recipient: string;
    expiresAt: bigint;
    initiatedAt: bigint;
    initiatedBy: string;
    messageHash: string;
  };
}> = {}): GetRockResult {
  return [
    (overrides.owner ?? OWNER) as `0x${string}`,
    (overrides.smartAccount ?? SAFE) as `0x${string}`,
    (overrides.uidHash ?? UID_HASH) as `0x${string}`,
    overrides.state ?? 1,
    overrides.lost ?? false,
    (overrides.handover ?? {
      recipient: zeroAddress,
      expiresAt: BigInt(0),
      initiatedAt: BigInt(0),
      initiatedBy: zeroAddress,
      messageHash: ZERO_MESSAGE_HASH,
    }) as GetRockResult[5],
  ] as GetRockResult;
}

describe("mapRockRecord - registry state", () => {
  it("maps each enum value to its state name", () => {
    expect(mapRockRecord("1", result({ state: 0, owner: zeroAddress })).state).toBe("dormant");
    expect(mapRockRecord("1", result({ state: 1 })).state).toBe("awake");
    expect(mapRockRecord("1", result({ state: 2 })).state).toBe("handover_pending");
    expect(mapRockRecord("1", result({ state: 3 })).state).toBe("archived");
  });

  it("reads an ownerless record as dormant whatever the enum says", () => {
    expect(mapRockRecord("1", result({ state: 1, owner: zeroAddress })).state).toBe("dormant");
  });

  it("falls back to dormant for an unknown enum value rather than inventing a state", () => {
    expect(mapRockRecord("1", result({ state: 9 })).state).toBe("dormant");
  });

  it("carries the owner, account and uid hash through unchanged", () => {
    const record = mapRockRecord("42", result({ lost: true }));
    expect(record).toMatchObject({
      rockId: "42",
      owner: OWNER,
      smartAccount: SAFE,
      uidHash: UID_HASH,
      lost: true,
    });
  });
});

describe("mapRockRecord - handover", () => {
  it("is null unless the rock is handover_pending", () => {
    expect(mapRockRecord("1", result({ state: 1 })).handover).toBeNull();
    expect(mapRockRecord("1", result({ state: 3 })).handover).toBeNull();
  });

  it("is null for an expired handover, which getRock reports as awake", () => {
    // An expired gift is claimable by nobody, so it is not an outstanding handover.
    const expired = mapRockRecord(
      "1",
      result({
        state: 1,
        handover: {
          recipient: RECIPIENT,
          expiresAt: BigInt(1),
          initiatedAt: BigInt(0),
          initiatedBy: OWNER,
          messageHash: MESSAGE_HASH,
        },
      }),
    );
    expect(expired.handover).toBeNull();
  });

  it("reports a named recipient", () => {
    const record = mapRockRecord(
      "1",
      result({
        state: 2,
        handover: {
          recipient: RECIPIENT,
          expiresAt: BigInt(1800000000),
          initiatedAt: BigInt(1700000000),
          initiatedBy: OWNER,
          messageHash: MESSAGE_HASH,
        },
      }),
    );
    expect(record.handover).toEqual({
      recipient: RECIPIENT,
      expiresAt: 1800000000,
      initiatedAt: 1700000000,
      initiatedBy: OWNER,
      messageHash: MESSAGE_HASH,
    });
  });

  it("reports an open handover as a null recipient, not as the zero address", () => {
    const record = mapRockRecord(
      "1",
      result({
        state: 2,
        handover: {
          recipient: zeroAddress,
          expiresAt: BigInt(1800000000),
          initiatedAt: BigInt(1700000000),
          initiatedBy: OWNER,
          messageHash: ZERO_MESSAGE_HASH,
        },
      }),
    );
    expect(record.handover?.recipient).toBeNull();
  });
});

describe("parseRockId", () => {
  it("accepts positive integers only - rock id 0 does not exist on chain", () => {
    expect(parseRockId("1")).toBe(BigInt(1));
    expect(parseRockId(" 42 ")).toBe(BigInt(42));
    expect(parseRockId("0")).toBeNull();
    expect(parseRockId("-1")).toBeNull();
    expect(parseRockId("1.5")).toBeNull();
    expect(parseRockId("new")).toBeNull();
    expect(parseRockId("1; DROP TABLE rocks")).toBeNull();
  });
});

describe("nextFreeRockId", () => {
  it("is 1 when nothing has been awakened", () => {
    expect(nextFreeRockId([])).toBe("1");
  });

  it("is one above the highest id ever awakened", () => {
    expect(nextFreeRockId(["1", "2", "3"])).toBe("4");
    expect(nextFreeRockId(["7", "2"])).toBe("8");
  });

  it("never reuses a gap: an archived id keeps its place in the history", () => {
    expect(nextFreeRockId(["1", "5"])).toBe("6");
  });

  it("ignores unusable ids rather than guessing", () => {
    expect(nextFreeRockId(["", "abc", "-3", "4"])).toBe("5");
  });

  it("handles ids beyond Number.MAX_SAFE_INTEGER", () => {
    const huge = "9007199254740993";
    expect(nextFreeRockId([huge])).toBe("9007199254740994");
  });
});

describe("messageHashFor", () => {
  it("is the zero hash for no message, so nothing is committed on chain", () => {
    expect(messageHashFor()).toBe(ZERO_MESSAGE_HASH);
    expect(messageHashFor("")).toBe(ZERO_MESSAGE_HASH);
    expect(messageHashFor("   ")).toBe(ZERO_MESSAGE_HASH);
  });

  it("is keccak256 of the trimmed message, and is stable", () => {
    const hash = messageHashFor("Happy birthday");
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(messageHashFor("  Happy birthday  ")).toBe(hash);
    expect(messageHashFor("Happy birthday!")).not.toBe(hash);
  });
});

describe("isSignedAttestation", () => {
  const valid = {
    state: "SIGNED",
    signature: `0x${"11".repeat(65)}`,
    signer: OWNER,
    primaryType: "Attestation",
    typeString: "Attestation(...)",
    domain: { name: "BankRockRegistry", version: "1", chainId: 11155111, verifyingContract: SAFE },
    message: {
      rockId: "1",
      uidHash: UID_HASH,
      counter: 7,
      deadline: 1800000000,
      subject: OWNER,
      smartAccount: SAFE,
    },
  };

  it("accepts a well-formed signed attestation", () => {
    expect(isSignedAttestation(valid)).toBe(true);
  });

  it("rejects anything that is not a signed one", () => {
    expect(isSignedAttestation(null)).toBe(false);
    expect(isSignedAttestation({ ...valid, state: "UNAVAILABLE" })).toBe(false);
    expect(isSignedAttestation({ ...valid, signature: "not-hex" })).toBe(false);
    expect(isSignedAttestation({ ...valid, message: undefined })).toBe(false);
    expect(
      isSignedAttestation({ ...valid, message: { ...valid.message, subject: undefined } }),
    ).toBe(false);
    expect(
      isSignedAttestation({ ...valid, message: { ...valid.message, counter: "7" } }),
    ).toBe(false);
    expect(
      isSignedAttestation({ ...valid, message: { ...valid.message, smartAccount: undefined } }),
    ).toBe(false);
  });
});

describe("checkAwakenAttestation", () => {
  const attestation = {
    state: "SIGNED",
    signature: `0x${"11".repeat(65)}`,
    signer: OWNER,
    primaryType: "Attestation",
    typeString: "Attestation(...)",
    domain: { name: "BankRockRegistry", version: "1", chainId: 11155111, verifyingContract: SAFE },
    message: {
      rockId: "7",
      uidHash: UID_HASH,
      counter: 3,
      deadline: Math.floor(Date.now() / 1000) + 600,
      subject: OWNER,
      smartAccount: SAFE,
    },
  } as const;

  const params = { signedInAddress: OWNER, smartAccount: SAFE, rockId: "7" };

  it("accepts a tap that authorises this wallet, this account and this rock", () => {
    expect(checkAwakenAttestation(attestation, params).state).toBe("REAL");
  });

  it("is case-insensitive about address checksums", () => {
    expect(
      checkAwakenAttestation(attestation, {
        ...params,
        signedInAddress: OWNER.toUpperCase().replace("0X", "0x"),
        smartAccount: SAFE.toUpperCase().replace("0X", "0x"),
      }).state,
    ).toBe("REAL");
  });

  it("refuses a tap that credits a different wallet", () => {
    const result = checkAwakenAttestation(attestation, {
      ...params,
      signedInAddress: RECIPIENT,
    });
    expect(result.state).toBe("UNAVAILABLE");
    if (result.state === "UNAVAILABLE") {
      expect(result.reason).toMatch(/different wallet/i);
    }
  });

  it("refuses a tap that names a different Rock Account", () => {
    const result = checkAwakenAttestation(attestation, { ...params, smartAccount: RECIPIENT });
    expect(result.state).toBe("UNAVAILABLE");
    if (result.state === "UNAVAILABLE") {
      expect(result.reason).toMatch(/different Rock Account/i);
    }
  });

  it("refuses a tap verified for another rock", () => {
    const result = checkAwakenAttestation(attestation, { ...params, rockId: "8" });
    expect(result.state).toBe("UNAVAILABLE");
    if (result.state === "UNAVAILABLE") {
      expect(result.reason).toMatch(/different rock/i);
    }
  });

  it("refuses an expired tap", () => {
    const stale = {
      ...attestation,
      message: { ...attestation.message, deadline: Math.floor(Date.now() / 1000) - 1 },
    };
    expect(checkAwakenAttestation(stale, params).state).toBe("UNAVAILABLE");
  });

  it("refuses when signed out or before the Rock Account address is known", () => {
    expect(
      checkAwakenAttestation(attestation, { ...params, signedInAddress: undefined }).state,
    ).toBe("UNAVAILABLE");
    expect(checkAwakenAttestation(attestation, { ...params, smartAccount: undefined }).state).toBe(
      "UNAVAILABLE",
    );
  });

  it("refuses an unusable rock id rather than coercing it", () => {
    expect(checkAwakenAttestation(attestation, { ...params, rockId: "new" }).state).toBe(
      "UNAVAILABLE",
    );
  });
});

describe("rockAccountSaltFor", () => {
  it("is the tag hash read as a uint256, so one tag means one account per owner", () => {
    const uidHash = sampleHash("ab");
    expect(rockAccountSaltFor(uidHash)).toBe(BigInt(uidHash));
  });

  it("gives different tags different salts, so two rocks never share an account", () => {
    const a = rockAccountSaltFor(sampleHash("11"));
    const b = rockAccountSaltFor(sampleHash("22"));
    expect(a).not.toBe(b);
  });

  it("is stable: the same tag always derives the same account", () => {
    const uidHash = sampleHash("cd");
    expect(rockAccountSaltFor(uidHash)).toBe(rockAccountSaltFor(uidHash));
  });

  it("is case-insensitive about the hash's hex digits", () => {
    expect(rockAccountSaltFor(sampleHash("AB"))).toBe(rockAccountSaltFor(sampleHash("ab")));
  });

  it("throws on a malformed hash rather than salting with a coerced value", () => {
    // A wrong salt is a different account, and that surfaces much later as "your rock is empty".
    expect(() => rockAccountSaltFor("0x1234" as `0x${string}`)).toThrow(/32-byte/);
    expect(() => rockAccountSaltFor("" as `0x${string}`)).toThrow();
    expect(() => rockAccountSaltFor(sampleHash("zz"))).toThrow();
  });

  it("accepts the zero hash as a value, which no real tag produces", () => {
    // The registry rejects a zero uidHash (`InvalidUidHash`), so this never reaches a transaction.
    expect(rockAccountSaltFor(`0x${"0".repeat(64)}`)).toBe(BigInt(0));
  });
});

describe("lifecycle encoders", () => {
  function decode(data: `0x${string}`) {
    return decodeFunctionData({ abi: BANK_ROCK_REGISTRY_ABI, data });
  }

  it("encodes markLost and clearLost for the rock, and nothing else (Flow F)", () => {
    expect(decode(encodeMarkLost(BigInt(7)))).toMatchObject({
      functionName: "markLost",
      args: [BigInt(7)],
    });
    expect(decode(encodeClearLost(BigInt(7)))).toMatchObject({
      functionName: "clearLost",
      args: [BigInt(7)],
    });
  });

  it("keeps the other single-argument lifecycle calls distinct", () => {
    const names = [
      decode(encodeMarkLost(BigInt(1))).functionName,
      decode(encodeClearLost(BigInt(1))).functionName,
      decode(encodeCancelHandover(BigInt(1))).functionName,
      decode(encodeArchiveRock(BigInt(1))).functionName,
    ];
    expect(new Set(names).size).toBe(4);
  });
});
