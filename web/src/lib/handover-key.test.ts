import { describe, expect, it } from "vitest";
import {
  FOREIGN_HANDOVER_KEY_REASON,
  handoverKeyFromPendingResponse,
  NO_HANDOVER_KEY_REASON,
  UNCONFIRMED_HANDOVER_KEY_REASON,
} from "./handover-key";

/**
 * A2: "The gift is waiting" was printed on the `initiateHandover` receipt alone.
 *
 * The pre-signed owner swap was stored fire-and-forget (`void storeOwnerSwapUserOp(...)`, and a
 * bare `catch {}` inside it), so every way that could fail - no Pimlico key, a rejected paymaster,
 * a 503 from the store - ended with the giver being told the gift was waiting and the claim route
 * refusing it forever. These cases pin the only answer that may be read as "waiting".
 */

describe("handoverKeyFromPendingResponse", () => {
  it("confirms only the giver's own stored swap_owner operation", () => {
    const result = handoverKeyFromPendingResponse(true, {
      state: "REAL",
      pending: { kind: "swap_owner", recipient: `0x${"33".repeat(20)}`, mine: true },
    });
    expect(result.state).toBe("REAL");
  });

  it("refuses when no operation is stored - the defect's own case", () => {
    const result = handoverKeyFromPendingResponse(true, { state: "REAL", pending: null });
    expect(result.state).toBe("UNAVAILABLE");
    if (result.state === "UNAVAILABLE") expect(result.reason).toBe(NO_HANDOVER_KEY_REASON);
  });

  it("refuses a row another account wrote, which this giver cannot replace", () => {
    // The store route is first-writer-wins on the creator DID (audit P-5): a row that is not mine
    // is one I cannot repair, so the gift must not be reported as claimable.
    const result = handoverKeyFromPendingResponse(true, {
      state: "REAL",
      pending: { kind: "swap_owner", recipient: null, mine: false },
    });
    expect(result.state).toBe("UNAVAILABLE");
    if (result.state === "UNAVAILABLE") expect(result.reason).toBe(FOREIGN_HANDOVER_KEY_REASON);
  });

  it("refuses an operation of some other kind", () => {
    const result = handoverKeyFromPendingResponse(true, {
      state: "REAL",
      pending: { kind: "something_else", mine: true },
    });
    expect(result.state).toBe("UNAVAILABLE");
  });

  it("keeps the server's own reason when the read failed", () => {
    const result = handoverKeyFromPendingResponse(false, {
      state: "UNAVAILABLE",
      reason: "no database",
    });
    expect(result.state).toBe("UNAVAILABLE");
    if (result.state === "UNAVAILABLE") expect(result.reason).toBe("no database");
  });

  it("says 'not confirmed', not 'not stored', when the read itself failed silently", () => {
    // "We could not ask" and "the answer is no" are different states and must not be conflated.
    const result = handoverKeyFromPendingResponse(false, {});
    expect(result.state).toBe("UNAVAILABLE");
    if (result.state === "UNAVAILABLE") {
      expect(result.reason).toBe(UNCONFIRMED_HANDOVER_KEY_REASON);
    }
  });

  it("treats a malformed body as unconfirmed rather than as a confirmation", () => {
    for (const body of [null, undefined, {}, { state: "REAL" }, { state: "REAL", pending: 7 }]) {
      expect(handoverKeyFromPendingResponse(true, body as never).state).toBe("UNAVAILABLE");
    }
  });
});
