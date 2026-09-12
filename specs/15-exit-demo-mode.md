# Exiting demo mode

## Purpose

The implementation in `web/`, `contracts/`, `mcp/` and `web3-functions/` presents itself as a
working product. Most of it is a simulation: hardcoded balances, synthesized transaction
hashes, an undeployed registry, an Aqua integration pointed at the wrong contract, and an NFC
verifier that accepts any input.

This document defines what "demo mode" is, makes it an explicit and visible runtime state
rather than an implicit default, and specifies the work required to leave it.

It is written to be checkable. Every fact below was verified on 2026-09-12 and carries its
evidence. Every exit criterion is mechanically testable.

## Status vocabulary

Per the spec rules in [`README.md`](./README.md), claims are tagged:

- **Fact** — verified by execution, an RPC call, or an HTTP response on this date.
- **Decision** — a choice this document makes and the codebase must follow.
- **Hypothesis** — believed but not proven; must be proven before it is relied on.

---

# Part 1 — Audit baseline

## 1.1 Build and pipeline

| # | Fact | Evidence |
| --- | --- | --- |
| B-1 | `npm run build` fails. `sonner` is imported but absent from `package.json`. | `Module not found: Can't resolve 'sonner'` from `components/transfer-modal.tsx:2`, `components/rock-alerts.tsx:2`. Build succeeds once the dependency is added. |
| B-2 | `npm ci` fails. `@cloudflare/next-on-pages@1.13.16` peers `next <=15.5.2`; project is on `next@16.3.5`. | `ERESOLVE` on clean install. Both CI workflows begin with `npm ci`, so every Actions run is red. |
| B-3 | `npm run lint` reports 48 errors, 31 warnings. | `ci.yml` runs lint immediately after install. |
| B-4 | `npx tsc --noEmit` is clean. | No output. |
| B-5 | `deploy.yml` runs `wrangler pages deploy .` from `web/`, publishing the entire source directory as static assets, with no `_worker.js`, targeting project `bankrock-web` while `package.json` targets `bankrock-ethglobal`. | `.github/workflows/deploy.yml` |
| B-6 | Two lockfiles (`package-lock.json`, `pnpm-lock.yaml`) coexist; `packageManager` declares pnpm; CI uses npm. | `web/` |
| B-7 | Contract tests exist but no workflow runs them. | `contracts/test/BankRockRegistry.t.sol`, `.github/workflows/ci.yml` |
| B-9 | `mcp/node_modules` is tracked in git — 4,919 files, including the `@typescript/typescript-darwin-arm64` platform binary — despite `mcp/.gitignore` listing `node_modules`. Every `npm ci` on Linux shows hundreds of spurious deletions. **Resolved on this branch** in `e574ad5`: `git ls-files mcp/node_modules` now returns nothing and the root `.gitignore` covers `node_modules/`. | `git ls-files mcp/node_modules \| wc -l` → 4919 before, 0 after |
| B-8 | ~~`mcp/package.json` pins versions that do not exist.~~ **Withdrawn.** `typescript@7.0.2` and `cors@2.8.6` exist; `mcp/` installs and builds cleanly. `contracts/` installs and its 6 tests pass. | `npm ci && npm run build` in `mcp/` exit 0; `npx hardhat test` → 6 passing |

## 1.2 Runtime — live site

| # | Fact | Evidence |
| --- | --- | --- |
| R-1 | `https://www.bank-rock.com` returns `308` to the literal string `https://bank-rock.com/:path*`, which is a `404`. A Cloudflare redirect rule contains an unsubstituted placeholder. | `curl -I https://www.bank-rock.com` |
| R-2 | `GET /api/rocks/{id}/yield` and `GET /api/rocks/{id}/activity` return `500` in production. These feed liquidity, fees, APY and the provenance timeline on every rock page. | `curl https://bank-rock.com/api/rocks/1/yield` → `Internal Server Error` |
| R-3 | Every D1 access calls `getRequestContext()` from `@cloudflare/next-on-pages`, but deployment uses `@opennextjs/cloudflare`. The adapters are not interchangeable. D1 is unreachable everywhere in the app. | 9 call sites; `open-next.config.ts`; `wrangler.jsonc` `main: .open-next/worker.js` |
| R-4 | All persistence therefore falls back to per-isolate in-memory `Map`s that reset continuously. | `GET /api/telemetry` returns `count: 1` on every call — a cold buffer each time. |
| R-5 | `GET /api/events?rockId=1` returns `count: 0`. | The registry it queries has no code. |
| R-6 | `/sw.js` returns `404` while `/alerts` instructs users to enable push notifications. | `curl -o /dev/null -w "%{http_code}" https://bank-rock.com/sw.js` |
| R-7 | `/r/{id}` — the NFC tag payload path specified in [`06-nfc-security.md`](./06-nfc-security.md) — returns `404`. The app only serves `/rock/[id]`. | `curl https://bank-rock.com/r/1` |
| R-8 | The string `bank-rock.com` appears nowhere in the codebase. CORS defaults to `https://bankrock.xyz`; email CTAs and the MCP server point at `bankrock-ethglobal.pages.dev`; the Gelato function calls `bankrock.xyz`. | `middleware.ts:79`, `lib/email-service.ts:63`, `mcp/index.ts:23`, `web3-functions/bankrock-keeper/index.ts:75`, `components/providers.tsx:38` (the Privy modal logo) |
| R-9 | [`12-deployment.md`](./12-deployment.md) specifies Vercel. The actual target is Cloudflare Pages via OpenNext. | `package.json` `deploy:pages`, `wrangler.jsonc` |

## 1.3 Simulation ledger

This is the authoritative list of what is faked, required by rule 1 of [`../STEERING.md`](../STEERING.md).

### On-chain

| # | Fact | Evidence |
| --- | --- | --- |
| C-1 | **The registry is not deployed.** `eth_getCode` on Base Sepolia returns `0x` for both addresses present in the repo. | `0x89f735f4c74f878d3aac6e60b134d115e5e29631` (`lib/contracts.ts:1`) and `0x83B1A8a09f87258385698b9C433e143FDF2A9F52` (`.env.example`, `mcp/index.ts:20`, `contracts/scripts/deploy.js:26`) |
| C-2 | The two addresses disagree with each other, and no build step reconciles them. | as above |
| C-3 | `contracts/scripts/deploy.js` deploys nothing. It reads the artifact and prints a hardcoded address. | `contracts/scripts/deploy.js` |
| C-4 | **Aqua is not integrated.** `AQUA_ADDRESSES.aquaContract` is `0x111111125421cA6dc452d289314280a0f8842A65` — the 1inch Aggregation Router V6, which has no `ship`/`dock`. `swapVmContract` `0x2222…842a65` has no code on Base Sepolia, Base mainnet or Ethereum mainnet; it is the router address with the vanity prefix altered from `1111` to `2222` — fabricated, not looked up. | `lib/contracts.ts`; `eth_getCode` returns 23942 bytes and `0x` respectively, on three RPCs |
| C-4a | The canonical addresses per the official READMEs are Aqua `0x1111113ccf1426a8e30e2bff5e005d929bf6a90a` and SwapVM router `0x111111338c5091e8440b67b168bae16a668ac0de` (deterministic, same on every supported chain). **Neither has code on Base Sepolia.** Both exist on Base mainnet (5619 and 20541 bytes). Aqua exists on Ethereum Sepolia (5619 bytes, identical to mainnet); the SwapVM router does not. No official testnet deployment of SwapVM exists anywhere. | `eth_getCode` across Base Sepolia, Base mainnet, Ethereum Sepolia, Arbitrum/OP/Unichain Sepolia; `github.com/1inch/aqua`, `github.com/1inch/swap-vm` READMEs; `swap-vm/ignition/parameters/chain-11155111.json` has `"aqua": "0x000…000"` |
| C-5 | No strategy is ever shipped, docked, or read. No virtual balances exist. Spec 04's requirement of two strategies sharing one reserve is absent. | no `ship`/`dock` call sites outside dead code |
| C-6 | **ERC-4337 is not wired.** `lib/aa.ts` — Safe accounts, dual Pimlico paymaster, atomic `executeBatch` — is dead code. Nothing imports it. | `grep "@/lib/aa"` → no results |
| C-7 | `smartAccountAddress` is a hardcoded literal, identical for every rock, and equal to the non-existent registry address. | `components/rock-interface.tsx:133` |
| C-8 | Owner address falls back to a hardcoded literal when unauthenticated. | `components/rock-interface.tsx:132` |
| C-9 | Rock lifecycle state is `rockId === "1" \|\| rockId === "new" ? unactivated : active`. It is never read from a registry or database. | `components/rock-interface.tsx` |
| C-10 | `tradeOnchain` hardcodes router `0x1111111254EEB25477B68fb85Ed929f73A960582` (1inch v5, mainnet) labelled "v6 on Base Sepolia", and defaults `routerPayload` to `"0x"`. | `hooks/useBankRock.ts` |

