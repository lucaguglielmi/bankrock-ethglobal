"use client";

/**
 * The alerts page (spec 17 Part 5 "Alerts"; spec 15 Part 3 "Alerts delivery: UNAVAILABLE").
 *
 * Typography and targets fixed: `text-base` body and inputs, 24 px checkbox with a 44 px label,
 * 48 and 56 px buttons, nothing below 13 px, and the full-viewport-height wrapper replaced by the
 * page frame in `globals.css`. `usePrivy()` is replaced by `useAuth()`, which is safe when no
 * Privy app is configured (A-2).
 *
 * The page also stops implying that saving a preference means an alert will arrive: nothing
 * dispatches yet, and it says so before asking for an address.
 */

import { useState } from "react";
import { BellRing, Check, Info, Mail, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { cn } from "@/lib/ui/cn";

const TOPICS = [
  {
    id: "dangerousTrade",
    title: "Large trade",
    description: "When one trade takes a big share of what a rock holds.",
  },
  {
    id: "highSlippage",
    title: "Poor price",
    // After the hackathon: an agent that rebalances within bounds (D-010) may need this topic; no rebalancer exists today (D-035), so it describes visitor trades.
    description: "When a trade against your rock settles at a noticeably worse price than its quote.",
  },
  {
    id: "profitLoss",
    title: "Weekly summary",
    description: "One message a week with what your rocks did.",
  },
] as const;

type TopicId = (typeof TOPICS)[number]["id"];

function maskEmail(email: string): string {
  if (!email.includes("@")) return email;
  const [name, domain] = email.split("@");
  if (name.length <= 3) return `${name}***@${domain}`;
  return `${name.slice(0, 3)}***@${domain}`;
}

export default function AlertsPage() {
  const { user } = useAuth();

  // The signed-in address is the default; an edit is an override on top of it. Deriving it here
  // rather than copying it in an effect keeps the field correct the moment the session resolves.
  const [emailEdit, setEmailEdit] = useState<string | null>(null);
  const [isEditingOverride, setEditingOverride] = useState<boolean | null>(null);
  const email = emailEdit ?? user?.email?.address ?? "";
  const isEditingEmail = isEditingOverride ?? !user?.email?.address;
  const [selected, setSelected] = useState<Record<TopicId, boolean>>({
    dangerousTrade: true,
    highSlippage: true,
    profitLoss: false,
  });
  const [consent, setConsent] = useState(false);
  const [step, setStep] = useState<"edit" | "confirm" | "saved">("edit");
  const [error, setError] = useState<string | null>(null);

  const confirmSubscription = async () => {
    setError(null);
    try {
      const topics = (Object.keys(selected) as TopicId[]).filter((id) => selected[id]);
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: topics.join(",") }),
      });
      if (!res.ok) {
        setStep("edit");
        setError("Your preferences could not be saved.");
        return;
      }
      setStep("saved");
    } catch {
      setStep("edit");
      setError("Your preferences could not be saved.");
    }
  };

  const displayEmail = !isEditingEmail && email ? maskEmail(email) : email;

  return (
    <main className="flex w-full flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-12 py-6">
        <header className="flex flex-col gap-4">
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-muted px-3 py-1 text-label text-ink-3">
            <BellRing aria-hidden className="size-4" />
            Alerts
          </span>
          <h1 className="text-h1 font-extrabold text-ink">Stay on top of your rocks.</h1>
          <p className="max-w-prose text-lead text-ink-2">
            Choose what is worth telling you about. Nothing is sent yet — there is no delivery
            behind these preferences — so this is a standing request, not a subscription. That is
            by design until Bank Rock is on mainnet.
          </p>
        </header>

        <section className="flex flex-col gap-6 rounded-3xl border border-border p-4 sm:p-6">
          <h2 className="flex items-center gap-2 text-h2 font-bold text-ink">
            <Mail aria-hidden className="size-5 shrink-0" />
            Email
          </h2>

          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <label htmlFor="alerts-email" className="text-label text-ink-3">
                Email address
              </label>
              {!isEditingEmail ? (
                <Button variant="ghost" size="sm" onClick={() => setEditingOverride(true)}>
                  Change
                </Button>
              ) : null}
            </div>

            {isEditingEmail ? (
              <input
                id="alerts-email"
                type="email"
                required
                value={email}
                onChange={(changed) => setEmailEdit(changed.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="h-12 w-full rounded-xl border border-border bg-background px-4 text-base text-ink placeholder:text-ink-4"
              />
            ) : (
              <p className="flex h-12 items-center rounded-xl border border-border px-4 text-base text-ink-2">
                <span className="truncate">{displayEmail}</span>
              </p>
            )}

            <p className="flex max-w-prose items-start gap-2 text-sm text-ink-3">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
              This only changes where alerts would be sent. It does not change how you sign in.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-label text-ink-3">What to tell you about</h3>
            <ul className="flex flex-col gap-2">
              {TOPICS.map((topic) => {
                const isOn = selected[topic.id];
                return (
                  <li key={topic.id}>
                    <label
                      className={cn(
                        "flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border p-3 motion-safe:transition-colors",
                        isOn ? "border-ink" : "border-border hover:bg-muted",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isOn}
                        onChange={() =>
                          setSelected((previous) => ({ ...previous, [topic.id]: !previous[topic.id] }))
                        }
                        className="mt-0.5 size-6 shrink-0 accent-ink"
                      />
                      <span className="flex flex-col gap-1">
                        <span className="text-sm font-semibold text-ink">{topic.title}</span>
                        <span className="max-w-prose text-sm text-ink-2">{topic.description}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>

          <label className="flex min-h-11 cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={consent}
              onChange={(changed) => setConsent(changed.target.checked)}
              className="mt-0.5 size-6 shrink-0 accent-ink"
            />
            <span className="max-w-prose text-sm text-ink-2">
              Store my email address so Bank Rock can write to me. I can ask for it to be removed
              at any time.
            </span>
          </label>

          {step === "edit" ? (
            <Button
              size="lg"
              className="w-full"
              disabled={!email || !consent}
              onClick={() => setStep("confirm")}
            >
              Continue
            </Button>
          ) : null}

          {step === "confirm" ? (
            <div className="flex flex-col gap-4 rounded-2xl border border-ink p-4">
              <p className="max-w-prose text-base text-ink">
                Save {displayEmail} as the address for these alerts?
              </p>
              <div className="flex flex-col gap-3 sm:flex-row-reverse">
                <Button size="lg" className="w-full sm:flex-1" onClick={confirmSubscription}>
                  Yes, save it
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full sm:flex-1"
                  onClick={() => setStep("edit")}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}

          {step === "saved" ? (
            <p className="flex items-center gap-2 text-base font-medium text-positive">
              <Check aria-hidden className="size-5 shrink-0" />
              Saved. Nothing will arrive until delivery exists.
            </p>
          ) : null}

          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </section>

        <section className="flex flex-col gap-6 rounded-3xl border border-border p-4 sm:p-6">
          <h2 className="flex items-center gap-2 text-h2 font-bold text-ink">
            <Smartphone aria-hidden className="size-5 shrink-0" />
            On your phone
          </h2>
          <p className="max-w-prose text-base text-ink-2">
            Bank Rock can be added to your home screen and ask for notification permission there.
            Permission is all it is: no notification is sent yet.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-3 rounded-2xl border border-border p-4">
              <h3 className="text-h3 font-semibold text-ink">iPhone</h3>
              <ol className="list-inside list-decimal space-y-2 text-sm text-ink-2">
                <li>Open this site in Safari.</li>
                <li>Tap the Share icon.</li>
                <li>Tap Add to Home Screen.</li>
                <li>Open Bank Rock from your home screen.</li>
                <li>Allow notifications when asked.</li>
              </ol>
            </div>

            <div className="flex flex-col gap-3 rounded-2xl border border-border p-4">
              <h3 className="text-h3 font-semibold text-ink">Android</h3>
              <ol className="list-inside list-decimal space-y-2 text-sm text-ink-2">
                <li>Open this site in Chrome.</li>
                <li>Open the menu.</li>
                <li>Tap Install app.</li>
                <li>Open Bank Rock from your home screen.</li>
                <li>Allow notifications when asked.</li>
              </ol>
            </div>
          </div>

          <p className="flex max-w-prose items-start gap-2 text-sm text-ink-3">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
            Permission is per device. Adding the app on a second phone asks again.
          </p>
        </section>
      </div>
    </main>
  );
}
