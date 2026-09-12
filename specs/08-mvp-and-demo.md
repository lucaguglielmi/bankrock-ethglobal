# Hackathon MVP and demo

## Submission position

Bank Rock demonstrates a new interface for DeFi: a tangible object that persists, holds self-custodial assets and exposes Aqua liquidity through Privy-powered onboarding.

Target integrations are Aqua and Privy. Exact sponsor prize eligibility and required networks must be checked against the live ETHGlobal prize pages before submission.

## MVP must include

1. At least one physical NFC rock opening its unique HTTPS page.
2. Public rock metadata and onchain state.
3. Privy login and embedded wallet creation or restoration.
4. A dedicated Rock Account or documented isolation mechanism.
5. Testnet funding with two supported tokens — Circle USDC and WETH on Ethereum Sepolia (D-023).
6. Aqua approval and one working strategy.
7. One real swap against that rock's strategy.
8. Updated balances and fee information after confirmation.
9. NFC cloning-safe authorization.
10. Explorer links and honest risk disclosure.
11. An MCP Server allowing an AI agent to read the rock's state.
12. ~~WebXR (AR) visualization of the physical rock.~~ **Cut** — spec 15 Part 6. Zero
    implementation existed; it is a presentation flourish, and the exit phases are the
    submission. It is also removed from the demo script below.
13. Proof of physical tap using NTAG 424 DNA signatures.

## Strong target

After the must-have path works:

- two Aqua strategies sharing one Rock Account reserve;
- transfer of Rock Account control to a second Privy user;
- provenance timeline;
- replacement-tag demonstration.

## Explicitly out of scope

- mainnet funds;
- fiat on-ramp;
- guaranteed or projected yield;
- native iOS or Android application;
- strategy marketplace;
- production manufacturing;
- support for arbitrary tokens or contracts.

## Three-minute demo story

### 0:00–0:25 — The object, and the proof

Show the physical rock.

"This is not a hardware wallet. It is a physical interface to a self-custodial liquidity account."

Tap it with a phone. The page opens and the badge reads **Verified Physical** — the chip generated
a fresh signed URL for that one read, the server checked the CMAC against the tag's own key, and
the read counter moved.

Then do the thing that makes the claim falsifiable: **copy the URL out of the address bar and open
it in a second browser.** The badge reads `unverified`. Same link, same rock, no proof — because
the counter it carries has been spent.

"The tag proves the object. It never proves the person, and it never authorises a payment."

*(There is no AR beat. WebXR is cut — spec 15 Part 6. Do not open an AR view; there isn't one.)*

### 0:25–0:55 — Privy onboarding

Use a fresh browser session. Sign in with email or passkey and obtain a wallet without a seed phrase.

Explain that scanning identifies the object; Privy identifies and authorizes the person.

### 0:55–1:35 — Aqua liquidity

Show the Rock Account's actual two-token reserve. Open or reveal the Aqua strategy and explain that the assets remain with the maker while Aqua tracks strategy balances.

If ready, show two streams sharing the reserve.

### 1:35–2:10 — Trade

Use a second account to execute a small testnet swap against the selected rock. Show confirmation, changed token composition and fee accounting.

### 2:10–2:30 — Gift or transfer (Zero Gas)

Open the gift, name the second Privy account, and sign once. That single signature does two
things: it opens the pending handover on chain, and it pre-signs the Safe owner swap that the
recipient cannot produce for themselves (D-027).

Then hand over the rock. The recipient taps it, signs in on a fresh account with no ETH, and the
claim is relayed: the registry credits the subject named inside the attestation, and the stored
owner swap follows, so the account and everything in it move with the object. **Zero gas fees,
no native tokens, and the giver did not need to be present.**

### 2:30–2:55 — The AI Oracle & Agentic Strategies (MCP)

Open an external chat interface with an AI agent (e.g., ChatGPT or Claude Desktop). Say, "I want to fund this rock with 50 USDC but keep it low risk." The user's external agent connects via the Bank Rock MCP Server, bridges the funds from an L2 (Cross-chain Abstraction), and automatically generates and ships a customized Aqua strategy. *Note: We do not run our own AI agent in the app; we simply expose the MCP server for the user's preferred agent to connect to.*

### 2:55–3:10 — Platform potential

“Bank Rock binds physical objects to programmable, self-custodial liquidity, and makes them conversational via AI. Rocks are the first interface; art, cards, products and installations can use the same model.”

## Rehearsal — archive and start over

The awakening beat is one-shot per rock: a rock can be awakened exactly once, and a tag binds to
exactly one rock at a time. To rehearse it more than once with a single physical tag, use
`archiveRock` (D-028, Flow K):

1. Retire the rock from the owner menu. The tag binding is released; the archived rock stays
   readable as history and its id is never reissued.
2. Tap again. The URL is unchanged — SDM rewrites only `e` and `c` — so the verifier resolves
   `next_free` and offers the next unused rock id.
3. Awaken into it. **Same Rock Account address**, because the account is salted by the tag, not
   by the rock id (D-029) — so whatever was funded is still there and does not need re-funding.
4. The read counter never resets, so nothing captured before the archive can be replayed.

The cheaper rehearsal, for everything except the on-chain awakening itself, is
`NEXT_PUBLIC_DEMO_MODE=true` locally: the in-memory counter store is used, and every beat can be
walked through without spending a faucet claim (spec 18 §4.3). **The demo needs one successful
awakening on stage, not many.** Fund one Rock Account the night before, rehearse against a second
rock id, and keep `archiveRock` as the recovery lever if the stage awakening has to be redone.

## Acceptance test

The demo build passes when a judge can:

1. tap a real rock;
2. inspect it without logging in;
3. sign in without an existing wallet;
4. execute or observe a real Aqua-backed transaction;
5. distinguish the public tag from financial ownership;
6. explain in one sentence what Aqua and Privy each contribute.

## Fallback order under time pressure

Cut in this order:

1. replacement tags;
2. provenance polish;
3. ownership transfer;
4. second shared-liquidity strategy;
5. creator registration UI.

Never cut the real NFC interaction, Privy onboarding, working Aqua transaction or security model.
