# Environment, secrets and external dependencies

## Purpose

This document is the answer to "what do we need to make the app run for real". It lists every
external service the code depends on, every secret or configuration value it reads, who provides
it, and which phase of [`15-exit-demo-mode.md`](./15-exit-demo-mode.md) first needs it.

Target network is **Ethereum Sepolia (chain ID 11155111)** per decision D-023.

Everything marked **Fact** was verified on 2026-09-12 by RPC call, HTTP response, or the vendor's
own documentation. Everything marked **Hypothesis** must be proven during the phase that needs it.

---

## Part 1 — External dependencies on Ethereum Sepolia

### 1.1 Verified on-chain (Fact)

All addresses below returned non-empty `eth_getCode` on Ethereum Sepolia via
`ethereum-sepolia-rpc.publicnode.com`.

| Dependency | Address | Bytes | Note |
| --- | --- | --- | --- |
| **1inch Aqua** | `0x1111113ccf1426a8e30e2bff5e005d929bf6a90a` | 5,619 | Bytecode SHA-256 is identical to the Base mainnet deployment (`4c886bff…`). Canonical, deterministic. |
| 1inch AquaRouter | `0x499943e74fb0ce105688beee8ef2abec5d936d31` | 6,251 | Source verified on Sepolia Etherscan as `AquaRouter`, exact match. Not needed for our flow. |
| **USDC** (Circle testnet) | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` | 1,798 | `symbol()` = `USDC`, `decimals()` = 6. `FiatTokenProxy`. |
| **WETH** | `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14` | 3,124 | `symbol()` = `WETH`. The same address swap-vm's own Sepolia parameters use. |
| EntryPoint v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` | 16,035 | Required by `permissionless` + Safe4337Module. |
| EntryPoint v0.6 | `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` | 23,689 | Present; not used. |
| SafeProxyFactory 1.4.1 | `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67` | 3,054 | |
| Safe singleton 1.4.1 | `0x41675C099F32341bf84BFc5382aF534df5C7461a` | 23,579 | |
| SafeL2 singleton 1.4.1 | `0x29fcB43b46531BcA003ddC8FCB67FFE91900C762` | 24,421 | |
| Safe4337Module v0.3 | `0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226` | 8,373 | |
| SafeModuleSetup | `0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47` | 547 | |
| MultiSend 1.4.1 | `0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526` | 629 | |
| MultiSendCallOnly 1.4.1 | `0x9641d764fc13c8B624c04430C7356C1C7C8102e2` | 410 | |

**Consequence:** the entire ERC-4337 stack `lib/aa.ts` assumes (`toSafeSmartAccount` with
`version: "1.4.1"`, EntryPoint 0.7) has its canonical dependencies on Sepolia. `permissionless`
resolves these addresses itself; nothing needs to be configured.

**Correction (Fact, read from Sepolia 2026-09-12, `contracts/contracts/aqua/NOTES.md` §8.6): the
two Aqua rows above are labelled the wrong way round.** `0x1111113ccf…6a90a` — the canonical
address, the one we use — answers `owner()` with `0x4134e66d52EfC4C77DD8Ccc952D87b9E92E0C352` and
its dispatcher carries `transferOwnership`, `renounceOwnership`, `rescueFunds`, `multicall` and
`simulate` **alongside** the six `IAqua` selectors. That shape is an **`AquaRouter`**
(`Aqua` + `Simulator` + `Multicall` + `Rescuable`), not plain `Aqua`. `0x4999…6d31`, which the
table calls the AquaRouter, has **no `owner()` at all**.

What the integration relies on, stated so the mislabelling cannot become a surprise:

- **only the six `IAqua` selectors**, all present and verified at the canonical address —
  `ship f50b870f`, `dock 28defc17`, `rawBalances 6d58b4cc`, `safeBalances 65f2fe14`,
  `pull b00bbd10`, `push 47d72768`;
- the address as an *input from the environment* (`NEXT_PUBLIC_AQUA_ADDRESS`), never a literal;
- nothing about `owner()`, `rescueFunds`, `multicall` or `simulate`, which are never called.

Nothing changes in the integration. What is worth knowing is that an **owner exists** on the
contract that holds our makers' ERC-20 allowances, and that `0x4999…6d31` is not the router the
table claims. Separately: the vendored `Aqua.sol` does **not** compile to the deployed bytecode
under our settings (3,891 bytes against 5,619, same selectors, different jump table). That is
fine, because we never deploy it — the local copy is a source-faithful test double, not a
bytecode-identical one, and a local `Aqua` deployment must not be treated as a reproduction of
the canonical contract.

### 1.2 Not on Sepolia — must be deployed by us (Fact)

| Dependency | Canonical address elsewhere | Sepolia | Action |
| --- | --- | --- | --- |
| ~~**SwapVM router**~~ *(not deployed — D-030)* | `0x111111338c5091e8440b67b168bae16a668ac0de` (Base, Ethereum mainnet, 13 others) | **no code** | Self-deploy from `github.com/1inch/swap-vm`. Plain `m.contract("SwapVMRouter", [aqua, weth, owner, name, version])` via Hardhat Ignition — no CREATE2 factory, so our address will be non-canonical. Constructor: `aqua = 0x1111113ccf…6a90a`, `weth = 0xfFf9…6B14`, `owner = our deployer`. Solidity 0.8.30, `viaIR`. The repo's `hardhat.config.ts` configures only `localhost`. **Superseded:** what is deployed instead is `XYCSwap` + `XYCSwapTaker` (spec 04, D-030), and the router module that can read Aqua balances is `AquaSwapVMRouter`, not plain `SwapVMRouter`. |
| **BankRockRegistry** | never deployed anywhere | no code | **Rewritten (done);** `contracts/scripts/deploy.js` is a real deploy and the `sepolia` network is configured. Still needs to be run. |

### 1.3 Dead on Sepolia — must be removed from the code (Fact)

