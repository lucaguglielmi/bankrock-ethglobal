import { describe, expect, it } from "vitest";
import { decodeFunctionData } from "viem";
import { ERC20_ABI } from "@/lib/chain/abi/erc20";
import { approvalCalls } from "./rock-account";

/**
 * The USDC approval rule.
 *
 * Circle's USDC reverts on a non-zero to non-zero `approve`. A sequence that ignores this works on
 * WETH and fails on USDC - which is the worst shape a bug can have here, because USDC is the token
 * the product is about and the failure only appears on the second ship or the second swap.
 */

const TOKEN = `0x${"11".repeat(20)}` as const;
const SPENDER = `0x${"22".repeat(20)}` as const;

function decode(data: `0x${string}`) {
  return decodeFunctionData({ abi: ERC20_ABI, data });
}

function amounts(calls: { data: `0x${string}` }[]): bigint[] {
  return calls.map((call) => {
    const decoded = decode(call.data);
    expect(decoded.functionName).toBe("approve");
    return (decoded.args as readonly [string, bigint])[1];
  });
}

describe("approvalCalls", () => {
  it("resets to zero first when both the current and the target allowance are non-zero", () => {
    const calls = approvalCalls({
      token: TOKEN,
      spender: SPENDER,
      currentAllowance: BigInt(500),
      amount: BigInt(1000),
    });
    expect(amounts(calls)).toEqual([BigInt(0), BigInt(1000)]);
  });

  it("resets first even when lowering the allowance", () => {
    const calls = approvalCalls({
      token: TOKEN,
      spender: SPENDER,
      currentAllowance: BigInt(1000),
      amount: BigInt(1),
    });
    expect(amounts(calls)).toEqual([BigInt(0), BigInt(1)]);
  });

  it("is a single call from a zero allowance - the common first ship", () => {
    const calls = approvalCalls({
      token: TOKEN,
      spender: SPENDER,
      currentAllowance: BigInt(0),
      amount: BigInt(1000),
    });
    expect(amounts(calls)).toEqual([BigInt(1000)]);
  });

  it("is a single call when revoking", () => {
    const calls = approvalCalls({
      token: TOKEN,
      spender: SPENDER,
      currentAllowance: BigInt(1000),
      amount: BigInt(0),
    });
    expect(amounts(calls)).toEqual([BigInt(0)]);
  });

  it("emits nothing when the allowance already equals the target", () => {
    expect(
      approvalCalls({
        token: TOKEN,
        spender: SPENDER,
        currentAllowance: BigInt(1000),
        amount: BigInt(1000),
      }),
    ).toEqual([]);
    expect(
      approvalCalls({
        token: TOKEN,
        spender: SPENDER,
        currentAllowance: BigInt(0),
        amount: BigInt(0),
      }),
    ).toEqual([]);
  });

  it("approves the spender it was given, and calls the token", () => {
    const [call] = approvalCalls({
      token: TOKEN,
      spender: SPENDER,
      currentAllowance: BigInt(0),
      amount: BigInt(7),
    });
    expect(call.to).toBe(TOKEN);
    expect(call.value).toBe(BigInt(0));
    const decoded = decode(call.data);
    expect((decoded.args as readonly [string, bigint])[0].toLowerCase()).toBe(SPENDER);
  });
});
