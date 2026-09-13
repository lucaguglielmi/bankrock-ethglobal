"use client";

/**
 * Onboarding sheet (spec 15 X-1, A-1/A-2; spec 17 Part 5 "Onboarding sheet").
 *
 * What this file used to be: `useEffect` was called **after** `if (!isOpen) return null`, so the
 * hook count changed 1 → 2 the moment the modal opened and React threw "Rendered more hooks than
 * during the previous render" - on the primary login path (X-1). It also promised a Safe on Base
 * Sepolia and a "Live Yield" reserve.
 *
 * What it is now: a `Sheet` that is always rendered and simply passed `open`, so every hook runs
 * on every render, in the same order, always. When sign-in cannot work at all - no configured
 * Privy app - it renders the UNAVAILABLE state with the reason instead of a button that would do
 * nothing (A-1: there is no fabricated wallet to fall back to any more).
 */

import * as React from "react";
import { KeyRound, ShieldCheck, Sparkles } from "lucide-react";
import { Sheet, SheetBody } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { useAuth } from "@/context/auth-context";

interface PrivyOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  rockId: string;
  onAuthenticated?: () => void;
}

const STEPS = [
  {
    label: "STEP 1",
    icon: KeyRound,
    title: "Sign in",
    body: "With an email address or a wallet you already have. No seed phrase to write down, no extension to install.",
  },
  {
    label: "STEP 2",
    icon: ShieldCheck,
    title: "The rock gets its own account",
    body: "An account that only you control. Its address and its history stay with the rock, even when you give it away.",
  },
  {
    label: "STEP 3",
    icon: Sparkles,
    title: "Put something in it",
    body: "Whatever the rock holds is yours, and you can take it out again whenever you want.",
  },
] as const;

/** `google_oauth` -> `Google`, `email` -> `Email`, `wallet` -> `Wallet` (STEERING: login UX). */
function prettyLoginMethod(method: string): string {
  const cleaned = method.replace(/_oauth$/i, "").replace(/[_-]+/g, " ").trim();
  if (cleaned === "") return method;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function PrivyOnboardingModal({
  isOpen,
  onClose,
  rockId,
  onAuthenticated,
}: PrivyOnboardingModalProps) {
  const { ready, authenticated, unavailable, unavailableReason, lastLoginMethod, login } =
    useAuth();

  const [error, setError] = React.useState<string | null>(null);
  const wasAuthenticated = React.useRef(authenticated);

  // Fires once, when the session actually appears while this sheet is open.
  React.useEffect(() => {
    const justAuthenticated = authenticated && !wasAuthenticated.current;
    wasAuthenticated.current = authenticated;
    if (!isOpen || !justAuthenticated) return;
    onClose();
    onAuthenticated?.();
  }, [isOpen, authenticated, onClose, onAuthenticated]);

  const handleLogin = React.useCallback(async () => {
    setError(null);
    try {
      await login();
    } catch {
      setError("Sign-in did not complete. Nothing was created.");
    }
  }, [login]);

  const footer = unavailable ? null : (
    <div className="flex flex-col gap-2">
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {lastLoginMethod ? (
        <p className="text-sm text-ink-2">
          Last time you used {prettyLoginMethod(lastLoginMethod)}.
        </p>
      ) : null}
      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={!ready}
        onClick={handleLogin}
      >
        <span className="motion-safe:transition-opacity">
          {ready ? "Continue with email or wallet" : "One moment…"}
        </span>
      </Button>
    </div>
  );

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Sign in to use this rock"
      description={`Rock #${rockId} needs to know who you are before it can do anything for you.`}
      footer={footer}
    >
      <SheetBody className="flex flex-col gap-4">
        {unavailable ? (
          <UnavailableState
            reason={unavailableReason ?? "Sign-in is not configured."}
          />
        ) : (
          <ol className="flex flex-col gap-3">
            {STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <li
                  key={step.label}
                  className="flex items-start gap-3 rounded-2xl border border-border p-4"
                >
                  <Icon aria-hidden className="mt-1 size-5 shrink-0 text-ink-3" />
                  <div className="min-w-0">
                    <span className="text-label text-ink-3">{step.label}</span>
                    <h3 className="mt-1 text-base font-semibold text-ink">{step.title}</h3>
                    <p className="mt-1 max-w-prose text-sm text-ink-2">{step.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </SheetBody>
    </Sheet>
  );
}
