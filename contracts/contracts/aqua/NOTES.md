# How Aqua and XYCSwap actually work

This is the answer to step 2 of Phase 3 in [`specs/15-exit-demo-mode.md`](../../../specs/15-exit-demo-mode.md):
*"Resolve the strategy encoding (E-4)."* Everything below was read out of the vendored source at
commit `9c5c42e5` (see [`UPSTREAM.md`](./UPSTREAM.md)) and is exercised by
`contracts/test/aqua/*.t.sol`. Nothing here is remembered, inferred, or carried over from a
README.

We build on the spec 04 fallback: the reference constant-product `XYCSwap` AquaApp. Its encoding
is settled below and has no remaining unknown.

The SwapVM hypothesis in spec 16 §1.5 item 4 — *"`strategy` is the ABI-encoded order and
`strategyHash == swapVM.hash(order)`"* — was checked anyway and is **true** (§8.8); the reason we
did not take that path is the program bytes, not the envelope. See
[`../../scripts/deploy-swapvm-router.md`](../../scripts/deploy-swapvm-router.md).

---

## 1. The three actors

| Actor | Who it is for a rock | What it holds |
| --- | --- | --- |
| `Aqua` | the canonical Sepolia deployment `0x1111113ccf1426a8e30e2bff5e005d929bf6a90a` | **nothing.** It never custodies a token; it only tracks per-strategy allowances and moves tokens between wallets |
| `app` (`XYCSwap`) | our deployment of the reference constant-product AquaApp | nothing; it is pure pricing logic plus two calls into Aqua |
| `maker` | the Rock Account (a Safe) | every token, in its own wallet, the whole time |

The maker approves **Aqua**, once, for all strategies — never the app
(`token.approve(aqua, amount)`; spec 16 §1.5 item 2, and `Aqua.pull` does
`safeTransferFrom(maker, to, amount)` with Aqua as spender).

## 2. Exact signatures

