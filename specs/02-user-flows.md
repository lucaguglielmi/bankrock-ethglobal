# User flows

## Roles

- **Creator:** registers a physical rock and prepares it for use.
- **Owner:** controls the rock account and its financial actions.
- **Visitor or trader:** taps a rock and may inspect or trade with it.
- **Recipient:** accepts ownership when a rock is gifted.
- **Application operator:** runs the web interface and indexing services but cannot move owner funds.

A person may hold several roles at different times.

## Flow A — Register an unactivated rock

1. Creator opens the administrative registration flow.
2. Creator enters or scans the tag URL and assigns a public rock ID.
3. The system verifies the ID is unused.
4. Creator records optional physical metadata: colour, edition, photo and short name.
5. The system creates an unclaimed record.
6. Creator writes the permanent HTTPS URL to the NFC tag.
7. A second device scans the tag to verify it.

Registration does not create or fund a wallet.

## Flow B — Awaken and fund a rock

1. User taps the NFC tag.
2. The public rock page detects that the rock is unactivated.
3. User chooses **Awaken this rock**.
4. Privy authenticates the user and creates or restores their embedded wallet.
5. The verifier decrypts the PICC data, derives the NXP session keys and checks the SDM CMAC
   against the tag's own key. Only then does it advance the read counter. A failure here ends the
   flow: there is no other way to reach step 9.
6. Still inside the verifier, and in this order: it resolves the **effective rock** from the
   registry — `bound`, `url`, `next_free` or `registry_unavailable` (D-028) — and derives the
   **Rock Account** from `(subject, uidHash)` with `saltNonce = uint256(uidHash)` (D-029). The
   address is counterfactual: nothing is deployed and no transaction is sent. A `smartAccount`
   supplied by the client is ignored, not honoured.
7. The verifier signs one EIP-712 attestation naming `rockId` (the effective one), `uidHash`,
   `counter`, `deadline`, `subject` and `smartAccount` (D-026), and returns it with the resolution.
   Verification and attestation are staged: a real CMAC match with no signer key configured
   still shows `Verified Physical` and reports the attestation `UNAVAILABLE`.
8. The user submits `awakenRock(rockId, smartAccount, att, sig)` as a gas-sponsored UserOperation
   from the Rock Account itself, which deploys the Safe as a side effect of doing the work. The
   registry takes the owner from `att.subject` and requires `att.smartAccount == smartAccount`, so
   the transaction may equally be relayed — the tapping user never needs ETH. The client refuses
   to send an attestation that names a different wallet, rock or account than the one on screen.
9. The user funds the Rock Account with the supported testnet token pair **(0.01 ETH from the
   built-in faucet; USDC and WETH from the public faucets — spec 16 Part 3)**. An awake rock's
   **Fund this rock** sheet is the surface for it: the Rock Account address with a copy button,
   what the account holds right now, the USDC and WETH contract addresses from `lib/chain`, and
   the Sepolia Etherscan link — no bridge, no quote and no amount field, because the transfer is
   made in the sender's own wallet. A **dormant** rock shows the same address before it is
   awakened — the account it *would* open, derived from the tag and the signed-in wallet (D-029) —
   with the one condition stated beside it: funds sent there belong to the rock only if it is
   awakened with that same wallet.
10. The owner selects which stream to open and the amounts to expose. The choices are exactly the
    streams every reader probes — stream 0 at 30 bps ("Wide") and stream 1 at 5 bps ("Tight") —
    because a fee the readers do not probe hashes to a strategy nothing in the app can find.
11. **Atomic UserOperation Batching (1-Click Launch):** the user approves once via Privy. The Rock
    Account executes one batched UserOperation bundling `USDC.approve(Aqua, a)`,
    `WETH.approve(Aqua, b)` and
    `Aqua.ship(app, strategy, [USDC, WETH], [a, b])`. The approvals go to **Aqua**, never to the
    app. `strategy` is `abi.encode(XYCSwap.Strategy)` with the rock id in its salt (D-030).
12. The application confirms the live stream by recomputing `strategyHash` and reading
    `Aqua.safeBalances`. **No tokens moved:** shipping is an allowance over balances that stay in
    the Rock Account's own wallet, and the UI says so rather than showing a deposit.

The UI must distinguish pending, confirmed and failed onchain operations.

