# ETHGlobal submission text

Copy for the ETHOnline 2026 project form. Every claim below is backed by the repository as of
2026-09-13: the deployed addresses are in `contracts/deployments/*.json`, the live run is
`contracts/deployments/rehearsal-2026-09-12.md`, and what is still simulated is `DEMO-STATE.md`.

## Short description (max 100 characters)

```
Tap a handmade NFC rock to see, fund, trade against or gift its own self-custodial Aqua liquidity.
```

## Description (min 280 characters)

```
Bank Rock turns a handmade rock with an NFC chip inside into the physical interface for a self-custodial, giftable liquidity account. Liquidity you can hold.

Tap the rock with a phone and its page opens. Anyone can see what the rock holds, which liquidity streams it runs, what it has earned in fees and who has owned it. Sign in with an email code or a passkey through Privy and you get an embedded wallet with no seed phrase. If you are the owner you can fund the rock, start it earning, stop it, or give it away.

Each rock has its own onchain account: a Safe smart account controlled by the owner's Privy wallet. The rock's tokens stay in that account the whole time. Through 1inch Aqua the account acts as a market maker. It "ships" virtual USDC/WETH balances to one or more constant-product strategies without depositing anything into a pool. Visitors can trade against the rock, and the trading fee stays inside the rock's own reserve. Several streams with different fee levels (Wide 30 bps, Tight 5 bps, Patient 100 bps) can share one reserve, and the UI shows actual, virtual and executable balances separately and never adds them up.

The gift is the core flow. A giver names a recipient and signs once. The recipient taps the rock, signs in on a brand-new account with zero ETH, and claims it. The registry moves ownership and the rock's smart account changes hands with everything in it: balances, live strategies and history. Every operation is gas-sponsored, so nobody ever needs to hold ETH. A rock can be retired and the same chip can awaken a fresh rock into the same funded account.

The NFC tag is an NTAG 424 DNA chip that signs a fresh URL on every tap. The server verifies that signature and a strictly increasing read counter before it will attest to a physical tap, so a copied URL proves nothing: paste it into a second browser and the badge reads "unverified". The tag identifies the object. It never holds a key and never authorises a payment. Financial ownership is always the Privy-controlled smart account.

Bank Rock also exposes a read-only MCP server, so an AI agent such as Claude can be asked "what does this rock hold, who owns it and what has it earned?" and answer from live chain state. It never invents a number.

Everything runs on Ethereum Sepolia with Circle USDC and WETH, and the whole story (awaken, ship, visitor swap, gift and claim, archive and re-awaken) has been executed end to end on chain. We show no APY and promise no yield.
```

## How it's made (min 280 characters)

```
FRONTEND. Next.js 16 (Turbopack) on React 19, Tailwind 4, shadcn/base-ui, framer-motion, and react-three-fiber for the 3D rock on the landing page. Wallets through Privy (@privy-io/react-auth) with wagmi and viem. It is an installable PWA. Deployed as a Cloudflare Worker through OpenNext, with Cloudflare D1 (Drizzle) holding the tap counter store, telemetry and presentation data. GitHub Actions deploys on push to main and applies D1 migrations before publishing the Worker.

CONTRACTS. Hardhat 3, Solidity 0.8, OpenZeppelin 5, unit and fuzz tests, verified on Sepolia Etherscan. BankRockRegistry (Ownable2Step, Pausable, EIP-712) is identity and lifecycle only: it holds no tokens, takes no approvals and has no function that can move money. awakenRock and claimHandover are authorised by an EIP-712 attestation signed by the server that verified the tap, not by msg.sender, so both can be relayed for a user with no ETH. Replay protection is on chain: the tag's read counter must strictly exceed the last one the registry accepted.

1INCH AQUA. We deployed the reference XYCSwap constant-product AquaApp, vendored unmodified, against the canonical Aqua on Sepolia. The Rock Account is the maker: it approves Aqua once and ships virtual balances, and tokens never leave its wallet. The strategy salt is keccak256(domain, rockId, streamIndex), so a rock's streams are addressable from public data alone: recompute the hash for streamIndex 0, 1, 2 and call safeBalances. A revert means "not shipped". No indexer, no database. XYCSwap settles by calling back into its caller, which must answer with Aqua.push, so an EOA or a plain Safe cannot swap against it at all. We wrote XYCSwapTaker, a stateless periphery that pulls the input, calls the app and fulfils the callback, and the visitor's swap is one sponsored approve + swapExactIn batch from their own Safe. Aqua has no fee accumulator, so realised fees are summed from Pushed events, none of which are indexed, so it is a log scan and decode.

PRIVY + ACCOUNT ABSTRACTION. Each Rock Account is a counterfactual Safe 1.4.1 on EntryPoint 0.7 built with permissionless.js, owned by the user's Privy embedded wallet, with saltNonce = keccak256(tag UID). The account follows the tag and the owner, not the rock id, so retiring a rock and tapping again awakens a new id into the same funded account. Pimlico's verifying paymaster sponsors every UserOperation. Approvals and ship go into one atomic executeBatch, and embedded-wallet signing is silent (showWalletUIs: false): the app's own button, which states the exact on-chain effect, is the confirmation. Only receipt.success counts as landed, because ERC-4337 hands back a perfectly good tx hash for an included-but-reverted operation.

GIFTING. The giver's single signature both opens the handover on the registry and pre-signs a Safe.swapOwner UserOperation that the recipient could never produce themselves. On claim our relayer lands the owner swap first (carrying initCode, so the Safe deploys as a side effect), then the registry asks the account isOwner before rebinding it, so a gift never leaves the giver's Safe recorded against a rock they no longer own. Relayer spend is capped per UTC day in D1 and unset means off.

NFC. NTAG 424 DNA with Secure Dynamic Messaging. The verifier is our own implementation from NXP's application notes AN12196 and AN10922: AES-CBC PICCData decryption, SV2 session-key derivation, RFC 4493 AES-CMAC and a 3-byte little-endian counter, tested against NXP's published worked example. The counter is monotonic in D1, so a copied URL reads "unverified" in a second browser and no client code path can paint the "Verified Physical" badge.

MCP. A TypeScript server on @modelcontextprotocol/sdk that reads the registry and Aqua over RPC with viem, plus the same fee route the rock page uses. Every tool returns live data or {status: "unavailable", reason}. It never invents a value.

HACKY BITS. (1) "Balance and ship": most people fund a rock with USDC only and a constant-product stream needs two tokens, so Bank Rock ships its own house USDC/WETH stream on the same app, and the ship UserOperation swaps half of the deposit against it through our own taker periphery before shipping. Five calls, one tap, atomic. (2) A demo-only "magic tap" route forges a genuine SDM pair for a synthetic tag with the real master key, so the whole production verify path could be rehearsed on the live site before physical chips were programmed. (3) A rehearsal script ran the entire demo on Sepolia (awaken, ship, visitor swap, named gift and relayed claim, archive and re-awaken) and committed every hash. (4) Honesty is enforced by CI: a grep fails the build if "APY" appears in any component, and a drift check compares the committed contract addresses against the deploy records. Every value on screen is REAL, UNAVAILABLE or badged SIMULATED, and no catch block invents a number.
```
