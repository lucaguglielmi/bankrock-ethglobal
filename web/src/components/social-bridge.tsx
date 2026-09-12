"use client";

/**
 * Naming a rock (spec 15 S-7; spec 17 Part 5 "Social bridge").
 *
 * "Claim your vanity URL" used to be an 800 ms `setTimeout` that saved nothing and then said
 * "Claimed!". It now posts to `/api/rocks/[id]/vanity` with the Privy access token the route
 * requires, and reports what the route actually answered — including a refusal.
 *
 * The Privy `linkEmail` / `linkTwitter` buttons are gone with it: they came from `usePrivy()`,
 * which throws when no Privy app is configured (A-2), and the page must render in that case.
 * Whatever the session already carries is shown; nothing is invented.
 */

import { useState } from "react";
import { Check, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { useAuth } from "@/context/auth-context";
import { appUrl } from "@/lib/chain";

type ClaimState = "idle" | "saving" | "saved" | "error";

export function SocialBridge({ rockId }: { rockId: string }) {
  const { authenticated, user, getAccessToken, login, unavailable, unavailableReason } = useAuth();
  const [vanityName, setVanityName] = useState("");
  const [claimState, setClaimState] = useState<ClaimState>("idle");
  const [error, setError] = useState<string | null>(null);

  const email = user?.email?.address;

  const handleClaim = async () => {
    setClaimState("saving");
    setError(null);

    const token = await getAccessToken();
    if (!token) {
      setClaimState("error");
      setError("Sign in again to claim a name.");
      return;
    }

    try {
      const res = await fetch(`/api/rocks/${encodeURIComponent(rockId)}/vanity`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ vanityName: vanityName.trim().toLowerCase() }),
      });
      const data = (await res.json()) as { state?: string; reason?: string; error?: string };

      if (!res.ok || data.state === "UNAVAILABLE") {
        setClaimState("error");
        setError(data.error ?? data.reason ?? "That name could not be saved.");
        return;
      }

      setClaimState("saved");
    } catch {
      setClaimState("error");
      setError("That name could not be saved.");
    }
  };

  return (
    <section className="flex w-full flex-col gap-6 rounded-3xl border border-border p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <h3 className="text-h3 font-semibold text-ink">Name this rock</h3>
        <p className="max-w-prose text-sm text-ink-2">
          Give Rock #{rockId} a short name so it is easy to share.
        </p>
      </div>

      {unavailable ? (
        <UnavailableState reason={unavailableReason ?? "Sign-in is not configured."} />
      ) : !authenticated ? (
        <UnavailableState
          reason="Sign in to name this rock."
          action={{ label: "Sign in", onClick: () => void login() }}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {email ? (
            <p className="flex min-w-0 items-center gap-2 text-sm text-ink-3">
              <Mail aria-hidden className="size-4 shrink-0" />
              <span className="truncate">{email}</span>
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <label htmlFor="vanity-name" className="text-label text-ink-3">
              {appUrl}/r/
            </label>
            <input
              id="vanity-name"
              type="text"
              value={vanityName}
              onChange={(changed) => {
                setVanityName(changed.target.value);
                setClaimState("idle");
              }}
              placeholder="your-name"
              autoComplete="off"
              spellCheck={false}
              disabled={claimState === "saved"}
              className="h-12 w-full rounded-xl border border-border bg-background px-4 text-base text-ink placeholder:text-ink-4"
            />
            <p className="max-w-prose text-sm text-ink-3">
              Three to thirty-two characters: lowercase letters, digits and hyphens.
            </p>
          </div>

          <Button
            className="w-full sm:w-auto"
            onClick={handleClaim}
            disabled={claimState === "saving" || claimState === "saved" || vanityName.trim().length < 3}
          >
            {claimState === "saving" ? "Saving…" : claimState === "saved" ? "Name claimed" : "Claim this name"}
          </Button>

          {claimState === "saved" ? (
            <p className="flex items-center gap-2 text-sm text-positive">
              <Check aria-hidden className="size-4 shrink-0" />
              Saved
            </p>
          ) : null}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>
      )}
    </section>
  );
}
