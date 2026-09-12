# ETHOnline 2026 Hackathon Tracks & Prize Strategy

*Updated from the live ETHGlobal ETHOnline 2026 Prizes portal (`https://ethglobal.com/events/ethonline2026/prizes#1inch`).*

---

## 🎯 Primary Target Sponsors: Aqua (1inch) & Privy

### 1. 1inch — Aqua & SwapVM ($7,000 Total Pool)

> **Key Insight**: 1inch is the creator and official sponsor of the **Aqua** protocol and **SwapVM**. Targeting Aqua *is* targeting the 1inch sponsor track.

#### Prizes
* **💧 Build an Aqua App — $5,000**
  * 🥇 1st Place: $2,500
  * 🥈 2nd Place: $1,500
  * 🥉 3rd Place: $1,000
  * **Focus**: Create a custom Aqua app that implements a sophisticated DeFi position. If you use SwapVM, you may modify SwapVM opcodes and define your own instructions. The final positions must be demonstrated through test scripts or a UI.
  * ⭐️ **Crucial Judging Note**: *"Projects that utilize SwapVM will be scored higher during the final judging."*
* **💦 Build an Aqua App (Continuity Track) — $2,000**
  * 🥇 1st Place: $1,500
  * 🥈 2nd Place: $500
  * *(Restricted to participants extending an existing project in the Continuity pool).*

#### Qualification Requirements
* Official Aqua / SwapVM contracts must be used (redeployments of a modified SwapVM contract are allowed).
* Onchain execution of token transfers must be demonstrated during the final demo (local forks / testnets are explicitly accepted).
* Proper Git commit history throughout the event (no single-commit dumps on the final day).
* Public GitHub repository and a 2–4 minute demo video.

#### Official Resources
* **SwapVM Smart Contracts**: [github.com/1inch/swap-vm](https://github.com/1inch/swap-vm/tree/main)
* **Aqua Smart Contracts**: [github.com/1inch/aqua](https://github.com/1inch/aqua)
* **Aqua TypeScript SDK**: [github.com/1inch/sdks/tree/master/typescript/aqua](https://github.com/1inch/sdks/tree/master/typescript/aqua)
* **SwapVM Whitepaper**: [SwapVM 1.0 PDF](https://github.com/1inch/swap-vm/blob/release/1.1/docs/whitepaper-swap-vm-1.0.pdf)
* **Aqua Whitepaper**: [Aqua 1.0 PDF](https://github.com/1inch/aqua/blob/main/docs/whitepaper-aqua-1.0.pdf)
* **1inch Workshop**: [YouTube Recording](https://www.youtube.com/watch?v=cuZNLZG3AsE)

#### Why Bank Rock is a Perfect Fit
* Bank Rock turns the physical rock into an **Aqua Maker**, keeping reserves self-custodial in the maker's wallet while exposing virtual liquidity.
* Bank Rock's architectural choice (`specs/04-aqua-integration.md`) explicitly adopted **SwapVM** for execution, directly aligning with 1inch's preferred evaluation criteria (*"Projects that utilize SwapVM will be scored higher"*).

---

### 2. Privy ($5,000 Total Pool)

#### Prizes
* **💸 Best Financial Flow — $2,500 (Direct Target)**
  * **Focus**: Build a seamless experience for funding, moving, trading, growing, or spending digital assets with Privy. Projects might include payments, remittances, cross-chain transfers, stablecoin conversions, swaps, savings experiences, payouts, or card-like spending products.
  * **Evaluation**: Strong submissions use Privy wallet actions or funding tools to simplify a real financial flow and hide unnecessary onchain complexity from the user.
* **🏢 Best B2B Financial Product — $2,500**
  * **Focus**: Treasury platforms, business accounts, payroll, spend management, shared organization wallets with policies, quorums, and signers.

#### The four prizes at `ethglobal.com/events/newyork2026/prizes/privy` ($1,250 each — assessed in [`specs/20`](../../specs/20-privy-earn-and-hackathon-qualification.md))

Bank Rock is in the **build-from-scratch track**, so *Best Existing Project Upgraded with Privy*
(Continuity Track only) is out. The other three are targeted together: **Best Onchain Financial
Product** (Earn → *Savings*), **Best Cross-Chain Funding Experience** (universal deposit addresses
→ *Add from anywhere*), **Best AI Agent Built with Privy** (Agent Wallet CLI → `/agent/SKILL.md`).

#### Qualification Requirements (Best Onchain Financial Product)

* Your project must use Privy embedded wallets.
* Your project must integrate Privy's Earn capability.
* Your demo should clearly show users depositing, managing, or earning on assets.
* Include a short explanation of how Privy was used in your submission ([`docs/submission/privy.md`](../submission/privy.md)).
* Bonus: creative use of onchain financial services; exceptional user experience; products that make crypto more accessible to mainstream users.

#### Qualification Requirements (Best Financial Flow, earlier listing)
* Integrate Privy as a core part of the product.
* Create or restore at least one Privy embedded wallet.
* Complete at least one functional financial flow using a generally available Privy feature (funding, transfers, swaps, earn vaults, or wallet actions).
* Provide a working demo and public source code repository.

#### Why Bank Rock is a Perfect Fit
* Tapping a physical Bank Rock immediately triggers a frictionless Privy onboarding/auth flow. Non-crypto users receive an embedded wallet without seed-phrase anxiety.
* The flow to fund the rock's reserve and execute swaps against its Aqua strategy demonstrates a tactile, end-to-end "tangible financial flow".

---

## 🌐 Secondary / Synergistic Sponsor Tracks on ETHOnline 2026

If time and scope permit, Bank Rock can cross-qualify for additional sponsor prizes without derailing the Aqua + Privy core:

| Sponsor | Prize | Focus & Bank Rock Synergies |
| --- | --- | --- |
| **The Graph** | $5,000 (Best AI Tooling / Use Case) | Bank Rock has an MCP Server for AI agents (`specs/11-mcp-and-connectors.md`). Querying live liquidity positions via Subgraphs / Subgraph MCP qualifies. |
| **ENS** | $4,500 (Best Use of ENSv2) | Giving each physical Bank Rock an ENSv2 subname (e.g. `rock-001.bankrock.eth`) for identity and metadata pointer. |
| **Uniswap Foundation** | $3,000 (Uniswap Stack Contribution) | Swap routing / AMM tooling comparison or hook integration. |
| **Ledger** | $5,000 | Hardware / physical signing workflows. |
| **World** | $7,000 | World ID / proof of human tap / sybil resistance. |

---

## 🏆 Core ETHGlobal Category Tracks

Bank Rock qualifies naturally for the general ETHGlobal categories:
1. **Consumer Crypto & UX**: Physical NFC object + embedded wallet turns abstract DeFi liquidity into a tangible gift.
2. **Account Abstraction**: Rock Account ownership transfers without moving underlying assets.
3. **AI & Web3**: Model Context Protocol (MCP) server enabling AI agents to read the rock's liquidity status and orchestrate rebalances.