## Flow C — Inspect a rock

Anyone scanning the rock may see:

- name, colour and edition;
- current controller address in shortened form;
- actual token balances;
- available liquidity;
- active strategy or strategies;
- total trade count and fees;
- activation and ownership history;
- network and testnet status.

No login should be required for public inspection.

## Flow D — Trade with a rock

1. Visitor taps the rock and selects **Trade with this rock**. No attestation is required: a
   swap is a public action against a public strategy, and the tap proves nothing a swap needs.
2. If necessary, Privy creates or restores the visitor wallet. The account that transacts is the
   visitor's **personal Safe** — `saltNonce = 0`, not tied to any tag, one per visitor no matter
   how many rocks they trade with (D-029). The trade sheet **shows that account**: its address
   with a copy button and its live USDC and WETH balances. Gas is sponsored but the input token is
   not, so an account holding none of it says "This account holds no USDC — send some to the
   address above" and the confirm button stays disabled, rather than failing in estimation.
3. The interface shows input, expected output, price impact, fee rate and network. The quote
   comes from `XYCSwap.quoteExactIn` — the identical code path the swap runs — with the mirrored
   client-side maths only as a preview while the user types. Price impact is computed from the
   curve's own reserves, never from a formula invented for display.
4. The visitor confirms the trade.
5. The transaction is **two calls in one sponsored batch**: `tokenIn.approve(taker, amountIn)`
   then `XYCSwapTaker.swapExactIn(...)`. It goes through the **taker periphery** because the app
   settles by calling `xycSwapCallback` back into its caller, which an EOA and a plain Safe cannot
   answer (D-030). The approval goes to the periphery — the opposite of the maker's rule. The
   visitor pays no gas, so a wallet with no ETH can trade.
6. The rock page updates its actual balances, its virtual balances and its fee figure. The three
   are read separately and never summed. Fees are not a pot to claim: they are the unpriced slice
   of the input, and they land inside the rock's own reserve (D-030).
7. The visitor receives a plain-language receipt. `amountOut` is read back from the receipt's own
   `Pulled` / `Pushed` events, never from the preview the visitor was shown.

The application must never imply that a swap is risk-free.

## Flow E — Gift an active rock

There is exactly one path (D-027, refined by D-032). There is no immediate `transferOwnership`: a
rock changes hands when someone holding the physical object presents a fresh attestation, and never
otherwise. **A recipient must be named** — the app issues no open gifts.

1. Current owner selects **Give this rock**, **names a recipient** (required — the transfer sheet
   has no "leave it open" affordance, D-032), chooses an expiry and optionally adds a message.
   *Open handovers remain a capability of the contract: `initiateHandover` still accepts
   `recipient == address(0)` and still documents it. **No app path issues one**, and the claim
   route refuses to relay one, because a recipient who is unknown when the gift is opened cannot
   have an owner swap pre-signed for them.*
2. `initiateHandover(rockId, recipient, expiresAt, messageHash)` goes out as a sponsored
   UserOperation from the Rock Account. Only the message *hash* is on chain; the text is stored
   off-chain and is shown **to the named recipient, on the rock page, from the moment they are
   signed in** — the screen they are standing in front of when they decide whether to claim.
3. **In the same interaction, the giver pre-signs the Safe owner swap.** They are online and are
   still the Safe's only owner, which is the one moment that signature can be produced:
   `Safe.swapOwner(SENTINEL, giver, recipient)`. The signed UserOperation is stored server-side
   until the claim. It is one-shot, and cancelling the handover discards it — a cancelled gift
   whose owner-swap operation survived would be a live path to hand the account away.

   Two things make this half real rather than hoped for:

   - **the store is part of the gift's success condition.** The giver's sheet awaits it and then
     confirms it with `GET /api/rocks/[id]/pending-userop` before it says the gift is waiting. A
     gift whose key was not stored is one the claim route refuses forever, and the giver is the
     only person who can sign another — so the sheet says so instead, and offers **"Sign the
     handover key again"**, which re-prepares and re-stores the swap and never re-opens the
     handover on chain;
   - **the stored operation is validated by the bundler before it is kept.** Everything the store
     route can check by itself is public, so `eth_estimateUserOperationGas` is asked whether the
     operation really validates — a signature is the one thing a stranger cannot forge. A refusal,
     or a bundler that cannot be reached, stores nothing.
