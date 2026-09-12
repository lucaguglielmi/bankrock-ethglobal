# What is still simulated, and what is merely unconfigured

This is the answer to rule 1 of [`STEERING.md`](./STEERING.md): the living list of everything in
Bank Rock that is not real yet. It replaces the frozen simulation ledger in
[`specs/15-exit-demo-mode.md`](./specs/15-exit-demo-mode.md) §1.3, which stays as the audit
baseline — the record of what was wrong on 2026-09-12, not of what is wrong now.

**Read it before answering "what's next?".** One line per item, with the spec that governs it and
the single condition that makes it real.

Branch `exit-from-demo-mode`. `bash scripts/spec-checks.sh` runs 20 checks and is blocking in CI.

## The three states

| State | Meaning |
| --- | --- |
| `SIMULATED` | A number or an outcome is invented. It carries a visible badge and needs `NEXT_PUBLIC_DEMO_MODE=true`. |
| `UNAVAILABLE` | The real backing is not reachable. The UI says what is missing and shows no value. |
| `REAL` | A live contract, RPC or database answered. |

There is no fourth state, and no `catch` block substitutes a plausible value for a missing one.

---

## 1. Simulated — a badge, and a judge can see it

| # | What | Spec | Becomes real when |
| --- | --- | --- | --- |
| S-1 | Cross-chain deposit (the bridge modal) | 15 Part 6, 04 | A bridge is integrated. Cut from MVP scope; it stays a badged `DEMO` beat. |
| S-2 | The keeper rebalance *surface* | 15 Part 8 | The Gelato function stops targeting an interface that does not exist (X-7). The data layer already invents nothing — see U-7. |
| S-3 | The judge scenario switcher's sample views | 15 D-013, 17 | Never. It exists only to pick which badged sample renders, only under the flag, and it can set neither the attestation nor a balance. |

## 2. Unavailable — no path at all, on purpose

| # | What | Spec | Becomes real when |
| --- | --- | --- | --- |
| N-1 | AR / WebXR view | 15 Part 6, 08 must-have 12 | Never for this submission. Cut; the demo's opening beat no longer mentions it. |
| N-2 | Alert delivery | 15 Part 6 | A delivery pipeline is built. Preferences persist behind a verified Privy token; nothing dispatches. |
| N-3 | Fiat on-ramp / off-ramp (Flows G and H fiat legs) | 08 | Out of scope. Note that Flow H's on-chain leg is real: docking *is* the withdrawal. |
| N-4 | ERC-7579 scoped session keys for the MCP runtime | 15 Part 6, 05 D-010 | Post-hackathon. MCP is read-only (D-008, D-019). |
| N-5 | ERC-20 token paymaster ("self-sustaining rock") | 15 Part 6, 05 D-011 | Post-hackathon. The verifying paymaster alone covers the zero-gas beat. |
| N-6 | Idle yield into Aave v3 / Morpho | 15 Part 6, 04 | Post-hackathon. |
| N-7 | Replacement tags; creator registration UI | 15 Part 6, 02 Flows A and F | Cut. `markLost` / `clearLost` exist and are informational only — they freeze nothing. |
| N-8 | A second strategy sharing one reserve | 04, 15 P3.8 | Unblocked: it is one more `streamIndex`. Not shipped; item 4 in spec 08's fallback order. |
| N-9 | An APY or APR figure, anywhere | 09 D-004 | Never. A CI grep enforces its absence in `web/src/components`. |

## 3. Unavailable until something is deployed

The code is complete; the address is not. Each renders `UNAVAILABLE` naming the variable.

| # | What | Spec | Becomes real when |
| --- | --- | --- | --- |
| D-1 | Rock lifecycle, owner, Rock Account address, provenance, archive | 15 P2 | `contracts/scripts/deploy.js` has run → `NEXT_PUBLIC_REGISTRY_ADDRESS`, `REGISTRY_DEPLOY_BLOCK`. |
| D-2 | Ship and dock a liquidity stream | 15 P3, 04 | `contracts/scripts/deploy-aqua-app.js` has run → `NEXT_PUBLIC_AQUA_APP_ADDRESS`. |
| D-3 | Visitor swap | 15 P3, 02 Flow D | The same run also gives `NEXT_PUBLIC_AQUA_TAKER_ADDRESS`. A taker must be a contract (D-030). |
| D-4 | Cumulative earned fees | 04, 09 D-030 | App deployed, plus `AQUA_APP_DEPLOY_BLOCK` and a provider RPC that serves the log range. The fee *rate* needs only the strategy. |
| D-5 | Quotes | 04 | App deployed. `XYCSwap.quoteExactIn` is the source; there is no price feed and no external API. |

