/**
 * Verifies the deployed Bank Rock contracts on Sepolia Etherscan from the Hardhat build output.
 *
 * Why a script and not the Hardhat verify plugin: the plugin needs a config edit and a fresh
 * install (see verify.md, Option A), and it re-derives the compiler input in ways that have to be
 * kept in step with hardhat.config.js. This script sends Etherscan the *exact* standard-JSON input
 * Hardhat compiled — read from `artifacts/build-info/<id>.json`, the id recorded in each artifact —
 * so what is verified is what was deployed, by construction. No compiler setting is restated here.
 *
 * Inputs (all read, none written):
 *   deployments/sepolia.json            registry address, attester, deploy tx
 *   deployments/sepolia-aqua-app.json   app + taker addresses, Aqua address
 *   artifacts/**                        the compiled output of `npm run compile`
 *
 * Environment
 *   ETHERSCAN_API_KEY   required   etherscan.io → account → API keys (one key for every v2 chain)
 *   SEPOLIA_RPC_URL     optional   used to read the registry deploy transaction's sender, which is
 *                                  the registry's `initialOwner` constructor argument. Defaults to
 *                                  a public endpoint; a single read is all it needs.
 *
 * Usage
 *   cd contracts && ETHERSCAN_API_KEY=... node scripts/verify-sepolia.mjs
 *
 * Idempotent: a contract Etherscan already shows as verified is reported and skipped.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createPublicClient, encodeAbiParameters, getAddress, http } from "viem";
import { sepolia } from "viem/chains";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const CHAIN_ID = 11155111;
const API = "https://api.etherscan.io/v2/api";
const EXPLORER = "https://sepolia.etherscan.io/address";

function fail(message) {
  console.error(`\n  verify failed: ${message}\n`);
  process.exit(1);
}

function readJson(relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) fail(`${relative} not found — deploy first, and run "npm run compile".`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** The artifact names its build-info; the build-info holds the standard-JSON input solc was given. */
function compilerInputFor(artifactRelative) {
  const artifact = readJson(path.join("artifacts", artifactRelative));
  const buildInfo = readJson(path.join("artifacts", "build-info", `${artifact.buildInfoId}.json`));
  return {
    contractName: artifact.contractName,
    fullName: `${artifact.inputSourceName}:${artifact.contractName}`,
    compilerVersion: `v${buildInfo.solcLongVersion}`,
    input: buildInfo.input,
    deployedBytecode: artifact.deployedBytecode,
  };
}

async function etherscan(apiKey, params, { post = false } = {}) {
  // v2 routes on `chainid`, which it reads from the query string even for POSTs.
  const query = new URLSearchParams({ chainid: String(CHAIN_ID), apikey: apiKey });
  const response = post
    ? await fetch(`${API}?${query.toString()}`, { method: "POST", body: new URLSearchParams(params) })
    : await fetch(`${API}?${query.toString()}&${new URLSearchParams(params).toString()}`);
  if (!response.ok) fail(`Etherscan HTTP ${response.status} for ${params.action}`);
  return response.json();
}

async function isVerified(apiKey, address) {
  const { result } = await etherscan(apiKey, { module: "contract", action: "getsourcecode", address });
  const entry = Array.isArray(result) ? result[0] : undefined;
  return Boolean(entry && typeof entry.SourceCode === "string" && entry.SourceCode.length > 0);
}

async function waitForVerification(apiKey, guid) {
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    const { status, result } = await etherscan(apiKey, { module: "contract", action: "checkverifystatus", guid });
    if (typeof result === "string" && /pending/i.test(result)) continue;
    if (status === "1" || /already verified/i.test(String(result))) return String(result);
    fail(`Etherscan rejected the submission: ${result}`);
  }
  fail("Etherscan did not answer within 150 s; check the guid in the dashboard.");
}

async function verifyOne(apiKey, publicClient, { label, address, artifact, argTypes, args }) {
  const target = compilerInputFor(artifact);
  console.log(`\n  ${label}  ${address}`);
  console.log(`    ${target.fullName}  ${target.compilerVersion}`);

  // The deployed code and the artifact's deployed bytecode must be the same length: immutables are
  // filled in place, so a mismatch here means the artifact is not the build that was deployed.
  const code = await publicClient.getCode({ address });
  if (!code || code === "0x") fail(`no code at ${address}`);
  if (code.length !== target.deployedBytecode.length) {
    fail(
      `on-chain code is ${(code.length - 2) / 2} bytes but the artifact's deployed bytecode is ` +
        `${(target.deployedBytecode.length - 2) / 2} — recompile from the commit that deployed it.`,
    );
  }

  if (await isVerified(apiKey, address)) {
    console.log(`    already verified  ${EXPLORER}/${address}#code`);
    return;
  }

  const constructorArguments = encodeAbiParameters(argTypes, args).slice(2);
  const { status, result } = await etherscan(
    apiKey,
    {
      module: "contract",
      action: "verifysourcecode",
      codeformat: "solidity-standard-json-input",
      sourceCode: JSON.stringify(target.input),
      contractaddress: address,
      contractname: target.fullName,
      compilerversion: target.compilerVersion,
      constructorArguements: constructorArguments, // sic — Etherscan's parameter name
    },
    { post: true },
  );
  if (status !== "1") fail(`submission refused: ${result}`);
  console.log(`    submitted, guid ${result}`);
  const outcome = await waitForVerification(apiKey, result);
  console.log(`    ${outcome}  ${EXPLORER}/${address}#code`);
}

async function main() {
  const apiKey = (process.env.ETHERSCAN_API_KEY ?? "").trim();
  if (!apiKey) fail("ETHERSCAN_API_KEY is not set.");

  const registry = readJson("deployments/sepolia.json");
  const aquaApp = readJson("deployments/sepolia-aqua-app.json");

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com"),
  });

  // The registry's initialOwner is the deployer, which deployments/sepolia.json does not record.
  const deployTx = await publicClient.getTransaction({ hash: registry.txHash });
  const initialOwner = getAddress(deployTx.from);

  const address = (value) => ({ type: "address" });

  await verifyOne(apiKey, publicClient, {
    label: "BankRockRegistry",
    address: getAddress(registry.address),
    artifact: "contracts/BankRockRegistry.sol/BankRockRegistry.json",
    argTypes: [address(), address()],
    args: [initialOwner, getAddress(registry.attester)],
  });
  await verifyOne(apiKey, publicClient, {
    label: "XYCSwap",
    address: getAddress(aquaApp.app.address),
    artifact: "contracts/aqua/examples/apps/XYCSwap.sol/XYCSwap.json",
    argTypes: [address()],
    args: [getAddress(aquaApp.aqua)],
  });
  await verifyOne(apiKey, publicClient, {
    label: "XYCSwapTaker",
    address: getAddress(aquaApp.taker.address),
    artifact: "contracts/aqua/XYCSwapTaker.sol/XYCSwapTaker.json",
    argTypes: [address(), address()],
    args: [getAddress(aquaApp.aqua), getAddress(aquaApp.app.address)],
  });

  console.log("\n  done\n");
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