`src/interfaces/IAqua.sol` (matches spec 04's Interface section and spec 16 §1.5 item 1):

```solidity
function ship(address app, bytes calldata strategy, address[] calldata tokens, uint256[] calldata amounts)
    external returns (bytes32 strategyHash);
function dock(address app, bytes32 strategyHash, address[] calldata tokens) external;
function rawBalances(address maker, address app, bytes32 strategyHash, address token)
    external view returns (uint248 balance, uint8 tokensCount);
function safeBalances(address maker, address app, bytes32 strategyHash, address token0, address token1)
    external view returns (uint256 balance0, uint256 balance1);
function pull(address maker, bytes32 strategyHash, address token, uint256 amount, address to) external;
function push(address maker, address app, bytes32 strategyHash, address token, uint256 amount) external;
```

Events — **none of their parameters are `indexed`**:

```solidity
event Shipped(address maker, address app, bytes32 strategyHash, bytes strategy);
event Docked(address maker, address app, bytes32 strategyHash);
event Pulled(address maker, address app, bytes32 strategyHash, address token, uint256 amount);
event Pushed(address maker, address app, bytes32 strategyHash, address token, uint256 amount);
```

`examples/apps/XYCSwap.sol`:

```solidity
struct Strategy { address maker; address token0; address token1; uint256 feeBps; bytes32 salt; }

function quoteExactIn(Strategy calldata strategy, bool zeroForOne, uint256 amountIn)
    external view returns (uint256 amountOut);
function quoteExactOut(Strategy calldata strategy, bool zeroForOne, uint256 amountOut)
    external view returns (uint256 amountIn);
function swapExactIn(Strategy calldata strategy, bool zeroForOne, uint256 amountIn,
                     uint256 amountOutMin, address to, bytes calldata takerData)
    external returns (uint256 amountOut);
function swapExactOut(Strategy calldata strategy, bool zeroForOne, uint256 amountOut,
                      uint256 amountInMax, address to, bytes calldata takerData)
    external returns (uint256 amountIn);
constructor(IAqua aqua_);
function AQUA() external view returns (address);   // immutable, from AquaApp
```

Custom errors worth decoding in the UI: `IAqua.StrategiesMustBeImmutable(address,bytes32)`,
`IAqua.SafeBalancesForTokenNotInActiveStrategy(address,address,bytes32,address)`,
`IAqua.DockingShouldCloseAllTokens(address,bytes32)`,
`XYCSwap.InsufficientOutputAmount(uint256,uint256)`,
`AquaApp.MissingTakerAquaPush(address,uint256,uint256)`.

## 3. The strategy bytes

`strategy` is opaque to Aqua: `ship` does `strategyHash = keccak256(strategy)` and stores balances
under it. The app is what gives the bytes meaning, and XYCSwap reads them as
`abi.decode(strategy, (Strategy))` — it recomputes `keccak256(abi.encode(strategy))` on every
call and asks Aqua for the balances at that hash. A wrong field ⇒ a different hash ⇒
`safeBalances` reverts. Nothing is stored on the app.

Bank Rock's encoding — implemented identically in `web/src/lib/aqua/strategy.ts` and
`test/aqua/base/BankRockAquaBase.sol`:

```
SALT_DOMAIN = keccak256("bankrock.aqua.strategy.v1")
            = 0x81ab6ad9698f8f0486cca1eb375761a4383f19d2b2ea00b9c211b6b10541fdcf

salt        = keccak256(abi.encode(bytes32 SALT_DOMAIN, uint256 rockId, uint256 streamIndex))

strategy    = abi.encode(XYCSwap.Strategy({
                  maker:  rockAccount,   // the rock's Safe
                  token0: USDC,          // by role, not by address order
                  token1: WETH,
                  feeBps: <30 | 5 | …>,  // 1 bps = 0.01%
                  salt:   salt
              }))                        // 160 bytes, five 32-byte words

strategyHash = keccak256(strategy)
```

This is spec 04's *"rock identity as strategy salt"*, and it has one property the UI depends on:
**a rock's strategies are addressable without an indexer.** Given a public rock id and the Rock
Account address, the client recomputes `salt`, `strategy` and `strategyHash` for
`streamIndex = 0, 1, …` and calls `safeBalances`. A revert means "not shipped"; a success means
"live, and here are the virtual balances". No database, no event scan, no stored hash.

Spec 04 also lists an *optional expiry* and *pricing parameters* as strategy fields. `XYCSwap.Strategy`
has no expiry and no pricing parameter beyond `feeBps` — the curve is fixed at `x·y = k` over
whatever the shipped balances are. That is a limit of the reference app, not of our encoding; a
custom app (explicitly deferred by D-006) is where those would live.

## 4. Ship, dock, and what "virtual balance" means

`ship` writes one packed slot per token: `Balance { uint248 amount; uint8 tokensCount }` keyed by
`(maker, app, strategyHash, token)`. `tokensCount` doubles as the state flag — `0` = never
shipped, `n` = active with `n` tokens, `0xff` = docked. Consequences, all covered by tests:

- **Shipping moves no tokens.** It is an allowance over balances that stay in the maker's wallet.
  `usdc.balanceOf(aqua) == 0` before and after, always.
- **A strategy is immutable.** Re-shipping the same bytes reverts `StrategiesMustBeImmutable`, and
  a docked strategy can never be revived (its slot is `0xff`, not `0`). Changing the fee means
  shipping a new strategy with a new `streamIndex`.
- **Ship does not check the wallet.** A maker may ship 10 WETH while holding 3. Virtual balance is
  therefore an upper bound, never a guarantee — see §6.
- **Dock returns nothing**, because nothing was ever taken. It zeroes the virtual balances and
  marks them docked; the maker's wallet balance is untouched. For Flow H ("Cash In") this matters:
  docking *is* the withdrawal, and the UI must not promise an incoming transfer. `dock` must list
  every token of the strategy in one call or it reverts `DockingShouldCloseAllTokens`.
- `safeBalances` reverts unless **both** tokens are in an active strategy — which is precisely the
  "is this strategy live?" probe, so a revert must be handled as `UNAVAILABLE`, not as an error.

## 5. How a swap executes — and why a taker needs a periphery contract

`XYCSwap.swapExactIn(strategy, zeroForOne, amountIn, amountOutMin, to, takerData)`:

1. `strategyHash = keccak256(abi.encode(strategy))`, then
   `AQUA.safeBalances(maker, app, strategyHash, tokenIn, tokenOut)` for the curve's reserves;
2. `amountOut = (amountIn·(10000−feeBps)/10000 · balanceOut) / (balanceIn + amountIn·(10000−feeBps)/10000)`,
   checked against `amountOutMin`;
3. `AQUA.pull(maker, strategyHash, tokenOut, amountOut, to)` — output leaves the **maker's wallet**
   for the taker, and the maker's virtual `tokenOut` balance drops by `amountOut`;
4. **`IXYCSwapCallback(msg.sender).xycSwapCallback(...)`** — the app calls back into whoever called
   it, which must respond by approving Aqua and calling
   `AQUA.push(maker, app, strategyHash, tokenIn, amountIn)`;
5. `_safeCheckAquaPush` verifies the maker's virtual `tokenIn` balance rose to
   `balanceIn + amountIn`, else reverts `MissingTakerAquaPush`.

Step 4 is the load-bearing surprise: **the taker must be a contract implementing
`IXYCSwapCallback`.** An EOA cannot (Solidity's `extcodesize` check on a no-return external call
reverts), and a plain Safe cannot either (its fallback handler has no such selector and would push
nothing). Upstream never notices this because its own test contract is the callback.

`XYCSwapTaker.sol` is that periphery, and it is the only Bank Rock contract in this directory: it
pulls `amountIn` from the taker (who approves *it*), calls `swapExactIn` naming the taker as `to`,
and fulfils the callback. It holds no funds between transactions, gates the public callback on a
transient "swap in progress" slot, and contains no pricing or accounting logic. It is the taker
analogue of Uniswap's `SwapRouter`. The visitor's transaction is therefore two calls —
`USDC.approve(taker, amountIn)` then `XYCSwapTaker.swapExactIn(...)` — which is one Safe batch.

## 6. Where the fee goes, and what "earned fees" means

There is **no fee accumulator anywhere**. `_quoteExactIn` prices the trade off
`amountIn·(10000−feeBps)/10000`, while step 4 pushes the *gross* `amountIn` into the maker's
wallet and virtual balance. The fee is the slice of the input the curve never paid out. Therefore:

- fees accrue **inside the maker's own reserve** — both the real ERC-20 balance and the strategy's
  virtual balance — and show up as growth of `virtualUsdc · virtualWeth` (the invariant `k`);
- there is nothing to "claim", and `feesAccrued` is not a field anyone can read;
- a per-swap fee is exactly `amountIn · feeBps / 10000`, in the input token, and `amountIn` is the
  `Pushed(maker, app, strategyHash, token, amount)` event of that swap.

**How the UI should show "earned fees" (spec 08 must-have 8, spec 15 Phase 3 acceptance):**

1. the **rate** is `feeBps`, read from the strategy — and it is authenticated by the chain, because
   a strategy whose `feeBps` differs by one basis point hashes differently and has no balances;
2. the **cumulative amount** is `Σ (Pushed.amount · feeBps / 10000)` over that strategy's `Pushed`
   events, counting only the pushes a swap made — a `Pushed` whose transaction also carries a
   `Pulled` for the same strategy — so the one `ship` emits per token at launch and a maker's own
   top-up (`Aqua.push` from the Rock Account, the dashboard's *Edit*) are both excluded. This is
   `readAccruedFees()` in `web/src/lib/aqua/read.ts`, and it is a chain read, not a model;
3. when the RPC cannot serve the log range, show the fee **rate** and mark the cumulative figure
   `UNAVAILABLE`. Do not derive it from balance deltas: inventory also moves with the trade
   direction, so `virtual − shipped` is P&L, not fees, and presenting it as fees would be a
   fabricated number of exactly the kind spec 15 exists to remove.

None of this is an APY and none of it may be annualised (D-004).

## 7. Availability: the number the position card must show

Three different quantities, and spec 04 forbids conflating them:

| | how to read it |
| --- | --- |
| **actual** | `ERC20.balanceOf(rockAccount)` — one balance, shared by every strategy |
| **virtual** | `Aqua.safeBalances(maker, app, strategyHash, USDC, WETH)` — per strategy, an allowance |
| **executable** | `min(virtual, ERC20.balanceOf(maker), ERC20.allowance(maker, aqua))` |

Two strategies over one wallet can have virtual balances that sum to more than the wallet holds;
that sum is not capital and must never be rendered as a total. A swap on one strategy lowers the
*other's* executable amount while leaving its virtual balance untouched — `SharedReserve.t.sol`
pins exactly this, and a UI that reads only `safeBalances` would be reporting liquidity that
cannot be filled.

## 8. Contradictions with the specs, recorded

1. **Spec 04's mapping table says "Closing a stream → dock" returns funds.** It does not: funds
   never left. Flow H's step 3 ("the interface docks the active Aqua strategies") is right, step 4
   ("assets are routed to…") is a separate transfer the maker makes from its own wallet.
2. **Spec 16 §1.5 item 1 lists the Aqua events but not their `indexed`-ness.** No Aqua event
   parameter is indexed. `web/src/lib/chain/abi/aqua.ts` currently declares `maker`, `app` and
   `strategyHash` as `indexed: true` on `Shipped` and `Docked`; filtering by those topics matches
   nothing on the real contract and decoding a real log with that ABI fails. That ABI needs the
   `indexed` flags removed (owner: whoever maintains `lib/chain`). `web/src/lib/aqua/events.ts`
   carries a corrected copy in the meantime.
3. **Spec 04's "Quoting" section names `SwapVMRouter.quote()`.** On the XYCSwap path the
   equivalent is `XYCSwap.quoteExactIn(strategy, zeroForOne, amountIn)`, and the guarantee is the
   same: it is the identical code path `swapExactIn` executes, on the same block's balances.
4. **Spec 04 asks for pricing parameters and an optional expiry in the strategy.** `XYCSwap.Strategy`
   supports neither (see §3).
5. **D-006 / spec 04 "SwapVM program for MVP" is superseded by its own D-023 amendment.** What is
   deployed is the reference AquaApp, which is still zero custom strategy logic — the deviation is
   `XYCSwapTaker`, which is periphery, not a strategy, and is unavoidable (§5).
6. **Spec 16 §1.1's two Aqua rows look swapped.** Read from Sepolia on 2026-09-12:
   `0x1111113ccf1426a8e30e2bff5e005d929bf6a90a` (5,619 bytes) answers `owner()` with
   `0x4134e66d52EfC4C77DD8Ccc952D87b9E92E0C352` and its dispatcher carries `transferOwnership`,
   `renounceOwnership`, `rescueFunds`, `multicall` and `simulate` alongside the six `IAqua`
   selectors — that is an **`AquaRouter`** (`Aqua` + `Simulator` + `Multicall` + `Rescuable`), not
   plain `Aqua`. `0x499943e74fb0ce105688beee8ef2abec5d936d31` (6,251 bytes), which the spec calls
   the AquaRouter, has no `owner()` at all. Nothing in our integration changes — the canonical
   address implements every function we call, identically — but the labels are the wrong way
   round, and an `owner` exists on the contract holding our makers' allowances, which is worth
   knowing. All six `IAqua` selectors are present at the canonical address:
   `ship f50b870f`, `dock 28defc17`, `rawBalances 6d58b4cc`, `safeBalances 65f2fe14`,
   `pull b00bbd10`, `push 47d72768`.
7. **The vendored `Aqua.sol` does not compile to the deployed bytecode** under our settings
   (3,891 bytes against 5,619, same selectors, different jump table) — upstream deployed it with
   different compiler settings or a different tag. That is fine, because we never deploy it: the
   local copy is a source-faithful test double, not a bytecode-identical one. Do not treat a local
   `Aqua` deployment as a reproduction of the canonical one.
8. **Spec 16 §1.5 item 4's SwapVM hypothesis is now proven** — `strategy = abi.encode(order)` and
   `strategyHash == swapVM.hash(order)`, straight out of `swap-vm`'s own
   `test/solidity/base/AquaStrategyBuilders.sol`. It is written up, with the Sepolia deployment
   steps and what it would change in `lib/aqua`, in `contracts/scripts/deploy-swapvm-router.md`.
   The open piece on that path is the *program* bytes, not the strategy envelope.
