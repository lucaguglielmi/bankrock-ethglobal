import { describe, expect, it } from "vitest";
import {
  INTERNAL_ERROR_REASON,
  publicReason,
  publicReasonWith,
  SPONSORSHIP_REJECTED_REASON,
} from "./errors";
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

/**
 * B5: a bundler or paymaster failure used to read "internal error".
 *
 * Every sponsored action in the app is a UserOperation, so this was the most common failure in the
 * product wearing the least useful words. A bundler has no error *type* — the refusal arrives as a
 * JSON-RPC message — so these are classified by message, and the first case below is the one that
 * matters: classifying by message must not become quoting the message.
 */
describe("publicReason — bundler and paymaster failures", () => {
  /** A bundler error as `lib/rock-account.server.ts` raises it: the bundler's own words. */
  function bundlerError(message: string) {
    return Object.assign(new Error(message), { name: "BundlerRpcError" });
  }

  it("classifies by message without ever quoting it", () => {
    const err = bundlerError(
      `AA33 reverted: paymaster rejected, policy check failed at ${SECRET_URL}`,
    );
    const reason = publicReason(err);
    expect(reason).toBe(SPONSORSHIP_REJECTED_REASON);
    expect(reason).not.toContain("SUPER-SECRET-KEY");
    expect(reason).not.toContain("alchemy");
  });

  it("names a sponsorship refusal so an operator knows where to look", () => {
    expect(publicReason(bundlerError("paymaster did not sponsor the userOperation"))).toBe(
      SPONSORSHIP_REJECTED_REASON,
    );
    expect(publicReason(bundlerError("no sponsorship policy matched this request"))).toBe(
      SPONSORSHIP_REJECTED_REASON,
    );
    expect(publicReason(bundlerError("AA34 signature error"))).toBe(SPONSORSHIP_REJECTED_REASON);
  });

  it("separates a deadline from a sponsorship refusal, including AA32", () => {
    expect(publicReason(bundlerError("AA22 expired or not due"))).toMatch(/deadline had passed/);
    expect(publicReason(bundlerError("AA32 paymaster expired or not due"))).toMatch(
      /deadline had passed/,
    );
  });

  it("distinguishes a low paymaster deposit from a policy refusal", () => {
    expect(publicReason(bundlerError("AA31 paymaster deposit too low"))).toMatch(
      /paymaster's deposit is too low/,
    );
  });

  it("names the account-side AA2x failures", () => {
    expect(publicReason(bundlerError("AA21 didn't pay prefund"))).toMatch(/could not pay/);
    expect(publicReason(bundlerError("AA24 signature error"))).toMatch(/signature was not accepted/);
    expect(publicReason(bundlerError("AA25 invalid account nonce"))).toMatch(/nonce/);
    expect(publicReason(bundlerError("AA20 account not deployed"))).toMatch(/not deployed/);
    expect(publicReason(bundlerError("AA13 initCode failed or OOG"))).toMatch(
      /could not be deployed/,
    );
  });

  it("names a reverted operation and a replacement that is underpriced", () => {
    expect(publicReason(bundlerError("UserOperation reverted during simulation"))).toMatch(
      /reverted while it was being executed/,
    );
    expect(publicReason(bundlerError("replacement underpriced"))).toMatch(/same nonce/);
  });

  it("still says it was the bundler for an AA code it has never seen", () => {
    expect(publicReason(bundlerError("AA99 something new"))).toBe("the bundler refused the operation");
  });

  it("reads viem's account-abstraction error names too", () => {
    const wrapped = Object.assign(new Error(SECRET_URL), {
      name: "PaymasterDepositTooLowError",
    });
    expect(publicReason(wrapped)).toBe(SPONSORSHIP_REJECTED_REASON);

    const timeout = Object.assign(new Error(SECRET_URL), {
      name: "WaitForUserOperationReceiptTimeoutError",
    });
    expect(publicReason(timeout)).toMatch(/has not been mined yet/);
  });

  it("finds the bundler's words in viem's `details`, where the wrapper hides them", () => {
    const err = Object.assign(new Error("UserOperation execution failed"), {
      name: "UserOperationExecutionError",
      details: "AA33 reverted: paymaster policy",
    });
    expect(publicReason(err)).toBe(SPONSORSHIP_REJECTED_REASON);
  });

  it("leaves an ordinary contract failure classified as it always was", () => {
    // The bundler patterns are narrow on purpose: they must not swallow the name table.
    const err = Object.assign(new Error("The contract function \"claimHandover\" reverted."), {
      name: "ContractFunctionExecutionError",
    });
    expect(publicReason(err)).toBe("the contract call was rejected");
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
