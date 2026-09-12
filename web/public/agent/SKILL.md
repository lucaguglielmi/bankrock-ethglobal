# Bank Rock — trade with a rock as an AI agent

*Fetch this file, then follow it. It is served at https://bank-rock.com/agent/SKILL.md and lives at
`web/public/agent/SKILL.md` in the repository. Spec: `specs/20-privy-earn-and-hackathon-qualification.md` Part 12.*

A Bank Rock is a physical NFC rock that is a market maker: its account holds USDC and WETH on
Ethereum Sepolia and exposes them through a 1inch Aqua strategy. Anyone — including an agent with
a wallet of its own — can trade against it. This skill gives you that wallet through Privy's
Agent Wallet CLI and walks you through one trade.

You never hold a private key. The CLI signs inside Privy's enclave, under a human's approval at
https://agents.privy.io. Bank Rock's servers never see your wallet either: the trade is two
ordinary transactions from your address.

## 0. Prerequisites

- Node 22 and `pnpm`. Run everything from the `web/` directory of the repository, so `viem` resolves.
- The address of Bank Rock's `XYCSwapTaker` periphery on Sepolia, from the operator:
  `export AQUA_TAKER_ADDRESS=0x…` (it is also `NEXT_PUBLIC_AQUA_TAKER_ADDRESS` in the web app's environment).
- Optional: `export SEPOLIA_RPC_URL=https://…` for receipt polling. Without it viem's public Sepolia transport is used.

## 1. Get a wallet (once)

```bash
pnpm --package=@privy-io/agent-wallet-cli dlx privy-agent-wallet login
```

The CLI prints a device code and a URL. **Show the human the code prominently** and wait: they
open the URL, sign in, and confirm the code matches. Do not run `login` in an ephemeral sandbox
(Claude Desktop, Cowork, Claude on the web) — ask the human to run it on their machine. The
session lives in the OS keychain (or `~/.privy/session.json`) for 30 days.

```bash
pnpm --package=@privy-io/agent-wallet-cli dlx privy-agent-wallet list-wallets
```

Note your Ethereum address.

## 2. Get test funds

- **Gas:** Bank Rock's faucet sends 0.01 Sepolia ETH to any address, three times a day per IP.
  The trade script does this for you with `--faucet`, or:
  `curl -X POST https://bank-rock.com/api/faucet -H 'content-type: application/json' -d '{"address":"0xYOUR_ADDRESS"}'`
- **USDC on Sepolia:** https://faucet.circle.com (20 USDC every two hours). Send it to your address.
  To sell WETH instead, wrap Sepolia ETH at the WETH contract the rock's strategy names.

## 3. Read the rock before you trade

Everything is public and needs no key:

```bash
curl https://bank-rock.com/api/rocks/1/strategy?fees=0
curl "https://bank-rock.com/api/rocks/1/quote?maker=0xROCK_ACCOUNT&streamIndex=0&tokenIn=USDC&amountIn=1"
```

`strategy` answers `{ state: "REAL", value: { maker, streams: [{ streamIndex, feeBps, strategy, virtual, executable }] } }`
or `{ state: "UNAVAILABLE", reason }`. Never trade against an `UNAVAILABLE` rock, and never invent a
number it did not give you. `executable` is what you can actually buy right now.

The Bank Rock MCP server (`mcp/`) exposes the same reads as tools, if your client speaks MCP.

## 4. Trade

Dry run first — it prints the two transactions and sends nothing:

```bash
node scripts/agent/trade-with-rock.mjs --rock 1 --token USDC --amount 1 --taker "$AQUA_TAKER_ADDRESS" --dry-run
```

Then for real:

```bash
node scripts/agent/trade-with-rock.mjs --rock 1 --token USDC --amount 1 --slippage-bps 100 --faucet --taker "$AQUA_TAKER_ADDRESS"
```

The script asks the CLI for your address, claims gas, reads the strategy and a quote, sets the
floor at the quote minus your slippage, sends `approve(periphery, amountIn)` through
`privy-agent-wallet rpc`, waits for it to be mined, sends `swapExactIn(...)` the same way, waits
again, and prints a JSON summary with both Etherscan links and the strategy's balances before and
after. Relay that summary to the human verbatim; do not paraphrase amounts.

Flags: `--token USDC|WETH`, `--amount <decimal>`, `--slippage-bps <n>` (default 100), `--stream <n>`
(default 0), `--from 0x…` (skip `list-wallets`), `--api <origin>` (default https://bank-rock.com),
`PRIVY_AGENT_CLI="privy-agent-wallet"` to use a globally installed CLI.

## 5. Rules

- Say what you are about to send before you send it, in the human's terms: "selling 1 USDC to rock #1 for at least 0.00049 WETH".
- One trade per instruction. Never loop on trades, never raise the amount on your own.
- If any step answers `UNAVAILABLE`, stop and report the reason. There is no fallback path.
- The rock's owner earns the strategy's fee on your trade, inside their own reserve. That is the point of the object.
