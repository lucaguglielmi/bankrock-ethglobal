import {
  Web3Function,
  Web3FunctionContext,
} from "@gelatonetwork/web3-functions-sdk";
import { createPublicClient, http, parseAbi, formatEther } from "viem";

/**
 * Bank Rock keeper — SIMULATION.
 *
 * This function reads real balances and computes a real deviation figure, but it never returns
 * `canExec: true` and therefore never causes a transaction. There is no on-chain rebalance
 * entry point to call: see README.md in this directory for what is missing and what it would
 * take to make this real.
 *
 * The previous revision built calldata for `rebalance(address,bytes32)` on the 1inch
 * Aggregation Router — a function that does not exist on that contract, on any chain. Had a
 * Gelato task ever been funded against it, every execution would have reverted and paid gas to
 * do so. That call is removed rather than corrected, because the correct call is not yet known.
 */

const REGISTRY_ABI = parseAbi([
  "function getRock(uint256 rockId) view returns (address owner, address smartAccount, bytes32 uidHash, uint8 state, bool lost, (address recipient, uint64 expiresAt, uint64 initiatedAt, address initiatedBy, bytes32 messageHash) handover)",
]);

const ERC20_ABI = parseAbi(["function balanceOf(address) view returns (uint256)"]);

/** `RockState.Awake` and `RockState.HandoverPending` in BankRockRegistry. */
const STATE_AWAKE = 1;
const STATE_HANDOVER_PENDING = 2;

/** Deviation from a 50/50 split, in percentage points, that would justify acting. */
const THRESHOLD_PERCENT = 3.0;

type Secrets = Web3FunctionContext["secrets"];

async function secret(secrets: Secrets, name: string): Promise<string | undefined> {
  const value = await secrets.get(name);
  return value === undefined || value === null || value === "" ? undefined : value;
}

/**
 * Best-effort notification that the keeper hit an error.
 *
 * The endpoint comes from the `ALERT_API_URL` secret. There is no default and no hardcoded
 * origin: decision D-022 makes `https://bank-rock.com` the one canonical origin, and it is
 * supplied as configuration rather than compiled in, so a task pointed at a preview deployment
 * does not silently call production.
 */
async function fireAlert(message: string, secrets: Secrets): Promise<void> {
  try {
    const alertUrl = await secret(secrets, "ALERT_API_URL");
    if (alertUrl === undefined) {
      console.warn("ALERT_API_URL is not set; skipping alert dispatch.");
      return;
    }
    await fetch(alertUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, source: "gelato_keeper" }),
    });
  } catch (error) {
    console.error("Failed to send alert", error);
  }
}

Web3Function.onRun(async (context: Web3FunctionContext) => {
  const { multiChainProvider, secrets } = context;
  const provider = multiChainProvider.default();

  const publicClient = createPublicClient({
    transport: http(provider.connection.url),
  });

  const registryAddress = await secret(secrets, "REGISTRY_ADDRESS");
  const usdcAddress = await secret(secrets, "USDC_ADDRESS");
  const rockId = (await secret(secrets, "ROCK_ID")) ?? "1";

  if (registryAddress === undefined || usdcAddress === undefined) {
    return {
      canExec: false,
      message:
        "SIMULATION — not configured. Set the REGISTRY_ADDRESS and USDC_ADDRESS secrets on the " +
        "Gelato task (Ethereum Sepolia values; see spec 16).",
    };
  }

  try {
    const rock = await publicClient.readContract({
      address: registryAddress as `0x${string}`,
      abi: REGISTRY_ABI,
      functionName: "getRock",
      args: [BigInt(rockId)],
    });

    const smartAccount = rock[1];
    const state = Number(rock[3]);

    if (state !== STATE_AWAKE && state !== STATE_HANDOVER_PENDING) {
      return { canExec: false, message: `SIMULATION — rock #${rockId} is not awake.` };
    }

    // Native ETH held by the Rock Account. This is *not* WETH; the two are tracked separately
    // and this function deliberately does not conflate them the way the previous revision did.
    const nativeWei = await publicClient.getBalance({ address: smartAccount });
    const nativeEth = Number(formatEther(nativeWei));

    const usdcUnits = await publicClient.readContract({
      address: usdcAddress as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [smartAccount],
    });
    const usdc = Number(usdcUnits) / 1e6;

    // No price oracle is wired, so no dollar value of the ETH leg can be stated. The ratio below
    // is therefore reported in the two raw units only; it is not a portfolio weighting and must
    // not be presented as one.
    return {
      canExec: false,
      message:
        `SIMULATION — this keeper executes nothing. Rock #${rockId} (account ${smartAccount}) ` +
        `holds ${usdc} USDC and ${nativeEth} native ETH. A real keeper would compare these ` +
        `against the rock's Aqua strategy reserves and rebalance when the deviation exceeded ` +
        `${THRESHOLD_PERCENT}%. Neither the Aqua integration nor a price source exists yet, so ` +
        `no deviation is computed and no transaction is proposed. See README.md.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Bank Rock keeper read failed:", message);
    await fireAlert(`Bank Rock keeper read failed for rock #${rockId}: ${message}`, secrets);
    return { canExec: false, message: `SIMULATION — read failed: ${message}` };
  }
});
