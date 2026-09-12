import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import type { SignedAttestation } from "./rock-account";

/**
 * The attestation check the claim relayer depends on.
 *
 * `POST /api/rocks/[id]/claim` sends a transaction from a funded operator key on the strength of
 * this check alone, so every way it can be fooled is a way to spend the relayer's gas — and, if
 * the registry were to accept the forged attestation, to move someone's rock. These cases are
 * that check's contract.
 */

// Addresses are built rather than written out, so the repository-wide "no address literals
// outside lib/chain" check (D-015, spec 15 Part 7) stays true of the test suite too.
function sampleAddress(digit: string): `0x${string}` {
  return `0x${digit.repeat(40)}`;
}

const SIGNER_KEY = `0x${"11".repeat(32)}` as const;
const OTHER_KEY = `0x${"22".repeat(32)}` as const;
const REGISTRY = sampleAddress("4");
const SUBJECT = sampleAddress("5");
const SAFE = sampleAddress("8");
const UID_HASH = `0x${"ab".repeat(32)}` as const;

const TYPES = {
  Attestation: [
    { name: "rockId", type: "uint256" },
    { name: "uidHash", type: "bytes32" },
    { name: "counter", type: "uint32" },
    { name: "deadline", type: "uint256" },
    { name: "subject", type: "address" },
    { name: "smartAccount", type: "address" },
  ],
} as const;

function futureDeadline(): number {
  return Math.floor(Date.now() / 1000) + 600;
}

