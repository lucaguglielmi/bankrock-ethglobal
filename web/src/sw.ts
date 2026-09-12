/**
 * Service worker (spec 14 §4).
 *
 * Caching:
 *  - `/api/**` (same-origin): `NetworkOnly`, always — never cached, full stop. Privy sessions and
 *    several routes here authenticate on a cookie, which never appears in `Request.headers`
 *    inside a service worker, so a header check cannot tell an authenticated call from an
 *    anonymous one (a perimeter-audit finding, P-3: header-gated caching was still caching
 *    cookie-authenticated GETs for 24 h). With no reliable way to tell them apart, none of it is
 *    cached.
 *  - `/rock/**` (same-origin): network-first. A request carrying an `Authorization` header is
 *    `NetworkOnly` — its response is scoped to whoever holds that bearer token. Everything else
 *    under that prefix is `NetworkFirst` with a short-lived cache as the offline fallback.
 *  - Static assets and fonts: `StaleWhileRevalidate` — instant from cache, refreshed in the
 *    background.
 *
 * Out of scope (spec 14 §4): the "Offline — showing cached state" UI indicator. This worker
 * serves a cached response when the network fails; painting a banner to say so is a client-side
 * change to every surface that reads through it, not a service-worker concern, and is not made
 * here.
 *
 * `tsconfig.json`'s `lib` is `["dom", "dom.iterable", "esnext"]` for the whole project — it does
 * not include `lib.webworker.d.ts` (the two libs declare conflicting globals, and the rest of the
 * app needs `dom`), so the ambient `ServiceWorkerGlobalScope` / `ExtendableEvent` types are not
 * available here. Rather than `declare const self: any`, this file declares the narrow shape it
 * actually touches and casts through `unknown` once, at the top.
 */

import {
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
  type PrecacheEntry,
} from "serwist";

const DAY_SECONDS = 24 * 60 * 60;
const YEAR_SECONDS = 365 * DAY_SECONDS;
const MONTH_SECONDS = 30 * DAY_SECONDS;

const API_PREFIX = "/api/";
const ROCK_PREFIX = "/rock/";

interface CachingMatchOptions {
  request: Request;
  url: URL;
  sameOrigin: boolean;
}

/**
 * Local stand-in for `serwist`'s `RuntimeCaching`, narrowed to the fields this file's matchers
 * actually read. `RuntimeCaching["matcher"]` is typed against `RouteMatchCallbackOptions`, which
 * includes `event: ExtendableEvent` — a type `lib.webworker.d.ts` supplies and this project's
 * `lib` does not — so this file builds its own list against a same-shaped-but-resolvable type
 * and hands it to `Serwist` through one cast, rather than importing that type directly.
 */
interface CachingRule {
  matcher: RegExp | ((options: CachingMatchOptions) => boolean);
  handler: NetworkFirst | NetworkOnly | StaleWhileRevalidate;
}

const runtimeCaching: CachingRule[] = [
  // /api/** is never cached, unconditionally (P-3). Cookie-authenticated requests (several Privy
  // and admin session routes) carry no visible `Authorization` header for a service worker to
  // key off, so a header check cannot separate an authenticated call from an anonymous one — the
  // only safe rule is "never cache any of it".
  {
    matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith(API_PREFIX),
    handler: new NetworkOnly(),
  },
  // /rock/** carrying an Authorization header: never cached, for the same reason as above.
  {
    matcher: ({ request, url, sameOrigin }) =>
      sameOrigin && url.pathname.startsWith(ROCK_PREFIX) && request.headers.has("Authorization"),
    handler: new NetworkOnly(),
  },
  // The rest of /rock/**: network-first, with a short-lived cached fallback.
  {
    matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith(ROCK_PREFIX),
    handler: new NetworkFirst({
      cacheName: "network-first",
      networkTimeoutSeconds: 10,
      plugins: [new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: DAY_SECONDS })],
    }),
  },
  // Fonts.
  {
    matcher: /\.(?:eot|otf|ttc|ttf|woff|woff2)$/i,
    handler: new StaleWhileRevalidate({
      cacheName: "static-font-assets",
      plugins: [new ExpirationPlugin({ maxEntries: 8, maxAgeSeconds: YEAR_SECONDS })],
    }),
  },
  {
    matcher: /^https:\/\/fonts\.googleapis\.com\/.*/i,
    handler: new StaleWhileRevalidate({
      cacheName: "google-fonts-stylesheets",
      plugins: [new ExpirationPlugin({ maxEntries: 4, maxAgeSeconds: YEAR_SECONDS })],
    }),
  },
  {
    matcher: /^https:\/\/fonts\.gstatic\.com\/.*/i,
    handler: new StaleWhileRevalidate({
      cacheName: "google-fonts-webfonts",
      plugins: [new ExpirationPlugin({ maxEntries: 8, maxAgeSeconds: YEAR_SECONDS })],
    }),
  },
  // Static assets — images, scripts, styles — and Next's own static chunks.
  {
    matcher: /\.(?:js|css|jpg|jpeg|gif|png|svg|ico|webp)$/i,
    handler: new StaleWhileRevalidate({
      cacheName: "static-assets",
      plugins: [new ExpirationPlugin({ maxEntries: 96, maxAgeSeconds: MONTH_SECONDS })],
    }),
  },
  {
    matcher: /\/_next\/static\/.+/i,
    handler: new StaleWhileRevalidate({
      cacheName: "next-static-assets",
      plugins: [new ExpirationPlugin({ maxEntries: 96, maxAgeSeconds: MONTH_SECONDS })],
    }),
  },
];

interface PushEventLike {
  data: { json(): { title: string; body: string; url?: string } } | null;
  waitUntil(promise: Promise<unknown>): void;
}

interface NotificationClickEventLike {
  notification: { close(): void; data?: { url?: string } };
  waitUntil(promise: Promise<unknown>): void;
}

/**
 * The narrow slice of `ServiceWorkerGlobalScope` this file touches, in place of `any` (see the
 * file header for why the real type is unavailable).
 */
interface ServiceWorkerSelfLike {
  __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  registration: { showNotification(title: string, options?: NotificationOptions): Promise<void> };
  clients: { openWindow(url: string): Promise<unknown> };
  addEventListener(type: "push", listener: (event: PushEventLike) => void): void;
  addEventListener(
    type: "notificationclick",
    listener: (event: NotificationClickEventLike) => void,
  ): void;
}

const swSelf = self as unknown as ServiceWorkerSelfLike;

const serwist = new Serwist({
  precacheEntries: swSelf.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // `CachingRule` is structurally identical to `RuntimeCaching` except for the type it uses to
  // describe `event` in the matcher options (see `CachingRule`'s doc comment) — safe to hand to
  // `Serwist` as-is.
  runtimeCaching: runtimeCaching as NonNullable<ConstructorParameters<typeof Serwist>[0]>["runtimeCaching"],
});

serwist.addEventListeners();

swSelf.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = event.data.json();
  const options: NotificationOptions = {
    body: data.body,
    icon: "/icon-192.png",
    badge: "/badge.png",
    data: data.url ? { url: data.url } : undefined,
  };
  event.waitUntil(swSelf.registration.showNotification(data.title, options));
});

swSelf.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url;
  if (url) {
    event.waitUntil(swSelf.clients.openWindow(url));
  }
});
