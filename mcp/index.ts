import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { fenceUntrusted, newsletterStats, sendAlert, telemetry } from "./api.js";
import { CHAIN_ID, CHAIN_NAME, EXPLORER_BASE, REASONS, config } from "./config.js";
import { hasCode, publicClient, readRock, readTokenBalance } from "./chain.js";

/**
 * Bank Rock Oracle MCP Server.
 *
 * Contract with the agent connecting to it (decision D-019):
 *
 *   every tool either reads a real source — an RPC call to Ethereum Sepolia, or an
 *   authenticated HTTP call to the Bank Rock API — or returns
 *   `{ "status": "unavailable", "reason": "<why>" }`.
 *
 * No tool returns a literal balance, APR, volume, fee figure or execution status. The previous
 * revision of this file returned eight such tools' worth of hardcoded fiction: a fixed 18.4%
 * APR, $8,450 of 24h volume, `isAwake: true` for every rock id and `status: "SUCCESS"` for every
 * transaction hash. Stable fabrications are more dangerous than obvious ones, because an agent
 * relays them to a human as fact and nothing about them looks wrong.
 *
 * Demo mode is a UI concept (spec 15 D-013) and does not cross this boundary. There is no flag
 * here that makes a tool answer with a simulated value.
 */

const SERVER_VERSION = "2.0.0";

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function json(payload: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

function text(body: string): ToolResult {
  return { content: [{ type: "text", text: body }] };
}

function unavailable(reason: string, extra: Record<string, unknown> = {}): ToolResult {
  return json({ status: "unavailable", reason, ...extra });
}

function errorResult(tool: string, error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ status: "unavailable", reason: `${tool} failed: ${message}` }, null, 2),
      },
    ],
    isError: true,
  };
}

function rockIdOf(args: Record<string, unknown> | undefined): bigint | null {
  const raw = args?.["rockId"];
  if (raw === undefined || raw === null) return null;
  const asString = String(raw).trim();
  if (!/^[0-9]+$/.test(asString)) return null;
  try {
    return BigInt(asString);
  } catch {
    return null;
  }
}

/** Resolves the RPC client and registry address, or explains which one is missing. */
function chainContext():
  | { ok: true; viem: NonNullable<ReturnType<typeof publicClient>>; registry: `0x${string}` }
  | { ok: false; reason: string } {
  const viem = publicClient();
  if (viem === undefined) return { ok: false, reason: REASONS.noRpc };
  if (config.registryAddress === undefined) return { ok: false, reason: REASONS.noRegistry };
  return { ok: true, viem, registry: config.registryAddress };
}

