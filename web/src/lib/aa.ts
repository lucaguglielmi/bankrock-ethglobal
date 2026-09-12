/**
 * ERC-4337 Rock Account library (spec 03, spec 05, D-012, D-023, E-3).
 *
 * This is a library, not a wired path. Nothing in the UI calls it yet (C-6); wiring it into the
 * awaken flow is Phase 2 work. What changed here:
 *
 *  - the chain is Ethereum Sepolia, not Base Sepolia (D-023). The Pimlico endpoint is
 *    `https://api.pimlico.io/v2/sepolia/rpc?apikey=…`; the `84532` literal is gone;
 *  - the Aqua ABI is the real one (E-3). It previously encoded
 *    `ship(bytes32 strategyHash, bytes bytecode)`, which does not exist on Aqua; every call would
 *    have reverted;
 *  - the atomic batch is the one spec 16 §1.5 item 2 describes: the maker approves **Aqua**, not
 *    the app, and then ships. One user signature, three calls (D-012);
 *  - with `PIMLICO_API_KEY` or any required address unset, every entry point returns UNAVAILABLE.
 *    Nothing here invents a value or a hash.
 *
 * The Safe 1.4.1 / EntryPoint 0.7 stack `toSafeSmartAccount` needs is deployed on Sepolia at its
 * canonical addresses and `permissionless` resolves it itself (spec 16 §1.1).
 */

import { toSafeSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { encodeFunctionData, http, type Address, type Hex } from "viem";
import { AQUA_ABI } from "@/lib/chain/abi/aqua";
import { ERC20_ABI } from "@/lib/chain/abi/erc20";
import { addresses, chain, getPublicClient } from "@/lib/chain";
import { env, optionalEnv, real, unavailable, type Capability } from "@/lib/demo";
import { logger } from "@/lib/telemetry";

/** The public client this module transacts against. Sepolia only. */
export const publicClient = getPublicClient();

export interface Call {
  to: Address;
  data: Hex;
  value: bigint;
}

/** Sepolia bundler + verifying paymaster endpoint. Chain is named, never a numeric literal. */
export function pimlicoRpcUrl(): Capability<string> {
  // Server side, `process.env` at runtime holds only the Worker's own vars and secrets; the
  // public key is a BUILD-time value, and Next inlines it into `env` (a literal read in lib/demo.ts)
  // for the server bundle as well as the browser's. So the order is: an explicit Worker secret,
  // else the inlined public key. A name lookup of NEXT_PUBLIC_PIMLICO_API_KEY would always miss here.
  const apiKey = optionalEnv("PIMLICO_API_KEY") ?? (env.pimlicoApiKeyPublic.trim() || undefined);
  if (!apiKey) {
    return unavailable("PIMLICO_API_KEY is not configured");
  }
  return real(`https://api.pimlico.io/v2/sepolia/rpc?apikey=${apiKey}`);
}

/**
 * The Pimlico client used for both bundling and verifying-paymaster sponsorship.
 *
 * A sponsorship policy for chain 11155111 must exist in the Pimlico dashboard or the paymaster
 * rejects every UserOperation (spec 16 §1.4).
 */
export function getPimlicoClient(): Capability<ReturnType<typeof createPimlicoClient>> {
  const rpc = pimlicoRpcUrl();
  if (rpc.state === "UNAVAILABLE") return unavailable(rpc.reason);
  return real(createPimlicoClient({ transport: http(rpc.value) }));
}

/** Deploys/derives the Safe that is a rock's Rock Account. */
export async function createRockAccount(
  signer: Parameters<typeof toSafeSmartAccount>[0]["owners"][0],
) {
  return await toSafeSmartAccount({
    client: publicClient,
    owners: [signer],
    version: "1.4.1",
  });
}

export interface ShipBatchParams {
  /** The AquaApp the strategy runs in — our SwapVM router, or the reference XYCSwap app. */
  app: Address;
  /** The strategy bytes. `strategyHash = keccak256(strategy)` and it is immutable once shipped. */
  strategy: Hex;
  /** Reserve committed to the strategy, in token base units. */
  usdcAmount: bigint;
  wethAmount: bigint;
}

/**
 * Builds the atomic ship batch (D-012, spec 16 §1.5 item 2):
 *
 *   1. USDC.approve(Aqua, usdcAmount)
 *   2. WETH.approve(Aqua, wethAmount)
 *   3. Aqua.ship(app, strategy, [USDC, WETH], [usdcAmount, wethAmount])
 *
 * Approvals go to Aqua itself — once, for all strategies — never to the app.
 *
 * Returns UNAVAILABLE, listing the missing variables, rather than encoding against a placeholder.
 */
export function buildShipBatch(params: ShipBatchParams): Capability<Call[]> {
  const missing: string[] = [];
  if (!addresses.aqua) missing.push("NEXT_PUBLIC_AQUA_ADDRESS");
  if (!addresses.usdc) missing.push("NEXT_PUBLIC_USDC_ADDRESS");
  if (!addresses.weth) missing.push("NEXT_PUBLIC_WETH_ADDRESS");
  if (missing.length > 0) {
    return unavailable(`Cannot build the Aqua ship batch: ${missing.join(", ")} not configured`);
  }

  const aqua = addresses.aqua as Address;
  const usdc = addresses.usdc as Address;
  const weth = addresses.weth as Address;

  return real([
    {
      to: usdc,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [aqua, params.usdcAmount],
      }),
      value: BigInt(0),
    },
    {
      to: weth,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [aqua, params.wethAmount],
      }),
      value: BigInt(0),
    },
    {
      to: aqua,
      data: encodeFunctionData({
        abi: AQUA_ABI,
        functionName: "ship",
        args: [
          params.app,
          params.strategy,
          [usdc, weth],
          [params.usdcAmount, params.wethAmount],
        ],
      }),
      value: BigInt(0),
    },
  ]);
}

