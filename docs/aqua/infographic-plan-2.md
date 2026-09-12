# Infographic Plan 2: How Aqua Works (The Bank Rock Flow)

**Title:** The Flow of Liquidity: How Aqua Powers Bank Rock
**Theme:** A step-by-step visual journey of a trade happening through Bank Rock and Aqua. Focus on the mechanics (Ship, Dock, Pull, Push) but keep it accessible.

## Visual Flow & Sections

### 1. The Maker: Seeding the Rock
- **Visual:** The Rock Owner taps the physical Bank Rock with their phone. A UI pops up showing a single pool of tokens (e.g., USDC and WETH). 
- **Action:** The owner approves the tokens for Aqua. 
- **Concept:** *The Maker (Rock Account)* holds the funds. No tokens leave the wallet.

### 2. Shipping a Strategy (Virtual Balances)
- **Visual:** A blueprint or "hologram" of a strategy (e.g., an AMM curve) is projected from the Bank Rock. We see "Virtual Balances" being allocated to this strategy, while the physical tokens remain firmly in the rock.
- **Action:** The Rock *Ships* (activates) the strategy on Aqua.
- **Concept:** Aqua acts as a registry. It records the rules and virtual allocations, but holds no funds. The strategy is now immutable.

### 3. The Taker: A Visitor Trades
- **Visual:** A visitor (The Taker) taps the Bank Rock to buy some WETH. 
- **Action:** The visitor initiates a swap through the Aqua App (SwapVM).
- **Concept:** The visitor interacts with the Rock's active strategy.

### 4. Execution: Pull and Push
- **Visual:** A dynamic exchange animation. 
  - **Pull:** WETH is pulled directly from the Bank Rock's wallet to the visitor.
  - **Push:** USDC is pushed directly from the visitor's wallet into the Bank Rock's wallet.
- **Concept:** Tokens only move during the exact moment of the trade. Peer-to-peer execution powered by Aqua's Pull/Push mechanics.

### 5. Adjusting the Flow (Docking)
- **Visual:** The owner wants to change the fee. The old hologram disappears (*Docking*), and a new, updated hologram appears (*Shipping* a new strategy). The tokens in the rock never move during this update.
- **Concept:** Because Aqua strategies are immutable, you safely *Dock* the old one and *Ship* a new one. No gas is wasted moving actual tokens around.
