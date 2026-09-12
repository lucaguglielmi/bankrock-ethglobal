# Next batch — going live on Sepolia

## Purpose

Branch `live-sepolia`. The previous batch (`exit-from-demo-mode`, merged to `main` at `de0412b`)
removed every fabricated value, rebuilt the UI phone-first, rewrote and audited the contracts,
and got the deploy pipeline green. What it could not do is run anything against the world: no
contract is deployed, no secret is set, no tag is programmed, and every UserOperation path exists
only in tests. [`../DEMO-STATE.md`](../DEMO-STATE.md) §3–§5 is the list.

This batch has one goal: **turn DEMO-STATE §3, §4 and §5 from "unavailable" and "unproven" into
"real" for the demo path**, and prove it with a script that can be re-run after every deploy.
Everything else is polish and is ordered after that.

Status vocabulary as in [`15-exit-demo-mode.md`](./15-exit-demo-mode.md). Every work package
names an owner: **operator** (needs dashboards, keys or a physical rock) or **agent** (code).

---

## Part 1 — Blocking chain (in order; each unlocks the next)

### WP-1 · Deploy and configure (operator, agent assists) — DEMO-STATE §3, §4

Follow [`18-demo-readiness.md`](./18-demo-readiness.md) Part 2 exactly. The order that the
dependencies allow:

1. Wallets: generate deployer, faucet, relayer, attester; fund the first three (spec 16 Part 3).
2. `cd contracts && npm run deploy` → registry address + deploy block. Record
   `contracts/deployments/sepolia.json` in git.
3. `node scripts/deploy-aqua-app.js` → app + taker addresses + deploy block. Record
   `contracts/deployments/sepolia-aqua-app.json`.
4. Verify all three contracts on Sepolia Etherscan (`contracts/scripts/verify.md`) so the Read
   and Write tabs work for the demo.
5. Worker `web` secrets and variables (Cloudflare dashboard, spec 16 §2.2 target names), the
   D1 binding is already in `wrangler.jsonc`. Privy: origin + Sepolia. Pimlico: sponsorship policy
   for chain 11155111 restricted to the registry, the app, the taker, USDC and WETH. Delete the
   `www` redirect rule with the literal `:path*` (the app redirects now).
6. Re-run the deploy workflow; then `curl https://bank-rock.com/api/version` shows a new stamp
   and `/r/1` returns 200.

**Acceptance:** every line in DEMO-STATE §3 and §4 except K-9 (email) is deleted per the file's
own rule (condition actually met, not code written).

**Agent work inside WP-1:** a `scripts/check-live.sh` that curls the live routes and reads the
registry, app and taker addresses from the deployed site's `/api/version` (extend it to report
the configured addresses and their `eth_getCode` sizes), so the operator sees green/red per
DEMO-STATE line without opening a dashboard.

### WP-2 · Live rehearsal script (agent) — DEMO-STATE §5 P-2…P-5

`web/scripts/rehearse-sepolia.mjs`: drives the whole acceptance path against the deployed
contracts **with local test keys instead of Privy** (Privy cannot be scripted; the on-chain and
Pimlico paths are identical). Steps, each printing a tx hash and asserting on-chain state:

1. Sign an attestation locally with the attester key for a synthetic tag (`uidHash`, counter n+1)
   naming subject A and A's per-tag Safe → sponsored UserOp `awakenRock` from that Safe → assert
   `getRock` owner and account.
2. Fund the Rock Account with USDC/WETH from the operator wallet → `shipStrategy` batch → assert
   `safeBalances` and the `Shipped` event.
3. From taker B's personal Safe: approve + `XYCSwapTaker.swapExactIn` → assert both balances
   moved and the `Pushed` fee slice.
4. A initiates a named handover to C with the pre-signed owner swap stored via the app's route →
   C's attestation → the app's relayed claim route (owner swap first, then claim) → assert the
   Safe's owner is C and the registry owner is C.
5. C archives → the same synthetic tag awakens rock N+1 with the same Rock Account address.
6. Print a table: step, tx hash, gas sponsor, elapsed. Exit non-zero on any assertion.

Runs from CI on `workflow_dispatch` only (needs funded keys as repository secrets) and by hand
after every deploy. **Acceptance:** one green run on Sepolia; its output committed under
`contracts/deployments/rehearsal-<date>.md`; DEMO-STATE P-2…P-5 deleted.

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
| WP-8 | **Keeper decision.** Delete `web3-functions/` and the keeper surface (recommended: it is DEMO forever and adds a badged beat nobody needs), or rewrite it against the real registry and Aqua. One decision, then one PR. | 15 X-7, DEMO-STATE W-3 | S |
| WP-9 | **Spec 17 leftovers.** Mount the A2HS banner on `/rock/*`; "Offline — showing cached state" indicator (spec 14 §4); swipe-to-dismiss on the bottom sheet; measure the Lighthouse budget on the public deployment and record it (W-2). | 14, 17 | S |
| WP-10 | **CI gates.** Branch protection on `main`: CI green + one PR review required, no direct pushes (the logo commit went to `main` around the gates). The responsive job gets a chain (registry address as a CI variable) so items 7–8 stop skipping. | 12, 17 U4 | S |
| WP-11 | **Perimeter lows** still open: P-9, P-12, P-16, P-17 (see `web/audit/2026-09-12-perimeter.md`). | 19 | S |

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
WP-1 (operator, ~half a day of dashboards and two deploys)
  └─ WP-2 (agent, 1 day; first green run needs WP-1 done)
       └─ WP-3 (operator, one evening with the rock)
            └─ WP-4 (both, one rehearsal session)
WP-5, WP-6, WP-7, WP-8, WP-9, WP-10, WP-11 in parallel on their own branches off live-sepolia
```

Definition of done for the batch: DEMO-STATE has no lines left in §3 and §5, §4 holds only K-9,
`scripts/check-live.sh` is green against `bank-rock.com`, and the rehearsal report is committed.
