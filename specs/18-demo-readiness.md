# Demo readiness

## Purpose

[`15-exit-demo-mode.md`](./15-exit-demo-mode.md) says what must stop being simulated.
[`16-environment-and-secrets.md`](./16-environment-and-secrets.md) says what must be provisioned.
This document says **what is still missing, right now, to run the three-minute demo in
[`08-mvp-and-demo.md`](./08-mvp-and-demo.md) end to end on a physical rock.**

State of the tree: branch `exit-from-demo-mode`, HEAD `11d6817` ("XYCSwap strategy encoding,
taker periphery, tests and deploy script"), with an uncommitted working set. Uncommitted files are
treated as real. `bash scripts/spec-checks.sh` runs 21 checks and is blocking in CI; run it before
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
| 7 | 0:55 Fund: faucet + USDC/WETH | Funding | **REAL (ETH), manual (tokens)** | `FAUCET_PRIVATE_KEY` unset and unfunded. USDC/WETH have no in-app faucet: claim from Circle by hand to the Rock Account address (spec 16 Part 3). The app now shows that address where it is needed — the **Fund this rock** sheet on an awake rock (account, live balances, the USDC and WETH contracts, the Etherscan link) and, on a dormant rock, the account it would open with the signed-in wallet (D-029); the cross-chain bridge sheet renders only under `NEXT_PUBLIC_DEMO_MODE=true` (S-1). |
| 8 | 0:55 Ship the Aqua strategy | Aqua strategy | **REAL (needs deploy)** | `NEXT_PUBLIC_AQUA_APP_ADDRESS` from `scripts/deploy-aqua-app.js`. **E-4 is resolved** — the strategy is `abi.encode(XYCSwap.Strategy)` with the rock id in the salt, pinned by matching tests in TypeScript and Solidity (D-030). This was the highest-risk item in the project; it is no longer open. |
| 9 | 0:55 Show actual vs virtual balances | Reserves | **REAL (needs deploy)** | App address. `lib/aqua/read.ts` reads actual, virtual and *executable* separately and never sums virtual balances; `safeBalances` reverting is handled as "not shipped", not as an error. No APY anywhere (D-004). |
| 10 | 1:35 Second user swaps against the rock | Visitor swap | **REAL (needs deploy)** | App **and** taker addresses. The visitor trades from a personal Safe (salt 0) through `XYCSwapTaker`, because the app calls back into its caller and a plain wallet cannot answer (D-030). Quote from `XYCSwap.quoteExactIn`; the 1inch API path is deleted. The trade sheet shows that Safe's address and its USDC/WETH balances, so the tokens can be sent before the demo and an empty account blocks the button with "This account holds no USDC — send some to the address above" instead of reverting in estimation. |
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

**Refreshed 2026-09-12 evening.** The contracts are deployed and verified, the deploy pipeline
publishes the Worker that owns `bank-rock.com`, and every non-secret value is committed
(D-034). What is left is short, and all of it is a dashboard or a wallet.

## 2.1 Done today (Fact)

| Step | Evidence |
| --- | --- |
| GitHub secrets set; token re-scoped to Workers Scripts / D1 / Workers Routes / DNS | Deploy run 22 published the Worker; the apex version stamp changed (spec 12 history) |
| Registry deployed | `contracts/deployments/sepolia.json` — `0x2A3101Fc525C6DBEc39bef45034E23b13f28F757`, block 11689716 |
| XYCSwap + XYCSwapTaker deployed | `contracts/deployments/sepolia-aqua-app.json` — app `0x8a293F43Eb0DBaA834b40b2eC4E0751e3ce6316B`, taker `0xCd7899E37D50B226E882e79572AB189080fD0016` |
| All three verified on Sepolia Etherscan | `contracts/scripts/verify.md`; the Read and Write tabs work |
| Attester key generated; its address is the registry's `attester` | `0xF27ccB37FCDab74116D4Ad8E1F980879e6D979a4` (the private key was handed to the operator once, in chat, for the Worker secret) |
| D1 migrations applied to production | The deploy job's "Apply D1 migrations" step, run 19 onward |
| Addresses and deploy blocks committed as Worker `vars` | `web/wrangler.jsonc` (D-034); a spec check fails on drift from the deployments JSON |
| Secrets generated for the remaining roles (tag master key, relayer, faucet, admin, cron) | Handed to the operator once, in chat; never in a file in this repository |

The registry's **owner is still the throwaway deployer** `0x66D1bCE0C9Ea1aDDa7B6a8b8Fa52bDbDA52e3d0F`,
whose key lives only in the session that deployed it. Step 1 below fixes that and is not optional:
without it nobody can pause the registry or rotate the attester once that session is gone.

## 2.2 Left to do, in order

| # | Action | Where | Blocks |
| --- | --- | --- | --- |
| **1** | **Take ownership of the registry.** The deployer calls `transferOwnership(yourWallet)` (Ownable2Step), then you call `acceptOwnership()` once from that wallet: Etherscan → registry → Contract → Write → `acceptOwnership`, connected with MetaMask on Sepolia | Etherscan Write tab (the contract is verified) | Every admin action after the deploying session ends |
| 2 | **Delete** the old `www` redirect rule (unsubstituted `:path*`) | Cloudflare → Rules → Redirect Rules (R-1). The app ships the redirect itself; a dashboard rule runs before the Worker, so the broken one wins until deleted | `curl -sIL https://www.bank-rock.com` must end 200; tag programming |
| 3 | Create the Privy app: allowed origin `https://bank-rock.com`, email + passkey/Google, Sepolia enabled and **first** in the chain list | dashboard.privy.io → app id → GitHub repository **variable** `NEXT_PUBLIC_PRIVY_APP_ID` (D-034) | Beat 4 |
| 4 | Create the Pimlico API key **and a sponsorship policy for chain 11155111**, restricted to the registry, the app, the taker, USDC and WETH; restrict the public key by origin | dashboard.pimlico.io → Worker secret `PIMLICO_API_KEY`; GitHub repository **secret** `NEXT_PUBLIC_PIMLICO_API_KEY` | Beats 6, 10, 12 — without the policy every UserOperation is rejected |
| 5 | Set the Worker secrets — and nothing else on the Worker; plain variables are in git and are overwritten on every deploy (D-034) | Workers & Pages → `web` → Settings → Variables and Secrets → *Secret*: `SEPOLIA_RPC_URL`, `PIMLICO_API_KEY`, `ATTESTATION_SIGNER_PRIVATE_KEY`, `NXP_MASTER_KEY`, `RELAYER_PRIVATE_KEY`, `FAUCET_PRIVATE_KEY`, `ADMIN_PASSWORD`, `ADMIN_JWT_SECRET`, `ADMIN_API_KEY`, `CRON_SECRET`. `RESEND_API_KEY` and `ALERT_EMAIL_ADDRESS` only if email is wanted (cuttable) | Everything server-side |
| 6 | Redeploy so the build picks up the two GitHub inputs: Actions → Deploy → Run workflow, or push to `main` | github.com → Actions | Beats 4, 6 |
| 7 | `bash scripts/check-live.sh` from the repository | Green on every line, including the six addresses reporting code | Proof of steps 2–6 |
| 8 | Fund: ~~relayer 0.05 ETH~~ **done 2026-09-12** — `0x767D9348fDFF689289850410dB339407Bd0c5430` holds 0.045 ETH, sent from the deployer in tx `0x42bfad46762bcf7a520837774397bb5dbe47b63184fb5eb53a1391db501075d7` (the deployer keeps ~0.001 ETH; top it up before any owner action). **Faucet 0.05 ETH (optional — nothing on the demo path needs the in-app ETH faucet; every operation is sponsored)**, attester 0. Then, per Rock Account and per taker Safe: 10–20 USDC from `faucet.circle.com` and 0.01 WETH (wrap ETH with `deposit()` on the WETH contract from MetaMask, then transfer) | MetaMask on Sepolia. Sepolia gas is ~1 gwei: 0.05 ETH is roughly 50 million gas, hundreds of claims | Beats 7, 10, 12 |
| 9 | Run the live rehearsal: `npm run rehearse:sepolia` in `web/` with the keys from spec 20 WP-2, or the `Rehearse on Sepolia` workflow with those keys as repository secrets | Its report lands in `contracts/deployments/rehearsal-<date>.md`; DEMO-STATE §5 P-2…P-5 are deleted on the first green run | Confidence that the chain path works before a phone touches it |
| 10 | **Program the tag** (Part 4) with the `NXP_MASTER_KEY` value set in step 5 | NXP TagWriter / TagXplorer | Beats 1–2; the D-002 acceptance test |
| 11 | Claude Desktop config for the MCP beat, on the laptop that will be on stage | `cd mcp && npm ci && npm run build`, then the `env` block: `SEPOLIA_RPC_URL`, `REGISTRY_ADDRESS=0x2A3101Fc525C6DBEc39bef45034E23b13f28F757`, `BANKROCK_API_URL=https://bank-rock.com` (spec 11; the MCP process reads `REGISTRY_ADDRESS`, not the web app's `NEXT_PUBLIC_` name). **Proven 2026-09-12:** `get_rock_status` for rock 1 answered `dormant` from the deployed registry over the public RPC | Beat 13 |

**RPC (D-036).** `SEPOLIA_RPC_URL` may be `https://ethereum-sepolia-rpc.publicnode.com`: it is
reachable from the Worker and from CI and it served filtered `eth_getLogs` over 2,000 and
10,000-block ranges when measured today, which is what the indexer asks for. A keyed provider
(Alchemy, Infura) is the recommendation for the demo day itself, because a public endpoint's
rate limits are shared with strangers; it is not a blocker.

**Budget.** The earlier figures (deployer 0.3 ETH, faucet 1.0 ETH, relayer 0.2 ETH) were written
before anything had been measured. The whole deployment cost under 0.003 ETH. Total still to
fund: about 0.1 Sepolia ETH plus faucet USDC.

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
| 2 | `bash scripts/spec-checks.sh`, and the CI run itself | all 21 checks pass. The job is blocking, as is the Playwright `e2e-responsive` matrix. `D-014*` and `D-015` are the two a judge can see |
| 3 | ~~Registry deployed and verified; `contracts/deployments/sepolia.json` committed~~ **done 2026-09-12** | `bash scripts/check-live.sh` shows code at the registry address |
| 4 | ~~XYCSwap + XYCSwapTaker deployed~~ **done 2026-09-12**; one strategy shipped on a throwaway rock; one swap executed against it from a second account (the rehearsal script does both) | `Shipped` and `Pushed` events on Sepolia Etherscan, and `safeBalances` answering for the recomputed `strategyHash` |
| 5 | Every Part 2 secret set **on the Worker `web`**; `NEXT_PUBLIC_DEMO_MODE=false` | deploy job green **and** `NEXT_PUBLIC_APP_VERSION` on `https://bank-rock.com` has changed — a green deploy to a surface no domain points at is the failure this catches (spec 12) |
| 6 | D1 migrations applied to production (the deploy job does this) | `nfc_counters` exists |
| 7 | Tag programmed per Part 4 | a tap on a phone opens `/r/{id}?e=…&c=…` |
| 8 | Wallets funded: **relayer 0.05 ETH**, faucet 0.05 ETH (optional), attester 0, Rock Account 10–20 USDC + 0.01 WETH, taker 10–20 USDC + 0.005 WETH (Part 2.2 step 8) | balances read on Etherscan |
| 9 | Pimlico sponsorship policy exists for chain 11155111 | one sponsored UserOp lands — the rehearsal script's first step |
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
