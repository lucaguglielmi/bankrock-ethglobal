# Privy prizes: qualification and the three integrations

## Purpose

This document answers one question — **which of Privy's prizes can Bank Rock qualify for, as the
requirements were published, and what closes each gap** — and then specifies the three pieces
that were missing: Privy's Earn capability (*Savings*, Parts 2–9), universal deposit addresses
(Part 11) and the Agent Wallet CLI (Part 12).

The source is the prize page at `ethglobal.com/events/newyork2026/prizes/privy`, read on
2026-09-12. Privy offers **four prizes of $1,250**. Bank Rock is in the **build-from-scratch
track**, so the fourth — *Best Existing Project Upgraded with Privy*, "only available to
Continuity Track participants" — is not open to it. The other three are, and nothing on the page
says a project may win only one. Each requires the same two sentences: use Privy embedded wallets,
and include a short explanation of how Privy was used in the submission.

Everything marked **Fact** below was read from Privy's documentation or SDK on 2026-09-12, with
the source named. Everything marked **Hypothesis** cannot be verified without a Privy app secret
and a funded wallet, and is listed in Part 7 as something the operator proves during rehearsal.

---

## Part 1 — The four prizes, and where Bank Rock stands

### 1.1 Best Onchain Financial Product — "hold, grow, spend, or manage assets onchain"

Requirements, verbatim: embedded wallets; "integrate Privy's Earn capability"; "your demo should
clearly show users depositing, managing, or earning on assets"; the explanation.

| # | Requirement | Before this spec | After this spec | What only the operator can do |
| --- | --- | --- | --- | --- |
| Q-1 | Use Privy embedded wallets | **Met in code.** `PrivyProvider` creates an embedded wallet for every user without one (`createOnLogin: "users-without-wallets"`); that wallet is the sole owner of every Rock Account Safe (spec 05, D-029); every owner-only route verifies a Privy access token (`lib/auth/privy.ts`). **Unproven live** — DEMO-STATE K-1. | Unchanged. | Set `NEXT_PUBLIC_PRIVY_APP_ID`; whitelist the origin; enable Sepolia and Base. |
| Q-2 | Integrate Privy's Earn capability | **Not met.** Nothing called Earn. Idle yield was DEMO-STATE N-6, "post-hackathon". | **Met in code.** Seven `/api/earn/*` routes, `useEarn`, the `SavingsCard`, `/savings`, and the owner's card on an awake rock page (Parts 3–5). **Unproven live** — DEMO-STATE K-10, P-11. | Configure a vault in the Privy dashboard; set `PRIVY_APP_SECRET` and `PRIVY_EARN_VAULT_ID`; fund one embedded wallet with USDC on Base (Part 8). |
| Q-3 | Demo clearly shows depositing, managing, or earning on assets | **Partly.** Ship, dock and swap on Aqua show *managing*; there was no deposit and no earning to show. | The demo script gains one beat (Part 9): add USDC to savings, read "earned so far", take it out. Ship/dock/swap remain. | Record it. Deposit the night before so "earned so far" is visibly non-zero on stage. |
| Q-4 | A short explanation of how Privy was used | **Not written** for the submission; only spec prose. | [`../docs/submission/privy.md`](../docs/submission/privy.md), and the README's Privy section. | Paste it into the ETHGlobal submission form. |

What judges will look for, and where each is answered: *meaningful use of Earn* — a real
position from the same sign-in, two verbs, realised yield (Part 5); *clear financial use case* —
a piggy bank you can hold, whose idle dollars earn while its reserve trades (D-033); *thoughtful
UX* — no chain, gas, approval or rate on screen (Part 5.2); *technical execution* — user-signed
writes, fail-closed routes, tests and CI greps (Parts 4, 7); *real-world adoption* — the same
rail Kraken's DeFi Earn runs on, behind an email login.

Bonus points: *creative use of onchain financial services* — a physical object that is an Aqua
market maker and a savings jar; *exceptional UX* — add, earn, take out; *mainstream* — email,
Google, Apple sign-in and plain-language copy.

### 1.2 Best Cross-Chain Funding Experience — "the easiest way for users to bring assets into an application"

Requirements, verbatim: embedded wallets; "integrate universal deposit addresses"; "your demo
should show assets being deposited from an external wallet, exchange, or chain"; the explanation.

| # | Requirement | Before this spec | After this spec | What only the operator can do |
| --- | --- | --- | --- | --- |
| Q-5 | Use Privy embedded wallets | Met in code (Q-1). | Unchanged. | As Q-1. |
| Q-6 | Integrate universal deposit addresses | **Not met, and worse than absent.** The only cross-chain surface was the *simulated* bridge modal (DEMO-STATE S-1): badged, no route, no transaction. | **Met in code.** `DepositAnywhereButton` on `useDepositAddress`: the user picks any chain and asset they hold, Privy issues a deposit address, and what arrives is converted into USDC on Base in their embedded wallet — straight into the savings flow (Part 11, D-035). The simulated modal is deleted. | Enable deposit addresses, swaps and app-pays gas sponsorship on the source chains in the Privy dashboard (Part 11.4). |
| Q-7 | Demo shows assets deposited from an external wallet, exchange, or chain | Nothing real to show. | One beat: send USDC from an exchange or another chain to the deposit address; it lands as USDC on Base; add it to savings (Part 11.5). | Have a few dollars on a second chain or an exchange ready. |
| Q-8 | The explanation | — | In the submission text. | Paste it. |

