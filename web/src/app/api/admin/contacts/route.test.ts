import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type Column, type SQL, type Table } from "drizzle-orm";

/**
 * `GET /api/admin/contacts` — the rows behind the dashboard's "Contact requests" count.
 *
 * The session check is the real one from `lib/auth` (only `next/headers` is replaced, so a cookie
 * jar exists outside a request), and the "unauthenticated" cases compare this route's answer
 * with `/api/admin/stats` rather than pinning a number: the two must refuse the same way.
 */

/** A cookie jar for `next/headers`, filled by `createAdminSession` the way the login route does. */
const jar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => {
      jar.set(name, value);
    },
    delete: (name: string) => {
      jar.delete(name);
    },
  }),
}));

let database: unknown = null;
let contactRows: Record<string, unknown>[] = [];
let subscriberRows: Record<string, unknown>[] = [];
/** What each `select().from(table)` was ordered by and limited to, keyed by table name. */
const orderedBy = new Map<string, SQL>();
const limitedTo = new Map<string, number>();

vi.mock("@/lib/db", () => ({
  NO_DATABASE_REASON: "no database",
  getDb: () => database,
}));

/**
 * By name, not identity: `vi.resetModules()` hands the route its own instance of the schema, so
 * the table objects this file could import would never be the ones the route selects from.
 */
function tableName(table: unknown): string {
  const name = getTableName(table as Table);
  if (name === "contact_requests" || name === "subscribers") return name;
  throw new Error(`select() from an unexpected table: ${name}`);
}

/** The one chained shape this route uses: `select().from(t).orderBy(x).limit(n)`. */
function fakeDb() {
  return {
    select: () => ({
      from: (table: unknown) => ({
        orderBy: (order: SQL) => {
          const name = tableName(table);
          orderedBy.set(name, order);
          return {
            limit: async (n: number) => {
              limitedTo.set(name, n);
              return name === "contact_requests" ? contactRows : subscriberRows;
            },
          };
        },
      }),
    }),
  };
}

const USER_AGENT = "operator-browser/1.0";

async function signIn(userAgent = USER_AGENT) {
  const { createAdminSession } = await import("@/lib/auth");
  await createAdminSession(userAgent);
}

async function get(userAgent = USER_AGENT) {
  const { GET } = await import("./route");
  const response = await GET(
    new Request("https://bank-rock.com/api/admin/contacts", {
      headers: { "user-agent": userAgent },
    }),
  );
  return { status: response.status, body: await response.json() };
}

async function getStats(userAgent = USER_AGENT) {
  const { GET } = await import("../stats/route");
  const response = await GET(
    new Request("https://bank-rock.com/api/admin/stats", {
      headers: { "user-agent": userAgent },
    }),
  );
  return { status: response.status, body: await response.json() };
}

/** `desc(column)` is `sql\`${column} desc\``: the column, then the literal " desc". */
function expectDescendingBy(order: SQL | undefined, table: string, column: string) {
  if (!order) throw new Error("orderBy was never called");
  const chunks = order.queryChunks as unknown[];
  const ordered = chunks[1] as Column;
  expect(getTableName(ordered.table)).toBe(table);
  expect(ordered.name).toBe(column);
  expect((chunks[2] as { value: string[] }).value).toEqual([" desc"]);
}

beforeEach(() => {
  vi.resetModules();
  jar.clear();
  orderedBy.clear();
  limitedTo.clear();
  process.env.ADMIN_JWT_SECRET = "a-test-secret-that-is-long-enough-to-sign-with";
  contactRows = [];
  subscriberRows = [];
  database = fakeDb();
});

afterEach(() => {
  delete process.env.ADMIN_JWT_SECRET;
  vi.clearAllMocks();
});

