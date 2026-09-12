"use client";

/**
 * Web Push subscription management (spec 14 §3).
 *
 * The golden rule: never prompt on page load. `Notification.requestPermission()` is called from
 * exactly one place — `subscribe`, itself only ever invoked from a user click — never from an
 * effect that runs on mount. The subscribe call authenticates with the caller's own Privy access
 * token rather than a client-supplied id (SA-5): the server derives whose subscription this is.
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/auth-context";

export interface UseNotificationsResult {
  isSupported: boolean;
  permission: NotificationPermission;
  subscription: PushSubscription | null;
  /** Requests permission. Call this only from a user-initiated handler. */
  requestPermission: () => Promise<boolean>;
  /** Requests permission if needed, then subscribes and registers with the server. */
  subscribe: (rockId: string) => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
}

interface WebPushResponseBody {
  state?: string;
  reason?: string;
}

/** True only on the client, once, when the browser can register a service worker and Push API. */
function browserSupportsPush(): boolean {
  return (
    typeof navigator !== "undefined" && "serviceWorker" in navigator && "PushManager" in window
  );
}

export function useNotifications(): UseNotificationsResult {
  const { getAccessToken } = useAuth();
  // Read once, as a lazy initializer — not inside an effect — so there is no synchronous
  // `setState` call in an effect body to trigger a second render. `browserSupportsPush()` and the
  // current `Notification.permission` do not change during the component's lifetime; the one
  // thing that legitimately arrives asynchronously (the existing subscription, if any) is fetched
  // in the effect below and set from that promise's resolution, not from the effect body itself.
  const [isSupported] = useState(browserSupportsPush);
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    browserSupportsPush() ? Notification.permission : "default",
  );
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);

  useEffect(() => {
    if (!isSupported) return;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then(setSubscription)
      .catch(() => {
        // No existing subscription, or the registration never resolved — nothing to restore.
      });
  }, [isSupported]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;
    const result = await Notification.requestPermission();
    setPermission(result);
    return result === "granted";
  }, [isSupported]);

  const subscribe = useCallback(
    async (rockId: string): Promise<boolean> => {
      if (!isSupported) return false;

      let currentPermission = permission;
      if (currentPermission !== "granted") {
        const granted = await requestPermission();
        if (!granted) return false;
        currentPermission = "granted";
      }

      const vapidPublicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        console.error("NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY is not configured");
        return false;
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidPublicKey,
        });

        const token = await getAccessToken();
        if (!token) {
          await sub.unsubscribe();
          return false;
        }

        const response = await fetch("/api/webpush", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: "subscribe", rockId, subscription: sub.toJSON() }),
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as WebPushResponseBody;
          console.error("Push subscription rejected by server", body.reason ?? response.status);
          await sub.unsubscribe();
          return false;
        }

        setSubscription(sub);
        return true;
      } catch (err) {
        console.error("Failed to subscribe to push notifications", err);
        return false;
      }
    },
    [isSupported, permission, requestPermission, getAccessToken],
  );

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!subscription) return true;

    try {
      const endpoint = subscription.endpoint;
      const unsubscribed = await subscription.unsubscribe();
      if (!unsubscribed) return false;

      const token = await getAccessToken();
      if (token) {
        await fetch("/api/webpush", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: "unsubscribe", endpoint }),
        }).catch(() => {
          // The browser subscription is already gone; a failed server-side cleanup is not fatal.
        });
      }

      setSubscription(null);
      return true;
    } catch (err) {
      console.error("Failed to unsubscribe from push notifications", err);
      return false;
    }
  }, [subscription, getAccessToken]);

  return { isSupported, permission, subscription, requestPermission, subscribe, unsubscribe };
}
