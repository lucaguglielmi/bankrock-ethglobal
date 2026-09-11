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

### P-001 — One persistent smart account per rock

**Proposal:** each physical rock maps to a smart account controlled by the owner's Privy wallet.

**Why:** stable address, isolated funds and transferable control.

**Proof required:** demonstrate ERC-20 approvals, Aqua ship/dock calls, swap settlement and safe controller transfer from the chosen account implementation.

### P-002 — Custom Bank Rock Aqua App

**Proposal:** create a minimal Aqua App whose immutable strategy includes the rock identity.

**Why:** stronger protocol integration and precise rock-level attribution.

**Proof required:** working swap, callback safety, reentrancy protection and tests. Start with SwapVM if it reduces early integration risk.

### P-003 — Separate one-time activation code

**Proposal:** pair ordinary NFC tags with a single-use secret supplied outside the tag.

**Why:** prevents first-scanner theft of dormant funded rocks.

**Proof required:** threat-model review and recovery flow.

## Open product questions

1. Is the hackathon's main story gifting, a public micro-exchange, or both? Current recommendation: gifting as the product, public tap-to-trade as the demonstration.
2. Should a dormant gift earn fees before the recipient claims it? Current preference: yes, controlled by the giver until handover.
3. Which two testnet tokens and which supported network provide the most reliable Aqua demo?
4. Should anyone be allowed to trade with a rock, or only invited visitors?
5. Are rock names globally unique, edition-local or cosmetic?
6. What information remains after an owner requests privacy?
7. What fee, if any, does Bank Rock itself charge?
8. Is the initial custom strategy AMM-like, fixed-price or time-limited?
9. Does ownership transfer preserve the maker address in the selected account architecture?
10. Which sponsor-specific requirements must be reflected in the final demo?

## Implementation spikes

Complete before broad frontend work:

1. Confirm chosen Aqua deployment and test-token availability.
2. Prove Aqua maker operations from a candidate Rock Account.
3. Execute a swap and reconcile actual versus virtual balances.
4. Change Rock Account controller between two Privy wallets.
5. Test the NFC URL on iPhone and Android.
6. Demonstrate that a copied URL has public access only.
