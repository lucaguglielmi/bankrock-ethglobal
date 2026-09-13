import { describe, expect, it, vi } from "vitest";
import { parseAddressEnv, parseChainIdEnv } from "./index";

describe("address validation (D-015)", () => {
  it("accepts a well-formed address and checksums it", () => {
    expect(parseAddressEnv("X", "0x1111113ccf1426a8e30e2bff5e005d929bf6a90a")).toBe(
      "0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a",
    );
  });

  it("treats unset and blank as 'not configured', not as an error", () => {
    expect(parseAddressEnv("X", undefined)).toBeUndefined();
    expect(parseAddressEnv("X", "")).toBeUndefined();
    expect(parseAddressEnv("X", "   ")).toBeUndefined();
  });

  it("throws loudly on a malformed address, naming the variable", () => {
    expect(() => parseAddressEnv("NEXT_PUBLIC_AQUA_ADDRESS", "0x1234")).toThrow(
      /NEXT_PUBLIC_AQUA_ADDRESS/,
    );
    expect(() => parseAddressEnv("NEXT_PUBLIC_AQUA_ADDRESS", "not-an-address")).toThrow();
    // 39 hex digits - one short.
    expect(() =>
      parseAddressEnv("NEXT_PUBLIC_AQUA_ADDRESS", "0x1111113ccf1426a8e30e2bff5e005d929bf6a90"),
    ).toThrow();
  });
});

describe("chain id validation (D-023)", () => {
  it("accepts Ethereum Sepolia", () => {
    expect(parseChainIdEnv("11155111")).toBe(11155111);
  });

  it("defaults to Sepolia when unset", () => {
    expect(parseChainIdEnv(undefined)).toBe(11155111);
    expect(parseChainIdEnv("")).toBe(11155111);
  });

  it("rejects any other chain, including Base Sepolia", () => {
    expect(() => parseChainIdEnv("84532")).toThrow(/11155111/);
    expect(() => parseChainIdEnv("1")).toThrow();
    expect(() => parseChainIdEnv("abc")).toThrow();
  });
});

describe("explorer links", () => {
  it("points at Sepolia Etherscan", async () => {
    const { explorer } = await import("./index");
    expect(explorer.tx("0xabc")).toBe("https://sepolia.etherscan.io/tx/0xabc");
    expect(explorer.address("0xabc")).toBe("https://sepolia.etherscan.io/address/0xabc");
    expect(explorer.baseUrl).not.toContain("basescan");
  });
});

describe("token metadata", () => {
  it("uses the verified decimals for Sepolia (spec 16 §1.1)", async () => {
    const { tokens } = await import("./index");
    expect(tokens.USDC.decimals).toBe(6);
    expect(tokens.WETH.decimals).toBe(18);
  });
});

describe("module load", () => {
  it("fails at load when a configured address is malformed", async () => {
    process.env.NEXT_PUBLIC_USDC_ADDRESS = "0xnope";
    vi.resetModules();
    await expect(import("./index")).rejects.toThrow(/NEXT_PUBLIC_USDC_ADDRESS/);
    delete process.env.NEXT_PUBLIC_USDC_ADDRESS;
    vi.resetModules();
  });

  it("reports UNAVAILABLE, naming the variable, when an address is simply unset", async () => {
    delete process.env.NEXT_PUBLIC_REGISTRY_ADDRESS;
    vi.resetModules();
    const { requireAddress } = await import("./index");
    const result = requireAddress("registry");
    expect(result.state).toBe("UNAVAILABLE");
    if (result.state === "UNAVAILABLE") {
      expect(result.reason).toContain("NEXT_PUBLIC_REGISTRY_ADDRESS");
    }
  });
});
