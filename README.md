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

What is not real yet, and why, is tracked one line at a time in
**[`DEMO-STATE.md`](./DEMO-STATE.md)** — the answer to rule 1 of
[`STEERING.md`](./STEERING.md). The plan that produced this state is
[`specs/15-exit-demo-mode.md`](./specs/15-exit-demo-mode.md); what it would take to run the demo
end to end is [`specs/18-demo-readiness.md`](./specs/18-demo-readiness.md).

No mainnet funds are involved. The target network is Ethereum Sepolia (chain 11155111).

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