### Synthesized evidence

| # | Fact | Evidence |
| --- | --- | --- |
| S-1 | When the faucet fails, a random 64-hex string is generated and rendered as "Seed Faucet Broadcasted" with a clickable BaseScan link. | `components/rock-interface.tsx:257-261` |
| S-2 | Same pattern in the Aqua position card and the cross-chain modal. | `components/aqua-position-card.tsx:56`, `components/cross-chain-modal.tsx:248,263` |
| S-3 | `executeAquaRebalance` returns a random hash from an "execution" that only mutates an in-memory `Map`. `POST /api/keeper` returns it as `success: true`. | `lib/aqua-keeper.ts:132` |
| S-4 | `INITIAL_EVENTS` ships three hardcoded transaction hashes as provenance history. | `components/rock-interface.tsx:34-60` |
| S-5 | `sendAlertEmail` returns `success: true` when nothing was sent (sandbox preview). MCP reports `DISPATCHED`. | `lib/email-service.ts:170-182` |

### Fabricated numbers

| # | Fact | Evidence |
| --- | --- | --- |
| N-1 | The keeper's entire position — reserves, price (2850), fee accrual — is an in-memory fiction. | `lib/aqua-keeper.ts` |
| N-2 | The yield endpoint returns hardcoded `currentAPY: 18.5` and a three-point history, both when D1 is absent *and* when D1 returns no rows. | `app/api/rocks/[id]/yield/route.ts` |
| N-3 | Displaying APY contradicts principle 5 of [`01-product.md`](./01-product.md) and decision D-004. | `components/rock-interface.tsx`, `components/aqua-position-card.tsx` |
| N-4 | Trader balances are hardcoded `USDC: 500, WETH: 0.25`. | `components/trade-modal.tsx:73` |
| N-5 | `/api/quote` queries 1inch on chain `8453` (Base **mainnet**) with mainnet USDC, while execution targets Sepolia. It requires `1INCH_API_KEY`, absent from `.env.example`, so it returns `500` — quote is `0`, and the swap button can never enable. | `app/api/quote/route.ts` |
| N-6 | Price impact is an invented formula, not an AMM calculation. | `components/trade-modal.tsx` |
| N-7 | The admin dashboard is a `setTimeout` returning $1,254,300 TVL, 42 rocks, 8 Gelato tasks. | `app/admin/page.tsx` |
| N-8 | Cron snapshot mocks fees as `tvl * 0.01` and prices ETH at 2500, while the keeper uses 2850. | `app/api/cron/snapshot/route.ts` |
| N-9 | Alerts have a settings UI and a manual test button but **no event-to-delivery pipeline**. No alert can ever fire on its own. | `lib/alerts.ts`, `app/api/alerts/*` |
| N-10 | `/api/newsletter` POST writes to D1 but GET reads an in-memory map seeded with a fake subscriber. | `app/api/newsletter/route.ts:21` |

### MCP server

| # | Fact | Evidence |
| --- | --- | --- |
| M-1 | 8 of 11 tools return hardcoded fiction with no chain read. `get_rock_status` returns `isAwake: true` for any ID. `trace_transaction` returns `status: "SUCCESS"` for any hash. `analyze_strategy_yield` returns 18.4% APR and $8,450 24h volume as fact. | `mcp/index.ts` |
| M-2 | This directly violates the trust boundary in [`03-system-architecture.md`](./03-system-architecture.md), which states MCP is *not trusted for* "hallucinated financial claims". The server does not hallucinate them — it hardcodes them, which is worse, because the numbers are stable and therefore credible. | `03-system-architecture.md` |

### NFC

| # | Fact | Evidence |
| --- | --- | --- |
| F-1 | Two verifiers exist. The one the UI calls is a stub: `await sleep(400)` then `isValid = params.c !== "invalid_signature"`. **Any `?c=` value that is not that literal string renders a green "Verified Physical" badge.** | `actions/verify-ntag.ts:52-55`, `components/rock-interface.tsx` |
| F-2 | This inverts the central promise of [`06-nfc-security.md`](./06-nfc-security.md) and decision D-002: a copied URL is presented to the user as cryptographically proven physical possession. | — |
| F-3 | The second verifier, `/api/nfc/verify`, attempts real AES-CMAC but cannot validate a real NTAG 424: it reads the UID at offset 0 instead of 1 (skipping the PICC tag byte), reads the 3-byte `SDMReadCtr` with `readUInt32LE`, and performs no NXP session-key derivation (SV1/SV2). | `app/api/nfc/verify/route.ts:44-46,88-97` |
| F-4 | ~~`nodejs_compat` is absent.~~ **Withdrawn.** With `compatibility_date >= 2026-08-04` Cloudflare enables `nodejs_compat` by default; the repo's date is `2026-09-11`. `node:crypto` and `Buffer` work as-is. `node-aes-cmac` is dependency-free pure JS. | Cloudflare changelog 2026-08-04; `wrangler.jsonc` |
| F-5 | `verifiedPubKey` is `0x${e}${c}` padded to 66 chars — not a key, not a signature, not derived from anything. | `app/api/nfc/verify/route.ts:105` |
| F-6 | On-chain, `bindNFC` stores a `bytes32` that nothing ever verifies. The `InvalidNFCSequence` error is declared and never used. | `contracts/contracts/BankRockRegistry.sol` |

### Identity, demo controls and forms

Added on the second review (2026-09-12, this branch). None of these were in the first ledger.

| # | Fact | Evidence |
| --- | --- | --- |
| A-1 | **Sign-in is simulated when Privy is not configured.** With no valid `NEXT_PUBLIC_PRIVY_APP_ID`, `login()` does not fail: it activates a fabricated embedded wallet (`DEMO_WALLET_ADDRESS` = `0x71C8…1b47`, user `collector@bankrock.eth`), persists the session in `localStorage`, and the header presents it as an `Embedded` Privy wallet. The console calls it a "high-fidelity Demo Embedded Wallet". Spec 16 #1 previously said "every login fails"; that was wrong. | `context/auth-context.tsx` (`DEMO_WALLET_ADDRESS`, `activateDemo`, `login`) |
| A-2 | `PrivyProvider` is booted with the placeholder app ID `clp1234567890abcdef123456` when the real one is absent, so the SDK initialises and the fabricated session is indistinguishable from a real one in the UI. The `isDemoMode` it derives is a second, implicit demo flag unrelated to D-013. | `components/providers.tsx` (`Providers`) |
| F-7 | The judge demo switcher is rendered on every rock page in every environment and sets `verificationResult = { isAuthentic: true }` on the client, which renders the green `Verified Physical` badge with no verifier involved. The `active_maker` scenario also sets the reserve to 1,250 USDC and fees to 12.4. | `components/demo-switcher.tsx`; `components/rock-interface.tsx` (`handleSelectScenario`, `handleResetDemo`) |
| S-6 | The shop's "Claim an OG Rock" and "Become a Sponsor" forms submit nowhere: `handleSubmit` is two `setTimeout`s that show a success state and close the modal. | `components/contact-modal.tsx:45-56` |
| S-7 | "Claim your vanity URL" saves nothing; the handler is an 800 ms `setTimeout` with a comment describing what a real app would do. | `components/social-bridge.tsx:16-24` |
| N-11 | The rock page initialises `currentApy` to `18.4` before any fetch, so the figure renders even when the yield route fails. | `components/rock-interface.tsx:77` |

## 1.4 Security findings

### Contract — `BankRockRegistry.sol`

Not yet deployed, which is the only reason these are not live. **Do not deploy this contract as written.**

| # | Severity | Fact |
| --- | --- | --- |
| SC-1 | Critical | `setRouterWhitelist` has no access control — the source comment admits it. Combined with `executeTrade` performing `router.call(routerPayload)` with **caller-supplied calldata**, any address can whitelist a token as a "router" and use the registry as an arbitrary-call proxy. Any token the registry holds or is approved for is drainable. |
| SC-2 | Critical | `awakenRock` has no access control and no NFC proof. Anyone can awaken any unclaimed `rockId`, becoming `currentOwner` with an arbitrary `smartAccount`. Front-runnable in the mempool. |
| SC-3 | High | `minAmountOut` is caller-chosen, so `balanceAfter >= balanceBefore + minAmountOut` is trivially satisfied with `0`. The slippage guard is decorative. |
| SC-4 | High | `executeTrade` requires `msg.sender` to be the owner or the smart account. **A visitor can never trade against a rock** — MVP requirement 7 and Flow D are unimplementable against this contract. |
| SC-5 | Medium | `transferOwnership` is immediate and unconditional. Flow E's pending handover, expiry, message and tap-to-claim do not exist on-chain. |
| SC-6 | Low | No ownership, no pause, no upgrade path. |

