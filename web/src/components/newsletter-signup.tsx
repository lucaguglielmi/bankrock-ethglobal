"use client";

import { useState } from "react";
import { ArrowRight, Check, Loader2, Sparkles, Mail } from "lucide-react";

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
      // Simulate newsletter registration (can connect to Mailchimp, ConvertKit, or Cloudflare D1)
      await new Promise((resolve) => setTimeout(resolve, 800));

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
    } catch {
      setStatus("error");
      setErrorMessage("Something went wrong. Please try again.");
    }
  };

  return (
    <section className="w-full bg-white text-black py-28 md:py-36 px-6 md:px-12 border-t border-neutral-100 relative overflow-hidden">
      {/* Background subtle radial aura */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-neutral-100/60 blur-[120px] rounded-full pointer-events-none z-0" />

      <div className="max-w-4xl mx-auto flex flex-col items-center text-center relative z-10">
        <div className="inline-flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-widest text-blue-600 mb-6">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Genesis Batch</span>
        </div>

        <h2 className="text-4xl md:text-6xl font-black tracking-tighter mb-6 leading-tight max-w-2xl">
          Notify me on launch.
        </h2>

        <p className="text-lg md:text-xl text-neutral-500 font-medium max-w-xl mx-auto mb-10 leading-relaxed">
          Subscribe to know when and where the first batch of OG Bank Rocks will be released.{" "}
          <span className="text-neutral-700 font-semibold block sm:inline mt-1 sm:mt-0">
            (Likely a global Ethereum convention)
          </span>
        </p>

        {status === "success" ? (
          <div className="w-full max-w-md bg-neutral-50 border border-neutral-200 rounded-3xl p-8 flex flex-col items-center animate-in fade-in zoom-in-95 duration-500">
            <div className="w-12 h-12 rounded-full bg-black text-white flex items-center justify-center mb-4 shadow-md">
              <Check className="w-6 h-6 stroke-[2.5]" />
            </div>
            <h3 className="text-xl font-bold tracking-tight mb-2">You&apos;re on the list</h3>
            <p className="text-sm text-neutral-500 font-medium leading-relaxed">
              We&apos;ll dispatch an alert with exact coordinates, dates, and booth location before the genesis drop goes live.
            </p>
            <div className="mt-4 text-xs font-mono text-neutral-400">
              {email}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="w-full max-w-md flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Mail className="w-5 h-5 text-neutral-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
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
                className="w-full bg-neutral-50 border border-neutral-200 text-black placeholder:text-neutral-400 text-base font-medium rounded-full pl-11 pr-5 py-4 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all shadow-sm"
              />
            </div>
            <button
              type="submit"
              disabled={status === "loading"}
              className="bg-black text-white font-semibold text-base px-8 py-4 rounded-full hover:bg-neutral-800 active:scale-95 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {status === "loading" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Subscribing...</span>
                </>
              ) : (
                <>
                  <span>Notify Me</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {status === "error" && (
          <p className="text-sm text-red-600 font-medium mt-3 animate-in fade-in">
            {errorMessage}
          </p>
        )}

        <div className="mt-8 flex items-center justify-center gap-6 text-xs text-neutral-400 font-medium">
          <span>✓ Zero spam</span>
          <span>•</span>
          <span>✓ Exclusive booth access</span>
          <span>•</span>
          <span>✓ Hand-forged in Tuscany</span>
        </div>
      </div>
    </section>
  );
}
