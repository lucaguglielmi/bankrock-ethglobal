/**
 * Regenerates `web/src/lib/chain/abi/registry.ts` from `contracts/abi/BankRockRegistry.json`.
 *
 * This is the third and last copy of the registry interface — the contracts package exports the
 * ABI, `mcp/scripts/sync-abi.mjs` pulls it into the MCP server, and this pulls it into the web
 * app. All three are generated from the same artifact for the same reason: a hand-maintained ABI
 * that drifts from the deployed contract does not fail loudly, it decodes chain state into wrong
 * values, and a wrong balance rendered confidently is exactly the class of defect spec 15 exists
 * to remove.
 *
 * The output is the only file this tooling writes under `web/`. It is a build artifact, not
 * source: do not edit it, and do not add anything else to it.
 *
 * It carries no address. The registry address comes from the environment, resolved by the chain
 * config module that this file sits next to (decision D-015).
 *
 * Run directly, or let it run as part of `npm run compile` / `npm run build` / `npm test` in
 * `contracts/`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

const source = path.join(repoRoot, "contracts", "abi", "BankRockRegistry.json");
const outDir = path.join(repoRoot, "web", "src", "lib", "chain", "abi");
const target = path.join(outDir, "registry.ts");

const rel = (p) => path.relative(repoRoot, p);

if (!fs.existsSync(source)) {
  console.error(
    `[sync-web-abi] ${rel(source)} not found. Run "npm run compile" in contracts/ first.`,
  );
  process.exit(1);
}

// The web app is a separate workspace and may legitimately be absent (a contracts-only checkout,
// or a CI job that only builds the contracts). Skip rather than fail in that case.
const webRoot = path.join(repoRoot, "web", "src");
if (!fs.existsSync(webRoot)) {
  console.warn(`[sync-web-abi] ${rel(webRoot)} does not exist; nothing to sync.`);
  process.exit(0);
}

const { abi } = JSON.parse(fs.readFileSync(source, "utf8"));

const contents =
  `// Generated from contracts/abi/BankRockRegistry.json by scripts/sync-web-abi.mjs.\n` +
  `// Do not edit by hand. Regenerate with "npm run compile" in contracts/, or by running\n` +
  `// "node scripts/sync-web-abi.mjs" from the repository root.\n` +
  `//\n` +
  `// The registry address is not here and never will be: it comes from the environment\n` +
  `// (NEXT_PUBLIC_REGISTRY_ADDRESS) via this directory's chain config module.\n` +
  `export const BANK_ROCK_REGISTRY_ABI = ${JSON.stringify(abi, null, 2)} as const;\n`;

fs.mkdirSync(outDir, { recursive: true });
const previous = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;

if (previous === contents) {
  console.log(`[sync-web-abi] ${rel(target)} is up to date.`);
} else {
  fs.writeFileSync(target, contents);
  console.log(`[sync-web-abi] wrote ${rel(target)} (${abi.length} ABI entries).`);
}