| Currently in code | Status on Sepolia | Consequence |
| --- | --- | --- |
| `0x111111125421cA6dc452d289314280a0f8842A65` labelled "Aqua" | Has code (24,545 B) — but it is the **1inch Aggregation Router V6**, not Aqua | Replace with the real Aqua address. |
| `0x222222225421ca6dc452d289314280a0f8842a65` labelled "SwapVM" | No code on any chain checked | Fabricated. Delete. |
| `0x1111111254EEB25477B68fb85Ed929f73A960582` labelled "1inch v6 on Base Sepolia" | No code | It is the mainnet v5 router. Delete with `executeTrade` (D-020). |
| `0x036CbD53842c5426634e7929541eC2318f3dCF7e` "testUSDC" | Has code (514 B) but it is not USDC — Base Sepolia's USDC address collides with an unrelated contract here | Replace with `0x1c7D…7238`. |
| `0x4200000000000000000000000000000000000006` "testWETH" | No code (OP-stack predeploy) | Replace with `0xfFf9…6B14`. |
| `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (Base mainnet USDC, in quote + Gelato) | Irrelevant | Delete. |

### 1.4 Off-chain services (Fact unless marked)

| Service | Sepolia support | Evidence | Consequence |
| --- | --- | --- | --- |
| **Privy** | Yes. `import { sepolia } from "viem/chains"` in `supportedChains`; embedded wallets connect to the first listed chain. | Privy docs, "Configuring EVM networks" | `providers.tsx` must list `sepolia` first and set `defaultChain: sepolia`. |
| **Pimlico** bundler + verifying paymaster | Yes. Endpoint `https://api.pimlico.io/v2/sepolia/rpc?apikey=…` (or `/v2/11155111/rpc`). ERC-20 paymaster also lists USDC on Sepolia. | Pimlico docs | `lib/aa.ts` currently hardcodes `/v2/84532/`. A sponsorship policy must be created in the Pimlico dashboard for chain 11155111. |
| **1inch Swap API** (`/api/quote`) | **No.** Supported chains are mainnets only: Ethereum, Base, BNB, zkSync, Gnosis, Optimism, Cronos, Polygon, Monad, Linea, Sonic, Unichain, Arbitrum, Avalanche, HyperEVM, Robinhood, Solana. No testnet appears in the list. | 1inch Business portal, Classic Swap introduction | `/api/quote` and `1INCH_API_KEY` are **deleted**. Quotes come from `XYCSwap.quoteExactIn` (a view) against the shipped strategy — the identical code path `swapExactIn` runs, on the same block's balances (D-030). |
| **Resend** | Chain-agnostic. **Until `bank-rock.com` is verified in Resend (SPF + DKIM DNS records), the sandbox sender `*@resend.dev` delivers only to the email address the Resend account was created with.** | Resend docs, Verified Domains | The current `from: 'alerts@resend.dev'` will never reach a user. Domain verification is a prerequisite for any real email. |
| **Cloudflare Workers / OpenNext** | Chain-agnostic. With `compatibility_date >= 2026-08-04`, `nodejs_compat` is **enabled by default**; the repo's date is `2026-09-11`. | Cloudflare changelog 2026-08-04 | `node:crypto` and `Buffer` in the NFC verifier work as-is. Fact F-4 in spec 15 is corrected accordingly. `node-aes-cmac@0.1.1` is pure JS with no dependencies. |
| **Cloudflare D1** | Chain-agnostic. Database `bankrock-db` (`f0a28d6f-…`) is already bound in `wrangler.jsonc`. | `wrangler.jsonc` | Reachable only after D-016 (`getCloudflareContext()`). |
| **Circle USDC faucet** | `https://faucet.circle.com` — 20 USDC per address per 2 hours on Sepolia. ETHGlobal also runs one at `ethglobal.com/faucet/sepolia-11155111-usdc`. | Circle docs | Rock reserves and taker balances come from here. |
| **Sepolia ETH faucets** | Google Cloud Web3 faucet, Alchemy faucet, ETHGlobal faucet. Typically 0.05–0.5 ETH/day with a mainnet-balance or login gate. | — | See funding budget in Part 3. |
| **Alchemy Notify** (webhooks) | Supports Sepolia. | — | Optional; the route is currently unauthenticated when the secret is unset (SA-9). |
| **Gelato Web3 Functions** | Supports Sepolia. | — | Stays `DEMO`; the function's contract interface is fabricated (X-7). |
| **Across** (cross-chain modal) | Has Sepolia testnet SpokePools. | — | Stays `DEMO` per Part 6 of spec 15. |

### 1.5 Aqua integration facts that change the design (Fact)

From `github.com/1inch/aqua` `src/Aqua.sol`, `src/interfaces/IAqua.sol` and the README:

1. **The ABI in `lib/aa.ts` is wrong.** It encodes `ship(bytes32 strategyHash, bytes bytecode)`.
   The real signature is:
   ```solidity
   function ship(address app, bytes calldata strategy, address[] calldata tokens, uint256[] calldata amounts)
       external returns (bytes32 strategyHash);
   function dock(address app, bytes32 strategyHash, address[] calldata tokens) external;
   function rawBalances(address maker, address app, bytes32 strategyHash, address token)
       external view returns (uint248 balance, uint8 tokensCount);
   function safeBalances(address maker, address app, bytes32 strategyHash, address token0, address token1)
       external view returns (uint256 balance0, uint256 balance1);
   ```
   Events: `Shipped(maker, app, strategyHash, strategy)`, `Docked(maker, app, strategyHash)`,
   `Pulled(...)`, `Pushed(...)`. Even if the dead code were wired, every call would revert.
2. **Makers approve tokens to Aqua itself** (`token.approve(address(aqua), amount)`), once, for all
   strategies. Not to the app. The atomic batch in spec 05 becomes:
   `approve(Aqua, USDC)`, `approve(Aqua, WETH)`, `Aqua.ship(app, strategy, [USDC, WETH], [a, b])`.
3. **`strategyHash = keccak256(strategy)`** and the strategy is immutable once shipped. Spec 04's
   "rock ID as salt" is satisfied by including the public rock ID in the `strategy` bytes.
