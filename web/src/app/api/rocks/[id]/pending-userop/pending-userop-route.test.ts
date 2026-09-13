import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `POST /api/rocks/[id]/pending-userop` - who may replace or discard a pre-signed hand-over.
 *
 * Audit P-5: the route checked that the caller was signed in, not that they were the creator. A
 * Privy token proves an account and Privy sign-up is open, so any stranger could discard another
 * rock's pre-signed Safe owner swap - and the recipient would then get the registry claim and
 * never the Rock Account. These cases pin the ownership rule.
 *
 * P-5 left the other half open, which the security review found: first-writer-wins plus a public
 * `sender` check meant a stranger could *store* a row of nonsense first, take the creator DID, and
 * lock the real giver out of their own gift. The `simulateSignedUserOp` cases below are that half
 * - the bundler is asked whether the operation validates before any row is written.
 */

const simulateSignedUserOp = vi.fn();

vi.mock("@/lib/rock-account.server", () => ({
  simulateSignedUserOp: (...args: unknown[]) => simulateSignedUserOp(...args),
}));

const CREATOR = "did:privy:creator";
const STRANGER = "did:privy:stranger";
const SAFE = "0x2222222222222222222222222222222222222222";
const RECIPIENT = "0x3333333333333333333333333333333333333333";
/** The rock's registered owner: the giver, and still the Safe's only owner at this point. */
const GIVER = "0x4444444444444444444444444444444444444444";
const STRANGER_WALLET = "0x5555555555555555555555555555555555555555";

/** `swapOwner(SENTINEL, giver, recipient)`, as the Safe module wraps it into a UserOperation. */
function swapOwnerCallData(oldOwner = GIVER, newOwner = RECIPIENT) {
  const selector = "e318b52b";
  const word = (address: string) => address.slice(2).toLowerCase().padStart(64, "0");
  const sentinel = `${"0".repeat(63)}1`;
  return `0x${selector}${sentinel}${word(oldOwner)}${word(newOwner)}`;
}

let identity = CREATOR;
let storedRow: Record<string, unknown> | null = null;
const deleted = vi.fn();
const inserted = vi.fn();

vi.mock("@/lib/auth/privy", () => ({
  requirePrivyIdentity: async () => ({ ok: true, identity: { did: identity } }),
}));

vi.mock("@/lib/rate-limit", () => ({
  consumeIpRateLimit: async () => ({ allowed: true, enforced: true, remaining: 29 }),
  requireIpRateLimit: async () => ({ ok: true }),
}));

vi.mock("@/lib/rock-account", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rock-account")>("@/lib/rock-account");
  return {
    ...actual,
    readRock: async () => ({
      state: "REAL",
      value: {
        rockId: "1",
        owner: GIVER,
        smartAccount: SAFE,
        uidHash: `0x${"ab".repeat(32)}`,
        state: "handover_pending",
        lost: false,
        handover: null,
      },
    }),
  };
});

/** The two chained shapes this route uses, and nothing else. */
vi.mock("@/lib/db", () => ({
  NO_DATABASE_REASON: "no database",
  getDb: () => ({
    select: () => ({
      from: () => ({ where: () => ({ get: async () => storedRow }) }),
    }),
    delete: () => ({ where: async () => deleted() }),
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoUpdate: async () => inserted(values),
      }),
    }),
  }),
}));

async function post(body: unknown) {
  const { POST } = await import("./route");
  const response = await POST(
    new Request("https://bank-rock.com/api/rocks/1/pending-userop", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id: "1" }) },
  );
  return { status: response.status, body: await response.json() };
}

const validOp = {
  kind: "swap_owner",
  recipient: RECIPIENT,
  userOp: {
    sender: SAFE,
    callData: swapOwnerCallData(),
    signature: `0x${"11".repeat(65)}`,
  },
};

