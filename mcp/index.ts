import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { fenceUntrusted, newsletterStats, rockStrategy, telemetry } from "./api.js";
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
    name: "get_strategy_fees",
    description:
      "Reads a rock's live Aqua strategy from `GET /api/rocks/{id}/strategy` — the same route " +
      "the rock page itself reads: the rock's actual USDC/WETH reserve, each shipped stream's " +
      "virtual and executable balances, its immutable swap fee rate (feeBps), and the fees " +
      "realised on that stream so far (summed from Aqua's own Pushed events, D-030). Was named " +
      "'analyze_strategy_yield' before this integration existed and always answered " +
      "'unavailable'; renamed because it reports fees, never a yield. It will not estimate, " +
      "annualise or otherwise report an APR or APY (D-004) — there is no such figure to read.",
    inputSchema: {
      type: "object",
      properties: { rockId: { type: "string", description: "The rock id." } },
      required: ["rockId"],
    },
  },
  {
    name: "explain_recent_fees",
    description:
      "Reads the same `GET /api/rocks/{id}/strategy` route as get_strategy_fees and narrates, " +
      "per live stream, the fee amount actually earned, how many swaps it came from, and the " +
      "exact block range scanned to compute it — naming a stream 'unavailable' rather than " +
      "guessing when its swap history could not be scanned. Fees accrue inside the rock's own " +
      "reserve; there is no separate fee balance to withdraw.",
    inputSchema: {
      type: "object",
      properties: { rockId: { type: "string", description: "The rock id." } },
      required: ["rockId"],
    },
  },
  {
    name: "get_strategy_volume",
    description:
      "Reads the same `GET /api/rocks/{id}/strategy` route and reports, per live stream, the " +
      "number of swaps observed in the scanned Pushed-event range. This is an activity count, " +
      "not a token- or dollar-denominated trading volume: the reference Aqua app keeps no " +
      "volume ledger, and this server does not derive one from the amounts it can see (D-019). " +
      "Use get_strategy_fees or explain_recent_fees for the actual token amounts earned.",
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
    name: "get_waitlist_stats",
    description:
      "Reads aggregate waitlist counts from the Bank Rock API. Returns the API's own response, " +
      "or 'unavailable' when the endpoint is unreachable or rejects the request.",
    inputSchema: { type: "object", properties: {}, required: [] },
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

// ---------------------------------------------------------------------------
// Aqua strategy reads (A6) — all three tools below read the same route,
// `GET /api/rocks/{id}/strategy` (web/src/app/api/rocks/[id]/strategy/route.ts), which is what the
// rock page itself reads for its Aqua position. No strategy hash, balance or fee is recomputed
// here: this server relays that route's own REAL/UNAVAILABLE answer, which keeps D-030's strategy
// encoding in exactly one implementation.
// ---------------------------------------------------------------------------

/** The fields this server reads from `serializeStrategyView` (web/src/lib/aqua/serialize.ts). */
interface StrategyStreamJson {
  streamIndex: string;
  label?: string;
  feeBps: string;
  virtual: { usdc: string; weth: string };
  executable: { usdc: string; weth: string };
  fees?: {
    earned: { usdc: string; weth: string };
    swapCount: number;
    fromBlock: string;
    toBlock: string;
    complete: boolean;
  };
  feesUnavailable?: string;
}

interface StrategyViewJson {
  rockId: string;
  maker: string;
  app: string;
  aqua: string;
  actual: { usdc: string; weth: string };
  allowance: { usdc: string; weth: string };
  streams: StrategyStreamJson[];
}

/**
 * Calls `GET /api/rocks/{id}/strategy` and returns its own REAL/UNAVAILABLE answer, never a
 * second-guessed one.
 */
async function fetchStrategyView(
  rockId: string,
): Promise<{ ok: true; value: StrategyViewJson } | { ok: false; reason: string }> {
  const result = await rockStrategy(rockId);
  if (!result.ok) return { ok: false, reason: result.reason };

  const body = result.body as { state?: unknown; reason?: unknown; value?: unknown } | null;
  if (body === null || typeof body !== "object" || typeof body.state !== "string") {
    return {
      ok: false,
      reason: `${config.apiUrl}/api/rocks/${rockId}/strategy returned an unexpected response shape.`,
    };
  }
  if (body.state === "UNAVAILABLE") {
    return { ok: false, reason: typeof body.reason === "string" ? body.reason : "unavailable" };
  }
  if (body.state !== "REAL" || typeof body.value !== "object" || body.value === null) {
    return {
      ok: false,
      reason: `${config.apiUrl}/api/rocks/${rockId}/strategy returned an unrecognised state ` +
        `("${body.state}").`,
    };
  }
  return { ok: true, value: body.value as StrategyViewJson };
}

async function getStrategyFees(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const rockId = rockIdOf(args);
  if (rockId === null) return unavailable("rockId must be a decimal integer, e.g. '1'.");

  const view = await fetchStrategyView(String(rockId));
  if (!view.ok) return unavailable(view.reason, { rockId: String(rockId) });
  const value = view.value;

  return json({
    status: "ok",
    source: `${config.apiUrl}/api/rocks/${rockId}/strategy`,
    rockId: value.rockId,
    maker: value.maker,
    aquaApp: value.app,
    aquaAddress: value.aqua,
    actualReserve: value.actual,
    streams: value.streams.map((stream) => ({
      streamIndex: stream.streamIndex,
      label: stream.label ?? null,
      feeBpsRate: stream.feeBps,
      virtualBalance: stream.virtual,
      executableBalance: stream.executable,
      feesEarned: stream.fees?.earned ?? null,
      feesUnavailable: stream.feesUnavailable ?? null,
    })),
    notes: [
      "actualReserve is ERC20.balanceOf on the Rock Account for USDC and WETH, in base units.",
      "Each stream's virtualBalance is Aqua.safeBalances — an allowance the strategy may trade " +
        "against, not a deposit; do not sum it across streams.",
      "executableBalance is min(virtual, actual, allowance): what the stream could settle right now.",
      "feeBpsRate is the strategy's own immutable swap fee, authenticated by its hash. " +
        "feesEarned is the amount actually accrued from real swaps, read from Aqua's Pushed events.",
      "This is a fee rate and a realised fee amount, never a yield, APY or APR (D-004) — the " +
        "reference constant-product app has no return rate to project.",
    ],
  });
}

async function explainRecentFees(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const rockId = rockIdOf(args);
  if (rockId === null) return unavailable("rockId must be a decimal integer, e.g. '1'.");

  const view = await fetchStrategyView(String(rockId));
  if (!view.ok) return unavailable(view.reason, { rockId: String(rockId) });
  const value = view.value;

  return json({
    status: "ok",
    source: `${config.apiUrl}/api/rocks/${rockId}/strategy?fees=1`,
    rockId: value.rockId,
    streams: value.streams.map((stream) => ({
      streamIndex: stream.streamIndex,
      label: stream.label ?? null,
      feeBps: stream.feeBps,
      earned: stream.fees?.earned ?? null,
      swapCount: stream.fees?.swapCount ?? null,
      scannedFromBlock: stream.fees?.fromBlock ?? null,
      scannedToBlock: stream.fees?.toBlock ?? null,
      scanComplete: stream.fees?.complete ?? null,
      unavailableReason: stream.feesUnavailable ?? null,
    })),
    notes: [
      "'earned' is Σ Pushed.amount · feeBps / 10000 over that stream's real Pushed events on " +
        "Ethereum Sepolia, excluding the two Pushed events the ship itself emits (D-030). XYCSwap " +
        "keeps no separate fee balance: fees accrue inside the rock's own reserve, so there is " +
        "nothing to withdraw beyond the reserve itself.",
      "'scanComplete' is true only when the scan reached back to the Aqua app's deploy block; " +
        "false means the figure covers a recent window only and may undercount.",
      "A stream with 'unavailableReason' set could not be scanned (RPC or configuration); no fee " +
        "figure is substituted for it (D-019).",
    ],
  });
}

async function getStrategyVolume(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const rockId = rockIdOf(args);
  if (rockId === null) return unavailable("rockId must be a decimal integer, e.g. '1'.");

  const view = await fetchStrategyView(String(rockId));
  if (!view.ok) return unavailable(view.reason, { rockId: String(rockId) });
  const value = view.value;

  const anyScanned = value.streams.some((stream) => stream.fees !== undefined);
  if (!anyScanned) {
    const reason =
      value.streams.find((stream) => stream.feesUnavailable !== undefined)?.feesUnavailable ??
      "no stream's swap history could be scanned";
    return unavailable(reason, { rockId: String(rockId) });
  }

  return json({
    status: "ok",
    source: `${config.apiUrl}/api/rocks/${rockId}/strategy?fees=1`,
    rockId: value.rockId,
    streams: value.streams.map((stream) => ({
      streamIndex: stream.streamIndex,
      label: stream.label ?? null,
      swapsObserved: stream.fees?.swapCount ?? null,
      scannedFromBlock: stream.fees?.fromBlock ?? null,
      scannedToBlock: stream.fees?.toBlock ?? null,
      scanComplete: stream.fees?.complete ?? null,
      unavailableReason: stream.feesUnavailable ?? null,
    })),
    notes: [
      "'swapsObserved' counts Pushed events attributed to real swaps against that stream in the " +
        "scanned block range (the same scan explain_recent_fees uses) — a count of trades, not a " +
        "token- or dollar-denominated trading volume.",
      "The reference Aqua app keeps no volume ledger, and this server does not derive one from " +
        "the amounts it can see (D-019): use get_strategy_fees or explain_recent_fees for the " +
        "actual token amounts earned.",
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

      case "get_strategy_fees":
        return await getStrategyFees(args);
      case "explain_recent_fees":
        return await explainRecentFees(args);
      case "get_strategy_volume":
        return await getStrategyVolume(args);
      case "simulate_cross_chain_intent":
        return unavailable(REASONS.noBridge);
      case "optimize_idle_yield":
        return unavailable(REASONS.noIdleYield);

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
