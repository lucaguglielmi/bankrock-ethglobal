# Liquidity strategies in the dashboard

How a rock's liquidity strategies look and behave on the rock page's Liquidity and Trade tabs.
Everything below follows from how Aqua and `XYCSwap` really work — `contracts/contracts/aqua/NOTES.md`
is the reference; this note only decides presentation. Code: `web/src/lib/aqua/strategy.ts`
(`DEFAULT_STREAMS`, `StreamPreset`, `streamPresetFor`), `web/src/components/rock/ship-options.ts`
(`SHIP_OPTIONS`, `unshippedOptions`), `web/src/lib/aqua/read.ts` (`readRockStreams`).

## What a strategy is

`XYCSwap` is one fixed constant-product curve. The only thing a strategy can vary is its fee, so a
strategy in Bank Rock is a **preset**: `(streamIndex, feeBps)` plus words for the owner. Every
reader probes exactly the catalogue below; a fee tier not in it would ship a strategy nothing in
the app could see. The indexes and fees are part of every shipped strategy's identity, so once any
rock has shipped a preset it must never change: stream 0 (Wide) is live on Sepolia today (rock 1,
now retired, and rock 3, the demo rock — read from Aqua on 2026-09-13).

## The catalogue

| Stream | Name | Fee | One line | Who picks it |
| --- | --- | --- | --- | --- |
| 0 | **Wide** | 0.30% | the everyday curve | Trades steadily and keeps a fair slice of each one; the middle of the road. |
| 1 | **Tight** | 0.05% | the same reserve, priced finer | Trades most often and earns a little each time; for a rock that likes to be busy. |
| 2 | **Patient** | 1.00% | the same reserve, priced for rare trades | Trades rarely and earns the most each time; for a rock content to wait. |

These are the three tiers a USDC/WETH constant-product pool is conventionally offered at. Nothing
below 5 bps is offered: it would price a volatile pair like a stable one. The catalogue is
ordered by stream index; a picker may sort it by fee (Tight, Wide, Patient) if that reads better.
Each preset costs one `safeBalances` call per read (plus one `rawBalances` call for each preset
that is not live, to tell "stopped" from "never started"); the probes run concurrently.

Use the preset's own words. `label` heads the card, `description` is the fee line, `forWhom` is
the one calm sentence under it. Do not invent a fourth phrasing per surface. Never show an
annualised figure of any kind; the only rate on screen is the fee.

## Several strategies live at once

- **One card per live stream**, in catalogue order. Each card shows the name, the fee, and
  "available to trade now" — the stream's **executable** amount (`min(virtual, wallet,
  allowance)`), per token.
- **The shared reserve is stated once**, above the cards, from `actual` (the Rock Account's real
  USDC and WETH). The cards say "from the rock's reserve", not "deposited".
- **Never total across streams.** Two streams' virtual balances may sum to more than the rock
  holds; that sum is not capital. There is no "total liquidity" number anywhere. If a card wants
  a second figure, it is the stream's virtual allowance, labelled as an allowance.
- A trade on one stream lowers the *other* streams' executable amounts. The cards update
  together on the next poll; no explanation is needed beyond the shared-reserve line.
- **Earned fees** per card: the rate is the fee; the cumulative figure comes from `fees` on the
  stream when present, and `feesUnavailable` is shown as "not readable right now", never as 0.

## "Add another strategy"

Ship a preset that is not yet live: `unshippedOptions([...live indexes, ...stopped indexes])`
from `ship-options.ts` gives the choices. A strategy is immutable: a fee tier can't be edited,
only stopped, and a different tier is started as a new stream. Shipping moves no tokens — it
grants Aqua an allowance over balances that stay in the Rock Account — so the sheet's
consequence line stays literal ("the rock keeps its tokens; this is how much this strategy may
trade"). When every preset has been used, the button disappears rather than disabling.

## "Stop" (dock)

Docking a stream zeroes its allowance and marks the slot closed. **No tokens move**: they were
never anywhere but the Rock Account, so docking *is* the withdrawal, and the UI must not promise
an incoming transfer. A stopped stream index can never be revived; `readRockStreams` reports
these as `stopped` so the picker does not offer them again (shipping one would revert with
`StrategiesMustBeImmutable`). Show stopped streams, if at all, as a quiet "stopped" line, not a
card with numbers. Each card has its own Stop; there is no "stop all".

## Which stream the Trade tab uses

When several streams are live, quote every live stream for the visitor's amount and **default to
the one that returns the most output** (`GET /api/rocks/[id]/quote?streamIndex=…`, one call per
live stream). On a tie, the lowest fee. The visitor may switch streams; the picker names them
by label and fee ("Tight · 0.05%"). A stream whose executable amount on the output side is below
the quoted output is shown but not selectable — the swap would fail. The fee stays in the rock's
reserve; say so once, in the confirmation line.

## Visitor versus owner

| | Visitor | Owner |
| --- | --- | --- |
| Reserve line and one card per live stream | yes, read-only | yes |
| Executable per stream | yes | yes |
| Earned fees per stream | yes | yes |
| Add another strategy / Stop | no | yes |
| Trade | yes | yes (against their own rock is allowed) |

A rock with no live stream shows the reserve line and, for the owner, the Add button as the
empty state; for the visitor, "this rock is not trading right now".

## What the data looks like

`GET /api/rocks/[id]/strategy` answers `{ state, value: { actual, allowance, streams[] } }`;
each stream carries `streamIndex`, `feeBps`, `label`, `virtual`, `executable`, `strategyHash`,
and `fees` or `feesUnavailable`; `value.stopped` (optional on the wire, decimal strings) lists the
docked stream indexes. Amounts are decimal strings in base units. `parseStrategyView` gives the
UI `ParsedStrategyView` with `stopped: bigint[]`, always present (empty when none), so the picker
is `unshippedOptions([...view.streams.map((s) => s.streamIndex), ...view.stopped])`.
`streamPresetFor(streamIndex)` turns a stream back into its preset for `description` and `forWhom`.
