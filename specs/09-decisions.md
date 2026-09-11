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

## Open product questions

1. **Is the hackathon's main story gifting, a public micro-exchange, or both?** Gifting is the core product journey; public tap-to-trade is the primary demonstration of the liquidity.
2. **Should a dormant gift earn fees before the recipient claims it?** Yes, the rock is active and controlled by the giver until the handover is complete.
3. **Which two testnet tokens and which supported network provide the most reliable Aqua demo?** Base Sepolia or Arbitrum Sepolia, using test USDC and test WETH.
4. **Should anyone be allowed to trade with a rock, or only invited visitors?** Anyone who scans the rock can trade with it to maximize demo interactivity.
5. **Are rock names globally unique, edition-local or cosmetic?** Cosmetic. The public rock ID is the only globally unique identifier.
6. **What information remains after an owner requests privacy?** The public rock ID, active strategies, and total balances (as they are onchain). Only presentation metadata (name, photo) is hidden.
7. **What fee, if any, does Bank Rock itself charge?** Zero for the MVP.
8. **Is the initial custom strategy AMM-like, fixed-price or time-limited?** Constant-product (AMM-like).
9. **Does ownership transfer preserve the maker address in the selected account architecture?** Yes, the ERC-4337 smart account architecture explicitly guarantees this.
10. **Which sponsor-specific requirements must be reflected in the final demo?** The demo must clearly highlight Privy onboarding and 1inch/Aqua liquidity provision.

## Implementation spikes

Complete before broad frontend work:

1. Confirm chosen Aqua deployment and test-token availability.
2. Prove Aqua maker operations from a candidate Rock Account.
3. Execute a swap and reconcile actual versus virtual balances.
4. Change Rock Account controller between two Privy wallets.
5. Test the NFC URL on iPhone and Android.
6. Demonstrate that a copied URL has public access only.
