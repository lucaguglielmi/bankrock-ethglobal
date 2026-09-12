# Decision log and open questions

## Confirmed decisions

### D-001 — New repository is independent

**Decision:** bankrock-ethglobal is the only source of truth for this project.

**Consequence:** no code, specifications or assumptions should be imported from the old Bank Rock project unless explicitly reviewed and approved later.

### D-002 — NFC is not authorization

**Decision:** scanning or cloning the NFC URL cannot grant control of funds.

**Consequence:** every sensitive action requires Privy authentication and onchain authorization.

### D-003 — Web first

**Decision:** the hackathon product is a mobile-first web application opened through an NFC HTTPS link.

**Consequence:** active Web NFC APIs and native apps are not MVP dependencies.

### D-004 — No guaranteed-yield claim

**Decision:** the MVP describes trading fees, not guaranteed passive yield.

**Consequence:** APY projections and savings-account language are excluded.

## Proposed decisions requiring proof

### D-005 — One persistent smart account per rock

**Decision:** each physical rock maps to an ERC-4337 smart account controlled by the owner's Privy wallet.

**Consequence:** stable address, isolated funds and seamless ownership transfer without moving assets.

**Narrowed by D-026 and D-029:** the mapping implemented is (tag, owner) -> account, with
`saltNonce = uint256(keccak256(rawUid))`, derived server-side by the NFC verifier and bound into
the attestation. "Seamless transfer without moving assets" is realised by a pre-signed
`Safe.swapOwner` operation, not by the registry (D-027).

### D-006 — SwapVM for MVP

**Decision:** the MVP will use an existing SwapVM program rather than a Custom Aqua App.

**Consequence:** faster development and less contract security risk during the hackathon. Custom apps are deferred.

**Superseded by D-030.** What shipped is the reference `XYCSwap` AquaApp, vendored unmodified,
with one Bank Rock periphery contract (`XYCSwapTaker`) on the taker side — an explicit, justified
deviation from "zero custom contract logic", because the app's callback design makes a plain
wallet unable to swap at all. The SwapVM path stays documented, not taken.

### D-007 — Cryptographic NFC Tags (NTAG 424 DNA)

**Decision:** The project assumes the use of NTAG 424 DNA tags instead of standard NTAG213 tags.

**Consequence:** The tag generates a unique, cryptographically signed URL on every tap. This mathematically proves physical presence, completely preventing URL cloning and removing the need for a separate, clumsy PIN code for activation.

### D-008 — MCP AI Integration (Read-Only MVP)

**Decision:** The Bank Rock backend will include an MCP (Model Context Protocol) Server.

**Consequence:** Allows external AI agents (like Claude or Gemini) to connect to the rock, read its live onchain data (liquidity, fees, strategy), and provide conversational advice to the owner. The MVP scope is read-only for security.

### D-009 — Zero-Gas UX via Paymasters

**Decision:** The entire lifecycle (especially gifting) will use ERC-4337 Paymasters to sponsor 100% of the gas fees for the user.

**Consequence:** Recipients claiming a Bank Rock do not need to onboard with native tokens, dramatically improving the consumer experience.

### D-010 — Scoped Session Keys for Agentic Rebalancing

**Decision:** Support an ERC-7579 / ERC-4337 Scoped Session Key Module allowing the owner to delegate bounded execution rights to the MCP AI runtime.

**Consequence:** Enables AI agents to autonomously ship/dock Aqua strategies within tight smart contract constraints (pair restrictions, max 2% slippage, strict zero withdrawal authority to external wallets, automatic 24-hour expiry).

### D-011 — Self-Sustaining Rock via ERC-20 Token Paymaster

**Decision:** Support an ERC-20 Token Paymaster mode once the rock has accumulated trading fees from Aqua visitor swaps.

**Consequence:** Allows the rock to pay its own operational UserOperation gas fees using its earned USDC, reducing reliance on the developer's Verifying Paymaster balance and establishing the rock as an independent, self-sustaining economic object.

### D-012 — Atomic UserOp Batching for 1-Click Strategy Launch

**Decision:** Use ERC-4337 `executeBatch` to bundle token approvals (`approve`) and strategy launch (`Aqua.ship`) into a single atomic UserOperation.

**Consequence:** Eliminates the multi-step approval fatigue typical of DeFi, allowing new users to awaken and fund an Aqua liquidity stream with a single signature.

## Exit-from-demo-mode decisions

Full context, evidence and acceptance criteria for D-013 through D-022 are in
[`15-exit-demo-mode.md`](./15-exit-demo-mode.md).

### D-013 — Demo mode is explicit, labelled and opt-in

**Decision:** simulation is gated behind `NEXT_PUBLIC_DEMO_MODE`, defaulting to `false`. Every
capability resolves to `REAL`, `DEMO` or `UNAVAILABLE` at runtime.

**Consequence:** a capability that cannot reach its real backing service renders an honest empty
state instead of substituting plausible data. Simulated surfaces carry a persistent `SIMULATED`
badge. The current architecture fails open into fiction; this reverses that.

### D-014 — No synthesized transaction identifiers

**Decision:** no code path may generate a hash-shaped string. A transaction hash may only originate
from a signed, broadcast transaction.

**Consequence:** fabricated BaseScan links are deleted rather than relabelled. Where no hash exists,
no hash and no explorer link are shown.

### D-015 — One source of truth for every address

**Decision:** contract addresses and chain IDs live in a single module populated from environment
variables and validated at startup. No address literal in components, hooks, routes, MCP tools or
keeper functions.

**Consequence:** startup fails loudly if a required address is unset or has no code on the target
chain.

### D-016 — One Cloudflare adapter

**Decision:** `@opennextjs/cloudflare` is the deployment adapter; `@cloudflare/next-on-pages` is
removed entirely. Context comes from `getCloudflareContext()`.

