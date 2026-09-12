/**
 * GET /api/version — the build stamp, and what this deployment is actually pointed at.
 *
 * `scripts/check-live.sh` reads this after every deploy: the point of the second half is that an
 * operator can tell, without opening a dashboard, whether the Worker's variables name contracts
 * that exist. So every configured address is reported together with the size of the code the RPC
 * reports at it, read **server-side** on each request. A variable that is unset, malformed or
 * points at an address with no code is reported as UNAVAILABLE with the reason, never silently
 * omitted (D-013, D-015).
 *
 * What may appear here, and what may not:
 *
 *  - **public** configuration only — the chain id, the six `NEXT_PUBLIC_*` addresses, and the two
 *    deploy blocks. The blocks are read from server-side variables, but a block number is a public
 *    fact: both are recorded in `contracts/deployments/*.json` in git and either is recoverable
 *    from the chain by anyone. They are here so a reader can see that the Worker agrees with the
 *    deployment record;
 *  - **never** a secret, a private key, an RPC URL, an API key, or the value of any variable that
 *    is not already public. Not even a redacted one. The endpoint is unauthenticated.
 *
 * The RPC reads are why this is rate limited. It fails open, like the other read routes: the limit
 * is there to protect the operator's RPC bill, and an outage is the wrong moment to stop answering
 * (`lib/rate-limit.ts`).
 */

import { NextResponse } from "next/server";
import { addresses, chain, chainId, getPublicClient, type AddressKey } from "@/lib/chain";
import { optionalEnv } from "@/lib/demo";
import { consumeIpRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** The environment variable behind each address, named in the reason when one is missing. */
const ADDRESS_VARIABLES: Record<AddressKey, string> = {
  registry: "NEXT_PUBLIC_REGISTRY_ADDRESS",
  aquaApp: "NEXT_PUBLIC_AQUA_APP_ADDRESS",
  aquaTaker: "NEXT_PUBLIC_AQUA_TAKER_ADDRESS",
  aqua: "NEXT_PUBLIC_AQUA_ADDRESS",
  usdc: "NEXT_PUBLIC_USDC_ADDRESS",
  weth: "NEXT_PUBLIC_WETH_ADDRESS",
};

type ContractReport =
  | { state: "REAL"; variable: string; address: string; codeSize: number }
  | { state: "UNAVAILABLE"; variable: string; address: string | null; reason: string };

/**
 * One address, with the size of the code the chain has at it.
 *
 * Zero bytes is a failure, not a number to report cheerfully: an address with no code is either
 * the wrong address or a contract that was never deployed, and both make every dependent
 * capability fail later, further from the cause.
 */
async function describe(key: AddressKey): Promise<ContractReport> {
  const variable = ADDRESS_VARIABLES[key];
  const address = addresses[key];
  if (!address) {
    return { state: "UNAVAILABLE", variable, address: null, reason: `${variable} is not configured` };
  }

  try {
    const code = await getPublicClient().getCode({ address });
    const codeSize = code && code !== "0x" ? (code.length - 2) / 2 : 0;
    if (codeSize === 0) {
      return {
        state: "UNAVAILABLE",
        variable,
        address,
        reason: `no contract code at ${address} on ${chain.name}`,
      };
    }
    return { state: "REAL", variable, address, codeSize };
  } catch {
    // Never built from the exception: viem puts the RPC URL, which carries the provider's API key,
    // into its error text and this endpoint is unauthenticated (audit P-2).
    return {
      state: "UNAVAILABLE",
      variable,
      address,
      reason: `the ${chain.name} RPC could not be reached to check this address`,
    };
  }
}

/** A recorded deploy block, or null when the operator has not configured it. */
function deployBlock(variable: string): number | null {
  const raw = optionalEnv(variable);
  if (!raw || !/^\d+$/.test(raw)) return null;
  return Number(raw);
}

export async function GET(req: Request) {
  const limit = await consumeIpRateLimit(req, "version", 60, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
  }

  const keys: AddressKey[] = ["registry", "aquaApp", "aquaTaker", "aqua", "usdc", "weth"];
  const reports = await Promise.all(keys.map((key) => describe(key)));

  const contracts = Object.fromEntries(
    keys.map((key, index) => [key, reports[index]]),
  ) as Record<AddressKey, ContractReport>;

  const missing = reports.filter((report) => report.state === "UNAVAILABLE").length;

  return NextResponse.json(
    {
      version: process.env.NEXT_PUBLIC_APP_VERSION || "dev",
      chain: {
        id: chainId,
        name: chain.name,
      },
      contracts,
      deployBlocks: {
        registry: deployBlock("REGISTRY_DEPLOY_BLOCK"),
        aquaApp: deployBlock("AQUA_APP_DEPLOY_BLOCK"),
      },
      state: missing === 0 ? "REAL" : "UNAVAILABLE",
      reason:
        missing === 0
          ? undefined
          : `${missing} of ${keys.length} contract addresses are unconfigured or have no code`,
    },
    { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=45" } },
  );
}
