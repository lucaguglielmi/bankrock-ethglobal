# Balance and ship — one tap from a one-token deposit to a trading rock

## Purpose

A rock is funded by sending it tokens (spec 02 Flow B). Most people will send one token, usually
USDC, and a constant-product stream needs two. Today the owner has to obtain WETH elsewhere, send
it to the Rock Account, and only then ship. This spec removes that detour: **the conversion
happens inside the single sponsored operation the owner already signs when shipping, and that
signature is silent for embedded wallets.** The owner taps *Start earning*, sees what will happen,
and the rock is trading.

Status vocabulary as in [`15-exit-demo-mode.md`](./15-exit-demo-mode.md). Decisions: **D-038**
(the conversion venue) and **D-039** (silent signing), both in [`09-decisions.md`](./09-decisions.md).

Not in scope, and stated so nobody reads it in: automatic conversion *on deposit*, with no tap.
Nothing can sign while the page is closed, and the only honest way to do it is a session key,
which is the post-hackathon item D-010. The trigger here is the tap the owner already makes.

---

## Part 1 — Behaviour

### 1.1 When it applies

The ship sheet (`web/src/components/rock/ship-strategy-sheet.tsx`) opens with the rock's actual
balances. It offers *Balance first* when **either token is below the share the stream needs**:

| Reserve | Sheet |
| --- | --- |
| USDC and WETH both present | As today. Balancing is offered as an unchecked option, with the resulting split shown. |
| Only USDC (or only WETH) | *Balance first* is pre-selected. The sheet says exactly what changes hands: "5 USDC becomes 2.5 USDC + 0.0011 WETH before shipping, via Bank Rock's reserve (fee 0.05%)". |
| Neither, or too little to ship | *Start earning* stays disabled with the reason; the fund sheet is offered. |

The owner can untick *Balance first* and ship one-sided, which Aqua allows; the sheet then says the
stream will only trade in one direction until the other side exists.

### 1.2 What one tap does

One sponsored UserOperation from the Rock Account, atomic — either every call lands or none:

1. `USDC.approve(taker, amountIn)`
2. `XYCSwapTaker.swapExactIn(houseStrategy, USDC → WETH, amountIn, minOut, to = Rock Account, deadline)`
3. `USDC.approve(Aqua, usdcToShip)` and `WETH.approve(Aqua, wethToShip)`
4. `Aqua.ship(app, rockStrategy, [USDC, WETH], [usdcToShip, wethToShip])`

with

- `amountIn` = half of the token that is in surplus (by value at the quoted price; see 1.4);
- `minOut` = `quoteExactIn(houseStrategy, amountIn) × (1 − tolerance)`, tolerance **0.5 %**
  (50 bps, `SLIPPAGE_TOLERANCE_BPS` in `web/src/components/rock/trade-panel.tsx`),
  `deadline` = now + 5 minutes — the same rules the visitor swap uses (D-030; the deadline is audit F-8);
- `usdcToShip` = balance − amountIn, `wethToShip` = **minOut**, not the quote: the ship records
  virtual balances, and the rock is guaranteed to hold at least `minOut` when step 4 runs. Any
  extra WETH the swap delivers above `minOut` stays in the Rock Account as reserve headroom.

Step 2 is the visitor-swap path (`buildSwapCall` in `web/src/lib/aqua`) with the rock's own
account as the taker. The taker periphery already supports a Safe as caller; no contract changes.

### 1.3 The venue — D-038

The counterparty is a **house stream**: a large USDC/WETH constant-product strategy on our own
`XYCSwap` app, shipped by an operator-controlled maker. It is an ordinary Aqua strategy that
happens to belong to Bank Rock, and the app reads it exactly as it reads a rock's stream.

Why not an external DEX: on Sepolia there is no USDC/WETH pool with reliable liquidity for
Circle's USDC, and on any network an external dependency is a second audit surface. The house
stream keeps the conversion inside the contracts reviewed in spec 19, and on mainnet the same
code can point at any Aqua maker — or several, chosen by best quote — without a redesign.

Configuration (D-034: non-secret, in `web/wrangler.jsonc` `vars`):

