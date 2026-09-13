import { describe, expect, it } from "vitest";

import {
  GIVE_PARAM,
  buildGiveLink,
  giveLinkPath,
  readGiveAddress,
  stripGiveParam,
} from "./give-link";
import { appUrl } from "@/lib/chain";

/**
 * The give link (B1). Address literals are fine in a test - the repository-wide "no address
 * literal outside lib/chain" check (D-015) excludes `*.test.ts` - and a checksum fixture has to
 * be written out to be a fixture at all.
 */
const LOWERCASE = "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed";
const CHECKSUMMED = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
const WRONG_CHECKSUM = "0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";

describe("readGiveAddress", () => {
  it("accepts a lowercase address and returns the checksummed form", () => {
    expect(readGiveAddress(`?${GIVE_PARAM}=${LOWERCASE}`)).toBe(CHECKSUMMED);
  });

  it("accepts a correctly checksummed address", () => {
    expect(readGiveAddress(`?${GIVE_PARAM}=${CHECKSUMMED}`)).toBe(CHECKSUMMED);
  });

  it("reads the parameter wherever it sits in the query string", () => {
    expect(readGiveAddress(`?utm=qr&${GIVE_PARAM}=${LOWERCASE}&x=1`)).toBe(CHECKSUMMED);
    expect(readGiveAddress(`${GIVE_PARAM}=${LOWERCASE}`)).toBe(CHECKSUMMED);
  });

  it("rejects a mixed-case address whose checksum does not match", () => {
    expect(readGiveAddress(`?${GIVE_PARAM}=${WRONG_CHECKSUM}`)).toBeNull();
  });

  it("rejects everything that is not a 20-byte address", () => {
    for (const value of [
      "vitalik.eth",
      "0x1234",
      `${LOWERCASE}00`,
      LOWERCASE.slice(0, -1),
      "not-an-address",
      "",
      "0X",
    ]) {
      expect(readGiveAddress(`?${GIVE_PARAM}=${encodeURIComponent(value)}`)).toBeNull();
    }
  });

  it("returns null when there is no parameter at all", () => {
    expect(readGiveAddress("")).toBeNull();
    expect(readGiveAddress("?stream=1")).toBeNull();
  });

  it("refuses an ambiguous link that names two different recipients", () => {
    const other = `0x${"1".repeat(40)}`;
    expect(readGiveAddress(`?${GIVE_PARAM}=${LOWERCASE}&${GIVE_PARAM}=${other}`)).toBeNull();
    // The same address twice is not ambiguous.
    expect(readGiveAddress(`?${GIVE_PARAM}=${LOWERCASE}&${GIVE_PARAM}=${CHECKSUMMED}`)).toBe(
      CHECKSUMMED,
    );
  });
});

describe("stripGiveParam", () => {
  it("removes the parameter so a reload does not prefill again", () => {
    expect(stripGiveParam(`?${GIVE_PARAM}=${LOWERCASE}`)).toBe("");
  });

  it("keeps every other parameter", () => {
    expect(stripGiveParam(`?stream=1&${GIVE_PARAM}=${LOWERCASE}&fees=0`)).toBe("?stream=1&fees=0");
  });

  it("leaves a query string without the parameter alone", () => {
    expect(stripGiveParam("?stream=1")).toBe("?stream=1");
    expect(stripGiveParam("")).toBe("");
  });
});

describe("giveLinkPath", () => {
  it("points at the rock being looked at", () => {
    expect(giveLinkPath("/rock/12")).toBe("/rock/12");
    expect(giveLinkPath("/rock/12/")).toBe("/rock/12");
  });

  it("falls back to the home page anywhere else", () => {
    expect(giveLinkPath("/")).toBe("/");
    expect(giveLinkPath("/shop")).toBe("/");
    expect(giveLinkPath("/rock/not-a-number")).toBe("/");
    expect(giveLinkPath(null)).toBe("/");
    expect(giveLinkPath(undefined)).toBe("/");
  });
});

describe("buildGiveLink", () => {
  it("builds a link the give sheet can read back", () => {
    const link = buildGiveLink(LOWERCASE, "/rock/12");
    expect(link).toBe(`${appUrl}/rock/12?${GIVE_PARAM}=${CHECKSUMMED}`);
    expect(readGiveAddress(new URL(link).search)).toBe(CHECKSUMMED);
  });

  it("uses the canonical origin from lib/chain, never a literal", () => {
    expect(buildGiveLink(LOWERCASE, "/")).toBe(`${appUrl}/?${GIVE_PARAM}=${CHECKSUMMED}`);
    expect(buildGiveLink(LOWERCASE, "/")).toContain(appUrl);
  });

  it("stays inside the QR budget this encoder supports", () => {
    // 213 bytes is the level-M version-10 limit in lib/qr; the link is nowhere near it.
    expect(buildGiveLink(LOWERCASE, "/rock/999999").length).toBeLessThan(120);
  });
});