4. **`app` is an `AquaApp` implementation**, not Aqua. Two options:
   - the self-deployed **SwapVM router**, using an order with `useAquaInsteadOfSignature: true`
     and a program built from `_staticBalancesXD` / `_limitSwap1D` / XYC instructions;
   - the reference **`examples/apps/XYCSwap.sol`** constant-product app from the Aqua repo, which
     is smaller and maps directly onto spec 04's "constant-product strategy".
   *(**Resolved 2026-09-12, and the second option was taken — D-030.** The hypothesis about
   SwapVM was checked and is a **Fact**: for an Aqua-mode order `strategy = abi.encode(order)` and
   `strategyHash == swapVM.hash(order)`, per swap-vm's own
   `test/solidity/base/AquaStrategyBuilders.sol`. It was not the blocker; the program bytes were.
   The shipped encoding is XYCSwap's `abi.encode(Strategy{maker, token0, token1, feeBps, salt})`
   with the rock id in the salt — spec 04 "Strategy direction".)*
5. **There is no JavaScript SDK.** `@1inch/swap-vm` is not published on npm; the repo's
   `package.json` has no `main` or `exports`. SwapVM *programs* are built in Solidity via
   `ProgramBuilder`. ~~This is the largest unknown in Phase 3.~~ **It no longer applies to the
   path taken:** XYCSwap's strategy is a plain ABI-encoded struct with no program bytes at all
   (D-030). It remains the reason the router path was not taken.
6. Balances read for the UI come from `Aqua.safeBalances(rockAccount, app, strategyHash, USDC, WETH)`
   (virtual) and `ERC20.balanceOf(rockAccount)` (actual), which is exactly the pair spec 04 requires
   the UI to distinguish.

---

## Part 2 — Secrets and configuration inventory

Variable names below are **as the code reads them now**. The renames flagged in §2.1 have been
made, and [`../web/.env.example`](../web/.env.example) is the authoritative list: every variable
it names is read by the code as spelled, and anything the code does not read has been removed from
it. §2.1 is kept as history of what the mismatch was.

### 2.1 Mismatches between `.env.example` and the code (Fact)

