import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `/api/mcp` — the hosted MCP endpoint, driven exactly as a client drives it: JSON-RPC over
 * POST through the real SDK transport, with the chain stubbed at the same seams the rock page
 * uses (`readRock`, `readReserves`, `readRockStrategyView`, the public client). What is under
 * test is the protocol surface a phone client sees — initialize with instructions, the tool
 * list, a tool call that reads, a tool call that must refuse — and the HTTP behaviour around it.
 */

const REGISTRY = `0x${"aa".repeat(20)}` as const;
const OWNER = `0x${"bb".repeat(20)}` as const;
const ACCOUNT = `0x${"cc".repeat(20)}` as const;
const USDC = `0x${"44".repeat(20)}` as const;
const WETH = `0x${"55".repeat(20)}` as const;

function sampleHash(pair: string): `0x${string}` {
  return `0x${pair.repeat(32)}`;
}

const readRock = vi.fn();
const readReserves = vi.fn();
const readRockStrategyView = vi.fn();
const getTransactionReceipt = vi.fn();
const consumeIpRateLimit = vi.fn();

vi.mock("@/lib/rock-account", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rock-account")>("@/lib/rock-account");
  return {
    ...actual,
    readRock: (...args: unknown[]) => readRock(...args),
    readReserves: (...args: unknown[]) => readReserves(...args),
  };
});

vi.mock("@/lib/aqua/strategy-view", () => ({
  readRockStrategyView: (...args: unknown[]) => readRockStrategyView(...args),
}));

vi.mock("@/lib/chain", async () => {
  const actual = await vi.importActual<typeof import("@/lib/chain")>("@/lib/chain");
  return {
    ...actual,
    addresses: { ...actual.addresses, registry: REGISTRY, usdc: USDC, weth: WETH },
    tokens: {
      USDC: { symbol: "USDC", decimals: 6, address: USDC },
      WETH: { symbol: "WETH", decimals: 18, address: WETH },
    },
    requireAddress: (key: string) =>
      key === "registry" ? { state: "REAL", value: REGISTRY } : actual.requireAddress(key as never),
    getPublicClient: () => ({
      getTransactionReceipt: (...args: unknown[]) => getTransactionReceipt(...args),
    }),
  };
});

vi.mock("@/lib/rate-limit", () => ({
  consumeIpRateLimit: (...args: unknown[]) => consumeIpRateLimit(...args),
}));

const ENDPOINT = "https://bank-rock.com/api/mcp";

type JsonRpc = { jsonrpc: "2.0"; id?: number; method: string; params?: unknown };

async function post(body: JsonRpc | JsonRpc[], headers: Record<string, string> = {}) {
  const { POST } = await import("./route");
  const response = await POST(
    new Request(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...headers,
      },
      body: JSON.stringify(body),
    }),
  );
  const text = await response.text();
  return { status: response.status, body: text === "" ? null : JSON.parse(text), response };
}

function initialize(id = 1): JsonRpc {
  return {
    jsonrpc: "2.0",
    id,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "phone", version: "0" },
    },
  };
}

function call(name: string, args: Record<string, unknown> = {}, id = 3): JsonRpc {
  return { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } };
}

/** The tool's own JSON payload, out of the text content block. */
function payload(body: { result: { content: { text: string }[] } }) {
  return JSON.parse(body.result.content[0].text);
}