### Live API — all unauthenticated, all verified against production

| # | Severity | Fact | Evidence |
| --- | --- | --- | --- |
| SA-1 | High | `POST /api/alerts/test` is an **open email relay**. Any party can make the Resend sending domain deliver Bank Rock–branded mail to any address. The only validation is `to.includes("@")`. | `HTTP 400` on a deliberately invalid address confirms anonymous requests are accepted and processed. |
| SA-2 | High | `GET /api/telemetry` publicly serves server logs including wallet addresses, NFC UIDs, full recipient email addresses and error stacks. `POST` accepts arbitrary log injection from anyone. | `curl` returns log entries; `POST` returns `{"success":true}`. `lib/email-service.ts:172` logs `recipient` unredacted. |
| SA-3 | High | The MCP server reads those logs and presents them to an AI agent. Combined with SA-2's open `POST`, this is a prompt-injection path into the user's agent. | `mcp/index.ts` `query_logs` |
| SA-4 | High | `FAUCET_PRIVATE_KEY` defaults to the Anvil/Hardhat account #0 key, which every Ethereum developer possesses. That address currently holds ~0.001 ETH on Base Sepolia and is sweepable by anyone. | `app/api/faucet/route.ts:7`; `eth_getBalance(0xf39Fd6…92266)` = `0x38cc945131f04` |
| SA-5 | Medium | `GET\|POST /api/alerts` allows anyone to read or overwrite alert preferences — including the owner's stored email — for any `rockId`. | `POST` with an arbitrary `rockId` returns `200` and echoes the stored email. |
| SA-6 | Medium | `POST /api/keeper` triggers a rebalance with no authentication. | `200` |
| SA-7 | Medium | `POST /api/alerts/gelato` authenticates on `body.source === 'gelato_keeper'` — a value the caller supplies. `message` is interpolated raw into email HTML. | Currently `500`s outright. |
| SA-8 | Medium | `ADMIN_JWT_SECRET` and `NXP_MASTER_KEY` have insecure defaults (`'fallback-secret-do-not-use-in-prod'`, 32 zeros). If unset in production, admin sessions are forgeable. | `lib/auth.ts:4`, `middleware.ts:10`, `app/api/nfc/verify/route.ts:14` |
| SA-9 | Medium | Webhook and cron secrets use `if (SECRET && mismatch) reject` — an **unset secret means no authentication**. | `app/api/webhooks/alchemy/route.ts:14`, `app/api/cron/snapshot/route.ts:26` |
| SA-10 | Low | `verifyAdminSession()` ignores the `uah` claim it sets; only the middleware checks it. Alchemy signature comparison is non-constant-time. | `lib/auth.ts:33`, `app/api/webhooks/alchemy/route.ts:17` |
| SA-11 | Low | Middleware rate limiting is an in-memory `Map` on Workers — ineffective across isolates. | `middleware.ts:5` |
| SA-12 | Low | The cron secret travels as a query parameter, and therefore into access logs. | `app/api/cron/snapshot/route.ts` |

### Privacy

**Fact:** SA-2 and SA-5 together mean a visitor's email address, entered into the alerts panel, is
retrievable by any anonymous party. This is inconsistent with `/privacy` and with the PII-stripping
work recorded in commit `10b2cbc`.

## 1.5 Correctness bugs

| # | Fact | Evidence |
| --- | --- | --- |
| X-1 | `privy-onboarding-modal.tsx` calls `useEffect` **after** `if (!isOpen) return null`. Hook count changes 1→2 when the modal opens; React throws *"Rendered more hooks than during the previous render."* This is the primary login path. | `components/privy-onboarding-modal.tsx:17,31`; `react-hooks/rules-of-hooks` error |
| X-2 | No `<Toaster />` is mounted, so every `toast.error(...)` in transfer and alerts is silent. Transfer failures show the user nothing. | `app/layout.tsx` |
| X-3 | `transfer-modal.tsx` accepts `.eth` names as valid recipients, then passes the raw string as `0x${string}`. viem throws on encoding. | `components/transfer-modal.tsx:57` |
| X-4 | `lib/utils.ts` re-exports `cn` from the npm `cn` package, not `clsx` + `tailwind-merge`. shadcn components do not resolve Tailwind class conflicts. | `lib/utils.ts` |
| X-5 | The indexer scans a fixed `currentBlock - 50000` window (≈27h at 2s blocks), so provenance silently ages out. `REGISTRY_DEPLOY_BLOCK` is unreachable. Timestamps are fabricated (`now - 3600000`) rather than read from blocks. `formatTimestamp` is unused. A 50k-block `eth_getLogs` will likely be rejected by the public RPC regardless. | `lib/indexer.ts` |
| X-6 | `d1/schema.sql` defines `Events` / `DailyYield`, which nothing uses, competing with the Drizzle schema's `rock_events` / `yield_snapshots`. | `web/d1/schema.sql` vs `web/src/lib/db/schema.ts` |
| X-7 | The Gelato function reads Base **mainnet** USDC against a Sepolia registry, treats the native ETH balance as WETH, and calls `rebalance(address,bytes32)` on the 1inch router — a function that does not exist there. | `web3-functions/bankrock-keeper/index.ts` |
| X-8 | Faucet rate limiting is per-address only (trivially defeated with fresh addresses) and sits behind the broken D1 path. | `app/api/faucet/route.ts` |

## 1.6 External dependencies (verified against Ethereum Sepolia)

Full tables are in [`16-environment-and-secrets.md`](./16-environment-and-secrets.md). The facts
that change the plan:

| # | Fact | Evidence |
| --- | --- | --- |
| E-1 | Aqua is on Sepolia at its canonical address with bytecode identical to mainnet. USDC, WETH, EntryPoint 0.7 and the full Safe 1.4.1 stack are present. Privy and Pimlico support Sepolia. | spec 16 §1.1, §1.4 |
| E-2 | The SwapVM router is on no testnet. We deploy it (plain Ignition deploy, non-canonical address). | spec 16 §1.2 |
| E-3 | **The Aqua ABI in `lib/aa.ts` is wrong.** Real: `ship(address app, bytes strategy, address[] tokens, uint256[] amounts)`. Makers approve **Aqua**, not the app. | `src/interfaces/IAqua.sol` |
| E-4 | No JavaScript SDK exists for SwapVM programs. `@1inch/swap-vm` is not on npm. Strategy bytes must come from a Solidity script or a TS port. | npm registry 404; repo `package.json` has no `main`/`exports` |
| E-5 | The 1inch Swap API serves mainnets only. `/api/quote` cannot work on any testnet and is deleted. | 1inch Business portal, Classic Swap chains list |
| E-6 | Resend's sandbox sender delivers only to the account owner's inbox until `bank-rock.com` is DNS-verified. | Resend docs |
| E-7 | `.env.example` names `NTAG_MASTER_KEY`; the code reads `NXP_MASTER_KEY`. Fourteen variables the code reads are absent from the example file. | spec 16 §2.1 |
| E-8 | Removing `@cloudflare/next-on-pages` and adding `sonner` makes strict `npm ci` succeed with no further peer conflicts. | `npm install --package-lock-only` on a patched `package.json`, exit 0 |

## 1.7 Spec coverage

Specified and **not implemented at all**:

| Spec | Item |
| --- | --- |
| 08 MVP must-have 12 | WebXR / AR visualisation — zero code. Also the opening beat of the demo script. |
| 03, 05, D-010 | ERC-7579 scoped session keys for the MCP runtime. |
| 02 Flow E | Gift handover: pending state, expiry, message, pre-signed asynchronous claim. Transfer is immediate and unconditional. |
| 02 Flow F | Lost tag / replacement tag. *(Explicitly cuttable per spec 08.)* |
| 02 Flow H | Cash In — `dock` is never called anywhere. |
| 02 Flow A | Creator registration UI. *(Explicitly cuttable.)* |
| 04 | Two strategies sharing one Rock Account reserve. |
| 04 | Idle yield deployment into Aave v3 / Morpho. |
| 03, 04 | Cross-chain intent bridging — the modal is a `setTimeout`. |
| 05, D-009, D-011 | Both paymaster modes. |
| 05, D-012 | Atomic UserOp batching — written in `lib/aa.ts`, never called. |
| 14 | Service worker and push delivery. |

---

# Part 2 — Decisions

