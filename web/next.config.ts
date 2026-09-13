import type { NextConfig } from "next";

// `public/sw.js` (spec 14 §4) is no longer produced by a Next.js bundler plugin. `@serwist/next`'s
// webpack plugin does not run under Turbopack — Next 16's default, and the one this app builds
// with (`next build --webpack` fails separately on wagmi's optional `@x402/*` peer imports) — so
// nothing ever wrote the file and `/sw.js` 404'd (spec 15 R-6). It is now built independently, by
// `scripts/build-sw.mjs`, wired in as the `prebuild` npm script: esbuild bundles `src/sw.ts` and
// `@serwist/build`'s `injectManifest` writes the result straight to `public/sw.js`, before Next
// even starts. See that script's header comment for the full reasoning, including why
// `@serwist/turbopack` (the package's actual Turbopack-native option) was not used instead.

const nextConfig: NextConfig = {
  // Kept. The OpenNext build sets NEXT_PRIVATE_STANDALONE itself
  // (node_modules/@opennextjs/aws/dist/build/buildNextApp.js) and reads `.next/standalone`, so
  // this is consistent with the adapter rather than in conflict with it, and it keeps a plain
  // `next build` producing the same output shape.
  output: "standalone",
  poweredByHeader: false,
  // Browser security headers (security review 2026-09-13, R-9). Kept to the set that cannot
  // interfere with Privy, Pimlico, Google Fonts or the service worker: no `script-src` policy yet,
  // only `frame-ancestors`, so nothing the page loads changes. HSTS is set without
  // `includeSubDomains` or `preload` so a subdomain served without TLS is not broken by it.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
        ],
      },
    ];
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: Date.now().toString(),
  },
  // www → apex (D-022). Two rules on purpose: with a single optional catch-all (`/:path*`) the
  // OpenNext Cloudflare adapter substitutes nothing for the EMPTY path and answers the bare
  // `https://www.bank-rock.com/` with the literal string `:path*` (observed live on 2026-09-12;
  // `/rock/1` was substituted correctly). The root gets its own rule; the rest use `+`, which
  // never matches empty.
  async redirects() {
    const www = [{ type: 'host' as const, value: 'www.bank-rock.com' }];
    return [
      { source: '/', has: www, destination: 'https://bank-rock.com/', permanent: true },
      { source: '/:path+', has: www, destination: 'https://bank-rock.com/:path+', permanent: true },
    ]
  },
};

nextConfig.turbopack = {};
export default nextConfig;

import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev());