| `.env.example` says | Code reads | Effect today |
| --- | --- | --- |
| `NTAG_MASTER_KEY` | `NXP_MASTER_KEY` | The master key is never picked up; the verifier runs with 32 zeros. |
| `NEXT_PUBLIC_REGISTRY_ADDRESS` | `REGISTRY_ADDRESS` (mcp, deploy script); nothing in `web/` reads either | The web app hardcodes the address. |
| `PIMLICO_API_KEY` | `PIMLICO_API_KEY \|\| NEXT_PUBLIC_PIMLICO_API_KEY` | Fine server-side; if ever used client-side only the `NEXT_PUBLIC_` form is visible. |
| — | `BASE_SEPOLIA_RPC_URL` (3 sites) **and** `RPC_URL` (1 site) | Two names for one value. |
| — | `ADMIN_PASSWORD`, `ADMIN_JWT_SECRET`, `CRON_SECRET`, `ALCHEMY_WEBHOOK_SECRET`, `FAUCET_PRIVATE_KEY`, `SIGNER_PRIVATE_KEY`, `ALERT_EMAIL_ADDRESS`, `ADMIN_API_KEY`, `NEXT_PUBLIC_APP_URL`, `1INCH_API_KEY`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_DATABASE_ID`, `CLOUDFLARE_D1_TOKEN`, `BANKROCK_API_URL` | Fourteen variables the code reads that the example file never mentions. |

### 2.2 The inventory

**Provider legend:** *You* = created in a vendor dashboard by the operator. *Generate* = random
secret you create locally (`openssl rand -hex 32`). *Output* = produced by a deploy step.
*Wallet* = a fresh private key you generate and fund; never reuse across roles.

**"Where it lives in production" legend (D-034 — one source of truth per kind of value):**

| | Home | What belongs there |
| --- | --- | --- |
| **[1]** | `web/wrangler.jsonc` `vars`, **in git** | Non-secret, account-independent configuration: the origin, the chain id, the demo flag, every contract address, the two deploy blocks, the relayer's daily cap. Changed by a commit and a deploy, reviewed like code. |
| **[2]** | A **GitHub Actions input**, read by `deploy.yml` | Account-specific *public* identifiers: `NEXT_PUBLIC_PRIVY_APP_ID` (repository **variable**) and `NEXT_PUBLIC_PIMLICO_API_KEY` (repository **secret** — browser-visible by construction, but still a key). Set once by the operator. |
| **[3]** | A **Worker secret** — `wrangler secret put NAME`, or dashboard → Variables and Secrets → **Secret** | Everything a deploy must never carry. A few entries here are not secret in the cryptographic sense (`ALERT_FROM_ADDRESS`, `ALERT_EMAIL_ADDRESS`, `WEB_PUSH_SUBJECT`, the two `NXP_KEY_DIVERSIFY*`), but a **plain-text Worker variable is deleted by the next deploy** (see §2.3.2), so Secret is the only home on the Worker that survives one. |

A value is in exactly one of the three. Whatever is not in one of them is not configuration of the
running app: the deploy credentials are GitHub Actions secrets, `DEPLOYER_PRIVATE_KEY` and the D1
tooling variables are the operator's shell, and `BANKROCK_API_URL` is the agent's MCP `env`.

| # | Variable (today → target) | Provider | Where it lives in production | Where used | Needed from | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `NEXT_PUBLIC_PRIVY_APP_ID` | You — dashboard.privy.io | **[2]** GitHub repo *variable* | `providers.tsx` | Phase 0 | Also configure in the dashboard: allowed origin `https://bank-rock.com`, login methods email / Google / Apple / wallet, and enable Sepolia. Without it the app boots with a placeholder app ID and `login()` silently activates a **fabricated embedded wallet** (`0x71C8…1b47`, `collector@bankrock.eth`) — spec 15 A-1/A-2. Phase 1 replaces that with an `UNAVAILABLE` sign-in state. |
| 2 | `NEXT_PUBLIC_APP_URL` | Fixed: `https://bank-rock.com` | **[1]** `wrangler.jsonc` `vars` | CORS in `middleware.ts`; email CTAs; MCP base URL | Phase 0 | Replaces the `bankrock.xyz` / `pages.dev` literals (D-022). |
| 3 | `NEXT_PUBLIC_CHAIN_ID` | Fixed: `11155111` | **[1]** `wrangler.jsonc` `vars` | `lib/chain/index.ts` (D-015), `lib/demo.ts`, `lib/nfc/attestation.ts` | Phase 1 | **Read now** — the "currently unread" note this row used to carry is stale. It is also the EIP-712 domain's `chainId`, so a wrong value makes every attestation unverifiable rather than merely mis-routed. |
| 4 | `SEPOLIA_RPC_URL` | You — Alchemy or Infura Sepolia endpoint | **[3]** Worker secret | `lib/chain`, `lib/indexer.ts`, `lib/aqua/read.ts`, faucet, relayer, Rock Account derivation | Phase 1 | **Done:** one name, no aliases. **D-036:** `https://ethereum-sepolia-rpc.publicnode.com` is a measured, working value (filtered `eth_getLogs` over 2,000 and 10,000 blocks served); a keyed provider is the recommendation for demo day because a public endpoint's rate limit is shared, not a condition. |
| 5 | `ADMIN_PASSWORD` | Generate | **[3]** Worker secret | `/api/admin/login` | Phase 0 | |
| 6 | `ADMIN_JWT_SECRET` | Generate, 32 bytes | **[3]** Worker secret | `lib/auth.ts`, `middleware.ts` | Phase 0 | Must be set; the fallback string makes admin sessions forgeable (SA-8). |
| 7 | `CRON_SECRET` | Generate | **[3]** Worker secret | `/api/cron/snapshot` | Phase 1 | Moves from query string to header in Phase 5. |
| 8 | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | You — Cloudflare dashboard, token scoped as in §2.3.1 (Workers Scripts, D1, Workers Routes, DNS — **not** Pages) | GitHub Actions secrets (deploy credentials, not app config) | GitHub Actions secrets for `deploy.yml` | Phase 0 | `deploy.yml` must be rewritten first (B-5). |
| 9 | `CLOUDFLARE_DATABASE_ID`, `CLOUDFLARE_D1_TOKEN` | You — same token; ID is `f0a28d6f-0a36-46aa-b711-8b5297913d2e` | Operator's shell / local `.env` (tooling only) | `drizzle.config.ts` (migrations / studio only) | Phase 1 | Not needed at runtime; the Worker uses the `DB` binding. |
| 10 | `DEPLOYER_PRIVATE_KEY` | Wallet — fresh, funded | Operator's shell only (never a file) | `contracts/scripts/deploy.js`, `contracts/scripts/deploy-aqua-app.js` — the operator's shell only, never a file | Phase 2 | Deploys the registry and becomes its administrator (pause, rotate attester). Also deploys XYCSwap + XYCSwapTaker, **neither of which has an owner**, so it keeps no privilege there. |
| 11 | `REGISTRY_ADDRESS` / `NEXT_PUBLIC_REGISTRY_ADDRESS` → `NEXT_PUBLIC_REGISTRY_ADDRESS` | Output of registry deploy | **[1]** `wrangler.jsonc` `vars` | chain module, MCP | Phase 2 | Startup must assert code exists at it (D-015). |
| 12 | `NEXT_PUBLIC_AQUA_APP_ADDRESS`, `NEXT_PUBLIC_AQUA_TAKER_ADDRESS` | Output of `deploy-aqua-app.js` | **[1]** `wrangler.jsonc` `vars` | chain module, `lib/aqua`, taker hook | Phase 3 | Replaces `NEXT_PUBLIC_SWAPVM_ROUTER_ADDRESS`, which is **removed**: no SwapVM router is deployed (D-030). The app is the reference XYCSwap; the taker is the periphery a visitor calls. Both unset ⇒ every Aqua surface is UNAVAILABLE. |
| 13 | `NEXT_PUBLIC_AQUA_ADDRESS` (new) | Fixed: `0x1111113ccf1426a8e30e2bff5e005d929bf6a90a` | **[1]** `wrangler.jsonc` `vars` | chain module | Phase 3 | |
| 14 | `NEXT_PUBLIC_USDC_ADDRESS`, `NEXT_PUBLIC_WETH_ADDRESS` (new) | Fixed: `0x1c7D…7238`, `0xfFf9…6B14` | **[1]** `wrangler.jsonc` `vars` | chain module | Phase 2 | |
| 15 | `PIMLICO_API_KEY` and `NEXT_PUBLIC_PIMLICO_API_KEY` | You — dashboard.pimlico.io | **[3]** Worker secret / **[2]** GitHub repo secret for the `NEXT_PUBLIC_` copy | `lib/aa.ts` | Phase 2 | Create a **sponsorship policy** for chain 11155111 in the dashboard or the verifying paymaster rejects every UserOp. Testnet sponsorship is free. The `NEXT_PUBLIC_` copy is exposed to browsers — restrict the key by origin in the dashboard. |
| 16 | `FAUCET_PRIVATE_KEY` | Wallet — fresh, funded | **[3]** Worker secret | `/api/faucet` | Phase 2 | **Must be set.** The current default is the public Anvil key (SA-4). Sends 0.01 ETH per claim. |
| 17 | `ATTESTATION_SIGNER_PRIVATE_KEY` | Wallet — fresh, **unfunded** | **[3]** Worker secret | `lib/nfc/attestation.ts`; `lib/rock-account.server.ts` derives the expected attester from it | Phase 4 | **Renamed from `SIGNER_PRIVATE_KEY`, which is removed.** Its address is the registry's trusted attester and is passed to the deploy script as `ATTESTATION_SIGNER_ADDRESS`. Signs the six-field struct (D-026) and nothing else. Never holds funds. |
| 18 | `NXP_MASTER_KEY` | Generate, 16 bytes hex, at tag provisioning | **[3]** Worker secret | `/api/nfc/verify` | Phase 4 | Must equal the key written to the physical NTAG 424 DNA tags. Store in Cloudflare secrets only. |
| 19 | `RESEND_API_KEY` | You — resend.com | **[3]** Worker secret | `lib/email-service.ts`, Gelato alert route | Phase 5 | **Plus** domain verification for `bank-rock.com` (add the SPF/DKIM records Resend shows) and change `from` to `alerts@bank-rock.com`. Without verification, mail reaches only your own inbox. |
| 20 | `ALERT_EMAIL_ADDRESS` | Fixed: an inbox you read | **[3]** Worker secret | Gelato alert route | Phase 5 | **No default.** The `security@bankrock.xyz` fallback is gone (D-017, D-022): unset means `/api/alerts/gelato` answers UNAVAILABLE rather than mailing anyone. |
| 21 | `ADMIN_API_KEY` | Generate | **[3]** Worker secret | `/api/newsletter` operator view | Phase 5 | |
| 22 | `ALCHEMY_WEBHOOK_SECRET` | You — Alchemy Notify, only if used | **[3]** Worker secret | `/api/webhooks/alchemy` | Optional | If unset the route must reject, not accept (D-017). |
| 23 | `BANKROCK_API_URL` | Fixed: `https://bank-rock.com` | The agent's MCP `env` block | `mcp/index.ts` | Phase 1 | |
| 24 | ~~`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`~~ | — | — | — | — | **Removed.** The counter store is D1 (`nfc_counters`); the in-memory store is used only when `NEXT_PUBLIC_DEMO_MODE=true`. |
| 25 | ~~`1INCH_API_KEY`~~ | — | — | — | — | **Removed** with `/api/quote`. The API does not serve Sepolia (§1.4); quotes come from `XYCSwap.quoteExactIn` (spec 04). |
| 26 | `ALERT_API_URL`, `QUOTE_API_URL`, `ROCK_ID` (Gelato secrets) | — | Gelato task secrets | `web3-functions/` | — | `DEMO`; not needed. |
| 27 | `NEXT_PUBLIC_DEMO_MODE` | Fixed: `false` in production | **[1]** `wrangler.jsonc` `vars` | everywhere, through `lib/demo.ts` | Phase 1 | D-013. Only the literal `"true"` enables simulation; the deploy job sets `"false"` explicitly and a spec check asserts it. |
| 28 | `REGISTRY_DEPLOY_BLOCK` | Output of the registry deploy | **[1]** `wrangler.jsonc` `vars` | `lib/indexer.ts` | Phase 2 | The indexer scans forward from here in 2,000-block chunks. Unset ⇒ provenance is UNAVAILABLE, never scanned from block 0. |
| 29 | `AQUA_APP_DEPLOY_BLOCK` | Output of `deploy-aqua-app.js` | **[1]** `wrangler.jsonc` `vars` | `lib/chain`, `lib/aqua/read.ts` | Phase 3 | Bounds the `Pushed` log scan the cumulative fee figure is summed from. Unset ⇒ a short recent window, reported as partial. |
| 30 | `RELAYER_PRIVATE_KEY` | Wallet — fresh, **funded** | **[3]** Worker secret | `lib/rock-account.server.ts`, `POST /api/rocks/[id]/claim` | Phase 2 | Pays gas for `claimHandover` (D-027): a gift recipient has no gas and does not yet control the Rock Account. Safe because the registry credits `att.subject`, not `msg.sender` (D-026). Unset ⇒ claims are UNAVAILABLE, never free. |
| 31 | `NXP_KEY_DIVERSIFY` | Optional, default off | **[3]** Worker secret | `lib/nfc/config.ts` | Phase 4 | `"true"` enables AN10922 per-tag key diversification. Must match how the tags were provisioned. Keep it **off** for the hackathon (spec 18 §4.2 item 4). |
| 32 | `NXP_KEY_DIVERSIFY_APP_ID` | With #31 only | **[3]** Worker secret | `lib/nfc/config.ts` | Phase 4 | The 3-byte AID used in the derivation. Meaningless unless #31 is on. |
| 33 | `ALERT_FROM_ADDRESS` | You — a verified Resend sender | **[3]** Worker secret | `lib/email-service.ts` | Phase 5 | e.g. `Bank Rock <alerts@bank-rock.com>`, once the domain is verified. Until then the sandbox sender reaches only your own inbox (E-6). |
| 34 | `RELAYER_DAILY_CAP_WEI` | You — a number, in wei | **[1]** `wrangler.jsonc` `vars` | `lib/rock-account.server.ts` (`relayerDailyCapWei`, `reserveRelayerSpend`), `POST /api/rocks/[id]/claim` | Phase 2 | **Fails closed, and that is the point (audit `F-10`/`P-1`, D-032).** How much the relayer may spend per **UTC day**, accumulated in D1 and reserved *before* each claim is broadcast, in one atomic statement so two concurrent claims cannot both fit under a cap only one of them fits. **Unset or `0` disables relaying entirely** — an uncapped funded key is the finding this closes, so "no cap" is the closed branch, not the permissive one. Also refused: a non-integer, and a value larger than the ledger can track. 0.05 ETH = `50000000000000000`; one claim is estimated at 0.002 ETH. Pairs with #30 |
| 35 | `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY` | Generate — `npx web-push generate-vapid-keys` | **[1]** `wrangler.jsonc` `vars`, once a pair is generated | `hooks/useNotifications.ts` (browser), `app/api/webpush/route.ts` | Phase 5, optional | The browser subscribes with this key and the server signs with #36; **the two must be halves of one pair, or every delivery fails silently.** Perimeter `P-7` was exactly that mismatch, under two different variable names — the browser read `NEXT_PUBLIC_VAPID_PUBLIC_KEY` while the route read `WEB_PUSH_VAPID_PUBLIC_KEY`. One name now, and it is `NEXT_PUBLIC_`-prefixed because the public key is public by construction |
| 36 | `WEB_PUSH_VAPID_PRIVATE_KEY` | Generate — the other half of #35 | **[3]** Worker secret | `app/api/webpush/route.ts` | Phase 5, optional | Server-side only. Never `NEXT_PUBLIC_`. Cloudflare secret, not a file |
| 37 | `WEB_PUSH_SUBJECT` | Fixed — a `mailto:` or `https:` URL you own | **[3]** Worker secret | `app/api/webpush/route.ts` | Phase 5, optional | The VAPID `sub` claim: who a push service should contact about this sender. e.g. `mailto:security@bank-rock.com`. All three of #35–#37 unset ⇒ push is `UNAVAILABLE`, which is the correct state; a partial set is the failure mode worth avoiding (spec 14) |

