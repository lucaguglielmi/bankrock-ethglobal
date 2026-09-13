/**
 * The hosted MCP tools — what `/api/mcp` offers to any client on the internet.
 *
 * Same contract as the stdio server in `mcp/index.ts` (decisions D-008, D-019): every tool
 * either reads a real source or returns `{ "status": "unavailable", "reason": "<why>" }`. No
 * tool returns a literal balance, volume, fee figure or execution status that was not read.
 *
 * Two differences from the stdio server, both because this endpoint is anonymous:
 *
 *  - it reads the chain in-process through the same modules the rock page and the API routes use
 *    (`readRock`, `readReserves`, `readRockStrategyView`), rather than calling the API over HTTP.
 *    A Worker cannot fetch its own hostname (`global_fetch_strictly_public`), and one
 *    implementation cannot drift from itself;
 *  - the two operator tools (`query_logs`, `get_waitlist_stats`) are absent. They need
 *    `ADMIN_API_KEY`, and a public endpoint with no caller identity has no way to hold one.
 *
 * Error text never carries an upstream message: viem puts the RPC URL, and with it the
 * provider's key, into its errors, and this endpoint is unauthenticated (audit P-2). Reasons go
 * through `publicReason` like every other public route.
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { formatUnits, zeroAddress, type Hex } from "viem";
import { readRockStrategyView } from "@/lib/aqua/strategy-view";
import {
  addresses,
  appPath,
  appUrl,
  assertDeployed,
  chain,
  chainId,
  explorer,
  getPublicClient,
  hasRpcUrl,
  requireAddress,
  tokens,
} from "@/lib/chain";
import { publicReasonWith } from "@/lib/errors";
import { parseRockId, readReserves, readRock, type RockRecord } from "@/lib/rock-account";
import { MCP_ENDPOINT_PATH } from "./prompt";

export type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

type ToolArgs = Record<string, unknown> | undefined;

/** Reasons a tool reports `unavailable`, phrased for a human reading an agent transcript. */
export const HOSTED_REASONS = {
  badRockId: "rockId must be a positive decimal integer, e.g. '3'.",
  badHash: "hash must be a 0x-prefixed 32-byte transaction hash.",
  noBridge:
    "cross-chain bridging is not integrated; it remains a labelled simulation in the web app only (spec 15 Part 6).",
  noIdleYield: "idle-yield routing (Aave/Morpho) was cut from scope (spec 15 Part 6).",
  noAccount: "this rock has no Rock Account on record, so there is no address to read balances for.",
} as const;

const ZERO_BYTES32: Hex = `0x${"0".repeat(64)}`;

function json(payload: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

function unavailable(reason: string, extra: Record<string, unknown> = {}): ToolResult {
  return json({ status: "unavailable", reason, ...extra });
}

function errorResult(tool: string, error: unknown): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          { status: "unavailable", reason: publicReasonWith(`${tool} failed`, error) },
          null,
          2,
        ),
      },
    ],
    isError: true,
  };
}

/** Every tool here only reads, so a client may call it without asking the person each time. */
const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const ROCK_ID_INPUT: Tool["inputSchema"] = {
  type: "object",
  properties: {
    rockId: { type: "string", description: "The public rock id, a decimal integer, e.g. '3'." },
  },
  required: ["rockId"],
};

// ---------------------------------------------------------------------------
// Tool declarations — the same names, arguments and wording as mcp/index.ts
// ---------------------------------------------------------------------------

