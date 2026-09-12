import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: any;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();

(self as any).addEventListener("push", (event: any) => {
  if (event.data) {
    const data = event.data.json();
    const options: NotificationOptions = {
      body: data.body,
      icon: "/icon-192x192.png",
      badge: "/badge.png",
      data: data.url ? { url: data.url } : undefined,
    };
    event.waitUntil((self as any).registration.showNotification(data.title, options));
  }
});

(self as any).addEventListener("notificationclick", (event: any) => {
  event.notification.close();
  if (event.notification.data?.url) {
    event.waitUntil((self as any).clients.openWindow(event.notification.data.url));
  }
});
