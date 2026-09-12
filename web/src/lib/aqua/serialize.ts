/**
 * JSON shapes for the strategy view.
 *
 * `bigint` does not survive `JSON.stringify`, and a token amount must never be rounded through a
 * `number` on its way to the UI — a 18-decimal WETH balance loses precision above 2^53. Amounts
 * therefore cross the wire as decimal strings in base units and are parsed straight back into
 * `bigint`; formatting for humans happens at the last moment, in the component, with the token's
 * decimals.
 */

import type { Address, Hex } from "viem";
import type { AccruedFees, RockStrategyView, StrategyBalances, TokenPairAmounts } from "./read";

export interface TokenPairAmountsJson {
  usdc: string;
  weth: string;
}

export interface StrategyBalancesJson {
  strategyHash: Hex;
  strategy?: Hex;
  feeBps: string;
  streamIndex: string;
  label?: string;
  virtual: TokenPairAmountsJson;
  executable: TokenPairAmountsJson;
  fees?: AccruedFeesJson;
  /** Present when the fee figure could not be read; the rate is still known. */
  feesUnavailable?: string;
}

export interface AccruedFeesJson {
  earned: TokenPairAmountsJson;
  swapCount: number;
  fromBlock: string;
  toBlock: string;
  complete: boolean;
}

export interface RockStrategyViewJson {
  rockId: string;
  maker: Address;
  app: Address;
  aqua: Address;
  actual: TokenPairAmountsJson;
  allowance: TokenPairAmountsJson;
  streams: StrategyBalancesJson[];
}

const toJson = (amounts: TokenPairAmounts): TokenPairAmountsJson => ({
  usdc: amounts.usdc.toString(),
  weth: amounts.weth.toString(),
});

const fromJson = (amounts: TokenPairAmountsJson): TokenPairAmounts => ({
  usdc: BigInt(amounts.usdc),
  weth: BigInt(amounts.weth),
});

export function serializeFees(fees: AccruedFees): AccruedFeesJson {
  return {
    earned: toJson(fees.earned),
    swapCount: fees.swapCount,
    fromBlock: fees.fromBlock.toString(),
    toBlock: fees.toBlock.toString(),
    complete: fees.complete,
  };
}

export function serializeStrategyView(
  view: RockStrategyView,
  fees?: Map<Hex, AccruedFeesJson | string>,
): RockStrategyViewJson {
  return {
    rockId: view.rockId,
    maker: view.maker,
    app: view.app,
    aqua: view.aqua,
    actual: toJson(view.actual),
    allowance: toJson(view.allowance),
    streams: view.streams.map((stream: StrategyBalances) => {
      const fee = fees?.get(stream.strategyHash);
      return {
        strategyHash: stream.strategyHash,
        strategy: stream.strategy,
        feeBps: stream.feeBps.toString(),
        streamIndex: stream.streamIndex.toString(),
        label: stream.label,
        virtual: toJson(stream.virtual),
        executable: toJson(stream.executable),
        ...(typeof fee === "string" ? { feesUnavailable: fee } : {}),
        ...(fee && typeof fee !== "string" ? { fees: fee } : {}),
      };
    }),
  };
}

/** The client side of the same contract. Throws on a malformed payload rather than guessing. */
export function parseStrategyView(json: RockStrategyViewJson): ParsedStrategyView {
  return {
    rockId: json.rockId,
    maker: json.maker,
    app: json.app,
    aqua: json.aqua,
    actual: fromJson(json.actual),
    allowance: fromJson(json.allowance),
    streams: json.streams.map((stream) => ({
      strategyHash: stream.strategyHash,
      strategy: stream.strategy,
      feeBps: BigInt(stream.feeBps),
      streamIndex: BigInt(stream.streamIndex),
      label: stream.label,
      virtual: fromJson(stream.virtual),
      executable: fromJson(stream.executable),
      fees: stream.fees
        ? {
            earned: fromJson(stream.fees.earned),
            swapCount: stream.fees.swapCount,
            fromBlock: BigInt(stream.fees.fromBlock),
            toBlock: BigInt(stream.fees.toBlock),
            complete: stream.fees.complete,
          }
        : undefined,
      feesUnavailable: stream.feesUnavailable,
    })),
  };
}

export interface ParsedStream extends StrategyBalances {
  fees?: AccruedFees;
  feesUnavailable?: string;
}

export interface ParsedStrategyView extends Omit<RockStrategyView, "streams"> {
  streams: ParsedStream[];
}
