import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `POST /api/contact` - the shop's two forms.
 *
 * The row in D1 is what makes a submission a success. The two emails that follow are reported in
 * the 200 body and never turn it into an error: a stored message the modal calls "not sent" is
 * the lie this route exists to avoid.
 */

const requireIpRateLimit = vi.fn();
const insertValues = vi.fn();
const sendContactEmails = vi.fn();
let database: unknown = null;

vi.mock("@/lib/rate-limit", () => ({
  requireIpRateLimit: (...args: unknown[]) => requireIpRateLimit(...args),
}));

vi.mock("@/lib/db", () => ({
  NO_DATABASE_REASON: "no database",
  getDb: () => database,
}));

vi.mock("@/lib/contact-email", () => ({
  sendContactEmails: (...args: unknown[]) => sendContactEmails(...args),
}));

const sent = { success: true, id: "em_1", mode: "sent", message: "Accepted." };
const notSent = (reason: string) => ({
  success: false,
  mode: "not_sent",
  reason,
  message: `No email was sent: ${reason}`,
});

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    kind: "og_rock",
    name: "Ada Lovelace",
    email: "Ada@Example.com",
    message: "I can carve stone.",
    ...overrides,
  };
}

async function post(body: unknown) {
  const { POST } = await import("./route");
  const response = await POST(
    new Request("https://bank-rock.com/api/contact", {
      method: "POST",
      body: body === undefined ? "" : JSON.stringify(body),
      headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.7" },
    }),
  );
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  vi.resetModules();
  requireIpRateLimit.mockReset();
  insertValues.mockReset();
  sendContactEmails.mockReset();

  requireIpRateLimit.mockResolvedValue({ ok: true });
  insertValues.mockResolvedValue(undefined);
  sendContactEmails.mockResolvedValue({ operator: sent, acknowledgement: sent });
  database = { insert: () => ({ values: (row: unknown) => insertValues(row) }) };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("validation", () => {
  it("rejects an empty body without storing or emailing anything", async () => {
    const { status, body } = await post(undefined);
    expect(status).toBe(400);
    expect(body.error).toMatch(/kind/);
    expect(insertValues).not.toHaveBeenCalled();
    expect(sendContactEmails).not.toHaveBeenCalled();
  });

  it("rejects an unknown kind, a missing name, a bad email and an empty message", async () => {
    expect((await post(validBody({ kind: "newsletter" }))).status).toBe(400);
    expect((await post(validBody({ name: "  " }))).status).toBe(400);
    expect((await post(validBody({ email: "not-an-address" }))).status).toBe(400);
    expect((await post(validBody({ message: "" }))).status).toBe(400);
    expect(insertValues).not.toHaveBeenCalled();
  });
});

describe("the happy path", () => {
  it("stores an og_rock request, emails, and reports the outcome", async () => {
    const { status, body } = await post(validBody());

    expect(status).toBe(200);
    expect(body).toMatchObject({
      state: "REAL",
      persisted: true,
      email: { operator: { sent: true }, acknowledgement: { sent: true } },
    });
    expect(typeof body.id).toBe("string");

    expect(insertValues).toHaveBeenCalledTimes(1);
    const row = insertValues.mock.calls[0][0] as Record<string, unknown>;
    expect(row).toMatchObject({
      id: body.id,
      kind: "og_rock",
      name: "Ada Lovelace",
      email: "ada@example.com",
      message: "I can carve stone.",
    });
    expect(typeof row.createdAt).toBe("number");

    expect(sendContactEmails).toHaveBeenCalledTimes(1);
    expect(sendContactEmails.mock.calls[0][0]).toEqual({
      id: body.id,
      kind: "og_rock",
      name: "Ada Lovelace",
      email: "ada@example.com",
      message: "I can carve stone.",
      createdAt: row.createdAt,
    });
  });

  it("stores a sponsor request under its own kind", async () => {
    const { status, body } = await post(validBody({ kind: "sponsor", message: "A gas budget." }));

    expect(status).toBe(200);
    expect(body.email.operator.sent).toBe(true);
    expect((insertValues.mock.calls[0][0] as { kind: string }).kind).toBe("sponsor");
    expect((sendContactEmails.mock.calls[0][0] as { kind: string }).kind).toBe("sponsor");
  });

  it("does not put a reason on an email that was sent", async () => {
    const { body } = await post(validBody());
    expect(body.email.operator).toEqual({ sent: true });
    expect(body.email.acknowledgement).toEqual({ sent: true });
  });
});

describe("email failure", () => {
  it("is still a stored, 200 request, with each email's reason in the body", async () => {
    sendContactEmails.mockResolvedValue({
      operator: notSent("CONTACT_NOTIFY_EMAIL is not configured"),
      acknowledgement: notSent("the mail provider rejected the message"),
    });

    const { status, body } = await post(validBody());

    expect(status).toBe(200);
    expect(body.state).toBe("REAL");
    expect(body.persisted).toBe(true);
    expect(body.email).toEqual({
      operator: { sent: false, reason: "CONTACT_NOTIFY_EMAIL is not configured" },
      acknowledgement: { sent: false, reason: "the mail provider rejected the message" },
    });
    expect(insertValues).toHaveBeenCalledTimes(1);
  });

  it("reports one sent and one not, independently", async () => {
    sendContactEmails.mockResolvedValue({
      operator: sent,
      acknowledgement: notSent("the mail provider rejected the message"),
    });

    const { status, body } = await post(validBody());

    expect(status).toBe(200);
    expect(body.email.operator).toEqual({ sent: true });
    expect(body.email.acknowledgement.sent).toBe(false);
  });
});

describe("when the row cannot be stored", () => {
  it("answers 503 UNAVAILABLE with no database, and sends no email", async () => {
    database = null;
    const { status, body } = await post(validBody());
    expect(status).toBe(503);
    expect(body).toEqual({ state: "UNAVAILABLE", reason: "no database" });
    expect(sendContactEmails).not.toHaveBeenCalled();
  });

  it("answers 503 when the insert fails, and sends no email", async () => {
    insertValues.mockRejectedValue(new Error("D1_ERROR: table locked"));
    const { status, body } = await post(validBody());
    expect(status).toBe(503);
    expect(body.state).toBe("UNAVAILABLE");
    expect(body.reason).toMatch(/could not be stored/);
    expect(sendContactEmails).not.toHaveBeenCalled();
  });
});

describe("the rate limit", () => {
  it("fails closed and stores nothing", async () => {
    requireIpRateLimit.mockResolvedValue({ ok: false, status: 429, reason: "Too many requests" });
    const { status, body } = await post(validBody());
    expect(status).toBe(429);
    expect(body.error).toBe("Too many requests");
    expect(insertValues).not.toHaveBeenCalled();
    expect(sendContactEmails).not.toHaveBeenCalled();
  });

  it("answers UNAVAILABLE when the limiter itself is unreachable", async () => {
    requireIpRateLimit.mockResolvedValue({ ok: false, status: 503, reason: "no database" });
    const { status, body } = await post(validBody());
    expect(status).toBe(503);
    expect(body).toEqual({ state: "UNAVAILABLE", reason: "no database" });
    expect(insertValues).not.toHaveBeenCalled();
  });
});
