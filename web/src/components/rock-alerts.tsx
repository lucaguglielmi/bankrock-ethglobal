"use client";

/**
 * Alert preferences for one rock (spec 15 N-9, SA-1, SA-5; spec 17 Part 5 "Alerts").
 *
 *  - both reads and writes now carry the Privy access token, because the route requires it:
 *    anyone could previously read back the owner's stored email address for any rock (SA-5);
 *  - the "Send test email" button is gone. That endpoint was an open relay and is now
 *    admin-only (SA-1); a visitor pressing it could only ever have been refused;
 *  - the card states plainly that nothing is dispatched yet. Preferences persist; delivery does
 *    not exist (spec 15 Part 3, "Alerts delivery: UNAVAILABLE");
 *  - notification permission is requested only when the person presses the button (spec 14).
 *
 * Descriptions are `text-sm`, badges `text-label`, the input `text-base`, every control at least
 * 44 px — the 9 px category badges and 11 px topic descriptions are gone (T-5).
 */

import { useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bell,
  Check,
  Fuel,
  KeyRound,
  Package,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { DEFAULT_ALERT_TOPICS, type AlertTopicsConfig } from "@/lib/alerts";
import { useAuth } from "@/context/auth-context";
import { useAudio } from "@/context/audio-context";
import { cn } from "@/lib/ui/cn";

interface TopicMeta {
  id: keyof AlertTopicsConfig;
  title: string;
  description: string;
  badge: string;
  icon: typeof Bell;
}

const TOPICS: TopicMeta[] = [
  {
    id: "loss_warning",
    title: "Value swings",
    description: "When the two balances in this rock move far apart after a price swing.",
    badge: "Risk",
    icon: AlertTriangle,
  },
  {
    id: "dangerous_trade",
    title: "Large trade",
    description: "When one trade takes a big share of what this rock holds.",
    badge: "Trade",
    icon: ShieldAlert,
  },
  {
    id: "profit_milestone",
    title: "Fees earned",
    description: "When the fees this rock has earned pass a round number.",
    badge: "Earnings",
    icon: TrendingUp,
  },
  {
    id: "custody_transfer",
    title: "Tap and handover",
    description: "When someone taps this rock, or its ownership changes.",
    badge: "Security",
    icon: KeyRound,
  },
  {
    id: "gas_depletion",
    title: "Account health",
    description: "When the account behind this rock needs attention.",
    badge: "Health",
    icon: Fuel,
  },
  {
    id: "genesis_drop",
    title: "New batches",
    description: "When a new batch of rocks is released.",
    badge: "News",
    icon: Package,
  },
];

const DELIVERY_NOTE =
  "Nothing is sent yet. Preferences are stored, but there is no delivery pipeline behind them.";

type SaveState = "idle" | "saving" | "saved" | "error";

interface AlertPreferencesResponse {
  state?: string;
  reason?: string;
  delivery?: { reason?: string };
  preferences?: { email?: string; pushEnabled?: boolean; topics?: Partial<AlertTopicsConfig> };
}

/** `Notification` support, read the way a browser API should be read from React. */
function subscribeNothing() {
  return () => {};
}
function notificationSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}
function notificationSupportedOnServer() {
  return false;
}