## 4. Unavailable until a secret is set

| # | What | Spec | Becomes real when |
| --- | --- | --- | --- |
| K-1 | Sign-in and any wallet address on screen | 16 #1 | `NEXT_PUBLIC_PRIVY_APP_ID` is set and the origin and chain are configured in the Privy dashboard. |
| K-2 | The "Verified Physical" badge | 16 #18, 06 | `NXP_MASTER_KEY` matches the key written to the tags. |
| K-3 | An attestation for a verified tap | 16 #17, 09 D-026 | `ATTESTATION_SIGNER_PRIVATE_KEY` is set and its address is the registry's attester. A tap can verify without it; only the on-chain step is blocked. |
| K-4 | Gift claims | 16 #30, 09 D-027 | `RELAYER_PRIVATE_KEY` is set **and funded**. Unset means claims are unavailable, never free. |
| K-5 | Any gas-sponsored operation | 16 #15 | A Pimlico key **and** a sponsorship policy for chain 11155111. Without the policy every UserOp is rejected. |
| K-6 | The ETH faucet | 16 #16 | `FAUCET_PRIVATE_KEY` is set and funded. There is no default key. |
| K-7 | Provenance, the fee log scan, Rock Account derivation | 16 #4 | `SEPOLIA_RPC_URL` points at a real provider. Public RPCs reject the log ranges the indexer needs. |
| K-8 | Admin figures, contact and vanity forms, counters, rate limits | 12 | The D1 binding is live and `drizzle/` migrations are applied to production. |
| K-9 | Any email at all | 16 #19, #33 | `RESEND_API_KEY` plus SPF/DKIM verification of `bank-rock.com`. Until then the sandbox sender reaches only the account owner's inbox. |

## 5. Real in code, unproven in the world

Not simulated. Not unavailable. Simply never exercised against the thing it models — which is the
most dangerous category on this page, because it looks finished.

| # | What | Spec | Proven when |
| --- | --- | --- | --- |
| P-1 | **NTAG 424 DNA SDM verification** | 06, 15 P4, 18 §4.2 | A physical tag is programmed and tapped, and the copied-URL test shows `unverified` in a second browser. This is the acceptance test for D-002 and cannot be waived. |
| P-2 | The registry, end to end | 15 P2 | A rock is awakened on Sepolia from a fresh Privy account and two browsers show the same state. |
| P-3 | The Aqua path, end to end | 04, 15 P3 | A strategy is shipped and a second account swaps against it; actual and virtual balances both move on chain. |
| P-4 | The gift handover, end to end | 02 Flow E, 09 D-027 | A recipient with no ETH claims a rock and the Rock Account's Safe owner has changed. An **open** handover cannot pre-sign the owner swap and reports it unavailable — by design, and it must be said out loud. |
| P-5 | Archive and start over | 02 Flow K, 09 D-028 | One physical tag awakens a second rock id after an archive, and the Rock Account address is unchanged. |

## 6. Known-wrong, outside the app

| # | What | Spec | Fixed when |
| --- | --- | --- | --- |
| W-1 | `https://www.bank-rock.com` returns 308 to a literal `:path*` placeholder | 15 R-1, D-022 | The Cloudflare redirect rule is corrected. **No tag may be programmed before this.** |
| W-2 | The CI responsive job configures no chain, so the two spec 17 Part 7 checks that need a live rock (items 7, 8) skip rather than run; the Lighthouse budget (item 10) is not run at all | 17 U4, 09 D-031 | That job's environment points at a deployed registry, and the Lighthouse budget is measured by hand against the public deployment. The static checks and the rest of the matrix are blocking today. |
| W-3 | The Gelato keeper function targets a contract interface that does not exist | 15 X-7 | It is rewritten against the current registry and Aqua, or deleted. It is `DEMO` either way. |

---

## How to keep this file honest

- A new simulated surface is not merged until it has a line here.
- A line is deleted only when the condition in its last column is actually met — not when the code
  that would satisfy it is written.
- If a value could be shown without any of these conditions being met, that is a bug of the kind
  spec 15 exists to remove, not a feature.
