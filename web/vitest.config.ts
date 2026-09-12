import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Each test file gets its own module registry, so a test that sets NEXT_PUBLIC_* before
    // importing lib/chain does not leak that module state into the next file.
    isolate: true,
  },
});