| Variable | Value | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_HOUSE_MAKER_ADDRESS` | The maker that shipped the house stream | Unset ⇒ *Balance first* is `UNAVAILABLE` with the reason, the rest of the sheet works |
| `NEXT_PUBLIC_HOUSE_STREAM_FEE_BPS` | `5` | Disclosed in the sheet; the fee stays in the house reserve |

The house strategy bytes are `abi.encode(XYCSwap.Strategy{maker, USDC, WETH, feeBps, salt})` with
`salt = keccak256(abi.encode(keccak256("bankrock.aqua.house.v1"), 0))`, pinned by a TypeScript
test and a Solidity test the same way the rock salt is (D-030). The client recomputes the bytes
and the hash; it never trusts a hash from configuration.

### 1.4 The split

Aim for equal value on both sides after the swap at the quoted price. For a constant-product
venue the exact input is the positive root of a quadratic in the house reserves; the
implementation may use the closed form or a three-step bisection on `quoteExactIn`. Either way
the sheet shows the *resulting* pair before the tap, and the assertion in tests is on the
result: after balancing, `|value(usdc) − value(weth)| / total ≤ 2 %` at the quoted price.

### 1.5 Silent signing — D-039

The operation is signed by the owner's **Privy embedded wallet without Privy's confirmation
sheet**: `PrivyProvider` config `embeddedWallets.showWalletUIs: false`. The acknowledgement is the
app's own tap on a button whose sheet states the exact effect. External wallets (MetaMask,
WalletConnect) keep their own confirmation; the app cannot and must not suppress it.

Rules that make this safe, and that a reviewer checks:

- The app signs only inside a handler that starts from a user tap on a control whose label
  names the action (Awaken, Start earning, Give, Cash in, Retire, Trade). Never from an effect,
  a timer, a route change or a network event.
- Every such sheet shows the on-chain effect in tokens before the tap. No sheet signs more
  than one UserOperation per tap.
- The change applies to every signature the app requests, not only this one: awakening, gifting
  and archiving lose the same duplicate prompt. Spec 05 gains the rule above under "Signing".

---

## Part 2 — Operator: the house stream

1. Choose the house maker. On Sepolia the relayer key may double as maker; on any value-bearing
   network the maker is its own key with only this job.
2. Fund it: USDC from the Circle faucet (repeat claims), WETH by wrapping. Target 200 USDC and
   the WETH equivalent, so a rock's half-swap moves the house price by well under 1 %.
3. Ship: `npm run house:ship` in `web/` (to be written with this spec: approve both tokens to
   Aqua, `ship` with the house strategy bytes, print the strategy hash), then commit the maker
   address to `wrangler.jsonc` and deploy.
4. Watch: `bash scripts/check-live.sh` gains a line reading the house stream's `safeBalances`
   and reporting red when either side is below the amount a typical rock would swap.

The house reserve is Bank Rock's money. It earns the 5 bps on every conversion. Its balances are
public and readable from the app's `/api/version` like every other configured address.

---

## Part 3 — Failure modes (all honest, none silent)

| Case | Behaviour |
| --- | --- |
| House maker unset, or its stream not shipped / docked | *Balance first* is `UNAVAILABLE` naming the reason; one-sided ship and the fund sheet remain |
| Quote unavailable (RPC) | Same; nothing is estimated |
| House reserve too thin for the amount | The quote shows the price impact; above 3 % the option is disabled with "Bank Rock's reserve is too small for this amount right now" |
| Swap reverts inside the batch (price moved past `minOut`, deadline) | The whole operation reverts; the receipt check (D-032, N-6) reports `UNAVAILABLE` with the bundler's reason; the reserve is untouched |
| External wallet | Its own confirmation appears; the app's copy says so before the tap |

---

## Part 4 — Delivery

| Item | Where |
| --- | --- |
| `buildBalanceAndShipCalls` (pure), the split solver, house strategy encoding + hash | `web/src/lib/aqua/house.ts`, tests beside it, Solidity pin in `contracts/test/aqua/HouseStrategy.t.sol` |
| Ship sheet: *Balance first* option, resulting-pair preview, fee disclosure, reasons | `web/src/components/rock/ship-strategy-sheet.tsx` |
| `useBankRock.shipStrategy` accepts `balanceFirst` and sends the five-call batch | `web/src/hooks/useBankRock.ts` |
| Privy silent signing + the "user tap only" rule | `web/src/components/providers.tsx`; spec 05 "Signing" |
| Operator script and live-check line | `web/scripts/house-ship.ts`, `scripts/check-live.sh`, `/api/version` |
| Rehearsal | `web/scripts/rehearse-sepolia.ts` step 2 gains the USDC-only variant |
| Config and docs | `web/wrangler.jsonc` vars, spec 16 §2.2 rows, spec 02 Flow B, spec 04 "Bank Rock mapping", spec 08 beat 0:55, spec 20 WP-14, DEMO-STATE |

Size **M**: about half a day of agent time plus the operator's house-stream funding. Contracts
unchanged.

**Acceptance:** on Sepolia, a rock funded with USDC only ships a two-sided stream after one tap
with no Privy prompt; the rehearsal's USDC-only variant is green; the house stream's balances
show on the live check; DEMO-STATE's line for this feature is deleted on that evidence.