What judges will look for: *meaningful use* — the deposit address is the only way money comes in
from outside, not a side door; *friction reduction* — no bridge UI, no network switch, no gas;
*creative flow* — deposit from anywhere → earn, in two taps; *end-to-end journey* — sign in,
deposit, save, take out. Bonus: *multiple chains or assets* — whatever Privy routes, which is
what the modal offers; *consumer-friendly UX*.

### 1.3 Best AI Agent Built with Privy — "an AI agent that can hold assets, move money, or interact with onchain services"

Requirements, verbatim: "your project must use Privy's Agent Wallet CLI"; "your agent must
perform at least one onchain action"; "your demo should clearly show the agent using a wallet or
moving assets"; the explanation.

| # | Requirement | Before this spec | After this spec | What only the operator can do |
| --- | --- | --- | --- | --- |
| Q-9 | Use Privy's Agent Wallet CLI | **Not met.** The MCP server is read-only by design (D-008, D-019) and no agent had a wallet. | **Met in code.** `web/scripts/agent/trade-with-rock.mjs` plus a skill file served at `/agent/SKILL.md`: an agent logs in with the CLI, gets an address, and trades with a rock (Part 12, D-036). | Run `privy-agent-wallet login` once on the demo laptop; fund the agent's address with Sepolia ETH and USDC. |
| Q-10 | The agent performs at least one onchain action | None. | Two, in sequence: `approve(periphery, amountIn)` and `XYCSwapTaker.swapExactIn(...)` on Sepolia, sent through `privy-agent-wallet rpc`. | Set `AQUA_TAKER_ADDRESS`. |
| Q-11 | Demo shows the agent using a wallet or moving assets | — | One beat: an AI client reads this skill, quotes the rock, announces the trade, sends it; the rock page's reserve moves and the fee lands in the owner's balance (Part 12.5). | Rehearse once. |
| Q-12 | The explanation | — | In the submission text. | Paste it. |

What judges will look for: *agent autonomy* — address → gas → quote → floor → approve → swap →
verify, unattended; *creative onchain action* — trading against a physical object's liquidity;
*technical sophistication* — the same calldata a human's wallet sends, a positive floor, a
deadline, a receipt check; *usefulness* — the rock's owner earns the fee. Bonus: *multi-step
autonomous workflow* — yes; *real economic activity* — **partly**: the trade is on Sepolia, where
the rock lives; *novel use case* — yes.

### 1.4 Best Existing Project Upgraded with Privy

Not available: "only available to Continuity Track participants", and Bank Rock is in the
build-from-scratch track. Nothing in this spec targets it.

### 1.5 The one structural finding

Privy Earn's self-serve vaults are Morpho USDC vaults on **Base mainnet** (Gauntlet USDC Prime,
Steakhouse Prime Instant) and a PathUSD vault on Tempo; no testnet vault exists (**Fact** — docs
`wallets/actions/earn/setup`). Universal deposit addresses likewise route between mainnets. Bank
Rock transacts on Ethereum Sepolia and spec 08 lists "mainnet funds" as out of scope. The two
cannot both hold if either integration is to be real, so this spec makes one decision (D-033,
Part 2) rather than leaving the conflict for the demo to discover.

---

## Part 2 — Decisions

### D-033 — Savings run on Privy Earn, on Base mainnet, from the embedded wallet

**Decision.** Bank Rock integrates Privy Earn against **one** vault configured in the Privy
dashboard, on the chain that vault lives on — Base mainnet for the self-serve USDC vaults. The
wallet that deposits is the user's **Privy embedded wallet itself**, not a Rock Account. The
Rock Account, the registry and Aqua stay on Ethereum Sepolia, untouched.

**Why the embedded wallet and not the Rock Account.** Privy Earn acts on Privy-managed wallets by
`wallet_id` (**Fact** — every earn endpoint is `/wallets/{wallet_id}/earn/...`). A Rock Account
is a Safe that Privy does not manage, so it cannot hold an Earn position. The embedded wallet has
the same address on every EVM chain, so no new wallet is created; it simply holds USDC on Base.

**What this means for the product, said plainly in the UI.** Savings belong to the *person*, not
to the rock: the same position shows on every rock that person owns, and giving a rock away does
not move it. The card says so wherever it sits on a rock page. A per-rock "jar" — one additional
embedded wallet per rock, `createWallet({ createAdditional: true })`, mapped in D1 — is possible
and is deferred (Part 10); it would not survive a gift either, because Privy wallets belong to a
Privy user.

**The mainnet exception, bounded.** This is the only mainnet money in the project. It is the
user's own USDC, in the user's own wallet's name, in amounts of a few dollars for the demo. Bank
Rock never holds it, never approves it to itself, and has no path to move it without the user's
signature (Part 4). Spec 08's "no mainnet funds" is amended to "no mainnet funds in any Bank Rock
contract or key"; that sentence is still true.

