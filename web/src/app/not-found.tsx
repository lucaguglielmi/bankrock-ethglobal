import Link from "next/link";
import { Ghost } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-[var(--gutter)] py-16 text-center">
      <div className="mb-8 flex size-20 rotate-12 items-center justify-center rounded-3xl border border-border bg-neutral-50 shadow-sm">
        <Ghost aria-hidden className="size-10 -rotate-12 text-ink-4" />
      </div>

      <h1 className="mb-4 text-h1 font-extrabold text-ink">Void space</h1>

      <p className="mb-10 max-w-prose text-lead text-ink-2">
        The page or asset you are looking for does not exist on this ledger.
      </p>

      <Button size="lg" render={<Link href="/" />}>
        Return home
      </Button>
    </div>
  );
}
