import { NextResponse } from "next/server";
import { createWalletClient, http, parseEther, createPublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

// In a real implementation, this would use a secure environment variable for the faucet wallet's private key
const FAUCET_PRIVATE_KEY = process.env.FAUCET_PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // Anvil default PK for testing
const account = privateKeyToAccount(FAUCET_PRIVATE_KEY as `0x${string}`);

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(),
});

export async function POST(req: Request) {
  try {
    const { address } = await req.json();

    if (!address) {
      return NextResponse.json({ error: "Address is required" }, { status: 400 });
    }

    // A real implementation would fund testnet ERC-20 tokens.
    // For this 1-click testnet faucet MVP, we just send test ETH (or call a mint function on a mock ERC-20).
    const hash = await walletClient.sendTransaction({
      to: address as `0x${string}`,
      value: parseEther("0.01"),
    });

    return NextResponse.json({ success: true, txHash: hash });
  } catch (error) {
    console.error("Faucet error:", error);
    return NextResponse.json({ error: "Failed to fund account" }, { status: 500 });
  }
}