4. Recipient physically receives and taps the rock.
5. Recipient signs in through Privy (email, passkey or social). **The tap is held, not spent,
   until they do.** Verifying a tap consumes its counter, and an attestation with no `subject`
   claims nothing, so on a rock waiting to be claimed a signed-out visitor's tap is verified only
   after sign-in — one tap, in the order this flow states.
6. The verifier checks the SDM CMAC, advances the counter, and signs an attestation naming the
   recipient as `subject`. `smartAccount` is the account the registry already holds for this rock,
   and **the claim binds it** — `claimHandover` writes `rock.smartAccount = att.smartAccount`
   (D-032). The route checks that the attestation names the same account the registry holds before
   it does anything at all.
7. **The Rock Account moves first.** The claim route submits the stored owner-swap operation and
   waits for its receipt. Only a UserOperation receipt reporting `success === true` counts as
   landed; an included-but-reverted operation is a failure, and the route reports it and claims
   nothing. It also refuses to start when the attestation has **less than 90 seconds** of life
   left, because this half is irreversible and the next one must still be mined before
   `att.deadline` (D-032). If the swap does not land, the recipient is exactly where they started.
8. `claimHandover(rockId, att, sig)` is **relayed by the server** from `RELAYER_PRIVATE_KEY`,
   within `RELAYER_DAILY_CAP_WEI`. It has to be relayed: the recipient has no gas. This is not an
   open relay — the registry credits `att.subject`, which is inside the signature, so the relayer
   cannot redirect the rock to itself, and the route refuses any attestation not signed by this
   deployment's attester. The registry then asks the named account, through `isOwner`, whether it
   already answers to `att.subject`, and reverts `AccountDoesNotAnswerToOwner` otherwise — which
   is what makes step 7's ordering an invariant for every caller, not a convention of this route.
   **Gas is sponsored end to end**: the recipient pays nothing and needs no native tokens.

   **The claim is judged by its receipt, like the swap before it.** A node accepting the
   transaction is not a claim: `claimHandover` can still revert — a slow mempool past
   `att.deadline`, an account that stopped answering — and the recipient reads this answer as
   "This rock is yours". So the route waits for the receipt and only `status: success` counts; a
   revert, or a transaction that never mines, is reported UNAVAILABLE and names the transaction.
   The relayed transaction is also **priced inside the amount reserved against
   `RELAYER_DAILY_CAP_WEI`** (`gas * maxFeePerGas <=` the reservation), and a base fee that does
   not fit under that ceiling refuses the attempt rather than overspending the cap.
9. The account address, its assets and its Aqua maker identity remain completely stable. The
   strategies stay shipped; nothing is docked and re-shipped. **The recipient's owner actions —
   give, retire, ship, cash in, mark lost — work from the app straight away and stay sponsored,
   because the app takes the rock's account from the registry and asks that account whether it
   answers to her wallet, instead of re-deriving an address her wallet would compute differently
   (D-037).**
10. Both parties receive a receipt. Provenance shows `HandoverInitiated` then `HandoverClaimed`,
    both backed by a tap.

## Flow F — Lost or copied tag

- Owner can mark the physical tag as lost and issue a replacement public identifier.
- Marking a tag lost does not freeze owner funds automatically.
- Scanning a copied tag exposes only public information.
- Financial actions still require Privy authentication and owner authorization.
- A replacement tag may point to the existing Rock Account after verification.

## Flow G — Top Up the rock

1. Owner authenticates via Privy.
2. Owner selects **Top Up** on the rock's management page.
3. User is presented with a simplified fiat on-ramp (via Privy integration or similar) or a cross-chain deposit flow.
4. User completes the payment flow (e.g., Apple Pay).
5. The Rock Account receives the new tokens and optionally autoships them into the active Aqua strategy.

## Flow H — Cash In

1. Owner authenticates via Privy.
2. Owner selects **Cash In** to extract their liquidity.
3. The interface docks the active Aqua strategies:
   `Aqua.dock(app, strategyHash, [USDC, WETH])`, listing **every** token of the strategy in one
   call or it reverts.
