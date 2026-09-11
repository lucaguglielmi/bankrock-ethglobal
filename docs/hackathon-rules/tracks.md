# ETHOnline 2026 Hackathon Tracks

*(Note: The official ETHGlobal event page was inaccessible (HTTP 500), so this document is synthesized from typical ETHGlobal track structures and the project's chosen technologies.)*

## Core ETHGlobal Tracks

### 1. Consumer Crypto & UX
- **Focus:** Projects that bring blockchain to everyday users through seamless, intuitive, and delightful interfaces.
- **Why Bank Rock Fits:** Bank Rock abstracts the wallet behind a physical object and Privy, making DeFi feel like a tangible gift rather than a complex financial tool.

### 2. Account Abstraction (ERC-4337)
- **Focus:** Novel uses of Smart Accounts, gas sponsorship (Paymasters), and session keys to improve user onboarding and security.
- **Why Bank Rock Fits:** Transferring ownership of the rock relies entirely on changing the signing key of a Smart Account without moving the underlying assets.

### 3. AI & Web3 
- **Focus:** Intersections of Artificial Intelligence and blockchain, including AI agents interacting with smart contracts or onchain data.
- **Why Bank Rock Fits:** Extending the Bank Rock to expose an MCP (Model Context Protocol) allows AI agents to act as portfolio managers or query the rock's liquidity status conversationally.

## Sponsor Tracks

### Privy
- **Focus:** Best use of Privy's embedded wallets, progressive onboarding, and seamless cross-device auth.
- **Relevance:** High. Bank Rock relies heavily on Privy to onboard non-crypto users who receive a rock as a gift.

### 1inch / Aqua
- **Focus:** Best implementation of the Aqua protocol for decentralized liquidity and market making.
- **Relevance:** High. The Rock Account acts as an Aqua Maker, using SwapVM to expose its liquidity physically.

### Base / Arbitrum
- **Focus:** Best deployments on Base or Arbitrum networks.
- **Relevance:** Medium. Deploying the smart accounts and SwapVM integrations on these L2s will guarantee fast, cheap transactions required for a smooth UX.
