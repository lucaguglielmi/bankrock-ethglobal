/**
 * Deploys the Aqua app path to Ethereum Sepolia (chain 11155111, D-023).
 *
 * Two contracts, in one run, both bound to the **canonical** Aqua deployment:
 *
 *   XYCSwap       the reference constant-product AquaApp, vendored unmodified from
 *                 github.com/1inch/aqua (contracts/aqua/UPSTREAM.md). 1inch publishes no
 *                 deployment of it on any network, so we deploy it ourselves. It holds no funds
 *                 and has no owner — it is pure pricing logic over Aqua's virtual balances.
 *   XYCSwapTaker  the taker-side periphery. XYCSwap settles by calling `xycSwapCallback` on its
 *                 caller, so an EOA or a plain Safe cannot trade against it directly; this is the
 *                 contract a visitor's wallet actually calls. See contracts/aqua/NOTES.md §5.
 *
 * Aqua itself is never deployed here. It exists at its canonical address on Sepolia with bytecode
 * identical to mainnet (spec 16 §1.1), and that address is an *input* read from the environment —
 * there is no address literal in this file (D-015).
 *
 * Usage
 * -----
 *   cd contracts
 *   npm ci && npm run compile
 *   SEPOLIA_RPC_URL=... DEPLOYER_PRIVATE_KEY=0x... NEXT_PUBLIC_AQUA_ADDRESS=0x... \
 *     node scripts/deploy-aqua-app.js
 *
 * Environment
 * -----------
 *   SEPOLIA_RPC_URL       required  HTTPS RPC endpoint for Ethereum Sepolia.
 *   DEPLOYER_PRIVATE_KEY  required  0x-prefixed key of a funded Sepolia account. Neither contract
 *                                   has an owner, so this key holds no privilege afterwards.
 *   NEXT_PUBLIC_AQUA_ADDRESS        the canonical Aqua address; `AQUA_ADDRESS` is accepted as an
 *   (or AQUA_ADDRESS)     required  alias. The script refuses to continue if it has no code.
 *   DEPLOY_CONFIRMATIONS  optional  Receipt confirmations to wait for. Default 2.
 *
 * Output
 * ------
 *   contracts/deployments/sepolia-aqua-app.json
 *   plus the environment lines to paste into Cloudflare Pages.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createPublicClient, createWalletClient, http, isAddress, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const CHAIN_ID = 11155111;

/** name -> artifact path, relative to `contracts/artifacts/contracts/`. */
const ARTIFACTS = {
  XYCSwap: "aqua/examples/apps/XYCSwap.sol/XYCSwap.json",
  XYCSwapTaker: "aqua/XYCSwapTaker.sol/XYCSwapTaker.json",
};

function fail(message) {
  console.error(`\n  deploy failed: ${message}\n`);
  process.exit(1);
}

function requireEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim() !== "") return value.trim();
  }
  fail(`${names.join(" / ")} is not set. See the header of scripts/deploy-aqua-app.js.`);
}

function loadArtifact(name) {
  const artifactPath = path.join(root, "artifacts", "contracts", ARTIFACTS[name]);
  if (!fs.existsSync(artifactPath)) {
    fail(`artifact not found at ${path.relative(root, artifactPath)} — run "npm run compile" first.`);
  }
  return JSON.parse(fs.readFileSync(artifactPath, "utf8"));
}

async function deploy({ publicClient, walletClient, artifact, args, confirmations, label }) {
  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args,
  });
  console.log(`\n  ${label} tx   ${hash}`);
  console.log(`  waiting for ${confirmations} confirmation(s)...`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations });
  if (receipt.status !== "success" || !receipt.contractAddress) {
    fail(`${label} deployment reverted (${hash}).`);
  }
  return {
    address: getAddress(receipt.contractAddress),
    deployBlock: Number(receipt.blockNumber),
    txHash: receipt.transactionHash,
    gasUsed: receipt.gasUsed,
  };
}