export function RockAlerts({ rockId }: { rockId: string | number }) {
  const { authenticated, getAccessToken, login, unavailable, unavailableReason } = useAuth();
  const { playTap, playSuccess, playError } = useAudio();

  const pushSupported = useSyncExternalStore(
    subscribeNothing,
    notificationSupported,
    notificationSupportedOnServer,
  );

  const preferencesQuery = useQuery({
    queryKey: ["alert-preferences", String(rockId)],
    enabled: authenticated,
    retry: false,
    queryFn: async (): Promise<AlertPreferencesResponse> => {
      const token = await getAccessToken();
      if (!token) return { state: "UNAVAILABLE", reason: "Sign in again to read your alerts." };
      const res = await fetch(`/api/alerts?rockId=${encodeURIComponent(String(rockId))}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as AlertPreferencesResponse;
      if (!res.ok && !data.reason) {
        return { ...data, state: "UNAVAILABLE", reason: "Alert preferences could not be read." };
      }
      return data;
    },
  });

  const stored = preferencesQuery.data;
  const loadReason =
    preferencesQuery.isError
      ? "Alert preferences could not be reached right now."
      : stored && stored.state !== "REAL"
        ? (stored.reason ?? "Alert preferences could not be read right now.")
        : null;
  const deliveryNote = stored?.delivery?.reason ?? DELIVERY_NOTE;

  // Edits are overrides on top of what was stored, so nothing has to be copied into state by an
  // effect and the form can never drift from the last read.
  const [emailEdit, setEmailEdit] = useState<string | null>(null);
  const [topicEdits, setTopicEdits] = useState<Partial<AlertTopicsConfig>>({});
  const [pushEdit, setPushEdit] = useState<boolean | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  const email = emailEdit ?? stored?.preferences?.email ?? "";
  const topics: AlertTopicsConfig = {
    ...DEFAULT_ALERT_TOPICS,
    ...(stored?.preferences?.topics ?? {}),
    ...topicEdits,
  };
  const pushEnabled = pushEdit ?? Boolean(stored?.preferences?.pushEnabled);

  const toggleTopic = (id: keyof AlertTopicsConfig) => {
    playTap();
    setSaveState("idle");
    setTopicEdits((previous) => ({ ...previous, [id]: !topics[id] }));
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaveState("saving");
    setError(null);

    const token = await getAccessToken();
    if (!token) {
      setSaveState("error");
      setError("Sign in again to save these preferences.");
      return;
    }

    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rockId, email, pushEnabled, topics }),
      });
      const data = (await res.json()) as { state?: string; reason?: string; error?: string };

      if (!res.ok || data.state === "UNAVAILABLE") {
        setSaveState("error");
        setError(data.reason ?? data.error ?? "These preferences could not be saved.");
        playError();
        return;
      }

      setSaveState("saved");
      playSuccess();
    } catch {
      setSaveState("error");
      setError("These preferences could not be saved.");
      playError();
    }
  };

  const handleEnablePush = async () => {
    playTap();
    if (!pushSupported) {
      setError("This browser cannot show notifications.");
      return;
    }
    const permission = await Notification.requestPermission();
    setPushEdit(permission === "granted");
    if (permission !== "granted") {
      setError("Notifications are blocked for this site.");
    }
  };

  return (
    <section className="flex w-full flex-col gap-6 rounded-3xl border border-border p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <h3 className="flex items-center gap-2 text-h3 font-semibold text-ink">
          <Bell aria-hidden className="size-5 shrink-0" />
          Alerts
        </h3>
        <p className="max-w-prose text-sm text-ink-2">
          Choose what is worth telling you about Rock #{rockId}.
        </p>
        <p className="max-w-prose text-sm text-warning">{deliveryNote}</p>
      </div>

      {unavailable ? (
        <UnavailableState reason={unavailableReason ?? "Sign-in is not configured."} />
      ) : !authenticated ? (
        <UnavailableState
          reason="Sign in to set up alerts for this rock."
          action={{ label: "Sign in", onClick: () => void login() }}
        />
      ) : (
        <form onSubmit={handleSave} className="flex flex-col gap-6">
          {loadReason ? <UnavailableState reason={loadReason} /> : null}

          <div className="flex flex-col gap-2">
            <label htmlFor="alert-email" className="text-label text-ink-3">
              Where to write to you
            </label>
            <input
              id="alert-email"
              type="email"
              value={email}
              onChange={(changed) => {
                setEmailEdit(changed.target.value);
                setSaveState("idle");
              }}
              placeholder="you@example.com"
              autoComplete="email"
              className="h-12 w-full rounded-xl border border-border bg-background px-4 text-base text-ink placeholder:text-ink-4"
            />
          </div>

          <div className="flex flex-col gap-3">
            <h4 className="text-label text-ink-3">What to tell you about</h4>
            <ul className="flex flex-col gap-2">
              {TOPICS.map((topic) => {
                const Icon = topic.icon;
                const isOn = Boolean(topics[topic.id]);
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
                        onChange={() => toggleTopic(topic.id)}
                        className="mt-0.5 size-6 shrink-0 accent-ink"
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <Icon aria-hidden className="size-4 shrink-0 text-ink-3" />
                          <span className="text-sm font-semibold text-ink">{topic.title}</span>
                          <span className="rounded-full bg-muted px-2 py-0.5 text-label text-ink-3">
                            {topic.badge}
                          </span>
                        </span>
                        <span className="max-w-prose text-sm text-ink-2">{topic.description}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex flex-col gap-2">
            <h4 className="text-label text-ink-3">On this device</h4>
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={handleEnablePush}
              disabled={pushEnabled}
            >
              {pushEnabled ? (
                <>
                  <Check aria-hidden />
                  Notifications allowed
                </>
              ) : (
                "Allow notifications"
              )}
            </Button>
            <p className="max-w-prose text-sm text-ink-3">
              Allowing notifications only sets a permission on this device. Nothing is sent until
              delivery exists.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Button type="submit" className="w-full sm:w-auto" disabled={saveState === "saving"}>
              {saveState === "saving" ? "Saving…" : "Save preferences"}
            </Button>
            {saveState === "saved" ? (
              <p className="flex items-center gap-2 text-sm text-positive">
                <Check aria-hidden className="size-4 shrink-0" />
                Saved
              </p>
            ) : null}
            {error ? <p className="text-sm text-danger">{error}</p> : null}
          </div>
        </form>
      )}
    </section>
  );
}