describe("without an admin session", () => {
  it("refuses exactly as /api/admin/stats does, and never touches the database", async () => {
    const select = vi.fn(() => fakeDb().select());
    database = { select };

    const contacts = await get();
    const stats = await getStats();

    expect(contacts.status).toBe(401);
    expect(contacts.status).toBe(stats.status);
    expect(contacts.body).toEqual(stats.body);
    expect(contacts.body).toEqual({ error: "No admin session" });
    expect(select).not.toHaveBeenCalled();
  });

  it("refuses a session bound to a different client, as /api/admin/stats does", async () => {
    await signIn("another-browser/2.0");

    const contacts = await get();
    const stats = await getStats();

    expect(contacts.status).toBe(401);
    expect(contacts.body).toEqual(stats.body);
    expect(contacts.body.error).toMatch(/different client/);
  });

  it("is UNAVAILABLE, not open, when ADMIN_JWT_SECRET is unset", async () => {
    await signIn();
    delete process.env.ADMIN_JWT_SECRET;

    const contacts = await get();
    const stats = await getStats();

    expect(contacts.status).toBe(503);
    expect(contacts.status).toBe(stats.status);
    expect(contacts.body).toEqual(stats.body);
    expect(contacts.body.state).toBe("UNAVAILABLE");
    expect(contacts.body.reason).toMatch(/ADMIN_JWT_SECRET/);
  });
});

describe("with an admin session", () => {
  beforeEach(async () => {
    await signIn();
  });

  it("returns both lists, newest first, capped at a hundred rows each", async () => {
    contactRows = [
      {
        id: "c-2",
        kind: "sponsor",
        name: "Grace Hopper",
        email: "grace@example.com",
        message: "A gas budget.\n\nSecond paragraph.",
        createdAt: 1_757_700_000_000,
      },
      {
        id: "c-1",
        kind: "og_rock",
        name: "Ada Lovelace",
        email: "ada@example.com",
        message: "<b>I can carve stone.</b>",
        createdAt: 1_757_600_000_000,
      },
    ];
    subscriberRows = [
      { email: "later@example.com", topics: ["landing_page"], createdAt: 1_757_650_000_000 },
      { email: "earlier@example.com", topics: null, createdAt: 1_757_500_000_000 },
    ];

    const { status, body } = await get();

    expect(status).toBe(200);
    expect(body.state).toBe("REAL");
    expect(body.limit).toBe(100);
    expect(typeof body.generatedAt).toBe("string");

    expect(body.contacts).toEqual([
      {
        id: "c-2",
        kind: "sponsor",
        name: "Grace Hopper",
        email: "grace@example.com",
        message: "A gas budget.\n\nSecond paragraph.",
        createdAt: new Date(1_757_700_000_000).toISOString(),
      },
      {
        id: "c-1",
        kind: "og_rock",
        name: "Ada Lovelace",
        email: "ada@example.com",
        message: "<b>I can carve stone.</b>",
        createdAt: new Date(1_757_600_000_000).toISOString(),
      },
    ]);
    expect(body.subscribers).toEqual([
      {
        email: "later@example.com",
        topics: ["landing_page"],
        source: "landing_page",
        createdAt: new Date(1_757_650_000_000).toISOString(),
      },
      {
        email: "earlier@example.com",
        topics: [],
        source: null,
        createdAt: new Date(1_757_500_000_000).toISOString(),
      },
    ]);

    // "Newest first" is the database's ordering, so the test pins what was asked of it.
    expectDescendingBy(orderedBy.get("contact_requests"), "contact_requests", "created_at");
    expectDescendingBy(orderedBy.get("subscribers"), "subscribers", "created_at");
    expect(limitedTo.get("contact_requests")).toBe(100);
    expect(limitedTo.get("subscribers")).toBe(100);
  });

  it("answers empty arrays, not an error, when nothing has been stored", async () => {
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body).toMatchObject({ state: "REAL", contacts: [], subscribers: [] });
  });

  it("joins several stored topics into one source", async () => {
    subscriberRows = [
      { email: "two@example.com", topics: ["dangerousTrade,highSlippage"], createdAt: 1 },
      { email: "list@example.com", topics: ["a", "b"], createdAt: 2 },
    ];
    const { body } = await get();
    expect(body.subscribers.map((s: { source: string }) => s.source)).toEqual([
      "dangerousTrade,highSlippage",
      "a, b",
    ]);
  });

  it("answers 503 UNAVAILABLE with no database", async () => {
    database = null;
    const { status, body } = await get();
    expect(status).toBe(503);
    expect(body).toEqual({ state: "UNAVAILABLE", reason: "no database" });
  });

  it("answers 503 UNAVAILABLE when the read fails", async () => {
    database = {
      select: () => ({
        from: () => ({
          orderBy: () => ({
            limit: async () => {
              throw new Error("D1_ERROR: table locked");
            },
          }),
        }),
      }),
    };
    const { status, body } = await get();
    expect(status).toBe(503);
    expect(body.state).toBe("UNAVAILABLE");
    expect(body.reason).toMatch(/could not be read/);
  });
});
