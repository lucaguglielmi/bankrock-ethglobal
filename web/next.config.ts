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
  env: {
    NEXT_PUBLIC_APP_VERSION: Date.now().toString(),
  },
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.bank-rock.com' }],
        destination: 'https://bank-rock.com/:path*',
        permanent: true,
      },
    ]
  },
};

nextConfig.turbopack = {};
export default nextConfig;

import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev());
