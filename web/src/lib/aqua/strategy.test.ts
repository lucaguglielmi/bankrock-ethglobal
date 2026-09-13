/**
 * The encoding tests that keep TypeScript and Solidity in step.
 *
 * The three literals below are asserted verbatim by
 * `contracts/test/aqua/XYCSwapStrategy.t.sol::testStrategyEncodingMatchesTheTypeScriptLibrary`.
 * If either implementation of the salt or the struct layout drifts, one of the two suites fails —
 * which is the point, because a strategy encoded even one byte differently hashes differently and
 * has no balances on Aqua at all.
 */

import { describe, expect, it } from "vitest";
import { keccak256, encodeAbiParameters, parseAbiParameters, type Address } from "viem";
import {
  SALT_DOMAIN,
  buildStrategy,
  decodeStrategy,
  deriveSalt,
  encodeStrategy,
  strategyBelongsToRock,
  strategyHash,
  BPS_BASE,
  DEFAULT_STREAMS,
  streamPresetFor,
} from "./strategy";

const MAKER = "0x00000000000000000000000000000000000000A1" as Address;
const TOKEN0 = "0x00000000000000000000000000000000000000c0" as Address;
const TOKEN1 = "0x00000000000000000000000000000000000000C1" as Address;

/** Pinned in Solidity as `SALT_DOMAIN`. */
const EXPECTED_DOMAIN = "0x81ab6ad9698f8f0486cca1eb375761a4383f19d2b2ea00b9c211b6b10541fdcf";
/** `keccak256(abi.encode(SALT_DOMAIN, 42, 0))`. */
const EXPECTED_SALT = "0x1fe63c2efefd5114495a79101a4947d1aa6b9f5fdcdf9e30bd69407274f3499d";
/** `keccak256(abi.encode(Strategy{ maker: 0x…A1, token0: 0x…C0, token1: 0x…C1, feeBps: 30, salt }))`. */
const EXPECTED_HASH = "0x93edb6bc48131420e723b96c4ed3088624ba00461235d924c276dc1815b92c3e";

const params = {
  maker: MAKER,
  token0: TOKEN0,
  token1: TOKEN1,
  feeBps: 30,
  rockId: 42,
  streamIndex: 0,
};

describe("the strategy salt", () => {
  it("is the pinned domain separator", () => {
    expect(SALT_DOMAIN).toBe(EXPECTED_DOMAIN);
    expect(SALT_DOMAIN).toBe(keccak256(new TextEncoder().encode("bankrock.aqua.strategy.v1")));
  });

  it("matches what Solidity computes for rock 42, stream 0", () => {
    expect(deriveSalt({ rockId: 42 })).toBe(EXPECTED_SALT);
    expect(deriveSalt({ rockId: "42", streamIndex: 0 })).toBe(EXPECTED_SALT);
    expect(deriveSalt({ rockId: BigInt(42), streamIndex: BigInt(0) })).toBe(EXPECTED_SALT);
  });

  it("separates rocks and separates a rock's streams", () => {
    const rock42stream0 = deriveSalt({ rockId: 42, streamIndex: 0 });
    expect(deriveSalt({ rockId: 42, streamIndex: 1 })).not.toBe(rock42stream0);
    expect(deriveSalt({ rockId: 43, streamIndex: 0 })).not.toBe(rock42stream0);
  });

  it("refuses anything that is not a whole, non-negative rock id", () => {
    expect(() => deriveSalt({ rockId: "nine" })).toThrow(/rockId/);
    expect(() => deriveSalt({ rockId: -1 })).toThrow(/negative/);
    expect(() => deriveSalt({ rockId: 1.5 })).toThrow(/rockId/);
  });
});

describe("encodeStrategy", () => {
  it("produces the five-word struct Aqua hashes, and the hash Solidity produced", () => {
    const strategy = encodeStrategy(params);
    // abi.encode of five static fields: 5 * 32 bytes, plus "0x".
    expect(strategy).toHaveLength(2 + 5 * 64);
    expect(strategyHash(strategy)).toBe(EXPECTED_HASH);
  });

  it("is exactly abi.encode(Strategy) — same bytes as an independent encoder", () => {
    const independent = encodeAbiParameters(
      parseAbiParameters("(address,address,address,uint256,bytes32)"),
      [[MAKER, TOKEN0, TOKEN1, BigInt(30), deriveSalt(params)]],
    );
    expect(encodeStrategy(params)).toBe(independent);
  });

  it("is insensitive to address casing but sensitive to every value", () => {
    expect(encodeStrategy({ ...params, maker: MAKER.toLowerCase() as Address })).toBe(
      encodeStrategy(params),
    );
    expect(encodeStrategy({ ...params, feeBps: 31 })).not.toBe(encodeStrategy(params));
    expect(encodeStrategy({ ...params, streamIndex: 1 })).not.toBe(encodeStrategy(params));
    expect(encodeStrategy({ ...params, rockId: 43 })).not.toBe(encodeStrategy(params));
  });

  it("rejects a fee of 100% or more, which would make the curve unpriceable", () => {
    expect(() => encodeStrategy({ ...params, feeBps: 10_000 })).toThrow(/feeBps/);
    expect(() => encodeStrategy({ ...params, feeBps: 20_000 })).toThrow(/feeBps/);
  });
});