4. **Docking is the withdrawal, and it moves nothing.** The tokens never left the Rock Account:
   a strategy is an allowance over balances that stayed in the maker's wallet the whole time
   (D-030). `dock` zeroes the virtual balances and marks the strategy closed; the wallet balance
   is unchanged. The interface must not promise an incoming transfer, show a "receiving" state,
   or animate funds returning — there is nothing in flight.
5. Only then, and as a **separate** act, may the owner send those tokens somewhere: an external
   wallet, or a fiat off-ramp (out of scope for the MVP — spec 08). That transfer is an ordinary
   ERC-20 transfer from the Rock Account, unrelated to Aqua.
6. A docked strategy can never be revived. Re-opening a stream means shipping a new one under a
   new `streamIndex`.

## Flow I — AI Query (via MCP)

1. Owner interacts with their personal AI agent (e.g., in an MCP-supported chat interface).
2. Owner says, "Check the status of my Bank Rock and tell me if I should adjust my strategy."
3. The AI agent seamlessly connects to the Bank Rock MCP Server.
4. The MCP provides the rock's current balances, Aqua strategy, and historical fees.
5. The AI agent analyzes the data and responds with a natural language summary and recommendations (e.g., "Your rock earned 5 USDC this week. I recommend tightening the spread based on current volatility.").

## Flow J — Agentic Strategy Creation (via External AI Client)

*Note: Bank Rock does not host an in-app AI agent. Instead, it exposes a Master Oracle MCP Server that the user can connect to via their own external AI client (e.g., ChatGPT, Claude Desktop).*

1. Owner connects their preferred AI client to the Bank Rock MCP Server.
2. Owner tells their AI: "I want to fund this rock with 50 USDC but keep it very low risk."
3. The AI (via MCP tools) automatically calculates the optimal Aqua strategy parameters for the requested risk profile.
4. The AI prepares the transaction data and prompts the owner for approval, providing a direct link or payload for the Bank Rock app.
5. The owner reviews the payload and taps a button to sign the transaction via Privy.

## Flow K — Archive and start over

The one-way exit, and the only supported way to reuse a physical tag (D-028). Its practical use
is rehearsal: awakening the demo beat again and again with a single tag, without reprogramming it.

1. Owner opens the owner menu and selects **Retire this rock and free the tag**, behind a
   confirmation that states what is irreversible.
2. `archiveRock(rockId)` goes out as a sponsored UserOperation from the Rock Account. The
   registry accepts either the owner's wallet or the rock's Safe as the caller (D-026), so this
   costs the owner nothing. It is deliberately callable while the contract is paused: archiving
   only removes ways to act on a rock, and an emergency stop must not trap a tag. **A recipient who
   was given the rock retires it the same way, from that same account, with an empty wallet: the
   account the registry holds is the one whose owner the gift swapped to her (D-037).**
3. Any outstanding handover is cancelled first, emitting `HandoverCancelled` before
   `RockArchived`, so a reader of the log sees the claim path close explicitly.
4. The rock's state becomes `Archived`, and the **tag binding is released**:
   `rockIdForUid(uidHash)` returns to 0. There is no `unarchive`.
5. **History is kept.** `getRock` still returns the archived rock's owner, Rock Account and UID
   hash. The record becomes a closed chapter, not a blank, and its rock id is never reissued.
6. **The tag URL does not change.** SDM rewrites only `e` and `c` on each read; the path is
   written once at provisioning (spec 06, spec 18 §4.2). So the number in the URL is now stale,
   and the next tap resolves `next_free` — the verifier offers the next unused rock id and signs
   the attestation for *that* id.
7. **The read counter is not reset.** `lastCounter(uidHash)` keeps climbing across the boundary,
   so an attestation captured before the archive cannot be replayed against the rock that follows.
8. Awakening the next rock id reuses the **same Rock Account address** for the same owner, because
   the account is salted by the tag rather than by the rock id (D-029). Any balance left in it is
   still there. **This holds only while that owner is the one who derived the account: a rock that
   was gifted and then retired by its recipient leaves its reserve behind, because the next
   awakening must name a counterfactual account and the only one it can name is the one the new
   owner's own wallet derives — the retired rock's account stays hers as a Safe, but no rock record
   names it any more (D-037).**

**Not a recovery tool for a lost tag.** That is Flow F, and it changes nothing on chain.
