import { describe, expect, it } from "vitest";
import { zeroAddress } from "viem";
import {
  ACCOUNT_ANSWERS_ELSEWHERE_REASON,
  ACCOUNT_DID_NOT_ANSWER_REASON,
  ACCOUNT_NOT_DEPLOYED_REASON,
  ARCHIVED_REASON,
  NOT_AWAKENED_REASON,
  NOT_ROCK_OWNER_REASON,
  NO_REGISTRY_ACCOUNT_REASON,
  SIGNED_OUT_REASON,
  interpretAccountAnswer,
  ownerActionAuthority,
  planRockAccount,
  readAccountAnswersTo,
  type AccountAnswer,
  type RockRecord,
} from "./rock-account";

/**
 * D-037 — for an awakened rock the Rock Account is the registry's, and authority is the account's
 * own answer.
 *
 * The four situations below are the ones the live rehearsal walked into. The third of them is the
 * bug: a gift leaves the rock bound to the Safe the *giver* derived, so a recipient who re-derived
 * computed an empty stranger and every owner action became unreachable in the app for the person
 * the registry says owns the rock.
 */

/** Addresses are built, never written out (D-015, spec 15 Part 7). */
function sampleAddress(digit: string): `0x${string}` {
  return `0x${digit.repeat(40)}`;
}

function sampleHash(pair: string): `0x${string}` {
  return `0x${pair.repeat(32)}`;
}

/** A, who awakened the rock. The account below is the one her wallet and this tag derive. */
const WALLET_A = sampleAddress("1");
/** C, who was given the rock. Her own derivation for the same tag is a different address. */
const WALLET_C = sampleAddress("3");
/** A third wallet that has never held this rock. */
const STRANGER = sampleAddress("7");

/** The Rock Account: derived from (A, tag), and the one the registry holds before and after. */
const ACCOUNT = sampleAddress("2");
/** What C would derive for the same tag. Nothing in the app may act from it. */
const C_DERIVED = sampleAddress("4");

const UID_HASH = sampleHash("ab");

function record(overrides: Partial<RockRecord> = {}): RockRecord {
  return {
    rockId: "1",
    owner: WALLET_A,
    smartAccount: ACCOUNT,
    uidHash: UID_HASH,
    state: "awake",
    lost: false,
    handover: null,
    ...overrides,
  };
}

const ANSWERS: AccountAnswer = { answers: true };
const ANSWERS_ELSEWHERE: AccountAnswer = {
  answers: false,
  reason: ACCOUNT_ANSWERS_ELSEWHERE_REASON,
};

describe("planRockAccount — which address is the Rock Account", () => {
  it("case 1: for the wallet that awakened the rock, the registry's account is the derived one", () => {
    // Nothing changes for the ordinary owner: the registry holds exactly what she derived.
    const plan = planRockAccount({ record: record(), derived: ACCOUNT });
    expect(plan).toEqual({ state: "REAL", value: { smartAccount: ACCOUNT, source: "registry" } });
  });

  it("case 2: after a gift the account is still the registry's, not the new owner's derivation", () => {
    const plan = planRockAccount({
      record: record({ owner: WALLET_C }),
      derived: C_DERIVED,
    });
    expect(plan.state).toBe("REAL");
    if (plan.state !== "REAL") return;
    expect(plan.value.smartAccount).toBe(ACCOUNT);
    expect(plan.value.smartAccount).not.toBe(C_DERIVED);
    expect(plan.value.source).toBe("registry");
  });

  it("case 4: a dormant rock has no account to read, so the derived address is the answer", () => {
    const plan = planRockAccount({
      record: record({ state: "dormant", owner: zeroAddress, smartAccount: zeroAddress }),
      derived: C_DERIVED,
    });
    expect(plan).toEqual({
      state: "REAL",
      value: { smartAccount: C_DERIVED, source: "derivation" },
    });
  });

  it("a rock that has not been read, and no derivation, yields no address at all", () => {
    expect(planRockAccount({ record: null })).toEqual({
      state: "UNAVAILABLE",
      reason: NOT_AWAKENED_REASON,
    });
  });

  it("never falls back to a derivation for an awakened rock whose record names no account", () => {
    // Only reachable off a chain that does not match this ABI. Substituting a derived address
    // there would act from an account the registry has never heard of.
    const plan = planRockAccount({
      record: record({ smartAccount: zeroAddress }),
      derived: C_DERIVED,
    });
    expect(plan).toEqual({ state: "UNAVAILABLE", reason: NO_REGISTRY_ACCOUNT_REASON });
  });

  it("keeps the registry's account through a pending handover", () => {
    const plan = planRockAccount({ record: record({ state: "handover_pending" }) });
    expect(plan.state === "REAL" && plan.value.smartAccount).toBe(ACCOUNT);
  });
});

