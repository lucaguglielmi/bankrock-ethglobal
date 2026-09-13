# Rock #420 - the stage demo

Rock 420 does not exist on chain. Open `/rock/420` and every surface of the rock page is a
convincing pretend that lives in the browser: it holds a lot of money, it runs two liquidity
streams, the signed-in Privy user owns it, and they can add money, start and stop strategies
(including the slider-first flow), trade against it, gift it and read its provenance. Nothing about
it touches the registry, Aqua, an RPC, or the application database. This is row **S-5** in
[`DEMO-STATE.md`](../../../../DEMO-STATE.md).

## The gate

`isDemoRockId(id)` - `id === "420"`, exactly - is the whole gate. `rock-interface.tsx` wraps the
page in `DemoRockProvider` for that id, and every real hook the page reads has one seam at its top:

```ts
const demo = useDemoRock();          // null on every other rock
const mock = useDemo…();             // always called, so hook order never changes
const chain = useChain…(…, demo === null);
return demo ? mock : chain;
```

The seamed hooks are `useRock`, `useAquaStrategy`, `useRockAccount`, `useRockActions`,
`useHandoverMessage`, `useRockOnchainEvents` and `useTakerActions`; `rock-activity.tsx` has the
same seam for provenance. The real branches' queries are disabled for the demo, so no read of rock
420 is ever made.

There is no build flag; the id is the only gate, so the demo is served **on the production deployment too**.

## What is mocked, and how

| Surface | How |
| --- | --- |
| The record | `awake`, owned by whoever is signed in (a signed-out visitor sees the seeded previous owner). Account is a label-derived address (`DEMO_ADDRESSES.account`); the Contracts tab shows a reason instead of it and the "Add funds" sheet is not handed it. |
| Reserve | `holdings` - 25,000 USDC and 12.5 WETH at the seed. `reserves` is a `DEMO` capability, so the headline shows the badge. |
| Streams | Wide (30 bps) allowing 18,000 USDC / 9 WETH with fees from 24 trades; Tight (5 bps) allowing 12,000 USDC / 6 WETH with fees from 43 trades. Strategy hashes are computed with the real `buildStrategy` for rock 420. `executable = min(virtual, held, allowance)`, as `lib/aqua/read.ts`. |
| Add funds | `demo-fund-sheet.tsx` - two amount fields, one 56 px "Add to the rock". Credits `holdings`. Opened from the Liquidity tab's "Add funds from another chain" entry (under the demo flag) or the demo's own "Add funds to this rock" door (without it). |
| Start / add a strategy | `useRockActions().shipStrategy` → `shipDemoStrategy`: adds the stream, raises the allowance when the shipment is larger (`approve` sets). Moves nothing. The ship sheet's slider works unchanged. |
| Stop | `dockStrategy` → `dockDemoStrategy`: removes the stream, records it in `stopped`. Nothing comes back. |
| Trade | The panel's quote comes from `GET /api/rocks/420/quote`, which prices with `quoteExactIn` over the **seed** streams and answers `source: "demo"` (the server cannot see the browser). The swap is `useTakerActions().swap` → `swapDemo` against the live browser state with the same maths: the whole input is pushed in, the output pulled out, the fee kept, the accepted floor honoured. The visitor's account is `DEMO_ADDRESSES.taker` with 50,000 USDC and 25 WETH, moved by every swap. |
| Gift | `initiateHandover` → `openDemoHandover`: `handover_pending`, recipient, expiry, message. The hand-over key is `DEMO { confirmed: true }`. Cancel works. A visitor signed in as the named recipient sees "waiting for you"; the claim action exists but needs a verified tap the demo does not have. |
| Provenance | `activity` - awakened, funded, two strategies started, ten trades, one gift received; every action appends a row. No row has a `txHash`. Rendered by `rock-activity.tsx` through its normal rows, badged. |
| Owner menu | mark lost / clear lost / retire all mutate the demo state. |
| Tap | Never verified. The attestation line is replaced by "Demo rock - no tap to verify, nothing on chain". |

Every value is a `Capability` in state `DEMO`, so the components render `SimulatedBadge` on their
own; every action result is `DEMO` or `UNAVAILABLE` and carries no hash, so `ActionOutcomeNotice`
prints "no transaction - simulated". The one exception is the quote route's envelope, which is
`state: "DEMO"` with `source: "demo"`; the trade panel accepts that state and badges the quote SIMULATED;
the panel names the source under "Where this price comes from".

## Persistence and reset

The state is one object under the `localStorage` key **`bankrock.demo.rock420.v1`**, serialised
with `bigint`s tagged (`state.ts`, `serializeDemoRock`). A reload keeps the demo where it was. The
version is part of the key: a changed shape gets a fresh key, and a payload that is not exactly the
current shape is discarded for the seed rather than half-rendered.

**Reset:** the banner's "Reset demo" (confirmed in a sheet) calls `resetDemoRock()`, which removes
the key and puts `seedDemoRock()` back. From a console: `localStorage.removeItem("bankrock.demo.rock420.v1")`
and reload.

## Files

- `constants.ts` - the id, the gate, the storage key, derived addresses.
- `state.ts` - the model, the seed, serialisation, and the views the hooks hand out.
- `actions.ts` - pure mutations `(state, params) -> { state, result }`; `actions.test.ts` pins them.
- `quote.ts` - the route's quote over the seed.
- `store.ts` - `localStorage` + `useSyncExternalStore`.
- `context.tsx` - `DemoRockProvider`, `useDemoRock()`.
- `hooks.ts` - the demo stand-in for each seamed hook.
- `demo-rock-banner.tsx`, `demo-fund-sheet.tsx` - the two surfaces the demo adds to the page.
