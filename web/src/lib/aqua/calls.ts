/**
 * Calldata builders. Every Aqua interaction a rock or a visitor performs is assembled here and
 * nowhere else, and this module **only builds bytes** — it never signs, submits, or estimates.
 *
 * Submission belongs to the Rock Account layer (`lib/rock-account.ts`, `lib/aa.ts`): the owner's
 * ship and dock go out as one sponsored UserOperation from the rock's Safe (D-012), and the
 * visitor's swap goes out from their own wallet. Both take the `{ to, data, value }` arrays
 * produced here unchanged.
 *
 * The two shapes, from `contracts/aqua/NOTES.md`:
 *
 *   ship  →  USDC.approve(Aqua, a), WETH.approve(Aqua, b), Aqua.ship(app, strategy, [USDC, WETH], [a, b])
 *            The maker approves **Aqua**, never the app (spec 16 §1.5 item 2).
 *   push  →  Aqua.push(maker, app, strategyHash, token, amount), once per token being added.
 *            The maker's own top-up of a live strategy: raises the virtual balance, moves nothing,
 *            spends the maker's allowance to Aqua (it is a `transferFrom` from the rock to the rock).
 *   swap  →  tokenIn.approve(taker, amountIn), XYCSwapTaker.swapExactIn(app, strategy, …)
 *            The taker approves the **periphery**, because XYCSwap calls `xycSwapCallback` back
 *            into its caller and an EOA or plain Safe cannot answer it (NOTES.md §5).
 */

import { encodeFunctionData, getAddress, maxUint256, zeroAddress, type Address, type Hex } from "viem";
import { AQUA_ABI } from "@/lib/chain/abi/aqua";
import { ERC20_ABI } from "@/lib/chain/abi/erc20";
import { XYC_SWAP_TAKER_ABI } from "@/lib/chain/abi/aqua-app";

/**
 * How long a swap stays valid, in seconds, when the caller does not say.
 *
 * A signed transaction that does not get mined stays valid indefinitely, and a swap that executes
 * twenty minutes late executes against reserves that have moved (audit finding F-8). Five minutes
 * is long enough for a sponsored UserOp to clear a bundler and short enough that the price the
 * visitor was shown is still roughly the price they get.
 */
export const DEFAULT_SWAP_DEADLINE_SECONDS = 300;
import { real, unavailable, type Capability } from "@/lib/demo";
import { getAquaAddresses, getAquaTakerAddress, type AquaAddresses } from "./config";
import {
  buildStrategy,
  decodeStrategy,
  type EncodedStrategy,
  type StreamIdentity,
} from "./strategy";

/** One call in a batch. Structurally identical to `lib/aa.ts`'s `Call`, without its imports. */
export interface Call {
  to: Address;
  data: Hex;
  value: bigint;
}

export { maxUint256 };

/* -------------------------------------------------------------------------- */
/* Ship                                                                        */
/* -------------------------------------------------------------------------- */

export interface ShipParams extends StreamIdentity {
  /** The Rock Account that will be the maker. */
  maker: Address;
  /** Virtual USDC this stream may trade, in base units (6 decimals). */
  usdcAmount: bigint;
  /** Virtual WETH this stream may trade, in base units (18 decimals). */
  wethAmount: bigint;
  /** The fee in basis points. Part of the strategy's identity — it cannot be changed later. */
  feeBps: bigint | number;
  /**
   * What to approve Aqua for, per token. Defaults to the shipped amounts.
   *
   * Read this before shipping a second stream: `approve` **sets** an allowance, it does not add
   * to one. Two streams over one reserve need an approval covering the whole reserve, so pass the
   * rock's total balance (or `maxUint256`) rather than the per-stream amount, or the second
   * approval will silently lower the first stream's settleable size.
   */
  approveUsdcAmount?: bigint;
  approveWethAmount?: bigint;
  /** Override the app address (tests, or a second deployment). Defaults to the configured one. */
  app?: Address;
}

export interface ShipPlan extends EncodedStrategy {
  /** approve USDC → Aqua, approve WETH → Aqua, ship. In that order, atomically (D-012). */
  calls: Call[];
  addresses: AquaAddresses;
  usdcAmount: bigint;
  wethAmount: bigint;
}

function approveCall(token: Address, spender: Address, amount: bigint): Call {
  return {
    to: token,
    data: encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [spender, amount] }),
    value: BigInt(0),
  };
}

/**
 * The three calls that open a liquidity stream.
 *
 * Nothing is deposited: after this batch every token is still in the Rock Account's wallet, and
 * what exists on Aqua is an allowance keyed by `keccak256(strategy)`.
 */
