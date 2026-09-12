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

**Amended by D-033 (spec 20).** The prohibition is on *promised* returns: no APY, no APR, no
projection, nothing annualised, nothing "guaranteed". A real lending-vault position may be called
*savings* and may show one realised figure — what the vault has actually paid so far, in the
asset. Privy's `user_apy` / `app_apy` are stripped on the server and a CI grep keeps them out of
the client (spec 20 Part 7).

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
owner, which is what D-028's rehearsal loop needs. The address is counterfactual, so the verifier
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

### D-033 — Savings run on Privy Earn, on Base mainnet, from the embedded wallet

**Decision:** Bank Rock integrates Privy Earn against one vault configured in the Privy dashboard
(a Morpho USDC vault on Base mainnet — the self-serve option; no testnet vault exists), and the
wallet that deposits is the user's Privy embedded wallet itself. The Rock Account, the registry
and Aqua stay on Ethereum Sepolia. Fee share 0 %.

**Consequence:** savings belong to the person, not the rock — the same position shows on every
rock they own and a gift does not move it, and the UI says so. This is the only mainnet money in
the project: the user's own USDC, in their own wallet's name, never held or approved to Bank Rock.
Spec 08's "no mainnet funds" narrows to "no mainnet funds in any Bank Rock contract or key".
D-004 is amended, not broken (see there). Full reasoning: [`20-privy-earn-and-hackathon-qualification.md`](./20-privy-earn-and-hackathon-qualification.md) Part 2.

**Files:** `web/src/lib/earn/*`, `web/src/app/api/earn/*`, `web/src/hooks/useEarn.ts`,
`web/src/components/earn/*`, `web/src/app/savings/page.tsx`, `web/src/lib/chain/index.ts`
(`chainFromCaip2`, `explorerFor`).

### D-034 — Every earn write is signed by the user's wallet; the server forwards it unchanged

**Decision:** a deposit or withdrawal is authorised by a Privy *user authorization signature*
produced in the browser (`useAuthorizationSignature`) over the exact request — method, URL, body,
`privy-app-id`, `privy-idempotency-key`, `privy-request-expiry` — and forwarded by the server with
`privy-authorization-signature` beside the app's Basic credentials. Session signers (server acts
while the user is away) are not used.

**Consequence:** the operator, or a stolen app secret, cannot move a user's savings: any change to
vault, amount or wallet invalidates the signature, and there is no unsigned path in the code. The
signed request expires in five minutes and is idempotent. **Hypothesis:** the signature needs
user-owned (TEE-executed) embedded wallets — spec 20 Part 7 item 3 proves it at rehearsal.

**Threat model:** spec 20 Part 4.3.

### D-035 — Money from anywhere lands in savings through a Privy universal deposit address

**Decision:** the savings card offers *Add from any wallet, exchange or chain* through Privy's
`useDepositAddress`, destination fixed to the user's embedded wallet in the vault's asset on the
vault's chain (USDC on Base). The simulated cross-chain modal (DEMO-STATE S-1) is deleted with its
e2e check; there is no simulated deposit anywhere any more.

**Consequence:** cross-chain money funds *savings*, not the Rock Account — deposit addresses route
between mainnets and the Rock Account is on Sepolia, still funded from the testnet faucets. Every
failure is a fixed sentence keyed on Privy's error code, and the fallback is the wallet's plain
address. Prerequisites in the Privy dashboard: swaps, app-pays gas sponsorship on each source
chain, deposit addresses enabled. Spec 20 Part 11.

**Files:** `web/src/components/earn/deposit-anywhere-button.tsx`, `savings-card.tsx`;
`cross-chain-modal.tsx` deleted; `rock-awake.tsx`, `rock-interface.tsx`, `web/e2e`.

### D-036 — An AI agent trades with a rock as a visitor, from its own Privy agent wallet

**Decision:** Bank Rock publishes a skill (`/agent/SKILL.md`) and a runner
(`web/scripts/agent/trade-with-rock.mjs`) through which an agent, holding a wallet from Privy's
Agent Wallet CLI, trades against a rock's strategy on Sepolia with the same two transactions a
human's wallet sends: `approve(periphery, amountIn)`, then `XYCSwapTaker.swapExactIn(...)`. The
agent is a visitor (spec 02 Flow D), never an owner; the MCP server stays read-only (D-008,
D-019).

**Consequence:** the agent cannot ship, dock, gift or save — those need a Bank Rock session or the
Rock Account's owner, and the CLI wallet is neither. It can do the one thing any wallet can, and
the rock's owner earns the fee on it. No key is ever held by the agent or by this repository: the
CLI signs inside Privy's enclave under a human's approval. Spec 20 Part 12.

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
