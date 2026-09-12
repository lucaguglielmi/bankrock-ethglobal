#!/usr/bin/env node
/**
 * Trade with a Bank Rock as an AI agent, through Privy's Agent Wallet CLI (spec 20 Part 13).
 *
 * What this does, in order:
 *
 *   1. asks the Privy Agent Wallet CLI which Ethereum address the agent controls;
 *   2. optionally claims 0.01 Sepolia ETH for gas from Bank Rock's faucet;
 *   3. reads the rock's live Aqua strategy and a quote from the public Bank Rock API;
 *   4. builds two transactions — `approve(periphery, amountIn)` and
 *      `XYCSwapTaker.swapExactIn(...)` — with the calldata a human visitor's wallet would send;
 *   5. sends each through `privy-agent-wallet rpc` (`eth_sendTransaction` on Sepolia), waiting
 *      for the approval to be mined before the swap so the swap's gas estimate sees the allowance;
 *   6. re-reads the strategy and prints what changed, with Etherscan links.
 *
 * The agent never holds a private key: the CLI signs inside Privy's enclave under the human's
 * approval (agents.privy.io). This script holds no key either, and no address is written into
 * it — the periphery comes from `--taker` or `AQUA_TAKER_ADDRESS`, everything else from the
 * rock's own API responses (D-015).
 *
 * `--dry-run` stops after step 4 and prints the plan as JSON, so the encoding can be checked
 * without a wallet, a chain or a CLI. That mode is what the unit tests exercise.
 *
 * Run from `web/` so that `viem` resolves:
 *
 *   node scripts/agent/trade-with-rock.mjs --rock 1 --token USDC --amount 1 --taker 0x…
 */

import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  createPublicClient,
  decodeAbiParameters,
  encodeFunctionData,
  formatUnits,
  getAddress,
  http,
  isAddress,
  parseUnits,
} from "viem";
import { sepolia } from "viem/chains";

export const SEPOLIA_CAIP2 = "eip155:11155111";
export const EXPLORER = "https://sepolia.etherscan.io";

/** The two tokens every Bank Rock strategy trades, by decimals. Symbols come from the API. */
export const TOKEN_DECIMALS = { USDC: 6, WETH: 18 };

/** Five minutes, like the web app (`lib/aqua/calls.ts` DEFAULT_SWAP_DEADLINE_SECONDS). */
export const DEFAULT_DEADLINE_SECONDS = 300;

const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
];

/** `XYCSwapTaker.swapExactIn` — the periphery a visitor calls (contracts/aqua/NOTES.md §5). */
const TAKER_SWAP_ABI = [
  {
    type: "function",
    name: "swapExactIn",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "strategy",
        type: "tuple",
        components: [
          { name: "maker", type: "address" },
          { name: "token0", type: "address" },
          { name: "token1", type: "address" },
          { name: "feeBps", type: "uint256" },
          { name: "salt", type: "bytes32" },
        ],
      },
      { name: "zeroForOne", type: "bool" },
      { name: "amountIn", type: "uint256" },
      { name: "minAmountOut", type: "uint256" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
];

/* -------------------------------------------------------------------------- */
/* Pure helpers — exported for the tests                                       */
/* -------------------------------------------------------------------------- */

/** The strategy bytes are `abi.encode(XYCSwap.Strategy)`: five 32-byte words (spec 04). */
export function decodeStrategyBytes(strategyHex) {
  const [maker, token0, token1, feeBps, salt] = decodeAbiParameters(
    [
      { type: "address" },
      { type: "address" },
      { type: "address" },
      { type: "uint256" },
      { type: "bytes32" },
    ],
    strategyHex,
  );
  return { maker: getAddress(maker), token0: getAddress(token0), token1: getAddress(token1), feeBps, salt };
}

/** `amountOut` less `slippageBps`, floored. 100 bps = 1 %. */
export function minOutWithSlippage(amountOut, slippageBps) {
  const bps = BigInt(slippageBps);
  if (bps < 0n || bps > 10_000n) throw new Error("slippageBps must be between 0 and 10000");
  return (amountOut * (10_000n - bps)) / 10_000n;
}

/**
 * The two transactions a visitor sends from a plain wallet: the approval to the periphery, then
 * the swap that names the agent as the recipient. Mirrors `buildSwapCall` in the web app.
 */
export function buildTradePlan({ strategyHex, tokenIn, amountIn, minAmountOut, recipient, taker, deadline }) {
  const fields = decodeStrategyBytes(strategyHex);
  const periphery = getAddress(taker);
  const to = getAddress(recipient);
  const sell = getAddress(tokenIn);
  const zeroForOne = sell === fields.token0;
  if (!zeroForOne && sell !== fields.token1) {
    throw new Error(`${sell} is not one of this strategy's two tokens`);
  }
  if (amountIn <= 0n) throw new Error("amountIn must be positive");
  if (minAmountOut <= 0n) throw new Error("minAmountOut must be positive — never pass 0 from a script");
  if (to === periphery || /^0x0{40}$/.test(to)) throw new Error("recipient must be a real wallet");

  return {
    zeroForOne,
    tokenIn: sell,
    tokenOut: zeroForOne ? fields.token1 : fields.token0,
    deadline,
    approve: {
      to: sell,
      data: encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: "approve", args: [periphery, amountIn] }),
    },
    swap: {
      to: periphery,
      data: encodeFunctionData({
        abi: TAKER_SWAP_ABI,
        functionName: "swapExactIn",
        args: [fields, zeroForOne, amountIn, minAmountOut, to, deadline],
      }),
    },
  };
}