**D-004, amended rather than broken.** The rule stays: no APY, no APR, no projection, no
"guaranteed", nothing annualised — Privy's `user_apy`, `app_apy` and `total_rewards_apr` are
dropped on the server before any of it reaches a bundle, and a CI grep asserts the client never
mentions them (Part 7). What the amendment allows is the *word* "savings" for a real lending-vault
position and one realised figure, **earned so far** = `assets_in_vault + total_withdrawn −
total_deposited`, read from Privy's position and shown in the asset. It is what the vault has
paid, not what it might pay. D-004's "savings-account language" was written to stop promised
returns; a piggy bank that reports its actual contents does not promise anything.

**Fee share: zero.** The Privy fee wrapper lets the app keep up to 50 % of yield. Bank Rock
charges nothing for the MVP (spec 09, open question 7), so the wrapper is configured at 0 %.

### D-034 — Every earn write is signed by the user's wallet, and the server forwards it unchanged

**Decision.** A deposit or withdrawal is authorised by a **user authorization signature**
produced in the browser by `useAuthorizationSignature().generateAuthorizationSignature(...)` over
the exact Privy request — method, URL, body and the `privy-` headers — and forwarded by the
server with the `privy-authorization-signature` header alongside the app's Basic credentials
(**Fact** — SDK `@privy-io/react-auth@3.42.0` exports the hook; docs
`controls/authorization-keys/using-owners/sign/overview` define the payload). The alternative,
session signers that let the server act while the user is away, is **not** used: it would give
the operator a standing power over user money that spec 01 principle 3 and spec 02's operator
role forbid.

**Consequences.**

- the server cannot change the vault, the amount or the wallet after the user signs — any change
  invalidates the signature and Privy refuses the request. The app secret proves *which app*
  forwarded it; it cannot authorise a write on its own;
- the signed payload carries `privy-request-expiry` (five minutes) and `privy-idempotency-key`
  (a UUID), so a captured request dies quickly and a retried one cannot deposit twice;
- there is no unsigned path in the code. `POST /api/earn/deposit` and `/withdraw` refuse a
  request without a signature before they look anything up (`lib/earn/write-route.server.ts`);
- **Hypothesis to prove (Part 7 item 3):** the hook only works for wallets whose owner is the
  user — Privy's user-owned, TEE-executed embedded wallets. An app still on the legacy
  iframe-only execution mode cannot produce this signature; the UI then reports "The wallet did
  not sign the request, so nothing was sent" and the operator must switch the app's wallet
  execution mode in the dashboard.

---

## Part 3 — What Privy Earn is (Fact, 2026-09-12)

Privy Earn is a **server-side REST API** over ERC-4626 vaults: deposit, withdraw, read a
position, read a vault, claim incentives. There is no React hook for it; the React SDK
contributes authentication, the embedded wallet, and the user authorization signature.

| Operation | Method and path | Notes |
| --- | --- | --- |
| Vault details | `GET /api/v1/earn/ethereum/vaults/{vault_id}` | `id`, `name`, `provider` (`morpho` / `aave` / `veda`), `vault_address`, `caip2`, `asset {address, symbol, decimals}`, `user_apy`, `app_apy`, `tvl_usd`, `available_liquidity_usd`, `admin_wallet_*`. |
| Position | `GET /api/v1/wallets/{wallet_id}/earn/ethereum/vaults?vault_id=` | `asset`, `total_deposited`, `total_withdrawn`, `assets_in_vault`, `shares_in_vault`, all integer strings in the asset's unit. A wallet that never deposited answers 404 / 204. |
| Deposit | `POST /api/v1/wallets/{wallet_id}/earn/ethereum/deposit` | Body `{ vault_id, amount \| raw_amount }`. "Privy handles the ERC-20 approval and deposit in a single call." Returns a wallet action: `id`, `type: "earn_deposit"`, `status: pending \| succeeded \| rejected \| failed`, `share_amount` (null until it lands). |
| Withdraw | `POST /api/v1/wallets/{wallet_id}/earn/ethereum/withdraw` | Same body. For a full withdrawal pass `assets_in_vault` as `raw_amount`; dust may remain as shares. |
| Action status | `GET /v1/wallets/{wallet_id}/actions/{action_id}?include=steps` | Steps carry the transaction hashes. |
| Action history | `GET /v1/wallets/{wallet_id}/actions?limit=` | Filtered client-side to `earn_*`. |
| The user's wallets | `GET /v1/users/{did}` | `linked_accounts[]` with `wallet_client_type: "privy"`, `connector_type: "embedded"`, `id` (the wallet id), `wallet_index`. |

Authentication to every call: `privy-app-id` plus `Authorization: Basic base64(appId:appSecret)`.
Writes on a user-owned wallet additionally need `privy-authorization-signature` (D-034).

Two path families exist: the earn endpoints are documented under `/api/v1`, the older
`privy-next-yield-demo` example uses `/v1/wallets/{id}/ethereum_yield_deposit`. The code follows
the current documentation and keeps the earn base in one place (`PRIVY_EARN_API_BASE`, optional)
so that a difference discovered at rehearsal is a one-variable fix, not a code change.

Gas: "if your app has gas sponsorship enabled, Privy automatically sponsors gas for earn deposit,
withdraw, and incentive claim actions" (**Fact** — earn overview). Gas sponsorship in *App pays*
mode "requires TEE execution" (**Fact** — gas setup).

