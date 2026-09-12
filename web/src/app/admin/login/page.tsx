"use client";

/**
 * Operator sign-in. One field, at `text-base` so iOS does not zoom on focus (T-9), and a 48 px
 * button. The dark panel with the 14 px monospace passphrase field is gone.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push("/admin");
        return;
      }
      setError("That passphrase was not accepted.");
    } catch {
      setError("The sign-in service could not be reached.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex w-full flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-sm flex-col gap-6 py-12">
        <div className="flex flex-col items-center gap-3 text-center">
          <ShieldCheck aria-hidden className="size-8 text-ink-3" />
          <h1 className="text-h2 font-bold text-ink">Operator sign-in</h1>
          <p className="text-sm text-ink-2">This area is for the people who run Bank Rock.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="admin-passphrase" className="text-label text-ink-3">
              Passphrase
            </label>
            <input
              id="admin-passphrase"
              type="password"
              value={password}
              onChange={(changed) => setPassword(changed.target.value)}
              autoComplete="current-password"
              className="h-12 w-full rounded-xl border border-border bg-background px-4 text-base text-ink placeholder:text-ink-4"
            />
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={isSubmitting || !password}>
            {isSubmitting ? "Checking…" : "Sign in"}
          </Button>

          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
        </form>
      </div>
    </main>
  );
}
