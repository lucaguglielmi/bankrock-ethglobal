/**
 * Pure formatting helpers shared by the `Amount`, `Address` and `TxHash`
 * primitives. No React, no DOM - safe to unit test in isolation.
 */

/** Default `maxFractionDigits` for `<Amount>` by token symbol (spec 17 §3.3). */
const DEFAULT_MAX_FRACTION_DIGITS: Record<string, number> = {
  USDC: 2,
  USDT: 2,
  WETH: 4,
  ETH: 4,
};

/** Looks up the default fraction-digit precision for a token symbol. */
export function defaultMaxFractionDigits(symbol?: string): number {
  if (!symbol) return 2;
  return DEFAULT_MAX_FRACTION_DIGITS[symbol.toUpperCase()] ?? 2;
}

/** 10n ** BigInt(exponent), spelled without bigint literal syntax (tsconfig targets ES2017). */
function pow10(exponent: number): bigint {
  let result = BigInt(1);
  const base = BigInt(10);
  for (let i = 0; i < exponent; i += 1) result *= base;
  return result;
}

/**
 * Converts a raw token amount to a display-ready JS number.
 * When `value` is a `bigint`, `decimals` is the token's on-chain decimals
 * (e.g. 6 for USDC, 18 for WETH) and the conversion is done in integer
 * arithmetic before the final division, so it does not lose precision the
 * way `Number(value) / 10 ** decimals` can for large balances.
 */
export function toDisplayNumber(value: number | bigint, decimals?: number): number {
  if (typeof value === "number") return value;
  const d = decimals ?? 0;
  if (d <= 0) return Number(value);

  const zero = BigInt(0);
  const negative = value < zero;
  const abs = negative ? -value : value;
  const divisor = pow10(d);
  const whole = abs / divisor;
  const fraction = (abs % divisor).toString().padStart(d, "0");
  const num = Number(`${whole.toString()}.${fraction}`);
  return negative ? -num : num;
}

export interface FormatAmountOptions {
  /** Token decimals, used only when `value` is a `bigint`. */
  decimals?: number;
  maxFractionDigits?: number;
  minFractionDigits?: number;
}

/** Formats a token amount with `Intl.NumberFormat`, never more precise than `maxFractionDigits`. */
export function formatAmount(
  value: number | bigint,
  { decimals, maxFractionDigits = 2, minFractionDigits = 0 }: FormatAmountOptions = {}
): string {
  const num = toDisplayNumber(value, decimals);
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: maxFractionDigits,
    minimumFractionDigits: Math.min(minFractionDigits, maxFractionDigits),
  }).format(num);
}

/**
 * Middle-truncates a long identifier, e.g. an address or tx hash:
 * `truncateMiddle("0x71C8...1b47c9", 6, 4)` -> `"0x71C8…1b47"`.
 * Returns the value unchanged if it is already short enough.
 */
export function truncateMiddle(value: string, headLen = 6, tailLen = 4): string {
  if (value.length <= headLen + tailLen + 1) return value;
  return `${value.slice(0, headLen)}…${value.slice(-tailLen)}`;
}
