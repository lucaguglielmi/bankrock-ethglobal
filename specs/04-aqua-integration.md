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
| XYCSwap (AquaApp) | our deploy | Reference constant-product app, vendored unmodified |
| XYCSwapTaker | our deploy | Bank Rock taker periphery (D-030) |
| SwapVM router | — | **Not deployed.** Documented alternative only (D-030) |
| USDC | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` | Circle testnet USDC, 6 decimals |
| WETH | `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14` | |

## Interface (Fact — from `src/Aqua.sol`)

```solidity
function ship(address app, bytes calldata strategy, address[] calldata tokens, uint256[] calldata amounts) external returns (bytes32 strategyHash);
function dock(address app, bytes32 strategyHash, address[] calldata tokens) external;
function safeBalances(address maker, address app, bytes32 strategyHash, address token0, address token1) external view returns (uint256, uint256);
```

The other three `IAqua` functions matter too, and are used:

```solidity
function rawBalances(address maker, address app, bytes32 strategyHash, address token) external view returns (uint248, uint8);
function pull(address maker, bytes32 strategyHash, address token, uint256 amount, address to) external;
function push(address maker, address app, bytes32 strategyHash, address token, uint256 amount) external;
```

- The maker approves tokens **to Aqua**, once. Not to the app.
- `app` is an `AquaApp` implementation. Ours is the reference `examples/apps/XYCSwap.sol`
  constant-product app (D-030); the SwapVM router is documented but not deployed.
- `strategyHash = keccak256(strategy)`. The public rock ID is embedded in `strategy` as the salt,
  which is how "rock identity as strategy salt" below is realised.
- Events are `Shipped`, `Docked`, `Pulled`, `Pushed`. **No Aqua event parameter is `indexed`** —
  filtering by topic matches nothing and decoding with an `indexed` ABI fails.
- There is no JavaScript SDK for building SwapVM *programs*; `@1inch/swap-vm` is not on npm.
  That is the reason the router path was not taken, and it does not affect the XYCSwap path,
  whose strategy is a plain ABI-encoded struct.

## Bank Rock mapping

**Decision D-030.** The app is the reference constant-product `XYCSwap`, deployed by us against
the canonical Aqua, plus one Bank Rock periphery contract on the taker side. Everything below was
read out of the vendored source and is exercised by `contracts/test/aqua/*.t.sol`; the long form
is [`../contracts/contracts/aqua/NOTES.md`](../contracts/contracts/aqua/NOTES.md).

| Bank Rock concept | Aqua reality |
| --- | --- |
| Rock Account | Maker. Holds every token, in its own wallet, the whole time |
| Token reserves | `ERC20.balanceOf(rockAccount)` — one balance, shared by every stream |
| Liquidity stream | `XYCSwap` plus one immutable strategy, addressed by `strategyHash` |
| Rock identity | `salt` inside the strategy: `keccak256(SALT_DOMAIN, rockId, streamIndex)` |
| Opening a stream | `Aqua.ship(app, strategy, [USDC, WETH], [a, b])`. Moves no tokens |
| Closing a stream | `Aqua.dock(app, strategyHash, [USDC, WETH])`. Returns nothing — see below |
| Visitor interaction | `XYCSwapTaker.swapExactIn(...)`, which calls the app (D-030) |
| Water level | actual / virtual / executable, three different numbers — never summed |
| Flow history | `Shipped`, `Docked`, `Pulled`, `Pushed` on Aqua. **No parameter is indexed** |

The three actors, stated once because the approval direction depends on it: **Aqua custodies
nothing** — it tracks per-strategy allowances and moves tokens between wallets; **the app holds
nothing** — it is pricing logic plus two calls into Aqua; **the maker keeps everything**. So the
maker approves **Aqua**, once, for every strategy — never the app. The taker, by contrast,
approves the **periphery**. Getting either backwards is a revert, not a silent loss.

**The house stream (D-038).** Bank Rock itself ships one large USDC/WETH strategy on the same
app from an operator-controlled maker. Rocks funded with one token convert half of it against
that stream inside their own ship operation, through the taker periphery (spec 21). It is an
ordinary maker strategy; the app reads it like any other, and its 5 bps fee stays in the house
reserve.

## Strategy direction

**Decision: constant-product strategy — realised as `XYCSwap.Strategy` (D-030)**

```
struct Strategy { address maker; address token0; address token1; uint256 feeBps; bytes32 salt; }

SALT_DOMAIN  = keccak256("bankrock.aqua.strategy.v1")
salt         = keccak256(abi.encode(SALT_DOMAIN, uint256 rockId, uint256 streamIndex))
strategy     = abi.encode(Strategy)     // 160 bytes, five 32-byte words
strategyHash = keccak256(strategy)      // what Aqua stores balances under
```

`strategy` is opaque to Aqua: `ship` hashes the bytes and stores balances under the hash. The app
gives them meaning — it decodes the tuple and recomputes the hash on **every** call. One wrong
field is a different hash with no balances, so `safeBalances` reverts. Nothing is stored on the
app, and the fee rate is therefore authenticated by the chain: a strategy whose `feeBps` differs
by one basis point is a different strategy.

This buys one property the interface depends on: **a rock's strategies are addressable without an
indexer.** From a public rock id and the Rock Account address a client recomputes `salt`,
`strategy` and `strategyHash` for `streamIndex = 0, 1, …` and calls `safeBalances`. A revert means
"not shipped"; a success means "live, and here are the virtual balances". No database, no event
scan, no stored hash. Mirrored implementations: `web/src/lib/aqua/strategy.ts` and
`contracts/test/aqua/base/BankRockAquaBase.sol`, pinned to the same literals by tests on both
sides.

What this spec asked for and the reference app does **not** provide: **pricing parameters** beyond
`feeBps`, and an **optional expiry**. The curve is fixed at `x·y = k` over whatever balances were
shipped. That is a limit of the reference app, not of the encoding; those fields would live in a
custom app, which D-006 defers.

A strategy is immutable after it is shipped — re-shipping the same bytes reverts
`StrategiesMustBeImmutable`, and a docked strategy can never be revived. Changing the fee means
shipping a new strategy under a new `streamIndex`.

### Ship, dock, and what "virtual balance" means

- **Shipping moves no tokens.** It is an allowance over balances that stay in the maker's wallet:
  `balanceOf(aqua)` is zero before and after, always.
- **Ship does not check the wallet.** A maker may ship 10 WETH while holding 3. A virtual balance
  is an upper bound, never a guarantee.
- **`dock` returns nothing**, because nothing was ever taken. It zeroes the virtual balances and
  marks them docked; the wallet balance is untouched. For Flow H this is the whole point: docking
  *is* the withdrawal, and the interface must not promise an incoming transfer. `dock` must list
  every token of the strategy in one call or it reverts `DockingShouldCloseAllTokens`.
- `safeBalances` **reverts** unless both tokens are in an active strategy. That revert is the "is
  this stream live?" probe, so it must be handled as `UNAVAILABLE`, never as an error.

### Why a taker needs a periphery contract

`XYCSwap.swapExactIn` pulls the output from the maker's wallet to the taker, then calls
`IXYCSwapCallback(msg.sender).xycSwapCallback(...)` — back into whoever called it — which must
answer by approving Aqua and calling `Aqua.push(...)`; the app then verifies the maker's virtual
input balance rose, or reverts `MissingTakerAquaPush`. **An EOA cannot answer that callback, and
a plain Safe would push nothing.** So a plain wallet cannot swap against the app at all.

`XYCSwapTaker` is that periphery and is the one Bank Rock contract on the Aqua path: it pulls the
input from the taker, calls the app naming the taker as `to`, and fulfils the callback. It holds
no funds between transactions, gates its public callback on a transient in-progress slot, and
contains no pricing or accounting logic. The visitor's transaction is two calls —
`tokenIn.approve(taker, amountIn)` then `XYCSwapTaker.swapExactIn(...)` — which is one sponsored
Safe batch, so a visitor with no ETH can trade.

### Where the fee goes

There is **no fee accumulator anywhere.** The app prices the trade off
`amountIn·(10000−feeBps)/10000` while the *gross* `amountIn` is pushed into the maker's wallet and
virtual balance. The fee is the slice of the input the curve never paid out. Therefore:

- fees accrue **inside the rock's own reserve**, and appear as growth of the invariant `k`;
- there is nothing to claim, and `feesAccrued` is not a field anyone can read;
- the **rate** shown is `feeBps`, read from the strategy;
- the **cumulative amount** is `Σ (Pushed.amount · feeBps / 10000)` over that strategy's `Pushed`
  events, excluding the one the ship emits per token at launch. It is a chain read, not a model;
- when the RPC cannot serve the log range, show the rate and mark the cumulative `UNAVAILABLE`.
  Never derive it from balance deltas: inventory moves with the trade direction, so
  `virtual − shipped` is P&L, not fees.

None of this is an APY and none of it may be annualised (D-004).

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

**How each is read (D-030):**

| | Source |
| --- | --- |
| actual | `ERC20.balanceOf(rockAccount)` — one balance, shared by every stream |
| virtual | `Aqua.safeBalances(maker, app, strategyHash, USDC, WETH)` — per stream, an allowance |
| executable | `min(virtual, balanceOf(maker), allowance(maker, aqua))` |

A swap on one stream lowers the *other's* executable amount while leaving its virtual balance
untouched. A UI that reads only `safeBalances` reports liquidity that cannot be filled;
`SharedReserve.t.sol` pins exactly this.

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

**Resolution (D-030): the fallback is the path.** The strategy *envelope* was not the blocker —
it is settled on both paths (spec 09 open question 12) — but the SwapVM *program* bytes are
assembled in Solidity only, and the router is 20 KB of virtual machine to deploy, verify and
learn against 5 KB of constant-product app that maps directly onto the strategy this spec chose.

The deviation this costs, stated rather than buried: **one Bank Rock contract is on the Aqua
path.** `XYCSwapTaker` is periphery, not strategy logic — it prices nothing and accounts for
nothing — but it is ours, and "zero custom contract logic" is no longer literally true. It is
unavoidable: without it, no wallet can swap against the app (see "Why a taker needs a periphery
contract"). A custom Bank Rock *Aqua App* remains deferred, as D-006 says.

If the router path is ever revisited, the contract to deploy is **`AquaSwapVMRouter`**, not plain
`SwapVMRouter`: the latter carries no `AquaOpcodes` and cannot read or move Aqua balances. Steps,
parameters and the exact `lib/aqua` diff are in `contracts/scripts/deploy-swapvm-router.md`.

## Quoting

The 1inch Swap API does not serve testnets (E-5); `/api/quote` and `1INCH_API_KEY` are deleted.

On the path taken, the equivalent of "the router's own `quote()`" is
**`XYCSwap.quoteExactIn(strategy, zeroForOne, amountIn)`**, and the guarantee is the same: it is
the identical code path `swapExactIn` executes, on the same block's balances. No external price
API, and no price feed anywhere in the path.

Two qualifications:

- `web/src/lib/aqua/quote.ts` mirrors the same integer arithmetic for a preview as the user
  types. It is a preview, never an authority; the app is read before submitting.
- **`quoteExactOut` is not the inverse of `quoteExactIn`.** The reference app takes its fee off
  the *input* when quoting an exact input and off the *output* when quoting an exact output, so a
  round trip comes back roughly `feeBps` high — 0.3% on a 30 bps strategy, not a rounding unit.
  That asymmetry is upstream's. Bank Rock's swap path is exact-in only, so it never reaches a
  user, and the preview mirrors it deliberately rather than "fixing" it.

## Financial correctness and Idle Yield

- **Idle Yield Generation:** The Rock Account will automatically deploy idle stablecoins into a yield protocol (e.g., Aave v3 or Morpho) to earn passive yield.
- The AI Oracle (MCP) monitors the yield and can notify the owner to switch strategies.
- Aqua does not itself guarantee passive yield; earnings in Aqua come from executed trading fees.
- All token, yield, and strategy contracts must be allowlisted for the demo.
- The UI must expose liquidity and smart-contract risk cleanly.
