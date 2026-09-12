import { describe, expect, it } from "vitest";
import {
  caip2ChainId,
  earnActionUrl,
  earnedSoFar,
  isRawAmount,
  isTerminalStatus,
  parseActionStatus,
  parseAmountInput,
} from "./shared";

describe("earnActionUrl — the string the wallet signs", () => {
  it("builds the documented path with no trailing slash", () => {
    expect(earnActionUrl("https://api.privy.io/api/v1", "deposit", "abc123")).toBe(
      "https://api.privy.io/api/v1/wallets/abc123/earn/ethereum/deposit",
    );
    expect(earnActionUrl("https://api.privy.io/api/v1/", "withdraw", "abc123")).toBe(
      "https://api.privy.io/api/v1/wallets/abc123/earn/ethereum/withdraw",
    );
  });

  it("encodes a wallet id rather than splicing it into the path", () => {
    expect(earnActionUrl("https://x.test/v1", "deposit", "a/b")).toContain("/wallets/a%2Fb/");
  });
});

describe("isRawAmount", () => {
  it("accepts a positive integer string only", () => {
    expect(isRawAmount("1")).toBe(true);
    expect(isRawAmount("5000000")).toBe(true);
    expect(isRawAmount("0")).toBe(false);
    expect(isRawAmount("01")).toBe(false);
    expect(isRawAmount("-1")).toBe(false);
    expect(isRawAmount("1.5")).toBe(false);
    expect(isRawAmount("1e6")).toBe(false);
    expect(isRawAmount(1)).toBe(false);
    expect(isRawAmount("")).toBe(false);
  });
});

describe("earnedSoFar — the one yield figure, realised and never annualised", () => {
  it("is assets in vault plus withdrawn minus deposited", () => {
    expect(
      earnedSoFar({ assetsInVault: "1050000", totalWithdrawn: "0", totalDeposited: "1000000" }),
    ).toBe(BigInt(50000));
    expect(
      earnedSoFar({ assetsInVault: "0", totalWithdrawn: "1020000", totalDeposited: "1000000" }),
    ).toBe(BigInt(20000));
  });

  it("may be negative for a moment and says so rather than clamping", () => {
    expect(
      earnedSoFar({ assetsInVault: "999999", totalWithdrawn: "0", totalDeposited: "1000000" }),
    ).toBe(BigInt(-1));
  });

  it("treats a malformed quantity as zero rather than throwing", () => {
    expect(
      earnedSoFar({ assetsInVault: "abc", totalWithdrawn: "0", totalDeposited: "0" }),
    ).toBe(BigInt(0));
  });
});

describe("parseAmountInput", () => {
  it("converts a typed decimal to base units", () => {
    expect(parseAmountInput("12.5", 6)).toBe(BigInt(12_500_000));
    expect(parseAmountInput(" 1 ", 6)).toBe(BigInt(1_000_000));
    expect(parseAmountInput("0.000001", 6)).toBe(BigInt(1));
  });

  it("refuses zero, garbage and more fraction digits than the asset has", () => {
    expect(parseAmountInput("0", 6)).toBeNull();
    expect(parseAmountInput("", 6)).toBeNull();
    expect(parseAmountInput(".", 6)).toBeNull();
    expect(parseAmountInput("abc", 6)).toBeNull();
    expect(parseAmountInput("-1", 6)).toBeNull();
    expect(parseAmountInput("0.0000001", 6)).toBeNull();
  });
});

describe("caip2ChainId", () => {
  it("reads an EVM CAIP-2 identifier", () => {
    expect(caip2ChainId("eip155:8453")).toBe(8453);
    expect(caip2ChainId(" eip155:1 ")).toBe(1);
  });

  it("is null for anything else", () => {
    expect(caip2ChainId("solana:mainnet")).toBeNull();
    expect(caip2ChainId("8453")).toBeNull();
    expect(caip2ChainId("eip155:0")).toBeNull();
  });
});

describe("action statuses", () => {
  it("knows which are terminal", () => {
    expect(isTerminalStatus("succeeded")).toBe(true);
    expect(isTerminalStatus("failed")).toBe(true);
    expect(isTerminalStatus("rejected")).toBe(true);
    expect(isTerminalStatus("pending")).toBe(false);
    expect(isTerminalStatus("created")).toBe(false);
  });

  it("refuses an unknown status instead of guessing", () => {
    expect(parseActionStatus("done")).toBeNull();
    expect(parseActionStatus("succeeded")).toBe("succeeded");
  });
});
