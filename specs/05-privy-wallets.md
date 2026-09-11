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

- withdrawing tokens to an external wallet;
- changing the controller (owner signing key);
- approving untrusted contracts;
- revoking or issuing delegated execution rights.

Every high-risk action strictly requires an explicit owner signature from the current Privy embedded wallet.

### Delegated Execution: Scoped Session Keys for MCP AI Agent

To enable the Model Context Protocol (MCP) AI agent to assist the owner without introducing financial vulnerability, the Rock Account supports an **ERC-7579 / ERC-4337 Scoped Session Key Module**:

- **Key Issuance:** The owner's Privy wallet issues an ephemeral session key credential stored within the MCP runtime environment.
- **Strict Smart Contract Guardrails:**
  - *Target Restraint:* The session key is cryptographically restricted to invoking only the official Aqua and SwapVM contracts.
  - *Method Restraint:* May only invoke `ship` and `dock` methods to rebalance liquidity.
  - *Zero External Transfer Rights:* The session key has zero permission to call `transfer`, `transferFrom`, or `approve` on any ERC-20 token toward an external address.
  - *Slippage & Parameter Ceilings:* Rebalancing operations must adhere to onchain pricing envelopes (e.g., maximum slippage tolerance of 2%).
  - *Time Expiry:* The session key automatically expires after a bounded duration (default: 24 hours), after which re-authorization by the owner is required.

## Atomic UserOperation Batching (1-Click Strategy Setup)

Standard DeFi interactions require repetitive token approvals followed by contract deposits. Bank Rock leverages ERC-4337 native batch execution (`executeBatch`):

- In a single user interaction, the Privy wallet signs one UserOperation that bundles:
  1. `USDC.approve(AquaContract, depositAmount)`
  2. `WETH.approve(AquaContract, depositAmount)`
  3. `Aqua.ship(strategyHash, SwapVMBytecode)`
- This executes atomically: either all approvals and strategy registrations succeed, or the entire operation reverts, preventing "approved but un-deposited" stranded token states.

## Gas and Paymaster Architecture

Bank Rock employs a **Dual-Mode Paymaster Strategy**:

1. **Verifying Paymaster (Onboarding & Gifting):** 
   - When a recipient claims a gifted rock or a new user awakens an unactivated rock, their Privy wallet possesses 0 native gas tokens. 
   - A Verifying Paymaster sponsors 100% of the UserOperation gas fees.
2. **ERC-20 Token Paymaster ("Self-Sustaining Rock"):**
   - As visitors execute swaps against the rock's Aqua strategy, the Rock Account accumulates trading fees in ERC-20 tokens (e.g., test USDC).
   - Once fees are accrued, subsequent operational UserOperations (such as strategy rebalancing or docking) can pay their own gas fees directly using the accumulated USDC via an ERC-20 Paymaster.
   - The rock mathematically pays for its own maintenance using its earned yield.

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
