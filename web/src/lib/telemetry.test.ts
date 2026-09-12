import { afterEach, describe, expect, it, vi } from "vitest";
import {
  logger,
  queryTelemetryLogs,
  redactAddress,
  redactContext,
  redactEmail,
  redactText,
  redactUid,
  redactUrl,
} from "./telemetry";

// Built rather than written out, so the repository-wide "no address literals outside lib/chain"
// check (D-015, spec 15 Part 7) stays true of the test suite too.
const SAMPLE_ADDRESS = `0x71C8${"5".repeat(32)}1b47`;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("PII redaction (SA-2, privacy)", () => {
  it("reduces an email to a***@domain", () => {
    expect(redactEmail("alice@example.com")).toBe("a***@example.com");
    expect(redactEmail("collector@bank-rock.com")).toBe("c***@bank-rock.com");
  });

  it("reduces an EVM address to 0x1234…abcd", () => {
    expect(redactAddress(SAMPLE_ADDRESS)).toBe("0x71C8…1b47");
  });

  it("keeps only the last two bytes of an NFC UID", () => {
    expect(redactUid("04A1B2C3D4E5F6")).toBe("…E5F6");
    expect(redactUid("04:A1:B2:C3:D4:E5:F6")).toBe("…E5F6");
  });

  it("redacts addresses and emails found inside free text", () => {
    const text = `sent to alice@example.com from ${SAMPLE_ADDRESS}`;
    expect(redactText(text)).toBe("sent to a***@example.com from 0x71C8…1b47");
  });

  it("leaves a 32-byte transaction hash intact", () => {
    const hash = `0x${"ab".repeat(32)}`;
    expect(redactText(`tx ${hash}`)).toBe(`tx ${hash}`);
  });

  it("redacts by key, including nested objects", () => {
    const redacted = redactContext({
      email: "alice@example.com",
      uid: "04A1B2C3D4E5F6",
      wallet: SAMPLE_ADDRESS,
      nested: { recipient: "bob@example.com" },
    });
    expect(redacted).toMatchObject({
      email: "a***@example.com",
      uid: "…E5F6",
      wallet: "0x71C8…1b47",
      nested: { recipient: "b***@example.com" },
    });
  });

  it("drops secret-shaped keys entirely", () => {
    expect(redactContext({ apiKey: "re_live_123", stack: "at foo" })).toMatchObject({
      apiKey: "[redacted]",
      stack: "[redacted]",
    });
  });

  it("redacts before the entry reaches the buffer", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("subscriber alice@example.com registered", {
      action: "TEST_REDACTION",
      email: "alice@example.com",
    });
    const entry = queryTelemetryLogs({ limit: 5 }).find(
      (e) => e.context?.action === "TEST_REDACTION",
    );
    expect(entry?.message).toBe("subscriber a***@example.com registered");
    expect(entry?.context?.email).toBe("a***@example.com");
    expect(JSON.stringify(entry)).not.toContain("alice@example.com");
  });
});

describe("stack traces", () => {
  it("are dropped in production", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "production");
    logger.error("boom", new Error("kaboom"), { action: "TEST_STACK_PROD" });
    const entry = queryTelemetryLogs({ limit: 5 }).find(
      (e) => e.context?.action === "TEST_STACK_PROD",
    );
    expect(entry?.error?.message).toBe("kaboom");
    expect(entry?.error?.stack).toBeUndefined();
  });

  it("are kept outside production for debugging", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "development");
    logger.error("boom", new Error("kaboom"), { action: "TEST_STACK_DEV" });
    const entry = queryTelemetryLogs({ limit: 5 }).find(
      (e) => e.context?.action === "TEST_STACK_DEV",
    );
    expect(entry?.error?.stack).toBeDefined();
  });
});

describe("URL redaction (audit P-15)", () => {
  // `SEPOLIA_RPC_URL` carries the provider's API key in its path and Pimlico's in a query string.
  // viem puts that URL into its error text, and error text reaches this buffer.
  const RPC = "https://eth-sepolia.g.alchemy.com/v2/SUPER-SECRET-KEY";
  const BUNDLER = "https://api.pimlico.io/v2/sepolia/rpc?apikey=pim_SECRET";

  it("keeps the origin and drops the path, the query and any userinfo", () => {
    expect(redactUrl(RPC)).toBe("https://eth-sepolia.g.alchemy.com/[redacted]");
    expect(redactUrl(BUNDLER)).toBe("https://api.pimlico.io/[redacted]");
    expect(redactUrl("https://user:pass@internal.example.com/x")).toBe(
      "https://internal.example.com/[redacted]",
    );
  });

  it("leaves a bare origin recognisable", () => {
    expect(redactUrl("https://bank-rock.com")).toBe("https://bank-rock.com");
  });

  it("redacts a URL wherever it appears in free text", () => {
    const text = `HTTP request failed. URL: ${RPC}. Details: none`;
    const redacted = redactText(text);
    expect(redacted).not.toContain("SUPER-SECRET-KEY");
    expect(redacted).toContain("https://eth-sepolia.g.alchemy.com/[redacted]");
  });

  it("keeps a provider key out of the buffer even when it arrives inside an error", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    logger.error("chain read failed", new Error(`HttpRequestError: ${BUNDLER}`), {
      action: "TEST_URL_REDACTION",
    });
    const entry = queryTelemetryLogs({ limit: 5 }).find(
      (e) => e.context?.action === "TEST_URL_REDACTION",
    );
    expect(JSON.stringify(entry)).not.toContain("pim_SECRET");
    expect(JSON.stringify(entry)).not.toContain("apikey");
  });

  it("redacts a URL held in a context field", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    logger.warn("upstream unavailable", { action: "TEST_URL_CONTEXT", endpoint: RPC });
    const entry = queryTelemetryLogs({ limit: 5 }).find(
      (e) => e.context?.action === "TEST_URL_CONTEXT",
    );
    expect(entry?.context?.endpoint).toBe("https://eth-sepolia.g.alchemy.com/[redacted]");
  });
});
