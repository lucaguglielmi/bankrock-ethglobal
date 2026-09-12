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

### 1.2 Not on Sepolia — must be deployed by us (Fact)

| Dependency | Canonical address elsewhere | Sepolia | Action |
| --- | --- | --- | --- |
| **SwapVM router** | `0x111111338c5091e8440b67b168bae16a668ac0de` (Base, Ethereum mainnet, 13 others) | **no code** | Self-deploy from `github.com/1inch/swap-vm`. Plain `m.contract("SwapVMRouter", [aqua, weth, owner, name, version])` via Hardhat Ignition — no CREATE2 factory, so our address will be non-canonical. Constructor: `aqua = 0x1111113ccf…6a90a`, `weth = 0xfFf9…6B14`, `owner = our deployer`. Solidity 0.8.30, `viaIR`. The repo's `hardhat.config.ts` configures only `localhost`; a `sepolia` network entry must be added. |
| **BankRockRegistry** | never deployed anywhere | no code | Rewrite per D-018/D-020, then deploy. `contracts/hardhat.config.js` needs a `sepolia` network (it has only `baseSepolia`). |

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
| **1inch Swap API** (`/api/quote`) | **No.** Supported chains are mainnets only: Ethereum, Base, BNB, zkSync, Gnosis, Optimism, Cronos, Polygon, Monad, Linea, Sonic, Unichain, Arbitrum, Avalanche, HyperEVM, Robinhood, Solana. No testnet appears in the list. | 1inch Business portal, Classic Swap introduction | `/api/quote` and `1INCH_API_KEY` are **deleted**. Quotes come from `SwapVMRouter.quote()` (a view) against the shipped strategy — which is also the only source that is guaranteed to match `swap()` output exactly. |
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
   *(Hypothesis: for SwapVM in Aqua mode, `strategy` is the ABI-encoded order and `strategyHash`
   equals `swapVM.hash(order)`. The tests delegate this to `AquaStrategyBuilders`, which was not
   retrievable; confirm by reading `test/solidity/helpers/` in the swap-vm repo before building.)*
5. **There is no JavaScript SDK.** `@1inch/swap-vm` is not published on npm; the repo's
   `package.json` has no `main` or `exports`. Programs are built in Solidity via `ProgramBuilder`.
   Strategy bytes must therefore be produced by a Foundry/Hardhat script and committed, or the
   encoding must be ported to TypeScript. This is the largest unknown in Phase 3.
6. Balances read for the UI come from `Aqua.safeBalances(rockAccount, app, strategyHash, USDC, WETH)`
   (virtual) and `ERC20.balanceOf(rockAccount)` (actual), which is exactly the pair spec 04 requires
   the UI to distinguish.

---

## Part 2 — Secrets and configuration inventory

Variable names are **as the code reads them today**; where the name should change, the target
name is given in the last column and the rename belongs to Phase 1 (D-015).

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

