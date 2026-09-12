import { describe, expect, it } from "vitest";
import { INTERNAL_ERROR_REASON, publicReason, publicReasonWith } from "./errors";
import { MissingEnvError } from "./demo";

/**
 * Audit P-2: a `reason` that reaches a response body must never carry a secret.
 *
 * The finding was concrete — `SEPOLIA_RPC_URL` carries the provider's API key in its path, viem
 * puts the URL into its error text, and the claim route returned that text to an unauthenticated
 * caller. These cases pin the property that makes the class of bug impossible rather than the one
 * instance of it: `publicReason` never reads a message at all.
 */

const SECRET_URL = "https://eth-sepolia.g.alchemy.com/v2/SUPER-SECRET-KEY";

describe("publicReason", () => {
  it("never echoes the message, whatever is in it", () => {
    const err = new Error(`HTTP request failed. URL: ${SECRET_URL}`);
    const reason = publicReason(err);
    expect(reason).not.toContain("SUPER-SECRET-KEY");
    expect(reason).not.toContain("alchemy");
    expect(reason).not.toContain("http");
  });

  it("maps a known viem error to a short fixed sentence", () => {
    const err = Object.assign(new Error(`fetch failed to ${SECRET_URL}`), {
      name: "HttpRequestError",
    });
    expect(publicReason(err)).toBe("the network could not be reached");
  });

  it("looks through the cause chain, which is where viem hides the transport error", () => {
    const cause = Object.assign(new Error(SECRET_URL), { name: "HttpRequestError" });
    const outer = Object.assign(new Error("The contract function reverted"), {
      name: "ContractFunctionExecutionError",
      cause,
    });
    // The outermost known name wins, and neither message escapes.
    expect(publicReason(outer)).toBe("the contract call was rejected");
    expect(publicReason(outer)).not.toContain("SUPER-SECRET-KEY");
  });

  it("falls back to 'internal error' for anything it does not recognise", () => {
    expect(publicReason(new Error(SECRET_URL))).toBe(INTERNAL_ERROR_REASON);
    expect(publicReason("a bare string with a key: abc123")).toBe(INTERNAL_ERROR_REASON);
    expect(publicReason(null)).toBe(INTERNAL_ERROR_REASON);
    expect(publicReason({ message: SECRET_URL })).toBe(INTERNAL_ERROR_REASON);
  });

  it("names a missing environment variable — the name, never the value", () => {
    expect(publicReason(new MissingEnvError("SEPOLIA_RPC_URL"))).toBe(
      "SEPOLIA_RPC_URL is not configured",
    );
  });

  it("refuses to echo a 'variable' that is not a variable name", () => {
    const forged = Object.assign(new Error("x"), {
      name: "MissingEnvError",
      variable: `some text with ${SECRET_URL}`,
    });
    expect(publicReason(forged)).toBe(INTERNAL_ERROR_REASON);
  });

  it("keeps a stack out of the reason", () => {
    const err = new Error("boom");
    expect(publicReason(err)).not.toContain("at ");
    expect(publicReason(err)).not.toContain(".ts:");
  });
});

describe("publicReasonWith", () => {
  it("keeps the caller's prefix and appends only a safe reason", () => {
    const err = Object.assign(new Error(SECRET_URL), { name: "HttpRequestError" });
    const reason = publicReasonWith("The claim was not broadcast", err);
    expect(reason).toBe("The claim was not broadcast: the network could not be reached");
    expect(reason).not.toContain("SUPER-SECRET-KEY");
  });
});