describe("ownerActionAuthority — who may send this rock's owner actions", () => {
  it("case 1: the wallet that awakened the rock keeps acting from the same account", () => {
    expect(
      ownerActionAuthority({ record: record(), wallet: WALLET_A, answer: ANSWERS }),
    ).toEqual({ state: "REAL", value: ACCOUNT });
  });

  it("case 2: the gifted recipient acts from the account the registry rebound to her", () => {
    // The Safe's only owner is C after the claim (D-032), so it answers to her — and the address
    // is unchanged, which is the whole point of a gift moving no assets.
    expect(
      ownerActionAuthority({
        record: record({ owner: WALLET_C }),
        wallet: WALLET_C,
        answer: ANSWERS,
      }),
    ).toEqual({ state: "REAL", value: ACCOUNT });
  });

  it("case 3: a wallet the account does not answer to is refused, with that reason", () => {
    const refused = ownerActionAuthority({
      record: record({ owner: WALLET_C }),
      wallet: WALLET_C,
      answer: ANSWERS_ELSEWHERE,
    });
    expect(refused).toEqual({
      state: "UNAVAILABLE",
      reason: ACCOUNT_ANSWERS_ELSEWHERE_REASON,
    });
  });

  it("case 3: the giver, after the gift, is no longer the registry's owner", () => {
    // A still holds the tag's derivation, and that now means nothing.
    expect(
      ownerActionAuthority({
        record: record({ owner: WALLET_C }),
        wallet: WALLET_A,
        answer: ANSWERS,
      }),
    ).toEqual({ state: "UNAVAILABLE", reason: NOT_ROCK_OWNER_REASON });
  });

  it("case 3: a stranger gets the same refusal, not a different-looking one", () => {
    expect(
      ownerActionAuthority({ record: record(), wallet: STRANGER, answer: ANSWERS_ELSEWHERE }),
    ).toEqual({ state: "UNAVAILABLE", reason: NOT_ROCK_OWNER_REASON });
  });

  it("case 4: a rock nobody has awakened has no owner action to authorise", () => {
    expect(
      ownerActionAuthority({
        record: record({ state: "dormant", owner: zeroAddress, smartAccount: zeroAddress }),
        wallet: WALLET_A,
        answer: ANSWERS,
      }),
    ).toEqual({ state: "UNAVAILABLE", reason: NOT_AWAKENED_REASON });
  });

  it("refuses a retired rock, which the registry refuses too", () => {
    expect(
      ownerActionAuthority({
        record: record({ state: "archived" }),
        wallet: WALLET_A,
        answer: ANSWERS,
      }),
    ).toEqual({ state: "UNAVAILABLE", reason: ARCHIVED_REASON });
  });

  it("asks for a sign-in rather than guessing at a wallet", () => {
    expect(
      ownerActionAuthority({ record: record(), wallet: undefined, answer: ANSWERS }),
    ).toEqual({ state: "UNAVAILABLE", reason: SIGNED_OUT_REASON });
  });

  it("matches the owner case-insensitively — a checksum is not an identity", () => {
    expect(
      ownerActionAuthority({
        record: record(),
        wallet: WALLET_A.toUpperCase().replace("0X", "0x"),
        answer: ANSWERS,
      }).state,
    ).toBe("REAL");
  });
});

describe("interpretAccountAnswer — the same reading `_accountAnswersTo` makes on chain", () => {
  it("is true only for a clean true", () => {
    expect(interpretAccountAnswer({ hasCode: true, isOwner: true })).toEqual({ answers: true });
  });

  it("reads a false answer as somebody else's account", () => {
    expect(interpretAccountAnswer({ hasCode: true, isOwner: false })).toEqual({
      answers: false,
      reason: ACCOUNT_ANSWERS_ELSEWHERE_REASON,
    });
  });

  it("keeps 'not deployed' apart from 'not yours'", () => {
    // An account that has never executed has no code and can answer for nobody — the case the
    // registry's claim gate refuses outright (D-032 consequence 1).
    expect(interpretAccountAnswer({ hasCode: false, isOwner: null })).toEqual({
      answers: false,
      reason: ACCOUNT_NOT_DEPLOYED_REASON,
    });
  });

  it("counts an unclean answer as no, and says so in its own words", () => {
    expect(interpretAccountAnswer({ hasCode: true, isOwner: null })).toEqual({
      answers: false,
      reason: ACCOUNT_DID_NOT_ANSWER_REASON,
    });
  });
});

describe("readAccountAnswersTo — the reads it refuses to make", () => {
  it("does not ask an account that does not exist", async () => {
    expect(await readAccountAnswersTo(undefined, WALLET_A)).toEqual({
      state: "UNAVAILABLE",
      reason: NO_REGISTRY_ACCOUNT_REASON,
    });
    expect(await readAccountAnswersTo(zeroAddress, WALLET_A)).toEqual({
      state: "UNAVAILABLE",
      reason: NO_REGISTRY_ACCOUNT_REASON,
    });
  });

  it("does not ask on behalf of nobody", async () => {
    expect(await readAccountAnswersTo(ACCOUNT, undefined)).toEqual({
      state: "UNAVAILABLE",
      reason: SIGNED_OUT_REASON,
    });
  });

  it("reports a malformed wallet rather than coercing it", async () => {
    const answer = await readAccountAnswersTo(ACCOUNT, "not-an-address");
    expect(answer.state).toBe("UNAVAILABLE");
  });
});
