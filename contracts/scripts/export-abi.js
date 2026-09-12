/**
 * Copies the compiled registry ABI out of `artifacts/` (which is gitignored) into
 * `contracts/abi/BankRockRegistry.json`, which is committed.
 *
 * The web app and the MCP server both need the ABI but neither should run a Solidity
 * compiler, so this is the single handoff point. It runs automatically as the `postcompile`
 * step of `npm run compile` / `npm run build`.
 *
 * The emitted file is `{ contractName, abi }` — no bytecode, no address. Addresses come from
 * the environment (D-015); `deployments/sepolia.json` records what was actually deployed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const CONTRACT = "BankRockRegistry";
const artifactPath = path.join(root, "artifacts", "contracts", `${CONTRACT}.sol`, `${CONTRACT}.json`);
const outDir = path.join(root, "abi");
const outPath = path.join(outDir, `${CONTRACT}.json`);

if (!fs.existsSync(artifactPath)) {
  console.error(`[export-abi] artifact not found at ${artifactPath} — run "npm run compile" first.`);
  process.exit(1);
}

const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
const payload = { contractName: artifact.contractName, abi: artifact.abi };

fs.mkdirSync(outDir, { recursive: true });
const next = `${JSON.stringify(payload, null, 2)}\n`;
const previous = fs.existsSync(outPath) ? fs.readFileSync(outPath, "utf8") : null;

if (previous === next) {
  console.log(`[export-abi] ${path.relative(root, outPath)} is up to date.`);
} else {
  fs.writeFileSync(outPath, next);
  console.log(`[export-abi] wrote ${path.relative(root, outPath)} (${payload.abi.length} ABI entries).`);
}
