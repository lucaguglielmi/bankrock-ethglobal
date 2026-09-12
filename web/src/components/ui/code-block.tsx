"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/ui/cn";
import { IconButton } from "@/components/ui/icon-button";

const COPIED_RESET_MS = 2000;

/**
 * Config snippets and paths (spec 17 §4.6). Horizontally scrollable rather
 * than wrapping by default; pass `breakAll` for a single unbreakable token
 * such as a file path, which wraps at any character instead of overflowing.
 */
export interface CodeBlockProps {
  children: string;
  /** Wrap at any character instead of scrolling — for single long tokens (e.g. a file path). */
  breakAll?: boolean;
  className?: string;
}

function CodeBlock({ children, breakAll = false, className }: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  React.useEffect(() => () => clearTimeout(timeoutRef.current), []);

  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      // Clipboard access denied or unavailable — nothing to fall back to.
    }
  }, [children]);

  return (
    <div
      className={cn(
        "relative rounded-xl border border-border bg-muted/50 py-3 pr-12 pl-4",
        className
      )}
    >
      <pre
        className={cn(
          "font-mono text-caption text-ink-2",
          breakAll ? "break-all whitespace-pre-wrap" : "overflow-x-auto whitespace-pre"
        )}
      >
        <code>{children}</code>
      </pre>
      <IconButton
        aria-label={copied ? "Copied" : "Copy code"}
        variant="ghost"
        onClick={handleCopy}
        className="absolute top-1 right-1"
      >
        {copied ? <Check className="text-positive" /> : <Copy />}
      </IconButton>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? "Copied" : ""}
      </span>
    </div>
  );
}

/** An inline `font-mono text-caption` span for a short identifier within running text. */
function InlineCode({ className, ...props }: React.ComponentProps<"code">) {
  return (
    <code
      className={cn(
        "rounded bg-muted px-1.5 py-0.5 font-mono text-caption text-ink-2",
        className
      )}
      {...props}
    />
  );
}

export { CodeBlock, InlineCode };
