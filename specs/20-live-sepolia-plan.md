# Next batch — going live on Sepolia

## Purpose

Branch `main` (everything below is merged to `main` as it
lands). The previous batch (`exit-from-demo-mode`) removed every fabricated value, rebuilt the UI
phone-first, rewrote and audited the contracts, and got the deploy pipeline green. What it could
not do is run anything against the world. [`../DEMO-STATE.md`](../DEMO-STATE.md) §3–§5 is the
list.

This batch has one goal: **turn DEMO-STATE §3, §4 and §5 from "unavailable" and "unproven" into
"real" for the demo path**, and prove it with a script that can be re-run after every deploy.
Everything else is polish and is ordered after that.

Status vocabulary as in [`15-exit-demo-mode.md`](./15-exit-demo-mode.md). Every work package
names an owner: **operator** (needs dashboards, keys or a physical rock) or **agent** (code).

## Status, 2026-09-12 evening (Fact)

| WP | State | Evidence |
| --- | --- | --- |
| WP-1 deploy and configure | **contracts done; secrets are the operator's** | Registry, XYCSwap and XYCSwapTaker deployed and verified on Sepolia Etherscan (`contracts/deployments/*.json`, `contracts/scripts/verify.md`); addresses committed as Worker vars (D-034) and live: `/api/rocks/next-id` and `/api/rocks/1/activity` answer `REAL` on `bank-rock.com`. Left: spec 18 Part 2.2 (ownership acceptance, `www` rule, Privy, Pimlico, ten Worker secrets, funding, the tag) |
| WP-2 rehearsal script | **done — live run green on Sepolia, 2026-09-12 21:24 UTC** | `contracts/deployments/rehearsal-2026-09-12.md`; five steps, eleven transactions, every assertion passed |
| WP-3 physical rock | not started (operator) | needs `NXP_MASTER_KEY` on the Worker and on the tag |
| WP-4 demo rehearsal | not started | after WP-3 |
| WP-8 keeper | **done — deleted** (D-035) | commit 5316889 |
| WP-12 post-gift owner actions (new, found by WP-2) | in progress | D-037 |
| WP-5, 6, 7, 9, 10, 11 | not started, in that order of value | Part 2 |

Decisions taken while executing: D-033 (Sepolia only), D-034 (configuration model), D-035
(keeper deleted), D-036 (public RPC acceptable), D-037 (post-gift Rock Account is the registry's).

---

## Part 1 — Blocking chain (in order; each unlocks the next)

### WP-1 · Deploy and configure (operator, agent assists) — DEMO-STATE §3, §4

Follow [`18-demo-readiness.md`](./18-demo-readiness.md) Part 2 exactly. The order that the
dependencies allow:

1. ~~Wallets: generate deployer, faucet, relayer, attester; fund the first three.~~ **Done** —
   a throwaway deployer (0.05 ETH from a faucet was enough for all three contracts), the attester,
   the relayer and the faucet keys were generated in the deploying session. The relayer and faucet
   still need funding (spec 18 Part 2.2 step 8).
2. ~~`cd contracts && npm run deploy`~~ **Done** — `contracts/deployments/sepolia.json`.
3. ~~`node scripts/deploy-aqua-app.js`~~ **Done** — `contracts/deployments/sepolia-aqua-app.json`.
   The script's Aqua identity probe was wrong (it expected `safeBalances` to return zeros for an
   unknown strategy; Aqua reverts with `SafeBalancesForTokenNotInActiveStrategy`) and now requires
   exactly that revert.
4. ~~Verify all three contracts~~ **Done** — `npm run verify:sepolia` (`contracts/scripts/verify.md`).
5. Worker `web` **secrets only** (D-034: every non-secret value is in `web/wrangler.jsonc`), the
   two GitHub inputs (`NEXT_PUBLIC_PRIVY_APP_ID` variable, `NEXT_PUBLIC_PIMLICO_API_KEY` secret),
   Privy origin + Sepolia, the Pimlico sponsorship policy for chain 11155111 restricted to the
   registry, the app, the taker, USDC and WETH, and the deletion of the `www` redirect rule with
   the literal `:path*`. Spec 18 Part 2.2 is the ordered list.
6. ~~Re-run the deploy workflow~~ **Done for the addresses** — the build of `bee767e` carries them
   and the registry reads are `REAL` on the apex. Re-run again after step 5 so the build picks up
   the two GitHub inputs; `bash scripts/check-live.sh` is the acceptance.

**Acceptance:** every line in DEMO-STATE §3 and §4 except K-9 (email) is deleted per the file's
own rule (condition actually met, not code written).