Setup: *Wallet infrastructure → Earn* in the dashboard; pick a vault, a fee percentage and an
admin wallet; Privy deploys a fee wrapper and issues a `vault_id`. Vaults beyond the three
self-serve ones (Aave, Veda, other Morpho) need sales@privy.io.

---

## Part 4 — Server design

### 4.1 Modules

| File | Role |
| --- | --- |
| `web/src/lib/earn/shared.ts` | Pure and browser-safe: `earnActionUrl`, the body shape, `earnedSoFar`, `parseAmountInput`, `caip2ChainId`, the wire types. Both sides import it, which is what makes the signed request and the forwarded request identical. |
| `web/src/lib/earn/config.ts` | Server-only. Reads `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `PRIVY_EARN_VAULT_ID`, optional `PRIVY_EARN_API_BASE`. Fails closed, naming the variable. The **only** file that reads the secret. |
| `web/src/lib/earn/privy-api.ts` | The REST client. Vault (rate fields stripped), user wallets, ownership check, position (404 → zero), submit, status, history. Reasons are chosen from a fixed set by status code; Privy's text goes to telemetry only. Test seam: `__setFetchForTesting`. |
| `web/src/lib/earn/route.server.ts` | The gates every route runs in order: token → configuration → rate limit → wallet ownership. Writes fail closed on the limiter; reads fail open and log. |
| `web/src/lib/earn/write-route.server.ts` | The shared body of the two writes: validates the signed envelope, refuses anything but `{ vault_id: <configured>, raw_amount: <positive integer> }`, refuses a missing signature, an expired or far-future expiry, a non-UUID idempotency key; then forwards. |
| `web/src/lib/chain/index.ts` | `chainFromCaip2` and `explorerFor` — the vault's chain and its explorer, so no chain or address literal appears anywhere else (D-015). |

### 4.2 Routes

| Route | Auth | Answers |
| --- | --- | --- |
| `GET /api/earn/vault` | public, 60/min | `{ state, vault, apiBase, appId }` — no rate fields. |
| `GET /api/earn/wallet` | Privy token | The caller's primary embedded wallet, from Privy's record. |
| `GET /api/earn/position?walletId=` | Privy token, owned wallet | `position` and `earned`. |
| `POST /api/earn/deposit` | Privy token, owned wallet, signed envelope, 20/min fail-closed | The wallet action. |
| `POST /api/earn/withdraw` | same | The wallet action. |
| `GET /api/earn/actions/[id]?walletId=` | Privy token, owned wallet | The action with its transaction hash once a step is broadcast. |
| `GET /api/earn/history?walletId=` | Privy token, owned wallet | Recent `earn_*` actions. |

Reads answer `200` with `{ state: "UNAVAILABLE", reason }` when something is missing, so the UI
renders the reason as an honest empty state (D-013). Writes answer `503` (unconfigured), `400`
(malformed envelope), `403` (foreign wallet), `502` (Privy refused), or `200` with the action.

### 4.3 Threat model

| Threat | Mitigation | Residual |
| --- | --- | --- |
| Operator (or a stolen app secret) moves user savings | Writes need the user's signature over the exact request (D-034). The server has no unsigned path. | The secret can *read* any user's wallets and positions. That is the standard Privy trust model, and the same power the app already holds over Privy user records. |
| Server substitutes a vault, amount or wallet | The signature binds all three; Privy refuses a mismatch. The server additionally refuses any `vault_id` but the configured one. | — |
| Captured signed request replayed | `privy-request-expiry` (≤ 5 min, ≤ 15 min accepted) and `privy-idempotency-key`. | A replay inside the window against the same key is idempotent, not a second deposit. |
| One user reads another's position | Every route resolves the caller's wallets from Privy by DID and refuses a wallet id that is not theirs (403). | — |
| Reason strings leak the secret or Privy internals | Reasons come from `reasonForStatus`, never from the response (audit P-2 / P-15). Tests assert a planted string never surfaces. | — |
| Secret reaches a bundle | Read in one file, no `NEXT_PUBLIC_` twin; spec check E-2 / E-3. | — |
| Privy down, chain RPC down | UNAVAILABLE with the reason; nothing substituted (D-013). | — |
| Vault risk (smart contract, liquidity, rate) | Disclosed in the card's explanation; "earned so far" is realised, never projected; `available_liquidity_usd` is read, not assumed. | The money is real. Amounts for the demo are small, and it is the user's own wallet. |
| Abuse of the forward as an open proxy | Only two Privy paths are reachable, both bound to the caller's own wallet and one vault; rate-limited, fail-closed. | — |

---

## Part 5 — Client design

### 5.1 `useEarn` (`web/src/hooks/useEarn.ts`)

Capability-shaped throughout: `vault`, `wallet`, `position` (with `earned`), `balance` (the
asset's `balanceOf(wallet)` read on the vault's chain through wagmi), `history`, plus `deposit`
and `withdraw`. A write:

1. builds `{ vault_id, raw_amount }` and the URL from the `apiBase` the server published;
2. asks the wallet to sign it — `generateAuthorizationSignature({ version: 1, method: "POST",
   url, body, headers: { "privy-app-id", "privy-idempotency-key", "privy-request-expiry" } })`;
3. posts the signed envelope to `/api/earn/{deposit|withdraw}`;
4. polls `/api/earn/actions/{id}` every 2.5 s for up to two minutes until the action is terminal;
5. invalidates the position, the history and the balance.

It must be rendered inside `PrivyProvider`; the card guards that (below), and the hook's doc
comment says so. A rejected signature returns UNAVAILABLE with "nothing was sent"; a `failed` or
`rejected` action returns UNAVAILABLE with Privy's status and "nothing moved"; a still-pending
action is returned as REAL with its status, and the sheet says it is still confirming.

### 5.2 Surfaces

- **`SavingsCard`** (`web/src/components/earn/savings-card.tsx`) — three figures from three
  sources, never summed: *In the vault*, *Earned so far*, *Ready to add*. Two verbs: *Add to
  savings*, *Take out*. A *Get USDC on Base* button through `useFundWallet`, falling back to the
  wallet's address when no funding method is enabled. A history list from Privy. A footer naming
  the vault, the provider, the chain and the vault address with an explorer link. One `HelpTerm`
  explains where the money goes and that returns vary.
- **`EarnActionSheet`** — amount → review → result. The review says: "Your wallet signs this
  request itself. Bank Rock forwards it to Privy and cannot change the amount, the vault or the
  wallet after you sign. Nothing has been sent yet." The result shows only what Privy reported,
  with the hash through `<TxHash>` and Basescan (D-014).
- **`/savings`** — the card on its own page, reachable from the header, for a demo that does not
  depend on a deployed registry.
- **The awake rock page** — the card, owner-only, after the liquidity position and before alerts
  (spec 17 Part 5 order, extended).

### 5.3 States

| State | What renders |
| --- | --- |
| Sign-in not configured | `UNAVAILABLE`: "Sign-in is not configured" — no SDK, no hook. |
| Signed out | The piggy-bank empty state with a *Sign in* button. |
| `PRIVY_EARN_VAULT_ID` or `PRIVY_APP_SECRET` unset | `UNAVAILABLE` naming the variable. |
| No embedded wallet on the account (external wallet sign-in) | "This account has no embedded wallet yet." |
| Never deposited | Zero position, "Nothing yet." |
| Balance on Base is zero | *Add to savings* disabled; *Get USDC* offered. |
| Deposit pending | The sheet's clock state; the card refreshes every 15 s. |

There is **no DEMO state** for savings. With `NEXT_PUBLIC_DEMO_MODE=true` and no Privy
configuration the card is `UNAVAILABLE`, not a badged sample: simulating a savings balance would
be exactly the "plausible value" spec 15 exists to remove.

---

## Part 6 — Environment (spec 16 rows #38–#40)

| Variable | Provider | Effect when unset |
| --- | --- | --- |
| `PRIVY_APP_SECRET` | dashboard.privy.io → App settings → Basics | Every earn route `UNAVAILABLE`: "PRIVY_APP_SECRET is not configured". Server-only; never `NEXT_PUBLIC_`. |
| `PRIVY_EARN_VAULT_ID` | dashboard.privy.io → Wallet infrastructure → Earn, after the fee wrapper is deployed | Every earn route `UNAVAILABLE`: "PRIVY_EARN_VAULT_ID is not configured". |
| `PRIVY_EARN_API_BASE` | optional; default `https://api.privy.io/api/v1` | Only if Privy's earn paths differ from the documentation at rehearsal. |

