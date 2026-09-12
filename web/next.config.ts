import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

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
export default withSerwist(nextConfig);

import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev());
