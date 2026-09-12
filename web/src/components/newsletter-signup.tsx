"use client";

import { useState } from "react";
import { ArrowRight, Check, Loader2, Sparkles, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NewsletterSignup() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      setStatus("error");
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    setStatus("loading");
    setErrorMessage("");

    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "landing_page" }),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        throw new Error(data.error || "Failed to join newsletter.");
      }

      // Save locally to prevent re-prompting
      if (typeof window !== "undefined") {
        try {
          const existing = JSON.parse(localStorage.getItem("bankrock_subscribers") || "[]");
          existing.push({ email, timestamp: new Date().toISOString() });
          localStorage.setItem("bankrock_subscribers", JSON.stringify(existing));
        } catch {
          // ignore localStorage issues
        }
      }

      setStatus("success");
    } catch (err: unknown) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <section className="relative w-full overflow-hidden border-t border-neutral-100 bg-white px-[var(--gutter)] py-16 text-ink sm:py-24">
      {/* Background subtle radial aura */}
      <div className="pointer-events-none absolute top-1/2 left-1/2 z-0 h-[350px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-neutral-100/60 blur-[120px]" />

      <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center text-center">
        <div className="mb-6 inline-flex items-center gap-2 text-label uppercase text-link">
          <Sparkles className="size-3.5" aria-hidden />
          <span>Genesis Batch</span>
        </div>

        <h2 className="mb-6 max-w-2xl text-h2 font-bold">Notify me on launch.</h2>

        <p className="mx-auto mb-10 max-w-prose text-lead text-ink-2">
          Subscribe to know when and where the first batch of OG Bank Rocks will be released.{" "}
          <span className="mt-1 block font-semibold text-ink sm:mt-0 sm:inline">
            (Likely a global Ethereum convention)
          </span>
        </p>

        {status === "success" ? (
          <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-500 flex w-full max-w-md flex-col items-center rounded-3xl border border-neutral-200 bg-neutral-50 p-8">
            <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
              <Check className="size-6 stroke-[2.5]" aria-hidden />
            </div>
            <h3 className="mb-2 text-h3 font-semibold">You&apos;re on the list</h3>
            <p className="text-sm text-ink-2">
              We&apos;ll dispatch an alert with exact coordinates, dates, and booth location before the genesis drop goes live.
            </p>
            <div className="mt-4 text-caption text-ink-3">{email}</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex w-full max-w-md flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Mail className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-4" aria-hidden />
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (status === "error") setStatus("idle");
                }}
                placeholder="vitalik@ethereum.org"
                aria-label="Email address"
                required
                className="h-14 w-full rounded-full border border-neutral-200 bg-neutral-50 pr-5 pl-11 text-base font-medium text-ink placeholder:text-ink-4 shadow-sm outline-none transition-all focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2"
              />
            </div>
            <Button type="submit" size="lg" disabled={status === "loading"} className="w-full sm:w-auto">
              {status === "loading" ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  <span>Subscribing…</span>
                </>
              ) : (
                <>
                  <span>Notify Me</span>
                  <ArrowRight className="size-4" aria-hidden />
                </>
              )}
            </Button>
          </form>
        )}

        {status === "error" && (
          <p className="motion-safe:animate-in motion-safe:fade-in mt-3 text-sm text-danger">{errorMessage}</p>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-ink-3">
          <span>✓ Zero spam</span>
          <span>✓ Exclusive booth access</span>
          <span>✓ Hand-forged in Tuscany</span>
        </div>
      </div>
    </section>
  );
}