### D-013 — Demo mode becomes explicit, labelled and opt-in

**Decision:** simulation stops being the silent fallback. A single build-time flag,
`NEXT_PUBLIC_DEMO_MODE`, gates every simulated capability. It defaults to `false`.

**Consequence:** when `false`, a capability that cannot reach its real backing service returns
`UNAVAILABLE` and the UI renders an honest empty or error state. Simulated values are never
produced. When `true`, every simulated surface carries a persistent, non-dismissible `SIMULATED`
badge, and the page header carries a banner.

**Rationale:** the current architecture fails *open* into fiction. Every `catch` block substitutes
plausible data. This is the root cause of C-7 through N-10 and is a single architectural defect,
not thirty separate ones.

**Displaces:** nothing. This is a precondition for the rest.

**Scope of the flag:** `isDemoMode` in `auth-context.tsx` (A-1, A-2) and the judge demo switcher
(F-7) are the same concept and fold into `NEXT_PUBLIC_DEMO_MODE`. With the flag off, the
fabricated wallet, the placeholder app ID and the switcher are not in the bundle, and sign-in
without a configured Privy app renders `UNAVAILABLE`. With the flag on, the switcher may choose
which *badged* scenario is displayed, but may never set the attestation state (D-018) or a
balance.

### D-014 — No synthesized transaction identifiers, ever

**Decision:** the codebase must contain no path that generates a hash-shaped string. A transaction
hash may only originate from a signed, broadcast transaction.

**Consequence:** S-1 through S-4 are deleted rather than relabelled. Where a tx hash is absent, the
UI shows no hash and no explorer link. A `SIMULATED` action in demo mode shows the literal text
`no transaction — simulated`, never a hex string.

**Rationale:** a fabricated BaseScan link is the single most damaging artefact in the repository.
It survives screenshots, and it is indistinguishable from fraud to anyone who clicks it.

**Enforcement:** CI grep for hash-generation patterns (Part 7).

### D-015 — One source of truth for every address

**Decision:** contract addresses and chain IDs live in exactly one module, populated from
environment variables, validated at startup. No address literal may appear in a component, hook,
API route, MCP tool, or keeper function.

**Consequence:** C-1, C-2, C-7, C-8, C-10, N-5 and X-7 collapse into one configuration surface.
Startup fails loudly if a required address is unset or has no code on the target chain.

### D-016 — One Cloudflare adapter

**Decision:** `@opennextjs/cloudflare` is the deployment adapter. `@cloudflare/next-on-pages` is
removed from dependencies and from all imports. Context is obtained via `getCloudflareContext()`.

**Consequence:** fixes R-2, R-3, R-4 and B-2 together. Also removes `export const runtime = "edge"`
where it conflicts with the OpenNext worker runtime.

### D-017 — Fail closed

**Decision:** every authentication check is mandatory. The pattern `if (SECRET && mismatch) reject`
is prohibited. A missing secret is a startup failure, not a bypass.

**Consequence:** SA-8, SA-9 and SA-12 are resolved structurally. A `requireEnv()` helper throws at
module load for any endpoint whose secret is unset.

### D-018 — NFC attestation is server-side, single-implementation, and bound on-chain

**Decision:** one verifier. `actions/verify-ntag.ts` is deleted. The remaining implementation must
perform real NTAG 424 DNA SDM verification: PICC decryption with the correct offsets, NXP session
key derivation, CMAC over the SDM message, and a strictly-monotonic counter check in durable
storage.

**Consequence:** until that implementation passes against a physical tag, the UI must show
`unverified`, never `Verified Physical`. The green badge is gated on a real CMAC match and nothing
else. No client-side code path — the judge demo switcher included — may set the verified state
(F-7). On-chain, `awakenRock` and the claim path require a server-signed EIP-712 attestation bound
to `(rockId, uid, counter)`.

**Threat model:** see Part 5.

**Rationale:** F-1 defeats decision D-002, which is the product's central security claim.

**Amended by D-026 — the attestation has six fields, not three.** What shipped binds
`(rockId, uidHash, counter, deadline, subject, smartAccount)`:

```
Attestation(uint256 rockId,bytes32 uidHash,uint32 counter,uint256 deadline,address subject,address smartAccount)
```

under the domain `BankRockRegistry` / `1` / chain 11155111 / `verifyingContract` = the registry.
`subject` is the wallet the tap authorises and becomes the owner; `smartAccount` is the Rock
Account `awakenRock` is allowed to bind, and it is resolved **server-side** by the verifier — a
`smartAccount` in the query string is ignored, not honoured. Neither attested call reads
`msg.sender`, so both are relayable and neither is malleable: the signature covers every
consequence the call can have. `claimHandover` ignores `smartAccount`, because it changes no
account. See D-026 in [`09-decisions.md`](./09-decisions.md) for the full reasoning.

### D-019 — MCP returns `unavailable`, never invents

**Decision:** every MCP tool either reads a real source or returns
`{ "status": "unavailable", "reason": "<why>" }`. No tool may return a literal balance, APR,
volume, or execution status.

**Consequence:** M-1 and M-2 resolved. `trace_transaction` must perform an actual
`eth_getTransactionReceipt`. `get_rock_status` must read the registry. **Done, since Phase 3
shipped Aqua:** the tool once named `analyze_strategy_yield`, which returned `unavailable` until
Aqua was real, now reads the same `GET /api/rocks/{id}/strategy` route the rock page reads and is
renamed `get_strategy_fees` — a yield or APR figure was never something it could honestly report
(D-004), so the name changed to match what it returns instead of waiting on a number that will
never exist (spec 11).

**Rationale:** an agent relays these values to a human as fact. A stable fabrication is more
dangerous than an obvious one.

### D-020 — The registry loses the arbitrary-call primitive

**Decision:** `executeTrade` is removed in its current form. The registry is an identity and
lifecycle registry only; it never holds funds, never receives approvals, and never performs
`call` with caller-supplied calldata. `setRouterWhitelist` becomes `onlyOwner` or is deleted
with the trade path.

**Consequence:** SC-1 and SC-3 are eliminated by removal rather than mitigation. Swaps execute
from the Rock Account against Aqua, which is where spec 03 always placed them.

**Displaces:** the current (non-functional) trade path must be rebuilt on Aqua. See Phase 3.

### D-021 — Deployment target is Cloudflare, and spec 12 is wrong

**Decision:** [`12-deployment.md`](./12-deployment.md) is corrected to describe Cloudflare Pages +
OpenNext + D1. Vercel is not used.

**Consequence:** R-9 resolved. `deploy.yml` is rewritten to call `npm run deploy:pages`.

### D-022 — The canonical origin is `bank-rock.com`

**Decision:** one `NEXT_PUBLIC_APP_URL`, defaulting to `https://bank-rock.com`. No `bankrock.xyz`
or `pages.dev` literal may remain. The NFC tag path is `/r/{publicRockId}` as specified in spec 06,
implemented as a route that resolves to the rock page.

**Consequence:** R-1, R-7, R-8 resolved. **No physical tag may be encoded until `/r/` returns 200
and the `www` redirect is fixed.**

---

# Part 3 — Capability states

This is the mechanism D-013 introduces. Every user-visible capability is in exactly one state at
runtime, and the state is computed, not assumed.

| State | Meaning | UI contract |
| --- | --- | --- |
| `REAL` | Backed by a live contract, RPC, or database read. | Render normally. Explorer links permitted. |
| `DEMO` | Simulated, and `NEXT_PUBLIC_DEMO_MODE=true`. | Persistent `SIMULATED` badge on the surface. No tx hashes. No explorer links. Page-level banner. |
| `UNAVAILABLE` | Real backing unreachable and demo mode off. | Honest empty state naming what is missing. No substituted values. |

Target state per capability at each phase:

