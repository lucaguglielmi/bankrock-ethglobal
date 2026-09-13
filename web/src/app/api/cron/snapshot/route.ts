/**
 * GET /api/cron/snapshot - records a TVL snapshot per rock (N-8, SA-9, SA-12, D-016, D-023).
 *
 *  - the cron secret moves from `?token=` to the `x-cron-secret` header, so it stops travelling
 *    into access logs (SA-12), and an unset secret rejects instead of disabling the check (SA-9);
 *  - fees were mocked as `tvl * 0.01` and ETH was priced at a hardcoded 2,500 while the keeper
 *    used 2,850. Neither number exists any more: the snapshot records the token balances it
 *    actually read, and nothing else;
 *  - reads go through lib/chain on Sepolia (D-023) and D1 through getCloudflareContext (D-016);
 *  - with no registry address there is nothing to snapshot, and it says so.
 */

import { NextResponse } from "next/server";
import { formatUnits, zeroAddress } from "viem";
import { addresses, getPublicClient, tokens } from "@/lib/chain";
import { BANK_ROCK_REGISTRY_ABI } from "@/lib/chain/abi/registry";
import { ERC20_ABI } from "@/lib/chain/abi/erc20";
import { mapRockRecord, type GetRockResult } from "@/lib/rock-account";
import { getDb, NO_DATABASE_REASON } from "@/lib/db";
import { yieldSnapshots } from "@/lib/db/schema";
import { requireCronSecret } from "@/lib/secure";
import { logger } from "@/lib/telemetry";

export async function GET(req: Request) {
  const guard = requireCronSecret(req);
  if (!guard.ok) return guard.response;

  const db = getDb();
  if (!db) {
    return NextResponse.json({ state: "UNAVAILABLE", reason: NO_DATABASE_REASON }, { status: 503 });
  }

  const registry = addresses.registry;
  if (!registry || !tokens.USDC.address || !tokens.WETH.address) {
    return NextResponse.json(
      {
        state: "UNAVAILABLE",
        reason:
          "The registry or token addresses are not configured, so there are no balances to snapshot",
      },
      { status: 503 },
    );
  }

  const client = getPublicClient();
  const now = Date.now();
  const rockIds = ["1", "2"];
  const recorded: string[] = [];
  const skipped: { rockId: string; reason: string }[] = [];

  for (const rockId of rockIds) {
    try {
      const raw = (await client.readContract({
        address: registry,
        abi: BANK_ROCK_REGISTRY_ABI,
        functionName: "getRock",
        args: [BigInt(rockId)],
      })) as unknown as GetRockResult;

      const record = mapRockRecord(rockId, raw);
      const rockAccount = record.smartAccount;
      if (record.state === "dormant" || !rockAccount || rockAccount === zeroAddress) {
        skipped.push({ rockId, reason: "No Rock Account is registered for this rock" });
        continue;
      }

      const [usdcBalance, wethBalance] = await Promise.all([
        client.readContract({
          address: tokens.USDC.address,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [rockAccount],
        }),
        client.readContract({
          address: tokens.WETH.address,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [rockAccount],
        }),
      ]);

      // TVL is recorded in USDC units only. Converting WETH would need a price, and there is no
      // price oracle configured; inventing one is what N-8 was.
      const usdc = Number(formatUnits(usdcBalance, tokens.USDC.decimals));
      const weth = Number(formatUnits(wethBalance, tokens.WETH.decimals));

      await db.insert(yieldSnapshots).values({
        id: crypto.randomUUID(),
        rockId,
        timestamp: now,
        tvlUsdc: usdc,
        // Fees are read from Aqua once a strategy is shipped (Phase 3). Until then there is no
        // measured fee figure, and 0 is the honest record of "none observed".
        feesEarnedUsdc: 0,
      });

      logger.info("Recorded yield snapshot", {
        action: "SNAPSHOT_RECORDED",
        rockId,
        usdc,
        weth,
      });
      recorded.push(rockId);
    } catch (err) {
      logger.error("Snapshot failed for rock", err, { action: "SNAPSHOT_FAILED", rockId });
      skipped.push({ rockId, reason: "The chain read failed" });
    }
  }

  return NextResponse.json({ state: "REAL", recorded, skipped, timestamp: now });
}
