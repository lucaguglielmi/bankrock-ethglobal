"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled App Error:", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-[var(--gutter)] py-16 text-center">
      <div className="mb-6 flex size-16 items-center justify-center rounded-full border border-danger-bg bg-danger-bg shadow-sm">
        <AlertTriangle aria-hidden className="size-8 text-danger" />
      </div>

      <h1 className="mb-3 text-h2 font-bold text-ink">System anomaly detected</h1>

      <p className="mb-8 max-w-prose text-base text-ink-2">
        We&apos;ve encountered an unexpected error processing this interface. Our telemetry has
        been notified.
      </p>

      <Button size="lg" onClick={() => reset()}>
        <RotateCcw aria-hidden />
        Restart interface
      </Button>

      {process.env.NODE_ENV === "development" && (
        <div className="mt-12 w-full max-w-2xl text-left">
          <p className="mb-2 text-label text-danger uppercase">Development trace</p>
          <CodeBlock breakAll>{`${error.message}\n${error.digest ? `digest: ${error.digest}\n` : ""}${error.stack ?? ""}`}</CodeBlock>
        </div>
      )}
    </div>
  );
}
