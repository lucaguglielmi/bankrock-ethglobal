/**
 * Bank Rock structured telemetry (specs/10-telemetry-and-observability.md).
 *
 * Security and privacy contract (SA-2, SA-3 and the Privacy finding in spec 15 §1.4):
 *
 *  - PII is redacted **before** an entry reaches the buffer or stdout, so there is no window in
 *    which an unredacted value exists in the ring buffer;
 *  - email addresses become `a***@domain`, EVM addresses become `0x1234…abcd`, NFC tag UIDs keep
 *    only their last two bytes, and any URL keeps only its origin - a provider URL carries its API
 *    key in the path or the query, and viem puts that URL into its error text (audit P-15);
 *  - stack traces are dropped in production - they reach an operator through the platform's own
 *    logs, never through an HTTP-readable buffer;
 *  - the buffer is readable only by an operator holding ADMIN_API_KEY (see /api/telemetry), and
 *    there is no ingestion endpoint: server code calls this module directly.
 */

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: {
    rockId?: string | number;
    userId?: string;
    action?: string;
    txHash?: string;
    latencyMs?: number;
    path?: string;
    statusCode?: number;
    [key: string]: unknown;
  };
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface TelemetryMetrics {
  uptimeSeconds: number;
  totalLogs: number;
  errorCount: number;
  warnCount: number;
  avgLatencyMs: number | null;
  recentErrors: LogEntry[];
}

const startTime = Date.now();
const MAX_LOGS = 200;
const logRingBuffer: LogEntry[] = [];
let totalLatencySum = 0;
let latencyMeasurementsCount = 0;
let logSequence = 0;

/* -------------------------------------------------------------------------- */
/* Redaction                                                                   */
/* -------------------------------------------------------------------------- */

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/**
 * URLs that carry a credential (audit P-15).
 *
 * viem puts the RPC URL into its error text, and `SEPOLIA_RPC_URL` carries the provider's API key
 * in its path (`…/v2/<key>`); Pimlico carries it in a query string (`?apikey=…`). Both reach this
 * buffer through a caught error, and the buffer is served - to an operator, but served. So a URL
 * is reduced to its origin plus a marker before it is stored, whatever else redaction does.
 *
 * Matched before emails, because `https://user:pass@host` contains no `@`-delimited address but
 * would otherwise survive.
 */
const URL_PATTERN = /\b(?:https?|wss?):\/\/[^\s"'<>)\]]+/gi;
// An EVM address is exactly 40 hex digits. The trailing boundary keeps a 64-hex transaction
// hash - which is not PII - from being mangled into address form.
const EVM_ADDRESS_PATTERN = /0x[a-fA-F0-9]{40}(?![a-fA-F0-9])/g;

/**
 * `https://eth.example.com/v2/SECRET?apikey=SECRET` -> `https://eth.example.com/[redacted]`.
 *
 * Keeps the origin, which is the part an operator needs to tell one provider from another, and
 * drops everything after it - path, query and userinfo - because any of the three can be the
 * credential.
 */
export function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    const hasCredential =
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      url.pathname.replace(/\/+$/, "") !== "";
    return hasCredential ? `${url.protocol}//${url.hostname}/[redacted]` : `${url.protocol}//${url.hostname}`;
  } catch {
    return "[redacted url]";
  }
}

/** `alice@example.com` -> `a***@example.com`. */
export function redactEmail(value: string): string {
  const at = value.lastIndexOf("@");
  if (at <= 0) return "***";
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  return `${local[0]}***@${domain}`;
}

/** `0x1234567890abcdef…` -> `0x1234…abcd`. */
export function redactAddress(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 10) return "0x…";
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
}

/** An NFC tag UID keeps only its last two bytes. */
export function redactUid(value: string): string {
  const hex = String(value).replace(/[^A-Fa-f0-9]/g, "");
  if (hex.length <= 4) return hex;
  return `…${hex.slice(-4)}`;
}

/** Redacts every email address and EVM address inside a free-text string. */
export function redactText(value: string): string {
  return value
    .replace(URL_PATTERN, (match) => redactUrl(match))
    .replace(EMAIL_PATTERN, (match) => redactEmail(match))
    .replace(EVM_ADDRESS_PATTERN, (match) => redactAddress(match));
}

const UID_KEYS = new Set(["uid", "taguid", "nfcuid", "chipuid", "piccuid"]);
const EMAIL_KEYS = new Set(["email", "to", "recipient", "from", "alertemail", "emailaddress"]);
const ADDRESS_KEYS = new Set([
  "address",
  "wallet",
  "walletaddress",
  "owner",
  "owneraddress",
  "recipientaddress",
  "smartaccount",
  "account",
  "maker",
  "signer",
]);
const DROP_KEYS = new Set(["stack", "privatekey", "secret", "apikey", "token", "authorization"]);