beforeEach(() => {
  vi.resetModules();
  identity = CREATOR;
  storedRow = null;
  deleted.mockReset();
  inserted.mockReset();
  simulateSignedUserOp.mockReset();
  // The default is a bundler that accepts the operation; each refusal case says so for itself.
  simulateSignedUserOp.mockResolvedValue({ state: "REAL", value: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("storing", () => {
  it("records the creator's DID with the row", async () => {
    const { status } = await post(validOp);
    expect(status).toBe(200);
    expect(inserted).toHaveBeenCalledTimes(1);
    expect(inserted.mock.calls[0][0]).toMatchObject({ creatorDid: CREATOR });
  });

  it("lets the creator replace their own row", async () => {
    storedRow = { rockId: "1", creatorDid: CREATOR, recipient: RECIPIENT };
    const { status } = await post(validOp);
    expect(status).toBe(200);
    expect(inserted).toHaveBeenCalledTimes(1);
  });

  it("refuses to let another account overwrite it (P-5)", async () => {
    storedRow = { rockId: "1", creatorDid: CREATOR, recipient: RECIPIENT };
    identity = STRANGER;

    const { status, body } = await post(validOp);
    expect(status).toBe(403);
    expect(body.reason).toMatch(/stored by another account/i);
    expect(inserted).not.toHaveBeenCalled();
  });

  it("adopts a row with no creator, rather than stranding it", async () => {
    // Rows written before the column existed have no owner; the first writer takes it.
    storedRow = { rockId: "1", creatorDid: null, recipient: RECIPIENT };
    identity = STRANGER;
    const { status } = await post(validOp);
    expect(status).toBe(200);
  });
});

describe("an operation that is not this rock's owner swap", () => {
  it("is refused when it carries no call at all", async () => {
    const { status, body } = await post({
      ...validOp,
      userOp: { sender: SAFE, signature: `0x${"11".repeat(65)}` },
    });
    expect(status).toBe(409);
    expect(body.reason).toMatch(/does not hand this rock's account/);
    expect(inserted).not.toHaveBeenCalled();
    // The bundler is never even asked: the shape is wrong before it could be run.
    expect(simulateSignedUserOp).not.toHaveBeenCalled();
  });

  it("is refused when it swaps the owner to somebody else", async () => {
    const { status } = await post({
      ...validOp,
      userOp: { ...validOp.userOp, callData: swapOwnerCallData(GIVER, STRANGER_WALLET) },
    });
    expect(status).toBe(409);
    expect(inserted).not.toHaveBeenCalled();
  });

  it("is refused when it swaps from an owner this rock does not have", async () => {
    const { status } = await post({
      ...validOp,
      userOp: { ...validOp.userOp, callData: swapOwnerCallData(STRANGER_WALLET, RECIPIENT) },
    });
    expect(status).toBe(409);
    expect(inserted).not.toHaveBeenCalled();
  });
});

describe("an operation the bundler will not validate", () => {
  it("is refused, and no row is written for the rock", async () => {
    // A squatter's row: the sender is public, so this is the only field they cannot fake.
    simulateSignedUserOp.mockResolvedValue({
      state: "UNAVAILABLE",
      reason: "The bundler refused this operation: the operation's signature was not accepted - sign the hand-over again",
    });

    const { status, body } = await post(validOp);
    expect(status).toBe(409);
    expect(body.reason).toMatch(/signature was not accepted/);
    expect(inserted).not.toHaveBeenCalled();
  });

  it("is refused when the bundler cannot be reached at all, rather than stored unchecked", async () => {
    simulateSignedUserOp.mockResolvedValue({
      state: "UNAVAILABLE",
      reason: "The bundler could not be reached, so this operation was not checked",
    });

    const { status, body } = await post(validOp);
    expect(status).toBe(409);
    expect(body.reason).toMatch(/could not be reached/);
    expect(inserted).not.toHaveBeenCalled();
  });

  it("cannot be used to take a row that is not yet claimed by anyone", async () => {
    // The squat is the point: a refused operation must leave the giver's row free to write.
    storedRow = null;
    identity = STRANGER;
    simulateSignedUserOp.mockResolvedValue({ state: "UNAVAILABLE", reason: "AA24 signature error" });

    expect((await post(validOp)).status).toBe(409);
    expect(inserted).not.toHaveBeenCalled();

    identity = CREATOR;
    simulateSignedUserOp.mockResolvedValue({ state: "REAL", value: true });
    expect((await post(validOp)).status).toBe(200);
    expect(inserted.mock.calls[0][0]).toMatchObject({ creatorDid: CREATOR });
  });

  it("is checked before the row is written, never after", async () => {
    await post(validOp);
    expect(simulateSignedUserOp).toHaveBeenCalledTimes(1);
    expect(simulateSignedUserOp.mock.calls[0][0]).toMatchObject({ sender: SAFE });
  });
});

describe("discarding", () => {
  it("lets the creator discard", async () => {
    storedRow = { rockId: "1", creatorDid: CREATOR, recipient: RECIPIENT };
    const { status, body } = await post({ discard: true });
    expect(status).toBe(200);
    expect(body.discarded).toBe(true);
    expect(deleted).toHaveBeenCalledTimes(1);
  });

  it("refuses a discard from another account - the finding itself (P-5)", async () => {
    storedRow = { rockId: "1", creatorDid: CREATOR, recipient: RECIPIENT };
    identity = STRANGER;

    const { status } = await post({ discard: true });
    expect(status).toBe(403);
    expect(deleted).not.toHaveBeenCalled();
  });
});

describe("reading", () => {
  it("shows the recipient to the creator and withholds it from everyone else", async () => {
    storedRow = { kind: "swap_owner", creatorDid: CREATOR, recipient: RECIPIENT };
    const { GET } = await import("./route");

    const asCreator = await (
      await GET(new Request("https://bank-rock.com/api/rocks/1/pending-userop"), {
        params: Promise.resolve({ id: "1" }),
      })
    ).json();
    expect(asCreator.pending).toMatchObject({ recipient: RECIPIENT, mine: true });

    identity = STRANGER;
    const asStranger = await (
      await GET(new Request("https://bank-rock.com/api/rocks/1/pending-userop"), {
        params: Promise.resolve({ id: "1" }),
      })
    ).json();
    expect(asStranger.pending).toMatchObject({ recipient: null, mine: false });
  });
});
