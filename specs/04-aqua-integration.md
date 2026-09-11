# Aqua integration

## Why Aqua

Aqua allows a liquidity provider to keep tokens in its wallet while assigning virtual balances to strategies. One approved balance can support multiple strategies without depositing funds into separate protocol pools.

Official references:

- [Aqua protocol repository](https://github.com/1inch/aqua)
- [1inch Aqua overview](https://1inch.com/aqua)
- [SwapVM repository](https://github.com/1inch/swap-vm)

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

## Financial correctness and Idle Yield

- **Idle Yield Generation:** The Rock Account will automatically deploy idle stablecoins into a yield protocol (e.g., Aave v3 or Morpho) to earn passive yield.
- The AI Oracle (MCP) monitors the yield and can notify the owner to switch strategies.
- Aqua does not itself guarantee passive yield; earnings in Aqua come from executed trading fees.
- All token, yield, and strategy contracts must be allowlisted for the demo.
- The UI must expose liquidity and smart-contract risk cleanly.
