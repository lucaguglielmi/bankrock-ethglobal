# Privy authentication and wallets

## Purpose

Privy makes Bank Rock usable by people who do not already have a crypto wallet. It supplies familiar login, embedded wallet creation, recovery and signing while preserving an onchain user-controlled account.

Official reference: [Privy documentation](https://docs.privy.io/)

## Account model

There are two distinct identities:

1. **User identity:** the person authenticated through Privy.
2. **Rock identity:** the persistent account associated with the physical object.

The user wallet should control the Rock Account. The rock's funds should not be mixed with the user's unrelated wallet balances.

## Supported login methods

MVP preference:

- email one-time code;
- passkey where supported;
- existing external wallet as an optional alternative.

Social login may be added if setup is trivial, but it is not required for the demo.

## Wallet requirements

- Create or restore a wallet after authentication.
- Display a human-readable transaction summary before signing.
- Never require seed-phrase handling in the primary journey.
- Allow an existing wallet user to connect instead.
- Preserve recovery when the phone is replaced.
- Separate visitor/taker wallets from Rock Accounts.
- Use testnet and clearly label simulated or test assets.

## Authorization requirements

The preferred Rock Account should only accept actions authorized by its current controller.

High-risk actions include:

- withdrawing tokens;
- changing the controller;
- approving new contracts;
- docking or shipping strategies;
- granting delegated execution rights.

For the MVP, every high-risk action should require an explicit owner signature. Automated execution is out of scope unless constrained by an auditable policy.

## Ownership transfer

Ownership transfer must not mean transferring an embedded wallet's private key.

**Decision: ERC-4337 Controller Update with Paymasters**

Because the Rock Account is an ERC-4337 Smart Account, we can seamlessly transfer ownership while sponsoring 100% of the gas costs via a Paymaster:

- current Privy wallet authorizes a controller (owner signing key) change;
- recipient authenticates and supplies their destination Privy embedded wallet address;
- Rock Account updates its owner signing key to the new recipient;
- **Gas is sponsored by a Paymaster**, so the recipient does not need any native tokens to claim the rock;
- account address, funds and Aqua maker identity remain completely stable.

This avoids the complexity of the "dock, transfer, reship" fallback entirely.

## Failure states

The interface must handle:

- authentication cancelled;
- wallet creation unavailable;
- wrong network;
- transaction rejected;
- insufficient gas;
- insufficient token balance;
- ownership changed in another session;
- expired gift handover;
- unsupported browser.

No financial action should be reported as complete before chain confirmation.
