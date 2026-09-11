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
5. The user completes the separate claim proof.
6. The system creates or links the Rock Account.
7. The user funds it with the supported testnet token pair.
8. The Rock Account approves Aqua.
9. The owner selects a predefined liquidity personality.
10. The application ships the Aqua strategy and shows its confirmed status.

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

1. Visitor taps the rock and selects **Trade with this rock**.
2. If necessary, Privy creates or restores the visitor wallet.
3. The interface shows input, expected output, price impact, fee and network.
4. The visitor confirms the trade.
5. The transaction executes against the strategy associated with that rock.
6. The rock page updates its balances, virtual balances and earned fees.
7. The visitor receives a plain-language receipt.

The application must never imply that a swap is risk-free.

## Flow E — Gift an active rock

Preferred target experience:

1. Current owner selects **Give this rock**.
2. Owner chooses an expiry and optionally adds a message.
3. A pending handover is created.
4. Recipient physically receives and taps the rock.
5. Recipient signs in through Privy (Email, Passkey, or Social).
6. Recipient proves access to the separate claim secret (PIN).
7. Current owner approves the handover, or a previously signed handover policy completes it.
8. Control of the ERC-4337 Smart Account updates its owner signing key. **Gas is 100% sponsored by a Paymaster**, ensuring the recipient pays zero fees and requires no native tokens.
9. The account address and history remain completely stable.
10. Both parties receive a transfer receipt.

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
3. The interface docks the active Aqua strategies.
4. Assets are routed to a fiat off-ramp (simulated for MVP) or swapped to stablecoins and sent to an external exchange wallet.
5. This abstracts the DeFi complexity of removing liquidity.

## Flow I — AI Query (via MCP)

1. Owner interacts with their personal AI agent (e.g., in an MCP-supported chat interface).
2. Owner says, "Check the status of my Bank Rock and tell me if I should adjust my strategy."
3. The AI agent seamlessly connects to the Bank Rock MCP Server.
4. The MCP provides the rock's current balances, Aqua strategy, and historical fees.
5. The AI agent analyzes the data and responds with a natural language summary and recommendations (e.g., "Your rock earned 5 USDC this week. I recommend tightening the spread based on current volatility.").
