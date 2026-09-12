import { describe, expect, it } from "vitest";
import { chainFromCaip2, explorerFor } from "./index";

describe("chainFromCaip2", () => {
  it("resolves the chains this app knows", () => {
    expect(chainFromCaip2("eip155:8453")?.id).toBe(8453);
    expect(chainFromCaip2("eip155:11155111")?.id).toBe(11155111);
    expect(chainFromCaip2("eip155:1")?.id).toBe(1);
  });

  it("is undefined for anything else, never a default", () => {
    expect(chainFromCaip2("eip155:42161")).toBeUndefined();
    expect(chainFromCaip2("solana:mainnet")).toBeUndefined();
    expect(chainFromCaip2("")).toBeUndefined();
  });
});

describe("explorerFor", () => {
  it("links Base to Basescan and Sepolia to Sepolia Etherscan", () => {
    expect(explorerFor(8453)?.tx("0xabc")).toBe("https://basescan.org/tx/0xabc");
    expect(explorerFor(8453)?.address("0xdef")).toBe("https://basescan.org/address/0xdef");
    expect(explorerFor(11155111)?.baseUrl).toBe("https://sepolia.etherscan.io");
  });

  it("knows no explorer for an unknown chain", () => {
    expect(explorerFor(999999)).toBeUndefined();
  });
});