Production values go on the Worker (spec 12: dashboard → Workers & Pages → `web` → Settings →
Variables and Secrets). Both are in `web/.env.example`.

---

## Part 7 — Definition of done

**Static, in `scripts/spec-checks.sh` (blocking in CI):**

| ID | Check |
| --- | --- |
| E-1 | No `user_apy`, `app_apy`, `total_rewards_apr` or `tvl_usd` in `web/src/components` or `web/src/hooks` — the rate never reaches a bundle. |
| E-2 | `PRIVY_APP_SECRET` is read in `web/src/lib/earn/config.ts` and nowhere else in `web/src` (tests excepted). |
| E-3 | No `NEXT_PUBLIC_PRIVY_APP_SECRET` anywhere under `web/`. |
| E-4 | `web/src/lib/earn/privy-api.ts` forwards `privy-authorization-signature` — the signed path exists. |
| E-5 | `web/src/lib/earn/write-route.server.ts` refuses a missing signature — the phrase "the wallet must sign the request" is present. |
| D-004 | Unchanged: no `APY` / `APR` in `web/src/components`. |

**Unit tests (blocking):** `lib/earn/shared.test.ts`, `lib/earn/privy-api.test.ts` (fetch
stubbed; headers, stripping, 404-as-zero, fixed reasons, ownership, hash extraction),
`app/api/earn/deposit/deposit-route.test.ts` (every gate; no unsigned path; secret unset closes
the route), `lib/chain/caip2.test.ts`.

**Live, during rehearsal — the hypotheses, in the order they fail:**

1. `curl https://api.privy.io/api/v1/earn/ethereum/vaults/$PRIVY_EARN_VAULT_ID` with the app
   credentials answers 200 with `caip2: "eip155:8453"`. If 404, try `PRIVY_EARN_API_BASE=https://api.privy.io/v1`.