**Consequence:** D1 becomes reachable, the two 500-ing API routes recover, and the `npm ci` peer
conflict clears.

### D-017 — Fail closed

**Decision:** the pattern `if (SECRET && mismatch) reject` is prohibited. A missing secret is a
startup failure, not an authentication bypass.

### D-018 — NFC attestation is server-side, single-implementation, and bound on-chain

**Decision:** one verifier performing real NTAG 424 DNA SDM verification — correct PICC offsets,
NXP session key derivation, CMAC, and a strictly monotonic counter in durable storage. The
`Verified Physical` badge is gated on a real CMAC match and nothing else.

**Consequence:** until that passes against a physical tag, the UI shows `unverified`. This restores
D-002, which the current stub verifier inverts.

### D-019 — MCP returns `unavailable`, never invents

**Decision:** every MCP tool either reads a real source or returns
`{ "status": "unavailable", "reason": "..." }`. No tool may return a literal balance, APR, volume
or execution status.

**Consequence:** an agent relaying tool output to a human never relays a fabrication. A stable
fabrication is more dangerous than an obvious one.

### D-020 — The registry loses the arbitrary-call primitive

**Decision:** `executeTrade` in its current form and the unguarded `setRouterWhitelist` are removed.
The registry is an identity and lifecycle registry only: it never holds funds, never receives
approvals, and never performs `call` with caller-supplied calldata.

**Consequence:** swaps execute from the Rock Account against Aqua, where spec 03 always placed them.

### D-021 — Deployment target is Cloudflare, not Vercel

**Decision:** [`12-deployment.md`](./12-deployment.md) is corrected to describe Cloudflare Pages +
OpenNext + D1.

### D-022 — The canonical origin is `bank-rock.com`

**Decision:** one `NEXT_PUBLIC_APP_URL`. No `bankrock.xyz` or `pages.dev` literal remains. The NFC
tag path is `/r/{publicRockId}` as specified in spec 06.

**Consequence:** no physical tag may be encoded until `/r/` returns 200 and the `www` redirect is
fixed.

### D-023 — Target network is Ethereum Sepolia

**Decision:** the MVP runs on Ethereum Sepolia (chain ID 11155111). Base Sepolia is abandoned.

**Consequence:** Aqua is present at its canonical address (`0x1111113ccf1426a8e30e2bff5e005d929bf6a90a`,
bytecode identical to mainnet), Circle USDC (`0x1c7D…7238`), WETH (`0xfFf9…6B14`), the full Safe
1.4.1 + EntryPoint 0.7 stack, Pimlico and Privy are all available. The SwapVM router is **not**
deployed there and is self-deployed by us from `github.com/1inch/swap-vm` at a non-canonical
address. Every `baseSepolia` import, explorer link, RPC URL, Pimlico endpoint and token address
changes. Full dependency verification is in [`16-environment-and-secrets.md`](./16-environment-and-secrets.md).