async function main() {
  const rpcUrl = requireEnv("SEPOLIA_RPC_URL");
  const privateKey = requireEnv("DEPLOYER_PRIVATE_KEY");
  const aquaRaw = requireEnv("NEXT_PUBLIC_AQUA_ADDRESS", "AQUA_ADDRESS");
  const confirmations = Number(process.env.DEPLOY_CONFIRMATIONS ?? 2);

  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    fail("DEPLOYER_PRIVATE_KEY must be a 0x-prefixed 32-byte hex string.");
  }
  if (!isAddress(aquaRaw)) {
    fail(`"${aquaRaw}" is not a valid address for the Aqua contract.`);
  }
  const aqua = getAddress(aquaRaw);

  const account = privateKeyToAccount(privateKey);
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain: sepolia, transport });
  const walletClient = createWalletClient({ account, chain: sepolia, transport });

  const chainId = await publicClient.getChainId();
  if (chainId !== CHAIN_ID) {
    fail(`SEPOLIA_RPC_URL points at chain ${chainId}, expected ${CHAIN_ID} (Ethereum Sepolia).`);
  }

  // The one input that must be real: an app bound to an address with no code would accept a
  // `ship` that can never settle.
  const aquaCode = await publicClient.getCode({ address: aqua });
  if (!aquaCode || aquaCode === "0x") {
    fail(`no contract code at ${aqua} on Sepolia — that is not the Aqua deployment.`);
  }

  const balance = await publicClient.getBalance({ address: account.address });
  if (balance === 0n) {
    fail(`deployer ${account.address} has no Sepolia ETH. Fund it and retry.`);
  }

  console.log(`Bank Rock Aqua app deploy`);
  console.log(`  network   Ethereum Sepolia (${CHAIN_ID})`);
  console.log(`  deployer  ${account.address}`);
  console.log(`  balance   ${balance} wei`);
  console.log(`  aqua      ${aqua} (${(aquaCode.length - 2) / 2} bytes of code)`);

  const appArtifact = loadArtifact("XYCSwap");
  const takerArtifact = loadArtifact("XYCSwapTaker");

  const app = await deploy({
    publicClient,
    walletClient,
    artifact: appArtifact,
    args: [aqua], // constructor(IAqua aqua_) — verified against contracts/aqua/examples/apps/XYCSwap.sol
    confirmations,
    label: "XYCSwap     ",
  });

  const taker = await deploy({
    publicClient,
    walletClient,
    artifact: takerArtifact,
    args: [aqua], // constructor(IAqua aqua_)
    confirmations,
    label: "XYCSwapTaker",
  });

  // Read both back rather than trusting the constructor arguments.
  for (const [label, deployed, artifact] of [
    ["XYCSwap", app, appArtifact],
    ["XYCSwapTaker", taker, takerArtifact],
  ]) {
    const wired = await publicClient.readContract({
      address: deployed.address,
      abi: artifact.abi,
      functionName: "AQUA",
    });
    if (getAddress(wired) !== aqua) {
      fail(`${label} at ${deployed.address} points at ${wired}, expected ${aqua}.`);
    }
  }

  const record = {
    chainId: CHAIN_ID,
    aqua,
    app: {
      contractName: "XYCSwap",
      upstream: "github.com/1inch/aqua examples/apps/XYCSwap.sol @ 9c5c42e5840e8741fba3597c48456c9510212b66",
      ...app,
      gasUsed: app.gasUsed.toString(),
    },
    taker: {
      contractName: "XYCSwapTaker",
      ...taker,
      gasUsed: taker.gasUsed.toString(),
    },
    deployer: account.address,
  };

  const outDir = path.join(root, "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "sepolia-aqua-app.json");
  fs.writeFileSync(outPath, `${JSON.stringify(record, null, 2)}\n`);

  console.log(`\n  app       ${app.address}  (block ${app.deployBlock})`);
  console.log(`  taker     ${taker.address}  (block ${taker.deployBlock})`);
  console.log(`  recorded  ${path.relative(root, outPath)}`);
  console.log(`  explorer  https://sepolia.etherscan.io/address/${app.address}#code`);

  console.log(`\nAdd these to the Cloudflare Pages environment (Settings -> Environment variables):\n`);
  console.log(`NEXT_PUBLIC_AQUA_APP_ADDRESS=${app.address}`);
  console.log(`NEXT_PUBLIC_AQUA_TAKER_ADDRESS=${taker.address}`);
  console.log(`AQUA_APP_DEPLOY_BLOCK=${app.deployBlock}`);
  console.log(
    `\nVerification: both are compiled with solc 0.8.30, viaIR, optimizer runs 10000000,` +
      ` evmVersion cancun (see hardhat.config.js). See scripts/verify.md.\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
