# Aqua Protocol Summary

## What is Aqua?
Aqua is a shared liquidity layer protocol built by 1inch that enables liquidity providers (LPs) to allocate balances across multiple trading strategies without fragmenting their liquidity into different isolated pools.

## Key Features & Benefits
1. **Capital Efficiency & Shared Liquidity**: In traditional AMMs, liquidity is locked in isolated pools (Pool A, Pool B, etc.). With Aqua, an LP maintains a single token approval (e.g., in a single wallet) and can distribute "virtual balances" across multiple strategies (AMM A, AMM B, etc.) simultaneously without redeploying or splitting the actual capital.
2. **Self-Custody (No Custody)**: Tokens remain in the LP's wallet. Aqua only tracks virtual balance allocations (allowances). Funds always stay with the owner until pulled during a swap.
3. **Unified Liquidity**: A single approval enables participation in an unlimited number of strategies.
4. **Immutability & Safety**: Once a strategy is shipped (activated), its parameters and initial liquidity become immutable. To change parameters, the strategy is docked (deactivated) and a new one is shipped. This reduces bugs related to state management.
5. **Pull/Push Execution**: Aqua pulls tokens from the LP's wallet to the trader during a swap, and the trader pushes tokens to the LP's wallet. 

## Integration with Bank Rock
- **Bank Rock**: A physical, NFC-enabled object that acts as the physical interface for a self-custodial, giftable liquidity account.
- **Why Aqua for Bank Rock?** Aqua allows the physical rock's dedicated wallet (the "Maker" or Rock Account) to hold all its tokens in one place. One approved balance can support multiple strategies (like a constant-product AMM, or a fixed-price offer) without the Bank Rock needing to deposit its funds into separate external protocol pools. 
- **User Experience**: The owner taps the rock and sees their actual wallet balance, alongside the "virtual amounts" exposed by each strategy. This makes the rock feel like a unified, living economic object rather than a fragmented set of DeFi deposits.
- **Lifecycle**: 
  - Opening a stream in Bank Rock = `ship` in Aqua
  - Closing a stream in Bank Rock = `dock` in Aqua
  - Rock Account = `Maker` in Aqua
  - Trading/Visitor Interaction = Swapping through the Aqua app.
