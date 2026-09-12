#!/usr/bin/env node
/**
 * Prebuilds `public/sw.js` (spec 14 §4) ahead of `next build`.
 *
 * Why this exists: `@serwist/next`'s webpack plugin — the package's own documented Next.js
 * integration — only runs when Next builds with webpack. Next 16 defaults to Turbopack, which
 * does not run webpack plugins at all, so with `@serwist/next` alone `public/sw.js` was never
 * written and `/sw.js` 404'd in production (spec 15 R-6). `next build --webpack` is not a way
 * around this: it fails separately on wagmi's optional `@x402/*` peer imports.
 *
 * `@serwist/turbopack` (the package's actual Turbopack story) was evaluated and not used: it does
 * not write a `public/sw.js` file at all. It works by exporting a Next.js Route Handler — meant to
 * live at `app/sw.js/route.ts` — that bundles and serves the worker *from a request handler* at
 * build/request time (`createSerwistRoute`, backed by `esbuild`/`esbuild-wasm` as
 * `serverExternalPackages`). That is a legitimate way to ship a service worker, but it is a
 * bigger structural change (a new dynamic route, a Next config wrapper, two new production
 * runtime dependencies) for the same outcome this script gets with a few lines run once at build
 * time, so this repo takes the plainer path.
 *
 * That path: bundle `src/sw.ts` — which imports from `serwist` and uses TypeScript syntax neither
 * of Next's bundlers is involved in producing — into one dependency-free script with `esbuild`,
 * then hand it to `@serwist/build`'s own `injectManifest` (the same primitive `@serwist/next`'s
 * webpack plugin calls internally) to write the precache manifest and produce `public/sw.js`.
 * The manifest is deliberately empty (`globPatterns: []`): every asset this app needs cached is
 * already covered by the runtime-caching rules declared in `sw.ts` itself, so there is nothing to
 * precache, and precaching is not what R-6 needed fixed.
 *
 * Wired in as the `prebuild` script (package.json): npm runs it automatically before `build`.
 */

import { build as esbuildBuild } from "esbuild";
import { injectManifest } from "@serwist/build";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

async function main() {
  const tmpDir = await mkdtemp(join(tmpdir(), "bankrock-sw-"));
  const bundlePath = join(tmpDir, "sw.bundle.js");

  try {
    // A classic (non-module) IIFE bundle for the broadest service-worker compatibility. esbuild
    // never renames global identifiers or property names, so the literal `self.__SW_MANIFEST`
    // property access in `sw.ts` — the default injection point `injectManifest` looks for below —
    // survives the bundle untouched.
    await esbuildBuild({
      entryPoints: [join(ROOT, "src/sw.ts")],
      bundle: true,
      format: "iife",
      platform: "browser",
      target: "es2020",
      outfile: bundlePath,
      logLevel: "warning",
    });

    const result = await injectManifest({
      swSrc: bundlePath,
      swDest: join(ROOT, "public/sw.js"),
      // No directory actually needs globbing (globPatterns is empty below); this is only here
      // because @serwist/build requires it.
      globDirectory: join(ROOT, "public"),
      globPatterns: [],
      additionalPrecacheEntries: [],
    });

    console.log(
      `[build-sw] wrote public/sw.js (${result.count} precache entries, ${result.size} bytes)`,
    );
    if (result.warnings.length > 0) {
      console.warn("[build-sw] warnings:", result.warnings);
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("[build-sw] failed:", err);
  process.exitCode = 1;
});
