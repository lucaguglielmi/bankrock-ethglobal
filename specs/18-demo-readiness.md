# Demo readiness

## Purpose

[`15-exit-demo-mode.md`](./15-exit-demo-mode.md) says what must stop being simulated.
[`16-environment-and-secrets.md`](./16-environment-and-secrets.md) says what must be provisioned.
This document says **what is still missing, right now, to run the three-minute demo in
[`08-mvp-and-demo.md`](./08-mvp-and-demo.md) end to end on a physical rock.**

State of the tree when this was written: branch `exit-from-demo-mode`, HEAD `2fabd71`
("Wave 1 — registry rewrite, CI and MCP, UI primitives"), with a large uncommitted working set
(`git status --short`). Uncommitted files are treated as real. `bash scripts/spec-checks.sh`
reports **5 passed, 15 failed**.

Vocabulary is spec 15 Part 3: `REAL` / `DEMO` / `UNAVAILABLE`, plus **`not implemented`** for a
capability with no code path at all.

---

# Part 1 — The demo path, step by step

Beats are spec 08's three-minute script. "Today" is the state with every secret set and every
contract deployed — i.e. what the *code* can do, not what the environment currently allows.

| # | Beat (spec 08) | Capability | Today | Implemented but unverified | Missing — concretely |
| --- | --- | --- | --- | --- | --- |
| 1 | 0:00 Tap the rock, page opens | Tag URL resolves | **REAL** | `web/src/app/r/[id]/page.tsx` redirects `/r/{id}?e=&c=` → `/rock/{id}` preserving the query. Never hit with a real tag. | Cloudflare `www` redirect still returns 308 to a literal placeholder (R-1); tag never programmed (Part 4). |
| 2 | 0:00 "Verified Physical" badge | NFC attestation | **`UNAVAILABLE`** (verifier), **DEMO** (UI) | `lib/nfc/sdm.ts` (PICC offsets, SV1/SV2, odd-byte truncation), `lib/nfc/verify.ts`, `lib/nfc/counter-store.ts` (D1 `nfc_counters`), `actions/verify-ntag.ts` now delegates to `verifyTap`. No test against a physical tag. | `components/rock-interface.tsx` still renders the badge from `verificationResult` set by `handleSelectScenario` (F-7 alive, lines 388–414) and `DemoSwitcher` is rendered unconditionally (lines 438, 479, 740). `NXP_MASTER_KEY` unset ⇒ `reason: "unconfigured"`. |
| 3 | 0:00 AR view | WebXR | **not implemented** | — | Cut by spec 15 Part 6. Do not demo it. |
| 4 | 0:25 Privy sign-in, fresh browser | User identity | **`UNAVAILABLE` → REAL once the app ID is set** | `context/auth-context.tsx` rejects the placeholder app ID; `lib/auth/privy.ts` verifies the Privy JWT via JWKS. | `NEXT_PUBLIC_PRIVY_APP_ID` + dashboard origin/chain config (spec 16 #1). `privy-onboarding-modal.tsx` still has the `useEffect`-after-early-return crash (X-1) on the primary login path. |
| 5 | 0:55 Rock state, owner, Rock Account | Registry reads | **DEMO (hardcoded)** | `contracts/contracts/BankRockRegistry.sol` rewritten (Ownable, Pausable, EIP-712, `awakenRock`/`initiateHandover`/`claimHandover`/`archiveRock`); `contracts/scripts/deploy.js` is a real deploy. | Registry not deployed. **`web/src/lib/chain/abi/registry.ts` is the OLD ABI** (`getRockStatusJSON`, `bindNFC`, `poke`, `rocks`, `transferOwnership`) — it does not match the contract. `hooks/useBankRock.ts` calls `awakenRock(rockId, smartAccount)` (2 args); `rock-interface.tsx:231` calls it with 3; the contract takes 4. `rock-interface.tsx:127-128` still hardcodes owner and `smartAccountAddress`. |
| 6 | 0:55 Awaken: Safe deployed, sponsored | ERC-4337 Rock Account | **not implemented (wired)** | `lib/aa.ts`: `createRockAccount`, `buildShipBatch`, `buildDockCall`, `shipStrategy`, Pimlico `/v2/sepolia/rpc`, correct Aqua ABI (E-3 fixed). | **Nothing imports `@/lib/aa`** (C-6 still true — grep returns only a comment in `abi/aqua.ts`). No awaken API route, no Safe creation in the UI, no path that submits the signed attestation to `awakenRock`. |
| 7 | 0:55 Fund: faucet + USDC/WETH | Funding | **REAL (ETH), manual (tokens)** | `app/api/faucet/route.ts`: `requireEnv("FAUCET_PRIVATE_KEY")`, 0.01 ETH/claim, per-address + per-IP (3/24 h) D1 limits. | `FAUCET_PRIVATE_KEY` unset and unfunded. USDC/WETH have no in-app faucet: Circle faucet by hand to the Safe address (spec 16 Part 3). |
| 8 | 0:55 Ship the Aqua strategy | Aqua strategy | **not implemented** | Correct `ship`/`dock`/`safeBalances` ABI in `lib/chain/abi/aqua.ts`; `buildShipBatch` produces `approve(Aqua,USDC) + approve(Aqua,WETH) + ship(app, strategy, …)`. | **The `strategy` bytes do not exist.** No SwapVM router deployed (E-2), no program builder, no `XYCSwap` fallback — `grep -rl "SwapVM\|XYCSwap\|strategy" contracts/*` returns nothing. This is E-4, spec 15 Phase 3 items 1–2. |
| 9 | 0:55 Show actual vs virtual balances | Reserves | **DEMO** | `useRockReserves` reads real ERC-20 `balanceOf`. | No `Aqua.safeBalances` read anywhere; `rock-interface.tsx:90,119` falls back to `1250.0`; `aqua-position-card.tsx:152` prints `Est. APR` (D-004 violation). |
| 10 | 1:35 Second user swaps against the rock | Visitor swap | **not implemented** | `app/api/rocks/[id]/quote/route.ts` returns `UNAVAILABLE` honestly; `hooks/useBankRock.ts` exports `TRADING_UNAVAILABLE_REASON`. | **No swap execution path at all.** `components/trade-modal.tsx` still hardcodes Base-mainnet token addresses (lines with `0x8335…2913`, `0x4200…0006`) and fake balances. The SwapVM `quote` ABI is flagged `SWAPVM_QUOTE_ABI_IS_HYPOTHESIS = true`. |
| 11 | 1:35 Fee accounting after the swap | Earned fees | **DEMO** | — | Fees must come from Aqua events, not a client formula (N-6). Blocked by #8/#10. |
| 12 | 2:10 Hand the rock over, zero gas | Ownership transfer | **DEMO** | Contract has `initiateHandover` + `claimHandover` with expiry, message hash and attestation binding (SC-5 fixed). | No UI or API for either; `transfer-modal.tsx` still calls the removed `transferOwnership(rockId,newOwner)` and accepts `.eth` strings (X-3). Paymaster sponsorship unwired (same gap as #6). |
| 13 | 2:30 MCP reads the rock | MCP tools | **REAL (partial)** | `mcp/index.ts` v2.0.0 — `get_rock_status` reads `getRock` + ERC-20 balances, `trace_transaction` does a real `eth_getTransactionReceipt`, everything else returns `{status:"unavailable"}` (D-019). `mcp/registry-abi.ts` **is** generated from the new contract and CI checks it. | Needs `SEPOLIA_RPC_URL` + `REGISTRY_ADDRESS` in the agent's MCP `env` block. The demo's "agent ships a strategy" beat is blocked by #8; MCP can only *read*. |
| 14 | Acceptance test 2 — inspect without logging in | Public rock page | **DEMO** | `api/events`, `api/rocks/[id]/yield|activity` return `state:"UNAVAILABLE"` with a reason instead of fiction. | `lib/indexer.ts` decodes `RockAwakened` and **`RockOwnershipTransferred`** — the latter no longer exists in the contract (it is `HandoverClaimed`), so transfers will never appear in provenance. |
| 15 | Acceptance test 5 — tag ≠ ownership | Security story | **REAL in the contract, DEMO in the UI** | Registry: attestation gates claiming, never spending; `markLost` freezes nothing. | The green badge can still be set client-side (#2). Until that is gone, the claim is false on stage. |

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
| 10 | Deploy the SwapVM router | Clone `github.com/1inch/swap-vm`, add a `sepolia` network to its `hardhat.config.ts`, set `ignition/parameters/chain-11155111.json` `aqua` = `0x1111113ccf1426a8e30e2bff5e005d929bf6a90a`, `npx hardhat ignition deploy ignition/modules/SwapVMRouter.ts --network sepolia --parameters …` → `NEXT_PUBLIC_SWAPVM_ROUTER_ADDRESS` | Beats 8, 10 |
| 11 | Claim **20 USDC / 2 h / address** to each Rock Account Safe and to the taker wallet | `faucet.circle.com` or `ethglobal.com/faucet/sepolia-11155111-usdc` | Beats 7, 10 |
| 12 | Wrap ETH → WETH: 0.01 per rock, 0.005 for the taker | `deposit()` on `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14` | Beats 7, 10 |
| 13 | Verify `bank-rock.com` in Resend (SPF + DKIM); set `ALERT_FROM_ADDRESS`, `ALERT_EMAIL_ADDRESS` | resend.com (E-6) | Alerts only — **cuttable** |
| 14 | Set every variable on the Pages project (Settings → Environment variables), **not** in a file; `NEXT_PUBLIC_DEMO_MODE=false` for production | Cloudflare dashboard; `web/.env.example` is the authoritative list | Deploy |
| 15 | Create the Cloudflare API token (Pages + D1 edit) and add `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` as GitHub secrets | `.github/workflows/deploy.yml` fails early without them | CI deploy |
| 16 | Apply D1 migrations to production | `cd web && npm run db:migrate:prod` — `drizzle/0003_gifted_boomer.sql` creates `nfc_counters`, `faucet_ip_claims`, `alert_preferences`, `contact_requests` | Replay protection, faucet limits |
| 17 | **Program the tag** (Part 4) | NXP TagWriter / TagXplorer | Beats 1–2 |

---

# Part 3 — Blockers that are code work

| # | Work | Spec phase | In the tree? | Size |
| --- | --- | --- | --- | --- |
| C1 | Regenerate `web/src/lib/chain/abi/registry.ts` from `contracts/abi/BankRockRegistry.json` (it is the pre-rewrite ABI; `mcp/registry-abi.ts` already has the right one) | 15 P2.1 | no | 30 min (a script already exists: `contracts/scripts/export-abi.js`) |
| C2 | Rewrite `hooks/useBankRock.ts` against the new ABI: `getRock`, `awakenRock(rockId, smartAccount, att, sig)`, `initiateHandover`/`claimHandover`, `archiveRock`; drop `rocks`/`getRockStatusJSON`/`transferOwnership` | 15 P2.4 | partial (Sepolia + `lib/chain` done, ABI calls stale) | ½ day |
| C3 | Fix `lib/indexer.ts` event names (`RockOwnershipTransferred` → `HandoverClaimed`, add `RockArchived`) | 15 P2.5 | partial | 1 h |
| C4 | Wire `lib/aa.ts` into an awaken route: create the Safe, sponsor via Pimlico, submit the attestation to `awakenRock` | 15 P2.3 | library only, zero call sites | 1 day |
| C5 | **Ship an Aqua strategy — no code at all exists.** Confirm the encoding against `test/solidity/helpers/AquaStrategyBuilders.sol`; produce constant-product program bytes from a committed Foundry/Hardhat script; fall back to the reference `XYCSwap` AquaApp if it takes more than a day (E-4) | 15 P3.1–3.3 | **no** | 1–2 days, highest risk in the project |
| C6 | **Visitor swap path — no code at all exists.** Execute from the Rock Account against the shipped strategy; replace `trade-modal.tsx`'s hardcoded Base-mainnet tokens and fake balances; quote from the router's own `quote()` and replace the hypothesis ABI | 15 P3.4, P3.7 | **no** | 1 day |
| C7 | Read `Aqua.safeBalances` (virtual) alongside `ERC20.balanceOf` (actual) and never sum them | 15 P3.5 / spec 04 | no | 3 h |
| C8 | Migrate `rock-interface.tsx` (750 lines): delete `INITIAL_EVENTS` hashes, the `Math.random()` hash at :259, `smartAccountAddress` and owner literals, `currentApy = 18.4`, the `1250.0` fallbacks; gate `DemoSwitcher` on `isDemoMode()` and strip its power to set `verificationResult` | 15 P1.3/4/5/9 | **no** — all still present | 1 day |
| C9 | Same for `cross-chain-modal.tsx` (2 synth hashes, 5 mainnet addresses) and `aqua-position-card.tsx` (1 synth hash, `Est. APR`) | 15 P1.3/5 | no | ½ day |
| C10 | Handover UI: give sheet → `initiateHandover`; claim on tap → `claimHandover`; fix `transfer-modal.tsx` ENS handling (X-3) | 15 P2.1 / Flow E | no | ½ day |
| C11 | Fix `privy-onboarding-modal.tsx` hook-order crash (X-1) | 15 P0.3 | no | 15 min |
| C12 | Spec 17 **U0** typography foundation | 17 U0 | **done** — `T-1/T-2/T-3` pass; `ui/amount.tsx`, `address.tsx`, `tx-hash.tsx`, `code-block.tsx` exist | — |
| C13 | Spec 17 **U1** frame/chrome — `bottom-dock.tsx` exists, but `L-1a` fails (`min-h-screen` in `app/rock/[id]/page.tsx`, `/mcp`, `/privacy`) | 17 U1 | partial | ½ day |
| C14 | Spec 17 **U2** sheets/controls — `ui/sheet.tsx`, `button.tsx`, `icon-button.tsx` exist; the eight legacy overlays are not migrated (`L-5` fails in `about-rocks`, `info-modal`, `aqua-info-modal`, `contact-modal`; `L-6` drag threshold still in `trade-modal.tsx`) | 17 U2 | partial | 1–2 days |
| C15 | Spec 17 **U3** per-surface pass (`T-5a/b`, `T-7`, `T-8` all failing across components) | 17 U3 | no | 1 day |
| C16 | Spec 17 **U4** — make `spec-checks` blocking and add `web/e2e/responsive.spec.ts` | 17 U4 | `ci.yml` runs the script with `continue-on-error: true`; no e2e file | ½ day |
| C17 | Contract tests for `archiveRock` and the ABI re-export | 15 P2.1 | **done** mid-review — tests present, `contracts/abi` and `mcp/registry-abi.ts` regenerated | — |
| C18 | Phase 5 perimeter: `/api/telemetry`, `/api/alerts*`, `/api/keeper` auth | 15 P5 | mostly done in the uncommitted set | ½ day |

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

What is still missing around it:

| Layer | Missing |
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

**Rehearse with (c); ship (b) only if Phase 3 lands early.**

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
- **Keeper rebalancing** — `DEMO`, badged. The Gelato function targets an interface that does not
  exist (X-7).
- **Alert delivery** — `UNAVAILABLE`. Preferences persist; nothing dispatches (N-9).
- **Fiat on-ramp / off-ramp** (Flows G, H fiat legs) — out of scope per spec 08.
- **AR / WebXR view** — cut (spec 15 Part 6). It is beat 1 of the script: rewrite the opening.
- **Second strategy sharing one reserve** — spec 04 wants two; Phase 3 item 8 is last in line.
- **`dock` / Cash In** — built in `lib/aa.ts`, never called.
- **Idle yield (Aave/Morpho), ERC-7579 session keys, ERC-20 paymaster, replacement tags, creator
  registration UI** — all cut (spec 15 Part 6).
- If the strategy encoding (E-4) does not land: **the Aqua beat itself is a narrated contract
  read**, not a swap. Say so; do not show a number that is not from Aqua.

---

# Part 6 — Day-before checklist

| # | Step | Done when |
| --- | --- | --- |
| 1 | `npm ci && npm run lint && npm run typecheck && npm test && npm run build` in `web/`; `npm test` in `contracts/`; `npm run build` in `mcp/` | all exit 0 from a clean checkout |
| 2 | `bash scripts/spec-checks.sh` | no `D-014*` or `D-015` failure (synthesized hashes and address literals are the ones a judge can see) |
| 3 | Registry deployed and verified; `contracts/deployments/sepolia.json` committed | `cast code $NEXT_PUBLIC_REGISTRY_ADDRESS --rpc-url $SEPOLIA_RPC_URL` non-empty |
| 4 | SwapVM router deployed; strategy bytes produced and shipped once on a throwaway rock | `Shipped` event on Sepolia Etherscan |
| 5 | Every Part 2 secret set on the Pages project; `NEXT_PUBLIC_DEMO_MODE=false` | deploy job green |
| 6 | D1 migrations applied to production | `nfc_counters` exists |
| 7 | Tag programmed per Part 4 | a tap on a phone opens `/r/{id}?e=…&c=…` |
| 8 | Wallets funded: deployer 0.3 ETH, faucet 1.0 ETH, Rock Account 20 USDC + 0.01 WETH, taker 20 USDC + 0.005 WETH | balances read on Etherscan |
| 9 | Pimlico sponsorship policy exists for chain 11155111 | one sponsored UserOp lands |
| 10 | **Full rehearsal of the spec 08 acceptance test**, on the demo phone, on conference wifi and on cellular: tap → inspect signed out → sign in fresh → real transaction → copy the URL into a second browser and confirm the badge reads **`unverified`** → MCP `get_rock_status` from the laptop that will be on stage | all six pass |
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
