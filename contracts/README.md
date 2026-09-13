# Bank Rock contracts

Three contracts, on Ethereum Sepolia (chain 11155111).

| Contract | What it is | Written by us |
| --- | --- | --- |
| `BankRockRegistry` | The record of who owns which rock. Holds no money, ever. | yes |
| `XYCSwap` | The constant-product app a rock's liquidity is shipped to. Vendored from 1inch, unmodified. | no |
| `XYCSwapTaker` | The periphery a visitor swaps through, because the app calls back into its caller. | yes |

```sh
npm ci
npm test          # compiles, runs every suite, and refreshes the three ABI copies
npm run compile   # compile + export ABIs only
npm run deploy    # deploys the registry; see scripts/deploy.js for the environment it needs
```

Security review: [`specs/19-contract-review-and-hardening.md`](../specs/19-contract-review-and-hardening.md).
Findings: [`audit/2026-09-12-findings.md`](./audit/2026-09-12-findings.md).
What changed in response: [`audit/2026-09-12-changes.md`](./audit/2026-09-12-changes.md).
Security contact: security@bank-rock.com.

---

# Using the contracts from Etherscan

You do not need the Bank Rock app to read or drive these contracts. Open the verified source on
[sepolia.etherscan.io](https://sepolia.etherscan.io), find the **Contract** tab, and use **Read
Contract** or **Write Contract**. This section is a field-by-field walkthrough.

## Two things never to do

1. **Never paste a private key, a seed phrase or a recovery code into Etherscan, or into anything
   that asks for one.** Etherscan never needs your key: it asks your wallet to sign, and your
   wallet keeps the key. Any page that asks you to type one is stealing it.
2. **Never `approve` the registry for any token.** `BankRockRegistry` cannot move tokens — it has
   no transfer function, no `receive`, and no way to spend an allowance — so an approval to it is
   pure loss: the allowance sits there for ever doing nothing, and if you approved by mistake you
   should revoke it. The only contract you ever approve is `XYCSwapTaker`, and only for the exact
   amount you are about to swap.

A third, softer one: tokens sent *to* `XYCSwapTaker` are gone. It has no owner and no rescue
function by design (see `XYCSwapTaker.sol`). Approve it; do not send to it.

## Reading a rock

Everything below is on **Read Contract** and costs nothing.

### `describeRock(rockId)` — start here

The only view that answers in words.

| Field | Example | Meaning |
| --- | --- | --- |
| `rockId` | `1` | The number printed on the rock / in its URL. |

Returns:

| Return | Example | Meaning |
| --- | --- | --- |
| `state` | `Awake` | `Dormant` (never woken), `Awake`, `HandoverPending` (a gift is waiting to be collected), `Archived` (retired for good). |
| `owner` | `0x71C8…1b47` | The wallet that owns the physical object. |
| `rockAccount` | `0x9fE4…03aa` | The smart account holding this rock's tokens. Balances live there, not in the registry. |
| `lost` | `false` | The owner's own "I have lost the tag" flag. It freezes nothing. |
| `handoverExpiresAt` | `1789000000` | Unix seconds at which an outstanding gift stops being claimable, or `0` for no gift. |

### `getRock(rockId)` — the same thing, unabridged

Returns the raw record: `owner`, `rockAccount`, `uidHash`, `state` **as a number**
(`0` Dormant, `1` Awake, `2` HandoverPending, `3` Archived), `lost`, and the full gift struct
(`recipient`, `expiresAt`, `initiatedAt`, `initiatedBy`, `messageHash`). A gift whose expiry has
passed is reported as `Awake`, because nobody can claim it any more — but the struct is still
there, so you can see the attempt.

### `rockIdForUid(uidHash)` and `lastCounter(uidHash)`

`uidHash` is `keccak256` of the tag's raw 7-byte UID. `rockIdForUid` says which rock that tag
backs **right now** (`0` if none — retiring a rock releases its tag). `lastCounter` is the highest
tap counter the registry has ever accepted for that tag; it never goes down, not even when a rock
is retired, which is what stops an old tap being replayed against a new rock.

### `version()`, `attester()`, `owner()`, `paused()`

`version()` is a semver string. `attester()` is the address whose signature authorises awakenings
and claims. `owner()` is the administrator — it can rotate the attester and pause, and it can
never move a rock or a coin. `paused()` tells you whether new awakenings, gifts and claims are
being accepted.

On Sepolia the owner is the deployer wallet and `pendingOwner()` names a second wallet that also
belongs to the maintainer; the transfer has simply not been accepted yet. Both are recorded in
`deployments/sepolia.json` so the pending transfer is not mistaken for a takeover (security
review 2026-09-13, R-5).

### `MAX_ATTESTATION_LIFETIME` and `MAX_HANDOVER_DURATION`

`900` (15 minutes) and `7776000` (90 days), in seconds. An attestation valid for longer than the
first is rejected; a gift that would stay open longer than the second is rejected.

---

## Writing: what you can do from Etherscan, and what you cannot

Two of the five actions need an **attestation** — a signature from the Bank Rock verifier proving
that somebody physically tapped that rock's tag. **Etherscan cannot produce one**, and neither can
you: it requires the tag's secret key, which lives in the tag and in the verifier and nowhere else.
Tap the rock with a phone and the app will produce it. There is no way around this, and that is the
whole point of the product.

| Action | Function | Needs an attestation? | Who may call |
| --- | --- | --- | --- |
| Wake a rock up | `awakenRock` | **yes** | anyone (it is the signature that authorises, not the sender) |
| Give a rock away | `initiateHandover` | no | the owner, or the Rock Account |
| Collect a rock given to you | `claimHandover` | **yes** | anyone, for the wallet the attestation names |
| Take back a gift | `cancelHandover` | no | the owner, or the Rock Account |
| Retire a rock | `archiveRock` | no | the owner, or the Rock Account |
| Flag / unflag a lost tag | `markLost` / `clearLost` | no | the owner, or the Rock Account |

"the Rock Account" above means the smart account in `describeRock`, and only while your wallet is
still one of its signing owners — the registry asks it.

### `initiateHandover(rockId, recipient, expiresAt, messageHash)` — give a rock away

| Field | Example | What to put |
| --- | --- | --- |
| `rockId` | `1` | The rock you own. |
| `recipient` | `0x2222…2222` | The wallet allowed to collect it. Put `0x0000000000000000000000000000000000000000` to mean "whoever taps this rock next" — anyone holding the object can then claim it. **Warning:** the Bank Rock app never issues such an open gift, and a claim on one reverts `AccountDoesNotAnswerToOwner` — no owner swap can be pre-signed for an unnamed recipient, so the Rock Account still answers to the giver (D-032). |
| `expiresAt` | `1789000000` | Unix seconds. Must be in the future and no more than 90 days away. [epochconverter.com](https://www.epochconverter.com) converts a date. |
| `messageHash` | `0x0000…0000` | `keccak256` of a gift message, or all zeros for none. The message itself is never stored on-chain. |

**Expect in the log:** `HandoverInitiated(rockId, from, recipient, expiresAt, messageHash)`. If a
gift was already outstanding you will see `HandoverCancelled` immediately before it — replacing a
gift cancels the old one, and the log says so rather than leaving you to infer it.

**Afterwards:** `describeRock` reads `HandoverPending` and shows the expiry.

### `cancelHandover(rockId)` — take the gift back

One field, `rockId`. Works even while the contract is paused: you can always stop giving something
away. **Expect:** `HandoverCancelled(rockId, by)`, and `describeRock` back to `Awake`.

### `archiveRock(rockId)` — retire a rock for good

One field, `rockId`. **There is no undo.** A retired rock can never be woken, given, claimed or
flagged again. Its record stays readable as history; its tag is released, so the same physical rock
can be woken again under a *new* rock id — which is what this is for.

**Expect:** `RockArchived(rockId, by, uidHash)`, preceded by `HandoverCancelled` if a gift was
open. `describeRock` reads `Archived`.

### `markLost(rockId)` / `clearLost(rockId)`

One field each. Informational: they publish your statement about the tag and freeze nothing. Money
is in the Rock Account and is never affected. **Expect:** `RockMarkedLost` / `RockLostCleared`.

### `awakenRock(rockId, smartAccount, att, sig)` and `claimHandover(rockId, att, sig)`

Both come from the app after a real tap; Etherscan cannot make them. But if you already hold a
valid `att` + `sig` pair — you captured one from your own tap and would rather relay it yourself —
both calls work from any sender, and the rock goes to `att.subject`, never to you.

**How Etherscan wants the `att` field.** It is a struct, and Etherscan's Write tab takes a struct
as a **JSON array in field order**, square brackets included, with every address and `bytes32`
quoted and every number unquoted:

```
[rockId, "0x…uidHash", counter, deadline, "0x…subject", "0x…smartAccount"]
```

| Position | Field | Type | What goes in it |
| --- | --- | --- | --- |
| 1 | `rockId` | `uint256` | The rock, as a plain number. |
| 2 | `uidHash` | `bytes32` | `keccak256` of the tag's raw 7-byte UID. 66 characters: `0x` + 64 hex. |
| 3 | `counter` | `uint32` | The tap counter from the attestation. Must beat `lastCounter(uidHash)`. |
| 4 | `deadline` | `uint256` | Unix seconds. At most 15 minutes ahead — see `MAX_ATTESTATION_LIFETIME`. |
| 5 | `subject` | `address` | The wallet that will own the rock. Not the zero address. |
| 6 | `smartAccount` | `address` | The Rock Account to bind. Not the zero address. |

A worked example, awakening rock 1:

```
rockId        1
smartAccount  0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
att           [1, "0x4d8dc57d52cea899ff61d87281e7220cb0ef40e343e07b3f4ef0cbddcce57d3d", 7, 1789000000, "0x71C8564E688172F6e1a90c0071C8097b6De81F26", "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0"]
sig           0x3f1c…1b   (65 bytes: r ‖ s ‖ v, 132 characters)
```

Note positions 2 and 6 repeat what you typed in the plain `smartAccount` field above: `awakenRock`
requires `att.smartAccount == smartAccount`, so the two must match exactly or it reverts
`AttestationSmartAccountMismatch`. Check `hashAttestation(att)` on the Read tab first if you want
to confirm the struct decodes the way you meant before spending gas.

For `claimHandover` the same tuple is used, and `att.smartAccount` is the account that will hold
the rock **after** the claim — the claim rebinds it, so whatever is in that field becomes the
rock's Rock Account. The verifier decides that value; do not substitute one of your own.

Two things will make a claim revert that are easy to miss:

- the account named there must **already** report the new owner as one of its signing owners, or
  you get `AccountDoesNotAnswerToOwner`. If the rock is moving to a different Safe, or the same
  Safe is changing hands, that change has to land **before** the claim, not after;
- it must be a **deployed** account. A smart account address that has been computed but never
  deployed has no code to answer with, so it cannot be bound — deploy it first.

**Expect:** `RockAwakened(rockId, rockOwner, uidHash, smartAccount, counter)` or
`HandoverClaimed(rockId, previousOwner, newOwner, smartAccount, counter)`.

---

## Administrator functions

These four are on the registry's Write tab and only `owner()` can use them. They can rotate the
attester and stop the contract; **none of them can move a rock or a coin**, and there is no
function anywhere that can.

### `setAttester(newAttester)`

| Field | Example | What to put |
| --- | --- | --- |
| `newAttester` | `0x3C44…293BC` | The address whose signatures the registry will accept from now on. The zero address is rejected (`AttesterCannotBeZero`). |

Rotation is immediate and total: every attestation signed by the previous attester stops working
in the same block, including ones already in flight. Have the new signer running first.
**Expect:** `AttesterUpdated(previousAttester, newAttester)`.

### `pause()` and `unpause()`

No fields. `pause()` stops `awakenRock`, `initiateHandover` and `claimHandover`. It deliberately
does **not** stop `cancelHandover`, `archiveRock`, `markLost` or `clearLost` — a pause must never
trap somebody in a state they want to leave.

What a pause costs: **it does not stop the clock.** A gift whose `expiresAt` passes while the
contract is paused is dead when you unpause, and the owner has to open a new one. Check
`describeRock` for outstanding gifts before a long pause.
**Expect:** `Paused(account)` / `Unpaused(account)`.

### `transferOwnership(newOwner)` then `acceptOwnership()`

Two steps, on purpose, so a mistyped address cannot take the contract with it.

| Step | Called by | Field | Effect |
| --- | --- | --- | --- |
| 1 | the current owner | `newOwner` | Records a pending owner. `owner()` does **not** change. Check `pendingOwner()` on the Read tab. |
| 2 | the new owner | — | `owner()` becomes them, `pendingOwner()` clears. |

Between the two steps the current owner still administers the contract, and calling
`transferOwnership` again with a different address replaces the pending one. **Expect:**
`OwnershipTransferStarted(previousOwner, newOwner)` then `OwnershipTransferred(previousOwner, newOwner)`.

### `renounceOwnership()` — disabled

It is on the Write tab because it is inherited, and it always reverts
`OwnershipCannotBeRenounced()`. A registry with no administrator could never rotate its attester,
and every future tap would be unusable. There is no way to abandon this contract, by design.

---

## Swapping against a rock — `XYCSwapTaker`

Two transactions, in this order.

1. On the **token you are selling** (USDC or WETH): `approve(spender, amount)` where `spender` is
   the `XYCSwapTaker` address and `amount` is exactly what you are about to swap. Not the app, not
   Aqua, not the registry.
2. On `XYCSwapTaker`: `swapExactIn(strategy, zeroForOne, amountIn, amountOutMin, to, deadline)`.

| Field | Example | What to put |
| --- | --- | --- |
| `strategy` | `["0x9fE4…03aa","0x1c7D…7238","0xfFf9…6B14","30","0x8a1c…"]` | The five fields of the rock's strategy exactly as it was shipped — maker, token0, token1, feeBps, salt. One character wrong and the app cannot find it. Read them from the rock's page or from the `Shipped` event. |
| `zeroForOne` | `true` | `true` sells token0 (USDC) for token1 (WETH); `false` the other way. |
| `amountIn` | `100000000` | Base units. USDC has 6 decimals, so this is 100 USDC. WETH has 18. |
| `amountOutMin` | `38000000000000000` | The least you will accept, in the other token's base units. **Never put 0** from a form you typed by hand: 0 means "any price at all". |
| `to` | `0x71C8…1b47` | Who receives the output. **Your own address** — there is no "all zeros means me" shortcut any more. All zeros is rejected, and so is the periphery's own address, which is the one you have just approved and therefore the one most likely to be in your clipboard. Tokens sent there are gone. |
| `deadline` | `1789000300` | Unix seconds. Use about five minutes from now. A transaction that sits unmined executes at a price that has moved. |

**Expect in the log:** Aqua's `Pulled` and `Pushed`, and this contract's own
`Swapped(taker, recipient, tokenIn, tokenOut, amountIn, amountOut)` — the only event that names
who traded and who was paid.

`AQUA()` and `APP()` on the Read tab show the two addresses this periphery is bound to. They are
immutable: a periphery trades through exactly one app for its whole life, which is why nobody can
pass an app of their own.

---

## Verifying the source yourself

`scripts/verify.md` has the full recipe, including which `build-info` belongs to which contract
(the project compiles with two compilers, so position is not a safe way to pick). Once verified,
Etherscan shows the NatSpec next to every function, which is where the descriptions in this file
come from.