export function buildShipCalls(params: ShipParams): Capability<ShipPlan> {
  const addresses = getAquaAddresses({ app: params.app });
  if (addresses.state === "UNAVAILABLE") return unavailable(addresses.reason);
  const { aqua, app, usdc, weth } = addresses.value;

  if (params.usdcAmount < BigInt(0) || params.wethAmount < BigInt(0)) {
    return unavailable("A strategy cannot be shipped with a negative balance");
  }
  if (params.usdcAmount === BigInt(0) && params.wethAmount === BigInt(0)) {
    return unavailable("A strategy needs at least one non-zero balance to trade against");
  }

  let encoded: EncodedStrategy;
  try {
    encoded = buildStrategy({
      maker: params.maker,
      token0: usdc,
      token1: weth,
      feeBps: params.feeBps,
      rockId: params.rockId,
      streamIndex: params.streamIndex,
    });
  } catch (err) {
    return unavailable(err instanceof Error ? err.message : String(err));
  }

  const calls: Call[] = [
    approveCall(usdc, aqua, params.approveUsdcAmount ?? params.usdcAmount),
    approveCall(weth, aqua, params.approveWethAmount ?? params.wethAmount),
    {
      to: aqua,
      data: encodeFunctionData({
        abi: AQUA_ABI,
        functionName: "ship",
        args: [app, encoded.strategy, [usdc, weth], [params.usdcAmount, params.wethAmount]],
      }),
      value: BigInt(0),
    },
  ];

  return real({
    ...encoded,
    calls,
    addresses: addresses.value,
    usdcAmount: params.usdcAmount,
    wethAmount: params.wethAmount,
  });
}

/* -------------------------------------------------------------------------- */
/* Dock                                                                        */
/* -------------------------------------------------------------------------- */

export interface DockParams {
  strategyHash: Hex;
  app?: Address;
}

/**
 * Closing a stream (Flow H).
 *
 * One call, and it moves no tokens — there is nothing to withdraw, because the reserve never left
 * the Rock Account. Both tokens must be listed or Aqua reverts `DockingShouldCloseAllTokens`.
 * Docking is final: the strategy hash is burned and cannot be re-shipped.
 */
export function buildDockCalls(params: DockParams): Capability<{ calls: Call[]; addresses: AquaAddresses }> {
  const addresses = getAquaAddresses({ app: params.app });
  if (addresses.state === "UNAVAILABLE") return unavailable(addresses.reason);
  const { aqua, app, usdc, weth } = addresses.value;

  return real({
    addresses: addresses.value,
    calls: [
      {
        to: aqua,
        data: encodeFunctionData({
          abi: AQUA_ABI,
          functionName: "dock",
          args: [app, params.strategyHash, [usdc, weth]],
        }),
        value: BigInt(0),
      },
    ],
  });
}

/* -------------------------------------------------------------------------- */
/* Push (top up)                                                               */
/* -------------------------------------------------------------------------- */

export interface PushParams {
  /** The Rock Account — the strategy's maker, and here also the caller. */
  maker: Address;
  strategyHash: Hex;
  /** How much more USDC this stream may trade, in base units. Zero skips the token. */
  usdcAmount: bigint;
  /** How much more WETH this stream may trade, in base units. Zero skips the token. */
  wethAmount: bigint;
  /** Override the app address. Defaults to the configured one. */
  app?: Address;
}

export interface PushPlan {
  /** One `push` per token with a non-zero amount, USDC first. */
  calls: Call[];
  addresses: AquaAddresses;
  usdcAmount: bigint;
  wethAmount: bigint;
}

/**
 * Making more of the rock available to a live strategy — the only "edit" Aqua allows.
 *
 * A strategy's bytes are immutable and a docked one can never be revived (NOTES.md §4), so the
 * fee cannot change and nothing can be taken back short of `dock`. What *can* change is the
 * virtual balance, and only upwards: `Aqua.push(maker, app, strategyHash, token, amount)` may be
 * called by anyone and adds `amount` to the strategy's balance for `token`
 * (`Aqua.sol`, `push`; it reverts `PushToNonActiveStrategyPrevented` for a docked or unshipped
 * strategy).
 *
 * Called by the Rock Account itself, its `safeTransferFrom(msg.sender, maker, amount)` is a
 * transfer from the rock to the rock — no token leaves the account — but it is still a
 * `transferFrom` with Aqua as spender, so it **spends `amount` of the rock's allowance to Aqua**.
 * The submitting layer must approve for that on top of what the pulls will need
 * (`useBankRock.topUpStrategy`). Approvals are not built here: they depend on the allowance that
 * exists on chain, which a bytes-only module does not read.
 */
export function buildPushCalls(params: PushParams): Capability<PushPlan> {
  const addresses = getAquaAddresses({ app: params.app });
  if (addresses.state === "UNAVAILABLE") return unavailable(addresses.reason);
  const { aqua, app, usdc, weth } = addresses.value;

  if (params.usdcAmount < BigInt(0) || params.wethAmount < BigInt(0)) {
    return unavailable("A strategy cannot be topped up by a negative amount");
  }
  if (params.usdcAmount === BigInt(0) && params.wethAmount === BigInt(0)) {
    return unavailable("Enter an amount of USDC or WETH to make available");
  }

  const maker = getAddress(params.maker);
  const pushCall = (token: Address, amount: bigint): Call => ({
    to: aqua,
    data: encodeFunctionData({
      abi: AQUA_ABI,
      functionName: "push",
      args: [maker, app, params.strategyHash, token, amount],
    }),
    value: BigInt(0),
  });

  const calls: Call[] = [];
  if (params.usdcAmount > BigInt(0)) calls.push(pushCall(usdc, params.usdcAmount));
  if (params.wethAmount > BigInt(0)) calls.push(pushCall(weth, params.wethAmount));

  return real({
    calls,
    addresses: addresses.value,
    usdcAmount: params.usdcAmount,
    wethAmount: params.wethAmount,
  });
}

