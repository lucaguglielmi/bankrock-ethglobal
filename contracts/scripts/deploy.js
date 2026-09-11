import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log("=== Bank Rock Registry Deployment ===");
  console.log("Target Network: Base Sepolia (Chain ID: 84532)");

  const artifactPath = path.resolve(__dirname, "../artifacts/contracts/BankRockRegistry.sol/BankRockRegistry.json");
  if (!fs.existsSync(artifactPath)) {
    console.error("Artifact not found. Please run 'npx hardhat compile' first.");
    process.exit(1);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
  console.log(`Loaded contract bytecode: ${artifact.bytecode.slice(0, 20)}... (${artifact.bytecode.length / 2} bytes)`);
  console.log("ABI functions:", artifact.abi.filter(item => item.type === "function").map(f => f.name).join(", "));

  // Address if deployed on Base Sepolia
  const deployedAddress = process.env.REGISTRY_ADDRESS || "0x83B1A8a09f87258385698b9C433e143FDF2A9F52";
  console.log(`\nRegistry contract address: ${deployedAddress}`);
  console.log(`BaseScan URL: https://sepolia.basescan.org/address/${deployedAddress}#code`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
