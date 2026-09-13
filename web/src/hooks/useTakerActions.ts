"use client";

/**
 * The visitor's side of a rock: swapping against one of its Aqua strategies.
 *
 * Three facts shape this hook, all from `contracts/aqua/NOTES.md`:
 *
 *  1. **A taker must be a contract.** `XYCSwap` calls `xycSwapCallback` back into whoever called
 *     it, and the callback must answer by pushing the input into Aqua. An EOA cannot answer it and
 *     a plain Safe would push nothing (§5). So the visitor transacts through `XYCSwapTaker`, the
 *     periphery, and does it from a smart account of their own.
 *  2. **The approval goes to the periphery**, not to Aqua and not to the app — the periphery is
 *     what pulls the input from the taker. That is the opposite of the maker's rule, where the
 *     approval goes to Aqua (§1), and getting it backwards is a revert, not a silent loss.
 *  3. **The swap is two calls**, `approve` then `swapExactIn`, which is exactly one sponsored
 *     batch from a smart account — so a visitor with no ETH can trade.
 *
 * The account here is the visitor's *personal* Safe: salt `PERSONAL_ACCOUNT_SALT`, owner their
 * Privy wallet, not tied to any tag. A visitor who swaps against three rocks uses one account.
 *
 * The hook also reports that account's **address and its token balances**, because they are what a
 * visitor needs before a swap can work at all: the account is counterfactual, it starts empty, and
 * a swap from an empty account fails during estimation with a bundler error nobody can act on. The
 * balances are REAL reads of the same two ERC-20s the rock page reads, or UNAVAILABLE with a reason.
 *
 * Everything degrades to UNAVAILABLE with a reason (D-013): signed out, no Pimlico key, no app or
 * periphery address, no live strategy. `amountOut` is read from the chain — the app's return value
 * in the receipt's `Pushed`/`Pulled` events — never from the preview the user was shown (D-014).
 */

import { useCallback, useMemo, useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  getAddress,
  http,
  type Address,
  type Hex,
} from "viem";
import { toSafeSmartAccount } from "permissionless/accounts";
import { createSmartAccountClient } from "permissionless/clients";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import {
  buildStrategy,
  buildSwapCall,
  getAquaAddresses,
  getAquaTakerAddress,
  readRockStreams,
} from "@/lib/aqua";
import { AQUA_ABI } from "@/lib/chain/abi/aqua";
import { chain, ENTRY_POINT_07_ADDRESS } from "@/lib/chain";
import { env, real, unavailable, type Capability } from "@/lib/demo";
import {
  approvalCalls,
  parseRockId,
  pimlicoApiKey,
  pimlicoRpcUrl,
  readAllowance,
  readReserves,
  PERSONAL_ACCOUNT_SALT,
  type Call,
  type RockReserves,
} from "@/lib/rock-account";
import { useAuth } from "@/context/auth-context";
import { publicReasonWith } from "@/lib/errors";

export interface SwapParams {
  rockId: string;
  /** The rock's Rock Account — the maker whose reserve is being traded against. */
  maker: Address;
  streamIndex: number;
  tokenIn: "USDC" | "WETH";
  /** Base units of `tokenIn`. */
  amountIn: bigint;
  /** The floor the visitor accepts, in base units of the other token. */
  minAmountOut: bigint;
}

export interface UseTakerActions {
  /** The visitor's personal smart account. UNAVAILABLE when signed out or AA is unconfigured. */
  account: Capability<Address>;
  /** That account's USDC and WETH balances — what it can actually pay a swap with. */
  balances: Capability<RockReserves>;
  swap(params: SwapParams): Promise<Capability<{ txHash: Hex; amountOut: bigint }>>;
  isPending: boolean;
}

const SIGNED_OUT_REASON = "Sign in to swap";

interface TakerClient {
  account: { address: Address };
  sendUserOperation: (args: { calls: Call[] }) => Promise<Hex>;
  waitForUserOperationReceipt: (args: { hash: Hex }) => Promise<{
    success: boolean;
    receipt: { transactionHash: Hex; logs: { address: string; topics: string[]; data: string }[] };
  }>;
}