describe("buildStrategy and decodeStrategy", () => {
  it("round-trips every field", () => {
    const built = buildStrategy(params);
    expect(built.strategyHash).toBe(EXPECTED_HASH);
    expect(built.salt).toBe(EXPECTED_SALT);

    const decoded = decodeStrategy(built.strategy);
    expect(decoded.maker).toBe(MAKER);
    expect(decoded.token0.toLowerCase()).toBe(TOKEN0.toLowerCase());
    expect(decoded.token1.toLowerCase()).toBe(TOKEN1.toLowerCase());
    expect(decoded.feeBps).toBe(BigInt(30));
    expect(decoded.salt).toBe(EXPECTED_SALT);
  });

  it("proves which rock a strategy belongs to", () => {
    const built = buildStrategy(params);
    expect(strategyBelongsToRock(built.strategy, { rockId: 42, streamIndex: 0 })).toBe(true);
    expect(strategyBelongsToRock(built.strategy, { rockId: 42, streamIndex: 1 })).toBe(false);
    expect(strategyBelongsToRock(built.strategy, { rockId: 7, streamIndex: 0 })).toBe(false);
  });
});

describe("the catalogue (DEFAULT_STREAMS)", () => {
  it("offers between two and four curves over one reserve (spec 04, one eth_call each per read)", () => {
    expect(DEFAULT_STREAMS.length).toBeGreaterThanOrEqual(2);
    expect(DEFAULT_STREAMS.length).toBeLessThanOrEqual(4);
  });

  it("never changes the two presets already live on Sepolia", () => {
    const [wide, tight] = DEFAULT_STREAMS;
    expect(wide).toMatchObject({ streamIndex: 0, feeBps: 30, label: "Wide" });
    expect(tight).toMatchObject({ streamIndex: 1, feeBps: 5, label: "Tight" });
    // The pinned hash for rock 42, stream 0 at 30 bps is what Solidity computed for "Wide".
    expect(buildStrategy({ ...params, ...wide }).strategyHash).toBe(EXPECTED_HASH);
  });

  it("uses unique stream indexes, contiguous from 0, in order", () => {
    expect(DEFAULT_STREAMS.map((preset) => preset.streamIndex)).toEqual(
      DEFAULT_STREAMS.map((_, i) => i),
    );
  });

  it("uses a unique, priceable fee per stream — a fee is the whole of a strategy's difference", () => {
    const fees = DEFAULT_STREAMS.map((preset) => preset.feeBps);
    expect(new Set(fees).size).toBe(fees.length);
    for (const fee of fees) {
      expect(Number.isInteger(fee)).toBe(true);
      expect(fee).toBeGreaterThan(0);
      expect(BigInt(fee)).toBeLessThan(BPS_BASE);
    }
  });

  it("hashes to a different strategy per preset for the same rock", () => {
    const hashes = DEFAULT_STREAMS.map(
      (stream) => buildStrategy({ ...params, ...stream }).strategyHash,
    );
    expect(new Set(hashes).size).toBe(DEFAULT_STREAMS.length);
  });

  it("describes every preset for the owner, each in its own words", () => {
    for (const preset of DEFAULT_STREAMS) {
      expect(preset.label.trim().split(/\s+/).length).toBeLessThanOrEqual(2);
      expect(preset.description).toMatch(/^\d+\.\d{2}% — /);
      // The description opens with the fee it encodes, so the two can never disagree.
      expect(preset.description.startsWith(`${(preset.feeBps / 100).toFixed(2)}%`)).toBe(true);
      expect(preset.forWhom.trim().length).toBeGreaterThan(0);
    }
    for (const field of ["label", "description", "forWhom"] as const) {
      expect(new Set(DEFAULT_STREAMS.map((preset) => preset[field])).size).toBe(
        DEFAULT_STREAMS.length,
      );
    }
  });

  it("never mentions an annualised figure (D-004)", () => {
    for (const preset of DEFAULT_STREAMS) {
      expect(`${preset.label} ${preset.description} ${preset.forWhom}`).not.toMatch(
        /\b(APY|APR|annual|yearly|per year)\b/i,
      );
    }
  });
});

describe("streamPresetFor", () => {
  it("finds a preset by its stream index, however the index is typed", () => {
    expect(streamPresetFor(0)).toBe(DEFAULT_STREAMS[0]);
    expect(streamPresetFor(BigInt(1))).toBe(DEFAULT_STREAMS[1]);
    expect(streamPresetFor("1")).toBe(DEFAULT_STREAMS[1]);
  });

  it("answers undefined for an index no reader probes", () => {
    expect(streamPresetFor(DEFAULT_STREAMS.length)).toBeUndefined();
    expect(streamPresetFor(undefined)).toBeUndefined();
    expect(streamPresetFor(1.5)).toBeUndefined();
    expect(streamPresetFor("wide")).toBeUndefined();
  });
});
