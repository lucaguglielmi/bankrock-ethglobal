# What is still simulated, and what is merely unconfigured

This is the answer to rule 1 of [`STEERING.md`](./STEERING.md): the living list of everything in
Bank Rock that is not real yet. It replaces the frozen simulation ledger in
[`specs/15-exit-demo-mode.md`](./specs/15-exit-demo-mode.md) §1.3, which stays as the audit
baseline — the record of what was wrong on 2026-09-12, not of what is wrong now.

**Read it before answering "what's next?".** One line per item, with the spec that governs it and
the single condition that makes it real.

Branch `exit-from-demo-mode`. `bash scripts/spec-checks.sh` runs 21 checks and is blocking in CI
(the 21st is `D-034`, the committed configuration against `contracts/deployments/*.json`).

## The three states

| State | Meaning |
| --- | --- |
| `SIMULATED` | A number or an outcome is invented. It carries a visible badge and needs `NEXT_PUBLIC_DEMO_MODE=true`. |
| `UNAVAILABLE` | The real backing is not reachable. The UI says what is missing and shows no value. |
| `REAL` | A live contract, RPC or database answered. |

There is no fourth state, and no `catch` block substitutes a plausible value for a missing one.

---

## 1. Simulated — a badge, and a judge can see it

| # | What | Spec | Becomes real when |
| --- | --- | --- | --- |
| S-1 | Cross-chain deposit (the bridge modal) | 15 Part 6, 04 | A bridge is integrated. Cut from MVP scope; it stays a badged `DEMO` beat. **Its button renders only under `NEXT_PUBLIC_DEMO_MODE=true`**: with the flag off the rock page offers "Fund this rock" instead — the Rock Account, its balances, the two token contracts and the Etherscan link, all REAL. |
| S-4 | **The magic tap link** (`GET /api/demo/tap?key=…`) forges a genuine SDM pair for a *synthetic* tag with the real master key and redirects into the real tap flow — verification, counter, attestation and the on-chain awakening are the production path; only the chip is simulated. Exists only while the Worker secret `DEMO_TAP_SECRET` is set (404 otherwise); every use is logged `DEMO_TAP_FORGED`. Added 2026-09-13 for the recording, before the prototype tag was programmed. | 06, 18 §4.3 | The tag is programmed and the secret is unset — delete this row then. |
| S-3 | The judge scenario switcher's sample views | 15 D-013, 17 | Never. It exists only to pick which badged sample renders, only under the flag, and it can set neither the attestation nor a balance. |

## 2. Unavailable — no path at all, on purpose

| # | What | Spec | Becomes real when |
| --- | --- | --- | --- |
| N-1 | AR / WebXR view | 15 Part 6, 08 must-have 12 | Never for this submission. Cut; the demo's opening beat no longer mentions it. |
| N-2 | Alert delivery | 15 Part 6 | A delivery pipeline is built. Preferences persist behind a verified Privy token; nothing dispatches. |
| N-3 | Fiat on-ramp / off-ramp (Flows G and H fiat legs) | 08 | Out of scope. Note that Flow H's on-chain leg is real: docking *is* the withdrawal. |
| N-4 | ERC-7579 scoped session keys for the MCP runtime | 15 Part 6, 09 D-010 | Post-hackathon. MCP is read-only (D-008, D-019). |
| N-5 | ERC-20 token paymaster ("self-sustaining rock") | 15 Part 6, 09 D-011 | Post-hackathon. The verifying paymaster alone covers the zero-gas beat. |
| N-6 | Idle yield into Aave v3 / Morpho | 15 Part 6, 04 | Post-hackathon. |
| N-7 | Replacement tags; creator registration UI | 15 Part 6, 02 Flows A and F | Cut. `markLost` / `clearLost` exist and are informational only — they freeze nothing. |
| N-8 | A second strategy sharing one reserve | 04, 15 P3.8 | Unblocked: it is one more `streamIndex`. Not shipped; item 4 in spec 08's fallback order. |
| N-9 | An APY or APR figure, anywhere | 09 D-004 | Never. A CI grep enforces its absence in `web/src/components`. |

## 3. Unavailable until something is deployed

