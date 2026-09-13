import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The two emails a stored contact request produces.
 *
 * The contract under test: nothing is reported sent that the provider did not accept; the two
 * sends are independent; every value from the form is escaped before it reaches an HTML body;
 * and a provider's own rejection text — which for a sandbox sender names the account owner's
 * inbox — never reaches a result's `reason`.
 */

const send = vi.fn();

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: (...args: unknown[]) => send(...args) };
  },
}));

import { contactSender, sendContactEmails, type ContactEmailInput } from "./contact-email";

const ENV_KEYS = [
  "RESEND_API_KEY",
  "CONTACT_NOTIFY_EMAIL",
  "ALERT_EMAIL_ADDRESS",
  "CONTACT_FROM_ADDRESS",
  "ALERT_FROM_ADDRESS",
] as const;

const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

function input(overrides: Partial<ContactEmailInput> = {}): ContactEmailInput {
  return {
    id: "11111111-2222-4333-8444-555555555555",
    kind: "sponsor",
    name: "Ada Lovelace",
    email: "ada@example.com",
    message: "First line.\n\nSecond line.",
    createdAt: Date.UTC(2026, 8, 13, 10, 30, 0),
    ...overrides,
  };
}

function accepted(id: string) {
  return { data: { id }, error: null };
}

function rejected(message: string) {
  return { data: null, error: { name: "validation_error", message } };
}

/** The `send` call that went to `to`. */
function callTo(to: string): Record<string, unknown> {
  const call = send.mock.calls.find((args) => (args[0] as { to: string }).to === to);
  if (!call) throw new Error(`no send() call to ${to}`);
  return call[0] as Record<string, unknown>;
}

