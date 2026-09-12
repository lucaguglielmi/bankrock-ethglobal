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
**Implementation:** A bespoke TypeScript MCP Server (`mcp/index.ts`) hosted as part of our backend
infrastructure.

**Key Tools**, as actually implemented — every one either reads a real source or returns
`{ "status": "unavailable", "reason": "..." }` (D-019), and none of them writes anything:
- `get_rock_status(rockId)` — reads the registry directly over RPC: lifecycle state, owner, Rock
  Account address, bound NFC UID hash, lost flag, any pending handover, and the Rock Account's own
  USDC/WETH balances.
- `trace_transaction(hash)` — `eth_getTransactionReceipt` on Ethereum Sepolia.
- `query_logs(level, rockId, userId, limit)` — the Bank Rock telemetry endpoint
  (`GET /api/telemetry`, `x-admin-key` authenticated), fenced and labelled untrusted before it
  reaches an agent.
- `get_server_metrics()` — what this process can currently reach: RPC, registry bytecode, the API.
- `get_strategy_fees(rockId)` — calls `GET /api/rocks/{id}/strategy`, the same route the rock page
  itself reads (spec 04, D-030): the rock's actual USDC/WETH reserve, each live Aqua stream's
  virtual and executable balances, its immutable fee rate (`feeBps`), and the fees actually
  realised on that stream (summed from Aqua's own `Pushed` events). **Renamed** from
  `analyze_strategy_yield` — that name implied a yield or performance figure, which D-004
  forbids and which the reference constant-product app has no way to produce; the tool now reports
  exactly what it returns, fees, and nothing is estimated or annualised.
- `explain_recent_fees(rockId)` — the same route's fee figures, narrated per stream with the
  scanned block range and whether the scan reached the app's deploy block (so an agent can say
  when a figure might undercount).
- `get_strategy_volume(rockId)` — the swap count observed per stream in that same scan. This is an
  activity count, not a token- or dollar-denominated trading volume: the reference Aqua app keeps
  no volume ledger, and this server does not derive one from the amounts it can see (D-019).
- `simulate_cross_chain_intent(rockId, sourceChain, amount)` — always `unavailable`; no bridge is
  integrated (spec 15 Part 6).
- `optimize_idle_yield(rockId)` — always `unavailable`; idle-yield routing into lending protocols
  was cut from scope (spec 15 Part 6).
- `get_waitlist_stats()` — reads aggregate waitlist counts from `GET /api/newsletter`, `x-admin-key`
  authenticated.

None of the above executes a transaction, and none holds a session key: `generate_agentic_strategy`
and `execute_agentic_rebalance`, describing an agent that ships strategies and rebalances live using
an ERC-7579 session key, were never implemented and do not appear in `mcp/index.ts` — D-008 and
D-019 make the server read-only, and D-010's session-key module is cut from MVP scope (spec 15
Part 6). Kept out of the tool list above rather than documented as available.

**Removed:** `run_aqua_keeper`, a tool that always answered `unavailable` because it fronted the
Gelato keeper function (`web3-functions/bankrock-keeper`), which targeted a contract interface
that does not exist (spec 15 X-7). The keeper is deleted rather than rewritten (D-035); there is
nothing left for this tool to front, so it is gone rather than kept as a permanent `unavailable`
stub. `get_strategy_fees` (the renamed `analyze_strategy_yield`) and the other Aqua-reading tools
are unaffected — they read real Aqua state and remain read-only per D-008 and D-019.

**Also removed:** `dispatch_rock_alert`, a tool that asked `POST /api/alerts/test` to send an
operator test email. Two independent reasons it is gone rather than fixed: the MCP server is
read-only by decision (D-008, D-019), and a tool that asks the API to send mail has no place on a
read-only server regardless of whether the send works; and it never worked anyway —
`/api/alerts/test` requires the operator's admin **session cookie** (`requireAdminSession`), not
the `x-admin-key` header this server sends, so every call returned `401`. `ADMIN_API_KEY`, the one
operator credential this server holds, authenticates only the two **read** routes it still calls:
`GET /api/telemetry` and `GET /api/newsletter`.
