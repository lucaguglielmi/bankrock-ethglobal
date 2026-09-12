# Decision log and open questions

## Confirmed decisions

### D-001 — New repository is independent

**Decision:** bankrock-ethglobal is the only source of truth for this project.

**Consequence:** no code, specifications or assumptions should be imported from the old Bank Rock project unless explicitly reviewed and approved later.

### D-002 — NFC is not authorization

**Decision:** scanning or cloning the NFC URL cannot grant control of funds.

**Consequence:** every sensitive action requires Privy authentication and onchain authorization.

### D-003 — Web first

**Decision:** the hackathon product is a mobile-first web application opened through an NFC HTTPS link.

**Consequence:** active Web NFC APIs and native apps are not MVP dependencies.

### D-004 — No guaranteed-yield claim

**Decision:** the MVP describes trading fees, not guaranteed passive yield.

**Consequence:** APY projections and savings-account language are excluded.

## Proposed decisions requiring proof

### D-005 — One persistent smart account per rock

**Decision:** each physical rock maps to an ERC-4337 smart account controlled by the owner's Privy wallet.

**Consequence:** stable address, isolated funds and seamless ownership transfer without moving assets.

### D-006 — SwapVM for MVP

**Decision:** the MVP will use an existing SwapVM program rather than a Custom Aqua App.

**Consequence:** faster development and less contract security risk during the hackathon. Custom apps are deferred.

### D-007 — Cryptographic NFC Tags (NTAG 424 DNA)

**Decision:** The project assumes the use of NTAG 424 DNA tags instead of standard NTAG213 tags.

**Consequence:** The tag generates a unique, cryptographically signed URL on every tap. This mathematically proves physical presence, completely preventing URL cloning and removing the need for a separate, clumsy PIN code for activation.

### D-008 — MCP AI Integration (Read-Only MVP)

**Decision:** The Bank Rock backend will include an MCP (Model Context Protocol) Server.

**Consequence:** Allows external AI agents (like Claude or Gemini) to connect to the rock, read its live onchain data (liquidity, fees, strategy), and provide conversational advice to the owner. The MVP scope is read-only for security.

### D-009 — Zero-Gas UX via Paymasters

**Decision:** The entire lifecycle (especially gifting) will use ERC-4337 Paymasters to sponsor 100% of the gas fees for the user.

**Consequence:** Recipients claiming a Bank Rock do not need to onboard with native tokens, dramatically improving the consumer experience.

### D-010 — Scoped Session Keys for Agentic Rebalancing

**Decision:** Support an ERC-7579 / ERC-4337 Scoped Session Key Module allowing the owner to delegate bounded execution rights to the MCP AI runtime.

**Consequence:** Enables AI agents to autonomously ship/dock Aqua strategies within tight smart contract constraints (pair restrictions, max 2% slippage, strict zero withdrawal authority to external wallets, automatic 24-hour expiry).

### D-011 — Self-Sustaining Rock via ERC-20 Token Paymaster

**Decision:** Support an ERC-20 Token Paymaster mode once the rock has accumulated trading fees from Aqua visitor swaps.

**Consequence:** Allows the rock to pay its own operational UserOperation gas fees using its earned USDC, reducing reliance on the developer's Verifying Paymaster balance and establishing the rock as an independent, self-sustaining economic object.

### D-012 — Atomic UserOp Batching for 1-Click Strategy Launch

**Decision:** Use ERC-4337 `executeBatch` to bundle token approvals (`approve`) and strategy launch (`Aqua.ship`) into a single atomic UserOperation.

**Consequence:** Eliminates the multi-step approval fatigue typical of DeFi, allowing new users to awaken and fund an Aqua liquidity stream with a single signature.

## Exit-from-demo-mode decisions

Full context, evidence and acceptance criteria for D-013 through D-022 are in
[`15-exit-demo-mode.md`](./15-exit-demo-mode.md).

### D-013 — Demo mode is explicit, labelled and opt-in

**Decision:** simulation is gated behind `NEXT_PUBLIC_DEMO_MODE`, defaulting to `false`. Every
capability resolves to `REAL`, `DEMO` or `UNAVAILABLE` at runtime.

**Consequence:** a capability that cannot reach its real backing service renders an honest empty
state instead of substituting plausible data. Simulated surfaces carry a persistent `SIMULATED`
badge. The current architecture fails open into fiction; this reverses that.

### D-014 — No synthesized transaction identifiers

**Decision:** no code path may generate a hash-shaped string. A transaction hash may only originate
from a signed, broadcast transaction.

**Consequence:** fabricated BaseScan links are deleted rather than relabelled. Where no hash exists,
no hash and no explorer link are shown.

### D-015 — One source of truth for every address

**Decision:** contract addresses and chain IDs live in a single module populated from environment
variables and validated at startup. No address literal in components, hooks, routes, MCP tools or
keeper functions.

**Consequence:** startup fails loudly if a required address is unset or has no code on the target
chain.

### D-016 — One Cloudflare adapter

**Decision:** `@opennextjs/cloudflare` is the deployment adapter; `@cloudflare/next-on-pages` is
removed entirely. Context comes from `getCloudflareContext()`.

**Consequence:** D1 becomes reachable, the two 500-ing API routes recover, and the `npm ci` peer
conflict clears.

### D-017 — Fail closed

**Decision:** the pattern `if (SECRET && mismatch) reject` is prohibited. A missing secret is a
startup failure, not an authentication bypass.