async function buildTakerClient(params: {
  provider: unknown;
  ownerAddress: Address;
}): Promise<Capability<TakerClient>> {
  const key = pimlicoApiKey();
  if (key.state === "UNAVAILABLE") return unavailable(key.reason);
  const bundlerUrl = pimlicoRpcUrl(key.value);

  try {
    const owner = createWalletClient({
      account: params.ownerAddress,
      chain,
      transport: custom(params.provider as Parameters<typeof custom>[0]),
    });

    const account = await toSafeSmartAccount({
      client: createPublicClient({ chain, transport: http(env.sepoliaRpcUrlPublic || undefined) }),
      owners: [owner],
      version: "1.4.1",
      entryPoint: { address: ENTRY_POINT_07_ADDRESS, version: "0.7" },
      saltNonce: PERSONAL_ACCOUNT_SALT,
    });

    const paymaster = createPimlicoClient({
      transport: http(bundlerUrl),
      entryPoint: { address: ENTRY_POINT_07_ADDRESS, version: "0.7" },
    });

    const client = createSmartAccountClient({
      account,
      chain,
      bundlerTransport: http(bundlerUrl),
      paymaster,
      userOperation: {
        estimateFeesPerGas: async () => (await paymaster.getUserOperationGasPrice()).fast,
      },
    });

    return real(client as unknown as TakerClient);
  } catch (err) {
    return unavailable(
      publicReasonWith("Your account could not be prepared", err),
    );
  }
}

/**
 * The amount the swap actually paid out, read from the receipt.
 *
 * Aqua's `Pulled(maker, app, strategyHash, token, amount)` is the output leaving the maker's
 * wallet for the taker, and it is the only record of the executed size: the preview the user was
 * shown is not evidence, and the periphery's return value is not visible in a receipt. None of
 * Aqua's event parameters is indexed, so the log is matched by address and signature and then
 * filtered by its decoded fields (NOTES.md §8.2).
 */
export function readAmountOutFromLogs(
  logs: { address: string; topics: string[]; data: string }[],
  filter: { aqua: Address; strategyHash: Hex; tokenOut: Address },
): bigint | null {
  for (const log of logs) {
    if (log.address.toLowerCase() !== filter.aqua.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: AQUA_ABI,
        data: log.data as Hex,
        topics: log.topics as [Hex, ...Hex[]],
      }) as unknown as { eventName: string; args: Record<string, unknown> };

      if (decoded.eventName !== "Pulled") continue;
      const args = decoded.args;
      if (String(args.strategyHash).toLowerCase() !== filter.strategyHash.toLowerCase()) continue;
      if (String(args.token).toLowerCase() !== filter.tokenOut.toLowerCase()) continue;
      if (typeof args.amount === "bigint") return args.amount;
    } catch {
      // Not an Aqua event, or not one this ABI knows. Keep looking.
    }
  }
  return null;
}

export function takerAccountQueryKey(owner: string | undefined) {
  return ["taker-account", owner ?? "none"] as const;
}

export function takerBalancesQueryKey(account: string | undefined) {
  return ["taker-balances", account ?? "none"] as const;
}

/** The cadence the rock page polls on, so tokens sent to the account appear without a reload. */
const BALANCE_REFETCH_MS = 15_000;

