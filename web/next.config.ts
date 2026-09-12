import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Kept. The OpenNext build sets NEXT_PRIVATE_STANDALONE itself
  // (node_modules/@opennextjs/aws/dist/build/buildNextApp.js) and reads `.next/standalone`, so
  // this is consistent with the adapter rather than in conflict with it, and it keeps a plain
  // `next build` producing the same output shape.
  output: "standalone",
  env: {
    NEXT_PUBLIC_APP_VERSION: Date.now().toString(),
  },
};

export default nextConfig;

import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev());
