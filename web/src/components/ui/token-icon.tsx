import { cn } from "@/lib/ui/cn";
import type { TokenSymbol } from "@/lib/chain";

/**
 * The two token glyphs, drawn in the site's ink so they sit beside text without a colour of
 * their own: USDC as a coin, WETH as the diamond. `currentColor` throughout, so a chip that
 * inverts (ink on white to white on ink) inverts the glyph with it.
 */
export interface TokenIconProps {
  symbol: TokenSymbol;
  /** CSS size class for the glyph. @default "size-5" */
  className?: string;
}

export function TokenIcon({ symbol, className }: TokenIconProps) {
  const classes = cn("shrink-0", className ?? "size-5");
  if (symbol === "USDC") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className={classes} fill="none">
        <circle cx="12" cy="12" r="9.25" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M14.6 9.4c-.3-1-1.2-1.6-2.6-1.6-1.6 0-2.6.8-2.6 1.9 0 .9.6 1.4 2 1.7l1.4.3c1.6.4 2.4 1 2.4 2.2 0 1.3-1.1 2.2-2.9 2.2-1.6 0-2.7-.7-3-1.8M12 6.2v1.6M12 16.1v1.7"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={classes} fill="none">
      <path
        d="M12 2.8 6.2 12.2 12 15.6l5.8-3.4L12 2.8Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="m6.2 13.6 5.8 7.6 5.8-7.6L12 17l-5.8-3.4Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
