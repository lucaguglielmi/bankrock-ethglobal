/**
 * Small, pure helpers shared by the rock page views.
 *
 * The important one is `asTxHash`: spec 15 D-014 allows a transaction hash to reach the UI only
 * when it came from a signed, broadcast transaction. Every hash the page renders passes through
 * here first, so a placeholder, an empty string or a "pending" marker can never become an
 * explorer link.
 */

const TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

/** Narrows an unknown value to a real 32-byte transaction hash, or `undefined` (D-014). */
export function asTxHash(value: unknown): `0x${string}` | undefined {
  return typeof value === "string" && TX_HASH_PATTERN.test(value)
    ? (value as `0x${string}`)
    : undefined;
}

/** Case-insensitive address comparison. Returns false when either side is missing. */
export function sameAddress(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Normalises a timestamp that may arrive as unix seconds, unix milliseconds or a numeric string.
 * Returns milliseconds, or null when there is nothing usable — never a substituted "now".
 */
export function toMillis(value: number | bigint | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber) || asNumber <= 0) return null;
  return asNumber < 1e12 ? asNumber * 1000 : asNumber;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "3 days", "5 hours", "12 minutes", "under a minute". Plain English, no seconds ticker. */
export function formatDuration(ms: number): string {
  if (ms >= DAY) {
    const days = Math.floor(ms / DAY);
    return days === 1 ? "1 day" : `${days} days`;
  }
  if (ms >= HOUR) {
    const hours = Math.floor(ms / HOUR);
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }
  if (ms >= MINUTE) {
    const minutes = Math.floor(ms / MINUTE);
    return minutes === 1 ? "1 minute" : `${minutes} minutes`;
  }
  return "under a minute";
}

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

/** Formats an ISO string, epoch value or date. Returns null when the input is not a date. */
export function formatDateTime(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const date = typeof value === "number" ? new Date(value) : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return DATE_TIME_FORMAT.format(date);
}