| # | Variable (today → target) | Provider | Where used | Needed from | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | `NEXT_PUBLIC_PRIVY_APP_ID` | You — dashboard.privy.io | `providers.tsx` | Phase 0 | Also configure in the dashboard: allowed origin `https://bank-rock.com`, login methods email / Google / Apple / wallet, and enable Sepolia. Without it the app boots with a placeholder app ID and `login()` silently activates a **fabricated embedded wallet** (`0x71C8…1b47`, `collector@bankrock.eth`) — spec 15 A-1/A-2. Phase 1 replaces that with an `UNAVAILABLE` sign-in state. |
| 2 | `NEXT_PUBLIC_APP_URL` | Fixed: `https://bank-rock.com` | CORS in `middleware.ts`; email CTAs; MCP base URL | Phase 0 | Replaces the `bankrock.xyz` / `pages.dev` literals (D-022). |
| 3 | `NEXT_PUBLIC_CHAIN_ID` → read by the chain config module | Fixed: `11155111` | D-015 chain module | Phase 1 | Currently unread. |
| 4 | `BASE_SEPOLIA_RPC_URL` + `RPC_URL` → `SEPOLIA_RPC_URL` | You — Alchemy or Infura Sepolia endpoint | `lib/aa.ts`, `lib/indexer.ts`, cron, faucet | Phase 1 | Public RPCs rate-limit and reject wide `eth_getLogs`; the indexer needs a real provider. |
| 5 | `ADMIN_PASSWORD` | Generate | `/api/admin/login` | Phase 0 | |
| 6 | `ADMIN_JWT_SECRET` | Generate, 32 bytes | `lib/auth.ts`, `middleware.ts` | Phase 0 | Must be set; the fallback string makes admin sessions forgeable (SA-8). |
| 7 | `CRON_SECRET` | Generate | `/api/cron/snapshot` | Phase 1 | Moves from query string to header in Phase 5. |
| 8 | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | You — Cloudflare dashboard, token with Pages + D1 edit | GitHub Actions secrets for `deploy.yml` | Phase 0 | `deploy.yml` must be rewritten first (B-5). |
| 9 | `CLOUDFLARE_DATABASE_ID`, `CLOUDFLARE_D1_TOKEN` | You — same token; ID is `f0a28d6f-0a36-46aa-b711-8b5297913d2e` | `drizzle.config.ts` (migrations / studio only) | Phase 1 | Not needed at runtime; the Worker uses the `DB` binding. |
| 10 | `PRIVATE_KEY` → `DEPLOYER_PRIVATE_KEY` | Wallet — fresh, funded | `contracts/hardhat.config.js`; SwapVM router deploy | Phase 2 | Deploys registry and SwapVM router; becomes `owner` of both. |
| 11 | `REGISTRY_ADDRESS` / `NEXT_PUBLIC_REGISTRY_ADDRESS` → `NEXT_PUBLIC_REGISTRY_ADDRESS` | Output of registry deploy | chain module, MCP | Phase 2 | Startup must assert code exists at it (D-015). |
| 12 | `NEXT_PUBLIC_SWAPVM_ROUTER_ADDRESS` (new) | Output of SwapVM router deploy | chain module | Phase 3 | Non-canonical; ours. |
| 13 | `NEXT_PUBLIC_AQUA_ADDRESS` (new) | Fixed: `0x1111113ccf1426a8e30e2bff5e005d929bf6a90a` | chain module | Phase 3 | |
| 14 | `NEXT_PUBLIC_USDC_ADDRESS`, `NEXT_PUBLIC_WETH_ADDRESS` (new) | Fixed: `0x1c7D…7238`, `0xfFf9…6B14` | chain module | Phase 2 | |
| 15 | `PIMLICO_API_KEY` and `NEXT_PUBLIC_PIMLICO_API_KEY` | You — dashboard.pimlico.io | `lib/aa.ts` | Phase 2 | Create a **sponsorship policy** for chain 11155111 in the dashboard or the verifying paymaster rejects every UserOp. Testnet sponsorship is free. The `NEXT_PUBLIC_` copy is exposed to browsers — restrict the key by origin in the dashboard. |
| 16 | `FAUCET_PRIVATE_KEY` | Wallet — fresh, funded | `/api/faucet` | Phase 2 | **Must be set.** The current default is the public Anvil key (SA-4). Sends 0.01 ETH per claim. |
| 17 | `SIGNER_PRIVATE_KEY` → `ATTESTATION_SIGNER_PRIVATE_KEY` | Wallet — fresh, **unfunded** | NFC EIP-712 attestations (D-018) | Phase 4 | Its address is set in the registry as the trusted attester. Never holds funds. |
| 18 | `NXP_MASTER_KEY` | Generate, 16 bytes hex, at tag provisioning | `/api/nfc/verify` | Phase 4 | Must equal the key written to the physical NTAG 424 DNA tags. Store in Cloudflare secrets only. |
| 19 | `RESEND_API_KEY` | You — resend.com | `lib/email-service.ts`, Gelato alert route | Phase 5 | **Plus** domain verification for `bank-rock.com` (add the SPF/DKIM records Resend shows) and change `from` to `alerts@bank-rock.com`. Without verification, mail reaches only your own inbox. |
| 20 | `ALERT_EMAIL_ADDRESS` | Fixed: an inbox you read | Gelato alert route | Phase 5 | Currently defaults to `security@bankrock.xyz`. |
| 21 | `ADMIN_API_KEY` | Generate | `/api/newsletter` operator view | Phase 5 | |
| 22 | `ALCHEMY_WEBHOOK_SECRET` | You — Alchemy Notify, only if used | `/api/webhooks/alchemy` | Optional | If unset the route must reject, not accept (D-017). |
| 23 | `BANKROCK_API_URL` | Fixed: `https://bank-rock.com` | `mcp/index.ts` | Phase 1 | |
| 24 | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Optional | `lib/counter-store.ts` | — | Superseded by D1 in Phase 4. Drop. |
| 25 | `1INCH_API_KEY` | — | `/api/quote` | — | **Delete.** The API does not serve Sepolia (§1.4). |
| 26 | `ALERT_API_URL`, `QUOTE_API_URL`, `ROCK_ID` (Gelato secrets) | — | `web3-functions/` | — | `DEMO`; not needed. |

### 2.3 What only you can do

These are dashboard or DNS actions, not env vars:

1. **Privy dashboard** — create the app; add `https://bank-rock.com` (and the `pages.dev` preview
   origin if you use it) to allowed origins; enable email, Google, Apple, wallet; enable Sepolia.
2. **Pimlico dashboard** — create the API key; create a sponsorship policy for chain 11155111;
   restrict the public key by origin.
3. **Cloudflare dashboard** — fix the `www` redirect rule (R-1); create the API token; set every
   secret above on the Pages project (Settings → Environment variables) rather than in a file.
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
| Deployer (#10) | Deploys registry + SwapVM router, whitelists attester | 0.3 ETH | Two contract deploys with `viaIR` bytecode ≈ 0.05–0.1 ETH at Sepolia gas; headroom for redeploys. |
| Faucet (#16) | Sends 0.01 ETH per awakening | 1.0 ETH | 100 awakenings. Refill before the demo. |
| Attester (#17) | Signs attestations off-chain | 0 | Never transacts. |
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
2. Set #4 (`SEPOLIA_RPC_URL`). Switch `viem/chains` from `baseSepolia` to `sepolia` in the 20
   files that import it; `providers.tsx` chain list; Pimlico URL; explorer links
   (`sepolia.basescan.org` → `sepolia.etherscan.io`); `hardhat.config.js` network.
3. Generate and fund #10 and #16. Deploy the rewritten registry → #11.
4. Set #15 and create the Pimlico policy. Awaken a rock: real Safe, real transaction.
5. Add a `sepolia` network to swap-vm's `hardhat.config.ts`; set its `chain-11155111.json`
   `aqua` parameter to the real address; deploy → #12. Ship the first strategy.
6. Everything else.

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
