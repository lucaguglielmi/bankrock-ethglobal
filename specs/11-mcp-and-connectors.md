# MCP and Connectors Ecosystem

The Bank Rock architecture heavily leverages the Model Context Protocol (MCP) to allow AI agents to act as first-class citizens in development, monitoring, and runtime operations. 

This document defines the list of required MCP servers and connectors to interact with smart contracts, web3 wallets, Privy, and databases.

## 1. Web3 & Smart Contract MCP

**Purpose:** To independently read chain state, check ERC-20 balances, simulate transactions, and decode events directly from the blockchain RPC.
**Implementation:** An EVM-compatible MCP Server utilizing `viem` under the hood.
**Key Tools:**
- `eth_getBalance(address)`
- `eth_call(to, data)`
- `readContract(address, abi, functionName, args)`
- `simulateContract(address, abi, functionName, args)`
- `getTransactionReceipt(hash)`

## 2. Privy (Authentication & Wallets) MCP

**Purpose:** To manage user identities, verify authentication states, and query embedded wallet details securely via the backend.
**Implementation:** A custom Node.js MCP Server wrapping the `@privy-io/server-auth` SDK.
**Key Tools:**
- `getUser(userId)` — retrieves the user's connected accounts and smart wallets.
- `getWallets()` — lists all embedded wallets associated with the application.
- `verifyToken(token)` — validates JWTs to ensure requests are authenticated.

## 3. Database & Indexer MCP

**Purpose:** To query the Rock Registry and off-chain presentation metadata without relying solely on on-chain data.
**Implementation:** A PostgreSQL MCP Server connected to Supabase (or the chosen DB).
**Key Tools:**
- `query_database(sql)` — execute read-only queries against the indexer.
- `get_rock_metadata(rockId)` — fetch photos, names, and gift messages for a specific rock.

## 4. Telemetry & Observability MCP

**Purpose:** To ingest real-time structured JSON logs for self-healing and proactive debugging by the AI agent.
**Implementation:** A custom Telemetry MCP Server (as defined in `10-telemetry-and-observability.md`) that tails backend logs.
**Key Tools:**
- `query_logs(level, rockId, userId, limit)` — retrieve recent server logs.
- `get_server_metrics()` — fetch API latency and error rates.
- `trace_transaction(hash)` — trace a specific user flow through the backend services.

## 5. Bank Rock Oracle MCP (The "Master" Server)

**Purpose:** The single, unified interface exposed to the user's external AI client (e.g., ChatGPT, Claude Desktop, Antigravity). Rather than the client AI managing the complexity of Web3, Privy, and the DB individually, this Master MCP orchestrates the underlying Connectors to provide high-level, domain-specific tools. *Note: Bank Rock does NOT host its own in-app AI agent; it only provides the MCP server for the user's preferred agent to connect to.*
**Implementation:** A bespoke TypeScript MCP Server hosted as part of our backend infrastructure.
**Key Tools:**
- `get_rock_status(rockId)` — aggregates data from the DB, Privy, and Web3 to return a unified health and ownership state.
- `analyze_strategy_yield(rockId)` — queries Aqua balances via Web3 and returns a human-readable performance summary.
- `explain_recent_fees(rockId)` — retrieves and decodes recent on-chain events and logs to explain where a user's funds went.
- `simulate_cross_chain_intent(rockId, sourceChain, amount)` — calculates fees and routing to fund the rock from another L2.
- `optimize_idle_yield(rockId)` — analyzes Aave/Morpho rates and suggests yield allocation strategies for the rock's idle capital.
- `generate_agentic_strategy(rockId, riskProfile)` — dynamically calculates optimal Aqua strategy parameters based on a natural-language risk assessment and prepares a transaction payload for user review.
- `execute_agentic_rebalance(rockId, sessionKeyProof, strategyParams)` — executes a live rebalancing UserOperation directly onchain using the owner's delegated ERC-7579/4337 Scoped Session Key. The smart account guarantees the rebalance cannot exceed bounded slippage or move tokens outside Aqua.
