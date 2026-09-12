"use client";

import * as React from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { cn } from "@/lib/ui/cn";
import { truncateMiddle } from "@/lib/ui/format";
import { IconButton } from "@/components/ui/icon-button";

const COPIED_RESET_MS = 2000;

/**
 * Middle-truncates a long identifier with a 44 px copy button and an
 * optional explorer link (spec 17 §4.6). The caller supplies `explorerHref`
 * — this component never computes an explorer URL itself.
 */
export interface AddressProps {
  value: string;
  /** Renders an explorer `IconButton` when provided. */
  explorerHref?: string;
  onCopy?: (value: string) => void;
  className?: string;
}

function Address({ value, explorerHref, onCopy, className }: AddressProps) {
  const [copied, setCopied] = React.useState(false);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  React.useEffect(() => () => clearTimeout(timeoutRef.current), []);

  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      onCopy?.(value);
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      // Clipboard access denied or unavailable — nothing to fall back to.
    }
  }, [value, onCopy]);

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
      <span className="truncate font-mono text-caption text-ink-2">
        {truncateMiddle(value)}
      </span>
      <IconButton
        aria-label={copied ? "Copied" : "Copy address"}
        variant="ghost"
        onClick={handleCopy}
      >
        {copied ? <Check className="text-positive" /> : <Copy />}
      </IconButton>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? "Copied" : ""}
      </span>
      {explorerHref ? (
        <IconButton aria-label="View on explorer" variant="ghost" render={<a href={explorerHref} target="_blank" rel="noreferrer" />}>
          <ExternalLink />
        </IconButton>
      ) : null}
    </span>
  );
}

export { Address };
