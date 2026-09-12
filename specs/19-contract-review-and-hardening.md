# Smart contract review and hardening

## Purpose

The operator is about to deploy `BankRockRegistry` and the Aqua taker periphery to Ethereum
Sepolia and, later, to a network with real value. Before any deployment this document defines
(1) the security review every contract must pass, (2) the readability and usability standard
every contract must meet so that a person can drive it directly from Etherscan without the web
app, and (3) the process and evidence required to sign it off.

It is the contract for the review, not the review itself. Findings and sign-off live in
`contracts/audit/`. Status vocabulary is the one in
[`15-exit-demo-mode.md`](./15-exit-demo-mode.md).

---

## Status (Fact, 2026-09-12)

All four steps of [Part 3](#part-3--process-and-evidence) have run, and both rounds of
remediation have landed. This section is the summary; the evidence is in the four audit files.

| Step | Artefact | Outcome |
| --- | --- | --- |
| 1 — independent audit | [`contracts/audit/2026-09-12-findings.md`](../contracts/audit/2026-09-12-findings.md) | 25 findings: 1 High, 7 Medium, 11 Low, 6 Informational |
| 2 — hardening and readability | [`contracts/audit/2026-09-12-changes.md`](../contracts/audit/2026-09-12-changes.md) | every High and Medium fixed with a regression test; the Part 2 standard applied to both contracts |
| 3 — cold re-review and sign-off | [`contracts/audit/2026-09-12-signoff.md`](../contracts/audit/2026-09-12-signoff.md) | 23 of 25 re-checked as genuinely closed; 8 new findings `N-1`…`N-8`; two further rounds of fixes followed |
| 4 — application perimeter | [`../web/audit/2026-09-12-perimeter.md`](../web/audit/2026-09-12-perimeter.md) | 21 findings `P-1`…`P-21`, no Critical; `P-1` and `P-2` closed after it was written |

### Per-finding table summary

| Origin | Critical | High | Medium | Low | Informational | Total |
| --- | --- | --- | --- | --- | --- | --- |
| Audit, `F-1`…`F-25` | 0 | 1 | 7 | 11 | 6 | 25 |
| Re-review, `N-1`…`N-8` | 0 | 0 | 2 | 2 | 4 | 8 |
| Perimeter, `P-1`…`P-21` | 0 | 3 | 8 | 8 | 2 | 21 |

`F-1` and `N-1` are one defect carrying two ids, so the on-chain count is 33 ids over 32 defects.

**Open against the tree at `9c5bc1a`: 0 Critical, 0 High, 0 Medium.** Three dispositions are not
"closed" and are deliberate:

| Id | Severity | Disposition |
| --- | --- | --- |
| `F-19` | Low | **Accepted.** The plain-English renames (`giveRock`, `claimRock`, …) were not made; the `@notice` first words carry the plain English instead. Three consumers depend on the current names |
| `F-21` | Informational | **Deferred, and mandatory before a value-bearing network.** See [Part 4](#part-4--pre-mainnet) |
| `N-7` | Low | **Closed by this document's companion edit** — the attester's new power is now a row in the [`15-exit-demo-mode.md`](./15-exit-demo-mode.md) Part 5 threat model |

### Verdict (quoted from the sign-off, §6)

> **Sepolia, now: yes** — the relayer path is now genuinely safe (open gifts refused, the Safe
> moved and its receipt awaited before the rock, the attestation's account checked against the
> registry), the registry moves no value on any network […]
>
> **A value-bearing network, later: no, not yet** — not until the registry stops taking the
> attester's word for it […], `N-6` is fixed and re-reviewed by the perimeter owner, the
> `bytes32 action` field of `F-21` is added in that same ABI change, `N-7` is written into
> spec 15 Part 5, and one reviewer re-checks that change alone.

Four of those five conditions have since been met: the registry check landed (`8a93e21`, D-032),
`N-6` landed (`42f2190`), `N-7` is written into spec 15 Part 5, and the tooling below re-ran clean.
What is left is `F-21` and a single reviewer pass over the combined change — both in
[Part 4](#part-4--pre-mainnet).

### Tooling results (Fact — re-run 2026-09-12 against `9c5bc1a`)

```
cd contracts && npm test                     # 108 passing, 0 failing (was 105 passing / 1 failing
                                             # at the sign-off, the failure being the N-1 PoC)
npx solhint --config solhint:recommended \
  contracts/BankRockRegistry.sol contracts/aqua/XYCSwapTaker.sol
                                             # 0 errors, 8 warnings, 0 use-natspec
node scripts/export-abi.js                   # the three ABI copies reproduce with no diff
slither contracts/BankRockRegistry.sol       # 6 results, 0 high, 0 medium
slither contracts/aqua/XYCSwapTaker.sol      # 14 results, 1 medium-impact (N-5), triaged in writing
```

The eight solhint warnings are the same eight the sign-off triaged: one `gas-struct-packing` on the
EIP-712 `Attestation`, two `gas-small-strings` on the type string, three `gas-strict-inequalities`
on the deliberately inclusive boundaries, and two `func-visibility` false positives on constructors.
The slither figures are quoted from the sign-off; they were not re-run here.

### Where the audit files and the code now disagree (Fact)

The sign-off was written at 13:29 UTC and two fixes landed after it. Read the code, not the file:

- **`F-1` / `N-1`.** The sign-off says `N-1` is "open (reduced)" and that
  `testReview_N1_aClaimNamingTheGiversAccountMustNotLeaveItInControl` fails. It no longer does.
  `claimHandover` now calls `_accountAnswersTo(att.smartAccount, att.subject)` and reverts
  `AccountDoesNotAnswerToOwner` otherwise (`BankRockRegistry.sol` L563-565). The whole suite is
  green. `2026-09-12-changes.md` §1 second-pass table records `N-1` as fixed, and it is right.
- **`N-6`.** The sign-off says `submitSignedUserOp` never reads the receipt's `success` flag. It
  does now (`rock-account.server.ts` L447), and the claim route refuses an attestation with less
  than 90 s of life left (`MIN_ATTESTATION_LIFETIME_MS`). Both halves of `N-6` are closed.
- **`N-8`.** The sign-off says `claimHandover`'s `@dev` describes a verifier branch nobody wrote,
  and that `2026-09-12-changes.md` §3 carries a stale `InvalidSmartAccount` warning. Both texts
  were rewritten in `8a93e21`; the prose now matches the code.
- **Perimeter `P-1` and `P-2`.** Recorded "open" at 12:12 UTC. Both are closed in the tree, with
  tests, in `web/src/lib/rock-account.server.perimeter.test.ts`.

## Scope

| Contract | Path | Written by us | Deployed by us |
| --- | --- | --- | --- |
| `BankRockRegistry` | `contracts/contracts/BankRockRegistry.sol` | yes | yes |
| `XYCSwapTaker` | `contracts/contracts/aqua/XYCSwapTaker.sol` | yes | yes |
| `XYCSwap` (reference app) | `contracts/contracts/aqua/examples/apps/XYCSwap.sol` | no — vendored, unmodified | yes |
| `Aqua` | vendored, tests only | no | **never** (canonical Sepolia deployment is used) |
| Deploy scripts | `contracts/scripts/deploy.js`, `deploy-aqua-app.js` | yes | — |
| Off-chain trust | attestation signer (`web/src/lib/nfc/attestation.ts`), claim relayer (`web/src/lib/rock-account.server.ts`, `/api/rocks/[id]/claim`) | yes | — |

Vendored code is reviewed for **integration risk** (how our contracts call it, what it calls
back), not rewritten. Any change to a vendored file is a finding, not a fix.

---

# Part 1 — Security review

## 1.1 Threat model (what an attacker wants)

| Goal | Path an attacker would try |
| --- | --- |
| Own a rock they never held | forge or replay an attestation; bind a second rock to a tag; claim a handover meant for someone else; front-run an awakening with a substituted Rock Account |
| Drain a Rock Account | make the registry hold or approve tokens (it must not); abuse the taker periphery's callback to pull from a maker outside a swap; reenter the taker mid-swap |
| Lock a rock forever | put it in a state no owner action can leave; block `archiveRock`; make the attester unrotatable |
| Make the operator pay | grief the relayer with valid-looking claims; burn Pimlico sponsorship through repeated UserOps; spam counters |
| Trick a user reading Etherscan | ambiguous function names, unlabelled parameters, silent success paths, events that lie |

## 1.2 Checklist — every item is answered with evidence (a test, a line reference, or "n/a" with reason)

### Authorisation and identity
- [ ] `awakenRock` and `claimHandover` accept only attestations signed by `attester()`; ECDSA recovery uses OpenZeppelin (malleability-safe); a zero recovered address can never match.
- [ ] EIP-712: domain separator includes `chainId` and `verifyingContract`; a signature for another deployment or chain is rejected (test on a fork of the domain).
- [ ] `deadline` is compared with `>=`/`>` consistently and documented; an attestation cannot be used after its deadline; the maximum lifetime (10 minutes off-chain) is documented on-chain.
- [ ] Counter monotonicity per `uidHash` survives archive, handover and attester rotation; `counter == 0` rejected; a `uint32` cannot realistically overflow (2³² taps) — documented.
- [ ] One tag ↔ one live rock (`rockIdForUid`); the binding is released only by `archiveRock`.
- [ ] `subject != 0` and `smartAccount != 0` on awaken; `att.smartAccount == smartAccount`.
- [ ] Owner-gated actions accept exactly `currentOwner` or `smartAccount`; a stranger and a relayer are rejected (test).
- [ ] `Ownable2Step` (not plain `Ownable`) for the contract owner, so an owner cannot be lost by a typo; `renounceOwnership` disabled or documented.
- [ ] Attester rotation cannot lock the contract; a `setAttester(address(0))` is rejected.
- [ ] Pause blocks only state transitions that admit new value or new ownership; it never blocks an owner from leaving a state (`cancelHandover`, `archiveRock`, `clearLost`).

### State machine
- [ ] Every transition is listed in a table in the NatSpec and each is covered by a test, including every rejected transition (`Dormant→claim`, `Archived→anything`, expired handover claim).
- [ ] Expired handovers report `Awake` and are claimable by nobody; the stale struct cannot be claimed after `cancel`/`archive`.
- [ ] No transition can be triggered by `block.timestamp` manipulation beyond the ±15 s miner window; expiry granularity is documented.
- [ ] Storage: no struct packing that makes a future field addition break the ABI; all mappings keyed by `rockId` or `uidHash` only.

### Value and tokens (registry must hold none; taker must hold none between transactions)
- [ ] The registry has no `payable` function, no `receive`, no `fallback`, no token calls, no `call`/`delegatecall` with external calldata.
- [ ] `XYCSwapTaker`: uses `SafeERC20` for every transfer/approve; never holds a balance after a swap (invariant test: balances of both tokens are zero after every swap); approval to Aqua is exact or reset (Circle USDC forbids non-zero→non-zero `approve`); handles a token that returns no boolean.
- [ ] Callback: `xycSwapCallback` is callable only by the app, only during a swap started by this contract (transient slot), only for the amount and token the app names; a second callback in the same swap reverts; reentrancy through the token transfer (ERC-777 style hooks) cannot start a nested swap.
- [ ] Slippage and deadline: `swapExactIn` takes `amountOutMin` and a `deadline`; the recipient is a parameter; the taker never keeps a residual.
- [ ] Stuck funds: tokens sent to the taker by mistake — either a `rescue` restricted to a fixed address, or an explicit statement that such tokens are lost and why. Decide and document.
- [ ] Fee-on-transfer / rebasing tokens: unsupported — documented, and USDC/WETH are the only tokens the UI offers.

### Operations and griefing
- [ ] Relayer route: the server verifies the attestation signature, checks the handover exists and is claimable, and rate-limits per IP and per rock before spending gas; a maximum relayer spend per day is enforced (env) — or the absence is documented as a Sepolia-only risk.
- [ ] Sponsorship: the Pimlico policy is restricted to the app's contracts (documented in spec 16 #15).
- [ ] Deploy scripts refuse to run against the wrong chain id, print every constructor argument, and write the deployment record; the attester and owner are the intended addresses (checked on-chain after deploy).
- [ ] Etherscan verification: standard-JSON input reproducible from `contracts/`; vendored files verified as part of the same input.

### Tooling
- [ ] `solhint` with the recommended ruleset passes on our two contracts.
- [ ] `slither` (if installable) reports no high or medium finding that is not explicitly triaged in the audit file.
- [ ] Fuzz tests exist for: counter monotonicity across any sequence of awaken/archive; handover state machine under random action sequences; taker balance invariant under random amounts.

## 1.3 Severity and disposition

| Severity | Meaning | Required action before deploy |
| --- | --- | --- |
| Critical | loss of a rock or funds without the victim's action | fix + regression test |
| High | loss requiring an unlikely precondition, or permanent lock | fix + regression test |
| Medium | griefing, operator cost, or a misleading state | fix, or documented acceptance with rationale |
| Low | readability, gas, event completeness | fix if cheap; otherwise list |
| Informational | style | list |

---

# Part 2 — Readability and Etherscan usability standard

The bar: a person who has never seen the repository opens the verified contract on Etherscan,
reads the source, and can awaken, gift, claim and retire a rock from the **Write Contract** tab
without a mistake, and can understand what happened from the **Read Contract** tab and the
event log.

## 2.1 File layout (fixed order, one contract per file)

1. SPDX and pragma (`^0.8.24` registry, `0.8.30` taker — whatever the build pins).
2. Imports (OpenZeppelin first, then local).
3. Contract-level NatSpec: `@title`, `@notice` (three sentences a non-developer can follow:
   what it is, what it never does, who can call what), `@dev` (the invariants, the threat
   model summary, the link to spec 15 Part 5 and this document), `@custom:security-contact`.
4. Type declarations (enums, structs) with a one-line `@notice` per field.
5. Constants and immutables.
6. Storage, each with `@notice`.
7. Events, each with `@notice` and every parameter named; `indexed` on `rockId`, `uidHash`,
   actor addresses.
8. Custom errors, each with parameters that make the failure self-explanatory on Etherscan
   (`HandoverExpired(uint256 rockId, uint64 expiresAt, uint64 nowTimestamp)`), never a bare
   `revert()` or string revert.
9. Modifiers.
10. Constructor.
11. External state-changing functions, grouped by actor: attested actions (awaken, claim),
    owner-of-the-rock actions (initiate, cancel, archive, lost), contract-owner actions
    (attester, pause).
12. External and public views, grouped: per-rock (`getRock`), per-tag (`rockIdForUid`,
    `lastCounter`), attestation helpers (`hashAttestation`, `domainSeparator`,
    `ATTESTATION_TYPEHASH`), metadata (`version()`, `describeRock()`).
13. Internal and private functions.

## 2.2 Naming and documentation

- Function names say what happens to the rock in plain English: `awakenRock`, `giveRock`
  (initiate handover), `claimRock`, `cancelGift`, `retireRock` (archive), `markLost`,
  `clearLost`. Keep the current names if renaming breaks the ABI agreed with the app, but
  then add the plain-English name as the `@notice` first words. **Decision: renames are
  allowed in this review as long as the ABI export, the web hook encoders and the MCP ABI are
  regenerated in the same change and all tests pass.**
- Every parameter is named for what a human would type into Etherscan: `rockId`, `recipient`,
  `expiresAt (unix seconds)`; units in the `@param` text.
- Every function has `@notice` (who may call it, what it does, what it emits) and
  `@dev` only where an invariant or ordering matters.
- Every revert is a custom error whose name is a sentence fragment (`RockIsArchived`,
  `NotTheRockOwner`, `AttestationExpired`) and whose parameters show the values that failed.
- No magic numbers: `MAX_ATTESTATION_LIFETIME`, `MAX_HANDOVER_DURATION` as named constants
  with a `@notice` and a test.
- A `version()` view returns a semver string; a `describeRock(uint256)` view returns
  `(string state, address owner, address rockAccount, bool lost, uint64 handoverExpiresAt)`
  so Etherscan's Read tab shows words, not enum integers.
- Struct return values are documented field-by-field; enums document each value's number in
  the NatSpec (`0 = Dormant, 1 = Awake, …`) because Etherscan shows integers.
- Events tell the whole story: after any transaction a reader of the event log alone can
  reconstruct owner, account and state without calling views.

## 2.3 Formatting

- `forge fmt`-style formatting (120-column, 4-space indent, one blank line between
  functions), applied by a formatter, not by hand; `solhint` clean.
- Line comments only for non-obvious lines; no commented-out code; no TODO without an issue
  reference.
- The taker contract follows the same layout and standard; its `@notice` explains in one
  paragraph why it exists (the app's callback design).

## 2.4 Etherscan playbook

`contracts/README.md` gains a section "Using the contracts from Etherscan" with one subsection
per action: which contract, which function, every field with an example value, what to expect
in the event log, and the two things a person must never do (paste a private key anywhere,
approve the registry for tokens). The attestation-dependent actions explain where the
attestation comes from (the app's verifier) and that Etherscan alone cannot produce one.

---

# Part 3 — Process and evidence

1. **Independent audit first.** One agent reads the contracts cold against Part 1 and writes
   `contracts/audit/2026-09-12-findings.md`: every checklist item with evidence, every finding
   with severity, a proof-of-concept test where a finding is exploitable (added under
   `contracts/test/audit/` and expected to FAIL until fixed), and a recommended fix.
2. **Hardening and readability pass.** A second agent implements every Critical/High/Medium
   fix and the Part 2 standard, keeps the whole suite green, makes the PoC tests pass,
   regenerates the three ABI copies and the web encoders, and records what changed in
   `contracts/audit/2026-09-12-changes.md`.
3. **Re-review and sign-off.** A third agent, cold, re-checks every finding against the final
   source, runs the tooling, and writes `contracts/audit/2026-09-12-signoff.md` with a
   per-finding closed/open table. Deployment is allowed only when no Critical/High/Medium is
   open.
4. **Application perimeter re-check** (parallel): a fourth agent re-verifies the off-chain trust
   points in the Scope table against the Operations checklist and writes
   `web/audit/2026-09-12-perimeter.md`.

## Definition of done

```
cd contracts && npm test                       # all suites green, including test/audit
npx solhint 'contracts/BankRockRegistry.sol' 'contracts/aqua/XYCSwapTaker.sol'   # 0 errors
node scripts/export-abi.js && git diff --exit-code contracts/abi mcp/registry-abi.ts web/src/lib/chain/abi/registry.ts
test -f contracts/audit/2026-09-12-signoff.md && ! grep -E "^\| (Critical|High|Medium) \|.*\| open" contracts/audit/2026-09-12-signoff.md
```

Manual: open the verified source on Etherscan, read `describeRock(1)`, and confirm every
Write-tab field is self-explanatory without the README.

---

# Part 4 — Pre-mainnet

**Decision.** Everything below is acceptable on Ethereum Sepolia and is **not** acceptable on a
network where a rock id or a Rock Account balance is worth something. None is a defect today; each
is a property that only becomes load-bearing once value is involved. The list is the sign-off's and
`2026-09-12-changes.md` §5's, restated here so that deferring is a decision with an owner rather
than an omission. It is mirrored in [`../DEMO-STATE.md`](../DEMO-STATE.md) under the same heading.

## 4.1 Mandatory before a value-bearing deployment

| # | Item | Why it can wait on Sepolia | What the change is |
| --- | --- | --- | --- |
| PM-1 | **`bytes32 action` in the attestation (`F-21`)** | the signed struct says *what* (rock, tag, counter) and *who* (subject, account) but never *which call*, so one signature satisfies both attested functions wherever its field checks happen to pass. Today `subject` is the same person on both paths and the counter is consumed either way, so the impact is nil | add `bytes32 action` to `ATTESTATION_TYPEHASH` with `keccak256("AWAKEN")` and `keccak256("CLAIM")`, and check it in `awakenRock` and `claimHandover`. It is a type-hash change: the three ABI copies, the signer, and every attestation in flight at the moment of the switch |
| PM-2 | **A second, independent verifier for the attester key** | the registry trusts exactly one address, rotatable by one administrator, and that key lives on a web server. Since D-032 it signs what amounts to a transfer of title *and* the choice of controlling account | a threshold scheme, or an attester contract implementing `isValidSignature`. `setAttester` can already point at a contract; `_consumeAttestation` would move from `ECDSA.tryRecover` to `SignatureChecker` |
| PM-3 | **One reviewer pass over the combined change** | the sign-off's last condition. `N-1`'s on-chain half and `N-6` landed after it was written, so no cold reader has yet re-checked them together | one agent, cold, re-checks `8a93e21` and `42f2190` against Part 1.2 and updates the sign-off in place |

## 4.2 Strongly recommended

| # | Item | Note |
| --- | --- | --- |
| PM-4 | **An external audit of the vendored Aqua sources** | this review covered *integration* risk only — how our contracts call Aqua and what it calls back — which is what the Scope section asks for. `Aqua` and `XYCSwap` themselves were not reviewed, and a value-bearing deployment rests on both |
| PM-5 | **The relayer perimeter as an operator-cost control (`F-10`, `P-1`)** | the claimable pre-check, the per-rock bucket, the fail-closed limiter and `RELAYER_DAILY_CAP_WEI` have all landed. It becomes *mandatory* rather than recommended the moment the relayer key holds a real balance |
| PM-6 | **Restate `archiveRock`'s terminality in the interface** | a retired rock cannot be revived. The tag can awaken a new rock id and the old record stays readable, but where a rock id carries value the owner must be told this in the UI, not only in the NatSpec |

## 4.3 Explicitly accepted at any value

- **Mis-sent tokens are lost** (`F-5`). A rescue function is an admin key on the trade path, which
  is a larger risk than the mistake it recovers from. Written on `XYCSwapTaker.sol` itself.
- **`Handover` will not gain fields** (`F-23`). Pinned in the source; a future field goes in a new
  view, not in the struct.
- **Function names stay as they are** (`F-19`). The plain English lives in the `@notice`.
- **A counterfactual Rock Account cannot be bound on claim** (D-032). Intended: an address that has
  never executed anything cannot be shown to answer to anybody.