/** The JSON body `privy-agent-wallet rpc` expects for one Sepolia transaction. */
export function rpcRequestFor(tx) {
  return {
    method: "eth_sendTransaction",
    caip2: SEPOLIA_CAIP2,
    params: { transaction: { to: tx.to, data: tx.data, value: "0x0" } },
  };
}

const TX_HASH = /0x[0-9a-fA-F]{64}/;
const ADDRESS = /0x[0-9a-fA-F]{40}/;

/** The first transaction hash in the CLI's output, whatever its framing. */
export function txHashFrom(output) {
  const match = TX_HASH.exec(output ?? "");
  return match ? match[0] : null;
}

/** The first EVM address in `list-wallets` output. */
export function ethereumAddressFrom(output) {
  const match = ADDRESS.exec(output ?? "");
  return match ? getAddress(match[0]) : null;
}

/** `--flag value` and `--flag` parsing, nothing cleverer. */
export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

/* -------------------------------------------------------------------------- */
/* The CLI and the API                                                         */
/* -------------------------------------------------------------------------- */

/** How the CLI is invoked. Override with PRIVY_AGENT_CLI, e.g. "privy-agent-wallet". */
function cliCommand() {
  const configured = process.env.PRIVY_AGENT_CLI?.trim();
  if (configured) return configured.split(/\s+/);
  return ["pnpm", "--package=@privy-io/agent-wallet-cli", "dlx", "privy-agent-wallet"];
}

