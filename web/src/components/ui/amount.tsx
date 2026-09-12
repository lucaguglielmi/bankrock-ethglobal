import { cn } from "@/lib/ui/cn";
import { defaultMaxFractionDigits, formatAmount } from "@/lib/ui/format";

const SIZE_CLASSES = {
  lg: "text-num-lg font-bold text-ink",
  md: "text-num font-semibold text-ink",
  sm: "text-sm font-semibold text-ink",
} as const;

/**
 * Renders a token amount with tabular figures and token-correct precision
 * (spec 17 §3.3). Always set in Inter, never monospace — monospace is for
 * identifiers, not quantities.
 */
export interface AmountProps {
  value: number | bigint;
  /** Token decimals, used only when `value` is a `bigint`. */
  decimals?: number;
  symbol?: string;
  /** @default per-symbol: USDC/USDT 2, WETH/ETH 4, otherwise 2 */
  maxFractionDigits?: number;
  size?: "lg" | "md" | "sm";
  className?: string;
}

function Amount({
  value,
  decimals,
  symbol,
  maxFractionDigits,
  size = "md",
  className,
}: AmountProps) {
  const digits = maxFractionDigits ?? defaultMaxFractionDigits(symbol);
  const formatted = formatAmount(value, { decimals, maxFractionDigits: digits });

  return (
    <span className={cn("inline-flex items-baseline gap-1.5", className)}>
      <span className={cn("tabular-nums", SIZE_CLASSES[size])}>{formatted}</span>
      {symbol ? <span className="text-sm font-medium text-ink-2">{symbol}</span> : null}
    </span>
  );
}

export { Amount };
