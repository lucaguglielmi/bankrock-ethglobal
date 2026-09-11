# System architecture

## Proposed components

### Mobile web application

A responsive web application opened by an NFC HTTPS link. It handles public rock pages, Privy authentication, transaction preparation and owner controls.

A native application is not required for the hackathon.

### Privy identity and signer

Privy supplies user authentication, embedded wallet creation, recovery and transaction signing. The Privy wallet acts as the human owner's signer or controller.

### Rock Registry

A contract or minimally trusted registry binds:

- public rock ID;
- Rock Account address;
- metadata reference;
- lifecycle state;
- current ownership or controller;
- replacement-tag state.

Only immutable or ownership-critical facts belong onchain. Rich presentation metadata may be stored offchain.

### Rock Account

Preferred architecture: one persistent smart account per physical rock.

The Rock Account:

- holds the rock's ERC-20 balances;
- approves Aqua;
- calls Aqua ship and dock operations;
- is controlled by the owner's Privy wallet;
- can transfer control without changing the Rock Account address;
- restricts arbitrary execution where practical.

This architecture is a proposal pending an implementation spike. Aqua compatibility and safe ownership transfer must be proven before it becomes final.

### Aqua and Bank Rock strategy

Aqua records the virtual balances for each maker, application and strategy hash. A Bank Rock strategy includes the public rock ID or an immutable derivative as its salt, allowing activity to be attributed to the physical object.

### Indexer and application database

The backend indexes contract events and maintains presentation data such as names, photos and gift messages.

It is not authoritative for:

- token ownership;
- Rock Account control;
- Aqua balances;
- completed trades.

## Trust boundaries

| Boundary | Trusted for | Not trusted for |
| --- | --- | --- |
| NFC tag | Opening the correct public URL | Identity, custody or authorization |
| Web application | Preparing transactions and explaining state | Moving funds without a signature |
| Application database | Search and presentation metadata | Financial truth |
| Privy | Authentication and wallet signing infrastructure | Deciding product-level ownership rules |
| Rock Registry | Object identity and lifecycle | Custody of trading funds |
| Rock Account | Asset custody and authorized execution | Offchain metadata |
| Aqua | Virtual liquidity accounting and strategy execution | Guaranteed yield or price safety |

## High-level transaction path

1. NFC opens the rock URL.
2. Frontend resolves public rock ID through the registry/indexer.
3. Privy authenticates the acting user.
4. Frontend prepares a Rock Account call.
5. The owner signs through Privy.
6. Rock Account interacts with Aqua or a Bank Rock Aqua App.
7. Events are indexed and reflected in the UI.

## Non-goals for the MVP

- Holding private keys on NFC hardware.
- Treating physical possession as sufficient financial authorization.
- Cross-chain liquidity orchestration.
- Fiat custody.
- Automated investment advice.
- A permissionless strategy marketplace.
