import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `POST /api/rocks/[id]/pending-userop` — who may replace or discard a pre-signed hand-over.
 *
 * Audit P-5: the route checked that the caller was signed in, not that they were the creator. A
 * Privy token proves an account and Privy sign-up is open, so any stranger could discard another
 * rock's pre-signed Safe owner swap — and the recipient would then get the registry claim and
 * never the Rock Account. These cases pin the ownership rule.
 */

const CREATOR = "did:privy:creator";
const STRANGER = "did:privy:stranger";
const SAFE = "0x2222222222222222222222222222222222222222";
const RECIPIENT = "0x3333333333333333333333333333333333333333";

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
        owner: RECIPIENT,
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
  userOp: { sender: SAFE, signature: `0x${"11".repeat(65)}` },
};

beforeEach(() => {
  vi.resetModules();
  identity = CREATOR;
  storedRow = null;
  deleted.mockReset();
  inserted.mockReset();
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

describe("discarding", () => {
  it("lets the creator discard", async () => {
    storedRow = { rockId: "1", creatorDid: CREATOR, recipient: RECIPIENT };
    const { status, body } = await post({ discard: true });
    expect(status).toBe(200);
    expect(body.discarded).toBe(true);
    expect(deleted).toHaveBeenCalledTimes(1);
  });

  it("refuses a discard from another account — the finding itself (P-5)", async () => {
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