### 2.2a Cross-check against `web/.env.example`

The table above covers exactly the variables in [`../web/.env.example`](../web/.env.example), which
since D-034 is **grouped by home** rather than by subject, so that the file answers "where does this
live in production?" at a glance:

- **[1] in git, `wrangler.jsonc` `vars`:** `NEXT_PUBLIC_APP_URL` (#2), `NEXT_PUBLIC_CHAIN_ID` (#3),
  `NEXT_PUBLIC_DEMO_MODE` (#27), `NEXT_PUBLIC_AQUA_ADDRESS` (#13), `NEXT_PUBLIC_USDC_ADDRESS` and
  `NEXT_PUBLIC_WETH_ADDRESS` (#14), `NEXT_PUBLIC_REGISTRY_ADDRESS` (#11),
  `REGISTRY_DEPLOY_BLOCK` (#28), `NEXT_PUBLIC_AQUA_APP_ADDRESS` and
  `NEXT_PUBLIC_AQUA_TAKER_ADDRESS` (#12), `AQUA_APP_DEPLOY_BLOCK` (#29),
  `RELAYER_DAILY_CAP_WEI` (#34).
- **[2] GitHub Actions inputs:** `NEXT_PUBLIC_PRIVY_APP_ID` (#1),
  `NEXT_PUBLIC_PIMLICO_API_KEY` (#15).
- **[3] Worker secrets:** `SEPOLIA_RPC_URL` (#4), `ADMIN_PASSWORD` (#5), `ADMIN_JWT_SECRET` (#6),
  `ADMIN_API_KEY` (#21), `CRON_SECRET` (#7), `PIMLICO_API_KEY` (#15), `FAUCET_PRIVATE_KEY` (#16),
  `ATTESTATION_SIGNER_PRIVATE_KEY` (#17), `RELAYER_PRIVATE_KEY` (#30), `NXP_MASTER_KEY` (#18),
  `NXP_KEY_DIVERSIFY` (#31), `NXP_KEY_DIVERSIFY_APP_ID` (#32), `RESEND_API_KEY` (#19),
  `ALERT_FROM_ADDRESS` (#33), `ALERT_EMAIL_ADDRESS` (#20), `ALCHEMY_WEBHOOK_SECRET` (#22),
  `WEB_PUSH_VAPID_PRIVATE_KEY` (#36), `WEB_PUSH_SUBJECT` (#37) — plus
  `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY` (#35), which moves to **[1]** if push is ever enabled,
  because a `NEXT_PUBLIC_` value set on the Worker never reaches the browser bundle.
- **Tooling only, no home in the running app:** `CLOUDFLARE_ACCOUNT_ID`,
  `CLOUDFLARE_DATABASE_ID`, `CLOUDFLARE_D1_TOKEN` (#8, #9).

**Nothing was removed in this pass.** Every variable the table names is still read by the code as
spelled — re-checked 2026-09-12 against `web/src/`, `mcp/` and `web/drizzle.config.ts`. The
removals are the historical ones listed below, and they have not come back.

**Not in that file, and deliberately:**

| Variable | Where it lives instead |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | GitHub Actions secret for `deploy.yml` (#8) |
| `DEPLOYER_PRIVATE_KEY`, `ATTESTATION_SIGNER_ADDRESS`, `DEPLOY_CONFIRMATIONS` | The operator's shell when running the `contracts/scripts/*` deploys (#10, #17) |
| `BANKROCK_API_URL` | The agent's MCP `env` block (#23) |

**Removed, and must not come back:** `NEXT_PUBLIC_SWAPVM_ROUTER_ADDRESS` (no router is deployed —
D-030), `SIGNER_PRIVATE_KEY` (renamed to `ATTESTATION_SIGNER_PRIVATE_KEY`), `1INCH_API_KEY`,
`NTAG_MASTER_KEY`, `BASE_SEPOLIA_RPC_URL`, `RPC_URL`, `PRIVATE_KEY`, `REGISTRY_ADDRESS`,
`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.

### 2.3 What only you can do

**The whole of it, since D-034:** set the secrets on the Worker (§2.3.2), set the four GitHub
inputs (§2.3.1), and do the vendor-dashboard and DNS actions that are not variables at all
(§2.3.3). Every other value — the origin, the chain id, the demo flag, the addresses, the deploy
blocks, the relayer cap — is in `web/wrangler.jsonc` and needs no operator action: it ships with
the commit. **Nothing is typed into the Cloudflare dashboard's *Variables* pane any more**, and a
value typed there survives only until the next deploy (§2.3.2).

#### 2.3.1 The four GitHub inputs (Fact — two credentials and two identifiers)

`.github/workflows/deploy.yml` reads two credentials, and fails early and by name if either is
missing. They are **repository secrets** because they authenticate the upload rather than the
running app:

| Secret | What it is | Scopes the token needs |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | A Cloudflare API token, created in the Cloudflare dashboard under My Profile → API Tokens | **Account → Workers Scripts: Edit** (publish the Worker), **Account → D1: Edit** (the migration step and the `DB` binding), **Zone (`bank-rock.com`) → Workers Routes: Edit** and **Zone → DNS: Edit** (the two custom domains in `wrangler.jsonc`) |
| `CLOUDFLARE_ACCOUNT_ID` | The account id shown in the Cloudflare dashboard sidebar. Not a secret in the cryptographic sense; it is stored alongside the token so the workflow needs no dashboard lookup | — |

It also reads the two **account-specific public identifiers** — home **[2]**. They are public, but
they identify *your* vendor accounts rather than this application, so they are not committed:

| Input | Kind | Why it is here and not in `wrangler.jsonc` |
| --- | --- | --- |
| `NEXT_PUBLIC_PRIVY_APP_ID` (#1) | Repository **variable** (`${{ vars.… }}`) — Settings → Secrets and variables → Actions → **Variables** | The Privy app id of your Privy account. Visible in the browser bundle either way; a variable, not a secret, so its value is readable in the Actions UI, which is the honest description of what it is |
| `NEXT_PUBLIC_PIMLICO_API_KEY` (#15) | Repository **secret** (`${{ secrets.… }}`) | Browser-visible by construction, and restricted by origin in the Pimlico dashboard — but it is still a key, and a key does not go in git |

Both are inlined into the build by Next, so a change to either needs a **re-deploy**, not just a
Worker restart. Set the secrets here:

```
https://github.com/lucaguglielmi/bankrock-ethglobal/settings/secrets/actions
```

and the variable on the *Variables* tab of the same page.

The two **Zone** scopes are the ones easiest to leave off, and their absence does not stop the
Worker from publishing — it stops the custom domains from being attached, which looks like a green
deploy that changed nothing. The workflow's guard step catches only *unset*, not *under-scoped*: an
under-scoped token fails later, inside `wrangler`. After setting them, re-run the deploy from the
Actions tab (`workflow_dispatch`) rather than pushing an empty commit, and then check that
`NEXT_PUBLIC_APP_VERSION` on the live apex actually changed (spec 12, *Deploy pipeline history*).

*Note: if the Pages project `bankrock-ethglobal` is still used as a manual preview surface
(`npm run deploy:pages`), that path additionally needs **Cloudflare Pages: Edit**. Production does
not.*

#### 2.3.2 The Cloudflare Worker `web`

**Production is a Worker, not a Pages project** (spec 12 §1). Dashboard path: Workers & Pages →
`web` → Settings. The Pages project `bankrock-ethglobal` exists and can be published to by hand,
but **no domain points at it**, so a variable set there has no effect on production.

**The Worker holds the secrets, and nothing else you have to type.** Since D-034 the non-secret
configuration is in `web/wrangler.jsonc` `vars` and arrives with the deploy — so the only work here
is the **Secret** list below.

> **A plain-text variable typed in the dashboard does not survive a deploy.** `wrangler deploy`
> deletes every plain-text variable on the Worker and re-sets exactly the `vars` block from the
> configuration file; `keep_vars` is not set and must not be. Cloudflare's own wording: *"When not
> used (or set to false), Wrangler will delete all vars before setting those found in the Wrangler
> configuration"*, and *"Secrets are never deleted by a deployment whether this flag is true or
> false"* ([Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/),
> [Configuration → source of truth](https://developers.cloudflare.com/workers/wrangler/configuration/)).
> That asymmetry is the whole mechanism: committed configuration is authoritative and cannot drift,
> secrets are untouched and never pass through git or a workflow log. It is also why a value that
> is merely *account-specific* rather than confidential — `ALERT_FROM_ADDRESS`,
> `ALERT_EMAIL_ADDRESS`, `WEB_PUSH_SUBJECT`, `NXP_KEY_DIVERSIFY*` — is set as a **Secret**: a
> Text variable there would be deleted by the next deploy and the capability would silently go
> `UNAVAILABLE`.

| What | Value |
| --- | --- |
| **D1 binding** | Binding name **`DB`**, database `bankrock-db`, id `f0a28d6f-0a36-46aa-b711-8b5297913d2e`, `migrations_dir: drizzle`. Declared in `web/wrangler.jsonc` and bound on the project. The Worker uses the binding; it never reads `CLOUDFLARE_DATABASE_ID` or `CLOUDFLARE_D1_TOKEN`, which are migration tooling only (#9). Unbound ⇒ counters, rate limits and the relayer spend ledger are all `UNAVAILABLE`, and the relayer therefore refuses to spend |
| **Secrets — the operator's list** | `SEPOLIA_RPC_URL`, `PIMLICO_API_KEY`, `ADMIN_PASSWORD`, `ADMIN_JWT_SECRET`, `ADMIN_API_KEY`, `CRON_SECRET`, `FAUCET_PRIVATE_KEY`, `ATTESTATION_SIGNER_PRIVATE_KEY`, `RELAYER_PRIVATE_KEY`, `NXP_MASTER_KEY`, `RESEND_API_KEY`, `ALERT_FROM_ADDRESS`, `ALERT_EMAIL_ADDRESS`, `ALCHEMY_WEBHOOK_SECRET`, and the two web-push server values `WEB_PUSH_VAPID_PRIVATE_KEY` and `WEB_PUSH_SUBJECT` — all as **Secret**, never Text, never in a file. `wrangler secret put NAME` from `web/` does the same thing as the dashboard. Each unset one makes exactly one capability `UNAVAILABLE` (§2.2, and DEMO-STATE §4) |
| **Non-secret configuration** | Not set here. It is `web/wrangler.jsonc` `vars` (#2, #3, #11–#14, #27–#29, #34), replaced on every deploy from the file |
| **Custom domains** | `bank-rock.com` and `www.bank-rock.com`, declared in `wrangler.jsonc` `routes` with `custom_domain: true`. Attaching them is what the token's two Zone scopes are for |
| **`NEXT_PUBLIC_DEMO_MODE`** | `false`, in `wrangler.jsonc`. The deploy job pins the same value in the job environment *and* refuses to build if the file says anything else, so a simulated production build needs two deliberate changes and a passing CI lie (D-013) |
| **`RELAYER_DAILY_CAP_WEI`** | `50000000000000000` (0.05 ETH/UTC day, about 25 relayed claims at the 0.002 ETH reservation; 0.02 left only ten, which a rehearsal morning can spend), in `wrangler.jsonc`. Must be non-zero for gift claims to work at all (#34); unset is the closed branch. The key it caps, `RELAYER_PRIVATE_KEY`, is a Secret — configuration and credential deliberately split |
| **Migrations** | Applied **by the deploy job**, before the Worker is published (`wrangler d1 migrations apply bankrock-db --remote`). The same command is `npm run db:migrate:prod` by hand. Consequence, stated because it is a change: **a destructive migration must not be merged to `main`** — merging it applies it (spec 12, Database) |

#### 2.3.3 Dashboard and DNS actions

These are dashboard or DNS actions, not env vars:

1. **Privy dashboard** — create the app; add `https://bank-rock.com` (and the `pages.dev` preview
   origin if you use it) to allowed origins; enable email, Google, Apple, wallet; enable Sepolia.
   The app id itself goes in the GitHub repository *variable* (§2.3.1), not the dashboard.
2. **Pimlico dashboard** — create the API key; create a sponsorship policy for chain 11155111;
   restrict the public key by origin.
3. **Cloudflare dashboard** — remove or fix the `www` redirect rule with the unsubstituted
   `:path*` (R-1); the app now ships the redirect itself in `web/next.config.ts`, but a dashboard
   rule is evaluated first, so the broken one must go. Create the API token (§2.3.1) and set the
   Worker's secrets (§2.3.2). **Do not add anything to the Worker's *Variables* pane** — a deploy
   deletes it.
4. **Resend** — add `bank-rock.com`; publish the SPF, DKIM and MX records it gives you; wait for
   verification.
5. **Alchemy or Infura** — create a Sepolia app for `SEPOLIA_RPC_URL`.
6. **Fund the wallets** (Part 3).
7. **NFC provisioning** — generate `NXP_MASTER_KEY` and write it to the tags with the NXP TagWriter
   or equivalent, with SDM enabled, `/r/{id}` as the URL, and PICC data + CMAC mirroring on.

---

## Part 3 — Funding budget (Sepolia)

| Wallet | Role | Initial balance | Why |
| --- | --- | --- | --- |
| Deployer (#10) | Deploys the registry (and becomes its admin), then XYCSwap + XYCSwapTaker | 0.3 ETH | Three deploys; headroom for redeploys. Neither Aqua-path contract has an owner, so this key keeps no privilege over them. |
| Faucet (#16) | Sends 0.01 ETH per awakening | 1.0 ETH | 100 awakenings. Refill before the demo. |
| Attester (#17) | Signs attestations off-chain | 0 | Never transacts. |
| Relayer (#30) | Sends `claimHandover` for gift recipients (D-027) | 0.2 ETH | One transaction per claim, plus the pre-signed Safe owner swap it submits through the bundler. Unset or empty ⇒ claims are UNAVAILABLE, never free. |
| Pimlico | Sponsors every UserOp | — | Free on testnets; no balance to hold. |
| Each Rock Account | Aqua reserve | 20 USDC + 0.01 WETH | USDC from `faucet.circle.com` (20 / 2 h / address — claim to the Rock Account address directly). WETH by wrapping ETH at `0xfFf9…6B14`. |
| Demo taker wallet | Swaps against the rock | 20 USDC + 0.005 WETH | Same sources. |

Sepolia ETH sources: Google Cloud Web3 faucet, Alchemy faucet, ETHGlobal faucet. Most gate on a
mainnet balance or a login; start collecting now, not the night before.

---

## Part 4 — Order of operations

The minimum set to see a **real** rock page with **real** data, in the order the dependencies
allow:

1. Phase 0 of spec 15 (build green). No secrets needed beyond #1, #2, #5, #6, #8.
2. Set #4 (`SEPOLIA_RPC_URL`). *(The Sepolia switch itself — imports, chain list, Pimlico URL,
   explorer links, hardhat network — is done in code.)*
3. Generate and fund #10 (deployer) and #16 (faucet); generate #17 (attester, unfunded) and #30
   (relayer, funded). Deploy the registry with
   `SEPOLIA_RPC_URL=… DEPLOYER_PRIVATE_KEY=… ATTESTATION_SIGNER_ADDRESS=… npm run deploy` in
   `contracts/`, which prints #11 (`NEXT_PUBLIC_REGISTRY_ADDRESS`) and #28
   (`REGISTRY_DEPLOY_BLOCK`), and sets the attester in the constructor. Verify the source.
4. Set #15 and create the Pimlico sponsorship policy for chain 11155111. Awaken a rock: real
   Safe, real transaction, zero gas for the user.
5. **Deploy XYCSwap + XYCSwapTaker** — `NEXT_PUBLIC_AQUA_ADDRESS=… DEPLOYER_PRIVATE_KEY=…
   node scripts/deploy-aqua-app.js` in `contracts/` — which prints #12
   (`NEXT_PUBLIC_AQUA_APP_ADDRESS`, `NEXT_PUBLIC_AQUA_TAKER_ADDRESS`) and #29
   (`AQUA_APP_DEPLOY_BLOCK`). Aqua itself is never deployed: it is an input read from the
   environment. Ship the first strategy.
6. Set #18 (`NXP_MASTER_KEY`) and program the tag with it (spec 18 §4.2). Everything else.

---

## Part 5 — Corrections to spec 15

Two facts recorded in [`15-exit-demo-mode.md`](./15-exit-demo-mode.md) were wrong and are
corrected there:

- **B-8** claimed `typescript: ^7.0.2` and `cors: ^2.8.6` "do not exist". They do; `mcp/` installs
  and builds cleanly (`npm ci`, `npm run build` both exit 0). Withdrawn.
- **F-4** claimed `nodejs_compat` was missing. With `compatibility_date: "2026-09-11"` it is on by
  default. The NFC verifier's `node:crypto` usage is fine as-is. Withdrawn.

Also verified while checking: `contracts/` installs and its 6 Solidity tests pass under Hardhat 3;
`web3-functions/` installs and typechecks. Removing `@cloudflare/next-on-pages` and adding `sonner`
makes strict `npm ci` peer resolution succeed with no further conflicts.