export const HOSTED_TOOLS: Tool[] = [
  {
    name: "get_rock_status",
    title: "Rock status",
    description:
      "Reads the Bank Rock registry on Ethereum Sepolia for one rock: lifecycle state (dormant, " +
      "awake, handover_pending, or archived), current owner, Rock Account (smart account) " +
      "address, bound NFC tag UID hash, the owner's lost flag, any pending gift handover, and " +
      "the USDC and WETH balances actually held by the Rock Account. Returns status " +
      "'unavailable' when the registry or the RPC cannot be read. Never returns a placeholder " +
      "balance.",
    inputSchema: ROCK_ID_INPUT,
    annotations: READ_ONLY,
  },
  {
    name: "get_strategy_fees",
    title: "Strategy fees",
    description:
      "Reads a rock's live Aqua strategies — the same read the rock page makes: the rock's " +
      "actual USDC/WETH reserve, each shipped stream's virtual and executable balances, its " +
      "immutable swap fee rate (feeBps), and the fees realised on that stream so far (summed " +
      "from Aqua's own Pushed events, D-030). It reports fees, never a yield: it will not " +
      "estimate, annualise or otherwise report a rate of return (D-004) — there is no such " +
      "figure to read.",
    inputSchema: ROCK_ID_INPUT,
    annotations: READ_ONLY,
  },
  {
    name: "explain_recent_fees",
    title: "Recent fees, explained",
    description:
      "The same read as get_strategy_fees, narrated per live stream: the fee amount actually " +
      "earned, how many swaps it came from, and the exact block range scanned to compute it — " +
      "naming a stream 'unavailable' rather than guessing when its swap history could not be " +
      "scanned. Fees accrue inside the rock's own reserve; there is no separate fee balance to " +
      "withdraw.",
    inputSchema: ROCK_ID_INPUT,
    annotations: READ_ONLY,
  },
  {
    name: "get_strategy_volume",
    title: "Strategy activity",
    description:
      "The same read again, reporting per live stream the number of swaps observed in the " +
      "scanned Pushed-event range. This is an activity count, not a token- or dollar-denominated " +
      "trading volume: the reference Aqua app keeps no volume ledger, and this server does not " +
      "derive one from the amounts it can see (D-019). Use get_strategy_fees or " +
      "explain_recent_fees for the actual token amounts earned.",
    inputSchema: ROCK_ID_INPUT,
    annotations: READ_ONLY,
  },
  {
    name: "trace_transaction",
    title: "Transaction receipt",
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
    annotations: READ_ONLY,
  },
  {
    name: "get_server_metrics",
    title: "Server health",
    description:
      "Reports what this endpoint can currently reach: the chain its RPC answers for and its " +
      "latest block, whether the configured registry address has bytecode, and where the Bank " +
      "Rock API lives. Every field is measured at call time.",
    inputSchema: { type: "object", properties: {}, required: [] },
    annotations: READ_ONLY,
  },
  {
    name: "simulate_cross_chain_intent",
    title: "Cross-chain deposit (not built)",
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
    annotations: READ_ONLY,
  },
  {
    name: "optimize_idle_yield",
    title: "Idle-yield routing (not built)",
    description:
      "Intended to suggest an allocation for idle capital. Lending-protocol routing was cut " +
      "from scope, so this always returns 'unavailable'.",
    inputSchema: ROCK_ID_INPUT,
    annotations: READ_ONLY,
  },
];

export const HOSTED_TOOL_NAMES = HOSTED_TOOLS.map((tool) => tool.name);

/** The two stdio-only tools, named so the page and the tests can say why they are missing here. */
export const OPERATOR_ONLY_TOOL_NAMES = ["query_logs", "get_waitlist_stats"] as const;

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

function rockIdOf(args: ToolArgs): string | null {
  const raw = args?.["rockId"];
  if (raw === undefined || raw === null) return null;
  const parsed = parseRockId(String(raw));
  return parsed === null ? null : parsed.toString();
}

function nullIfZero<T extends string>(value: T, zero: string): T | null {
  return value.toLowerCase() === zero.toLowerCase() ? null : value;
}

function describeRock(rock: RockRecord) {
  return {
    rockId: rock.rockId,
    state: rock.state,
    owner: nullIfZero(rock.owner, zeroAddress),
    smartAccount: nullIfZero(rock.smartAccount, zeroAddress),
    uidHash: nullIfZero(rock.uidHash, ZERO_BYTES32),
    lost: rock.lost,
    handover:
      rock.handover === null
        ? null
        : {
            recipient: rock.handover.recipient,
            expiresAt: new Date(rock.handover.expiresAt * 1000).toISOString(),
            initiatedAt: new Date(rock.handover.initiatedAt * 1000).toISOString(),
            initiatedBy: rock.handover.initiatedBy,
            messageHash: nullIfZero(rock.handover.messageHash, ZERO_BYTES32),
          },
  };
}

