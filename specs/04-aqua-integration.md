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

## Initial strategy direction

The MVP should use a two-token strategy with predictable behaviour and testnet liquidity. The starting candidate is a small constant-product or fixed-rate strategy using test tokens representing USDC and WETH.

Strategy data should include:

- maker Rock Account;
- rock ID or hashed rock ID;
- token pair;
- fee in basis points;
- pricing parameters;
- unique salt;
- optional expiry.

A strategy is immutable after it is shipped. Parameter changes therefore require docking the old strategy and shipping a new one.

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

## Custom Aqua App versus SwapVM

### Custom Aqua App

Advantages:

- strongest demonstration of Aqua understanding;
- rock ID can be a first-class strategy field;
- tailored events and fee logic;
- distinctive technical submission.

Costs:

- more contract code and security risk;
- callback and reentrancy behaviour must be implemented carefully;
- more testing required.

### SwapVM program

Advantages:

- faster route to a working swap;
- less custom contract surface;
- existing programmable instructions.

Costs:

- weaker Bank Rock-specific protocol contribution;
- object attribution may live mainly in metadata;
- less compelling for an Aqua-focused prize.

Current recommendation: begin with a SwapVM proof of compatibility, then implement a minimal custom Bank Rock Aqua App only if the core tap-to-trade flow is stable.

## Financial correctness

- Aqua does not itself guarantee passive yield.
- Earnings in the MVP come from executed trading fees.
- No projected APY should be displayed.
- Yield-bearing assets may be explored after the hackathon.
- All token and strategy contracts must be allowlisted for the demo.
- The UI must expose liquidity and smart-contract risk.