### D-018 — NFC attestation is server-side, single-implementation, and bound on-chain

**Decision:** one verifier performing real NTAG 424 DNA SDM verification — correct PICC offsets,
NXP session key derivation, CMAC, and a strictly monotonic counter in durable storage. The
`Verified Physical` badge is gated on a real CMAC match and nothing else.

**Consequence:** until that passes against a physical tag, the UI shows `unverified`. This restores
D-002, which the current stub verifier inverts.

### D-019 — MCP returns `unavailable`, never invents

**Decision:** every MCP tool either reads a real source or returns
`{ "status": "unavailable", "reason": "..." }`. No tool may return a literal balance, APR, volume
or execution status.

**Consequence:** an agent relaying tool output to a human never relays a fabrication. A stable
fabrication is more dangerous than an obvious one.

### D-020 — The registry loses the arbitrary-call primitive

**Decision:** `executeTrade` in its current form and the unguarded `setRouterWhitelist` are removed.
The registry is an identity and lifecycle registry only: it never holds funds, never receives
approvals, and never performs `call` with caller-supplied calldata.

**Consequence:** swaps execute from the Rock Account against Aqua, where spec 03 always placed them.

### D-021 — Deployment target is Cloudflare, not Vercel

**Decision:** [`12-deployment.md`](./12-deployment.md) is corrected to describe Cloudflare Pages +
OpenNext + D1.

### D-022 — The canonical origin is `bank-rock.com`

**Decision:** one `NEXT_PUBLIC_APP_URL`. No `bankrock.xyz` or `pages.dev` literal remains. The NFC
tag path is `/r/{publicRockId}` as specified in spec 06.

**Consequence:** no physical tag may be encoded until `/r/` returns 200 and the `www` redirect is
fixed.

### D-023 — Target network is Ethereum Sepolia

**Decision:** the MVP runs on Ethereum Sepolia (chain ID 11155111). Base Sepolia is abandoned.

**Consequence:** Aqua is present at its canonical address (`0x1111113ccf1426a8e30e2bff5e005d929bf6a90a`,
bytecode identical to mainnet), Circle USDC (`0x1c7D…7238`), WETH (`0xfFf9…6B14`), the full Safe
1.4.1 + EntryPoint 0.7 stack, Pimlico and Privy are all available. The SwapVM router is **not**
deployed there and is self-deployed by us from `github.com/1inch/swap-vm` at a non-canonical
address. Every `baseSepolia` import, explorer link, RPC URL, Pimlico endpoint and token address
changes. Full dependency verification is in [`16-environment-and-secrets.md`](./16-environment-and-secrets.md).

**Rejected alternatives:** Base mainnet with dust (would override spec 08's "no mainnet funds");
self-deploying both Aqua and SwapVM on Base Sepolia (two protocol deployments to own, and a
weaker "real Aqua" story).

## Open product questions

1. **Is the hackathon's main story gifting, a public micro-exchange, or both?** Gifting is the core product journey; public tap-to-trade is the primary demonstration of the liquidity.
2. **Should a dormant gift earn fees before the recipient claims it?** Yes, the rock is active and controlled by the giver until the handover is complete.
3. **Which two testnet tokens and which supported network provide the most reliable Aqua demo?** Resolved by D-023: Ethereum Sepolia, Circle USDC and WETH.
4. **Should anyone be allowed to trade with a rock, or only invited visitors?** Anyone who scans the rock can trade with it to maximize demo interactivity.
5. **Are rock names globally unique, edition-local or cosmetic?** Cosmetic. The public rock ID is the only globally unique identifier.
6. **What information remains after an owner requests privacy?** The public rock ID, active strategies, and total balances (as they are onchain). Only presentation metadata (name, photo) is hidden.
7. **What fee, if any, does Bank Rock itself charge?** Zero for the MVP.
8. **Is the initial custom strategy AMM-like, fixed-price or time-limited?** Constant-product (AMM-like).
9. **Does ownership transfer preserve the maker address in the selected account architecture?** Yes, the ERC-4337 smart account architecture explicitly guarantees this.
10. **Which sponsor-specific requirements must be reflected in the final demo?** The demo must clearly highlight Privy onboarding and 1inch/Aqua liquidity provision.
11. **Which network actually hosts a usable Aqua deployment, and at what address?** Verified 2026-09-12 — see [`15-exit-demo-mode.md`](./15-exit-demo-mode.md) §1.3 C-4. Canonical deterministic addresses from the official READMEs are Aqua `0x1111113ccf1426a8e30e2bff5e005d929bf6a90a` and SwapVM router `0x111111338c5091e8440b67b168bae16a668ac0de`. **Neither exists on Base Sepolia**, nor on Arbitrum, OP or Unichain Sepolia. Both exist on Base mainnet. Aqua alone exists on Ethereum Sepolia; the SwapVM router does not, but the swap-vm repo ships Sepolia ignition parameters for self-deploying it. **Resolved by D-023:** Ethereum Sepolia, self-deploying only `SwapVMRouter` against the existing Aqua.

## Implementation spikes

Complete before broad frontend work:

1. Confirm chosen Aqua deployment and test-token availability.
2. Prove Aqua maker operations from a candidate Rock Account.
3. Execute a swap and reconcile actual versus virtual balances.
4. Change Rock Account controller between two Privy wallets.
5. Test the NFC URL on iPhone and Android.
6. Demonstrate that a copied URL has public access only.