**Nothing is left in this state.** The contracts are deployed and verified, their addresses are
committed (D-034), and the build of `c142a4b` was observed serving them on `https://bank-rock.com`
at 16:48 UTC on 2026-09-12: `bash scripts/check-live.sh` reported code at all six addresses and
both deploy blocks, and `/api/rocks/next-id` and `/api/rocks/1/activity` answered `REAL` from the
registry. D-1 (rock lifecycle, owner, Rock Account, provenance, archive) is therefore deleted.

The four Aqua rows that used to sit here (ship and dock, visitor swap, cumulative fees, quotes)
are not "unavailable" any more — every surface is configured and reads the deployed app — but
none has been *exercised* on chain yet. They are the same fact as **P-3** in §5 and live there
now, not here: a shipped strategy, a swap through the taker and a quote from `quoteExactIn` are
what the WP-2 live run proves, and that is the line that gets deleted when it does.

## 4. Unavailable until a secret is set

**2026-09-12 evening:** nine secrets were set on the Worker `web` with `wrangler secret bulk`
(`ADMIN_*`, `CRON_SECRET`, `ATTESTATION_SIGNER_PRIVATE_KEY`, `NXP_MASTER_KEY`, `RELAYER_PRIVATE_KEY`,
`FAUCET_PRIVATE_KEY`, `SEPOLIA_RPC_URL`). K-3, K-4, K-7 and K-8 are deleted: attester set and equal
to the registry's, relayer set and funded with the cap committed, RPC set, D1 live with migrations
applied. What remains needs something other than a secret.

| # | What | Spec | Becomes real when |
| --- | --- | --- | --- |
| K-1 | Sign-in and any wallet address on screen | 16 #1 | `NEXT_PUBLIC_PRIVY_APP_ID` is set and the origin and chain are configured in the Privy dashboard. |
| K-2 | The "Verified Physical" badge | 16 #18, 06 | `NXP_MASTER_KEY` matches the key written to the tags. |
| K-6 | The ETH faucet | 16 #16 | `FAUCET_PRIVATE_KEY` is set and funded. There is no default key. |
| K-9 | Any email at all | 16 #19, #33 | `RESEND_API_KEY` plus SPF/DKIM verification of `bank-rock.com`. Until then the sandbox sender reaches only the account owner's inbox. |

## 5. Real in code, unproven in the world

**2026-09-12 21:24 UTC — the live rehearsal ran green on Sepolia** (`contracts/deployments/rehearsal-2026-09-12.md`): sponsored awaken, ship, visitor swap through the taker, named gift with the owner swap mined *before* the relayed claim, sponsored archive by the recipient from the rock's own account, and a re-awakening of the same tag into rock 2. P-2, P-3, P-4, P-5, P-6, P-8, P-9 and P-11 are deleted on that evidence, and K-5 with them (a Pimlico policy for chain 11155111 sponsored every operation). Still open below: the physical tag, the deliberately reverting operation, and the relayer's cap exhaustion — none of which the rehearsal exercises.

Not simulated. Not unavailable. Simply never exercised against the thing it models — which is the
most dangerous category on this page, because it looks finished.

| # | What | Spec | Proven when |
| --- | --- | --- | --- |
| P-1 | **NTAG 424 DNA SDM verification** | 06, 15 P4, 18 §4.2 | A physical tag is programmed and tapped, and the copied-URL test shows `unverified` in a second browser. This is the acceptance test for D-002 and cannot be waived. |
| P-7 | **The UserOperation receipt check** | 09 D-032, audit `N-6` | `submitSignedUserOp` now treats only `receipt.success === true` as landed, because ERC-4337 reports an included-but-reverted operation with a perfectly good transaction hash. Proven when a *deliberately* reverting owner swap is seen to be reported `UNAVAILABLE` with nothing claimed — the honest failure, not the silent one. |
| P-10 | **The relayer's daily spend cap** | 16 #34, audit `F-10` / `P-1` | `RELAYER_DAILY_CAP_WEI` is reserved in D1 before each broadcast and released on either failure path, and unset means relaying is **off**. Proven when a claim is refused because the day's cap is exhausted, and the next UTC day allows one again. |

## 6. Known-wrong, outside the app

