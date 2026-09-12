# Bank Rock

**Liquidity you can hold.**

Bank Rock turns a handmade NFC-enabled rock into the physical interface for a self-custodial, giftable liquidity account.

A person taps a rock, signs in through Privy, and can inspect, fund, trade with or receive liquidity managed through Aqua. The NFC tag identifies the object but never stores a private key or grants financial authority.

## Current phase

Implementation, on branch `exit-from-demo-mode`. The web app, the registry contract, the NFC
verifier and the Aqua integration are written; **nothing is deployed yet**, so most of the
product currently renders an honest `UNAVAILABLE` state naming what is missing rather than a
number (decision D-013).

What exists:

- **`BankRockRegistry`** — identity and lifecycle only. It holds no tokens, takes no approvals,
  and performs no call with caller-supplied calldata. Awakening and gift claims require an
  EIP-712 attestation signed by the server that verified a physical tap.
- **A real NTAG 424 DNA verifier** — PICC decryption, NXP session-key derivation, CMAC, and a
  strictly monotonic read counter in Cloudflare D1. No client code path can paint the
  "Verified Physical" badge.
- **The Aqua path** — the reference `XYCSwap` AquaApp plus a taker periphery, with the strategy
  encoding settled and pinned by matching tests in Solidity and TypeScript.
- **Rock Accounts** — Safe 1.4.1 smart accounts on EntryPoint 0.7, counterfactual, gas-sponsored,
  salted by the tag so one physical rock is one account per owner.
- **Savings** — Privy Earn from the embedded wallet: seven `/api/earn/*` routes that forward
  wallet-signed requests, a `useEarn` hook, a card on the owner's rock page and at `/savings`.
  Real in code, unproven live until a vault id and the app secret are set (`DEMO-STATE.md` K-10,
  P-11).
- **Money from anywhere and a trading agent** — a Privy universal deposit address into savings,
  and `web/scripts/agent/trade-with-rock.mjs` for an agent on Privy's Agent Wallet CLI. Both
  unproven live (`DEMO-STATE.md` P-12, P-13).

What is not real yet, and why, is tracked one line at a time in
**[`DEMO-STATE.md`](./DEMO-STATE.md)** — the answer to rule 1 of
[`STEERING.md`](./STEERING.md). The plan that produced this state is
[`specs/15-exit-demo-mode.md`](./specs/15-exit-demo-mode.md); what it would take to run the demo
end to end is [`specs/18-demo-readiness.md`](./specs/18-demo-readiness.md).

The target network is Ethereum Sepolia (chain 11155111). No Bank Rock contract or key holds
mainnet funds; the one mainnet surface is **Savings**, the user's own USDC in their own Privy
embedded wallet, in a Morpho vault on Base through Privy Earn (spec 20, D-033).

## How Privy is used

Privy is the sign-in, the wallet, the signature behind every financial action, and the savings
rail:

- **Embedded wallets** — sign in with email, Google or Apple and get a wallet on the spot; it is
  the sole owner of the rock's smart account, so the person controls the reserve and the Aqua
  strategy and Bank Rock's servers cannot move a thing.
- **Earn** — *Savings* puts idle USDC into a Morpho vault through Privy Earn: add, take out, and
  see what the vault has actually paid. No rate is shown, only the realised figure (D-004).
- **User authorization signatures** — each deposit and withdrawal is signed by the user's wallet
  and forwarded unchanged; the app secret cannot move money on its own (D-034).
- **Universal deposit addresses** — *Add from any wallet, exchange or chain*: Privy issues an
  address for whatever the person holds and converts it on arrival into USDC on Base, ready for
  savings (D-035). The simulated cross-chain modal is gone.
- **Agent Wallet CLI** — an AI agent with its own Privy wallet can trade with a rock as a visitor,
  following the skill at [`/agent/SKILL.md`](./web/public/agent/SKILL.md) (D-036).
- **Gas sponsorship** — a saver never needs ETH.

The submission text is [`docs/submission/privy.md`](./docs/submission/privy.md); the
prize-by-prize assessment (three of Privy's four prizes are open to a build-from-scratch project)
and the design are
[`specs/20-privy-earn-and-hackathon-qualification.md`](./specs/20-privy-earn-and-hackathon-qualification.md).

## Documentation

Start with the [specification index](./specs/README.md).

The specifications cover:

- product proposition and principles;
- activation, funding, trading and gifting flows;
- Rock Account and system architecture;
- Aqua strategy integration;
- Privy authentication and ownership;
- NFC cloning and claim security;
- mobile-first frontend direction;
- hackathon MVP, demo and open decisions;
- the exit from demo mode, the environment and secrets inventory, the phone-first UI contract,
  and demo readiness.

## Independence

This repository is the sole source of truth for the ETHGlobal Bank Rock project. It does not depend on or reuse the old Bank Rock project.
