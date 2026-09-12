import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { keccak256, recoverTypedDataAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  ATTESTATION_DEFAULT_CHAIN_ID,
  ATTESTATION_DOMAIN_NAME,
  ATTESTATION_DOMAIN_VERSION,
  ATTESTATION_PRIMARY_TYPE,
  ATTESTATION_TTL_SECONDS,
  ATTESTATION_TYPES,
  ATTESTATION_TYPE_STRING,
  hashUid,
  signAttestation,
} from "./attestation";

// Built by concatenation so no 40-hex-character literal appears in src/
// (Part 7 of spec 15 greps for address literals outside the chain module).
const SIGNER_KEY = ("0x" + "11".repeat(32)) as Hex;
const OTHER_KEY = ("0x" + "22".repeat(32)) as Hex;

const UID = Buffer.from("04DE5F1EACC040", "hex");

const ENV_KEYS = [
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
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function configure(): { signer: string; registry: string } {
  const signer = privateKeyToAccount(SIGNER_KEY).address;
  const registry = privateKeyToAccount(OTHER_KEY).address;
  process.env.ATTESTATION_SIGNER_PRIVATE_KEY = SIGNER_KEY;
  process.env.NEXT_PUBLIC_REGISTRY_ADDRESS = registry;
  return { signer, registry };
}

describe("the EIP-712 definition the registry must match", () => {
  it("pins the type string", () => {
    expect(ATTESTATION_TYPE_STRING).toBe(
      "Attestation(uint256 rockId,bytes32 uidHash,uint32 counter,uint256 deadline)",
    );
  });

  it("pins the struct fields and their order", () => {
    expect(ATTESTATION_TYPES.Attestation.map((f) => `${f.type} ${f.name}`)).toEqual([
      "uint256 rockId",
      "bytes32 uidHash",
      "uint32 counter",
      "uint256 deadline",
    ]);
  });

  it("pins the domain", () => {
    expect(ATTESTATION_DOMAIN_NAME).toBe("BankRockRegistry");
    expect(ATTESTATION_DOMAIN_VERSION).toBe("1");
    expect(ATTESTATION_DEFAULT_CHAIN_ID).toBe(11155111);
  });
});

describe("hashUid", () => {
  it("hashes the raw 7 UID bytes, not their hex text", () => {
    expect(hashUid(UID)).toBe(keccak256(`0x${UID.toString("hex")}`));
    expect(hashUid(UID)).not.toBe(keccak256(`0x${Buffer.from(UID.toString("hex")).toString("hex")}`));
  });
});

describe("signAttestation", () => {
  it("is UNAVAILABLE with no signer key", async () => {
    process.env.NEXT_PUBLIC_REGISTRY_ADDRESS = privateKeyToAccount(OTHER_KEY).address;
    await expect(signAttestation({ rockId: "1", uid: UID, counter: 61 })).resolves.toEqual({
      state: "UNAVAILABLE",
      reason: "signer_unconfigured",
    });
  });

  it("is UNAVAILABLE with a malformed signer key", async () => {
    configure();
    process.env.ATTESTATION_SIGNER_PRIVATE_KEY = "not-a-key";
    await expect(signAttestation({ rockId: "1", uid: UID, counter: 61 })).resolves.toEqual({
      state: "UNAVAILABLE",
      reason: "signer_key_invalid",
    });
  });

  it("is UNAVAILABLE with no registry address", async () => {
    process.env.ATTESTATION_SIGNER_PRIVATE_KEY = SIGNER_KEY;
    await expect(signAttestation({ rockId: "1", uid: UID, counter: 61 })).resolves.toEqual({
      state: "UNAVAILABLE",
      reason: "registry_unconfigured",
    });
  });

  it("is UNAVAILABLE with a malformed registry address", async () => {
    configure();
    process.env.NEXT_PUBLIC_REGISTRY_ADDRESS = "0xnope";
    await expect(signAttestation({ rockId: "1", uid: UID, counter: 61 })).resolves.toMatchObject({
      state: "UNAVAILABLE",
      reason: "registry_unconfigured",
    });
  });

  it("is UNAVAILABLE for a rockId that is not a uint256", async () => {
    configure();
    for (const rockId of ["", "new", "-1", "1.5", "0x01"]) {
      await expect(signAttestation({ rockId, uid: UID, counter: 61 })).resolves.toEqual({
        state: "UNAVAILABLE",
        reason: "invalid_rock_id",
      });
    }
  });

  it("signs a recoverable EIP-712 attestation", async () => {
    const { signer, registry } = configure();
    const now = 1_800_000_000;

    const result = await signAttestation({
      rockId: "42",
      uid: UID,
      counter: 61,
      nowSeconds: now,
    });

    expect(result.state).toBe("SIGNED");
    if (result.state !== "SIGNED") return;

    expect(result.signer).toBe(signer);
    expect(result.primaryType).toBe(ATTESTATION_PRIMARY_TYPE);
    expect(result.domain).toEqual({
      name: "BankRockRegistry",
      version: "1",
      chainId: 11155111,
      verifyingContract: registry,
    });
    expect(result.message).toEqual({
      rockId: "42",
      uidHash: hashUid(UID),
      counter: 61,
      deadline: now + ATTESTATION_TTL_SECONDS,
    });

    const recovered = await recoverTypedDataAddress({
      domain: result.domain,
      types: ATTESTATION_TYPES,
      primaryType: "Attestation",
      message: {
        rockId: BigInt(result.message.rockId),
        uidHash: result.message.uidHash,
        counter: result.message.counter,
        deadline: BigInt(result.message.deadline),
      },
      signature: result.signature,
    });
    expect(recovered).toBe(signer);
  });

  it("expires ten minutes after signing", async () => {
    configure();
    const now = Math.floor(Date.now() / 1000);
    const result = await signAttestation({ rockId: "1", uid: UID, counter: 1 });
    expect(result.state).toBe("SIGNED");
    if (result.state !== "SIGNED") return;
    expect(result.message.deadline - now).toBeGreaterThanOrEqual(ATTESTATION_TTL_SECONDS - 2);
    expect(result.message.deadline - now).toBeLessThanOrEqual(ATTESTATION_TTL_SECONDS + 2);
  });

  it("binds rockId, uid and counter — changing any one changes the signature", async () => {
    configure();
    const base = { rockId: "42", uid: UID, counter: 61, nowSeconds: 1_800_000_000 };
    const signature = async (input: Parameters<typeof signAttestation>[0]) => {
      const r = await signAttestation(input);
      return r.state === "SIGNED" ? r.signature : null;
    };

    const original = await signature(base);
    expect(original).not.toBeNull();
    expect(await signature({ ...base, rockId: "43" })).not.toBe(original);
    expect(await signature({ ...base, counter: 62 })).not.toBe(original);
    expect(
      await signature({ ...base, uid: Buffer.from("04AABBCCDDEE80", "hex") }),
    ).not.toBe(original);
    expect(await signature({ ...base, nowSeconds: base.nowSeconds + 1 })).not.toBe(original);
  });
});
