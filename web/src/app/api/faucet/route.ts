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

import { logger } from "@/lib/telemetry";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { getDb } from "@/lib/db";
import { faucetClaims } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function POST(req: Request) {
  const start = Date.now();
  
  try {
    const { address } = await req.json() as any;

    if (!address) {
      logger.warn("Faucet request missing destination address", {
        action: "FAUCET_REQUEST_INVALID",
        statusCode: 400,
      });
      return NextResponse.json({ error: "Address is required" }, { status: 400 });
    }

    const env = getRequestContext().env as any;
    if (env && env.DB) {
      const db = getDb(env);
      const existingClaim = await db.select().from(faucetClaims).where(eq(faucetClaims.walletAddress, address)).get();
      
      if (existingClaim && (start - existingClaim.lastClaimTimestamp) < RATE_LIMIT_WINDOW_MS) {
        logger.warn("Sybil rate limit exceeded for address", { address });
        return NextResponse.json({ error: "Rate limit exceeded. You can only request testnet funds once every 24 hours." }, { status: 429 });
      }
    }


    logger.info("Processing faucet funding request", {
      action: "FAUCET_REQUEST_START",
      recipient: address,
      chain: "Base Sepolia (84532)",
    });

    const faucetBalance = await publicClient.getBalance({ address: account.address });
    if (faucetBalance < parseEther("0.01")) {
      logger.error("Faucet out of funds", new Error("Insufficient faucet balance"), { action: "FAUCET_EMPTY", balance: faucetBalance.toString() });
      return NextResponse.json({ error: "Faucet is temporarily out of funds" }, { status: 503 });
    }

    // Funds testnet ETH to the user or newly deployed Safe account
    const hash = await walletClient.sendTransaction({
      to: address as `0x${string}`,
      value: parseEther("0.01"),
    });

    if (env && env.DB) {
      const db = getDb(env);
      await db.insert(faucetClaims).values({
        walletAddress: address,
        lastClaimTimestamp: start,
      }).onConflictDoUpdate({
        target: faucetClaims.walletAddress,
        set: { lastClaimTimestamp: start }
      });
    }

    const latencyMs = Date.now() - start;
    logger.info("Faucet funding broadcasted successfully", {
      action: "FAUCET_FUNDED",
      recipient: address,
      txHash: hash,
      latencyMs,
    });

    return NextResponse.json({ success: true, txHash: hash });
  } catch (error) {
    const latencyMs = Date.now() - start;
    logger.error("Faucet transaction failed", error, {
      action: "FAUCET_FAILED",
      latencyMs,
    });
    return NextResponse.json({ error: "Failed to fund account" }, { status: 500 });
  }
}
