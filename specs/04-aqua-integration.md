# Aqua integration

## Why Aqua

Aqua allows a liquidity provider to keep tokens in its wallet while assigning virtual balances to strategies. One approved balance can support multiple strategies without depositing funds into separate protocol pools.

Official references:

- [Aqua protocol repository](https://github.com/1inch/aqua)
- [1inch Aqua overview](https://1inch.com/aqua)
- [SwapVM repository](https://github.com/1inch/swap-vm)

## Deployment (D-023, verified 2026-09-12)

| Contract | Address on Ethereum Sepolia | Status |
| --- | --- | --- |
| Aqua | `0x1111113ccf1426a8e30e2bff5e005d929bf6a90a` | Canonical; bytecode identical to mainnet |
| SwapVM router | — | Not deployed by 1inch on any testnet; **we deploy it** (see spec 16 §1.2) |
| USDC | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` | Circle testnet USDC, 6 decimals |
| WETH | `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14` | |

## Interface (Fact — from `src/Aqua.sol`)

```solidity
function ship(address app, bytes calldata strategy, address[] calldata tokens, uint256[] calldata amounts) external returns (bytes32 strategyHash);
function dock(address app, bytes32 strategyHash, address[] calldata tokens) external;
function safeBalances(address maker, address app, bytes32 strategyHash, address token0, address token1) external view returns (uint256, uint256);
```

- The maker approves tokens **to Aqua**, once. Not to the app.
- `app` is an `AquaApp` implementation — our SwapVM router in Aqua mode, or the reference
  `examples/apps/XYCSwap.sol` constant-product app.
- `strategyHash = keccak256(strategy)`. The public rock ID is embedded in `strategy`, which is
  how "rock identity as strategy salt" below is realised.
- There is no JavaScript SDK for building SwapVM programs; strategy bytes are produced by a
  Solidity script or a TypeScript port of `ProgramBuilder`.

## Bank Rock mapping

| Bank Rock concept | Aqua concept |
| --- | --- |
| Rock Account | Maker |
| Token reserves | ERC-20 balances remaining with maker |
| Liquidity stream | Aqua app plus immutable strategy |
| Rock identity | Strategy salt or immutable strategy field |
| Opening a stream | ship |
| Closing a stream | dock |
| Visitor interaction | Swap through the Aqua app |
| Water level | Actual and available maker balances |
| Flow history | Aqua and app events |

## Strategy direction

**Decision: Constant-product strategy**

The MVP will use a simple, two-token constant-product (AMM-like) strategy. This provides predictable behaviour and is easy to reason about during a fast-paced hackathon. The strategy will use test tokens representing USDC and WETH.

Strategy data should include:

- maker Rock Account;
- rock ID or hashed rock ID;
- token pair;
- fee in basis points;
- pricing parameters;
- unique salt;
- optional expiry.

A strategy is immutable after it is shipped. Parameter changes therefore require docking the old strategy and shipping a new one.

## Cross-Chain Abstraction

**Decision: Intent-Based Bridging (LayerZero / Across)**

To maximize UX, users should not care which chain the Bank Rock resides on. We will integrate a cross-chain intent protocol (e.g., Across, LayerZero, or CCIP) in combination with our Paymaster.
- If a user taps a rock on Base, they can buy tokens from it using funds on Arbitrum or Optimism in a single, seamless click.
- The cross-chain bridge handles the transport and swaps, fulfilling the Aqua strategy on the destination chain.

## Showing shared liquidity

A single strategy would technically integrate Aqua but would fail to communicate its distinctive value. The demo should ship at least two strategies from the same Rock Account and overlapping token balance.

Candidate pair:

1. A simple AMM-like strategy.
2. A fixed-price offer or second pricing curve using the same reserve.

The UI must show:

- actual wallet balance;
- virtual amount exposed by each strategy;
- current executable availability;
- the fact that virtual allocations are not separate deposited balances.

The design must not add virtual strategy values together and present the result as owned capital.

## SwapVM vs Custom Aqua App

**Decision: SwapVM program for MVP**

Given the time constraints of the hackathon, we will use an existing **SwapVM** program instead of deploying a custom Aqua App. 

Advantages:
- Faster route to a working swap.
- Less custom contract surface to test and secure.
- Immediate compatibility with standard Aqua interactions.

A Custom Bank Rock Aqua App is explicitly deferred to post-hackathon development.

**Amendment (D-023):** because no SwapVM router exists on any testnet, "existing SwapVM program"
means a router we deploy ourselves from the unmodified 1inch source. If building SwapVM program
bytes without an SDK proves too slow, the fallback is the reference `XYCSwap` AquaApp from the
Aqua repo — still zero custom contract logic, and a closer match to "constant-product".

## Quoting

The 1inch Swap API does not serve testnets. Quotes come from the router's own `quote()` view,
which is guaranteed to return exactly what `swap()` will execute. No external price API.

## Financial correctness and Idle Yield

- **Idle Yield Generation:** The Rock Account will automatically deploy idle stablecoins into a yield protocol (e.g., Aave v3 or Morpho) to earn passive yield.
- The AI Oracle (MCP) monitors the yield and can notify the owner to switch strategies.
- Aqua does not itself guarantee passive yield; earnings in Aqua come from executed trading fees.
- All token, yield, and strategy contracts must be allowlisted for the demo.
- The UI must expose liquidity and smart-contract risk cleanly.
