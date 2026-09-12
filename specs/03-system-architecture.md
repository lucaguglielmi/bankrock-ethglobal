# System architecture

## Proposed components

### Mobile web application

A responsive web application opened by an NFC HTTPS link. It handles public rock pages, Privy authentication, transaction preparation and owner controls.

A native application is not required for the hackathon.

### Privy identity and signer

Privy supplies user authentication, embedded wallet creation, recovery and transaction signing. The Privy wallet acts as the human owner's signer or controller.

### Bank Rock MCP Server & Connectors

An AI-facing Model Context Protocol (MCP) server that exposes the rock's state to external AI agents (like Claude or Gemini). 
It allows agents to read liquidity, strategies, and historical fees, and return tailored insights. 
*(Future scope: exposing read-write tools to prepare transactions for owner signing).*

**See also:** [`11-mcp-and-connectors.md`](11-mcp-and-connectors.md) for a comprehensive list of all MCP servers (Web3, Privy, Database, Telemetry) powering the system.

### Rock Registry

A contract or minimally trusted registry binds:

- public rock ID;
- Rock Account address;
- metadata reference;
- lifecycle state;
- current ownership or controller;
- replacement-tag state.

Only immutable or ownership-critical facts belong onchain. Rich presentation metadata may be stored offchain.

### Rock Account

**Decision: Smart Account Architecture (ERC-4337)**

Each physical rock maps to a persistent smart account (e.g., Safe configured via permissionless.js or Alto). This ensures the Rock Account address and its assets remain stable, even when the controller changes.

**Narrowed by D-029 — the salt rule, stated exactly.** A Rock Account is a Safe 1.4.1 on
EntryPoint 0.7 whose single owner is the user's Privy embedded wallet, with

```
saltNonce = uint256(uidHash) = uint256(keccak256(rawUid7Bytes))
```

so the mapping is **(tag, owner) → account**, not rock id → account. Consequences, all load-bearing:

- two rocks held by the same person have two accounts, and their reserves never pool;
- the same tag under two different owners yields two different addresses — the account is per
  owner, and the giver's account is not silently the recipient's;
- the address follows the **tag**, not the rock id, so after an archive (D-028) the tag awakens a
  *different* rock id into the *same* account for the same owner. That is what makes the
  rehearse-and-restart loop work without stranding a balance;
- the rock id is deliberately **not** in the salt: at the moment of the tap the id is not yet
  settled, and the attestation has to name the account.

The address is **counterfactual** — a CREATE2 prediction from (owner, salt) — so it exists and can
be quoted before anything is deployed. It is derived **server-side by the NFC verifier** and
signed into the attestation; a `smartAccount` supplied by a client is ignored, not honoured
(D-026). The first sponsored UserOperation deploys the Safe as a side effect of doing the work.

**A visitor is not a rock.** Someone who only trades against a rock transacts from a *personal*
Safe with `saltNonce = 0`, owned by their own Privy wallet and tied to no tag: one account no
matter how many rocks they trade with. It exists so the swap can be a sponsored
`approve` + `swapExactIn` batch and so the taker periphery has a contract to call back into
(D-030) — not because it belongs to any rock. This is spec 05's "separate visitor/taker wallets
from Rock Accounts", made concrete.

The Rock Account:

- holds the rock's ERC-20 balances;
- approves Aqua and calls Aqua `ship` and `dock` operations;
- executes operations via **Atomic UserOperation Batching (`executeBatch`)**, bundling ERC-20 approvals and strategy launch into a single user signature;
- supports a **Dual-Mode Paymaster Model**:
  - *Verifying Paymaster:* sponsors 100% of gas fees for onboarding, awakening, and gift claims for zero-balance users.
  - *ERC-20 Token Paymaster ("Self-Sustaining Rock"):* allows operational gas fees to be paid directly from accrued trading fees (e.g., in test USDC) once liquidity begins trading;
