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
 * The rule survives reading an error's message, which `publicReason` now does to recognise bundler
 * and paymaster failures: a message is matched against a pattern and thrown away. It decides
 * *which* of the fixed sentences below is returned, and contributes no character to it. The tests
 * pin that property with a message that carries a secret and matches a pattern at the same time.
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

interface KnownMessage {
  /** Matched against the error's `message`, or any `message` in its `cause` chain. */
  pattern: RegExp;
  reason: string;
}

/**
 * The one sentence an operator can act on when Pimlico declines to pay.
 *
 * It names the vendor and the chain, both of which are committed, public configuration (D-033,
 * D-034), and no value read from the environment.
 */
export const SPONSORSHIP_REJECTED_REASON =
  "gas sponsorship rejected the operation — check the Pimlico policy for Sepolia";

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
  /*
   * ERC-4337. Every sponsored action in this app — awakening, giving, shipping, docking, and the
   * stored owner swap a gift depends on — is a UserOperation through Pimlico, so a bundler or
   * paymaster failure is the most likely failure in the whole product. Reported as "internal
   * error" it told the operator nothing; these names are viem's own account-abstraction errors.
   */
  {
    names: [
      "PaymasterDepositTooLowError",
      "PaymasterStakeTooLowError",
      "PaymasterFunctionRevertedError",
      "PaymasterPostOpFunctionRevertedError",
      "PaymasterNotDeployedError",
      "PaymasterRateLimitError",
      "InvalidPaymasterAndDataError",
    ],
    reason: SPONSORSHIP_REJECTED_REASON,
  },
  {
    names: [
      "UserOperationExecutionError",
      "SmartAccountFunctionRevertedError",
      "InitCodeFailedError",
      "InitCodeMustCreateSenderError",
      "HandleOpsOutOfGasError",
      "VerificationGasLimitExceededError",
      "GasValuesOverflowError",
    ],
    reason: "the operation reverted while it was being executed",
  },
  {
    names: [
      "WaitForUserOperationReceiptTimeoutError",
      "UserOperationReceiptNotFoundError",
      "UserOperationNotFoundError",
    ],
    reason: "the operation was accepted by the bundler but has not been mined yet",
  },
  {
    names: ["AccountNotDeployedError", "SenderAlreadyDeployedError", "InvalidAccountNonceError"],
    reason: "the Rock Account's own state did not match the operation",
  },
  {
    names: ["UnknownBundlerError", "InvalidFieldsError"],
    reason: "the bundler refused the operation",
  },
];

/**
 * Bundler failures, recognised by the shape of what they say.
 *
 * A bundler does not throw a typed error: `eth_sendUserOperation` answers with a JSON-RPC error
 * whose `message` is the only thing that distinguishes "your paymaster policy does not cover this"
 * from "your signature is wrong". So these patterns read the message — and that is the one thing
 * the module's own rule forbids doing carelessly, so the rule is kept exactly:
 *
 *   **the message is an input to a boolean, never a source of output.** Every `reason` below is a
 *   fixed string written here. Nothing is captured, interpolated or echoed, so a message carrying
 *   an RPC URL, an API key or a stack classifies to the same fixed sentence as one that does not.
 *
 * The patterns are deliberately narrow — EntryPoint's `AAxx` codes and bundler vocabulary — so
 * they cannot capture an ordinary contract-call failure that the name table already classifies
 * better. Order is specific-before-general: `AA32` is a deadline before it is a paymaster.
 */
const KNOWN_MESSAGES: KnownMessage[] = [
  {
    pattern: /\bAA22\b|\bAA32\b|expired or not due|deadline (?:has )?(?:passed|expired)/i,
    reason: "the operation's deadline had passed — tap the rock again",
  },
  {
    pattern: /\bAA31\b|paymaster (?:deposit|stake) too low/i,
    reason: "the paymaster's deposit is too low to sponsor this operation",
  },
  {
    pattern: /\bAA3\d\b|paymaster|sponsorship polic|not sponsored|no sponsorship/i,
    reason: SPONSORSHIP_REJECTED_REASON,
  },
  {
    pattern: /\bAA21\b|prefund|insufficient funds for gas/i,
    reason: "the account could not pay for the operation and no sponsor covered it",
  },
  {
    pattern: /\bAA24\b|signature error|invalid (?:user ?operation )?signature/i,
    reason: "the operation's signature was not accepted — sign the hand-over again",
  },
  {
    pattern: /\bAA25\b|invalid account nonce|nonce too low/i,
    reason: "the operation's nonce has already been used — prepare it again",
  },
  {
    pattern: /\bAA2[03]\b|account not deployed|sender not deployed/i,
    reason: "the Rock Account is not deployed, so it could not run the operation",
  },
  {
    pattern: /\bAA1\d\b|initcode/i,
    reason: "the Rock Account could not be deployed by the operation",
  },
  {
    pattern: /user ?operation reverted|reverted during simulation|execution reverted during/i,
    reason: "the operation reverted while it was being executed",
  },
  {
    pattern: /replacement (?:transaction )?underpriced|already known/i,
    reason: "an operation with the same nonce is already in flight — wait for it and try again",
  },
  {
    // Anything else EntryPoint numbered. Says where it failed, which is what an operator needs.
    pattern: /\bAA\d\d\b/,
    reason: "the bundler refused the operation",
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
 * The messages in an error and its cause chain, outermost first.
 *
 * Only ever compared against {@link KNOWN_MESSAGES}. Nothing this returns reaches a response body.
 */
function errorMessages(err: unknown, depth = 0): string[] {
  if (!err || typeof err !== "object" || depth > 4) return [];
  const messages: string[] = [];
  const message = (err as { message?: unknown }).message;
  if (typeof message === "string") messages.push(message);
  // viem keeps the bundler's own words here when it wraps a JSON-RPC error.
  const details = (err as { details?: unknown }).details;
  if (typeof details === "string") messages.push(details);
  const cause = (err as { cause?: unknown }).cause;
  return [...messages, ...errorMessages(cause, depth + 1)];
}

/**
 * The reason string for a caught error, safe to put in a response body.
 *
 * Known errors map to a short fixed sentence; everything else is `"internal error"`. Every
 * sentence it can return is written in this file, so no value from the environment, a URL, a query
 * string or a stack can escape through it — including from an error type that did not exist when
 * this was written.
 *
 * Two tables, and the order between them is deliberate:
 *
 *  1. **messages**, matched against bundler vocabulary only (`AAxx` codes, "paymaster", "prefund").
 *     A bundler has no error *type* — its refusal arrives as a JSON-RPC message — and when viem
 *     does wrap one, the wrapper's name (`UserOperationExecutionError`) says far less than the
 *     message inside it. Reading a message to *classify* is safe; the output never quotes it;
 *  2. **names**, viem's stable error names, which is everything else.
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

  // Outermost first, in both tables: the error thrown at the top describes what failed better than
  // the transport error it wraps, and the caller's own layer is the one the user is waiting on.
  for (const message of errorMessages(err)) {
    const known = KNOWN_MESSAGES.find((candidate) => candidate.pattern.test(message));
    if (known) return known.reason;
  }

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
