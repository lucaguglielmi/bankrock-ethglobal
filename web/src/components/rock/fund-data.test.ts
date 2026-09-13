/**
 * The funding sheet's data: three addresses, or the reason each one is missing.
 *
 * Nothing here may invent a destination. A rock with no account, or a deployment with no token
 * address configured, has to produce UNAVAILABLE with the missing variable named - a placeholder
 * address on a "send money here" screen is the worst possible fabrication (D-013, D-015).
 */

import { describe, expect, it } from "vitest";
import { zeroAddress } from "viem";
import { fundingTargets, NO_ROCK_ACCOUNT_REASON } from "./fund-data";

const ROCK_ACCOUNT = "0x2A3101Fc525C6DBEc39bef45034E23b13f28F757";
const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const WETH = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";

const configured = { rockAccount: ROCK_ACCOUNT, usdc: USDC, weth: WETH };

describe("funding targets", () => {
  it("names the Rock Account as the destination, with an explorer link", () => {
    const { rockAccount } = fundingTargets(configured);
    expect(rockAccount.state).toBe("REAL");
    if (rockAccount.state === "UNAVAILABLE") return;
    expect(rockAccount.value.address).toBe(ROCK_ACCOUNT);
    expect(rockAccount.value.explorerHref).toBe(
      `https://sepolia.etherscan.io/address/${ROCK_ACCOUNT}`,
    );
    expect(rockAccount.value.hint).toMatch(/owner/i);
  });

  it("lists USDC and WETH, in that order, each with its own explorer link", () => {
    const { tokens } = fundingTargets(configured);
    expect(tokens).toHaveLength(2);
    expect(tokens.map((token) => (token.state === "UNAVAILABLE" ? null : token.value.label))).toEqual(
      ["USDC", "WETH"],
    );
    expect(tokens.map((token) => (token.state === "UNAVAILABLE" ? null : token.value.address))).toEqual(
      [USDC, WETH],
    );
    expect(tokens.map((token) => (token.state === "UNAVAILABLE" ? null : token.value.explorerHref))).toEqual([
      `https://sepolia.etherscan.io/address/${USDC}`,
      `https://sepolia.etherscan.io/address/${WETH}`,
    ]);
  });

  it("has no destination for a rock with no account", () => {
    for (const account of [undefined, "", zeroAddress]) {
      const { rockAccount } = fundingTargets({ ...configured, rockAccount: account });
      expect(rockAccount.state).toBe("UNAVAILABLE");
      if (rockAccount.state !== "UNAVAILABLE") continue;
      expect(rockAccount.reason).toBe(NO_ROCK_ACCOUNT_REASON);
    }
  });

  it("names the variable when a token address is not configured", () => {
    const { tokens } = fundingTargets({ rockAccount: ROCK_ACCOUNT });
    const reasons = tokens.map((token) =>
      token.state === "UNAVAILABLE" ? token.reason : "REAL",
    );
    expect(reasons[0]).toContain("NEXT_PUBLIC_USDC_ADDRESS");
    expect(reasons[1]).toContain("NEXT_PUBLIC_WETH_ADDRESS");
  });

  it("treats the zero address as 'not configured', never as a token", () => {
    const { tokens } = fundingTargets({
      rockAccount: ROCK_ACCOUNT,
      usdc: zeroAddress,
      weth: zeroAddress,
    });
    for (const token of tokens) {
      expect(token.state).toBe("UNAVAILABLE");
    }
  });

  it("carries no amount, rate or estimate of any kind", () => {
    const targets = fundingTargets(configured);
    const rendered = JSON.stringify(targets);
    expect(rendered).not.toMatch(/\d+(\.\d+)?\s*(USDC|WETH|%)/);
  });
});
