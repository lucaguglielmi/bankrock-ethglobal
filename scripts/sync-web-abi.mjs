/**
 * Regenerates the web app's copies of the contract ABIs from `contracts/abi/*.json`.
 *
 * Targets:
 *   web/src/lib/chain/abi/registry.ts   ← BankRockRegistry.json
 *   web/src/lib/chain/abi/aqua-app.ts   ← XYCSwap.json + XYCSwapTaker.json
 *
 * These are the last copies of each interface - the contracts package exports the ABIs,
 * `mcp/scripts/sync-abi.mjs` pulls the registry into the MCP server, and this pulls all three
 * into the web app. Every copy is generated from the same artifact for the same reason: a
 * hand-maintained ABI that drifts from the deployed contract does not fail loudly, it decodes
 * chain state into wrong values, and a wrong balance rendered confidently is exactly the class of
 * defect spec 15 exists to remove. The 2026-09-12 audit produced a worked example - `aqua-app.ts`
 * was hand-maintained, `XYCSwapTaker.swapExactIn` changed shape under findings F-6 and F-8, and
 * the stale array silently encoded the wrong calldata.
 *
 * These are the only files this tooling writes under `web/`. They are build artifacts, not
 * source: do not edit them, and do not add anything else to them.
 *
 * No address appears in any of them. Addresses come from the environment (D-015), resolved by the
 * chain and Aqua config modules.
 *
 * Run directly, or let it run as part of `npm run compile` / `npm run build` / `npm test` in
 * `contracts/`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

const abiDir = path.join(repoRoot, "contracts", "abi");
const outDir = path.join(repoRoot, "web", "src", "lib", "chain", "abi");

const rel = (p) => path.relative(repoRoot, p);

/**
 * Each target is one generated module. `exports` are emitted in order, and the `preamble` is the
 * comment block above them - the part a reader needs that the ABI itself cannot say.
 */
const TARGETS = [
  {
    file: "registry.ts",
    preamble: [
      "The registry address is not here and never will be: it comes from the environment",
      "(NEXT_PUBLIC_REGISTRY_ADDRESS) via this directory's chain config module.",
    ],
    exports: [{ name: "BANK_ROCK_REGISTRY_ABI", artifact: "BankRockRegistry.json" }],
  },
  {
    file: "aqua-app.ts",
    preamble: [
      "The Aqua app path: `XYCSwap` and the taker periphery that reaches it.",
      "",
      "XYCSwap is the reference constant-product AquaApp, vendored unmodified from",
      "github.com/1inch/aqua at commit 9c5c42e5 (contracts/aqua/UPSTREAM.md) and deployed by us:",
      "1inch publishes no XYCSwap deployment on any network. It is the spec 04 fallback the D-023",
      "amendment allows, and it carries no strategy logic of ours.",
      "",
      "XYCSwapTaker exists because XYCSwap settles a swap by calling `xycSwapCallback` back into",
      "its caller: an EOA or a plain Safe cannot trade against it directly (contracts/aqua/NOTES.md",
      "§5). A visitor's transaction is `approve(taker, amountIn)` then `taker.swapExactIn(...)`.",
      "",
      "No address appears here. Both come from the environment - NEXT_PUBLIC_AQUA_APP_ADDRESS and",
      "NEXT_PUBLIC_AQUA_TAKER_ADDRESS - through `lib/aqua/config.ts` (D-015).",
    ],
    exports: [
      { name: "XYC_SWAP_ABI", artifact: "XYCSwap.json" },
      { name: "XYC_SWAP_TAKER_ABI", artifact: "XYCSwapTaker.json" },
    ],
  },
];

function readAbi(artifact) {
  const source = path.join(abiDir, artifact);
  if (!fs.existsSync(source)) {
    console.error(`[sync-web-abi] ${rel(source)} not found. Run "npm run compile" in contracts/ first.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(source, "utf8")).abi;
}

function render(target) {
  const sources = target.exports.map((e) => `contracts/abi/${e.artifact}`).join(", ");

  const header = [
    `// Generated from ${sources} by scripts/sync-web-abi.mjs.`,
    `// Do not edit by hand. Regenerate with "npm run compile" in contracts/, or by running`,
    `// "node scripts/sync-web-abi.mjs" from the repository root.`,
    ...(target.preamble.length > 0 ? ["//"] : []),
    ...target.preamble.map((line) => (line === "" ? "//" : `// ${line}`)),
  ].join("\n");

  const bodies = target.exports.map(({ name, artifact }) => {
    const abi = readAbi(artifact);
    return { name, artifact, count: abi.length, text: `export const ${name} = ${JSON.stringify(abi, null, 2)} as const;` };
  });

  return {
    contents: `${header}\n${bodies.map((b) => b.text).join("\n\n")}\n`,
    summary: bodies.map((b) => `${b.name} ${b.count}`).join(", "),
  };
}

// The web app is a separate workspace and may legitimately be absent (a contracts-only checkout,
// or a CI job that only builds the contracts). Skip rather than fail in that case.
const webRoot = path.join(repoRoot, "web", "src");
if (!fs.existsSync(webRoot)) {
  console.warn(`[sync-web-abi] ${rel(webRoot)} does not exist; nothing to sync.`);
  process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });

for (const target of TARGETS) {
  const { contents, summary } = render(target);
  const outPath = path.join(outDir, target.file);
  const previous = fs.existsSync(outPath) ? fs.readFileSync(outPath, "utf8") : null;

  if (previous === contents) {
    console.log(`[sync-web-abi] ${rel(outPath)} is up to date.`);
  } else {
    fs.writeFileSync(outPath, contents);
    console.log(`[sync-web-abi] wrote ${rel(outPath)} (${summary}).`);
  }
}