2. `GET /api/earn/wallet` returns the embedded wallet's id and address for a fresh sign-in.
3. **The wallet signs.** Tap *Add to savings*, review, confirm: the wallet produces a signature
   without error. If it does not, the app is not on user-owned (TEE) wallets — Part 8 step 1.
4. The deposit lands: the sheet reaches *Added to savings* with a Basescan link, and *In the
   vault* moves within one refresh. If it fails with Privy's `failed`, check gas sponsorship
   (Part 8 step 3) or send a little ETH on Base to the wallet.
5. *Earned so far* is greater than zero the next morning.
6. *Take out* of the full amount lands and *Ready to add* rises by it, minus nothing.
7. A second Privy account cannot read the first one's position: `GET /api/earn/position?walletId=<other>` answers 403.

---

## Part 8 — What only the operator can do (in order)

1. **Privy dashboard → Wallets → Embedded wallets.** Confirm the app's embedded wallets are the
   user-owned, TEE-executed kind (the default for apps created since 2025). If the app shows the
   legacy execution mode, switch it; D-034's signature needs it, and so does gas sponsorship.
2. **Wallet infrastructure → Earn.** Choose *Gauntlet USDC Prime* (USDC on Base). Fee share
   **0 %** (D-033). Admin wallet: let Privy generate one. Deploy the fee wrapper. Copy the
   `vault_id` → `PRIVY_EARN_VAULT_ID`.
3. **Gas sponsorship → App pays**, Base enabled, so no user ever needs ETH on Base. Otherwise
   send 0.001 ETH on Base to each demo wallet.
4. **App settings → Basics.** Copy the app secret → `PRIVY_APP_SECRET`. Set both variables on
   the Worker and in the local `.env`.
5. **Funding (optional).** Under *Funding*, enable *transfer from external wallet* at least, so
   *Get USDC on Base* opens something. Without it the button falls back to showing the address.
6. **Fund the demo wallet.** Sign in on the demo phone, open `/savings`, copy the wallet address
   from *Get USDC on Base* (or the account sheet) and send **20 USDC on Base** to it from any
   exchange or wallet. Native USDC, `0x8335…2913`, not bridged USDbC.
7. **Rehearse Part 7 the night before.** Leave 10 USDC in the vault overnight so *Earned so far*
   reads a positive number on stage.
8. **Optional hardening.** A Privy policy allowing `earn_deposit` and `earn_withdraw` only for
   `vault_id = <yours>`, attached to demo wallets — belt and braces over the server's own check.

Budget: 20 USDC + a few cents of Base gas if sponsorship is off. Nothing else on mainnet.

---

## Part 9 — The demo beat (spec 08, inserted after Privy onboarding)

**0:55–1:20 — Savings.** Still signed in, no wallet installed, no seed phrase. Open *Savings* on
the rock (or `/savings`). "The rock trades on Aqua. The dollars that are not trading do not sit
still." Tap *Add to savings*, 5 USDC, review — "your wallet signs this itself; Bank Rock cannot
change it" — confirm. The sheet lands with a Basescan link. *In the vault* moves; *Earned so far*
already shows what last night's deposit paid. Tap *Take out*, 1 USDC, confirm: back in the wallet.
"Privy Earn, a Morpho vault on Base, three verbs, and not a single rate on the screen — because
what it earned is a fact and what it will earn is not."

The Aqua beats then continue from 1:20; the total runs ten seconds longer than before. If time is
short, cut the *Take out* half, never the deposit.

---

## Part 10 — Deferred, and open for the operator to decide

| Item | Recommendation |
| --- | --- |
| Show the vault's own rate (`user_apy`) with a "variable, not guaranteed" caption | **No.** D-004 holds; realised yield is the more honest and the more distinctive number. If the judges ask, the vault's rate is one click away on the vault's explorer page. One line in `privy-api.ts` and one grep in E-1 would change it. |
| Per-rock savings jars (an additional embedded wallet per rock, mapped in D1) | Post-hackathon. It adds a table and a gift caveat for a purity the demo does not need. |
| Auto-sweep: deposit the rock's idle USDC on Sepolia into savings | Impossible as such — different chains, different wallets. The honest version is a bridge, which is S-1 and cut. |
| An MCP tool `get_savings_position` | Post-hackathon. The MCP server is read-only and unauthenticated per user; a position needs the user's token. The agent path (Part 12) is a client-side skill for the same reason. |
| The agent deposits to savings on Base | Not possible as built: the CLI wallet is not a Bank Rock session. Possible later through a policy-scoped session signer on the user's own wallet, which D-034 deliberately does not use. |
| Fee share above 0 % | Only if Bank Rock ever charges anything (spec 09 Q7). |
| Keep the *Savings* header link | Yes for the demo; it is the beat's shortest path. |

---

## Part 11 — Universal deposit addresses (prize 2)

### 11.1 What they are (Fact, 2026-09-12)

