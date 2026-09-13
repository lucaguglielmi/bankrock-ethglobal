"use client";

import * as React from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { cn } from "@/lib/ui/cn";
import { truncateMiddle } from "@/lib/ui/format";
import { IconButton } from "@/components/ui/icon-button";

const COPIED_RESET_MS = 2000;

/**
 * Renders a transaction hash, middle-truncated (spec 17 §4.6). A hash may
 * only ever originate from a signed, broadcast transaction (spec 15
 * D-014) - this component enforces that at the type level by accepting
 * only a `` `0x${string}` `` of receipt length, never a plain `string`
 * literal, and renders nothing when no real hash exists yet.
 */
export interface TxHashProps {
  value: `0x${string}` | undefined;
  explorerHref?: string;
  onCopy?: (value: string) => void;
  className?: string;
}

function TxHash({ value, explorerHref, onCopy, className }: TxHashProps) {
  const [copied, setCopied] = React.useState(false);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  React.useEffect(() => () => clearTimeout(timeoutRef.current), []);

  const handleCopy = React.useCallback(async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      onCopy?.(value);
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      // Clipboard access denied or unavailable - nothing to fall back to.
    }
  }, [value, onCopy]);

  if (!value) return null;

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
      <span className="truncate font-mono text-caption text-ink-2">
        {truncateMiddle(value)}
      </span>
      <IconButton
        aria-label={copied ? "Copied" : "Copy transaction hash"}
        variant="ghost"
        onClick={handleCopy}
      >
        {copied ? <Check className="text-positive" /> : <Copy />}
      </IconButton>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? "Copied" : ""}
      </span>
      {explorerHref ? (
        <IconButton
          aria-label="View transaction on explorer"
          variant="ghost"
          render={<a href={explorerHref} target="_blank" rel="noreferrer" />}
        >
          <ExternalLink />
        </IconButton>
      ) : null}
    </span>
  );
}

export { TxHash };
