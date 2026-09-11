# Hackathon MVP and demo

## Submission position

Bank Rock demonstrates a new interface for DeFi: a tangible object that persists, holds self-custodial assets and exposes Aqua liquidity through Privy-powered onboarding.

Target integrations are Aqua and Privy. Exact sponsor prize eligibility and required networks must be checked against the live ETHGlobal prize pages before submission.

## MVP must include

1. At least one physical NFC rock opening its unique HTTPS page.
2. Public rock metadata and onchain state.
3. Privy login and embedded wallet creation or restoration.
4. A dedicated Rock Account or documented isolation mechanism.
5. Testnet funding with two supported tokens.
6. Aqua approval and one working strategy.
7. One real swap against that rock's strategy.
8. Updated balances and fee information after confirmation.
9. NFC cloning-safe authorization.
10. Explorer links and honest risk disclosure.

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
- cross-chain abstraction;
- strategy marketplace;
- AI portfolio management;
- production manufacturing;
- cryptographic NFC hardware;
- support for arbitrary tokens or contracts.

## Three-minute demo story

### 0:00–0:25 — The object

Show the physical rock.

“This is not a hardware wallet. It is a physical interface to a self-custodial liquidity account.”

Tap it with a phone and open its public page.

### 0:25–0:55 — Privy onboarding

Use a fresh browser session. Sign in with email or passkey and obtain a wallet without a seed phrase.

Explain that scanning identifies the object; Privy identifies and authorizes the person.

### 0:55–1:35 — Aqua liquidity

Show the Rock Account's actual two-token reserve. Open or reveal the Aqua strategy and explain that the assets remain with the maker while Aqua tracks strategy balances.

If ready, show two streams sharing the reserve.

### 1:35–2:10 — Trade

Use a second account to execute a small testnet swap against the selected rock. Show confirmation, changed token composition and fee accounting.

### 2:10–2:40 — Gift or transfer

Transfer control to a second Privy account, or show the fully implemented handover transaction. Emphasize that copying the NFC tag cannot transfer ownership.

### 2:40–3:00 — Platform potential

Close with the reusable primitive:

“Bank Rock binds physical objects to programmable, self-custodial liquidity. Rocks are the first interface; art, cards, products and installations can use the same model.”

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