/** Builds the call that closes a strategy and returns its virtual balances (Flow H). */
export function buildDockCall(app: Address, strategyHash: Hex): Capability<Call> {
  if (!addresses.aqua || !addresses.usdc || !addresses.weth) {
    return unavailable("Cannot build the Aqua dock call: token or Aqua address not configured");
  }
  return real({
    to: addresses.aqua,
    data: encodeFunctionData({
      abi: AQUA_ABI,
      functionName: "dock",
      args: [app, strategyHash, [addresses.usdc, addresses.weth]],
    }),
    value: BigInt(0),
  });
}

interface BatchSender {
  sendTransaction: (args: { calls: Call[] }) => Promise<`0x${string}`>;
}

/**
 * Sends the ship batch as one sponsored UserOperation.
 *
 * The returned hash comes from the bundler — it is a real, broadcast transaction or it is an
 * error. There is no fallback value (D-014).
 */
export async function shipStrategy(
  smartAccountClient: BatchSender,
  params: ShipBatchParams,
): Promise<Capability<`0x${string}`>> {
  const batch = buildShipBatch(params);
  if (batch.state === "UNAVAILABLE") return unavailable(batch.reason);

  const start = Date.now();
  logger.info("Submitting atomic Aqua ship batch", {
    action: "AQUA_SHIP_START",
    app: params.app,
    chain: chain.name,
  });

  try {
    const txHash = await smartAccountClient.sendTransaction({ calls: batch.value });
    logger.info("Aqua ship batch submitted", {
      action: "AQUA_SHIP_SUCCESS",
      txHash,
      latencyMs: Date.now() - start,
    });
    return real(txHash);
  } catch (error) {
    logger.error("Aqua ship batch failed", error, {
      action: "AQUA_SHIP_FAILED",
      latencyMs: Date.now() - start,
    });
    return unavailable(
      `The Aqua ship UserOperation was not accepted: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
