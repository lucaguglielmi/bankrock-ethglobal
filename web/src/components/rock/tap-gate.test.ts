import { describe, expect, it } from "vitest";
import { tapGateFor, tapNeedsSubject } from "./tap-gate";

/**
 * A1: the recipient's tap must not be burned before they sign in.
 *
 * The gate covered `dormant` only, so a signed-out visitor landing on a `handover_pending` rock
 * went straight to `verify`. The verifier advanced the tag's counter and then returned
 * `missing_subject`, because there was no wallet to name in the attestation - so the gift beat
 * always cost a second tap, which spec 08 (2:10) does not have room for.
 *
 * These cases are that gate's contract. The signed-out `handover_pending` row is the defect.
 */

const base = { ready: true, rockResolved: true, authenticated: false };

describe("tapGateFor", () => {
  it("waits until the auth provider has resolved", () => {
    expect(tapGateFor({ ...base, ready: false, state: "awake" })).toBe("wait");
    // Even for a state that would otherwise verify immediately: "signed out" is not yet a fact.
    expect(tapGateFor({ ...base, ready: false, authenticated: true, state: "awake" })).toBe("wait");
  });

  it("waits until the rock read has produced an answer", () => {
    expect(tapGateFor({ ...base, rockResolved: false, state: undefined })).toBe("wait");
  });

  it("holds a signed-out visitor's tap on a rock waiting to be claimed (A1)", () => {
    expect(tapGateFor({ ...base, state: "handover_pending" })).toBe("hold");
  });

  it("holds a signed-out visitor's tap on a dormant rock, as it always did", () => {
    expect(tapGateFor({ ...base, state: "dormant" })).toBe("hold");
  });

  it("spends the held tap as soon as the visitor is signed in", () => {
    expect(tapGateFor({ ...base, authenticated: true, state: "handover_pending" })).toBe("verify");
    expect(tapGateFor({ ...base, authenticated: true, state: "dormant" })).toBe("verify");
  });

  it("verifies at once where the answer needs no subject", () => {
    for (const state of ["awake", "archived", undefined]) {
      expect(tapGateFor({ ...base, state })).toBe("verify");
    }
  });

  it("verifies at once for a state it has never heard of, rather than stalling the page", () => {
    // An unknown state is not a reason to withhold the only honest thing the page can say about
    // the object in front of the visitor.
    expect(tapGateFor({ ...base, state: "something_new" })).toBe("verify");
  });
});

describe("tapNeedsSubject", () => {
  it("names exactly the two states whose attestation must carry a wallet", () => {
    expect(tapNeedsSubject("dormant")).toBe(true);
    expect(tapNeedsSubject("handover_pending")).toBe(true);
    expect(tapNeedsSubject("awake")).toBe(false);
    expect(tapNeedsSubject("archived")).toBe(false);
    expect(tapNeedsSubject(undefined)).toBe(false);
  });
});