function redactValue(key: string, value: unknown, depth: number): unknown {
  const normalisedKey = key.toLowerCase().replace(/[^a-z]/g, "");

  if (DROP_KEYS.has(normalisedKey)) return "[redacted]";

  if (typeof value === "string") {
    if (UID_KEYS.has(normalisedKey)) return redactUid(value);
    if (EMAIL_KEYS.has(normalisedKey)) {
      return value.includes("@") ? redactEmail(value) : redactText(value);
    }
    if (ADDRESS_KEYS.has(normalisedKey)) return redactAddress(value);
    return redactText(value);
  }

  if (Array.isArray(value)) {
    if (depth >= 4) return "[…]";
    return value.map((item) => redactValue(key, item, depth + 1));
  }

  if (value && typeof value === "object") {
    if (depth >= 4) return "[…]";
    const out: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      out[childKey] = redactValue(childKey, childValue, depth + 1);
    }
    return out;
  }

  return value;
}

/** Redacts a log context object. Exported for tests. */
export function redactContext(
  context: LogEntry["context"] | undefined,
): LogEntry["context"] | undefined {
  if (!context) return undefined;
  return redactValue("context", context, 0) as LogEntry["context"];
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/* -------------------------------------------------------------------------- */
/* Logger                                                                      */
/* -------------------------------------------------------------------------- */

function generateLogId(): string {
  logSequence += 1;
  return `log_${Date.now()}_${logSequence.toString(36)}`;
}

function pushLog(entry: LogEntry): void {
  const safeEntry: LogEntry = {
    ...entry,
    message: redactText(entry.message),
    context: redactContext(entry.context),
    error: entry.error
      ? {
          name: entry.error.name,
          message: redactText(entry.error.message),
          // Stack traces are dropped in production: they leak paths, and this buffer is served
          // over HTTP.
          ...(isProduction() || !entry.error.stack
            ? {}
            : { stack: redactText(entry.error.stack) }),
        }
      : undefined,
  };

  if (logRingBuffer.length >= MAX_LOGS) {
    logRingBuffer.shift();
  }
  logRingBuffer.push(safeEntry);

  if (typeof safeEntry.context?.latencyMs === "number") {
    totalLatencySum += safeEntry.context.latencyMs;
    latencyMeasurementsCount++;
  }

  const jsonStr = JSON.stringify(safeEntry);
  if (safeEntry.level === "ERROR") {
    console.error(jsonStr);
  } else if (safeEntry.level === "WARN") {
    console.warn(jsonStr);
  } else {
    console.log(jsonStr);
  }
}

export const logger = {
  debug(message: string, context?: LogEntry["context"]) {
    pushLog({
      id: generateLogId(),
      timestamp: new Date().toISOString(),
      level: "DEBUG",
      message,
      context,
    });
  },

  info(message: string, context?: LogEntry["context"]) {
    pushLog({
      id: generateLogId(),
      timestamp: new Date().toISOString(),
      level: "INFO",
      message,
      context,
    });
  },

  warn(message: string, context?: LogEntry["context"]) {
    pushLog({
      id: generateLogId(),
      timestamp: new Date().toISOString(),
      level: "WARN",
      message,
      context,
    });
  },

  error(message: string, err?: unknown, context?: LogEntry["context"]) {
    const errorDetails =
      err instanceof Error
        ? {
            name: err.name,
            message: err.message,
            stack: err.stack,
          }
        : err
          ? { name: "UnknownError", message: String(err) }
          : undefined;

    pushLog({
      id: generateLogId(),
      timestamp: new Date().toISOString(),
      level: "ERROR",
      message,
      context,
      error: errorDetails,
    });
  },
};

/**
 * Queries the in-memory buffer. Callers must already have authenticated the operator: this
 * returns redacted but still operationally sensitive data.
 */
export function queryTelemetryLogs(filter?: {
  level?: LogLevel;
  rockId?: string | number;
  userId?: string;
  limit?: number;
}): LogEntry[] {
  let results = [...logRingBuffer];

  if (filter?.level) {
    results = results.filter((l) => l.level === filter.level);
  }
  if (filter?.rockId !== undefined) {
    results = results.filter((l) => String(l.context?.rockId) === String(filter.rockId));
  }
  if (filter?.userId) {
    results = results.filter((l) => l.context?.userId === filter.userId);
  }

  const limit = Math.min(Math.max(filter?.limit || 50, 1), MAX_LOGS);
  return results.slice(-limit).reverse();
}

/**
 * Aggregated health metrics.
 *
 * `avgLatencyMs` is null when nothing has been measured - a nominal placeholder would be a
 * fabricated number (D-013).
 */
export function getTelemetryMetrics(): TelemetryMetrics {
  const errors = logRingBuffer.filter((l) => l.level === "ERROR");
  const warns = logRingBuffer.filter((l) => l.level === "WARN");

  return {
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    totalLogs: logRingBuffer.length,
    errorCount: errors.length,
    warnCount: warns.length,
    avgLatencyMs:
      latencyMeasurementsCount > 0
        ? Math.round(totalLatencySum / latencyMeasurementsCount)
        : null,
    recentErrors: errors.slice(-5).reverse(),
  };
}