function runCli(args, input) {
  const [command, ...prefix] = cliCommand();
  const result = spawnSync(command, [...prefix, ...args], {
    input,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw new Error(`could not run the Privy Agent Wallet CLI: ${result.error.message}`);
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (result.status !== 0) {
    throw new Error(`privy-agent-wallet ${args[0]} exited with ${result.status}:\n${output.trim()}`);
  }
  return output;
}

async function getJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  const body = await response.json().catch(() => null);
  if (!body) throw new Error(`${url} did not answer with JSON (${response.status})`);
  return body;
}

function log(line) {
  process.stderr.write(`${line}\n`);
}

/* -------------------------------------------------------------------------- */
/* Main                                                                        */
/* -------------------------------------------------------------------------- */

export async function main(argv) {
  const args = parseArgs(argv);
  const rockId = String(args.rock ?? "").trim();
  if (!/^[1-9][0-9]*$/.test(rockId)) throw new Error("--rock <id> is required");
  const tokenIn = String(args.token ?? "USDC").toUpperCase();
  if (tokenIn !== "USDC" && tokenIn !== "WETH") throw new Error("--token must be USDC or WETH");
  const amountText = String(args.amount ?? "1");
  if (!/^\d+(\.\d+)?$/.test(amountText)) throw new Error("--amount must be a decimal amount");
  const slippageBps = Number(args["slippage-bps"] ?? 100);
  const streamIndex = String(args.stream ?? "0");
  const api = String(args.api ?? process.env.BANKROCK_API_URL ?? "https://bank-rock.com").replace(/\/+$/, "");
  const takerRaw = args.taker ?? process.env.AQUA_TAKER_ADDRESS ?? process.env.NEXT_PUBLIC_AQUA_TAKER_ADDRESS;
  if (!takerRaw || !isAddress(String(takerRaw))) {
    throw new Error("--taker 0x… (or AQUA_TAKER_ADDRESS) is required: the XYCSwapTaker periphery address");
  }
  const taker = getAddress(String(takerRaw));
  const dryRun = args["dry-run"] === true;

  // 1. Whose wallet is trading.
  let agent;
  if (args.from) {
    if (!isAddress(String(args.from))) throw new Error("--from must be an address");
    agent = getAddress(String(args.from));
  } else if (dryRun) {
    // No CLI in a dry run; a placeholder recipient keeps the plan buildable and obviously fake.
    agent = getAddress("0x00000000000000000000000000000000000000a1");
  } else {
    log("→ asking the Privy Agent Wallet CLI for the agent's address");
    agent = ethereumAddressFrom(runCli(["list-wallets"]));
    if (!agent) throw new Error("the CLI listed no Ethereum wallet; run `privy-agent-wallet login` first");
  }
  log(`  agent wallet: ${agent}`);

  // 2. Gas, if asked.
  if (args.faucet === true && !dryRun) {
    log("→ claiming 0.01 Sepolia ETH from the Bank Rock faucet");
    const response = await fetch(`${api}/api/faucet`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: agent }),
    });
    const body = await response.json().catch(() => ({}));
    log(`  faucet: ${response.status} ${JSON.stringify(body)}`);
  }

  // 3. The rock's strategy and a quote — from the same API the web app uses.
  log(`→ reading rock #${rockId}'s strategy`);
  const strategyReply = await getJson(`${api}/api/rocks/${rockId}/strategy?fees=0`);
  if (strategyReply.state !== "REAL") {
    throw new Error(`rock #${rockId} has no readable strategy: ${strategyReply.reason ?? "unknown"}`);
  }
  const view = strategyReply.value;
  const stream = view.streams.find((s) => String(s.streamIndex) === streamIndex) ?? view.streams[0];
  if (!stream?.strategy) throw new Error(`rock #${rockId} has no live stream ${streamIndex}`);
  const fields = decodeStrategyBytes(stream.strategy);
  const sellAddress = tokenIn === "USDC" ? fields.token0 : fields.token1;
  const amountIn = parseUnits(amountText, TOKEN_DECIMALS[tokenIn]);
  const tokenOut = tokenIn === "USDC" ? "WETH" : "USDC";

  log(`→ quoting ${amountText} ${tokenIn} against stream ${stream.streamIndex} (fee ${stream.feeBps} bps)`);
  const quoteReply = await getJson(
    `${api}/api/rocks/${rockId}/quote?maker=${view.maker}&streamIndex=${stream.streamIndex}&tokenIn=${tokenIn}&amountIn=${amountText}`,
  );
  if (quoteReply.state !== "REAL") throw new Error(`no quote: ${quoteReply.reason ?? "unknown"}`);
  const amountOut = BigInt(quoteReply.value.amountOut);
  const minAmountOut = minOutWithSlippage(amountOut, slippageBps);
  log(`  quote: ${formatUnits(amountOut, TOKEN_DECIMALS[tokenOut])} ${tokenOut} (${quoteReply.value.source}); floor ${formatUnits(minAmountOut, TOKEN_DECIMALS[tokenOut])}`);

  // 4. The plan.
  const deadline = BigInt(Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_SECONDS);
  const plan = buildTradePlan({
    strategyHex: stream.strategy,
    tokenIn: sellAddress,
    amountIn,
    minAmountOut,
    recipient: agent,
    taker,
    deadline,
  });
  const summary = {
    rockId,
    maker: view.maker,
    streamIndex: String(stream.streamIndex),
    agent,
    tokenIn,
    tokenOut,
    amountIn: amountIn.toString(),
    quotedAmountOut: amountOut.toString(),
    minAmountOut: minAmountOut.toString(),
    deadline: deadline.toString(),
    transactions: [rpcRequestFor(plan.approve), rpcRequestFor(plan.swap)],
  };
  if (dryRun) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return summary;
  }

  // 5. Send, in order, waiting for the approval so the swap's estimate sees the allowance.
  const client = createPublicClient({
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC_URL || undefined),
  });
  const hashes = [];
  for (const [label, tx] of [["approve", plan.approve], ["swapExactIn", plan.swap]]) {
    log(`→ ${label}: sending through the Privy Agent Wallet CLI`);
    const output = runCli(["rpc"], `${JSON.stringify(rpcRequestFor(tx))}\n`);
    const hash = txHashFrom(output);
    if (!hash) throw new Error(`the CLI returned no transaction hash for ${label}:\n${output.trim()}`);
    log(`  ${label}: ${EXPLORER}/tx/${hash}`);
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 180_000 });
    if (receipt.status !== "success") throw new Error(`${label} reverted: ${EXPLORER}/tx/${hash}`);
    hashes.push({ label, hash, explorer: `${EXPLORER}/tx/${hash}` });
  }

  // 6. What changed.
  const after = await getJson(`${api}/api/rocks/${rockId}/strategy?fees=0`);
  const afterStream = after.state === "REAL" ? after.value.streams.find((s) => s.strategyHash === stream.strategyHash) : null;
  const result = {
    ...summary,
    transactions: hashes,
    reserveBefore: stream.virtual,
    reserveAfter: afterStream?.virtual ?? null,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

const invokedDirectly =
  typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