| Capability | Now | After P1 | After P2 | After P3 | After P4 |
| --- | --- | --- | --- | --- | --- |
| Rock lifecycle state | DEMO (hardcoded) | UNAVAILABLE | REAL | REAL | REAL |
| Rock Account address | DEMO (literal) | UNAVAILABLE | REAL | REAL | REAL |
| Token reserves | DEMO | UNAVAILABLE | REAL | REAL | REAL |
| Provenance timeline | DEMO | UNAVAILABLE | REAL | REAL | REAL |
| Aqua strategy | DEMO | UNAVAILABLE | UNAVAILABLE | REAL | REAL |
| Visitor swap | DEMO | UNAVAILABLE | UNAVAILABLE | REAL | REAL |
| Earned fees | DEMO | UNAVAILABLE | UNAVAILABLE | REAL | REAL |
| APY display | DEMO | **removed** | removed | removed | removed |
| NFC attestation | DEMO (accepts all) | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | REAL |
| Ownership transfer | DEMO | UNAVAILABLE | REAL | REAL | REAL |
| Cross-chain deposit | DEMO | DEMO (badged) | DEMO (badged) | DEMO (badged) | DEMO (badged) |
| Keeper rebalance | DEMO | DEMO (badged) | DEMO (badged) | DEMO (badged) | DEMO (badged) |
| Alerts delivery | DEMO | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE |
| Admin dashboard | DEMO | DEMO (badged) | REAL | REAL | REAL |
| MCP tools | DEMO | UNAVAILABLE | REAL (partial) | REAL | REAL |
| User identity (Privy sign-in) | DEMO (fabricated wallet when unconfigured) | UNAVAILABLE until the app ID is set, then REAL | REAL | REAL | REAL |
| Judge scenario switcher | DEMO (always on, sets attestation) | DEMO (flag only; cannot set attestation or balances) | DEMO (badged) | DEMO (badged) | DEMO (badged) |
| Shop contact / vanity forms | DEMO (fake success) | UNAVAILABLE or REAL (D1 write) | REAL | REAL | REAL |

**Note:** APY is *removed*, not staged. It cannot be `REAL` — decision D-004 forbids the claim
regardless of data quality.

## After this branch

The phase columns above are the plan. This column is the code, read on 2026-09-12 on branch
`exit-from-demo-mode`. Two states are distinguished, because they fail differently in front of a
judge:

- **REAL (needs config)** — the code path is complete and reaches a live contract, RPC or
  database. It renders `UNAVAILABLE` naming the missing variable until the secret is set or the
  contract is deployed. Nothing is fabricated in either case.
- **UNAVAILABLE (no path)** — there is no implementation to configure, on purpose.

| Capability | After this branch | What makes it REAL |
| --- | --- | --- |
| Rock lifecycle state | REAL (needs config) | Registry deployed; `NEXT_PUBLIC_REGISTRY_ADDRESS` |
| Rock Account address | REAL (needs config) | `NEXT_PUBLIC_PIMLICO_API_KEY`; derived, not deployed |
| Token reserves | REAL | `ERC20.balanceOf(rockAccount)`; token addresses are fixed |
| Provenance timeline | REAL (needs config) | `SEPOLIA_RPC_URL` + `REGISTRY_DEPLOY_BLOCK` |
| Aqua strategy (ship / dock) | REAL (needs config) | `NEXT_PUBLIC_AQUA_APP_ADDRESS` |
| Visitor swap | REAL (needs config) | `NEXT_PUBLIC_AQUA_TAKER_ADDRESS` as well (D-030) |
| Earned fees | REAL (needs config) | App address + a provider RPC for the `Pushed` log range |
| APY display | removed | Never returns (D-004) |
| NFC attestation | REAL (needs config) | `NXP_MASTER_KEY` + attester key + a tag |
| Ownership transfer | REAL (needs config) | Registry + `RELAYER_PRIVATE_KEY` (D-027) |
| Archive and start over | REAL (needs config) | Registry; releases the tag binding (D-028) |
| Cross-chain deposit | DEMO (badged) | Nothing — no bridge is integrated |
| Keeper rebalance | UNAVAILABLE in data, DEMO in UI | Nothing — it invents no position |
| Alerts delivery | UNAVAILABLE | Nothing — the pipeline is cut (Part 6) |
| Admin dashboard | REAL (needs config) | D1 bound; admin session required |
| MCP tools | REAL (partial) | `SEPOLIA_RPC_URL` + registry address; reads only |
| User identity (Privy sign-in) | REAL (needs config) | `NEXT_PUBLIC_PRIVY_APP_ID`; no fake wallet left |
| Judge scenario switcher | DEMO (flag only) | Cannot set attestation or any balance |
| Shop contact / vanity forms | REAL (needs config) | D1 bound; no success state without a write |
| AR / WebXR view | UNAVAILABLE (no path) | Cut in Part 6 |

The living, one-line-per-item version of this, with the condition that makes each entry real, is
[`../DEMO-STATE.md`](../DEMO-STATE.md) (Phase 6 item 4, STEERING rule 1).

**Keeper rebalance, stated precisely:** `lib/aqua-keeper.ts` no longer synthesizes anything — both
entry points return `UNAVAILABLE` naming the missing prerequisites, and no transaction hash can
originate there. The *surface* remains a badged `DEMO` beat because the Gelato function behind it
still targets an interface that does not exist (X-7).

---

# Part 4 — Exit phases

Each phase is independently shippable and has a binary acceptance test.

## Phase 0 — Restore the pipeline

Nothing else can be verified while the build is red.

1. Add `sonner` to `package.json`; mount `<Toaster />` in `app/layout.tsx` (B-1, X-2).
2. Remove `@cloudflare/next-on-pages` (D-016) — this also clears the `npm ci` peer conflict (B-2).
3. Fix the `useEffect`-after-early-return in `privy-onboarding-modal.tsx` (X-1).
4. Clear the 48 lint errors (B-3).
5. Delete one lockfile; align CI with the declared package manager (B-6).
6. Rewrite `deploy.yml` to call `npm run deploy:pages` (B-5).
7. Add a `contracts` job running `npm test` (B-7).
8. ~~Correct `mcp/package.json` version pins (B-8).~~ Withdrawn. In its place: untrack
   `mcp/node_modules` (B-9) — **done** in `e574ad5`.
9. Fix the `www` redirect rule in the Cloudflare dashboard (R-1).

**Acceptance:** `npm ci && npm run lint && npm run build` exits 0 from a clean checkout. CI is
green. `curl -sL -o /dev/null -w "%{http_code}" https://www.bank-rock.com` returns 200.

## Phase 1 — Honest data plane

Stop lying before starting to tell the truth. This phase adds no features.

1. Introduce `NEXT_PUBLIC_DEMO_MODE` and the three capability states (D-013).
2. Switch all 9 D1 call sites to `getCloudflareContext()` (D-016, R-2, R-3).
3. Delete every synthesized hash (D-014): `rock-interface.tsx:257`, `aqua-position-card.tsx:56`,
   `cross-chain-modal.tsx:248,263`, `aqua-keeper.ts:132`.
4. Delete `INITIAL_EVENTS` and the mock fallbacks in the yield and activity routes.
5. Remove APY from every surface (N-3, D-004).
6. Centralise addresses (D-015); delete `d1/schema.sql` (X-6); one `NEXT_PUBLIC_APP_URL` (D-022).
7. Make `sendAlertEmail` return `success: false` when it did not send (S-5).
8. Delete the fabricated sign-in (A-1, A-2): with no valid `NEXT_PUBLIC_PRIVY_APP_ID` the auth
   control renders `UNAVAILABLE` and no address is ever shown. Fold `isDemoMode` into the flag.
9. Gate the demo switcher on the flag and remove its ability to set `verificationResult`,
   `liquidity` or `earnedFees` (F-7, N-11).
10. Contact and vanity forms (S-6, S-7): write to D1 through the Phase 1 adapter, or render
    `UNAVAILABLE`. A success state may not be shown for a request that was not sent.

**Acceptance:** with `NEXT_PUBLIC_DEMO_MODE=false`, a rock page shows no balance, no fee figure,
no APY and no provenance entries — because none of it is real yet. With no Privy app ID
configured, sign-in shows `UNAVAILABLE` and no wallet address appears anywhere. No control on
the page can produce the green `Verified Physical` badge. *(The `GET /api/rocks/1/yield` clause of
this acceptance is void: the route, and the empty History chart it was meant to fill, have since
been deleted — nothing called either, and the position card's fee figures are summed from Aqua's
own `Pushed` events instead.)* `grep -rE "Math\.random\(\).*16"`
over `web/src` returns nothing.

## Phase 2 — Real chain

**Status:** items 1–7 are **done in code**; items 2's deploy step and everything downstream of it
**need a deploy**. Marked per item below.

1. **Done.** Rewrite `BankRockRegistry.sol` per D-020 and D-018: remove `executeTrade` and
   `setRouterWhitelist`; add `Ownable`; gate `awakenRock` on a server-signed EIP-712 attestation;
   add pending-handover state with expiry for Flow E (SC-5). Beyond the original scope:
   `Pausable`, the six-field attestation (D-026), `archiveRock` (D-028), the informational lost
   flag, and owner-gated actions that accept the rock's Safe as well as the owner wallet.
