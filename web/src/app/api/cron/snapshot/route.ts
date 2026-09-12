import { NextResponse } from 'next/server';
import { getRequestContext } from "@cloudflare/next-on-pages";
import { getDb } from "@/lib/db";
import { yieldSnapshots } from "@/lib/db/schema";
import { logger } from "@/lib/telemetry";
import { createPublicClient, http, formatUnits } from 'viem';
import { baseSepolia } from 'viem/chains';
import { BANK_ROCK_REGISTRY_ADDRESS, BANK_ROCK_REGISTRY_ABI, AQUA_ADDRESSES } from "@/lib/contracts";

export const runtime = "edge";

const ERC20_BALANCE_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  
  if (process.env.CRON_SECRET && token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const env = getRequestContext().env as any;
    if (!env || !env.DB) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 });
    }
    
    const db = getDb(env);
    const now = Date.now();

    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(process.env.RPC_URL || "https://sepolia.base.org")
    });

    // Default to Rock #1 and #2
    const rocksToSnapshot = ["1", "2"];

    for (const rockId of rocksToSnapshot) {
      let tvlUsdc = 0;
      let feesEarnedUsdc = 0; // Mock for now

      try {
        const rockData = await publicClient.readContract({
          address: BANK_ROCK_REGISTRY_ADDRESS as `0x${string}`,
          abi: BANK_ROCK_REGISTRY_ABI,
          functionName: 'rocks',
          args: [BigInt(rockId)]
        }) as [string, string, bigint, boolean];

        const smartAccount = rockData[0] as `0x${string}`;

        if (smartAccount && smartAccount !== "0x0000000000000000000000000000000000000000") {
          const usdcBalance = await publicClient.readContract({
            address: AQUA_ADDRESSES.testUSDC as `0x${string}`,
            abi: ERC20_BALANCE_ABI,
            functionName: 'balanceOf',
            args: [smartAccount]
          }) as bigint;

          const wethBalance = await publicClient.readContract({
            address: AQUA_ADDRESSES.testWETH as `0x${string}`,
            abi: ERC20_BALANCE_ABI,
            functionName: 'balanceOf',
            args: [smartAccount]
          }) as bigint;

          const usdcNum = parseFloat(formatUnits(usdcBalance, 6));
          const wethNum = parseFloat(formatUnits(wethBalance, 18));
          
          // Assuming 1 WETH = 2500 USDC
          tvlUsdc = parseFloat((usdcNum + wethNum * 2500).toFixed(2));
          feesEarnedUsdc = parseFloat((tvlUsdc * 0.01).toFixed(2)); // Mocking some earned fees based on TVL
        }
      } catch (err) {
        logger.error(`Failed to fetch balances for rock ${rockId}`, { error: String(err) });
      }

      await db.insert(yieldSnapshots).values({
        id: crypto.randomUUID(),
        rockId: rockId,
        timestamp: now,
        tvlUsdc: tvlUsdc,
        feesEarnedUsdc: feesEarnedUsdc,
      });
    }

    logger.info('Yield Snapshot Cron executed successfully', { rocksSnapshotted: rocksToSnapshot.length });

    return NextResponse.json({ success: true, message: "Yield snapshots captured." });
  } catch (error) {
    logger.error('Error executing Yield Snapshot Cron', error as Error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