"Create persistent deposit addresses that convert incoming crypto into a target asset." The app
names a destination — a wallet, a chain, a token — and Privy issues a deposit address for whatever
source chain and asset the user chooses. What arrives is bridged or swapped and delivered to the
destination. Same-chain deposits reuse the wallet's own address with an automation; cross-chain
ones get a provisioned address under the same owner, so mis-sent assets "are cryptographically
recoverable through private key export". "Global deposit addresses are live today for all Privy
accounts"; no KYC on the deposit path; no fees from Privy (blog, docs
`wallets/funding/crypto-deposit-addresses`). Under the hood: "wallet automations and the swap
API", which is why the prerequisites are **swaps enabled** and **app-pays gas sponsorship on each
source chain** — "deposit addresses cannot be created on chains where gas sponsorship has not been
enabled" (`crypto-deposits/setup`).

Two SDK surfaces exist in `@privy-io/react-auth@3.42.0` (**Fact** — the installed types):

| Hook | Entry point | What it does |
| --- | --- | --- |
| `useDepositAddress().createDepositAddress({ destinationChain, destinationCurrency, destinationAddress, refundAddress?, slippageBps? })` | package root | Opens Privy's own modal: source selection, the deposit address, order tracking. Resolves when the deposit completes, rejects with a `DepositAddressModalErrorCode`. Marked `@experimental`. |
| `useHeadlessCryptoDeposit().createCryptoDepositAccount(...)` / `getQuote(...)` | `@privy-io/react-auth/internal` | The same, without UI: `POST /v1/wallets/{id}/deposit_accounts/crypto` with an `inline_route` of accepted sources and one destination. Also experimental. |

### 11.2 D-035 — Money from anywhere lands in savings through a Privy deposit address

**Decision.** The savings card offers *Add from any wallet, exchange or chain* through
`useDepositAddress`, with the destination fixed to the user's embedded wallet, the vault's asset,
on the vault's chain — USDC on Base. It replaces the simulated cross-chain modal (DEMO-STATE S-1),
which is deleted along with its e2e check. The modal hook is used rather than the headless one
because Privy's UI already handles source selection, order polling and refunds, and because the
headless hook lives under `/internal`.

**Consequences.** Cross-chain money funds *savings*, not the Rock Account: deposit addresses
route between mainnets and the Rock Account is on Sepolia, whose reserve is still funded from the
testnet faucets (spec 16 Part 3). The card says where the money lands. Every failure maps a Privy
error code to a fixed sentence, and the fallback is the wallet's plain address — the simulated
"no transaction — simulated" state is gone for good.

### 11.3 Design

`web/src/components/earn/deposit-anywhere-button.tsx`: one button, `busy` while Privy's flow is
open, a `role="status"` line on completion (and a balance re-read through `onCompleted`), a
`role="alert"` reason plus the address on failure. `USER_EXITED` is silence. The card onramp
(`FundWalletButton`) stays beside it, relabelled *Buy USDC with a card*, so the two Privy funding
paths read as what they are: from crypto you hold, or from a card.

### 11.4 Operator steps

1. Privy dashboard → *Wallet infrastructure → Wallets → Advanced*: enable **swaps** (routing: All
   Uniswap; optimisation: Fastest).
2. *Gas sponsorship → App pays*: enable **every source chain you will demo from** (Ethereum, Base,
   Arbitrum, Optimism, Polygon — and Solana if you want the "from anywhere" line to include it).
   Without a chain here, no deposit address exists for it.
3. *Funding → Deposit addresses*: enable.
4. Have a few dollars of USDC on one of those chains, or on an exchange, ready to send.

### 11.5 The demo beat (spec 08, before *Savings*)

**0:55–1:05 — Money from anywhere.** On the savings card tap *Add from any wallet, exchange or
chain*. Pick Arbitrum USDC (or an exchange withdrawal). Privy shows an address; send 5 USDC to it
from the second phone. "No bridge, no network switch, no gas. Whatever chain it left, it lands on
Base as USDC, in a wallet that did not exist ten seconds before I signed in." *Ready to add* moves.
Then *Add to savings* — the Earn beat continues.

### 11.6 Definition of done

Static (`scripts/spec-checks.sh`): **E-6** `useDepositAddress` is used in
`web/src/components/earn`; **E-7** `web/src/components/cross-chain-modal.tsx` no longer exists
and the phrase "no transaction — simulated" appears in no component. Live: the button opens
Privy's source list (else `DEPOSIT_ADDRESSES_NOT_ENABLED`, step 3); a 5 USDC deposit from a
second chain arrives as USDC on Base within minutes and *Ready to add* moves without a refresh.

---

## Part 12 — The Agent Wallet CLI (prize 3)

### 12.1 What it is (Fact, 2026-09-12)

`@privy-io/agent-wallet-cli` (npm 0.3.6): "CLI for AI agents to create Privy wallets and
transact." `login` runs an OAuth device flow — the CLI prints a code, the human approves it at
agents.privy.io — and stores a session in the OS keychain for 30 days. `list-wallets` prints the
agent's Ethereum and Solana addresses; `fund` opens a browser funding page; `rpc --json '{…}'`
signs and sends. Supported Ethereum methods include `eth_sendTransaction` with a `caip2` and a
`transaction { to, value, data }`; supported chains include **Sepolia, `eip155:11155111`**
(agents.privy.io/skill.md). "The agent is never given the wallet private key or app secret";
humans revoke at agents.privy.io/manage.