2. **Script done, deploy pending.** `contracts/scripts/deploy.js` is a real deploy: it
   broadcasts, waits for the receipt, reads the attester back off the chain, writes
   `contracts/deployments/sepolia.json` and prints `NEXT_PUBLIC_REGISTRY_ADDRESS` and
   `REGISTRY_DEPLOY_BLOCK`. It holds no address literal. The Sepolia switch (imports, chain list,
   Pimlico URL, explorer links, token addresses, hardhat network) is done. **Needs a deploy** and
   a source verification on Sepolia Etherscan.
3. **Done, differently.** The Safe is not created by a separate step: its address is
   counterfactual, derived from (owner, `saltNonce = uint256(uidHash)`) and signed into the
   attestation (D-029), and the first sponsored UserOperation deploys it while doing the work.
   `hooks/useBankRock.ts` and `hooks/useRockAccount.ts` are the call sites; `lib/aa.ts`'s role is
   now filled by `lib/rock-account.ts`.
4. **Done.** Lifecycle, owner, Rock Account address, lost flag and handover come from `getRock`.
5. **Done.** The indexer scans forward from `REGISTRY_DEPLOY_BLOCK` in 2,000-block chunks, reads
   the block's own timestamp, and uses the current event vocabulary —
   `RockOwnershipTransferred` is gone, `HandoverClaimed` and `RockArchived` are in (X-5, C-3).
6. **Done.** `GET /api/admin/stats` reads D1 behind the admin session and says so when the
   database holds nothing (N-7).
7. **Done.** `FAUCET_PRIVATE_KEY` is required with no default, and the limits are per address and
   per IP in D1 (SA-4, X-8).

**Acceptance:** `eth_getCode` at the configured registry returns non-empty. Awakening a rock from a
fresh Privy account produces a real, explorer-verifiable transaction and a Safe whose address the
UI displays. `GET /api/events?rockId=N` returns that awakening with the block's own timestamp.
Two browsers show the same state for the same rock.

## Phase 3 — Real Aqua

This is the sponsor integration and the reason the project exists.

**Status:** the path is decided and built (**D-030**). Items 2–7 are done in code; item 1 was
superseded; item 8 is unblocked but not shipped. Everything here needs the app deploy.

1. ~~Deploy `SwapVMRouter`.~~ **Superseded by D-030 — and the instruction was wrong twice.**
   (a) For Aqua-shipped strategies the module is **`AquaSwapVMRouter`**
   (`ignition/modules/AquaSwapVMRouter.ts`); plain `SwapVMRouter` carries no `AquaOpcodes` and
   cannot read or move Aqua balances at all. (b) The path taken is **not** SwapVM: it is the
   reference constant-product **`XYCSwap`** AquaApp, vendored unmodified and deployed by
   `contracts/scripts/deploy-aqua-app.js` together with the `XYCSwapTaker` periphery, against the
   canonical Sepolia Aqua. The router is 20 KB of virtual machine whose *program* bytes still have
   no JavaScript path; the app is 5 KB that maps directly onto spec 04's constant-product
   strategy. The router route stays documented, with the deploy steps and what it would change,
   in `contracts/scripts/deploy-swapvm-router.md`.
   There is no `NEXT_PUBLIC_SWAPVM_ROUTER_ADDRESS`.
2. **Done — E-4 is resolved, on both paths.** For XYCSwap,
   `strategy = abi.encode(Strategy{maker, token0, token1, feeBps, salt})` with
   `salt = keccak256(abi.encode(keccak256("bankrock.aqua.strategy.v1"), rockId, streamIndex))` and
   `strategyHash = keccak256(strategy)`. The SwapVM hypothesis was checked anyway and is **true**:
   `strategy = abi.encode(order)`, `strategyHash == swapVM.hash(order)`. What is still unsolved on
   that path is the *program* bytes, which are Solidity-only. Full reading:
   [`../contracts/contracts/aqua/NOTES.md`](../contracts/contracts/aqua/NOTES.md).
3. **Done.** The correct Aqua ABI is in `lib/chain/abi/aqua.ts` (E-3) and `lib/aqua/calls.ts`
   builds the atomic batch (D-012): `approve(Aqua, USDC)`, `approve(Aqua, WETH)`,
   `Aqua.ship(app, strategy, [USDC, WETH], [a, b])`. The maker approves **Aqua**, never the app.
4. **Done.** The visitor swap runs from the visitor's own personal Safe (salt 0, D-029) through
   `XYCSwapTaker`, never from the registry (SC-4, D-020) — and it must, because `XYCSwap` calls
   `xycSwapCallback` back into its caller and a plain wallet cannot answer it (D-030).
5. **Done.** `lib/aqua/read.ts` reads actual, virtual and *executable* separately and never sums
   virtual balances across streams.
6. **Done, with the semantics corrected.** `dock` returns nothing, because nothing ever left the
   maker's wallet: docking zeroes the virtual balances and *is* the withdrawal. The UI must not
   promise an incoming transfer (Flow H).
7. **Done.** `/api/quote` and `1INCH_API_KEY` are deleted (E-5). The quote source is
   `XYCSwap.quoteExactIn(strategy, zeroForOne, amountIn)` — the identical code path
   `swapExactIn` runs, on the same block's balances — with the mirrored integer maths in
   `lib/aqua/quote.ts` as a preview only. `quoteExactOut` is **not** the inverse of
   `quoteExactIn`; the swap path is exact-in only, so that asymmetry never reaches a user.
8. **Unblocked, not shipped.** A second strategy sharing one reserve is a second `streamIndex` and
   nothing more; `SharedReserve.t.sol` pins the behaviour. It stays last in line (spec 08's
   fallback order, item 4).

**Acceptance:** a second Privy account executes a real swap against a rock's strategy; the rock's
actual and virtual balances both change on-chain; the fee figure shown is read from Aqua, not
computed client-side. Two strategies share one reserve and the UI shows availability correctly.

**Acceptance, restated for the fee figure (D-030):** "read from Aqua" means the **rate** is
`feeBps` read out of the strategy, and the **cumulative amount** is
`Σ Pushed.amount · feeBps / 10000` over that strategy's `Pushed` events, excluding the two the
ship itself emits. There is no fee accumulator to read: the fee is the unpriced slice of the
input and accrues inside the rock's own reserve. A figure derived from balance deltas is P&L, not
fees, and is forbidden.

## Phase 4 — Real NFC

**Status:** items 1–4 and 6–8 are **done in code**; item 5 is operator work; nothing here has been
tested against a physical tag.

1. **Done.** One verifier. `actions/verify-ntag.ts` no longer holds an implementation
   (D-018, F-1).
2. **Done.** `lib/nfc/sdm.ts` performs PICC decryption at the correct offsets, NXP SV1/SV2
   session-key derivation, the CMAC and its odd-byte truncation (F-3). **Unverified against a
   physical tag** — that is the one thing code cannot settle.
3. ~~Add `nodejs_compat`.~~ Not needed (F-4 withdrawn). Keep `compatibility_date >= 2026-08-04`.
4. **Done.** The counter store is D1 (`nfc_counters`) with a conditional update; the in-memory
   store is selected only when `NEXT_PUBLIC_DEMO_MODE=true` (R-4).
5. **Operator work.** Generate `NXP_MASTER_KEY`, write it to the tags, and keep it in Cloudflare
   secrets — it is not in `.env.example` and must not be. Settings: spec 18 §4.2.
6. **Done.** `/r/{publicRockId}` exists and preserves the query verbatim on the hop to the rock
   page. It deliberately does **not** verify: verification advances the tag's counter, and a
   counter advanced on a redirect would burn the tap (R-7, D-022).
7. **Done, and widened.** The attestation binds the claim path *and* the awakening, and names the
   Rock Account as well as the subject (D-026). `verifiedPubKey` is gone (F-5); the registry
   consumes the counter on-chain and rejects a reused one (F-6).
8. **Done.** No client-side code path can set the verified state; the judge switcher has no
   callback that could (F-7).

**Also delivered here, and not in the original plan:** the verifier resolves the *effective* rock
after the CMAC match and before the counter advance — `bound` / `url` / `next_free` /
`registry_unavailable` — and signs the attestation for the effective id, never for the id written
on the tag (D-028).

**Acceptance:** a physical tap shows `Verified Physical`. Replaying that exact URL a second time is
rejected as a stale counter. A hand-edited `?c=` value shows `unverified`. **A copied URL never
displays a green badge.** *This is the acceptance test for decision D-002 and cannot be waived.*

## Phase 5 — Close the perimeter

Can run in parallel with Phases 2–4.

1. Authenticate or delete `/api/alerts/test` (SA-1), `/api/telemetry` (SA-2), `/api/alerts`
   (SA-5), `/api/keeper` (SA-6), `/api/alerts/gelato` (SA-7).
