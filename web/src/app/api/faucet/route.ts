/**
 * POST /api/faucet - sends Sepolia ETH to a new Rock Account or wallet (SA-4, X-8, D-023).
 *
 *  - `FAUCET_PRIVATE_KEY` has no default. It used to fall back to the Anvil/Hardhat account #0
 *    key, which every Ethereum developer holds; the address was funded and sweepable by anyone.
 *    Unset now means 503 UNAVAILABLE - the faucet does not exist rather than running as a
 *    publicly-known key (D-017);
 *  - limits are per-address **and** per-IP, both persisted in D1. Per-address alone is defeated
 *    with a fresh address (X-8), and per-isolate memory does not persist at all;
 *  - when the limit store is unreachable the request is refused. A faucet that cannot count is a
 *    faucet that can be drained;
 *  - the chain is Sepolia, through lib/chain.
 */

import { NextResponse } from "next/server";
import { createWalletClient, http, isAddress, getAddress, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { eq } from "drizzle-orm";
import { chain, getPublicClient } from "@/lib/chain";
import { getDb, NO_DATABASE_REASON } from "@/lib/db";
import { faucetClaims, faucetIpClaims } from "@/lib/db/schema";
import { MissingEnvError, optionalEnv, requireEnv } from "@/lib/demo";
import { clientIp, hashKey } from "@/lib/rate-limit";
import { unavailableResponse } from "@/lib/secure";
import { logger } from "@/lib/telemetry";

const CLAIM_AMOUNT_ETH = "0.01";
const ADDRESS_WINDOW_MS = 24 * 60 * 60 * 1000;
const IP_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_CLAIMS_PER_IP_PER_WINDOW = 3;

export async function POST(req: Request) {
  const start = Date.now();

  let privateKey: string;
  try {
    privateKey = requireEnv("FAUCET_PRIVATE_KEY");
  } catch (err) {
    if (err instanceof MissingEnvError) {
      return unavailableResponse("FAUCET_PRIVATE_KEY is not configured, so the faucet is offline");
    }
    throw err;
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    return unavailableResponse("FAUCET_PRIVATE_KEY is not a 32-byte hex private key");
  }

  const body = (await req.json().catch(() => ({}))) as { address?: string };
  const raw = String(body.address ?? "").trim();
  if (!isAddress(raw)) {
    return NextResponse.json({ error: "A valid EVM address is required" }, { status: 400 });
  }
  const address = getAddress(raw);

  const db = getDb();
  if (!db) {
    // Without the claim ledger there is no rate limit, and an unlimited faucet is a drain.
    return unavailableResponse(
      `${NO_DATABASE_REASON}; the faucet will not send funds it cannot rate-limit`,
    );
  }

  const ip = clientIp(req);
  const ipHash = ip ? await hashKey(ip) : null;

  try {
    const existingClaim = await db
      .select()
      .from(faucetClaims)
      .where(eq(faucetClaims.walletAddress, address))
      .get();

    if (existingClaim && start - existingClaim.lastClaimTimestamp < ADDRESS_WINDOW_MS) {
      return NextResponse.json(
        { error: "This address already claimed in the last 24 hours." },
        { status: 429 },
      );
    }

    if (ipHash) {
      const ipClaim = await db
        .select()
        .from(faucetIpClaims)
        .where(eq(faucetIpClaims.ipHash, ipHash))
        .get();

      if (
        ipClaim &&
        start - ipClaim.lastClaimTimestamp < IP_WINDOW_MS &&
        ipClaim.claimCount >= MAX_CLAIMS_PER_IP_PER_WINDOW
      ) {
        return NextResponse.json(
          { error: "This network already claimed the maximum number of times today." },
          { status: 429 },
        );
      }
    }

    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const publicClient = getPublicClient();
    const rpcUrl = optionalEnv("SEPOLIA_RPC_URL");
    const walletClient = createWalletClient({
      account,
      chain,
      transport: rpcUrl ? http(rpcUrl) : http(),
    });

    const faucetBalance = await publicClient.getBalance({ address: account.address });
    if (faucetBalance < parseEther(CLAIM_AMOUNT_ETH)) {
      logger.warn("Faucet is out of funds", { action: "FAUCET_EMPTY" });
      return NextResponse.json(
        { state: "UNAVAILABLE", reason: "The faucet wallet is out of funds" },
        { status: 503 },
      );
    }

    const hash = await walletClient.sendTransaction({
      to: address,
      value: parseEther(CLAIM_AMOUNT_ETH),
    });

    await db
      .insert(faucetClaims)
      .values({ walletAddress: address, lastClaimTimestamp: start })
      .onConflictDoUpdate({
        target: faucetClaims.walletAddress,
        set: { lastClaimTimestamp: start },
      });

    if (ipHash) {
      const windowStart = start - IP_WINDOW_MS;
      const ipClaim = await db
        .select()
        .from(faucetIpClaims)
        .where(eq(faucetIpClaims.ipHash, ipHash))
        .get();
      const nextCount =
        ipClaim && ipClaim.lastClaimTimestamp > windowStart ? ipClaim.claimCount + 1 : 1;

      await db
        .insert(faucetIpClaims)
        .values({ ipHash, lastClaimTimestamp: start, claimCount: nextCount })
        .onConflictDoUpdate({
          target: faucetIpClaims.ipHash,
          set: { lastClaimTimestamp: start, claimCount: nextCount },
        });
    }

    logger.info("Faucet transaction broadcast", {
      action: "FAUCET_FUNDED",
      recipient: address,
      txHash: hash,
      latencyMs: Date.now() - start,
    });

    return NextResponse.json({ state: "REAL", txHash: hash, amountEth: CLAIM_AMOUNT_ETH });
  } catch (error) {
    logger.error("Faucet transaction failed", error, { action: "FAUCET_FAILED" });
    return NextResponse.json(
      { state: "UNAVAILABLE", reason: "The faucet transaction was not broadcast" },
      { status: 503 },
    );
  }
}
