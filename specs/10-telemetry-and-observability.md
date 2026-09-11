# Telemetry and Observability

## Core Philosophy

The system must be highly observable. AI agents are an integral part of the development and maintenance lifecycle. Therefore, the Bank Rock server must expose its internal state, performance metrics, and error logs in a format that an AI agent can proactively read and understand.

## Telemetry Stack

- **Structured Logging:** All server logs will be emitted as structured JSON objects. This eliminates the need for complex regex parsing and makes it trivial for an AI to digest the logs.
- **Log Levels:** Standard levels (INFO, WARN, ERROR, DEBUG) must be strictly adhered to.
- **Contextual Data:** Every log entry must include context where applicable:
  - `rockId`
  - `userId` (Privy DID)
  - `transactionHash`
  - `latencyMs`

## AI Agent Integration (MCP)

The Bank Rock MCP Server will include a dedicated "Log & Telemetry" tool.

### Capabilities

1. **Proactive Debugging:** When an error occurs on the frontend (e.g., an Aqua swap fails), the AI agent can query the MCP server for recent `ERROR` logs associated with the specific `rockId` or `userId`.
2. **Performance Monitoring:** The agent can read server metrics (latency, API rate limits) to diagnose slow response times.
3. **Self-Healing:** In advanced scenarios, if the AI detects a transient failure (e.g., RPC node timeout), it can advise the user on the exact issue or suggest retry strategies, preventing blind "Something went wrong" errors.

## UX Impact

By providing the AI agent with deep, real-time context about the server's state, we ensure that when users ask the Oracle "Why did my transaction fail?", the agent has the actual stack trace and context to provide a precise, helpful, and non-technical explanation.