2. Apply D-017 to every secret check (SA-8, SA-9).
3. Redact PII before it reaches the log buffer (SA-2, privacy).
4. Move rate limiting to D1 or Durable Objects (SA-11).
5. Cron secret moves to a header (SA-12).
6. Constant-time signature comparison; `verifyAdminSession` checks `uah` (SA-10).
7. Escape interpolated values in email HTML (SA-7).

**Acceptance:** every endpoint under `/api/` either requires a credential, is intentionally public
and read-only with no PII, or is deleted. An unauthenticated sweep of all routes returns no
address, email, UID, or stack trace.

## Phase 6 — Honesty pass

**Status:** items 1, 2 and 6 are done in code; 3, 4 and 5 are done in this documentation pass.

1. **Done.** `SimulatedBadge` and `UnavailableState` are primitives, applied surface by surface.
2. **Done.** `web/src/components/ui/demo-banner.tsx`.
3. **Done.** `README.md` now states the real state instead of "Specification and technical
   validation only."
4. **Done.** [`../DEMO-STATE.md`](../DEMO-STATE.md) is the living list, one line per item with
   the spec ID and the condition that makes it real (STEERING rule 1). §1.3 stays frozen as the
   audit baseline.
5. **Done.** Spec 12 describes Cloudflare and the current deploy order (D-021); spec 06 now
   carries the exact tag URL template, points at spec 18 §4.2 for the SDM settings, and records
   that the URL never changes across an archive (D-028).
6. **Done.** Every `SIMULATED` badge, the banner and every `UNAVAILABLE` empty state follow the
   type scale, contrast tokens and 44 px targets of
   [`17-mobile-ui-and-typography.md`](./17-mobile-ui-and-typography.md) — U0–U3 landed before
   this phase, as required, and U4 has since landed as well (D-031).

**Acceptance:** every simulated pixel is labelled. A judge shown the app with
`NEXT_PUBLIC_DEMO_MODE=true` can identify what is real without asking.

---

# Part 5 — Threat model for the exit work

Required by the spec rules for security-sensitive behaviour.

## NFC attestation (D-018)