describe("POST /api/mcp", () => {
  beforeEach(() => {
    vi.resetModules();
    readRock.mockReset();
    readReserves.mockReset();
    readRockStrategyView.mockReset();
    getTransactionReceipt.mockReset();
    consumeIpRateLimit.mockReset();
    consumeIpRateLimit.mockResolvedValue({ allowed: true, enforced: true, remaining: 119 });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("initializes statelessly and briefs the client with the endpoint's own URL", async () => {
    const { status, body, response } = await post(initialize());
    expect(status).toBe(200);
    expect(response.headers.get("mcp-session-id")).toBeNull();
    expect(body.result.serverInfo).toEqual({ name: "bankrock-oracle-mcp", version: "2.1.0" });
    expect(body.result.capabilities).toEqual({ tools: {} });
    expect(body.result.instructions).toContain(ENDPOINT);
    expect(body.result.instructions).toContain("read-only");
    expect(body.result.instructions).not.toMatch(/\bAPY\b|\bAPR\b/);
  });

  it("acknowledges a notification with 202 and no body", async () => {
    const { status, body } = await post({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(status).toBe(202);
    expect(body).toBeNull();
  });

  it("lists the eight public tools, all read-only, and neither operator tool", async () => {
    const { HOSTED_TOOL_NAMES, OPERATOR_ONLY_TOOL_NAMES } = await import("@/lib/mcp/tools");
    const { status, body } = await post({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect(status).toBe(200);
    const tools = body.result.tools as { name: string; annotations?: { readOnlyHint?: boolean } }[];
    expect(tools.map((tool) => tool.name)).toEqual(HOSTED_TOOL_NAMES);
    expect(tools).toHaveLength(8);
    for (const tool of tools) expect(tool.annotations?.readOnlyHint).toBe(true);
    for (const name of OPERATOR_ONLY_TOOL_NAMES) {
      expect(tools.some((tool) => tool.name === name)).toBe(false);
    }
  });

  it("get_rock_status reads the registry and the Rock Account's balances", async () => {
    readRock.mockResolvedValue({
      state: "REAL",
      value: {
        rockId: "3",
        owner: OWNER,
        smartAccount: ACCOUNT,
        uidHash: sampleHash("ee"),
        state: "awake",
        lost: false,
        handover: null,
      },
    });
    readReserves.mockResolvedValue({
      state: "REAL",
      value: { usdc: BigInt(5_000_000), weth: BigInt(5_000_000_000_000_000) },
    });

    const { status, body } = await post(call("get_rock_status", { rockId: "3" }));
    expect(status).toBe(200);
    expect(body.result.isError).toBeUndefined();
    const result = payload(body);
    expect(result.status).toBe("ok");
    expect(result.registryAddress).toBe(REGISTRY);
    expect(result.rock).toMatchObject({ rockId: "3", state: "awake", owner: OWNER, smartAccount: ACCOUNT });
    expect(result.rockAccountBalances.status).toBe("ok");
    expect(result.rockAccountBalances.tokens).toEqual([
      expect.objectContaining({ symbol: "USDC", raw: "5000000", formatted: "5" }),
      expect.objectContaining({ symbol: "WETH", raw: "5000000000000000", formatted: "0.005" }),
    ]);
    expect(result.explorerUrl).toBe(`https://sepolia.etherscan.io/address/${ACCOUNT}`);
    expect(readReserves).toHaveBeenCalledWith(ACCOUNT);
  });

  it("get_rock_status refuses a malformed rock id without touching the chain", async () => {
    const { status, body } = await post(call("get_rock_status", { rockId: "three" }));
    expect(status).toBe(200);
    expect(payload(body)).toMatchObject({ status: "unavailable" });
    expect(payload(body).reason).toMatch(/decimal integer/);
    expect(readRock).not.toHaveBeenCalled();
  });

  it("get_rock_status relays the registry's reason and never a balance when the read fails", async () => {
    readRock.mockResolvedValue({ state: "UNAVAILABLE", reason: "The registry could not be read on Sepolia: the network could not be reached" });
    const { body } = await post(call("get_rock_status", { rockId: "3" }));
    expect(payload(body)).toEqual({
      status: "unavailable",
      reason: "The registry could not be read on Sepolia: the network could not be reached",
      rockId: "3",
    });
    expect(readReserves).not.toHaveBeenCalled();
  });

  it("get_strategy_fees relays the shared read and reports a fee rate, never a return", async () => {
    readRockStrategyView.mockResolvedValue({
      state: "REAL",
      value: {
        rockId: "3",
        maker: ACCOUNT,
        app: `0x${"33".repeat(20)}`,
        aqua: `0x${"22".repeat(20)}`,
        actual: { usdc: "5000000", weth: "5000000000000000" },
        allowance: { usdc: "2000000", weth: "300000000000000" },
        streams: [
          {
            strategyHash: sampleHash("ab"),
            feeBps: "30",
            streamIndex: "0",
            label: "Wide",
            virtual: { usdc: "2000000", weth: "300000000000000" },
            executable: { usdc: "2000000", weth: "300000000000000" },
            fees: { earned: { usdc: "0", weth: "0" }, swapCount: 0, fromBlock: "1", toBlock: "2", complete: true },
          },
        ],
      },
    });

    const { body } = await post(call("get_strategy_fees", { rockId: "3" }));
    const result = payload(body);
    expect(readRockStrategyView).toHaveBeenCalledWith({ rockId: "3", fees: true });
    expect(result.status).toBe("ok");
    expect(result.source).toBe("https://bank-rock.com/api/rocks/3/strategy?fees=1");
    expect(result.streams).toEqual([
      expect.objectContaining({ label: "Wide", feeBpsRate: "30", feesEarned: { usdc: "0", weth: "0" } }),
    ]);
    expect(JSON.stringify(result)).not.toMatch(/\bAPY\b|\bAPR\b/);
  });

  it("get_strategy_volume answers unavailable when no stream could be scanned", async () => {
    readRockStrategyView.mockResolvedValue({
      state: "REAL",
      value: {
        rockId: "3",
        maker: ACCOUNT,
        app: `0x${"33".repeat(20)}`,
        aqua: `0x${"22".repeat(20)}`,
        actual: { usdc: "0", weth: "0" },
        allowance: { usdc: "0", weth: "0" },
        streams: [
          {
            strategyHash: sampleHash("ab"),
            feeBps: "30",
            streamIndex: "0",
            virtual: { usdc: "0", weth: "0" },
            executable: { usdc: "0", weth: "0" },
            feesUnavailable: "the RPC refused the log range",
          },
        ],
      },
    });
    const { body } = await post(call("get_strategy_volume", { rockId: "3" }));
    expect(payload(body)).toEqual({
      status: "unavailable",
      reason: "the RPC refused the log range",
      rockId: "3",
    });
  });

  it("trace_transaction keeps the RPC's own error text out of the answer", async () => {
    getTransactionReceipt.mockRejectedValue(
      new Error("HTTP request failed. URL: https://rpc.example/v2/secret-key"),
    );
    const { body } = await post(call("trace_transaction", { hash: sampleHash("01") }));
    const result = payload(body);
    expect(result.status).toBe("unavailable");
    expect(result.reason).not.toContain("secret-key");
    expect(result.hash).toBe(sampleHash("01"));
  });

  it("the two unbuilt tools say so, and an unknown tool is not an error", async () => {
    const bridge = payload((await post(call("simulate_cross_chain_intent", { rockId: "3" }))).body);
    expect(bridge.status).toBe("unavailable");
    expect(bridge.reason).toMatch(/bridg/);

    const idle = payload((await post(call("optimize_idle_yield", { rockId: "3" }))).body);
    expect(idle.status).toBe("unavailable");

    const { status, body } = await post(call("query_logs", { limit: 1 }));
    expect(status).toBe(200);
    expect(payload(body)).toEqual({ status: "unavailable", reason: "unknown tool: query_logs" });
  });

  it("refuses an initialize batched with anything else, as the lifecycle requires", async () => {
    const { status, body } = await post([initialize(1), { jsonrpc: "2.0", id: 2, method: "tools/list" }]);
    expect(status).toBe(400);
    expect(body.error.message).toMatch(/Only one initialization request/);
  });

  it("answers a batch of ordinary requests in one JSON array", async () => {
    const { status, body } = await post([
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      call("optimize_idle_yield", { rockId: "3" }, 3),
    ]);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.map((message: { id: number }) => message.id).sort()).toEqual([2, 3]);
  });

  it("rejects a client that does not accept both JSON and event streams, as the protocol requires", async () => {
    const { status } = await post(initialize(), { accept: "application/json" });
    expect(status).toBe(406);
  });

  it("is metered, and refuses over the limit with a JSON-RPC error", async () => {
    consumeIpRateLimit.mockResolvedValue({ allowed: false, enforced: true, remaining: 0 });
    const { status, body, response } = await post(initialize());
    expect(status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(body.error.message).toBe("Too Many Requests");
    expect(consumeIpRateLimit).toHaveBeenCalledWith(expect.any(Request), "mcp", 120, 60_000);
  });
});

describe("GET and DELETE /api/mcp", () => {
  it("offer no stream and no session: 405 with Allow: POST and a pointer to the page", async () => {
    const { GET, DELETE } = await import("./route");
    for (const handler of [GET, DELETE]) {
      const response = await handler();
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
      const body = await response.json();
      expect(body.error.message).toContain("/mcp");
    }
  });
});
