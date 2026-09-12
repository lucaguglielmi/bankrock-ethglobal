# Privy qualification and the Earn integration

## Purpose

This document answers one question — **does Bank Rock qualify for the Privy prize as the
requirements were published, and what closes each gap** — and then specifies the one piece that
was missing: Privy's Earn capability, wired into the product as *Savings*.

The requirements, verbatim from the prize page:

> To qualify: your project must use Privy embedded wallets; your project must integrate Privy's
> Earn capability; your demo should clearly show users depositing, managing, or earning on assets;
> include a short explanation of how Privy was used in your submission.
> Bonus points for: creative use of onchain financial services; exceptional user experience;
> products that make crypto more accessible to mainstream users.

Everything marked **Fact** below was read from Privy's documentation or SDK on 2026-09-12, with
the source named. Everything marked **Hypothesis** cannot be verified without a Privy app secret
and a funded wallet, and is listed in Part 7 as something the operator proves during rehearsal.

---

## Part 1 — Assessment, requirement by requirement

| # | Requirement | Before this spec | After this spec | What only the operator can do |
| --- | --- | --- | --- | --- |
| Q-1 | Use Privy embedded wallets | **Met in code.** `PrivyProvider` creates an embedded wallet for every user without one (`createOnLogin: "users-without-wallets"`); that wallet is the sole owner of every Rock Account Safe (spec 05, D-029); every owner-only route verifies a Privy access token (`lib/auth/privy.ts`). **Unproven live** — DEMO-STATE K-1. | Unchanged. | Set `NEXT_PUBLIC_PRIVY_APP_ID`; whitelist the origin; enable Sepolia and Base. |
| Q-2 | Integrate Privy's Earn capability | **Not met.** Nothing called Earn. Idle yield was DEMO-STATE N-6, "post-hackathon". | **Met in code.** Seven `/api/earn/*` routes, `useEarn`, the `SavingsCard`, `/savings`, and the owner's card on an awake rock page (Parts 3–5). **Unproven live** — DEMO-STATE K-10, P-11. | Configure a vault in the Privy dashboard; set `PRIVY_APP_SECRET` and `PRIVY_EARN_VAULT_ID`; fund one embedded wallet with USDC on Base (Part 8). |
| Q-3 | Demo clearly shows depositing, managing, or earning on assets | **Partly.** Ship, dock and swap on Aqua show *managing*; there was no deposit and no earning to show. | The demo script gains one beat (Part 9): add USDC to savings, read "earned so far", take it out. Ship/dock/swap remain. | Record it. Deposit the night before so "earned so far" is visibly non-zero on stage. |
| Q-4 | A short explanation of how Privy was used | **Not written** for the submission; only spec prose. | [`../docs/submission/privy.md`](../docs/submission/privy.md), and the README's Privy section. | Paste it into the ETHGlobal submission form. |
| B-1 | Creative use of onchain financial services | A physical object that is an Aqua market maker; a gift that moves a Safe's owner with the object, gas-free; NFC-attested awakening. | Plus: the same sign-in holds a lending-vault position, framed as a piggy bank. | — |
| B-2 | Exceptional user experience | No seed phrase; sponsored gas; one tap; honest `UNAVAILABLE` states. | Savings in three verbs — add, earn, take out — with no chain, gas or approval visible. | Enable gas sponsorship so no ETH is ever mentioned (Part 8 step 3). |
| B-3 | Mainstream accessibility | Email / Google / Apple sign-in; plain-language copy throughout. | "Savings", "in the vault", "earned so far" — no protocol names above the fold. | — |

**The one structural finding.** Privy Earn's self-serve vaults are Morpho USDC vaults on **Base
mainnet** (Gauntlet USDC Prime, Steakhouse Prime Instant) and a PathUSD vault on Tempo; no testnet
vault exists (**Fact** — docs `wallets/actions/earn/setup`). Bank Rock transacts on Ethereum
Sepolia and spec 08 lists "mainnet funds" as out of scope. The two cannot both hold if Earn is to
be real, so this spec makes one decision (D-033, Part 2) rather than leaving the conflict for the
demo to discover.

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
| An MCP tool `get_savings_position` | Post-hackathon. The MCP server is read-only and unauthenticated per user; a position needs the user's token. |
| Fee share above 0 % | Only if Bank Rock ever charges anything (spec 09 Q7). |
| Keep the *Savings* header link | Yes for the demo; it is the beat's shortest path. |

---

## Part 11 — What this spec changed elsewhere

- **spec 09**: D-033 and D-034 added; D-004 amended by reference.
- **spec 08**: must-have 14; the demo story beat above; "mainnet funds" narrowed.
- **spec 05**: a section listing which Privy capabilities the product uses and where.
- **spec 16**: rows #38–#40; dashboard steps.
- **DEMO-STATE**: N-6 rewritten; K-10 and P-11 added.
- **`scripts/spec-checks.sh`**: the Part 7 static checks.
- **`web/.env.example`**: the three variables.
- **README** and **`docs/submission/privy.md`**: the submission text.