| Threat | Mitigation | Residual |
| --- | --- | --- |
| URL copied from a genuine tap and replayed | Strictly monotonic `SDMReadCtr` in durable storage; counter must exceed the last recorded value for that UID | A copy replayed *before* the genuine user's next tap still presents a fresh counter. Accepted: it requires observing the tap. |
| Tag cloned bit-for-bit | AES-128 master key is never on the tag in readable form; CMAC requires the diversified key | Physical key extraction from the chip. Out of scope; NTAG 424 DNA is the stated boundary (spec 06). |
| Forged `c` parameter | CMAC verified server-side against the derived session key | None if the master key stays secret. |
| Master key disclosure | Cloudflare secret; never in `.env.example`; rotate per batch | Full compromise of all tags in a batch. Accepted for the hackathon; per-tag diversification is the post-hackathon fix. |
| Attestation replayed against the chain | EIP-712 payload binds `(rockId, uidHash, counter, deadline, subject, smartAccount)`; the registry requires a strictly higher counter for that UID | Requires the attestation signer key to stay secret. |
| Attestation re-submitted by an observer naming their own Safe | `awakenRock` requires `att.smartAccount == smartAccount`, and the field is inside the signature (D-026) | None. A relayer can only carry out the awakening the attester already authorised. |
| Attestation replayed across an archive boundary | `lastCounter(uidHash)` is never reset — replay protection follows the tag, not the rock (D-028) | None. |
| **Attester chooses which account a rock binds to** (audit `N-7`, D-032) | Since D-032 `claimHandover` writes `rock.smartAccount = att.smartAccount`, so the signer decides, at claim time, which account the rock's money is recorded against and which address the owner-action gate will admit. Mitigated on chain: the registry asks that account, through `ISafeOwnerManager.isOwner`, whether it already answers to `att.subject`, and refuses the claim otherwise — so the attester can only name an account the new owner already controls. `claimHandover` is `whenNotPaused`, so the pause switch stops this path too | **Attester key compromise is a transfer of title.** A compromised signer cannot choose *who* receives a named gift — `att.subject` must equal the recipient the owner named — but it can bind the rock to any contract that answers `isOwner(newOwner)`, installing itself as a permanent co-controller able to `archiveRock`, `initiateHandover` and `markLost`. It also redirects `describeRock().rockAccount`, which is where the app says the rock's money lives, and therefore where the next deposit goes. Rotation is `setAttester`, `onlyOwner`, and the zero address is rejected. The key is a Cloudflare secret and nothing else — never a file, never the deployer key (spec 16 #17) — and it is unfunded, so it never transacts. `bytes32 action` (spec 19 `PM-1`) narrows what one signature can authorise and is mandatory before a value-bearing network |

**Non-goal, restated from spec 06:** physical possession is never sufficient financial
authorization. Attestation gates *claiming*, never *spending*. **Refined by D-032:** it also gates
*which account is recorded as holding the rock's money*, which is a different power from claiming
and is why the row above exists. It still never authorises a transfer out of that account.

## Registry (D-020)

| Threat | Mitigation |
| --- | --- |
| Arbitrary call from the registry (SC-1) | The primitive is removed, not guarded. |
| Rock squatting / front-running `awakenRock` (SC-2) | Requires a server-signed attestation bound to a verified tap. |
| Ownership seized mid-handover (SC-5) | Pending handover with expiry; a named recipient is matched against `att.subject`, not against the sender. |
| A cancelled gift's pre-signed Safe owner swap surviving | The claim route deletes the stored operation after submitting, and cancelling the handover discards it (D-027). |
| The claim relayer redirecting a gift to itself | It cannot: ownership comes from `att.subject`, inside the signature. `msg.sender` is not an input (D-026). |
| The giver's Safe keeping controller rights over a rock it no longer owns (audit `F-1` / `N-1`) | D-032: the claim rebinds `rock.smartAccount`, **and** the registry requires that account to already report the new owner as a signing owner. Asking the old account `isOwner` was not enough on its own — a Safe's owner set is writable by the Safe, so the giver could answer `true` for one batched transaction, `archiveRock` the recipient's rock, and remove the signer again. |
| A claim landing while the Rock Account is still the giver's | The pre-signed owner swap runs first and only a UserOperation receipt with `success === true` counts as landed; the route refuses an attestation with under 90 s of life, so the irreversible half cannot run against a claim that will then expire (audit `N-6`). |
| An **open** gift claimed with no account hand-over | The app issues none: the transfer sheet requires a named recipient and the claim route refuses to relay `recipient == address(0)` (D-032). The contract still accepts open handovers, so a hand-built one is possible — and the on-chain `isOwner` check means it can only bind an account the claimant already controls. |
| Registry holding value | It never holds tokens and never receives approvals. Assets live in the Rock Account. |

## Demo mode itself

| Threat | Mitigation |
| --- | --- |
| Demo mode enabled in production by accident | Defaults to `false`; the banner is non-dismissible; a CI check asserts the production build has it off. |
| A `DEMO` value read by the MCP server and relayed to a user as fact | D-019: tools return `unavailable` rather than demo values. Demo mode is a UI concept and never crosses the MCP boundary. |
| Screenshot of demo mode mistaken for real | Badges are rendered, not overlaid — they survive screenshots. |

---

# Part 6 — Scope displacement

Spec rule: *scope additions must identify what they displace.* This work displaces the following,
which are hereby cut from MVP scope:

| Cut | Was specified in | Rationale |
| --- | --- | --- |
| WebXR / AR view | 08 must-have 12 | Zero implementation exists. It is a presentation flourish; Phases 2–4 are the submission. |
| ERC-7579 session keys | 03, 05, D-010 | Depends on a working Rock Account and a working Aqua integration, neither of which exists. Post-hackathon. |
| Cross-chain intent bridging | 03, 04 | Remains `DEMO` with a badge. Honest simulation is acceptable here; it is explicitly a "platform potential" beat, not a must-have. |
| ERC-20 token paymaster | 05, D-011 | The verifying paymaster alone satisfies the zero-gas demo beat. |
| Idle yield (Aave/Morpho) | 04 | Not a must-have; adds a second protocol integration during a phase that has none working. |
| Alerts delivery pipeline | — | The settings UI stays, marked `UNAVAILABLE`. Building delivery before any real event exists is premature. |
| Replacement tags, creator registration UI | 02 Flows A, F | Already listed as first to cut in spec 08's fallback order. |

This ordering is consistent with spec 08: *"Never cut the real NFC interaction, Privy onboarding,
working Aqua transaction or security model."* Phases 2, 3 and 4 are precisely those four items.

---

# Part 7 — Definition of done

Mechanically checkable. **The static checks below are implemented in
[`../scripts/spec-checks.sh`](../scripts/spec-checks.sh)**, which runs both this section and spec
17 Part 7, prints the spec ID and PASS/FAIL for each, shows the offending lines on a failure, and
exits non-zero if any check fails. There are **21 checks** (20 at the time of writing; D-034 was added on 2026-09-12), and they are expected to pass on
every pull request.

Three deviations from the literal greps here are implemented in the script and documented in its
header: build output and installed packages are excluded everywhere (a `pages.dev` string inside
a dependency is not a D-022 violation); `--exclude-dir=chain` is used rather than the path form,
because GNU grep matches that option against the directory's *basename* and the path form would
pass vacuously; and a check whose target file is missing FAILs rather than passing quietly.

CI runs it as the `spec-checks` job, and **that job is blocking** (spec 17 U4, D-031). The browser
half of spec 17 Part 7 runs alongside it as `e2e-responsive`: Playwright over the route × viewport
matrix plus `axe-core`, against a production build with `NEXT_PUBLIC_DEMO_MODE=true` so every
surface renders. That job configures no chain, so the two checks that need a live rock skip with a
reason instead of failing; the Lighthouse budget stays a manual check.

The build, lint, typecheck, test and `npm run build` steps are separate CI jobs; the live `curl`
and `cast code` assertions need a deployed site and a deployed contract, so the script does not
attempt them.

```
# Build integrity
npm ci && npm run lint && npm run build          # exit 0, clean checkout
cd contracts && npm test                          # exit 0

# No synthesized evidence (D-014)
! grep -rE "Math\.random\(\)[^;]*16\)\.toString\(16\)" web/src
! grep -rP "(txHash|Hash)\s*=\s*\`0x\\\$\{(?!string\})" web/src   # excludes the `0x${string}` viem type

# No address literals outside the config module (D-015)
! grep -rE "0x[a-fA-F0-9]{40}" web/src --exclude-dir=chain --exclude="*.test.ts"   # basename match; test vectors may hold addresses

# No demo fallback in production (D-013). Secrets live in the Cloudflare dashboard, not in files
# (spec 16), so the assertion is on the deploy job, which must set the flag explicitly.
grep -q 'NEXT_PUBLIC_DEMO_MODE: "false"' .github/workflows/deploy.yml
! grep -rE "DEMO_WALLET_ADDRESS|clp1234567890abcdef123456|bankrock_auth_demo_session" web/src   # A-1, A-2

# One adapter (D-016)
! grep -r "@cloudflare/next-on-pages" web/

# Fail closed (D-017) — catches both the inline and the assigned-to-const form
! grep -rE "if \([A-Za-z_.]*[A-Z_]{4,}[A-Za-z_.]* && " web/src/app/api

# One origin (D-022)
! grep -rE "bankrock\.xyz|pages\.dev" web/src mcp web3-functions

# APY removed (D-004)
! grep -riE "\bAPY\b|\bAPR\b" web/src/components
```

Live assertions:

```
curl -sL -o /dev/null -w "%{http_code}" https://www.bank-rock.com          # 200
curl -s -o /dev/null -w "%{http_code}" https://bank-rock.com/r/1           # 200
curl -s -o /dev/null -w "%{http_code}" https://bank-rock.com/api/rocks/1/activity  # 200
# (/api/rocks/1/yield was deleted with the empty History chart — nothing called it.)
curl -s https://bank-rock.com/api/telemetry                                # 401 or 404
curl -s -X POST https://bank-rock.com/api/alerts/test -d '{"to":"x@y.z"}'  # 401
cast code $REGISTRY_ADDRESS --rpc-url $RPC_URL                             # non-empty
```

And the one test that cannot be automated:

> Open a rock page. Copy the URL from the address bar. Paste it into a different browser.
> **The badge must read `unverified`.**

---

# Part 8 — What remains simulated after exit

Stated plainly so it can be stated plainly to judges. The living, per-item version with the
condition that clears each one is [`../DEMO-STATE.md`](../DEMO-STATE.md).

- Cross-chain deposit — `DEMO`, badged. No bridge is integrated.
- Keeper rebalancing — **deleted, not rewritten (D-035).** `X-7` is closed by deletion: the Gelato
  function targeted an interface that does not exist, and rather than repoint it at the current
  registry and Aqua path, `web3-functions/`, `/api/keeper`, `lib/aqua-keeper.ts` and the MCP
  `run_aqua_keeper` tool are gone. There is no keeper surface left to badge. A real rebalancer is
  post-hackathon roadmap (spec 13).
- Alert delivery — `UNAVAILABLE`. Preferences persist, behind a verified Privy token; nothing
  dispatches.
- Fiat on-ramp / off-ramp (Flows G, H fiat legs) — out of scope per spec 08, unchanged. Note that
  Flow H's on-chain leg is *not* simulated: `dock` is real, and docking is the withdrawal.
- AR view — cut (Part 6). The demo script's opening beat is rewritten without it (spec 08).
- The second strategy sharing one reserve — not shipped. Unblocked: it is one more `streamIndex`.

And two that are neither simulated nor real, because no deploy has happened yet:

- Everything downstream of the registry deploy — lifecycle, ownership, provenance, archive —
  renders `UNAVAILABLE` naming `NEXT_PUBLIC_REGISTRY_ADDRESS` until `contracts/scripts/deploy.js`
  has run.
- Everything downstream of the Aqua app deploy — ship, dock, visitor swap, fees, quotes — renders
  `UNAVAILABLE` naming `NEXT_PUBLIC_AQUA_APP_ADDRESS` / `NEXT_PUBLIC_AQUA_TAKER_ADDRESS` until
  `contracts/scripts/deploy-aqua-app.js` has run.

That distinction is the point of D-013: an unconfigured capability says what is missing; it never
substitutes a number. Everything else is either real or shows an honest empty state. That is the
exit condition.

---

## Amendments to the decision log

Decisions D-013 through D-022 are added to [`09-decisions.md`](./09-decisions.md), and
**D-026 through D-031** record what was decided while this plan was implemented: the six-field
attestation and the relayable calls (D-026), handover as the only ownership path (D-027), archive
and start over (D-028), the Rock Account salt rule (D-029), the XYCSwap path and its taker
periphery (D-030), and the delivered UI contract with its mechanical checks (D-031).

Open question 11 is added: **which network actually hosts a usable Aqua deployment?** C-4 exists
because this was never verified. Phase 3 does not start until it is answered. *Answered by D-023
and closed by D-030.* Open question 12 records the resolution of **E-4**, the strategy encoding,
on both the XYCSwap and SwapVM paths.

## Relationship to spec 17

[`17-mobile-ui-and-typography.md`](./17-mobile-ui-and-typography.md) is UI-only work with its
own phases (U0–U4). **U0–U3 landed before Phase 6, as required, and U4 — the blocking spec-check
job and the Playwright viewport matrix — has landed too** (D-031). It runs in parallel with
Phases 1–5 above and must land before Phase 6: the
`SIMULATED` badge, the demo banner and the `UNAVAILABLE` empty states introduced by D-013 are new
surfaces and are built to that contract, not retrofitted. The two documents share one rule: a
badge, banner or empty state is rendered into the layout, never overlaid, so it survives a
screenshot.

## Second-review changes (this branch)

Ledger additions A-1, A-2, F-7, S-6, S-7, N-11; B-9 marked resolved; Phase 0 item 8 corrected
(B-8 was withdrawn); Phase 1 items 8–10 and acceptance; Phase 3 renumbered (two items were
numbered 3); Part 7 `--exclude-dir` fixed and the `.env.production` check replaced (no such file
exists by design — spec 16 puts secrets in the dashboard); capability table rows for identity,
the switcher and the forms.

## Third-pass changes (this branch, after implementation)

Part 3 gains the **After this branch** table — the code's state, with `REAL (needs config)`
separated from `UNAVAILABLE (no path)` because they fail differently in front of a judge. D-018
is amended for the six-field attestation (D-026). Phases 2, 3, 4 and 6 are marked item by item as
done in code, needing a deploy, or operator work. Phase 3 step 1 is corrected twice over: the
Aqua-capable SwapVM module is `AquaSwapVMRouter`, not `SwapVMRouter`, and the path taken is
neither — it is the reference `XYCSwap` app plus the `XYCSwapTaker` periphery (D-030). Part 5
gains three attestation threats and three registry threats that the implemented design answers.
Part 7 names `scripts/spec-checks.sh` and records that the job is blocking, alongside the
Playwright matrix U4 added. Part 8
separates "simulated" from "not deployed yet". Part 1 is untouched: it is the audit baseline, and
the living replacement for its §1.3 is [`../DEMO-STATE.md`](../DEMO-STATE.md).