beforeEach(() => {
  send.mockReset();
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("without a provider key", () => {
  it("reports both emails not sent, naming the variable, and calls nothing", async () => {
    process.env.CONTACT_NOTIFY_EMAIL = "owner@example.com";
    const result = await sendContactEmails(input());

    expect(result.operator).toMatchObject({ success: false, mode: "not_sent" });
    expect(result.acknowledgement).toMatchObject({ success: false, mode: "not_sent" });
    expect(result.operator.reason).toMatch(/RESEND_API_KEY/);
    expect(result.acknowledgement.reason).toMatch(/RESEND_API_KEY/);
    expect(send).not.toHaveBeenCalled();
  });

  it("treats a key that is not a Resend key as unset", async () => {
    process.env.RESEND_API_KEY = "sk_not_resend";
    const result = await sendContactEmails(input());
    expect(result.operator.success).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("with a key and a notify address", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.CONTACT_NOTIFY_EMAIL = "owner@example.com";
    process.env.CONTACT_FROM_ADDRESS = "Bank Rock <hello@bank-rock.com>";
    send.mockImplementation(async (payload: { to: string }) =>
      accepted(payload.to === "owner@example.com" ? "em_operator" : "em_ack"),
    );
  });

  it("sends both and reports the provider's ids", async () => {
    const result = await sendContactEmails(input());

    expect(result.operator).toMatchObject({ success: true, mode: "sent", id: "em_operator" });
    expect(result.acknowledgement).toMatchObject({ success: true, mode: "sent", id: "em_ack" });
    expect(result.operator.message).toBe("Accepted by the provider for delivery.");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("addresses the notification to the operator, with replyTo set to the submitter", async () => {
    await sendContactEmails(input({ kind: "sponsor" }));

    const operator = callTo("owner@example.com");
    expect(operator.from).toBe("Bank Rock <hello@bank-rock.com>");
    expect(operator.replyTo).toBe("ada@example.com");
    expect(operator.subject).toBe("[Bank Rock] New sponsor request from Ada Lovelace");
    const html = String(operator.html);
    expect(html).toContain("Sponsor Bank Rock");
    expect(html).toContain("ada@example.com");
    expect(html).toContain("11111111-2222-4333-8444-555555555555");
    expect(html).toContain("2026-09-13T10:30:00.000Z");
    // `escapeHtmlAttributeUrl` escapes the slashes too, as it does for the alert email's links;
    // a browser decodes them in an href.
    expect(html).toContain('href="https:&#47;&#47;bank-rock.com&#47;admin"');
  });

  it("names the testnet-rock form for an og_rock request", async () => {
    await sendContactEmails(input({ kind: "og_rock" }));

    const operator = callTo("owner@example.com");
    expect(operator.subject).toBe("[Bank Rock] New testnet rock request from Ada Lovelace");
    expect(String(operator.html)).toContain("Claim a Testnet Rock");
  });

  it("acknowledges the submitter with a copy of the message and no replyTo", async () => {
    await sendContactEmails(input());

    const ack = callTo("ada@example.com");
    expect(ack.from).toBe("Bank Rock <hello@bank-rock.com>");
    expect(ack.subject).toBe("We got your message — Bank Rock");
    expect(ack.replyTo).toBeUndefined();
    const html = String(ack.html);
    expect(html).toContain("Sponsor Bank Rock");
    expect(html).toContain("First line.<br><br>Second line.");
    expect(html).toMatch(/Ethereum Sepolia/);
    expect(html).toMatch(/no mainnet/);
  });

  it("escapes the name and the message in both bodies (SA-7)", async () => {
    await sendContactEmails(
      input({
        name: 'Mallory <script>alert("x")</script>',
        message: '<img src=x onerror="steal()"> & "quotes"',
      }),
    );

    for (const to of ["owner@example.com", "ada@example.com"]) {
      const html = String(callTo(to).html);
      expect(html).not.toContain("<script>");
      expect(html).not.toContain("<img");
      expect(html).toContain("&lt;script&gt;");
      expect(html).toContain("&lt;img src&#61;x onerror&#61;&quot;steal()&quot;&gt;");
      expect(html).toContain("&amp; &quot;quotes&quot;");
    }
  });

  it("keeps the subject to one line whatever the name contains", async () => {
    await sendContactEmails(input({ name: "Ada\r\nBcc: victim@example.com" }));
    const operator = callTo("owner@example.com");
    expect(operator.subject).not.toMatch(/[\r\n]/);
    expect(operator.subject).toBe("[Bank Rock] New sponsor request from Ada Bcc: victim@example.com");
  });

  it("still sends the acknowledgement when the provider rejects the notification", async () => {
    send.mockImplementation(async (payload: { to: string }) =>
      payload.to === "owner@example.com"
        ? rejected("You can only send testing emails to your own email address (owner@example.com)")
        : accepted("em_ack"),
    );

    const result = await sendContactEmails(input());

    expect(result.operator).toMatchObject({ success: false, mode: "not_sent" });
    expect(result.acknowledgement).toMatchObject({ success: true, id: "em_ack" });
    // The provider's words name the account owner's inbox; a fixed sentence goes outward instead.
    expect(result.operator.reason).not.toContain("owner@example.com");
    expect(result.operator.reason).toMatch(/rejected the message/);
  });

  it("still sends the notification when the acknowledgement send throws", async () => {
    send.mockImplementation(async (payload: { to: string }) => {
      if (payload.to === "ada@example.com") {
        throw Object.assign(new Error("fetch failed https://api.resend.com/?key=re_secret"), {
          name: "HttpRequestError",
        });
      }
      return accepted("em_operator");
    });

    const result = await sendContactEmails(input());

    expect(result.operator).toMatchObject({ success: true, id: "em_operator" });
    expect(result.acknowledgement).toMatchObject({ success: false, mode: "not_sent" });
    expect(result.acknowledgement.reason).toBe("the network could not be reached");
    expect(result.acknowledgement.reason).not.toContain("re_secret");
  });
});

describe("the notify address", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test_key";
    send.mockResolvedValue(accepted("em_any"));
  });

  it("falls back to ALERT_EMAIL_ADDRESS", async () => {
    process.env.ALERT_EMAIL_ADDRESS = "alerts@example.com";
    const result = await sendContactEmails(input());
    expect(result.operator.success).toBe(true);
    expect(callTo("alerts@example.com").replyTo).toBe("ada@example.com");
  });

  it("prefers CONTACT_NOTIFY_EMAIL over ALERT_EMAIL_ADDRESS", async () => {
    process.env.CONTACT_NOTIFY_EMAIL = "owner@example.com";
    process.env.ALERT_EMAIL_ADDRESS = "alerts@example.com";
    await sendContactEmails(input());
    expect(send.mock.calls.map((args) => (args[0] as { to: string }).to).sort()).toEqual([
      "ada@example.com",
      "owner@example.com",
    ]);
  });

  it("reports the notification not sent, naming the variable, when neither is set — and still acknowledges", async () => {
    const result = await sendContactEmails(input());

    expect(result.operator).toMatchObject({ success: false, mode: "not_sent" });
    expect(result.operator.reason).toMatch(/CONTACT_NOTIFY_EMAIL/);
    expect(result.acknowledgement).toMatchObject({ success: true, id: "em_any" });
    expect(send).toHaveBeenCalledTimes(1);
    expect(callTo("ada@example.com")).toBeDefined();
  });
});

describe("the sender", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.CONTACT_NOTIFY_EMAIL = "owner@example.com";
  });

  it("prefers CONTACT_FROM_ADDRESS, then ALERT_FROM_ADDRESS, then the sandbox", () => {
    expect(contactSender().sandbox).toBe(true);
    process.env.ALERT_FROM_ADDRESS = "Bank Rock <alerts@bank-rock.com>";
    expect(contactSender()).toEqual({ from: "Bank Rock <alerts@bank-rock.com>", sandbox: false });
    process.env.CONTACT_FROM_ADDRESS = "Bank Rock <hello@bank-rock.com>";
    expect(contactSender()).toEqual({ from: "Bank Rock <hello@bank-rock.com>", sandbox: false });
  });

  it("says so when an accepted send used the sandbox sender (E-6)", async () => {
    send.mockResolvedValue(accepted("em_sandbox"));
    const result = await sendContactEmails(input());

    expect(result.acknowledgement.success).toBe(true);
    expect(result.acknowledgement.message).toMatch(/sandbox sender/);
    expect(result.acknowledgement.message).toMatch(/account owner's inbox/);
  });

  it("attaches the sandbox caveat to a rejection while on the sandbox sender", async () => {
    send.mockImplementation(async (payload: { to: string }) =>
      payload.to === "ada@example.com"
        ? rejected("You can only send testing emails to your own email address (owner@example.com)")
        : accepted("em_operator"),
    );
    const result = await sendContactEmails(input());

    expect(result.acknowledgement.success).toBe(false);
    expect(result.acknowledgement.reason).toMatch(/sandbox sender/);
    expect(result.acknowledgement.reason).not.toContain("owner@example.com");
  });
});
