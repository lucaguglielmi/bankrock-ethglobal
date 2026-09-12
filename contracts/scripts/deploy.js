/**
 * Deploys BankRockRegistry to Ethereum Sepolia (chain 11155111, decision D-023).
 *
 * This script performs a real deployment. It broadcasts a transaction, waits for the receipt,
 * and records what it deployed. It contains no address literal: the registry address is an
 * output of this script, never an input (D-015).
 *
 * Usage
 * -----
 *   cd contracts
 *   npm ci
 *   npm run compile
 *   SEPOLIA_RPC_URL=... DEPLOYER_PRIVATE_KEY=0x... ATTESTATION_SIGNER_ADDRESS=0x... npm run deploy
 *
 * Environment
 * -----------
 *   SEPOLIA_RPC_URL             required  HTTPS RPC endpoint for Ethereum Sepolia (Alchemy/Infura;
 *                                         a public endpoint will do for a single deploy).
 *   DEPLOYER_PRIVATE_KEY        required  0x-prefixed key of a funded Sepolia account. Becomes the
 *                                         contract administrator: may pause and rotate the attester.
 *                                         Budget ~0.05 ETH (spec 16 Part 3).
 *   ATTESTATION_SIGNER_ADDRESS  required  Address of the NFC attestation signer (spec 16 #17). It is
 *                                         set as the registry's attester in the constructor. This
 *                                         wallet never needs to hold funds — it only signs EIP-712
 *                                         payloads off-chain.
 *   DEPLOY_CONFIRMATIONS        optional  Receipt confirmations to wait for. Default 2.
 *
 * None of these exist in the repository, and none should: per spec 16 they live in the operator's
 * shell or in the Cloudflare/GitHub secret stores, never in a file.
 *
 * Output
 * ------
 *   contracts/deployments/sepolia.json  { address, deployBlock, attester, txHash, chainId }
 *   plus the two lines to paste into the Cloudflare Pages environment.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createPublicClient, createWalletClient, http, isAddress, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const CONTRACT = "BankRockRegistry";
const CHAIN_ID = 11155111;

function fail(message) {
  console.error(`\n  deploy failed: ${message}\n`);
  process.exit(1);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    fail(`${name} is not set. See the header of scripts/deploy.js for the full list.`);
  }
  return value.trim();
}

async function main() {
  const rpcUrl = requireEnv("SEPOLIA_RPC_URL");
  const privateKey = requireEnv("DEPLOYER_PRIVATE_KEY");
  const attesterRaw = requireEnv("ATTESTATION_SIGNER_ADDRESS");
  const confirmations = Number(process.env.DEPLOY_CONFIRMATIONS ?? 2);

  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    fail("DEPLOYER_PRIVATE_KEY must be a 0x-prefixed 32-byte hex string.");
  }
  if (!isAddress(attesterRaw)) {
    fail("ATTESTATION_SIGNER_ADDRESS is not a valid address.");
  }
  const attester = getAddress(attesterRaw);

  const artifactPath = path.join(root, "artifacts", "contracts", `${CONTRACT}.sol`, `${CONTRACT}.json`);
  if (!fs.existsSync(artifactPath)) {
    fail(`artifact not found at ${path.relative(root, artifactPath)} — run "npm run compile" first.`);
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  const account = privateKeyToAccount(privateKey);
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain: sepolia, transport });
  const walletClient = createWalletClient({ account, chain: sepolia, transport });

  const chainId = await publicClient.getChainId();
  if (chainId !== CHAIN_ID) {
    fail(`SEPOLIA_RPC_URL points at chain ${chainId}, expected ${CHAIN_ID} (Ethereum Sepolia).`);
  }

  const balance = await publicClient.getBalance({ address: account.address });
  if (balance === 0n) {
    fail(`deployer ${account.address} has no Sepolia ETH. Fund it and retry.`);
  }

  console.log(`Bank Rock registry deploy`);
  console.log(`  network   Ethereum Sepolia (${CHAIN_ID})`);
  console.log(`  deployer  ${account.address}`);
  console.log(`  balance   ${balance} wei`);
  console.log(`  attester  ${attester}`);
  console.log(`  owner     ${account.address} (constructor argument)`);

  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args: [account.address, attester],
  });
  console.log(`\n  tx        ${hash}`);
  console.log(`  waiting for ${confirmations} confirmation(s)...`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations });
  if (receipt.status !== "success" || !receipt.contractAddress) {
    fail(`deployment transaction reverted (${hash}).`);
  }

  const address = getAddress(receipt.contractAddress);
  const deployBlock = Number(receipt.blockNumber);

  // Read the state back rather than trusting the constructor argument.
  const onChainAttester = await publicClient.readContract({
    address,
    abi: artifact.abi,
    functionName: "attester",
  });
  if (getAddress(onChainAttester) !== attester) {
    fail(`attester on-chain is ${onChainAttester}, expected ${attester}.`);
  }

  const record = {
    address,
    deployBlock,
    attester,
    txHash: receipt.transactionHash,
    chainId: CHAIN_ID,
  };

  const outDir = path.join(root, "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "sepolia.json");
  fs.writeFileSync(outPath, `${JSON.stringify(record, null, 2)}\n`);

  console.log(`\n  address   ${address}`);
  console.log(`  block     ${deployBlock}`);
  console.log(`  gas used  ${receipt.gasUsed}`);
  console.log(`  recorded  ${path.relative(root, outPath)}`);
  console.log(`  explorer  https://sepolia.etherscan.io/address/${address}#code`);

  console.log(`\nAdd these to the Cloudflare Pages environment (Settings -> Environment variables):\n`);
  console.log(`NEXT_PUBLIC_REGISTRY_ADDRESS=${address}`);
  console.log(`REGISTRY_DEPLOY_BLOCK=${deployBlock}`);
  console.log(`\nThen verify the source: see scripts/verify.md\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