| # | What | Spec | Fixed when |
| --- | --- | --- | --- |
| W-1 | `https://www.bank-rock.com/` (the bare root only) returns 308 to a literal `:path*` | 15 R-1, D-022, 12 §1 | **Diagnosed 2026-09-12 with the zone API: there is no dashboard redirect rule** (the zone has no dynamic-redirect ruleset). The 308 is the app's own `next.config.ts` redirect: the OpenNext adapter leaves `:path*` unsubstituted for the empty path, while `/rock/1` redirects correctly. Fixed by a dedicated root rule plus `/:path+`; deleted when `curl -sIL https://www.bank-rock.com/` ends 200 on the live site. |
| W-2 | The CI responsive job configures no chain, so the two spec 17 Part 7 checks that need a live rock (items 7, 8) skip rather than run; the Lighthouse budget (item 10) is not run at all | 17 U4, 09 D-031 | That job's environment points at a deployed registry, and the Lighthouse budget is measured by hand against the public deployment. The static checks and the rest of the matrix are blocking today. |

---

## 7. Pre-mainnet — true on Sepolia, not true where value is

Not simulated, not unavailable, not unproven: **deliberately deferred.** Each item is safe on a
testnet and unsafe on a network where a rock id or a Rock Account balance is worth something. The
full reasoning is in [spec 19](./specs/19-contract-review-and-hardening.md) Part 4 and
`contracts/audit/2026-09-12-changes.md` §5. This section exists so that "we decided to
wait" and "we forgot" never look the same.

**Mandatory before a value-bearing deployment**

| # | What | Why it can wait on Sepolia |
| --- | --- | --- |
| M-1 | **`bytes32 action` in the attestation** (audit `F-21`) | The signed struct names the rock, tag, counter, subject and account — but not *which call*. One signature therefore satisfies both attested functions wherever the field checks pass. Today `subject` is the same person on both paths and the counter is spent either way, so the impact is nil. It stops being nil the moment a third attested action exists, or the verifier signs anything that is not a claim, or a second verifier implementation appears. It is a type-hash change: three ABI copies, the signer, and every attestation in flight. |
| M-2 | **A second, independent verifier for the attester key** | One address, rotatable by one administrator, living on a web server — and since D-032 it signs what amounts to a transfer of title *and* the choice of controlling account. A threshold scheme or an attester contract implementing `isValidSignature` removes the single point of compromise; `_consumeAttestation` would move to `SignatureChecker`. |
| M-3 | **One cold reviewer over the combined change** | The sign-off's last open condition. The on-chain `isOwner` check and the receipt check both landed *after* the sign-off was written, so no cold reader has re-checked them together. |

**Strongly recommended**

| # | What | Note |
| --- | --- | --- |
| M-4 | An external audit of the vendored Aqua sources | The review covered *integration* risk only — how our contracts call Aqua and what it calls back. `Aqua` and `XYCSwap` themselves were not reviewed, and a value-bearing deployment rests on both. |
| M-5 | Treat the relayer perimeter as mandatory, not recommended | The claimable pre-check, per-rock bucket, fail-closed limiter and `RELAYER_DAILY_CAP_WEI` have all landed. They become mandatory the moment the relayer key holds a real balance. |
| M-6 | Say out loud in the UI that `archiveRock` is terminal | A retired rock cannot be revived. The tag can awaken a new id and the old record stays readable, but where a rock id carries value the owner must be told before pressing it, not afterwards. |

**Accepted at any value, and written down so that accepting is a decision**

- Tokens mis-sent to `XYCSwapTaker` are **lost**. A rescue function is an admin key on the trade
  path, which is a larger risk than the mistake it recovers from.
- The `Handover` struct will not gain fields; a future field goes in a new view.
- The registry's function names stay as they are; the plain English lives in the `@notice`.
- A counterfactual Rock Account cannot be bound on claim — an address that has never executed
  cannot be shown to answer to anybody.

---

## How to keep this file honest

- A new simulated surface is not merged until it has a line here.
- A line is deleted only when the condition in its last column is actually met — not when the code
  that would satisfy it is written.
- If a value could be shown without any of these conditions being met, that is a bug of the kind
  spec 15 exists to remove, not a feature.