async function getRockStatus(args: ToolArgs): Promise<ToolResult> {
  const rockId = rockIdOf(args);
  if (rockId === null) return unavailable(HOSTED_REASONS.badRockId);

  const registry = requireAddress("registry");
  if (registry.state !== "REAL") {
    return unavailable(registry.state === "UNAVAILABLE" ? registry.reason : "registry not readable", {
      rockId,
    });
  }

  const record = await readRock(rockId);
  if (record.state !== "REAL") {
    return unavailable(
      record.state === "UNAVAILABLE" ? record.reason : "This rock's record is not readable",
      { rockId },
    );
  }
  const rock = record.value;
  const account = nullIfZero(rock.smartAccount, zeroAddress);

  let balances: unknown;
  if (account === null) {
    balances = { status: "unavailable", reason: HOSTED_REASONS.noAccount };
  } else {
    // The registry read succeeded, so the rock is still returned. A failed token read is reported
    // as unavailable rather than being allowed to fail the whole tool or to become a zero.
    const reserves = await readReserves(account);
    balances =
      reserves.state === "REAL"
        ? {
            status: "ok",
            readAt: new Date().toISOString(),
            tokens: [
              {
                token: tokens.USDC.address ?? null,
                symbol: tokens.USDC.symbol,
                decimals: tokens.USDC.decimals,
                raw: reserves.value.usdc.toString(),
                formatted: formatUnits(reserves.value.usdc, tokens.USDC.decimals),
              },
              {
                token: tokens.WETH.address ?? null,
                symbol: tokens.WETH.symbol,
                decimals: tokens.WETH.decimals,
                raw: reserves.value.weth.toString(),
                formatted: formatUnits(reserves.value.weth, tokens.WETH.decimals),
              },
            ],
          }
        : {
            status: "unavailable",
            reason: reserves.state === "UNAVAILABLE" ? reserves.reason : "balances not readable",
          };
  }

  return json({
    status: "ok",
    chain: { name: chain.name, chainId },
    registryAddress: registry.value,
    rock: describeRock(rock),
    rockAccountBalances: balances,
    explorerUrl: account === null ? null : explorer.address(account),
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
    ],
  });
}

async function traceTransaction(args: ToolArgs): Promise<ToolResult> {
  const raw = String(args?.["hash"] ?? "").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(raw)) return unavailable(HOSTED_REASONS.badHash);
  const hash = raw as Hex;

  let receipt;
  try {
    receipt = await getPublicClient().getTransactionReceipt({ hash });
  } catch (error) {
    return unavailable(
      publicReasonWith(
        `no transaction receipt for ${hash} on ${chain.name}. It may be pending, dropped, or ` +
          "from another chain",
        error,
      ),
      { hash },
    );
  }

  return json({
    status: "ok",
    chain: { name: chain.name, chainId },
    hash: receipt.transactionHash,
    executionStatus: receipt.status,
    blockNumber: receipt.blockNumber.toString(),
    from: receipt.from,
    to: receipt.to,
    contractAddress: receipt.contractAddress ?? null,
    gasUsed: receipt.gasUsed.toString(),
    effectiveGasPrice: receipt.effectiveGasPrice?.toString() ?? null,
    logCount: receipt.logs.length,
    explorerUrl: explorer.tx(receipt.transactionHash),
    notes: ["Every field above comes from eth_getTransactionReceipt. Logs are not decoded here."],
  });
}

async function getServerMetrics(): Promise<ToolResult> {
  let chainReport: Record<string, unknown>;
  try {
    const client = getPublicClient();
    const [reportedChainId, blockNumber] = await Promise.all([
      client.getChainId(),
      client.getBlockNumber(),
    ]);
    chainReport = {
      status: "ok",
      expectedChainId: chainId,
      reportedChainId,
      chainIdMatches: reportedChainId === chainId,
      latestBlock: blockNumber.toString(),
      rpc: hasRpcUrl()
        ? "a dedicated provider (SEPOLIA_RPC_URL is set)"
        : "viem's public Sepolia endpoint (SEPOLIA_RPC_URL is not set)",
    };
  } catch (error) {
    chainReport = {
      status: "unavailable",
      reason: publicReasonWith("The Sepolia RPC could not be reached", error),
    };
  }

  let registry: Record<string, unknown>;
  const configured = requireAddress("registry");
  if (configured.state !== "REAL") {
    registry = {
      status: "unavailable",
      reason: configured.state === "UNAVAILABLE" ? configured.reason : "registry not readable",
    };
  } else {
    const deployed = await assertDeployed(configured.value);
    registry =
      deployed.state === "REAL"
        ? { status: "ok", address: configured.value, hasBytecode: true }
        : {
            status: "unavailable",
            address: configured.value,
            reason: deployed.state === "UNAVAILABLE" ? deployed.reason : "registry not readable",
          };
  }

  return json({
    status: "ok",
    server: { name: "bankrock-oracle-mcp", transport: "streamable-http", endpoint: appPath(MCP_ENDPOINT_PATH) },
    measuredAt: new Date().toISOString(),
    chain: chainReport,
    registry,
    api: {
      baseUrl: appUrl,
      strategyRoute: appPath("/api/rocks/{id}/strategy"),
      note: "This endpoint runs inside the same Worker as the API and reads the chain in-process.",
    },
    configuredTokens: { usdc: addresses.usdc ?? null, weth: addresses.weth ?? null },
    notes: [
      "This tool reports only what it could verify at call time. It carries no uptime, latency " +
        "or error-rate history, because this process keeps none.",
    ],
  });
}