async function sign(options: {
  key?: `0x${string}`;
  rockId?: string;
  deadline?: number;
  verifyingContract?: `0x${string}`;
  chainId?: number;
  subject?: `0x${string}`;
  smartAccount?: `0x${string}`;
}): Promise<SignedAttestation> {
  const account = privateKeyToAccount(options.key ?? SIGNER_KEY);
  const message = {
    rockId: options.rockId ?? "7",
    uidHash: UID_HASH,
    counter: 12,
    deadline: options.deadline ?? futureDeadline(),
    subject: options.subject ?? SUBJECT,
    smartAccount: options.smartAccount ?? SAFE,
  };

  const signature = await account.signTypedData({
    domain: {
      name: "BankRockRegistry",
      version: "1",
      chainId: options.chainId ?? 11155111,
      verifyingContract: options.verifyingContract ?? REGISTRY,
    },
    types: TYPES,
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

  return {
    state: "SIGNED",
    signature,
    signer: account.address,
    primaryType: "Attestation",
    typeString:
        "Attestation(uint256 rockId,bytes32 uidHash,uint32 counter,uint256 deadline,address subject,address smartAccount)",
    domain: {
      name: "BankRockRegistry",
      version: "1",
      chainId: options.chainId ?? 11155111,
      verifyingContract: options.verifyingContract ?? REGISTRY,
    },
    message,
  };
}

async function loadServer(env: Record<string, string | undefined> = {}) {
  process.env.NEXT_PUBLIC_REGISTRY_ADDRESS = REGISTRY;
  process.env.ATTESTATION_SIGNER_PRIVATE_KEY = SIGNER_KEY;
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
  return import("./rock-account.server");
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_REGISTRY_ADDRESS;
  delete process.env.ATTESTATION_SIGNER_PRIVATE_KEY;
  delete process.env.RELAYER_PRIVATE_KEY;
  vi.resetModules();
});

describe("verifyAttestation", () => {
  it("accepts an attestation signed by this deployment's attester", async () => {
    const { verifyAttestation } = await loadServer();
    const result = await verifyAttestation(await sign({}), "7");
    expect(result.state).toBe("REAL");
    if (result.state === "REAL") {
      expect(result.value.subject).toBe(SUBJECT);
      expect(result.value.counter).toBe(12);
    }
  });

  it("rejects a signature from any other key", async () => {
    const { verifyAttestation } = await loadServer();
    const result = await verifyAttestation(await sign({ key: OTHER_KEY }), "7");
    expect(result.state).toBe("UNAVAILABLE");
    if (result.state === "UNAVAILABLE") {
      expect(result.reason).toMatch(/not signed by this deployment/i);
    }
  });

  it("rejects an attestation whose Rock Account was changed after signing", async () => {
    const { verifyAttestation } = await loadServer();
    const attestation = await sign({});
    const tampered: SignedAttestation = {
      ...attestation,
      message: { ...attestation.message, smartAccount: sampleAddress("9") },
    };
    expect((await verifyAttestation(tampered, "7")).state).toBe("UNAVAILABLE");
  });

  it("rejects a tampered message, because the signature no longer recovers", async () => {
    const { verifyAttestation } = await loadServer();
    const attestation = await sign({});
    // Move the rock to someone else after signing.
    const tampered: SignedAttestation = {
      ...attestation,
      message: { ...attestation.message, subject: sampleAddress("6") },
    };
    const result = await verifyAttestation(tampered, "7");
    expect(result.state).toBe("UNAVAILABLE");
  });

  it("rejects a signature that is not a signature at all", async () => {
    const { verifyAttestation } = await loadServer();
    const attestation = await sign({});
    const result = await verifyAttestation({ ...attestation, signature: "0xdeadbeef" }, "7");
    expect(result.state).toBe("UNAVAILABLE");
  });

  it("rejects an attestation for a different rock", async () => {
    const { verifyAttestation } = await loadServer();
    const result = await verifyAttestation(await sign({ rockId: "9" }), "7");
    expect(result.state).toBe("UNAVAILABLE");
    if (result.state === "UNAVAILABLE") {
      expect(result.reason).toMatch(/different rock/i);
    }
  });

  it("rejects an expired attestation", async () => {
    const { verifyAttestation } = await loadServer();
    const expired = await sign({ deadline: Math.floor(Date.now() / 1000) - 1 });
    const result = await verifyAttestation(expired, "7");
    expect(result.state).toBe("UNAVAILABLE");
    if (result.state === "UNAVAILABLE") {
      expect(result.reason).toMatch(/expired/i);
    }
  });

  it("rejects a signature made for a different verifying contract", async () => {
    // The client sends its own `domain`; the server must ignore it and rebuild its own, or a
    // signature made for another deployment would be accepted here.
    const { verifyAttestation } = await loadServer();
    const elsewhere = await sign({
      verifyingContract: sampleAddress("7"),
    });
    const result = await verifyAttestation(elsewhere, "7");
    expect(result.state).toBe("UNAVAILABLE");
  });

  it("rejects a signature made for a different chain", async () => {
    const { verifyAttestation } = await loadServer();
    const result = await verifyAttestation(await sign({ chainId: 1 }), "7");
    expect(result.state).toBe("UNAVAILABLE");
  });

  it("is UNAVAILABLE, never 'valid', when no attester key is configured (D-017)", async () => {
    const attestation = await sign({});
    const { verifyAttestation } = await loadServer({
      ATTESTATION_SIGNER_PRIVATE_KEY: undefined,
    });
    const result = await verifyAttestation(attestation, "7");
    expect(result.state).toBe("UNAVAILABLE");
    if (result.state === "UNAVAILABLE") {
      expect(result.reason).toMatch(/ATTESTATION_SIGNER_PRIVATE_KEY/);
    }
  });
});

describe("relayerAccount", () => {
  it("is UNAVAILABLE when RELAYER_PRIVATE_KEY is unset", async () => {
    const { relayerAccount } = await loadServer({ RELAYER_PRIVATE_KEY: undefined });
    const result = relayerAccount();
    expect(result.state).toBe("UNAVAILABLE");
    if (result.state === "UNAVAILABLE") {
      expect(result.reason).toMatch(/RELAYER_PRIVATE_KEY/);
    }
  });

  it("is UNAVAILABLE for a malformed key rather than throwing at the call site", async () => {
    const { relayerAccount } = await loadServer({ RELAYER_PRIVATE_KEY: "not-a-key" });
    expect(relayerAccount().state).toBe("UNAVAILABLE");
  });

  it("is REAL for a well-formed key", async () => {
    const { relayerAccount } = await loadServer({ RELAYER_PRIVATE_KEY: OTHER_KEY });
    expect(relayerAccount().state).toBe("REAL");
  });

  it("submits nothing when the relayer is unconfigured", async () => {
    const { submitClaimHandover } = await loadServer({ RELAYER_PRIVATE_KEY: undefined });
    const result = await submitClaimHandover("7", await sign({}));
    expect(result.state).toBe("UNAVAILABLE");
  });
});
