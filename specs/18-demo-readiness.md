# Demo readiness

## Purpose

[`15-exit-demo-mode.md`](./15-exit-demo-mode.md) says what must stop being simulated.
[`16-environment-and-secrets.md`](./16-environment-and-secrets.md) says what must be provisioned.
This document says **what is still missing, right now, to run the three-minute demo in
[`08-mvp-and-demo.md`](./08-mvp-and-demo.md) end to end on a physical rock.**

State of the tree: branch `exit-from-demo-mode`, HEAD `11d6817` ("XYCSwap strategy encoding,
taker periphery, tests and deploy script"), with an uncommitted working set. Uncommitted files are
treated as real. `bash scripts/spec-checks.sh` runs 20 checks and is blocking in CI; run it before
reading anything below as done, because an in-flight edit can turn one red.

*(Sections 1, 3 and 6 were refreshed against that tree. Sections 2, 4 and 5 — operator blockers,
the tag, and what is simulated on demo day — are unchanged except where a decision made them
factually wrong.)*

Vocabulary is spec 15 Part 3: `REAL` / `DEMO` / `UNAVAILABLE`, plus **`not implemented`** for a
capability with no code path at all.

---

# Part 1 — The demo path, step by step

Beats are spec 08's three-minute script. "Today" is the state with every secret set and every
contract deployed — i.e. what the *code* can do, not what the environment currently allows.

| # | Beat (spec 08) | Capability | Today | What is missing |
| --- | --- | --- | --- | --- |
| 1 | 0:00 Tap the rock, page opens | Tag URL resolves | **REAL** | Cloudflare `www` redirect still returns 308 to a literal placeholder (R-1); the tag has never been programmed (Part 4). `/r/[id]` preserves the query and deliberately does not verify — verifying on a redirect would burn the tap's counter. |
| 2 | 0:00 "Verified Physical" badge | NFC attestation | **REAL (needs config)** | `NXP_MASTER_KEY` and `ATTESTATION_SIGNER_PRIVATE_KEY` unset; **never tested against a physical tag**, which is the one thing code cannot settle. F-7 is closed: the judge switcher has no callback that could set the badge, and it renders only under the flag. |
| 3 | 0:00 AR view | WebXR | **not implemented** | Cut by spec 15 Part 6. The opening beat is rewritten without it (spec 08). Do not demo it. |
| 4 | 0:25 Privy sign-in, fresh browser | User identity | **REAL (needs config)** | `NEXT_PUBLIC_PRIVY_APP_ID` + the dashboard origin/chain config (spec 16 #1). The fabricated wallet is gone (A-1, A-2) and the hook-order crash is fixed (X-1). |
| 5 | 0:55 Rock state, owner, Rock Account | Registry reads | **REAL (needs deploy)** | The registry is not deployed. The contract, the deploy script, the exported ABI, `web/src/lib/chain/abi/registry.ts` and `mcp/registry-abi.ts` are all current and CI fails on a stale copy of any of them. |
| 6 | 0:55 Awaken: Safe deployed, sponsored | ERC-4337 Rock Account | **REAL (needs deploy + Pimlico)** | Registry address and a Pimlico sponsorship policy for chain 11155111. There is no separate "create the Safe" step: the address is counterfactual, salted by the tag (D-029), signed into the attestation, and deployed by the first sponsored UserOperation. |
| 7 | 0:55 Fund: faucet + USDC/WETH | Funding | **REAL (ETH), manual (tokens)** | `FAUCET_PRIVATE_KEY` unset and unfunded. USDC/WETH have no in-app faucet: claim from Circle by hand to the Rock Account address (spec 16 Part 3). |
| 8 | 0:55 Ship the Aqua strategy | Aqua strategy | **REAL (needs deploy)** | `NEXT_PUBLIC_AQUA_APP_ADDRESS` from `scripts/deploy-aqua-app.js`. **E-4 is resolved** — the strategy is `abi.encode(XYCSwap.Strategy)` with the rock id in the salt, pinned by matching tests in TypeScript and Solidity (D-030). This was the highest-risk item in the project; it is no longer open. |
| 9 | 0:55 Show actual vs virtual balances | Reserves | **REAL (needs deploy)** | App address. `lib/aqua/read.ts` reads actual, virtual and *executable* separately and never sums virtual balances; `safeBalances` reverting is handled as "not shipped", not as an error. No APY anywhere (D-004). |
| 10 | 1:35 Second user swaps against the rock | Visitor swap | **REAL (needs deploy)** | App **and** taker addresses. The visitor trades from a personal Safe (salt 0) through `XYCSwapTaker`, because the app calls back into its caller and a plain wallet cannot answer (D-030). Quote from `XYCSwap.quoteExactIn`; the 1inch API path is deleted. |
| 11 | 1:35 Fee accounting after the swap | Earned fees | **REAL (needs deploy + RPC)** | App address, `AQUA_APP_DEPLOY_BLOCK` and a provider RPC for the log range. The rate is `feeBps` from the strategy; the cumulative figure is summed from `Pushed` events, excluding the ship's own two. It is `UNAVAILABLE` when the log range cannot be served — never derived from balance deltas (D-030). |
| 12 | 2:10 Hand the rock over, zero gas | Ownership transfer | **REAL (needs deploy + relayer)** | Registry address, `RELAYER_PRIVATE_KEY` funded, Pimlico policy. Give sheet → `initiateHandover` + the pre-signed owner swap; tap → relayed `claimHandover` → stored swap submitted (D-027). An **open** handover cannot pre-sign the swap, and the UI says so. |
| 13 | 2:30 MCP reads the rock | MCP tools | **REAL (partial)** | `SEPOLIA_RPC_URL` + the registry address in the agent's MCP `env` block. Read-only by design (D-008, D-019): the "agent ships a strategy" beat is not implemented and must not be claimed. |
| 14 | Acceptance test 2 — inspect without logging in | Public rock page | **REAL (needs deploy + RPC)** | `REGISTRY_DEPLOY_BLOCK`. The indexer scans forward from it in 2,000-block chunks, reads each block's own timestamp, and uses the current vocabulary — `HandoverClaimed` and `RockArchived`, not the removed `RockOwnershipTransferred` (X-5, C-3). |
| 15 | Acceptance test 5 — tag ≠ ownership | Security story | **REAL** | Nothing. The registry gates claiming and never spending; the lost flag freezes nothing and is documented as informational; no client path can paint the badge. The claim is now true on stage — but it is only *demonstrated* by the copied-URL test, which needs a programmed tag. |

**What changed since this table was first written:** every row that read "not implemented" now has
a code path. Nothing on this list is blocked on writing code; the remaining blockers are a
deploy, a dashboard, a faucet, or a physical tag.

---

# Part 2 — Blockers only the operator can clear

Dependency order. Nothing below is code work; all of it is a dashboard, a faucet or a shell.

| # | Action | Where / command | Blocks |
| --- | --- | --- | --- |
| 1 | Fix the `www` redirect rule (unsubstituted `:path*`) | Cloudflare dashboard → Rules → Redirect Rules (R-1) | Everything; `curl -sIL https://www.bank-rock.com` must end 200 |
| 2 | Create the Privy app; allowed origin `https://bank-rock.com`; enable email + passkey/Google; enable Sepolia; set it **first** in the chain list | dashboard.privy.io → `NEXT_PUBLIC_PRIVY_APP_ID` | Beat 4 (spec 16 #1) |
| 3 | Create a Sepolia RPC app | Alchemy/Infura → `SEPOLIA_RPC_URL` | Indexer, MCP, deploy (spec 16 #4) |
| 4 | Generate secrets | `openssl rand -hex 16` → `ADMIN_PASSWORD`; `-hex 32` → `ADMIN_JWT_SECRET`, `ADMIN_API_KEY`, `CRON_SECRET`; `-hex 16` → **`NXP_MASTER_KEY`** (16 bytes = 32 hex chars, `lib/nfc/config.ts` enforces it) | Admin, cron, NFC |
| 5 | Generate three fresh keys | deployer, faucet, attester (`DEPLOYER_PRIVATE_KEY`, `FAUCET_PRIVATE_KEY`, `ATTESTATION_SIGNER_PRIVATE_KEY`). Never reuse across roles. | Deploy, faucet, attestation |
| 6 | Fund deployer **0.3 ETH**, faucet **1.0 ETH**; attester stays at 0 | Google Cloud Web3 faucet, Alchemy faucet, ETHGlobal faucet. Most gate on a mainnet balance — **start days early** (spec 16 Part 3) | Deploy + 100 awakenings @ 0.01 ETH |
| 7 | Deploy the registry | `cd contracts && npm ci && npm run compile && SEPOLIA_RPC_URL=… DEPLOYER_PRIVATE_KEY=0x… ATTESTATION_SIGNER_ADDRESS=0x… npm run deploy` → writes `contracts/deployments/sepolia.json`, prints `NEXT_PUBLIC_REGISTRY_ADDRESS` and `REGISTRY_DEPLOY_BLOCK` | Beats 5, 6, 12, 13 |
| 8 | Verify the source on Sepolia Etherscan | `contracts/scripts/verify.md` | Judge trust |
| 9 | Create the Pimlico API key **and a sponsorship policy for chain 11155111**; restrict the public key by origin | dashboard.pimlico.io → `PIMLICO_API_KEY`, `NEXT_PUBLIC_PIMLICO_API_KEY`. Without the policy the verifying paymaster rejects **every** UserOp. | Beats 6, 12 (zero-gas claim) |
| 10 | Deploy the Aqua app and the taker periphery — **not** a SwapVM router (D-030) | `cd contracts && SEPOLIA_RPC_URL=… DEPLOYER_PRIVATE_KEY=… NEXT_PUBLIC_AQUA_ADDRESS=0x1111113ccf1426a8e30e2bff5e005d929bf6a90a node scripts/deploy-aqua-app.js` → `NEXT_PUBLIC_AQUA_APP_ADDRESS`, `NEXT_PUBLIC_AQUA_TAKER_ADDRESS`, `AQUA_APP_DEPLOY_BLOCK`. Aqua itself is never deployed; the script refuses to continue if that address has no code. | Beats 8, 10, 11 |
| 10a | Generate and fund the **relayer** key (D-027) | `RELAYER_PRIVATE_KEY`, ~0.2 ETH. Unset ⇒ gift claims are UNAVAILABLE, never free. | Beat 12 |
| 11 | Claim **20 USDC / 2 h / address** to each Rock Account Safe and to the taker wallet | `faucet.circle.com` or `ethglobal.com/faucet/sepolia-11155111-usdc` | Beats 7, 10 |
| 12 | Wrap ETH → WETH: 0.01 per rock, 0.005 for the taker | `deposit()` on `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14` | Beats 7, 10 |
| 13 | Verify `bank-rock.com` in Resend (SPF + DKIM); set `ALERT_FROM_ADDRESS`, `ALERT_EMAIL_ADDRESS` | resend.com (E-6) | Alerts only — **cuttable** |
| 14 | Set every variable on the Pages project (Settings → Environment variables), **not** in a file; `NEXT_PUBLIC_DEMO_MODE=false` for production | Cloudflare dashboard; `web/.env.example` is the authoritative list | Deploy |
| 15 | Create the Cloudflare API token (Pages + D1 edit) and add `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` as GitHub secrets | `.github/workflows/deploy.yml` fails early without them | CI deploy |
| 16 | Apply D1 migrations to production | `cd web && npm run db:migrate:prod` — `drizzle/0003_gifted_boomer.sql` creates `nfc_counters`, `faucet_ip_claims`, `alert_preferences`, `contact_requests` | Replay protection, faucet limits |
| 17 | **Program the tag** (Part 4) | NXP TagWriter / TagXplorer | Beats 1–2 |

---

# Part 3 — Blockers that are code work

**There are none left that block the demo path.** Every C-item below has landed; the two that
remain open are verification work, not demo work. Kept in full because the list is how the work
was tracked, and a "done" with nowhere to check it is not a claim.

| # | Work | Spec phase | Status |
| --- | --- | --- | --- |
| C1 | Regenerate `web/src/lib/chain/abi/registry.ts` from the compiled contract | 15 P2.1 | **done** — and CI fails on a stale copy, in `contracts/abi`, the web module and `mcp/registry-abi.ts` alike |
| C2 | Rewrite `hooks/useBankRock.ts` against the new ABI | 15 P2.4 | **done** — `awakenRock(rockId, smartAccount, att, sig)`, `initiateHandover`, `claimHandover`, `cancelHandover`, `archiveRock`, `markLost`, `clearLost`, plus `shipStrategy` / `dockStrategy` |
| C3 | Fix `lib/indexer.ts` event names | 15 P2.5 | **done** — `HandoverClaimed` and `RockArchived`; deploy-block start, 2,000-block chunks, real block timestamps |
| C4 | Wire an awaken path: Safe, Pimlico sponsorship, attestation → `awakenRock` | 15 P2.3 | **done** — through `lib/rock-account.ts` + `useBankRock`, not `lib/aa.ts`; the Safe is counterfactual and deploys itself on first use |
| C5 | **Ship an Aqua strategy** (E-4, the highest-risk item) | 15 P3.1–3.3 | **done** — reference `XYCSwap` app, `abi.encode(Strategy)` with a rock-id salt, `contracts/test/aqua/*.t.sol` and `lib/aqua/*.test.ts` pinned to the same literals (D-030) |
| C6 | **Visitor swap path** | 15 P3.4, P3.7 | **done** — `XYCSwapTaker` periphery + `useTakerActions`; quote from `XYCSwap.quoteExactIn`; the Base-mainnet literals and fake balances are gone |
| C7 | Read `safeBalances` (virtual) alongside `balanceOf` (actual), never summed | 15 P3.5 | **done** — plus *executable*, the third number a shared reserve needs (`SharedReserve.t.sol`) |
| C8 | Migrate `rock-interface.tsx` | 15 P1.3/4/5/9 | **done** — synthesized hashes, owner and account literals, `currentApy`, the `1250.0` fallbacks all gone; the switcher is flag-gated and powerless |
| C9 | Same for `cross-chain-modal.tsx` and `aqua-position-card.tsx` | 15 P1.3/5 | **done** — no synthesized hashes, no mainnet literals, no `Est. APR` |
| C10 | Handover UI: give → `initiateHandover`; tap → `claimHandover`; ENS handling | 15 P2.1 / Flow E | **done** — plus the pre-signed owner swap, which the original item did not anticipate (D-027) |
| C11 | Fix the `privy-onboarding-modal.tsx` hook-order crash (X-1) | 15 P0.3 | **done** |
| C12 | Spec 17 **U0** typography foundation | 17 U0 | **done** |
| C13 | Spec 17 **U1** frame and chrome | 17 U1 | **done** — `L-1a` passes; no viewport-height utilities remain |
| C14 | Spec 17 **U2** sheets and controls | 17 U2 | **done** — one `Sheet` primitive, no per-modal scroll locks, no drag thresholds |
| C15 | Spec 17 **U3** per-surface pass | 17 U3 | **done** — `T-5a`, `T-5b`, `T-7`, `T-8` all pass |
| C16 | Spec 17 **U4** — make `spec-checks` blocking, add the viewport matrix | 17 U4 | **done** — the job is blocking, and `e2e-responsive` runs Playwright + `axe-core` over the route × viewport matrix. Two caveats: it configures no chain, so the checks needing a live rock skip with a reason; and the Lighthouse budget (item 10) stays manual |
| C17 | Contract tests for `archiveRock` and the ABI re-export | 15 P2.1 | **done** |
| C18 | Phase 5 perimeter: authenticate `/api/telemetry`, `/api/alerts*`, `/api/keeper` | 15 P5 | **done** — header secrets and Privy-token identity, fail-closed (D-017); `D-017` passes |

**Open, and it does not block the demo:** the second strategy sharing one reserve (spec 04,
spec 15 P3.8). Unblocked — it is one more `streamIndex` — but not shipped, and it is item 4 in
spec 08's fallback order anyway.

**Open, and cannot be closed by code:** the SDM implementation has never met a physical tag. That
is the single largest unverified claim in the project, and Part 6 step 10 is where it is settled.

---

# Part 4 — The NFC tag

## 4.1 What to write

One URL, once. Path fixed forever; `e` and `c` are rewritten by the chip on **every tap**.

```
https://bank-rock.com/r/{publicRockId}?e=00000000000000000000000000000000&c=0000000000000000
```

Confirmed against the tree, not assumed:

| Element | Value | Evidence |
| --- | --- | --- |
| Path | `/r/{publicRockId}` — a decimal integer, because the attestation signs `rockId` as a `uint256` | `web/src/app/r/[id]/page.tsx`; `lib/nfc/attestation.ts` `parseRockId` rejects anything but `^[0-9]+$` |
| `e` | encrypted PICCData, **32 hex chars** (16 bytes). Alias `picc_data` accepted | `lib/nfc/verify.ts` `isHex(e, PICC_DATA_LENGTH)`, `PICC_DATA_LENGTH = 16` |
| `c` | truncated SDM CMAC, **16 hex chars** (8 bytes). Alias `cmac` accepted | `isHex(c, SDM_MAC_LENGTH)`, `SDM_MAC_LENGTH = 8` |
| `enc` | optional SDMENCFileData. **Do not enable it** — with it absent the CMAC input is the empty string, which is what the verifier defaults to | `lib/nfc/sdm.ts` `verifySdm`: `macInput = … : Buffer.alloc(0)` |
| `uid`, `ctr` in the URL | ignored on purpose — both live inside the encrypted PICCData | `actions/verify-ntag.ts` doc comment |

## 4.2 SDM settings (TagWriter / TagXplorer)

1. **NDEF file (File 02), SDM enabled**, `UID mirroring` and `SDM read counter` both **inside the
   encrypted PICCData** — not as separate cleartext mirrors. The verifier requires
   `PICCDataTag == 0xC7` (bit 7 UID mirrored, bit 6 counter mirrored, RFU bits zero, UID length 7);
   anything else is rejected as `invalid_picc_data` (`sdm.ts` `parsePiccData`).
2. **No SDMENCFileData / encrypted file data mirror.** See `enc` above.
3. **Keys.** Write the same AES-128 key — the value of `NXP_MASTER_KEY` — to **both**:
   - `SDMMetaRead` → the key that encrypts PICCData (`metaReadKey`, defaults to the master key);
   - `SDMFileRead` → the key that keys the CMAC (`fileReadKey`, defaults to the master key).
   `SDMMetaRead` must be a key slot, never `Eh` (plain) or `Fh` (disabled): plain metadata means
   no `e` parameter and the verifier has nothing to decrypt.
   `SDMCtrRet` can stay disabled (`Fh`).
4. **Diversification: OFF.** `lib/nfc/config.ts` only diversifies when `NXP_KEY_DIVERSIFY=true`,
   and the implemented input is AN10922 `D = 0x01 || "BankRock" || UID`. Keep it off for the
   hackathon and leave `NXP_KEY_DIVERSIFY` unset; the batch master key is used directly. (Spec 15
   Part 5 accepts batch-level keying and defers per-tag diversification.)
5. **Access rights.** NDEF file: Read = `Eh` (free — a phone must read it without authentication);
   Write / ReadWrite / Change = the app master key (`00h`), so nobody can rewrite the URL.
6. **Offsets.** `PICCDataOffset`, `SDMMACInputOffset` and `SDMMACOffset` are byte offsets into the
   NDEF URI record payload. Do not compute them by hand: write the URL **with the zero
   placeholders above** and TagWriter/TagXplorer derive each offset from the position of its
   placeholder. With no encrypted file data, `SDMMACInputOffset == SDMMACOffset`, which is exactly
   the empty-MAC-input case the verifier implements.
7. **Counter.** Leave `SDMReadCtrLimit` disabled. The registry requires the first accepted
   counter to be ≥ 1, so do not reset the counter to 0 after provisioning.

**With SDM, the URL is never reprogrammed.** The chip recomputes `e` and `c` on every read; the
path, the key and the offsets are written once. A copied URL carries a spent counter and is
rejected (`stale_counter`) by `lib/nfc/counter-store.ts` against D1 `nfc_counters`.

## 4.3 "Could the link spin up a new rock number every time?"

### (a) Why auto-allocating a rock per tap breaks the demo

- **Flow D dies.** A visitor must land on the *existing, funded, active* rock to trade with it
  (spec 02 Flow D steps 1 and 5). If tap #2 mints rock N+1, the second user opens an empty
  dormant rock: no reserve, no strategy, nothing to swap against. Spec 08 beats 1:35 and 2:10
  both fail.
- **Flow C dies.** "Inspect a rock" (balances, provenance, ownership history) is meaningless if
  the identity changes under the reader.
- **The registry forbids it anyway.** `_uidToRockId` binds one UID hash to one rock id;
  `awakenRock` reverts `UidBoundToDifferentRock(uidHash, boundRockId)` for a second id, and
  `RockAlreadyAwakened` for the same id. Ownership and history are per rock id.
- **It costs real resources.** Every fresh rock = one Safe deployment, one 0.01 ETH faucet claim
  (`app/api/faucet/route.ts`, capped at 3 per IP per 24 h) and a new Circle claim (20 USDC per
  address per 2 h) to a brand-new address.

### (b) The option that fits the specs — archive and start over

Spec 07 already lists `archived` as a rock state. **This has just landed in the contract**
(uncommitted, `contracts/contracts/BankRockRegistry.sol`):

- `RockState.Archived`, `error RockIsArchived`, `event RockArchived(rockId, by, uidHash)`;
- `archiveRock(uint256 rockId)` — owner-only, cancels any pending handover, sets `Archived`,
  and **`delete _uidToRockId[uidHash]`**, so `rockIdForUid` returns 0 and the next `awakenRock`
  may bind that UID to a *different* rock id;
- `lastCounter(uidHash)` is deliberately **not** reset — replay protection follows the tag, so an
  attestation captured before archiving cannot be replayed against the successor rock;
- no `unarchive`: the old rock stays readable through `getRock` as history.

**Status update (D-028): the surrounding work has since landed too.** The web ABI carries
`archiveRock`; the verifier resolves the effective rock (`bound` / `url` / `next_free` /
`registry_unavailable`) and signs the attestation for it; `/r/[id]` stays a redirect on purpose,
because resolving there would advance the counter and burn the tap; and the owner menu has the
retire control behind a confirmation. The table below is kept as the record of what was missing
when the question was first asked.

| Layer | Missing (as of the original review) |
| --- | --- |
| Contract | **done** while this document was being written: `archiveRock` tests are in `contracts/test/BankRockRegistry.t.sol`, and `contracts/abi/BankRockRegistry.json` + `mcp/registry-abi.ts` both carry `archiveRock` |
| Web ABI | `web/src/lib/chain/abi/registry.ts` predates the whole rewrite — it has no `archiveRock` at all (C1) |
| API | a route that, on a tap whose `rockIdForUid` is 0 while the path id is `Archived`, allocates the next free rock id and redirects there. Table `nfc_tags(uid, rock_id, last_counter)` already exists in `lib/db/schema.ts` and is the natural home for "which rock id is this tag currently on" |
| Route | `web/src/app/r/[id]/page.tsx` redirects blindly to `/rock/{id}`. It must resolve the *active* rock for the tag so the fixed path keeps working after an archive — otherwise the tag points at an archived rock forever |
| UI | one owner-only control ("Retire this rock and free the tag", with a confirm), plus a demo-mode shortcut in the judge switcher |

### (c) Zero-code fallback for rehearsals

Keep one rock id, never archive, and reset only the off-chain state between runs:
`NEXT_PUBLIC_DEMO_MODE=true` locally, `MemoryCounterStore` instead of D1 (already the rule in
`lib/nfc/counter-store.ts`: memory is selected only when the flag is on), and rehearse every beat
except the one-shot `awakenRock`. Costs nothing, proves nothing on-chain.

### Recommendation

**Rehearse with (c); (b) is shipped.** Phase 3 landed, and so did the archive path — so the
recommendation now reads: rehearse off-chain with (c), and keep (b) as the on-stage recovery
lever and the way to repeat the awakening beat on one tag (Flow K).

| | (a) new rock per tap | (b) archive and start over | (c) reset off-chain only |
| --- | --- | --- | --- |
| Flows C/D | broken | intact | intact |
| Code | large, and contradicts the registry | small: tests + ABI + one route + one button | none |
| Per run | Safe + 0.01 ETH + 20 USDC + a new address | same, per fresh rock | nothing |
| Faucet ceiling | 3 ETH claims/IP/24 h; 20 USDC/address/2 h | same | n/a |
| What judges see | a different rock every tap — the object stops being "the same rock", which is the product | one rock, with an owner-visible retirement in its history | one rock, stable |

The demo needs **one** successful awakening on stage, not many. Fund one Rock Account the night
before, rehearse against a second rock id, and keep `archiveRock` as the recovery lever if the
stage awakening has to be redone.

---

# Part 5 — What is still simulated on demo day (say it out loud)

Per spec 15 Part 8, plus what Part 1 above adds:

- **Cross-chain deposit** — `DEMO`, badged. No bridge is integrated (`cross-chain-modal.tsx`).
- **Keeper rebalancing** — `UNAVAILABLE` in the data layer: `lib/aqua-keeper.ts` invents nothing
  and can produce no transaction hash. The *surface* stays a badged `DEMO` beat because the Gelato
  function behind it targets an interface that does not exist (X-7).
- **Alert delivery** — `UNAVAILABLE`. Preferences persist; nothing dispatches (N-9).
- **Fiat on-ramp / off-ramp** (Flows G, H fiat legs) — out of scope per spec 08.
- **AR / WebXR view** — cut (spec 15 Part 6). It is beat 1 of the script: rewrite the opening.
- **Second strategy sharing one reserve** — spec 04 wants two; Phase 3 item 8 is last in line.
- **`dock` / Cash In** — real, and available from the owner menu once the app is deployed. Say
  what it does: docking *is* the withdrawal and moves no tokens, because the reserve never left
  the Rock Account (D-030, Flow H). Do not promise an incoming transfer.
- **Idle yield (Aave/Morpho), ERC-7579 session keys, ERC-20 paymaster, replacement tags, creator
  registration UI** — all cut (spec 15 Part 6).
- ~~If the strategy encoding (E-4) does not land…~~ **It landed** (D-030). The Aqua beat is a
  real ship and a real swap, provided the app and taker are deployed. If they are not, the beat
  is a narrated contract read and nothing else — say so, and show no number that is not from Aqua.

---

# Part 6 — Day-before checklist

| # | Step | Done when |
| --- | --- | --- |
| 1 | `npm ci && npm run lint && npm run typecheck && npm test && npm run build` in `web/`; `npm test` in `contracts/`; `npm run build` in `mcp/` | all exit 0 from a clean checkout |
| 2 | `bash scripts/spec-checks.sh`, and the CI run itself | all 20 checks pass. The job is blocking, as is the Playwright `e2e-responsive` matrix. `D-014*` and `D-015` are the two a judge can see |
| 3 | Registry deployed and verified; `contracts/deployments/sepolia.json` committed | `cast code $NEXT_PUBLIC_REGISTRY_ADDRESS --rpc-url $SEPOLIA_RPC_URL` non-empty |
| 4 | XYCSwap + XYCSwapTaker deployed (**not** a SwapVM router — D-030); one strategy shipped on a throwaway rock; one swap executed against it from a second account | `Shipped` and `Pushed` events on Sepolia Etherscan, and `safeBalances` answering for the recomputed `strategyHash` |
| 5 | Every Part 2 secret set on the Pages project; `NEXT_PUBLIC_DEMO_MODE=false` | deploy job green |
| 6 | D1 migrations applied to production | `nfc_counters` exists |
| 7 | Tag programmed per Part 4 | a tap on a phone opens `/r/{id}?e=…&c=…` |
| 8 | Wallets funded: deployer 0.3 ETH, faucet 1.0 ETH, **relayer 0.2 ETH**, attester 0, Rock Account 20 USDC + 0.01 WETH, taker 20 USDC + 0.005 WETH | balances read on Etherscan |
| 9 | Pimlico sponsorship policy exists for chain 11155111 | one sponsored UserOp lands |
| 10 | **Full rehearsal of the spec 08 acceptance test**, on the demo phone, on conference wifi and on cellular: tap → inspect signed out → sign in fresh → real transaction → copy the URL into a second browser and confirm the badge reads **`unverified`** → MCP `get_rock_status` from the laptop that will be on stage | all six pass. **This is the first time the SDM implementation meets a physical tag** — do it days early, not the night before |
| 10a | Rehearse the restart: `archiveRock` on the rehearsal rock, tap again, confirm the verifier offers `next_free` and the Rock Account address is unchanged (D-028, D-029) | a second awakening succeeds on the same tag, and the first rock still reads as `Archived` with its history intact |
| 11 | Screenshot every screen after step 10 | a still to fall back to |

## If a step fails on stage

Cut in spec 08's order, and never past the line:

1. replacement tags → 2. provenance polish → 3. ownership transfer → 4. second shared-liquidity
strategy → 5. creator registration UI.

**Never cut:** the real NFC interaction, Privy onboarding, the working Aqua transaction, the
security model.

Per-failure fallbacks:

| Fails | Do this |
| --- | --- |
| Tap does not open the page | Open `/rock/{id}` by hand; say the badge is `unverified` because there is no fresh tap — that is the system working |
| Verification returns `stale_counter` | Tap again; the counter advances. Do not reset it |
| Awakening reverts | `archiveRock` the rock from the owner account, then awaken a fresh id (Part 4b) |
| Paymaster rejects | Fall back to the funded EOA and say gas sponsorship is off; do not claim zero gas |
| Swap path not ready | Show `Shipped` on Etherscan and `Aqua.safeBalances`; state plainly that the taker leg is not built |
| Anything shows a number you cannot source | Say `UNAVAILABLE`. A wrong number on stage is worse than a blank |