async function readStrategy(rockId: string) {
  return readRockStrategyView({ rockId, fees: true });
}

function strategySource(rockId: string): string {
  return appPath(`/api/rocks/${rockId}/strategy?fees=1`);
}

async function getStrategyFees(args: ToolArgs): Promise<ToolResult> {
  const rockId = rockIdOf(args);
  if (rockId === null) return unavailable(HOSTED_REASONS.badRockId);

  const view = await readStrategy(rockId);
  if (view.state !== "REAL") {
    return unavailable(view.state === "UNAVAILABLE" ? view.reason : "strategy not readable", {
      rockId,
    });
  }
  const value = view.value;

  return json({
    status: "ok",
    source: strategySource(rockId),
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
      "This is a fee rate and a realised fee amount, never a yield or a rate of return (D-004) — " +
        "the reference constant-product app has no return rate to project.",
      "source names the public route that runs this same read; the endpoint read it in-process.",
    ],
  });
}

async function explainRecentFees(args: ToolArgs): Promise<ToolResult> {
  const rockId = rockIdOf(args);
  if (rockId === null) return unavailable(HOSTED_REASONS.badRockId);

  const view = await readStrategy(rockId);
  if (view.state !== "REAL") {
    return unavailable(view.state === "UNAVAILABLE" ? view.reason : "strategy not readable", {
      rockId,
    });
  }
  const value = view.value;

  return json({
    status: "ok",
    source: strategySource(rockId),
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

async function getStrategyVolume(args: ToolArgs): Promise<ToolResult> {
  const rockId = rockIdOf(args);
  if (rockId === null) return unavailable(HOSTED_REASONS.badRockId);

  const view = await readStrategy(rockId);
  if (view.state !== "REAL") {
    return unavailable(view.state === "UNAVAILABLE" ? view.reason : "strategy not readable", {
      rockId,
    });
  }
  const value = view.value;

  const anyScanned = value.streams.some((stream) => stream.fees !== undefined);
  if (!anyScanned) {
    const reason =
      value.streams.find((stream) => stream.feesUnavailable !== undefined)?.feesUnavailable ??
      "no stream's swap history could be scanned";
    return unavailable(reason, { rockId });
  }

  return json({
    status: "ok",
    source: strategySource(rockId),
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

/** Dispatches one `tools/call`. Unknown names and thrown errors both come back as `unavailable`. */
export async function callHostedTool(name: string, args: ToolArgs): Promise<ToolResult> {
  try {
    switch (name) {
      case "get_rock_status":
        return await getRockStatus(args);
      case "get_strategy_fees":
        return await getStrategyFees(args);
      case "explain_recent_fees":
        return await explainRecentFees(args);
      case "get_strategy_volume":
        return await getStrategyVolume(args);
      case "trace_transaction":
        return await traceTransaction(args);
      case "get_server_metrics":
        return await getServerMetrics();
      case "simulate_cross_chain_intent":
        return unavailable(HOSTED_REASONS.noBridge);
      case "optimize_idle_yield":
        return unavailable(HOSTED_REASONS.noIdleYield);
      default:
        return unavailable(`unknown tool: ${name}`);
    }
  } catch (error) {
    return errorResult(name, error);
  }
}
