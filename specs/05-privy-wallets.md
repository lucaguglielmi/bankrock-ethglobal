# Privy authentication and wallets

## Purpose

Privy makes Bank Rock usable by people who do not already have a crypto wallet. It supplies familiar login, embedded wallet creation, recovery and signing while preserving an onchain user-controlled account.

Official reference: [Privy documentation](https://docs.privy.io/)

## Account model

There are two distinct identities:

1. **User identity:** the person authenticated through Privy.
2. **Rock identity:** the persistent account associated with the physical object.

The user wallet should control the Rock Account. The rock's funds should not be mixed with the user's unrelated wallet balances.

**How that separation is actually produced (D-029).** Both accounts are Safe 1.4.1 smart accounts
on EntryPoint 0.7 owned by the same Privy embedded wallet, and what distinguishes them is the
CREATE2 salt:

| Account | `saltNonce` | Belongs to | Used for | Recorded on chain |
| --- | --- | --- | --- | --- |
| Rock Account | `uint256(keccak256(rawUid))` — the tag | one rock, one owner | Holding the reserve, shipping and docking | `rock.smartAccount`, written at awakening and **rewritten at every claim** (D-032) |
| Personal account | `0` | the person | Trading against *any* rock, as a visitor | never — it is not a rock's account |

So one owner's two rocks have two accounts that never pool, and one visitor has one account no
matter how many rocks they trade with. The Rock Account's address is counterfactual and derived
**server-side by the NFC verifier**, which signs it into the attestation; the client cannot choose
it (D-026). The personal account exists so a visitor's swap can be one sponsored batch and so the
taker periphery has a contract to call back into (D-030) — not because it belongs to a rock.

**What the registry records, and when (D-032).** `rock.smartAccount` is the address the registry
will admit as an actor for that rock, alongside the owner's wallet. It is set by `awakenRock` and
**rebound by `claimHandover` to the account the attestation names**, which is why a gift does not
leave the giver's Safe recorded against a rock the giver no longer owns. Two consequences follow
from the way the registry verifies that binding:

- **the named account must already report the new owner as one of its signing owners.** The
  registry asks it through `ISafeOwnerManager.isOwner` and reverts `AccountDoesNotAnswerToOwner`
  otherwise, so the `Safe.swapOwner` below has to land *before* the claim, for every caller;
- **a counterfactual account cannot be bound on claim.** An account that has never executed has no
  code and cannot answer, so it must be deployed first. The sponsored owner-swap UserOperation
  carries the `initCode` and deploys it as a side effect, so the ordinary flow never meets this.
  At *awakening* the address is still purely counterfactual and no such check applies.

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
  1. `USDC.approve(Aqua, amount)` — the approval goes to **Aqua**, never to the app
  2. `WETH.approve(Aqua, amount)`
  3. `Aqua.ship(app, strategy, [USDC, WETH], [a, b])` — the real signature (E-3, D-030)
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

## Signing (D-039)

Embedded-wallet signatures are requested without Privy's confirmation sheet
(`embeddedWallets.showWalletUIs: false`). The app's own control is the acknowledgement, so:

- a signature is requested only inside a handler that starts from a user tap on a control whose
  label names the action (Awaken, Start earning, Give, Cash in, Retire, Trade) — never from an
  effect, a timer, a route change or a network event;
- the sheet behind that control states the on-chain effect in tokens before the tap;
- one UserOperation per tap;
- external wallets keep their own confirmation; the copy says so before the tap.

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

**When the signature is produced, and by whom (D-027).** The Safe can only authorise its own owner
swap with a signature from its current owner — the giver — and the giver is by definition not
present when the recipient taps. So the giver signs
`Safe.swapOwner(SENTINEL, giver, recipient)` as a UserOperation **at the moment the gift is
created**, and it is stored until the claim. The claim route submits it **before** the registry
claim and treats only a UserOperation receipt reporting `success === true` as landed
(**order reversed by D-032**; it used to run after). Two consequences are stated rather than hidden:
an **open** handover has no recipient address to sign for, which is why the app no longer issues
one — the transfer sheet requires a named recipient and the claim route refuses to relay an open
gift, though the contract still accepts them; and the stored operation is one-shot and revocable —
cancelling the handover deletes it.

**Two different keys pay for this, and neither can redirect it.** The *attestation signer* never
transacts and holds no funds; it only states that a genuine tap happened, for a named `subject`
and `smartAccount`. The *relayer* pays gas for `claimHandover`, because the recipient has none, and
spends within `RELAYER_DAILY_CAP_WEI`. Neither can send the rock elsewhere: ownership comes from
`att.subject` inside the signature, never from `msg.sender` (D-026). The attestation signer does,
since D-032, decide *which account* the rock binds to — a power the registry bounds by asking that
account whether it already answers to the new owner. The threat model for it is in
[`15-exit-demo-mode.md`](./15-exit-demo-mode.md) Part 5.

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