/* -------------------------------------------------------------------------- */
/* Swap                                                                        */
/* -------------------------------------------------------------------------- */

export interface SwapParams {
  /** The strategy being traded against, exactly as it was shipped. */
  strategy: EncodedStrategy;
  /** Which token the visitor is selling. Must be one of the strategy's two tokens. */
  tokenIn: Address;
  /** How much of it, in base units. */
  amountIn: bigint;
  /** The floor the visitor accepts, in base units of the other token. */
  minAmountOut: bigint;
  /**
   * Who receives the output. Required.
   *
   * The periphery used to read `to == 0` as "pay the caller"; the 2026-09-12 re-review removed
   * that sentinel (finding N-2), because a value every reader takes for a burn address must not
   * quietly mean a payout, and because the periphery's own address — the one a visitor has just
   * approved and therefore just had in their clipboard — would silently destroy the output. Both
   * are rejected on-chain, so the recipient is named explicitly here.
   */
  to: Address;
  /** Override the periphery address. Defaults to NEXT_PUBLIC_AQUA_TAKER_ADDRESS. */
  taker?: Address;
  /** Override the app address. Defaults to the strategy's configured app. */
  app?: Address;
  /**
   * Absolute unix seconds after which the periphery refuses the swap. Defaults to
   * `DEFAULT_SWAP_DEADLINE_SECONDS` from now, so existing callers need no change.
   */
  deadline?: bigint;
  /** Relative alternative to `deadline`: seconds from now. Ignored when `deadline` is given. */
  deadlineSeconds?: number;
}

export interface SwapPlan {
  /** The single call against the periphery — `{ to, data }`, no value. */
  call: Call;
  /** `approve(periphery, amountIn)` then the swap. This is what a wallet should submit. */
  calls: Call[];
  /** The periphery the visitor transacts with. */
  taker: Address;
  /** The app the periphery forwards to. */
  app: Address;
  tokenIn: Address;
  tokenOut: Address;
  /** True when selling token0 (USDC) for token1 (WETH). */
  zeroForOne: boolean;
  /** The absolute unix-seconds deadline encoded into the call. */
  deadline: bigint;
}

/**
 * The visitor's swap.
 *
 * `call` is the one transaction against `XYCSwapTaker`; `calls` prefixes it with the ERC-20
 * approval the periphery needs. A visitor on a smart account submits both as one batch; a visitor
 * on an EOA sends the approval first.
 */
export function buildSwapCall(params: SwapParams): Capability<SwapPlan> {
  const addresses = getAquaAddresses({ app: params.app });
  if (addresses.state === "UNAVAILABLE") return unavailable(addresses.reason);
  const app = params.app ? getAddress(params.app) : addresses.value.app;

  let taker: Address;
  if (params.taker) {
    taker = getAddress(params.taker);
  } else {
    const configured = getAquaTakerAddress();
    if (configured.state === "UNAVAILABLE") return unavailable(configured.reason);
    taker = configured.value;
  }

  if (params.amountIn <= BigInt(0)) {
    return unavailable("A swap needs a positive input amount");
  }

  const recipient = getAddress(params.to);
  if (recipient === zeroAddress || recipient === taker) {
    return unavailable(
      "A swap needs a real recipient: the zero address and the periphery's own address are both rejected on-chain",
    );
  }

  const fields = decodeStrategy(params.strategy.strategy);
  const tokenIn = getAddress(params.tokenIn);
  const zeroForOne = tokenIn === fields.token0;
  if (!zeroForOne && tokenIn !== fields.token1) {
    return unavailable(`${tokenIn} is not one of this strategy's two tokens`);
  }
  const tokenOut = zeroForOne ? fields.token1 : fields.token0;

  const deadline =
    params.deadline ??
    BigInt(Math.floor(Date.now() / 1000) + (params.deadlineSeconds ?? DEFAULT_SWAP_DEADLINE_SECONDS));

  const call: Call = {
    to: taker,
    data: encodeFunctionData({
      abi: XYC_SWAP_TAKER_ABI,
      functionName: "swapExactIn",
      args: [
        {
          maker: fields.maker,
          token0: fields.token0,
          token1: fields.token1,
          feeBps: fields.feeBps,
          salt: fields.salt,
        },
        zeroForOne,
        params.amountIn,
        params.minAmountOut,
        recipient,
        deadline,
      ],
    }),
    value: BigInt(0),
  };

  return real({
    call,
    calls: [approveCall(tokenIn, taker, params.amountIn), call],
    taker,
    app,
    tokenIn,
    tokenOut,
    zeroForOne,
    deadline,
  });
}
