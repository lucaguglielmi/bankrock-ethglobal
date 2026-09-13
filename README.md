# Bank Rock

**Liquidity you can hold.**

Bank Rock is a real stone with a tiny NFC chip inside. Tap it with a phone and its page opens.
The stone has its own account on Ethereum that holds two tokens, offers them for trading through
1inch Aqua, and keeps a small fee from every trade — inside the stone, never in a pool. Its owner
signs in with an email or a passkey, never sees a seed phrase, and never needs ETH: every action is
a sponsored transaction. The stone can be handed to another person, who taps it and becomes the
owner of the account and everything in it. The chip itself holds no key and cannot move money.

Everything in this repository runs on **Ethereum Sepolia only** (chain id 11155111). The tokens are
test tokens with no value. The contracts, the accounts and the transactions are real, and a
five-step rehearsal — awaken, ship, trade, gift, retire — has run green on Sepolia
([`contracts/deployments/rehearsal-2026-09-12.md`](./contracts/deployments/rehearsal-2026-09-12.md)).
What is still simulated or unproven is listed line by line in
[`DEMO-STATE.md`](./DEMO-STATE.md), and this README never claims more than that file allows.

Built for ETHGlobal ETHOnline 2026 (the 1inch Aqua and Privy tracks). Live at
[bank-rock.com](https://bank-rock.com); the live demo rock is
[rock 3](https://bank-rock.com/rock/3).

---

## Contents

1. [The demo in 90 seconds](#the-demo-in-90-seconds)
2. [How it works](#how-it-works)
   - [The physical tag and how a tap is verified](#1-the-physical-tag-and-how-a-tap-is-verified)
   - [The Rock Account and sponsored transactions](#2-the-rock-account-and-sponsored-transactions)
   - [The Aqua position](#3-the-aqua-position)
   - [Trading through the taker](#4-trading-through-the-taker)
   - [Gifting as an on-chain handover](#5-gifting-as-an-on-chain-handover)
   - [Retiring a rock](#6-retiring-a-rock)
   - [The MCP endpoint](#7-the-mcp-endpoint)
3. [Contracts on Sepolia](#contracts-on-sepolia)
4. [Tech stack](#tech-stack)
5. [Repository layout](#repository-layout)
6. [Running it](#running-it)
7. [What is real and what is simulated](#what-is-real-and-what-is-simulated)
8. [Security model, in plain words](#security-model-in-plain-words)
9. [Known limits and what is next](#known-limits-and-what-is-next)
10. [Documentation](#documentation)

---

## The demo in 90 seconds

The three-minute script is [`specs/08-mvp-and-demo.md`](./specs/08-mvp-and-demo.md). The short
version, in the order a judge sees it:

| # | What happens on screen | What happens underneath |
| --- | --- | --- |
| 1 | **Tap.** A phone touches the rock; its page opens with a **Verified Physical** badge. | The chip wrote a fresh signed code and a counter into its link. The server checked the code with the tag's key and accepted the counter because it was higher than the last one. |
| 2 | **Copy the link into a second browser.** The badge is gone. | Same link, same rock, no proof: that counter has already been spent. This is the one falsifiable test of "the tag proves the object". |
| 3 | **Sign in.** Email or passkey. No seed phrase. | Privy creates or restores an embedded wallet. The server signs an attestation naming that wallet, the rock and the account the rock will open. |
| 4 | **Awaken.** One tap on a button; the rock becomes yours. | A sponsored UserOperation from the rock's own Safe deploys the Safe and calls `awakenRock` on the registry. The tapper paid no gas. |
| 5 | **Fund.** The page shows the account address and a QR; you send it USDC and WETH from any wallet. | An ordinary transfer to the Rock Account. No bridge, no form. |
| 6 | **Choose a strategy.** Wide 0.30%, Tight 0.05% or Patient 1.00%. Tap *Start earning*. | One sponsored batch: two approvals **to Aqua** and `Aqua.ship(...)`. No tokens move; the rock's balance is unchanged. |
| 7 | **Trade.** A second person, from a second phone, swaps against the rock and pays no gas. | Their personal Safe approves the taker and calls `XYCSwapTaker.swapExactIn`. Tokens move between the two accounts; the fee stays in the rock. The page reads the result back from the chain. |
| 8 | **Gift.** The owner names the recipient — by scanning a QR the recipient's phone shows — and signs once. | `initiateHandover` on the registry plus a pre-signed change of owner on the Safe, stored until the claim. |
| 9 | **Claim.** The recipient taps the stone, signs in on a fresh account with no ETH, and the rock is theirs. | The stored owner swap lands first; then the server relays `claimHandover`. The Rock Account keeps its address and its tokens. |
| 10 | **Ask an AI.** Claude Desktop, connected to the MCP server, says who owns the rock, what it holds and what it earned. | Ten read-only tools that read the same contracts the page reads. The server holds no key. |

---

## How it works

### 1. The physical tag and how a tap is verified

Each rock is an ordinary river stone (picked near Florence) with an **NXP NTAG 424 DNA** chip set
into it under a drop of coloured resin. The chip is passive and holds one URL:

```
https://bank-rock.com/r/{rockId}?e=<32 hex>&c=<16 hex>
```

On every read the chip rewrites `e` and `c`. `e` is the chip's UID and a 3-byte read counter,
encrypted with a key that never leaves the chip; `c` is a truncated AES-CMAC over that data,
computed with a session key derived per read as NXP specifies (AN12196). The path and the key are
written once, at provisioning; the chip is never reprogrammed to change rocks.

The server (`web/src/lib/nfc/`) does the whole check and nothing in a browser can:

1. decrypts `e` with the master key, recovers the UID and the counter;
2. derives the NXP session key and recomputes the CMAC; a mismatch ends the flow;
3. advances a **strictly monotonic counter per UID in Cloudflare D1**, atomically, so two replays
   of the same link cannot both win; a counter that is not higher than the stored one is a replay;
4. resolves which rock this tag actually backs from the registry (the number in the URL is only a
   hint, because a retired rock's tag can start a new one);
5. derives the Rock Account address for `(signed-in wallet, tag)` and signs an **EIP-712
   attestation**: `Attestation(rockId, uidHash, counter, deadline, subject, smartAccount)`, valid
   for ten minutes.

The registry accepts that attestation for exactly two functions — `awakenRock` and
`claimHandover` — and also checks the counter on chain (`lastCounter(uidHash)` only ever rises,
even across a retirement). The attestation can never spend anything, and the key that signs it
holds no funds. **The tag is a locator, not a key** (spec 06, decision D-002).

Two honest footnotes. The verifier is real and pinned by tests against NXP's own published
vectors, but a physical tag has not yet been tapped against it (DEMO-STATE P-1). Until the
prototype tag is programmed, a private "magic tap" route (`GET /api/demo/tap?key=…`, DEMO-STATE
S-4) forges a genuine `(e, c)` pair for a *synthetic* tag with the real master key and redirects
into the real flow — the chip is the only thing simulated, and every use is logged.

### 2. The Rock Account and sponsored transactions

A rock's money lives in its **Rock Account**: a **Safe 1.4.1** smart account on **ERC-4337
EntryPoint 0.7**, with a single owner — the user's Privy embedded wallet. Two details make it a
rock's account rather than a person's:

- **The address follows the tag.** `saltNonce = uint256(keccak256(rawUid))`, so the mapping is
  `(tag, owner) → account`. Two rocks held by one person have two accounts whose reserves never
  pool; the same tag under a new owner is a different account. The address is counterfactual — the
  verifier computes and signs it before anything is deployed — and the first sponsored
  UserOperation deploys the Safe as a side effect of doing the work (D-029).
- **After a gift, the app takes the account from the registry**, never re-derives it, and asks
  the Safe itself whether it answers to the signed-in wallet (`isOwner`) before offering any owner
  action (D-037).

Every operation an owner or a visitor performs — awaken, start or stop a strategy, trade, open a
gift, retire — goes out as **one gas-sponsored UserOperation** through Pimlico's bundler and
verifying paymaster, from the Safe that owns the action. Approvals and the call they enable are
batched, so a strategy starts with one signature and either everything lands or nothing does. The
only exception is the gift claim, relayed by the server because the recipient has neither gas nor,
yet, the Safe (§5). A UserOperation counts as done only when its receipt reports `success ===
true`; an included-but-reverted operation is reported as a failure, never as a hash (D-032).

Sign-in is Privy (`@privy-io/react-auth`): the methods offered are the ones enabled in the Privy
dashboard (email, passkey, socials), an embedded wallet is created on first login, and the only
chain the wallet can be on is Sepolia (D-033). A visitor who only trades transacts from a
**personal Safe** (`saltNonce = 0`), one per person, tied to no rock.

### 3. The Aqua position

[Aqua](https://github.com/1inch/aqua) is a 1inch protocol with one unusual property: **a liquidity
provider keeps its tokens in its own wallet.** Aqua tracks, per strategy, how much of a wallet's
balance a strategy may trade, and moves tokens between wallets only when a trade happens. Aqua
custodies nothing; the pricing app holds nothing; the maker keeps everything.

For a rock:

| Bank Rock word | What it is in Aqua |
| --- | --- |
| Rock Account | the **maker** — holds every token, the whole time |
| reserve | `ERC20.balanceOf(rockAccount)` — one balance, shared by every strategy |
| strategy / stream | `XYCSwap` (the reference constant-product app, deployed by us unmodified) plus one immutable `Strategy{maker, USDC, WETH, feeBps, salt}`, addressed by `strategyHash = keccak256(abi.encode(strategy))` |
| fee tier | `feeBps`: **Wide 30 bps (0.30%)**, **Tight 5 bps (0.05%)**, **Patient 100 bps (1.00%)** — stream indexes 0, 1, 2 |
| *Start earning* (ship) | `USDC.approve(Aqua)`, `WETH.approve(Aqua)`, `Aqua.ship(app, strategy, [USDC, WETH], [a, b])` in one sponsored batch. **Moves no tokens.** |
| *Edit* (push) | `Aqua.push(maker, app, strategyHash, token, amount)` from the rock's own account, once per token added, behind an allowance-aware approval to Aqua. **Only raises what the strategy may trade; moves no tokens.** The fee is fixed; making less available is *Stop*. |
| *Stop* / *Cash in* (dock) | `Aqua.dock(app, strategyHash, [USDC, WETH])`. **Returns nothing, because nothing left.** A docked strategy can never be revived; a new one gets a new stream index. |

**Why nothing is deposited.** `ship` writes an allowance; it does not transfer. `balanceOf(Aqua)`
is zero before and after, always. That is why the dashboard says "the rock keeps its tokens; this
is how much this strategy may trade", never "deposit", and why *docking is the withdrawal*: the
tokens are already where they would be returned to. Sending them elsewhere afterwards is an
ordinary ERC-20 transfer from the Rock Account, unrelated to Aqua.

**The salt carries the rock.** `salt = keccak256(abi.encode(keccak256("bankrock.aqua.strategy.v1"),
rockId, streamIndex))`. Given a rock id and its account, anyone can recompute every strategy hash
and ask `Aqua.safeBalances` — a revert means "not shipped", a success means "live, and here are the
virtual balances". No indexer, no stored hash. The encoding is pinned to the same literals by a
TypeScript test (`web/src/lib/aqua/strategy.test.ts`) and a Solidity test
(`contracts/test/aqua/XYCSwapStrategy.t.sol`), so neither side can drift alone.

**Three numbers that are never added up** (spec 04, `contracts/contracts/aqua/NOTES.md` §7):

| Number | Read from | Meaning |
| --- | --- | --- |
| **actual** (reserve) | `ERC20.balanceOf(rockAccount)` | what the rock really holds |
| **virtual** | `Aqua.safeBalances(maker, app, strategyHash, USDC, WETH)` | what one stream may trade — an allowance, not a balance; two streams' virtuals can exceed the reserve |
| **executable** ("available to trade") | `min(virtual, actual, allowance(maker → Aqua))` | what one stream can settle right now; a trade on one stream lowers this for the others |

**Where the fee goes.** There is no fee accumulator anywhere. `XYCSwap` prices a trade off
`amountIn · (10000 − feeBps) / 10000` while the *gross* `amountIn` is pushed into the maker's wallet
and virtual balance. The fee is the slice of the input the curve never paid out; it accrues inside
the rock's own reserve and shows up as growth of the invariant. There is nothing to collect. The
dashboard shows the **rate** (from the strategy) and the **cumulative fee**, summed from Aqua's own
`Pushed` events for that strategy (`amount · feeBps / 10000`, counting only a `Pushed` whose transaction also carries a `Pulled` — a swap — so the two `ship` emits and an owner's *Edit* top-ups are skipped). When
the RPC cannot serve the log range, the figure is shown as unavailable — never derived from
balance deltas, because `virtual − shipped` is P&L, not fees. **Nothing is ever annualised. There
is no APY or APR anywhere, and a CI grep enforces it** (D-004).

**Quotes** come from `XYCSwap.quoteExactIn`, a view on the app itself — the same code path
`swapExactIn` runs, on the same block. A TypeScript mirror of the integer arithmetic
(`web/src/lib/aqua/quote.ts`) previews the number as the user types; the app is read before
submitting. There is no external price feed anywhere in the path.

### 4. Trading through the taker

`XYCSwap.swapExactIn` settles by **calling back into whoever called it**: it pulls the output from
the maker's wallet to the taker, then invokes `xycSwapCallback` on `msg.sender`, which must respond
by approving Aqua and calling `Aqua.push`. A plain wallet has no code and cannot answer; a plain
Safe would push nothing. So **a taker must be a contract**, and `XYCSwapTaker` is Bank Rock's one
contract on the Aqua path: it pulls `amountIn` from the taker, calls the app naming the taker as
`to`, and fulfils the callback. It has no pricing logic, no owner, no admin, no upgrade path, and
holds nothing between transactions; the callback is gated on a transient (EIP-1153) ticket so
exactly one callback is possible per swap, for exactly the values that swap named.

A visitor's trade is therefore two calls — `tokenIn.approve(taker, amountIn)` then
`XYCSwapTaker.swapExactIn(...)` — sent as one sponsored batch from their personal Safe, with a
minimum output and a five-minute deadline. **Note the two approval directions:** the maker approves
**Aqua**, never the app; the taker approves **the periphery**. Getting either backwards is a
revert, not a silent loss. Tokens *sent to* the taker (rather than approved to it) are lost by
design: a rescue function would be an admin key on the trade path (spec 19 §4.3).

When several streams are live, the Trade tab quotes each for the visitor's amount and defaults to
the one that returns the most output; the visitor can switch. `amountOut` is read from the
receipt's own `Pulled`/`Pushed` events, never from the preview.

### 5. Gifting as an on-chain handover

There is no immediate transfer function. A rock changes hands only when someone holding the stone
presents a fresh attestation (D-027, D-032):

1. The owner names a recipient — required; the app issues no open gifts — picks an expiry (at most
   90 days) and optionally writes a message. Naming is a two-phone move: the recipient's account
   sheet shows a QR of `bank-rock.com/rock/<id>?give=<their address>`; the giver's camera opens it
   and the give sheet is pre-filled. Pasting is the fallback.
2. One signature does two things. `initiateHandover(rockId, recipient, expiresAt, messageHash)`
   goes out as a sponsored UserOperation from the Rock Account (only the message *hash* is on
   chain). In the same interaction the giver **pre-signs `Safe.swapOwner(SENTINEL, giver,
   recipient)`** — the one moment that signature can exist, since the giver is the Safe's only
   owner and will not be present at the claim. The bundler validates the stored operation before
   it is kept; the give sheet confirms it was stored and offers to sign again if not.
3. The recipient taps the stone and signs in. The tap is *held* until sign-in so the counter is not
   spent on an attestation with no subject.
4. **The Rock Account moves first.** The server submits the stored owner swap and waits for a
   successful receipt.
5. Then the server relays `claimHandover(rockId, att, sig)` from `RELAYER_PRIVATE_KEY`, within a
   daily cap reserved in D1 before each broadcast. The registry credits `att.subject` — inside the
   signature — so the relayer cannot redirect the rock, asks the named account through `isOwner`
   whether it already answers to the new owner, and rebinds `rock.smartAccount`.

The account address, its tokens and its Aqua strategies do not move. Provenance shows
`HandoverInitiated` then `HandoverClaimed`, both backed by a tap. Cancelling a gift deletes the
stored owner swap.

### 6. Retiring a rock

`archiveRock` is the one-way exit and the only way to reuse a tag (D-028). The record stays
readable, the tag binding is released so the next tap starts a new rock id, the read counter is
**not** reset (so an old attestation cannot be replayed against the new rock), and the rock id is
never reissued. It is what makes rehearsal possible with one physical tag. Rock 1 was retired at
the end of the Sepolia rehearsal; **rock 3 is the live demo rock** (awake, funded with test USDC and
WETH, one Wide stream live — read from the registry and Aqua on 2026-09-13).

### 7. The MCP endpoint

`mcp/index.ts` is a stdio [Model Context Protocol](https://modelcontextprotocol.io) server that an
AI client (Claude Desktop, Cursor, a CLI) runs from a checkout. It is **read-only by decision**
(D-008, D-019): every tool either reads Sepolia over RPC or calls the Bank Rock API, or returns
`{ status: "unavailable", reason }`. It holds no key and cannot sign.

| Tool | Reads |
| --- | --- |
| `get_rock_status(rockId)` | the registry: state, owner, Rock Account, tag hash, lost flag, pending gift, USDC/WETH balances |
| `get_strategy_fees(rockId)` | `GET /api/rocks/{id}/strategy`: reserve, each live stream's virtual and executable amounts, fee rate, fees realised |
| `explain_recent_fees(rockId)` | the same, narrated per stream, with the scanned block range |
| `get_strategy_volume(rockId)` | swap count per stream (a count, not a currency volume) |
| `trace_transaction(hash)` | `eth_getTransactionReceipt` |
| `get_server_metrics()` | reachability of RPC, registry and API |
| `query_logs(...)`, `get_waitlist_stats()` | operator routes; need `ADMIN_API_KEY`, otherwise `unavailable` |
| `simulate_cross_chain_intent`, `optimize_idle_yield` | always `unavailable` — no bridge, no idle yield (cut, spec 15 Part 6) |

Configuration snippets and a starter prompt are on [bank-rock.com/mcp](https://bank-rock.com/mcp).
The server needs `SEPOLIA_RPC_URL` and `REGISTRY_ADDRESS` in its `env`.

---

## Contracts on Sepolia

Addresses are copied from [`contracts/deployments/sepolia.json`](./contracts/deployments/sepolia.json)
and [`contracts/deployments/sepolia-aqua-app.json`](./contracts/deployments/sepolia-aqua-app.json),
which the deploy scripts wrote, and are committed as Worker variables in
[`web/wrangler.jsonc`](./web/wrangler.jsonc). `bash scripts/spec-checks.sh` fails if the two ever
disagree (D-034). All three of ours are source-verified on Etherscan
([`contracts/scripts/verify.md`](./contracts/scripts/verify.md)).

| Contract | Address | Deploy block | Written by | What it does |
| --- | --- | --- | --- | --- |
| `BankRockRegistry` | [`0x2A3101Fc525C6DBEc39bef45034E23b13f28F757`](https://sepolia.etherscan.io/address/0x2A3101Fc525C6DBEc39bef45034E23b13f28F757#code) | 11689716 | Bank Rock | Who owns which rock, its state, its Rock Account, its tag, any pending gift. Holds no tokens, takes no approvals, performs no call with caller-supplied calldata. Attester: [`0xF27ccB37FCDab74116D4Ad8E1F980879e6D979a4`](https://sepolia.etherscan.io/address/0xF27ccB37FCDab74116D4Ad8E1F980879e6D979a4) |
| `XYCSwap` (AquaApp) | [`0x8a293F43Eb0DBaA834b40b2eC4E0751e3ce6316B`](https://sepolia.etherscan.io/address/0x8a293F43Eb0DBaA834b40b2eC4E0751e3ce6316B#code) | 11689724 | 1inch (vendored unmodified from `github.com/1inch/aqua` @ `9c5c42e5`, deployed by us) | The constant-product pricing app every rock strategy runs on. Holds nothing. |
| `XYCSwapTaker` | [`0xCd7899E37D50B226E882e79572AB189080fD0016`](https://sepolia.etherscan.io/address/0xCd7899E37D50B226E882e79572AB189080fD0016#code) | 11689726 | Bank Rock | The taker periphery a visitor trades through. No owner, no admin, holds nothing between transactions. |
| `Aqua` | [`0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a`](https://sepolia.etherscan.io/address/0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a) | — | 1inch (canonical deployment) | Tracks per-strategy allowances and moves tokens between wallets on a trade. Custodies nothing. |
| USDC | [`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`](https://sepolia.etherscan.io/address/0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238) | — | Circle (testnet) | 6 decimals; free from [faucet.circle.com](https://faucet.circle.com) |
| WETH | [`0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14`](https://sepolia.etherscan.io/address/0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14) | — | — | 18 decimals |
| EntryPoint v0.7 | [`0x0000000071727De22E5E9d8BAf0edAc6f37da032`](https://sepolia.etherscan.io/address/0x0000000071727De22E5E9d8BAf0edAc6f37da032) | — | ERC-4337 (canonical) | Every UserOperation passes through it |

Rock Accounts are Safe 1.4.1 proxies created through Safe's canonical factory with the
Safe4337Module (spec 16 §1.1 lists those addresses); `permissionless` resolves them itself.

The registry's functions, field by field, and how to drive them from Etherscan without the app:
[`contracts/README.md`](./contracts/README.md). Its NatSpec is written for a reader of the verified
source — every state, error and event has a plain-English `@notice`.

---

## Tech stack

| Layer | What | Notes |
| --- | --- | --- |
| Web app | **Next.js 16** (App Router, Turbopack), **React 19**, **Tailwind CSS 4**, Base UI + shadcn primitives, Framer Motion, Three.js (desktop-only backgrounds) | `web/` |
| Hosting | **Cloudflare Worker** `web` via `@opennextjs/cloudflare`; custom domains `bank-rock.com`, `www.bank-rock.com` | one deploy at a time, from GitHub Actions on push to `main` |
| Database | **Cloudflare D1** (SQLite) through **Drizzle ORM**; migrations in `web/drizzle/` | tag read counters, indexed registry events, gift messages, pending owner swaps, faucet and rate limits, relayer spend, waitlist |
| Sign-in and wallets | **Privy** embedded wallets (`@privy-io/react-auth`, `@privy-io/wagmi`) | methods configured in the Privy dashboard; Sepolia only |
| Accounts | **Safe 1.4.1** on **ERC-4337 EntryPoint 0.7** via `permissionless`; **Pimlico** bundler + verifying paymaster | every user action is a sponsored UserOperation |
| Chain access | **viem** 2, **wagmi** 3 | browser reads through a public Sepolia RPC; server reads through `SEPOLIA_RPC_URL` |
| NFC | **NTAG 424 DNA** SDM: AES-128, RFC 4493 AES-CMAC, NXP session-key derivation, per-UID monotonic counter in D1 | `web/src/lib/nfc/`; pinned to FIPS 197 / SP 800-38A / AN12196 vectors |
| Liquidity | **1inch Aqua** (canonical) + reference **XYCSwap** app + `XYCSwapTaker` periphery | `web/src/lib/aqua/`, `contracts/contracts/aqua/` |
| Contracts | **Solidity** 0.8.24 (registry) / 0.8.30 (vendored Aqua, taker), **Hardhat 3** with Solidity tests, OpenZeppelin 5 | `contracts/` |
| AI | **Model Context Protocol** server (`@modelcontextprotocol/sdk`), stdio | `mcp/` |
| Tests | **Vitest** (unit), **Playwright** + axe (viewport × route matrix), Hardhat/Forge-style `.t.sol` suites (unit + fuzz) | plus 21 static spec checks in `scripts/spec-checks.sh` |
| PWA | Serwist service worker built by `web/scripts/build-sw.mjs` as a `prebuild` step | Web Push optional; its delivery is sandboxed on purpose until mainnet |

---

## Repository layout

```
.
├── README.md                 ← this file
├── DEMO-STATE.md             ← what is simulated, unavailable or unproven, one line each
├── STEERING.md               ← rules for the agent working on this repo
├── specs/                    ← the source of truth: product, flows, architecture, Aqua, Privy,
│                                NFC, UI contract, decisions (D-001…D-039), deployment, demo
├── docs/                     ← reader-facing notes: glossary, dashboard strategies, Aqua notes
├── contracts/
│   ├── contracts/BankRockRegistry.sol      the registry
│   ├── contracts/aqua/                     vendored 1inch Aqua + XYCSwap, our XYCSwapTaker, NOTES.md
│   ├── test/                               registry unit + fuzz, Aqua strategy/taker/shared-reserve suites
│   ├── scripts/                            deploy.js, deploy-aqua-app.js, verify-sepolia.mjs
│   ├── deployments/                        sepolia.json, sepolia-aqua-app.json, the rehearsal log
│   └── audit/                              2026-09-12 findings, changes, sign-off
├── web/                      ← the Next.js app and the Cloudflare Worker
│   ├── src/app/              pages (/, /rock/[id], /r/[id], /learn/*, /mcp, /shop, admin) and API routes
│   ├── src/components/       rock-interface.tsx (the four-tab dashboard), rock/*, ui/*, landing sections
│   ├── src/hooks/            useBankRock (awaken, ship, dock, gift, retire), useTakerActions (swap), reads
│   ├── src/lib/chain/        the ONLY place an address literal may appear (D-015); ABIs
│   ├── src/lib/aqua/         strategy encoding, quote maths, calldata builders, chain reads, events
│   ├── src/lib/nfc/          SDM decrypt + CMAC, counter store, attestation signer, rock resolution
│   ├── src/lib/rock-account*.ts   Safe derivation, registry reads, relayer, stored UserOps
│   ├── src/lib/ui/glossary.ts     every term the pages explain, one sentence each
│   ├── src/demo/rock-420/    the browser-only stage demo rock (DEMO-STATE S-5); nothing on chain
│   ├── drizzle/              D1 migrations
│   ├── scripts/              rehearse-sepolia.ts, build-sw.mjs, export-public-vars.mjs
│   └── wrangler.jsonc        the committed non-secret configuration (addresses, blocks, caps)
├── mcp/                      ← the read-only MCP server (index.ts, chain.ts, api.ts, config.ts)
├── scripts/
│   ├── spec-checks.sh        the 21 static definition-of-done checks (blocking in CI)
│   ├── check-live.sh         is the deployed site up and pointed at contracts that exist?
│   └── sync-web-abi.mjs      copies compiled ABIs into web/ and mcp/
└── .github/workflows/        ci.yml (web, contracts, mcp, spec checks), deploy.yml, rehearse.yml
```

---

## Running it

### Prerequisites

Node 22. No global tools: everything runs through `npm` scripts.

### The web app

```sh
cd web
npm ci
cp .env.example .env.local      # every variable, where it lives in production, and what unset means
npm run dev                     # http://localhost:3000
```

With nothing but the committed public values (`NEXT_PUBLIC_*` addresses and the Privy app id, all
in `.env.example`), the rock pages read the registry and Aqua on Sepolia through a public RPC.
Each further capability is unlocked by exactly one thing, and until then the UI shows
**UNAVAILABLE with the reason** rather than a placeholder (D-013):

| To get… | Set… |
| --- | --- |
| sign-in and any wallet address on screen | `NEXT_PUBLIC_PRIVY_APP_ID` (public; the origin and Sepolia must be enabled in the Privy dashboard) |
| sponsored transactions (awaken, ship, trade, gift, retire) | `NEXT_PUBLIC_PIMLICO_API_KEY` and `PIMLICO_API_KEY`, with a sponsorship policy for chain 11155111 |
| tap verification and the *Verified Physical* badge | `NXP_MASTER_KEY` (must equal the key on the tags), `ATTESTATION_SIGNER_PRIVATE_KEY` (must be the registry's attester), and a D1 database for the counter |
| gift claims | `RELAYER_PRIVATE_KEY` (funded) and `RELAYER_DAILY_CAP_WEI` (unset or `0` disables relaying) |
| cumulative fee figures and provenance | `SEPOLIA_RPC_URL` from a provider that serves wide `eth_getLogs`, plus the two deploy blocks (committed) |
| the ETH faucet | `FAUCET_PRIVATE_KEY` (funded); there is no default key |
| a local database | `npm run db:migrate:local` (D1 binding `DB` in `wrangler.jsonc`) |

`NEXT_PUBLIC_DEMO_MODE=true` turns on the badged simulation surfaces (the bridge sheet, the judge
scenario switcher, an in-memory tap counter) for local rehearsal only. Production pins it to
`false`, and the deploy workflow asserts that.

### Tests and checks

```sh
cd web && npm run lint && npm run typecheck && npm test     # the gate CI runs
cd web && npm run e2e                                      # Playwright viewport × route matrix with axe
cd contracts && npm ci && npm test                         # compiles, runs every .t.sol suite, refreshes ABIs
cd mcp && npm install && npm run build
bash scripts/spec-checks.sh                                # 21 static checks; must print 21 passed
```

CI (`.github/workflows/ci.yml`) runs four jobs on every push and pull request: **Web** (lint,
typecheck, test, build), **Contracts** (test, and fail if the committed ABI copies are stale),
**MCP server** (build, ABI drift), and **Spec checks**. The spec checks are the mechanical half of
the specs' definitions of done: no address literal outside `web/src/lib/chain`, no APY/APR wording,
no synthesized transaction hashes, no fail-open secret checks, the typography scale, and the
committed configuration matching the deployment records.

### Against the live chain

```sh
bash scripts/check-live.sh                        # reads /api/version on bank-rock.com: code at every address?
cd web && npm run rehearse:sepolia -- --dry-run   # the five-step rehearsal, without broadcasting
```

The rehearsal (`web/scripts/rehearse-sepolia.ts`, also runnable from the *Rehearse on Sepolia*
workflow) awakens a rock with a synthetic tag, ships a stream, swaps against it from a visitor's
Safe, gifts it with the owner swap mined before the relayed claim, and has the recipient retire it
and re-awaken the tag — asserting every step from chain reads. Its last live run is
[`contracts/deployments/rehearsal-2026-09-12.md`](./contracts/deployments/rehearsal-2026-09-12.md).

### Deploying

- **Web:** push to `main`. `deploy.yml` exports the `NEXT_PUBLIC_*` values out of `wrangler.jsonc`
  into the build, applies D1 migrations, then runs `npm run deploy` (OpenNext build + Worker
  publish). Secrets live on the Worker (`wrangler secret put`), never in git; `.env.example` says
  which of the three homes each value has.
- **Contracts:** from `contracts/`, `npm run deploy` (registry; needs `SEPOLIA_RPC_URL`,
  `DEPLOYER_PRIVATE_KEY`, `ATTESTATION_SIGNER_ADDRESS`), then `npm run deploy:aqua-app` (XYCSwap +
  taker against the canonical Aqua), then `npm run verify:sepolia`. Each script writes what it
  deployed to `contracts/deployments/`; copy the outputs into `wrangler.jsonc` and the spec check
  holds them equal from then on. The order and the reasons are in
  [`specs/12-deployment.md`](./specs/12-deployment.md).
- **Tag:** program the NTAG 424 DNA per [`specs/18-demo-readiness.md`](./specs/18-demo-readiness.md)
  §4.2 (SDM meta-read and file-read keys, offsets, `0xC7` PICCDataTag).

---

## What is real and what is simulated

Every user-visible value is in one of three states, computed and never assumed: **REAL** (a live
contract, RPC or database answered), **DEMO** (invented, badged, and only under
`NEXT_PUBLIC_DEMO_MODE=true`) or **UNAVAILABLE** (the backing is unreachable; the UI says what is
missing and shows no number). There is no fourth state and no `catch` block that substitutes a
plausible value. The living list is [`DEMO-STATE.md`](./DEMO-STATE.md); the summary as of this
README:

**Real, exercised on Sepolia** (rehearsal 2026-09-12): sponsored awakening with Safe deployment,
shipping a stream, a visitor swap through the taker with the fee landing in the rock's reserve, a
named gift with the owner swap mined before the relayed claim, a sponsored retirement by the
recipient from an empty wallet, and re-awakening the same tag into a new rock id. The registry,
app and taker are deployed, verified and served by the live site.

**Real in code, not yet proven in the world:** the NTAG 424 DNA verifier against a *physical* tag
(P-1); the honest failure of a deliberately reverting UserOperation (P-7); the relayer's daily cap
actually refusing a claim (P-10).

**Simulated, and badged as such:** the cross-chain bridge sheet (S-1) and the judge scenario
switcher's sample views (S-3), both only under the demo flag; the magic tap link that stands in for
the chip until the tag is programmed (S-4 — everything after the tap is the real path); and
**rock #420, the stage prop** (S-5): `/rock/420` is a rock that exists only in the browser —
seeded balances, streams, trades and history in `localStorage`, every action answering a `DEMO`
capability with no transaction hash, a banner naming it a demo and a *Reset demo* control. It is
served regardless of the demo flag and never touches the registry, Aqua, an RPC or the database.
**Rock 3 is the real one.**

**Unavailable on purpose, with no path:** AR view; alert delivery and Web Push (preferences
persist, nothing is sent — sandboxed intentionally until the project is on mainnet); fiat
on/off-ramp; session keys for an AI runtime; an ERC-20 gas paymaster; idle yield into lending
protocols; replacement tags; and **any APY or APR figure, ever**.

**Designed, not implemented:** balancing a one-token top-up inside the ship operation against a
Bank Rock house stream ([`specs/21-balance-and-ship.md`](./specs/21-balance-and-ship.md), D-038).
Today a rock funded with only USDC must be sent WETH before it can trade in both directions.

---

## Security model, in plain words

| Who or what | Trusted for | Not trusted for |
| --- | --- | --- |
| The NFC chip | opening the right page and proving a fresh tap happened | identity, custody, or any authorisation to spend — it holds no key |
| The verifier (our server) | stating that a genuine tap happened, for a named wallet and account | spending anything; the attester key holds no funds |
| Privy | sign-in and wallet signing | deciding who owns a rock |
| The Rock Account (Safe) | holding the tokens and executing what its owner signed | anything off-chain |
| The registry | who owns which rock and its state | custody — it cannot hold or move a token |
| Aqua and XYCSwap | counting allowances, pricing, moving tokens on a trade | guaranteed value or price safety |
| The relayer | paying gas for a gift claim and submitting the owner swap the giver already signed | choosing the recipient — the registry credits the wallet inside the signature |
| Bank Rock's servers and database | preparing screens, storing presentation data and the tap counter | financial truth — balances and ownership are always read from the chain |
| The MCP server | reading and explaining | doing — it holds no key |

Consequences a judge can check: a copied tap link shows `unverified` (the counter is spent); the
registry has no function that receives tokens or an approval; a gift cannot be redirected by the
server that pays for it; no client code path can paint the badge; a reverted UserOperation is
reported as a failure with nothing claimed; and every number on screen is either a chain read or
an explicit "unavailable".

What is **deliberately deferred until a rock is worth something** (DEMO-STATE §7, spec 19 Part 4):
a `bytes32 action` field in the attestation so one signature cannot satisfy two functions; a
second, independent attester; a cold review of the last two contract changes together; an external
audit of the vendored Aqua sources (the review covered our integration, not Aqua itself); and
telling the owner in the UI that retiring is final. Accepted at any value, and written down as
decisions: tokens mis-sent to the taker are lost, and the `Handover` struct will not gain fields.

The contract review, its checklist and the Etherscan-readability standard are
[`specs/19-contract-review-and-hardening.md`](./specs/19-contract-review-and-hardening.md); the
findings, changes and sign-off are in [`contracts/audit/`](./contracts/audit/). The NFC threat
model is [`specs/06-nfc-security.md`](./specs/06-nfc-security.md). Security contact:
`security@bank-rock.com`.

---

## Known limits and what is next

**Limits of this build**

- Sepolia only; the tokens have no value, and the mechanics are what is being demonstrated.
- The reference `XYCSwap` app has one curve shape, so strategies differ only by fee. There are no
  pricing parameters beyond `feeBps` and no expiry; a custom Aqua app is deferred (D-006).
- Your Privy sign-in is the key. Someone who takes over the login can act as the wallet without
  holding the stone.
- Rate limits, the faucet, the relayer cap and the tap counter all live in D1 and **fail closed**:
  when the database cannot be reached, those routes refuse rather than guess.
- The `www` host's bare root still redirects wrongly (DEMO-STATE W-1); every other path is fine.

**Next**

1. Program the prototype tag and run the copied-URL test on stage — the acceptance test for
   "the tag is not authorisation" (DEMO-STATE P-1).
2. **Balance and ship** ([`specs/21`](./specs/21-balance-and-ship.md)): convert half of a one-token
   top-up against a Bank Rock house stream inside the same sponsored operation, with silent
   embedded-wallet signing (D-038, D-039).
3. The pre-mainnet list above (attestation `action`, second attester, external Aqua audit).
4. The rock as a **second factor**: high-value moves require both the owner's signature and a fresh
   tap of the stone, so the money cannot be moved without holding it
   ([`specs/13`](./specs/13-after-the-hackathon-ideas.md) §1).
5. An **inactivity recovery** module so a forgotten rock's reserve is not stranded (spec 13 §2).
6. Scoped session keys for an agent that may rebalance within bounds (D-010), an ERC-20 gas
   paymaster so a rock pays its own maintenance (D-011), and a custom Aqua app or SwapVM program
   with richer pricing.

An earlier production-architecture document, [`docs/after-the-hackathon.md`](./docs/after-the-hackathon.md),
is kept as history; it describes a keeper and multi-chain deposits that were later cut.

---

## Documentation

Start with the [specification index](./specs/README.md). The most useful entry points:

| Read | For |
| --- | --- |
| [`docs/glossary.md`](./docs/glossary.md) | every term the app uses, one plain sentence each — the same text the tooltips show |
| [`specs/01-product.md`](./specs/01-product.md), [`02-user-flows.md`](./specs/02-user-flows.md) | the proposition and every flow, step by step |
| [`specs/03-system-architecture.md`](./specs/03-system-architecture.md) | components and trust boundaries |
| [`specs/04-aqua-integration.md`](./specs/04-aqua-integration.md), [`contracts/contracts/aqua/NOTES.md`](./contracts/contracts/aqua/NOTES.md) | the Aqua model, the strategy encoding, where the fee goes, why a taker needs a contract |
| [`docs/dashboard-strategies.md`](./docs/dashboard-strategies.md) | how the three fee tiers look and behave on the dashboard |
| [`specs/05-privy-wallets.md`](./specs/05-privy-wallets.md), [`06-nfc-security.md`](./specs/06-nfc-security.md) | accounts and ownership; the tag threat model |
| [`specs/09-decisions.md`](./specs/09-decisions.md) | the decision log, D-001 to D-039 |
| [`specs/17-mobile-ui-and-typography.md`](./specs/17-mobile-ui-and-typography.md) | the phone-first UI contract the CI checks enforce |
| [`specs/18-demo-readiness.md`](./specs/18-demo-readiness.md), [`20-live-sepolia-plan.md`](./specs/20-live-sepolia-plan.md) | the operator runbook and the live plan |
| [`DEMO-STATE.md`](./DEMO-STATE.md) | what is not real yet, and what makes each line real |

## Independence

This repository is the sole source of truth for the ETHGlobal Bank Rock project. It does not depend
on or reuse the old Bank Rock project. No mainnet funds are involved anywhere.