### 12.2 D-036 — An agent trades with a rock as a visitor, from its own Privy agent wallet

**Decision.** The agent is a *visitor* (spec 02 Flow D), never an owner: it holds its own agent
wallet through the CLI, funds it itself, and trades against a rock's strategy with the same two
transactions a human's wallet sends — `approve(periphery, amountIn)` then
`XYCSwapTaker.swapExactIn(...)` — on Sepolia, where the rocks are. The MCP server stays read-only
(D-008, D-019); this adds a *client-side* capability, published as a skill, not a server that acts.

**Why not the owner's wallet.** The CLI provisions a wallet owned by the human who approved the
device flow, in Privy's agent app — not the user's embedded wallet in Bank Rock's app. So the
agent cannot call `/api/earn/*` (those need a Bank Rock session) and cannot ship or dock (those
need the Rock Account's owner). Trading is the one action open to any wallet, and it is the one
that makes the object interesting: the rock's owner earns the fee.

**Why two transactions.** The periphery pulls the input with `transferFrom` and calls the app,
which calls back into the periphery (NOTES.md §5). An EOA calls the periphery directly, so it
needs a prior approval; the script waits for the approval's receipt before sending the swap, or
Privy's gas estimate for the swap would run against a zero allowance and fail.

### 12.3 Design

| File | Role |
| --- | --- |
| `web/scripts/agent/trade-with-rock.mjs` | The runner. Pure, exported helpers: `decodeStrategyBytes`, `minOutWithSlippage`, `buildTradePlan`, `rpcRequestFor`, `txHashFrom`, `ethereumAddressFrom`, `parseArgs`. `main()`: address from `list-wallets` (or `--from`), optional faucet claim, strategy and quote from the public API, floor = quote − `--slippage-bps`, `--dry-run` prints the plan, otherwise two `rpc` calls with receipt waits, then the strategy re-read and a JSON summary with Etherscan links. No address literal: the periphery is `--taker` / `AQUA_TAKER_ADDRESS`, the rest comes from the rock's API (D-015). |
| `web/scripts/agent/trade-with-rock.test.mjs` | The plan builder against an encoded strategy, the CLI envelope, output parsing, and `main --dry-run` against a stubbed API. |
| `web/public/agent/SKILL.md` | The skill an AI client fetches: prerequisites, login (show the device code, never in a sandbox), funding, reading the rock, the dry run, the trade, and the rules (announce before sending, one trade per instruction, stop on `UNAVAILABLE`). |

### 12.4 Operator steps

1. On the demo laptop, in `web/`: `pnpm --package=@privy-io/agent-wallet-cli dlx privy-agent-wallet login`, approve at agents.privy.io.
2. `list-wallets` → send the address 20 USDC from faucet.circle.com; the script's `--faucet` flag claims Sepolia ETH for gas from Bank Rock's own faucet.
3. `export AQUA_TAKER_ADDRESS=<NEXT_PUBLIC_AQUA_TAKER_ADDRESS>`.
4. `node scripts/agent/trade-with-rock.mjs --rock 1 --token USDC --amount 1 --taker "$AQUA_TAKER_ADDRESS" --dry-run`, then without `--dry-run`.
5. Point the AI client at `https://bank-rock.com/agent/SKILL.md` and ask it to "buy a little WETH from rock #1".

### 12.5 The demo beat (spec 08, replacing the MCP beat)

**2:35–3:00 — An agent trades with the rock.** Open Claude Code (or Cursor). "Read
bank-rock.com/agent/SKILL.md and sell 1 USDC to rock #1." The agent lists its Privy wallet, quotes
the rock, says the floor out loud, sends the approval and the swap through the Privy Agent Wallet
CLI, and pastes two Etherscan links. Refresh the rock page: the reserve moved, and the fee is in
the owner's balance. "The agent never held a key. Privy signed, a human approved the wallet once,
and a rock on a table just made a market for a machine."

### 12.6 Definition of done

Unit: `trade-with-rock.test.mjs` (blocking). Live: `login` completes; `--dry-run` prints two
transactions whose `to` are the sell token and the periphery; the real run lands both with
`status: success`; the rock's `virtual` balances differ before and after; the same command with
`--amount` above `executable` is refused by the periphery's floor, not by the script inventing a
smaller number.

---

## Part 13 — What this spec changed elsewhere

- **spec 09**: D-033 and D-034 added; D-004 amended by reference.
- **spec 08**: must-have 14; the demo story beat above; "mainnet funds" narrowed.
- **spec 05**: a section listing which Privy capabilities the product uses and where.
- **spec 16**: rows #38–#40; dashboard steps.
- **DEMO-STATE**: N-6 rewritten; K-10 and P-11 added.
- **`scripts/spec-checks.sh`**: the Part 7 static checks.
- **`web/.env.example`**: the three variables.
- **README** and **`docs/submission/privy.md`**: the submission text, covering all three prizes.
- **spec 17**: the active-rock order and the sheet list no longer name a cross-chain sheet.
- **spec 02**: Flow G names the real deposit path.
- **`web/e2e`**: the cross-chain sheet check is retired with the modal.
- **`web/vitest.config.ts`**: `scripts/**/*.test.mjs` is included.