**Rejected alternatives:** Base mainnet with dust (would override spec 08's "no mainnet funds");
self-deploying both Aqua and SwapVM on Base Sepolia (two protocol deployments to own, and a
weaker "real Aqua" story).

### D-024 — One typeface, actually applied

**Decision:** Inter (variable, self-hosted through `next/font`) for all text, mapped to
`--font-sans`. Geist Mono only for hashes, addresses and code. Font sizes come from a named scale
in `@theme`; arbitrary pixel sizes and `text-xs` are removed. Full specification in
[`17-mobile-ui-and-typography.md`](./17-mobile-ui-and-typography.md).

**Consequence:** the self-referential `--font-sans: var(--font-sans)` that left the site rendering
in each device's OS font (and downloading Geist for nothing) is fixed at the source. Body text is
16 px on every device; nothing a user reads is below 13 px; text colours are semantic tokens with
verified AA contrast.

### D-025 — Mobile layout contract

**Decision:** 360 × 640 is the design viewport and 320 px the floor. No horizontal scroll on any
route, 44 × 44 touch targets, 16 px inputs, one `Sheet` primitive for every overlay (a bottom
sheet on phones), one `BottomDock` for all fixed bottom chrome, safe-area insets and `dvh`
throughout, and a header that collapses below `md`. Enforced by static greps and a Playwright
viewport matrix in CI ([`17-mobile-ui-and-typography.md`](./17-mobile-ui-and-typography.md) Part 7).

**Consequence:** the swipe-to-swap gesture (unreachable on small phones), the Aqua explainer's
background canvas and the hover-only 3D background are cut; the seven ad-hoc modals are replaced.
The user tests the result on devices; CI catches regressions.

## Implementation decisions (exit-from-demo-mode branch)

D-026 through D-032 were taken while the exit plan was implemented. Each is verified against the
code it lives in; the file is named so the claim can be rechecked.

### D-026 — The attestation names the subject and the Rock Account

**Decision:** the EIP-712 struct the registry accepts is, exactly:

```
Attestation(uint256 rockId,bytes32 uidHash,uint32 counter,uint256 deadline,address subject,address smartAccount)
```

signed under the domain `BankRockRegistry` / version `1` / chain 11155111 / `verifyingContract` =
the registry (`EIP712("BankRockRegistry", "1")` in `BankRockRegistry.sol`). Ownership comes from
`att.subject`; `msg.sender` is not an input to any attested decision. `awakenRock(rockId,
smartAccount, att, sig)` requires `att.smartAccount == smartAccount`. `claimHandover(rockId, att,
sig)` **binds** the field: **superseded by D-032**, which makes the claim write
`rock.smartAccount = att.smartAccount` and require that account to already answer to `att.subject`.
The signer populates the field on both paths; it is never zero.
Owner-gated actions (`initiateHandover`, `cancelHandover`, `archiveRock`, `markLost`,
`clearLost`) accept either the owner's wallet or the rock's own Safe as `msg.sender`.

**Consequence:** both attested calls are relayable. An awakening can be a gas-sponsored UserOp
from the rock's Safe or a transaction from an operator relayer; a claim is relayed by the server
(D-027). A user who has just tapped a rock never needs a funded wallet. An attestation is a bearer
token, but a narrow one: the only address it can enrich is the `subject` the attester named, and
it is spent when it lands, because its counter is consumed.

**Rationale:** a `msg.sender == subject` rule would have made gasless flows impossible without
closing the front-running gap it appears to close — an observer who captures a mempool
attestation could still re-submit it naming a Safe of their own, leaving the rock owned by the
right person but custodied at the attacker's address. Covering `smartAccount` in the signature
closes that; requiring a particular sender does not.

**Files:** `contracts/contracts/BankRockRegistry.sol` (struct, `ATTESTATION_TYPEHASH`,
`_consumeAttestation`, `_requireRockController`); `web/src/lib/nfc/attestation.ts`;
`web/src/lib/rock-account.ts` (`toContractAttestation`, `checkAwakenAttestation`);
`web/src/lib/rock-account.server.ts` (`verifyAttestation` rebuilds the domain server-side and
never trusts the client's copy).

### D-027 — Ownership transfer only through a pending handover

**Decision:** there is no immediate `transferOwnership(rockId, newOwner)`. Every change of object
ownership goes through `initiateHandover` → `claimHandover`, including the case where the giver
already knows the recipient's address. Control of the Rock Account moves separately: the giver
pre-signs a `Safe.swapOwner(SENTINEL, giver, recipient)` UserOperation at initiate time; it is
stored server-side and submitted **before** the registry claim (**order reversed by D-032**, which
makes the claim refuse an account that does not yet answer to the new owner).

**Consequence:** provenance is uniform — a rock changes hands exactly when someone holding the
physical object presents a fresh attestation — and a compromised owner key cannot hand the object
to an attacker who never held it. The claim is relayed from `RELAYER_PRIVATE_KEY`, because the
recipient has no gas and the Safe is still the giver's at that moment. Two consequences are
stated rather than hidden: an **open** handover (`recipient == address(0)`) cannot be pre-signed,
which is why **D-032 removed open gifts from the app entirely** — the transfer sheet requires a
named recipient and the claim route refuses to relay an open gift, though the contract still accepts
one; and the stored operation is one-shot and revocable — the claim route deletes it after
submitting, and cancelling the handover discards it.

**Rationale:** two on-chain shapes for one real-world event would make the history unreadable:
some transfers proven by a tap, some not, distinguishable only by which function was called.

**Files:** `contracts/contracts/BankRockRegistry.sol` (contract-level NatSpec, `initiateHandover`,
`claimHandover`, `cancelHandover`); `web/src/lib/rock-account.server.ts`
(`buildSwapOwnerUserOpCall`, `submitSignedUserOp`, `submitClaimHandover`);
`web/src/app/api/rocks/[id]/pending-userop/route.ts`; `web/src/app/api/rocks/[id]/claim/route.ts`.

### D-028 — Archive and start over

**Decision:** `archiveRock(rockId)` is the one-way exit. It is owner-gated, cancels any pending
handover (emitting `HandoverCancelled` before `RockArchived`), sets `RockState.Archived`, and
deletes the UID binding so `rockIdForUid(uidHash)` returns 0 and the tag may awaken a *different*
rock id. The archived record keeps its owner, smart account and UID hash as readable history;
there is no `unarchive`. `lastCounter(uidHash)` is deliberately **not** reset: replay protection
follows the tag, not the rock.

**Consequence:** the awakening beat can be rehearsed repeatedly with one physical tag. **The tag
URL never changes** — SDM rewrites only `e` and `c` on each read, and the path is written once
(spec 18 §4.2) — so the number in the path is a hint, not the answer. The verifier therefore
resolves the *effective* rock after the CMAC match and before the counter advance, and reports how
it did so: `bound` (the registry maps this UID to a rock), `url` (tag unbound, the id on the tag
is dormant and free), `next_free` (tag unbound, the id on the tag is archived or already awake),
or `registry_unavailable` (the registry could not be read; the tag's id is echoed and nothing is
claimed about it). The attestation is signed for the effective id, never for the URL id.

**Rationale:** allocating a fresh rock per tap would break Flows C and D and contradicts the
registry's own `UidBoundToDifferentRock` rule (spec 18 §4.3).

**Files:** `contracts/contracts/BankRockRegistry.sol` (`archiveRock`, `lastCounter`,
`rockIdForUid`); `web/src/lib/nfc/rock-resolution.ts`;
`web/src/app/api/nfc/verify/route.ts`; `web/src/app/r/[id]/page.tsx`.

### D-029 — One Rock Account per physical rock, per owner

**Decision:** the Rock Account is a Safe 1.4.1 on EntryPoint 0.7 whose single owner is the user's
Privy embedded wallet, with `saltNonce = uint256(uidHash)` — the same `keccak256(rawUid7Bytes)`
the registry binds and the attestation signs. It is derived **server-side** by the verifier and
signed into the attestation; a client-supplied `smartAccount` is ignored, not honoured. A
visitor's taker account is a *personal* Safe with `saltNonce = 0`, not tied to any tag.

**Consequence:** this narrows spec 03's "each physical rock maps to a persistent smart account".
The mapping is (tag, owner) → account, not rock id → account. Two rocks held by the same person
have two accounts whose balances never pool; the same tag under two owners yields two addresses;
and a tag whose rock was archived awakens the *next* rock id into the *same* account for the same
owner, which is what D-028's rehearsal loop needs — **narrowed by D-037**: that last clause holds
only while the owner archiving is the one whose wallet derived the account, which a gift makes
false. The address is counterfactual, so the verifier
can quote it inside the signed attestation before any transaction exists. The rock id is
deliberately not in the salt: it is not settled at the moment of the tap.

**Files:** `web/src/lib/rock-account.ts` (`rockAccountSaltFor`, `computeRockAccountAddress`,
`PERSONAL_ACCOUNT_SALT`); `web/src/lib/nfc/rock-resolution.ts` (`resolveSmartAccount`);
`web/src/hooks/useRockAccount.ts`; `web/src/hooks/useTakerActions.ts`.

### D-030 — Aqua through the reference XYCSwap app plus a Bank Rock taker periphery

**Decision:** the Aqua path is the reference constant-product `XYCSwap` AquaApp, vendored
unmodified and deployed by us, against the canonical Sepolia Aqua. The SwapVM router is not
deployed; that path stays documented as the alternative
(`contracts/scripts/deploy-swapvm-router.md`). One Bank Rock contract sits on the Aqua path:
`XYCSwapTaker`, the taker-side periphery.

**Consequence — an explicit deviation from D-006's "zero custom contract logic", and why it is
unavoidable:** `XYCSwap.swapExactIn` settles by calling `xycSwapCallback` back into its *caller*,
which must answer by pushing the input into Aqua. An EOA cannot answer it and a plain Safe would
push nothing, so **a plain wallet cannot swap against the app at all**. `XYCSwapTaker` pulls the
input from the taker, calls the app naming the taker as `to`, and fulfils the callback. It holds
no funds between transactions, gates its public callback on a transient in-progress slot, and
contains no pricing or accounting logic — it is periphery, the analogue of a swap router, not a
strategy. The strategy logic is still entirely 1inch's.

**The encoding it settles (E-4):**

| Item | Value |
| --- | --- |
| Strategy struct | `Strategy { address maker, token0, token1; uint256 feeBps; bytes32 salt }` |
| Salt domain | `keccak256("bankrock.aqua.strategy.v1")` |
| Salt | `keccak256(abi.encode(SALT_DOMAIN, rockId, streamIndex))` — spec 04's strategy salt |
| `strategy` | `abi.encode(Strategy)` — 160 bytes, five words |
| `strategyHash` | `keccak256(strategy)`, recomputed by the app on every call |
| Approval | the maker approves **Aqua**, once, for every strategy — never the app |
| Taker approval | the taker approves the **periphery**, which is the opposite rule |

Because the hash is recomputable from a public rock id and the Rock Account address, **a rock's
strategies are addressable without an indexer**: build the hash for `streamIndex = 0, 1, …` and
call `safeBalances`. A revert means "not shipped"; a success means "live, and here are the virtual
balances".

**Fee model:** there is no fee accumulator anywhere. The app prices a trade off
`amountIn·(10000−feeBps)/10000` while the full gross `amountIn` is pushed back into the maker's
wallet and virtual balance, so the fee is the unpriced slice of the input. Fees therefore accrue
*inside the rock's own reserve* and show up as growth of the invariant `k`; there is nothing to
claim and no `feesAccrued` to read. The UI shows the **rate** as `feeBps` read from the strategy
(authenticated, because a strategy differing by one basis point hashes differently and has no
balances), and the **cumulative amount** as `Σ Pushed.amount · feeBps / 10000` over that
strategy's `Pushed` events, excluding the two the ship emits per token at launch. When the RPC
cannot serve the log range the cumulative figure is `UNAVAILABLE`; it is never derived from
balance deltas, which are P&L, not fees. Nothing here is annualised (D-004).

**`dock` returns nothing**, because nothing ever left: shipping is an allowance over balances
that stay in the maker's wallet. Docking zeroes the virtual balances and must list every token of
the strategy in one call. Flow H's withdrawal *is* the dock; any transfer afterwards is a separate
act by the maker.

**Quoting:** `XYCSwap.quoteExactIn(strategy, zeroForOne, amountIn)` is the quote source — the
identical code path `swapExactIn` runs, on the same block's balances. `quoteExactOut` is **not**
its inverse: the reference app takes its fee off the input when quoting an exact input and off the
output when quoting an exact output, so a round trip returns roughly `feeBps` high. Bank Rock's
swap path is exact-in only, so the asymmetry never reaches a user.

**Files:** `contracts/contracts/aqua/NOTES.md` (the full reading), `UPSTREAM.md` (provenance and
licence), `XYCSwapTaker.sol`; `contracts/scripts/deploy-aqua-app.js`;
`web/src/lib/aqua/{strategy,calls,quote,read,events,config}.ts`; `web/src/hooks/useTakerActions.ts`.

### D-031 — The phone-first UI contract is delivered, and the checks are mechanical

**Decision:** [`17-mobile-ui-and-typography.md`](./17-mobile-ui-and-typography.md) phases U0–U4
are done in code — Inter wired through `next/font`, the named type scale with `text-xs` removed
from the theme, the contrast tokens, the page frame with safe-area insets and `dvh`, the collapsing
header, `BottomDock`, and one `Sheet` primitive behind every overlay. The static
definition-of-done greps from spec 15 Part 7 and spec 17 Part 7 live in one runnable script,
`scripts/spec-checks.sh`, which prints a spec ID per check and exits non-zero on any failure.

**Consequence:** `bash scripts/spec-checks.sh` runs **20 checks** and the CI job that runs it is
**blocking** — `continue-on-error` is gone, so a single failure stops the pull request. U4 landed too: `e2e-responsive` runs
the Part 7 browser checks (items 1–9, including `axe-core` colour-contrast and target-size) over
the route × viewport matrix against a production build with `NEXT_PUBLIC_DEMO_MODE=true`, so
every surface renders. The `SIMULATED` badge, the demo banner and every `UNAVAILABLE` empty state
are built to the contract rather than retrofitted, and are rendered into the layout so they
survive a screenshot.

**Two limits, stated rather than implied:** the e2e job configures **no chain**, so `/rock/*`
reads `UNAVAILABLE` and the checks that need a live rock (items 7 and 8) *skip with a reason*
rather than fail — point the job at a deployed registry and they exercise the real sheets. And
item 10, the Lighthouse mobile budget, is not run in CI: it needs a throttled run against a public
deployment, and stays manual, as does device testing.

**Files:** `scripts/spec-checks.sh`; `.github/workflows/ci.yml` (`spec-checks` and
`e2e-responsive` jobs); `web/playwright.config.ts`, `web/e2e/responsive.spec.ts`,
`web/e2e/helpers.ts`; `web/src/components/ui/` (`sheet`, `button`, `icon-button`, `bottom-dock`,
`amount`, `address`, `tx-hash`, `code-block`, `simulated-badge`, `demo-banner`,
`unavailable-state`).

### D-032 — A claim binds the Rock Account, and the registry verifies the binding

**Decision:** `claimHandover(rockId, att, sig)` no longer ignores `att.smartAccount`. It writes
`rock.smartAccount = att.smartAccount` and then requires that account to **already** report the new
owner as one of its signing owners, through the same `ISafeOwnerManager.isOwner` staticcall the
owner-action gate uses. A claim that names an account which does not answer to `att.subject` reverts
`AccountDoesNotAnswerToOwner(account, owner)`; a claim that names the zero address reverts
`InvalidSmartAccount(0)`. This supersedes the last sentence of D-026 — *"`claimHandover`
ignores the field […] and the signer sets it to zero there"* — which is no longer true of
either the contract or the signer.

**Consequence:**

1. **A counterfactual Rock Account cannot be bound.** An ERC-4337 account that has never executed
   has no code, so it cannot answer `isOwner` and the claim reverts until it exists. That is
   intended: an address that has never executed anything cannot be shown to answer to anybody.
   The sponsored path deploys the account as a side effect of the owner-swap UserOperation, so the
   ordinary flow never meets this.
2. **The Rock Account owner swap must land before the claim, not after.** D-027 had the claim route
   submit the pre-signed `Safe.swapOwner` *after* the registry claim; the order is now reversed, and
   it is an invariant of the contract rather than a convention of one caller.
3. **The relayed claim route enforces four more things** before it spends gas
   (`web/src/app/api/rocks/[id]/claim/route.ts`): it executes the stored owner swap first and treats
   only a UserOperation receipt with `success === true` as landed; it **refuses open gifts**
   outright; it refuses an attestation with less than **90 seconds** of life left, because the first
   half of the sequence is irreversible and the second half must still be mined before
   `att.deadline`; and it reserves against `RELAYER_DAILY_CAP_WEI` before broadcasting, releasing
   the reservation on either failure path.
4. **The app requires a named recipient for every gift.** The transfer sheet has no "leave it
   open" affordance. Open handovers (`recipient == address(0)`) remain a contract capability — the
   registry still accepts them and `initiateHandover` still documents the zero address — but **no
   app path issues one**, and the claim route refuses to relay one. Spec 02 Flow E and spec 05's
   ownership-transfer section are updated accordingly.

**Rationale:** the cold re-review (spec 19 Part 3, finding `N-1` in
[`../contracts/audit/2026-09-12-signoff.md`](../contracts/audit/2026-09-12-signoff.md))
showed that leaving `smartAccount` alone across a change of owner left the
*giver's* Safe recorded as the rock's account, and therefore as one of the two addresses the
owner-action gate admits. A Safe's owner set is writable by the Safe, so the giver could add the
recipient as a signer for one batched transaction, `archiveRock` the recipient's rock — which
is terminal — and remove the signer again. Rebinding on claim fixes that only if the attester
names the right account; the on-chain `isOwner` check makes it true for every caller, including a
self-relayed claim and a hand-built Etherscan call.

**Threat model (the new power this gives the attester):** see
[`15-exit-demo-mode.md`](./15-exit-demo-mode.md) Part 5, row *"Attester chooses which account a rock
binds to"*. In short: the attestation signer now decides, at claim time, which account a rock binds
to. The on-chain `isOwner` check is the mitigation; the residual is attester key compromise, which
is a transfer of title, rotatable through `setAttester`.

**Files:** `contracts/contracts/BankRockRegistry.sol` (`claimHandover`, `_accountAnswersTo`,
`AccountDoesNotAnswerToOwner`, the `HandoverClaimed` event's new `smartAccount` argument);
`contracts/test/BankRockRegistry.t.sol`
(`testAClaimRebindsTheRockAccountToTheOneTheAttestationNames`,
`testAClaimIsRefusedWhenTheBoundAccountDoesNotAnswerToTheNewOwner`,
`testAClaimCannotBindACounterfactualAccount`); `contracts/test/audit/BankRockRegistryReview.t.sol`
(both `testReview_N1_*` proofs-of-concept); `web/src/app/api/rocks/[id]/claim/route.ts`;
`web/src/lib/rock-account.server.ts` (`submitSignedUserOp`'s receipt check, `reserveRelayerSpend`);
`web/src/lib/nfc/rock-resolution.ts` (`resolveSmartAccount`).

### D-033 — Ethereum Sepolia is the only chain

**Decision:** the chain module (`web/src/lib/chain/index.ts`) rejects any `NEXT_PUBLIC_CHAIN_ID`
other than `11155111` at startup. `parseChainIdEnv` accepts only Sepolia's chain id or an unset
value (which defaults to it); any other integer, including `84532` (Base Sepolia), throws the same
explicit error it always has. `chain` is `sepolia`; there is no `baseSepolia` import anywhere in
the module.

**Why:** every contract this app talks to — the registry, the Aqua app, the taker periphery, the
canonical Aqua deployment, Circle USDC and WETH — is deployed on Ethereum Sepolia only (D-023).
Accepting another chain id would silently point the app at addresses that do not exist on it,
which is exactly the failure mode D-015 exists to prevent.

**Consequence:** a misconfigured `NEXT_PUBLIC_CHAIN_ID` fails the process at module load, loudly,
rather than degrading into reads against the wrong network.

### D-034 — Configuration has one source of truth per kind, and non-secret configuration is in git

**Decision:** every value the running application reads lives in exactly one of three homes, chosen
by what kind of value it is, and never in two:

1. **Non-secret, account-independent configuration is in git**, in `web/wrangler.jsonc` `vars`:
   `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_DEMO_MODE`, all six addresses,
   `REGISTRY_DEPLOY_BLOCK` (`11689716`), `AQUA_APP_DEPLOY_BLOCK` (`11689724`) and
   `RELAYER_DAILY_CAP_WEI` (`20000000000000000`, 0.02 ETH per UTC day). The addresses are copied
   from `contracts/deployments/sepolia.json` and `contracts/deployments/sepolia-aqua-app.json`.
2. **Account-specific public identifiers are GitHub Actions inputs**, not git:
   ~~`NEXT_PUBLIC_PRIVY_APP_ID` as a repository *variable*~~ (amended 2026-09-12: the Privy app id is a
   public identifier and lives in `wrangler.jsonc` `vars` with the addresses), `NEXT_PUBLIC_PIMLICO_API_KEY` as a
   repository *secret* (browser-visible by construction, but still a key).
3. **True secrets are encrypted secrets on the Worker** — RPC URL, every private key, the NFC
   master key, `ADMIN_*`, `CRON_SECRET`, `RESEND_API_KEY`, the webhook secret — set by hand, never
   in git and never in a workflow.

**Consequence:**

1. **The Cloudflare dashboard's *Variables* pane is not a place configuration lives.**
   `wrangler deploy` deletes every plain-text variable on the Worker and re-sets exactly the `vars`
   block from the file (`keep_vars` is not set, and must not be); secrets are never deleted by a
   deploy. So committed configuration cannot drift, and a value typed into the Variables pane
   silently disappears at the next deploy. A value that is merely account-specific rather than
   confidential — `ALERT_FROM_ADDRESS`, `ALERT_EMAIL_ADDRESS`, `WEB_PUSH_SUBJECT`,
   `NXP_KEY_DIVERSIFY*` — is therefore set as a **Secret**, which is the only home on the Worker
   that survives a deploy.
2. **The build needs the public values, and the runtime needs them too.** Next inlines
   `process.env.NEXT_PUBLIC_*` at build time — **verified, not assumed**: with the values exported,
   `opennextjs-cloudflare build` puts the literal `registryAddress:"0x2A3101Fc…F757"` into *both* a
   client chunk and the server bundle (11 files under `.open-next/`), while a server-only variable
   left unset at build (`AQUA_APP_DEPLOY_BLOCK`) appears nowhere and is emitted as a runtime
   `process.env` read. So `web/scripts/export-public-vars.mjs` parses the JSONC config and prints
   the `NEXT_PUBLIC_*` vars as `KEY=VALUE`, and `deploy.yml` appends them to `$GITHUB_ENV` before
   the build. The runtime half needs nothing extra: `@opennextjs/cloudflare`'s `populateProcessEnv`
   copies every string binding — `vars` and secrets — into `process.env` on the first request.
   Changing [1] or [2] therefore requires a **re-deploy**, not a restart.
3. **Drift between the committed configuration and the deploy records is a blocking CI failure.**
   `scripts/spec-checks.sh` gains check `D-034` (the script now runs **21** checks; the counts in
   spec 15 Part 7 and spec 18 still say 20 and are stale): the address and deploy-block `vars` must
   equal `contracts/deployments/*.json`, case-insensitively for addresses. That is the bug this
   decision exists to prevent — a stale address is inlined into the bundle and points the whole app
   at a contract we did not deploy, on a deploy that looks green.
4. **D-013 is now asserted twice.** `wrangler.jsonc` sets `NEXT_PUBLIC_DEMO_MODE` to `"false"`, the
   deploy job still pins the same value in its job environment (which spec check `D-013a` asserts),
   and the export step fails the deploy outright if the file ever says anything else. Production
   can never be a simulation by accident.
5. **The operator's remaining work is two lists and nothing else:** the Worker's secrets, and the
   four GitHub inputs (two deploy credentials, two identifiers). Spec 16 §2.3.

**Files:** `web/wrangler.jsonc` (the `vars` block); `web/scripts/export-public-vars.mjs`;
`.github/workflows/deploy.yml` (the export step and the two new job env entries);
`scripts/spec-checks.sh` (check `D-034`); `web/.env.example` (regrouped by home);
`specs/12-deployment.md` (*Configuration model (D-034)*); `specs/16-environment-and-secrets.md`
(§2.2 "Where it lives in production", §2.2a, §2.3); `DEMO-STATE.md` §3.

### D-035 — The keeper is deleted rather than rewritten

**Decision:** `web3-functions/bankrock-keeper` (the Gelato Web3 Function), `web/src/app/api/keeper`,
`web/src/lib/aqua-keeper.ts`, the `keeper_rebalance` alert topic and the MCP `run_aqua_keeper` tool
are removed outright. Nothing in their place attempts to rebalance anything.

**Why:** the keeper targeted a contract interface that does not exist (spec 15 X-7) — it read Base
mainnet USDC against a Sepolia registry and called a `rebalance` function absent from the 1inch
router it pointed at. It was a badged `DEMO` beat with no demo value: it could not execute, could
not be shown executing, and rewriting it against the current registry and Aqua path would still
leave it with no authorization mechanism to move a Rock Account's funds (the ERC-7579 scoped
session key module it would need is cut from MVP scope, spec 15 Part 6). A real rebalancer belongs
after the hackathon, alongside the rest of spec 13's roadmap.

**Consequence:** DEMO-STATE rows S-2 and W-3 are removed — their condition ("or deleted") is met.
Spec 15 Part 8 marks X-7 closed by deletion rather than by a rewrite. `/api/alerts/gelato` is
unaffected: it is a generic operational-alert delivery route, not the keeper, and stays.

**Files:** `web3-functions/` (deleted); `web/src/app/api/keeper/` (deleted);
`web/src/lib/aqua-keeper.ts` (deleted); `web/src/lib/alerts.ts` and
`web/src/components/rock-alerts.tsx` (`keeper_rebalance` topic removed); `mcp/index.ts` and
`mcp/config.ts` (`run_aqua_keeper` tool and its `noKeeper` reason removed);
`scripts/spec-checks.sh` (D-022 check no longer walks `web3-functions/`).

### D-036 — A public RPC is acceptable for the demo; a keyed provider is recommended, not required

**Decision:** `SEPOLIA_RPC_URL` must be set (unset keeps the indexer `UNAVAILABLE`, D-015), but its
value may be a public endpoint. `https://ethereum-sepolia-rpc.publicnode.com` is reachable from
the Worker, from GitHub Actions and from the agent sandbox, reports chain 11155111, and on
2026-09-12 served filtered `eth_getLogs` over 2,000-block (129 ms) and 10,000-block (521 ms)
ranges against the registry address, which is what `lib/indexer.ts` asks for in 2,000-block
chunks. It refused an *unfiltered* 2,000-block query, which nothing in the app issues.

**Consequence:** spec 16 #4 and DEMO-STATE K-7 no longer say "public RPCs reject the log ranges
the indexer needs" as a fact about every public RPC; they say that a keyed provider (Alchemy,
Infura) is recommended for demo day because a public endpoint's rate limit is shared with
strangers, and that the public endpoint above is a working default. The MCP process reads the
same variable (spec 11) and was proven against the deployed registry with it.

**Files:** `specs/16-environment-and-secrets.md` (#4); `specs/18-demo-readiness.md` (Part 2.2, "RPC");
`DEMO-STATE.md` (K-7).

### D-037 — For an awakened rock, the Rock Account is the registry's, and authority is the Safe's answer

**Decision:** once a rock has been awakened, its Rock Account is whatever
`getRock(rockId).smartAccount` reports. The app reads that address and never re-derives one for a
rock that exists. Whether the signed-in wallet may act from it is established by asking that
account — `isOwner(wallet)`, the same `ISafeOwnerManager` staticcall the registry's
`_accountAnswersTo` makes — rather than by recomputing a salt and comparing addresses. Derivation
survives in exactly two places, both of which are "there is no account to read yet": the
counterfactual address the NFC verifier signs into an **awakening** attestation (D-029), and a
visitor's personal taker Safe (`PERSONAL_ACCOUNT_SALT`).

**Why:** the live Sepolia rehearsal's dry run (spec 20 WP-2) walked into it at step 5. D-029 salts
the Rock Account by the tag, so the address is a function of (owner wallet, tag); D-032 makes a
claim swap the Safe's single owner to the recipient and rebind `rock.smartAccount` to that *same*
Safe, so after a gift the rock's account is still the address the **giver** derived. The recipient
derives a different, empty address, and `useBankRock` refused the mismatch with "This wallet does
not control this rock's Rock Account". The registry accepted her all along — its owner gate admits
the owner's own wallet, or the rock's account while that account answers to the owner — so the
refusal was the app's alone: **every owner action (retire, give, ship, dock, cash in) was
unreachable in the app for the new owner of every gifted rock.**

**Consequence:**

1. **Owner actions survive a gift, gaslessly.** The recipient's actions are sponsored
   UserOperations from the rock's own account, which is what the registry's gate admits and what
   Pimlico sponsors. She never needs a funded wallet — the rehearsal's step 5 no longer tops up
   the recipient's EOA to send `archiveRock` from it, and no longer carries a FINDING.
2. **Two conditions, both stated before a transaction is built.** `ownerActionAuthority` refuses
   with `This rock is owned by a different wallet` when the wallet is not the registry's owner, and
   with `This account answers to a different wallet` when the account's own answer is no. A
   retired rock refuses with `This rock is retired, so it has no owner actions left`, and an
   account with no code with `This rock's account has not executed anything yet, so it answers to
   nobody` — the `code.length` half of the on-chain gate, and the same fact that stops a claim
   binding an unexecuted account (D-032 consequence 1). No branch fabricates a state (D-013).
3. **The address is knowable while signed out.** It comes from the registry, not from a wallet, so
   balances, the Aqua reserve and the position card read the same account for every visitor. Only
   *authority* depends on who is signed in.
4. **The server side was already consistent, and stays.** `resolveSmartAccount` names the
   registry's account for a rock that is `awake` or `handover_pending` (`mode: "claim"`) and
   derives only when there is no such record (`mode: "awaken"`). Nothing there changed.
5. **What a gift does not carry into the next rock, stated rather than papered over.** Archiving
   releases the tag (D-028), so the following tap is an awakening — and `awakenRock` requires the
   attestation to name the account it binds, for a tag the registry no longer maps. The only
   account the verifier can name there is the counterfactual one (new owner, tag) derives, so
   **a rock that was gifted and then retired leaves its reserve in the old account**: the
   recipient still owns that Safe and can move its tokens with its own owner key, but no rock
   record names it any more and the app offers no screen for it. D-029's line "a tag whose rock
   was archived awakens the next rock id into the *same* account for the same owner" is true only
   while the account was derived by that owner — that is, for the rehearsal loop without a gift in
   it. Making the reserve follow would mean naming an archived rock's account in a new rock's
   attestation, which the contract would accept (`awakenRock` runs no `isOwner` check) but which
   would blur one account across two provenance histories; it is not done, and no contract change
   is proposed for it.

**Files:** `web/src/lib/rock-account.ts` (`planRockAccount`, `ownerActionAuthority`,
`readAccountAnswersTo`, `interpretAccountAnswer`, the reason constants);
`web/src/lib/chain/abi/safe.ts` (the read-only `isOwner` / `getOwners` ABI);
`web/src/hooks/useBankRock.ts` (`ownerClientFor` reads the account and asks it; `derivedAccountFor`
is the awakening path and is named for it; `buildSmartAccountClient` takes an explicit `address`);
`web/src/hooks/useRockAccount.ts` (one hook for "which account" and "may this wallet act");
`web/src/components/rock-interface.tsx`, `rock/owner-menu.tsx`, `rock/rock-awake.tsx`,
`aqua-position-card.tsx` (owner buttons disabled with the reason, never silently absent);
`web/src/lib/rock-account.authority.test.ts`; `web/scripts/rehearse-sepolia.ts` (step 5).

## Open product questions

1. **Is the hackathon's main story gifting, a public micro-exchange, or both?** Gifting is the core product journey; public tap-to-trade is the primary demonstration of the liquidity.
2. **Should a dormant gift earn fees before the recipient claims it?** Yes, the rock is active and controlled by the giver until the handover is complete.
3. **Which two testnet tokens and which supported network provide the most reliable Aqua demo?** Resolved by D-023: Ethereum Sepolia, Circle USDC and WETH.
4. **Should anyone be allowed to trade with a rock, or only invited visitors?** Anyone who scans the rock can trade with it to maximize demo interactivity.
5. **Are rock names globally unique, edition-local or cosmetic?** Cosmetic. The public rock ID is the only globally unique identifier.
6. **What information remains after an owner requests privacy?** The public rock ID, active strategies, and total balances (as they are onchain). Only presentation metadata (name, photo) is hidden.
7. **What fee, if any, does Bank Rock itself charge?** Zero for the MVP.
8. **Is the initial custom strategy AMM-like, fixed-price or time-limited?** Constant-product (AMM-like).
9. **Does ownership transfer preserve the maker address in the selected account architecture?** Yes, the ERC-4337 smart account architecture explicitly guarantees this.
10. **Which sponsor-specific requirements must be reflected in the final demo?** The demo must clearly highlight Privy onboarding and 1inch/Aqua liquidity provision.
11. **Which network actually hosts a usable Aqua deployment, and at what address?** Verified 2026-09-12 — see [`15-exit-demo-mode.md`](./15-exit-demo-mode.md) §1.3 C-4. Canonical deterministic addresses from the official READMEs are Aqua `0x1111113ccf1426a8e30e2bff5e005d929bf6a90a` and SwapVM router `0x111111338c5091e8440b67b168bae16a668ac0de`. **Neither exists on Base Sepolia**, nor on Arbitrum, OP or Unichain Sepolia. Both exist on Base mainnet. Aqua alone exists on Ethereum Sepolia; the SwapVM router does not, but the swap-vm repo ships Sepolia ignition parameters for self-deploying it. **Resolved by D-023:** Ethereum Sepolia, against the canonical Aqua. **Closed by D-030:** no SwapVM router is deployed at all — the app is the reference `XYCSwap`, deployed by `contracts/scripts/deploy-aqua-app.js`. The router path is written up but not taken (`contracts/scripts/deploy-swapvm-router.md`), and it names `AquaSwapVMRouter`, not `SwapVMRouter`, as the module that can read Aqua balances.

12. **How are Aqua strategy bytes encoded (E-4)?** Resolved 2026-09-12 by reading the vendored
    source, and pinned by tests on both sides. **Fact — XYCSwap (the path taken):**
    `strategy = abi.encode(XYCSwap.Strategy{maker, token0, token1, feeBps, salt})` and
    `strategyHash = keccak256(strategy)`, with
    `salt = keccak256(abi.encode(keccak256("bankrock.aqua.strategy.v1"), rockId, streamIndex))`.
    **Fact — SwapVM (the documented alternative):** `strategy = abi.encode(order)` and
    `strategyHash == swapVM.hash(order)` for an Aqua-mode order, straight out of swap-vm's own
    `test/solidity/base/AquaStrategyBuilders.sol`; `ISwapVM.hash` documents itself as
    `keccak256(abi.encode(order))` for Aqua orders. What remains unsolved on that path is the
    *program* bytes, not the envelope: `order.data` is SwapVM bytecode assembled by
    `ProgramBuilder` in **Solidity only** — `@1inch/swap-vm` is still not on npm and its
    `package.json` has no `main` or `exports` — so program bytes would have to come from a
    committed Foundry script or a TypeScript port. That cost, not the encoding, is why D-030 took
    the XYCSwap path. See `contracts/contracts/aqua/NOTES.md` §3 and §8.8.

## Implementation spikes

Complete before broad frontend work:

1. Confirm chosen Aqua deployment and test-token availability.
2. Prove Aqua maker operations from a candidate Rock Account.
3. Execute a swap and reconcile actual versus virtual balances.
4. Change Rock Account controller between two Privy wallets.
5. Test the NFC URL on iPhone and Android.
6. Demonstrate that a copied URL has public access only.