- supports an **ERC-7579 / ERC-4337 Scoped Session Key Module** for the MCP AI runtime, permitting automated rebalancing while strictly prohibiting unauthorized withdrawals or external contract interactions;
- is controlled by the current owner's Privy embedded wallet;
- transfers control to a new Privy wallet during gifting by replacing the signing key (owner) on the smart account, preserving the Rock Account address and assets;
- restricts arbitrary execution where practical.

### Aqua and Bank Rock strategy

Aqua records the virtual balances for each maker, application and strategy hash. A Bank Rock strategy includes the public rock ID or an immutable derivative as its salt, allowing activity to be attributed to the physical object.

### Indexer and application database

The backend indexes contract events and maintains presentation data such as names, photos, gift messages, and the one-time activation codes.

**Stack:**
- **Database:** Cloudflare D1 (Serverless SQLite), accessed via Next.js Server Actions or Cloudflare Workers.
- **Indexer:** A lightweight indexer like Ponder to listen for onchain events and synchronize them with the database, or simple RPC polling via viem for MVP scope.

It is not authoritative for:

- token ownership;
- Rock Account control;
- Aqua balances;
- completed trades.

### Telemetry & Observability

A dedicated logging and monitoring layer ensuring the system is self-aware and debuggable.

- **Structured Logging:** All server actions emit structured JSON logs.
- **AI Agent Integration:** The Bank Rock MCP Server exposes a specific tool to query these logs and server metrics in real-time. This allows an AI agent to proactively read the server state, fix errors, and debug issues without manual human intervention.

### Cross-Chain Intent Protocol

A bridge layer (e.g., Across, LayerZero, CCIP) abstracts the underlying network of the Rock Account. This allows users to fund rocks or buy tokens using liquidity from any supported chain (e.g., Base, Optimism, Arbitrum) seamlessly, without needing to bridge funds manually first.

## Trust boundaries

| Boundary | Trusted for | Not trusted for |
| --- | --- | --- |
| NFC tag | Opening the correct public URL | Identity, custody or authorization |
| Web application | Preparing transactions and explaining state | Moving funds without a signature |
| Application database | Search and presentation metadata | Financial truth |
| Privy | Authentication and wallet signing infrastructure | Deciding product-level ownership rules |
| Rock Registry | Object identity and lifecycle | Custody of trading funds |
| Rock Account | Asset custody and authorized execution | Offchain metadata |
| Attestation signer | Stating that a genuine tap happened, for a named subject and account | Spending anything; it never holds funds and never transacts |
| Claim relayer | Paying gas for `claimHandover`, and submitting a UserOperation the giver already signed | Choosing who receives a rock — the registry credits `att.subject`, which is inside the signature |
| Aqua | Virtual liquidity accounting and strategy execution | Guaranteed yield or price safety |
| MCP Server | Providing structured read-only rock state to AI agents | Executing unauthorized transactions or hallucinated financial claims |
| Telemetry | Observing and recording system state for AI agents | Source of truth for financial balances |

## High-level transaction path

1. NFC opens the rock URL.
2. Frontend resolves public rock ID through the registry/indexer.
3. Privy authenticates the acting user.
4. Frontend prepares a Rock Account call.
5. The owner signs through Privy.
6. Rock Account interacts with Aqua through the reference XYCSwap AquaApp; a visitor's swap goes
   from their personal Safe through the `XYCSwapTaker` periphery (D-030).
7. Events are indexed and reflected in the UI.

Two paths do not follow this shape, and both are deliberate:

- **Awakening and claiming** are attested, not owner-signed. Neither reads `msg.sender`, so
  either may be relayed — a sponsored UserOperation from the rock's Safe, or an operator relayer
  — which is what lets a user with an empty wallet take or receive a rock (D-026).
- **A claim is relayed by the operator**, because the recipient has no gas and the Rock Account's
  Safe is still the giver's at that moment (D-027).

## Non-goals for the MVP

- Holding private keys on NFC hardware.
- Treating physical possession as sufficient financial authorization.
- Fiat custody.
- A permissionless strategy marketplace.
