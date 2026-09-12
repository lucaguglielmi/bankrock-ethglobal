/**
 * What a failure is allowed to tell a client (audit P-2, P-15).
 *
 * The claim route returned viem's error text verbatim in its `reason`. viem puts the RPC URL in
 * that text, and `SEPOLIA_RPC_URL` carries the provider API key in its path — so an
 * unauthenticated caller could read a paid credential out of an error message. That is the
 * highest-severity finding of the perimeter audit, and the class of bug is "we passed an internal
 * string outward", not "we formatted one message badly".
 *
 * So the rule is structural: a `reason` that reaches a response body is chosen from a fixed set
 * here, never interpolated from an exception. The detail still exists — it goes to telemetry,
 * which redacts before it buffers and is readable only with `ADMIN_API_KEY`.
 *
 * This module is pure and client-safe on purpose: `lib/secure.ts` pulls in `node:crypto` and
 * `next/server`, and the modules that most need this (`lib/rock-account.ts`, `lib/indexer.ts`) run
 * in the browser too. `lib/secure.ts` re-exports it so server code has one import.
 */

/** The string a client sees when nothing more specific is safe to say. */
export const INTERNAL_ERROR_REASON = "internal error";

interface KnownError {
  /** Matched against the error's `name`, or any `name` in its `cause` chain. */
  names: string[];
  reason: string;
}

/**
 * Errors we can name without quoting them.
 *
 * viem's error names are stable across patch versions and carry no interpolated values, so
 * matching on the name is safe where matching on the message is not.
 */
const KNOWN_ERRORS: KnownError[] = [
  {
    names: ["HttpRequestError", "TimeoutError", "RpcRequestError", "SocketClosedError"],
    reason: "the network could not be reached",
  },
  {
    names: ["InsufficientFundsError", "ExecutionRevertedError", "FeeCapTooLowError"],
    reason: "the transaction was rejected by the network",
  },
  {
    names: [
      "ContractFunctionExecutionError",
      "ContractFunctionRevertedError",
      "CallExecutionError",
      "EstimateGasExecutionError",
    ],
    reason: "the contract call was rejected",
  },
  {
    names: ["UserRejectedRequestError"],
    reason: "the request was rejected in the wallet",
  },
  {
    names: ["AbiDecodingDataSizeTooSmallError", "AbiFunctionNotFoundError", "InvalidAddressError"],
    reason: "the contract answered in an unexpected shape",
  },
];

function errorNames(err: unknown, depth = 0): string[] {
  if (!err || typeof err !== "object" || depth > 4) return [];
  const names: string[] = [];
  const name = (err as { name?: unknown }).name;
  if (typeof name === "string") names.push(name);
  const cause = (err as { cause?: unknown }).cause;
  return [...names, ...errorNames(cause, depth + 1)];
}

/**
 * The reason string for a caught error, safe to put in a response body.
 *
 * Known errors map to a short fixed sentence; everything else is `"internal error"`. It never
 * reads `err.message`, so no value from the environment, a URL, a query string or a stack can
 * escape through it — including from an error type that did not exist when this was written.
 *
 * A `MissingEnvError` is the one case that names something: the *variable name*, which is public
 * configuration and is what an operator needs to fix it. Its value is never touched.
 */
export function publicReason(err: unknown): string {
  const variable = (err as { variable?: unknown })?.variable;
  if (
    (err as { name?: unknown })?.name === "MissingEnvError" &&
    typeof variable === "string" &&
    /^[A-Z][A-Z0-9_]*$/.test(variable)
  ) {
    return `${variable} is not configured`;
  }

  // Outermost first: the error viem threw describes what failed better than the transport error
  // it wraps, and the caller's own layer is the one the user is waiting on.
  for (const name of errorNames(err)) {
    const known = KNOWN_ERRORS.find((candidate) => candidate.names.includes(name));
    if (known) return known.reason;
  }
  return INTERNAL_ERROR_REASON;
}

/**
 * `prefix`, then a safe reason: "The claim was not broadcast: the network could not be reached".
 *
 * The prefix is written by us at the call site — never taken from the error.
 */
export function publicReasonWith(prefix: string, err: unknown): string {
  return `${prefix}: ${publicReason(err)}`;
}