**Agent work inside WP-1 — delivered.** `scripts/check-live.sh` (run `bash scripts/check-live.sh`,
optionally with another origin as its first argument) curls `/`, `/r/1`, `/rock/1`, `/api/version`,
`/sw.js` and `/manifest.webmanifest` on the apex, follows `https://www.bank-rock.com` and requires
it to end at a 200 on the apex, then reads the configured chain out of `/api/version`. One
green/red line per check, non-zero exit on any red.

`web/src/app/api/version/route.ts` now reports, alongside the build stamp, the chain id, all six
contract addresses with the variable behind each one and the size of the code the RPC has at it
(read server-side per request), and the two deploy blocks. Public configuration only: no secret,
no key, no RPC URL, and an address that is unset or has no code is `UNAVAILABLE` with the reason.

Until the Worker's variables are set and the `www` redirect rule is deleted, the address lines and
the `www` line are red, which is the point of the script.

### WP-2 · Live rehearsal script (agent) — DEMO-STATE §5 P-2…P-5 — delivered

`web/scripts/rehearse-sepolia.ts`, run from `web/` as

```
npm run rehearse:sepolia -- --dry-run      # reads only; nothing is broadcast
npm run rehearse:sepolia                   # the live run
```

or from `.github/workflows/rehearse.yml` (`workflow_dispatch` only, never on push; it takes
`SEPOLIA_RPC_URL`, `PIMLICO_API_KEY`, `ATTESTATION_SIGNER_PRIVATE_KEY`, `RELAYER_PRIVATE_KEY` and
`REHEARSAL_FUNDER_PRIVATE_KEY` from repository secrets and uploads the report as an artifact).

It drives the whole acceptance path — awaken, fund and ship, visitor swap, named gift, archive and
re-awaken — with local test keys in place of Privy, reusing the app's own code throughout — `computeRockAccountAddress`, `signAttestation`, `encodeAwaken`, `buildShipCalls`,
`buildSwapCall`, `readStrategy`, `readAmountOutFromLogs`, `verifyAttestation`,
`submitSignedUserOp`, `submitClaimHandover` — so what is proven is the path the app takes.
Contract addresses come from `contracts/deployments/*.json`, never from a literal. Each step
prints its UserOperation and transaction hashes, asserts the state back off the chain, and the run
ends with the step/hash/sponsor/elapsed table; the first failed assertion exits non-zero. A
successful live run writes `contracts/deployments/rehearsal-<date>.md`.

Two deviations the script states in its own output rather than hiding:

- **the claim is driven through the library, not the route.** `POST /api/rocks/[id]/claim` needs a
  Privy bearer token to store the pre-signed owner swap and a D1 binding for it and for the daily
  spend cap. The script calls the same functions the route calls, in the same order — owner swap
  first, then `claimHandover` (D-032). The route's own guards (rate limits, cap reservation, the
  refusal of open gifts) stay unit-tested only, and DEMO-STATE P-10 stays open;
- **step 5 is Flow K after a gift, and it now follows the app exactly.** It used to be the one
  place the app could not be followed: `useBankRock` derived the Rock Account from (wallet, tag)
  and refused any other address, which after a gift is the giver's account and not the new owner's
  derivation (D-029), so the script archived from C's own funded wallet and printed the mismatch
  as a FINDING. **D-037 removed the FINDING by fixing the app**: for an awakened rock the account
  is the registry's and authority is that account's own answer to `isOwner`, so step 5 runs the
  same two checks `ownerClientFor` runs and sends `archiveRock` as a sponsored UserOperation from
  the rock's own account, signed by a recipient who has never held gas. What it still asserts
  rather than wishes away is the boundary: the *next* awakening has no account to read, so the tag
  awakens rock N+1 into the account its new owner derives, and the retired rock's reserve stays in
  the account she still owns (D-037 consequence 5).

**Acceptance (unchanged):** one green run on Sepolia; its report committed under
`contracts/deployments/rehearsal-<date>.md`; DEMO-STATE P-2…P-5 deleted, and P-11 with them —
step 5's sponsored retirement by the recipient is exactly its condition. Not met yet — this
sandbox has no funded keys and no Pimlico key, so only the dry run has been executed.

### WP-3 · The physical rock (operator) — DEMO-STATE P-1, W-1

Program the tag per spec 18 §4.2 with the master key that is in the Worker's `NXP_MASTER_KEY`.
Then, on a phone: tap → `Verified physical`; copy the URL to another browser → `Unverified`
(`stale_counter`); edit `c` → `invalid_cmac`. **This is the D-002 acceptance test and cannot be
waived.** The agent's part: read the Worker logs for the three attempts and confirm the counter
row advanced exactly once.