export function useTakerActions(): UseTakerActions {
  const { wallets } = useWallets();
  const { authenticated, address } = useAuth();
  const [isPending, setIsPending] = useState(false);

  const wallet = useMemo(() => {
    if (!authenticated || !address) return null;
    const lowered = address.toLowerCase();
    return wallets.find((w) => w.address.toLowerCase() === lowered) ?? wallets[0] ?? null;
  }, [wallets, authenticated, address]);

  const accountQuery = useQuery({
    queryKey: takerAccountQueryKey(wallet?.address),
    enabled: Boolean(wallet),
    staleTime: Infinity,
    retry: false,
    queryFn: async (): Promise<Capability<Address>> => {
      const provider = await wallet!.getEthereumProvider();
      const client = await buildTakerClient({
        provider,
        ownerAddress: getAddress(wallet!.address),
      });
      if (client.state === "UNAVAILABLE") return unavailable(client.reason);
      return real(getAddress(client.value.account.address));
    },
  });

  const account: Capability<Address> = !authenticated || !wallet
    ? unavailable(SIGNED_OUT_REASON)
    : (accountQuery.data ?? unavailable("Preparing your account…"));

  const accountAddress = account.state === "REAL" ? account.value : undefined;

  // What that account can pay with: the same `ERC20.balanceOf` pair the rock page reads for a
  // Rock Account. A taker Safe is an ordinary holder of the two tokens.
  const balancesQuery = useQuery({
    queryKey: takerBalancesQueryKey(accountAddress),
    enabled: Boolean(accountAddress),
    refetchInterval: BALANCE_REFETCH_MS,
    staleTime: BALANCE_REFETCH_MS,
    retry: false,
    queryFn: async (): Promise<Capability<RockReserves>> => readReserves(accountAddress),
  });

  const balances: Capability<RockReserves> =
    account.state === "UNAVAILABLE"
      ? unavailable(account.reason)
      : (balancesQuery.data ?? unavailable("Reading this account's balances…"));

  const swap = useCallback(
    async (params: SwapParams): Promise<Capability<{ txHash: Hex; amountOut: bigint }>> => {
      setIsPending(true);
      try {
        if (parseRockId(params.rockId) === null) {
          return unavailable(`"${params.rockId}" is not a rock id`);
        }
        if (params.amountIn <= BigInt(0)) {
          return unavailable("Enter an amount to swap");
        }
        if (!authenticated || !wallet) return unavailable(SIGNED_OUT_REASON);

        const addresses = getAquaAddresses();
        if (addresses.state === "UNAVAILABLE") return unavailable(addresses.reason);
        const { aqua, app, usdc, weth } = addresses.value;

        const taker = getAquaTakerAddress();
        if (taker.state === "UNAVAILABLE") return unavailable(taker.reason);

        // The strategy must be the shipped one, byte for byte: the app re-derives its hash on
        // every call, so a fee or salt that is off by anything has no balances at all.
        const view = await readRockStreams({
          rockId: params.rockId,
          maker: params.maker,
          app,
        });
        if (view.state === "UNAVAILABLE") return unavailable(view.reason);

        const stream = view.value.streams.find(
          (candidate) => candidate.streamIndex === BigInt(params.streamIndex),
        );
        if (!stream) {
          return unavailable(
            `This rock has no live Aqua strategy at stream ${params.streamIndex}`,
          );
        }

        const strategy = buildStrategy({
          maker: params.maker,
          token0: usdc,
          token1: weth,
          feeBps: stream.feeBps,
          rockId: params.rockId,
          streamIndex: params.streamIndex,
        });

        const tokenIn = params.tokenIn === "USDC" ? usdc : weth;
        const tokenOut = params.tokenIn === "USDC" ? weth : usdc;

        // The account is built first because the swap has to name it: the periphery rejects a
        // zero recipient now, so `to` is the address the output is paid to, and for a smart
        // account that is not the same thing as `msg.sender` being implied.
        const clientCapability = await buildTakerClient({
          provider: await wallet.getEthereumProvider(),
          ownerAddress: getAddress(wallet.address),
        });
        if (clientCapability.state === "UNAVAILABLE") return unavailable(clientCapability.reason);
        const client = clientCapability.value;
        const sender = getAddress(client.account.address);

        const plan = buildSwapCall({
          strategy,
          tokenIn,
          amountIn: params.amountIn,
          minAmountOut: params.minAmountOut,
          to: sender,
          taker: taker.value,
          app,
        });
        if (plan.state === "UNAVAILABLE") return unavailable(plan.reason);

        // USDC reverts on a non-zero to non-zero approve, so the allowance is read first and
        // reset when it has to be.
        const current = await readAllowance(tokenIn, sender, taker.value);
        if (current.state === "UNAVAILABLE") return unavailable(current.reason);

        const approvals = approvalCalls({
          token: tokenIn,
          spender: taker.value,
          currentAllowance: current.value,
          amount: params.amountIn,
        });

        const userOpHash = await client.sendUserOperation({
          calls: [...approvals, plan.value.call],
        });
        const receipt = await client.waitForUserOperationReceipt({ hash: userOpHash });

        if (!receipt.success) {
          return unavailable("The swap reverted on chain and nothing moved");
        }

        const amountOut = readAmountOutFromLogs(receipt.receipt.logs ?? [], {
          aqua,
          strategyHash: strategy.strategyHash,
          tokenOut,
        });

        if (amountOut === null) {
          // The transaction happened; what it paid out could not be read. Report the hash and say
          // so, rather than echoing the preview as if it were the executed amount.
          return unavailable(
            `The swap was included in ${receipt.receipt.transactionHash}, but the amount it paid out could not be read from the receipt`,
          );
        }

        return real({ txHash: receipt.receipt.transactionHash, amountOut });
      } catch (err) {
        return unavailable(
          publicReasonWith("The swap was not completed", err),
        );
      } finally {
        setIsPending(false);
      }
    },
    [authenticated, wallet],
  );

  return { account, balances, swap, isPending };
}
