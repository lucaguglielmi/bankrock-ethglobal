import { describe, expect, it } from "vitest";
import { findNextDormantRockId, nextFreeRockId } from "@/lib/rock-account";
import type { Capability } from "@/lib/demo";

const chain = (states: Record<string, string>) => async (id: string): Promise<Capability<{ state: string }>> =>
  ({ state: "REAL", value: { state: states[id] ?? "dormant" } }) as Capability<{ state: string }>;

describe("findNextDormantRockId - the registry decides, the mirror only suggests", () => {
  it("returns the suggestion when it is dormant on chain", async () => {
    expect(await findNextDormantRockId("3", chain({ "1": "archived", "2": "awake" }))).toBe("3");
  });

  it("walks past archived and awake ids when the mirror lags", async () => {
    // An empty mirror suggests 1; rocks 1 and 2 are taken on chain (the 2026-09-12 rehearsal).
    expect(await findNextDormantRockId(nextFreeRockId([]), chain({ "1": "archived", "2": "awake" }))).toBe("3");
  });

  it("returns null when the registry cannot be asked", async () => {
    const down = async (): Promise<Capability<{ state: string }>> =>
      ({ state: "UNAVAILABLE", reason: "rpc" }) as Capability<{ state: string }>;
    expect(await findNextDormantRockId("1", down)).toBeNull();
  });

  it("gives up after the probe limit instead of looping forever", async () => {
    expect(await findNextDormantRockId("1", chain(new Proxy({}, { get: () => "awake" })), 5)).toBeNull();
  });
});