### WP-4 · Demo rehearsal (operator + agent)

Run spec 08's three-minute script end to end on the live site with two phones and one rock, using
Flow K (archive and start over) between takes. Time each beat; fix copy and ordering that slow it
down. The agent turns the findings into a `specs/08` amendment and the final `DEMO-STATE.md`.

---

## Part 2 — Parallel work (agents, no chain dependency)

| WP | What | Spec | Size |
| --- | --- | --- | --- |
| WP-5 | **Owner identity from Privy server-side.** Add `PRIVY_APP_SECRET` and resolve DID → wallet on the server so alerts, vanity, handover messages and pending owner swaps are owner-scoped, not "any signed-in account" (perimeter P-5 residual, P-13 squatting). | 05, 19 | M |
| WP-6 | **Alert delivery.** Indexed registry events and `Pushed` fee events → email (Resend, once the domain is verified) and Web Push (VAPID keys). Only real events, never synthetic. Preferences already persist. | 14, 15 Part 6 | M |
| WP-7 | **Second stream sharing one reserve** (`streamIndex 1`) with the position card listing streams and per-stream cash-in. | 04, 08 strong target | S |
| WP-8 | ~~**Keeper decision.**~~ **Done — deleted** (D-035): `web3-functions/`, `/api/keeper`, `lib/aqua-keeper.ts`, the alert topic, the MCP tool. | 15 X-7 | done |
| WP-9 | **Spec 17 leftovers.** Mount the A2HS banner on `/rock/*`; "Offline — showing cached state" indicator (spec 14 §4); swipe-to-dismiss on the bottom sheet; measure the Lighthouse budget on the public deployment and record it (W-2). | 14, 17 | S |
| WP-10 | **CI gates.** Branch protection on `main`: CI green + one PR review required, no direct pushes (the logo commit went to `main` around the gates). The responsive job gets a chain (registry address as a CI variable) so items 7–8 stop skipping. | 12, 17 U4 | S |
| WP-11 | **Perimeter lows** still open: P-9, P-12, P-16, P-17 (see `web/audit/2026-09-12-perimeter.md`). | 19 | S |
| WP-12 | **Post-gift owner actions** (found by the WP-2 dry run). For an awakened rock the app must use the registry's `smartAccount` and ask that Safe `isOwner(wallet)`, instead of re-deriving the account from (wallet, tag) and refusing the mismatch — otherwise the recipient of a gift can never archive, ship, dock or re-gift from the app. **Blocks Flow K after Flow E and therefore the stage restart after the gift beat.** | 02 Flows E/K, 09 D-037 | M |
| WP-14 | **Balance and ship** (spec 21, D-038, D-039): one-token deposits convert against a house stream inside the ship operation; embedded-wallet signatures silent. Operator part: fund and ship the house stream. | 21 | M |
| WP-13 | **Dependency alignment.** `web/.npmrc` `legacy-peer-deps=true` masks a peer conflict introduced by a direct `ox ^1.7.4` dependency (commit c189e5a) that nothing imports; `permissionless` wants `ox ^0.8`. Remove the direct `ox` dependency (or pin `^0.8.9`), delete `.npmrc`, regenerate the lockfile, and prove `npm ci` passes without the override. | 12 | S |

---

## Part 3 — Deliberately not in this batch

| Item | Why | When |
| --- | --- | --- |
| `bytes32 action` in the attestation (F-21) and the single reviewer pass over it | ABI change to a contract about to be deployed for the demo; the sign-off requires it only before a value-bearing network | First post-hackathon PR, before any mainnet |
| Session keys, token paymaster, idle yield (DEMO-STATE N-4…N-6) | Cut by spec 15 Part 6 | Post-hackathon roadmap (spec 13) |
| Cross-chain deposit becoming real (S-1) | No bridge integration in scope | Post-hackathon |

---

## Part 4 — Order and estimate

```
WP-1 step 5 (operator: secrets, Privy, Pimlico, www rule — one sitting with the dashboards)
  └─ WP-2 live run (agent, minutes once the keys exist; the report is the proof)
       └─ WP-3 (operator, one evening with the rock)
            └─ WP-4 (both, one rehearsal session)
WP-12 now (agent; must land before WP-4 because the restart after the gift depends on it)
WP-13, WP-5, WP-7, WP-9, WP-6, WP-11, WP-10 afterwards, in that order, each on its own branch
```

Definition of done for the batch: DEMO-STATE has no lines left in §3 and §5, §4 holds only K-9,
`scripts/check-live.sh` is green against `bank-rock.com`, and the rehearsal report is committed.