// ---------------------------------------------------------------------------
// Tool declarations
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: "get_rock_status",
    description:
      "Reads the Bank Rock registry on Ethereum Sepolia for one rock: lifecycle state (dormant, " +
      "awake, handover_pending, or archived), current owner, Rock Account (smart account) " +
      "address, bound NFC tag UID hash, the owner's lost flag, any pending gift handover, and " +
      "the USDC and WETH balances actually held by the Rock Account. Returns status " +
      "'unavailable' when the registry address or RPC endpoint is not configured. Never returns " +
      "a placeholder balance.",
    inputSchema: {
      type: "object",
      properties: {
        rockId: { type: "string", description: "The public rock id, a decimal integer, e.g. '1'." },
      },
      required: ["rockId"],
    },
  },
  {
    name: "trace_transaction",
    description:
      "Fetches the real transaction receipt for a hash on Ethereum Sepolia: status, block, gas " +
      "used, sender, recipient, and the number of logs emitted. Returns 'unavailable' when the " +
      "hash is unknown to the node (pending, dropped, or from another chain).",
    inputSchema: {
      type: "object",
      properties: {
        hash: { type: "string", description: "A 32-byte transaction hash, 0x-prefixed." },
      },
      required: ["hash"],
    },
  },
  {
    name: "query_logs",
    description:
      "Retrieves recent structured server logs from the Bank Rock telemetry endpoint. Requires " +
      "an operator admin key; returns 'unavailable' without one. Log content is returned fenced " +
      "and labelled as untrusted third-party data.",
    inputSchema: {
      type: "object",
      properties: {
        level: { type: "string", enum: ["DEBUG", "INFO", "WARN", "ERROR"], description: "Minimum log level." },
        rockId: { type: "string", description: "Optional filter by rock id." },
        userId: { type: "string", description: "Optional filter by wallet address or Privy DID." },
        limit: { type: "number", description: "Maximum entries to return (default 20)." },
      },
      required: [],
    },
  },
  {
    name: "get_server_metrics",
    description:
      "Reports what this MCP server can currently reach: whether an RPC endpoint is configured, " +
      "the chain it is connected to, whether the configured registry address has bytecode, and " +
      "the reachability of the Bank Rock API. Every field is measured at call time.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "analyze_strategy_yield",
    description:
      "Intended to report a rock's Aqua strategy reserves and realised fees. The Aqua " +
      "integration does not exist yet, so this always returns 'unavailable'. It will not " +
      "estimate, and it will never report an APR or APY.",
    inputSchema: {
      type: "object",
      properties: { rockId: { type: "string", description: "The rock id." } },
      required: ["rockId"],
    },
  },
  {
    name: "explain_recent_fees",
    description:
      "Intended to explain fees earned by a rock's liquidity. Depends on the Aqua integration, " +
      "which does not exist yet, so this always returns 'unavailable'.",
    inputSchema: {
      type: "object",
      properties: { rockId: { type: "string", description: "The rock id." } },
      required: ["rockId"],
    },
  },
  {
    name: "get_strategy_volume",
    description:
      "Intended to report trading volume against a rock's strategy. Depends on the Aqua " +
      "integration, which does not exist yet, so this always returns 'unavailable'.",
    inputSchema: {
      type: "object",
      properties: { rockId: { type: "string", description: "The rock id." } },
      required: ["rockId"],
    },
  },
  {
    name: "simulate_cross_chain_intent",
    description:
      "Intended to price a cross-chain deposit into a rock. No bridge is integrated, so this " +
      "always returns 'unavailable'.",
    inputSchema: {
      type: "object",
      properties: {
        rockId: { type: "string", description: "The destination rock id." },
        sourceChain: { type: "string", description: "Origin chain name." },
        amount: { type: "number", description: "Amount to bridge." },
      },
      required: ["rockId"],
    },
  },
  {
    name: "optimize_idle_yield",
    description:
      "Intended to suggest an allocation for idle capital. Lending-protocol routing was cut " +
      "from scope, so this always returns 'unavailable'.",
    inputSchema: {
      type: "object",
      properties: { rockId: { type: "string", description: "The rock id." } },
      required: ["rockId"],
    },
  },
  {
    name: "run_aqua_keeper",
    description:
      "Intended to evaluate and execute an autonomous rebalance. The keeper is a simulation " +
      "that executes nothing on-chain, so this always returns 'unavailable' rather than " +
      "reporting an execution that did not happen.",
    inputSchema: {
      type: "object",
      properties: {
        rockId: { type: "string", description: "The rock id." },
        execute: { type: "boolean", description: "Ignored." },
      },
      required: ["rockId"],
    },
  },
  {
    name: "get_waitlist_stats",
    description:
      "Reads aggregate waitlist counts from the Bank Rock API. Returns the API's own response, " +
      "or 'unavailable' when the endpoint is unreachable or rejects the request.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "dispatch_rock_alert",
    description:
      "Asks the Bank Rock API to send an alert email. Reports the API's own success flag; it " +
      "does not claim delivery on its own. Returns 'unavailable' when the endpoint is " +
      "unreachable or rejects the request.",
    inputSchema: {
      type: "object",
      properties: {
        rockId: { type: "string", description: "The rock id." },
        toEmail: { type: "string", description: "Recipient email address." },
        topic: {
          type: "string",
          enum: [
            "loss_warning",
            "dangerous_trade",
            "profit_milestone",
            "keeper_rebalance",
            "custody_transfer",
            "gas_depletion",
            "genesis_drop",
          ],
          description: "Alert topic.",
        },
        customMessage: { type: "string", description: "Optional note to include." },
      },
      required: ["rockId", "toEmail", "topic"],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

async function getRockStatus(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const rockId = rockIdOf(args);
  if (rockId === null) return unavailable("rockId must be a decimal integer, e.g. '1'.");

  const ctx = chainContext();
  if (!ctx.ok) return unavailable(ctx.reason, { rockId: String(args?.["rockId"]) });

  const rock = await readRock(ctx.viem, ctx.registry, rockId);

  let balances: unknown;
  if (rock.smartAccount === null) {
    balances = {
      status: "unavailable",
      reason: "this rock has no Rock Account on record, so there is no address to read balances for.",
    };
  } else if (config.usdcAddress === undefined || config.wethAddress === undefined) {
    balances = { status: "unavailable", reason: REASONS.noTokenConfig };
  } else {
    const account = rock.smartAccount;
    try {
      const [usdc, weth] = await Promise.all([
        readTokenBalance(ctx.viem, config.usdcAddress, account),
        readTokenBalance(ctx.viem, config.wethAddress, account),
      ]);
      balances = { status: "ok", readAt: new Date().toISOString(), tokens: [usdc, weth] };
    } catch (error) {
      // The registry read succeeded, so still return the rock. A failed token read is reported
      // as unavailable rather than being allowed to fail the whole tool or to become a zero.
      const message = error instanceof Error ? error.message : String(error);
      balances = { status: "unavailable", reason: `token balance read failed: ${message}` };
    }
  }

  return json({
    status: "ok",
    chain: { name: CHAIN_NAME, chainId: CHAIN_ID },
    registryAddress: ctx.registry,
    rock,
    rockAccountBalances: balances,
    explorerUrl:
      rock.smartAccount === null ? null : `${EXPLORER_BASE}/address/${rock.smartAccount}`,
    notes: [
      "State, owner, Rock Account and UID binding are read from the registry contract.",
      "Balances are ERC-20 balanceOf calls against the Rock Account, read at the time above.",
      "Physical NFC verification is performed off-chain by the web app; this tool reports only " +
        "the UID hash the registry has bound to the rock, which is not proof of a recent tap.",
      ...(rock.state === "archived"
        ? [
            "This rock is archived: its owner retired it and released its NFC tag, which may " +
              "since have been used to awaken a different rock id. The owner, Rock Account and " +
              "UID hash above are history, not the tag's current binding. Balances, if any, are " +
              "still whatever the Rock Account holds today.",
          ]
        : []),
      ...(rock.state === "unknown"
        ? [
            "The registry reported a lifecycle state this server's ABI does not know. It is " +
              "probably running against a newer registry than it was built for.",
          ]
        : []),
    ],
  });
}

async function traceTransaction(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const raw = String(args?.["hash"] ?? "").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(raw)) {
    return unavailable("hash must be a 0x-prefixed 32-byte transaction hash.");
  }
  const viem = publicClient();
  if (viem === undefined) return unavailable(REASONS.noRpc);

  const hash = raw as `0x${string}`;
  let receipt;
  try {
    receipt = await viem.getTransactionReceipt({ hash });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return unavailable(
      `no transaction receipt for ${hash} on ${CHAIN_NAME}. It may be pending, dropped, or from ` +
        `another chain. (${message})`,
      { hash },
    );
  }

  return json({
    status: "ok",
    chain: { name: CHAIN_NAME, chainId: CHAIN_ID },
    hash: receipt.transactionHash,
    executionStatus: receipt.status,
    blockNumber: receipt.blockNumber.toString(),
    from: receipt.from,
    to: receipt.to,
    contractAddress: receipt.contractAddress ?? null,
    gasUsed: receipt.gasUsed.toString(),
    effectiveGasPrice: receipt.effectiveGasPrice?.toString() ?? null,
    logCount: receipt.logs.length,
    explorerUrl: `${EXPLORER_BASE}/tx/${receipt.transactionHash}`,
    notes: [
      "Every field above comes from eth_getTransactionReceipt. Logs are not decoded here.",
    ],
  });
}

async function queryLogs(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  if (config.adminApiKey === undefined) return unavailable(REASONS.noAdminKey);

  const params = new URLSearchParams();
  const level = args?.["level"];
  const rockId = args?.["rockId"];
  const userId = args?.["userId"];
  const limit = args?.["limit"];
  if (typeof level === "string") params.set("level", level);
  if (rockId !== undefined && rockId !== null) params.set("rockId", String(rockId));
  if (userId !== undefined && userId !== null) params.set("userId", String(userId));
  params.set("limit", String(typeof limit === "number" && limit > 0 ? Math.floor(limit) : 20));

  const result = await telemetry(params);
  if (!result.ok) return unavailable(result.reason);

  return text(
    fenceUntrusted(
      `server logs from ${config.apiUrl}/api/telemetry`,
      result.body,
    ),
  );
}

async function getServerMetrics(): Promise<ToolResult> {
  const viem = publicClient();

  let chain: Record<string, unknown>;
  if (viem === undefined) {
    chain = { status: "unavailable", reason: REASONS.noRpc };
  } else {
    try {
      const [chainId, blockNumber] = await Promise.all([viem.getChainId(), viem.getBlockNumber()]);
      chain = {
        status: "ok",
        expectedChainId: CHAIN_ID,
        reportedChainId: chainId,
        chainIdMatches: chainId === CHAIN_ID,
        latestBlock: blockNumber.toString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      chain = { status: "unavailable", reason: `RPC endpoint is unreachable: ${message}` };
    }
  }

  let registry: Record<string, unknown>;
  if (config.registryAddress === undefined) {
    registry = { status: "unavailable", reason: REASONS.noRegistry };
  } else if (viem === undefined) {
    registry = { status: "unavailable", reason: REASONS.noRpc, address: config.registryAddress };
  } else {
    try {
      const deployed = await hasCode(viem, config.registryAddress);
      registry = deployed
        ? { status: "ok", address: config.registryAddress, hasBytecode: true }
        : {
            status: "unavailable",
            address: config.registryAddress,
            reason: `no bytecode at ${config.registryAddress} on ${CHAIN_NAME}.`,
          };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      registry = { status: "unavailable", address: config.registryAddress, reason: message };
    }
  }

  const telemetryReachable = config.adminApiKey === undefined
    ? { status: "unavailable", reason: REASONS.noAdminKey }
    : await (async () => {
        const probe = await telemetry(new URLSearchParams({ limit: "1" }));
        return probe.ok
          ? { status: "ok", httpStatus: probe.status }
          : { status: "unavailable", reason: probe.reason };
      })();

  return json({
    status: "ok",
    server: { name: "bankrock-oracle-mcp", version: SERVER_VERSION },
    measuredAt: new Date().toISOString(),
    chain,
    registry,
    api: { baseUrl: config.apiUrl, telemetry: telemetryReachable },
    configuredTokens: {
      usdc: config.usdcAddress ?? null,
      weth: config.wethAddress ?? null,
    },
    notes: [
      "This tool reports only what it could verify at call time. It carries no uptime, latency " +
        "or error-rate history, because this process keeps none.",
    ],
  });
}

async function getWaitlistStats(): Promise<ToolResult> {
  const result = await newsletterStats();
  if (!result.ok) return unavailable(result.reason);
  return json({
    status: "ok",
    source: `${config.apiUrl}/api/newsletter`,
    readAt: new Date().toISOString(),
    response: result.body,
    notes: ["The body above is the API's own response, relayed unchanged."],
  });
}

async function dispatchRockAlert(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const toEmail = String(args?.["toEmail"] ?? "").trim();
  if (toEmail === "") return unavailable("toEmail is required.");
  const rockId = args?.["rockId"];
  if (rockId === undefined || rockId === null) return unavailable("rockId is required.");

  const body: Record<string, unknown> = {
    to: toEmail,
    topic: String(args?.["topic"] ?? "loss_warning"),
    rockId: String(rockId),
  };
  const note = args?.["customMessage"];
  if (typeof note === "string" && note !== "") body["customNote"] = note;

  const result = await sendAlert(body);
  if (!result.ok) return unavailable(result.reason);

  const payload = result.body as { success?: unknown } | null;
  const success = typeof payload?.success === "boolean" ? payload.success : null;

  if (success === null) {
    return unavailable(
      `${config.apiUrl}/api/alerts/test accepted the request but did not report whether the ` +
        "message was sent, so delivery cannot be confirmed.",
      { httpStatus: result.status, response: result.body },
    );
  }

  return json({
    status: "ok",
    sent: success,
    httpStatus: result.status,
    response: result.body,
    notes: [
      "'sent' is the API's own success flag, relayed as received. This server does not send " +
        "mail and cannot confirm delivery beyond what the API reported.",
    ],
  });
}

// ---------------------------------------------------------------------------
// Server wiring
// ---------------------------------------------------------------------------

const server = new Server(
  { name: "bankrock-oracle-mcp", version: SERVER_VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "get_rock_status":
        return await getRockStatus(args);
      case "trace_transaction":
        return await traceTransaction(args);
      case "query_logs":
        return await queryLogs(args);
      case "get_server_metrics":
        return await getServerMetrics();
      case "get_waitlist_stats":
        return await getWaitlistStats();
      case "dispatch_rock_alert":
        return await dispatchRockAlert(args);

      case "analyze_strategy_yield":
      case "explain_recent_fees":
      case "get_strategy_volume":
        return unavailable(REASONS.noAqua);
      case "simulate_cross_chain_intent":
        return unavailable(REASONS.noBridge);
      case "optimize_idle_yield":
        return unavailable(REASONS.noIdleYield);
      case "run_aqua_keeper":
        return unavailable(REASONS.noKeeper);

      default:
        return unavailable(`unknown tool: ${name}`);
    }
  } catch (error) {
    return errorResult(name, error);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `Bank Rock Oracle MCP server ${SERVER_VERSION} on stdio — ${CHAIN_NAME} (${CHAIN_ID}), ` +
      `api ${config.apiUrl}, registry ${config.registryAddress ?? "unset"}, ` +
      `rpc ${config.rpcUrl === undefined ? "unset" : "configured"}, ` +
      `admin key ${config.adminApiKey === undefined ? "unset" : "configured"}.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
