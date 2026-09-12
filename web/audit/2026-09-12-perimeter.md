# Application perimeter re-check

**Spec:** [`specs/19-contract-review-and-hardening.md`](../../specs/19-contract-review-and-hardening.md)
Part 3 step 4, against the *Operations and griefing* checklist in Part 1.2 and the severity scale
in Part 1.3.
**Also checked against:** [`specs/15-exit-demo-mode.md`](../../specs/15-exit-demo-mode.md) §1.4
(SA-1…SA-12), Phase 5, D-013/D-014/D-017, and
[`specs/16-environment-and-secrets.md`](../../specs/16-environment-and-secrets.md) Part 2.

**Scope:** every route under `web/src/app/api/**`, `web/src/middleware.ts`, `web/src/lib/secure.ts`,
`lib/auth.ts`, `lib/auth/privy.ts`, `lib/rate-limit.ts`, `lib/telemetry.ts`, `lib/email-service.ts`,
`lib/rock-account.server.ts`, `lib/nfc/**`, `lib/db/**`, `web/.env.example`, `web/wrangler.jsonc`,
`web/next.config.ts`, and the files that arrived from `main`: `api/webpush/route.ts`, `src/sw.ts`,
`hooks/useNotifications.ts`, `components/a2hs-banner.tsx`, `app/demo/page.tsx`,
`components/ai-strategy-simulator.tsx`.

**Audited:** 2026-09-12, branch `exit-from-demo-mode`, working tree on top of `3650a61`.
**Caveat — moving target.** A parallel hardening pass edited the tree *during* this audit.
`api/webpush/route.ts` was rewritten at 12:08 UTC, `src/sw.ts` at 12:11 UTC, and
`app/demo/page.tsx` and `components/ai-strategy-simulator.tsx` were deleted at ~12:07 UTC. Every
finding below was re-verified against the tree as it stood at **12:12 UTC**; findings that the
parallel pass closed while this audit was running are listed separately, with what they were, so
the re-review can confirm they stay closed.

Nothing in `web/` was modified by this audit except the two additions it owns:
`web/audit/2026-09-12-perimeter.md` (this file) and
`web/src/lib/rock-account.server.perimeter.test.ts` (evidence for P-1 and P-2).

---

## 1. Route table

Credentials in use: **none** (public), **admin session** (`bankrock_sentinel_session` cookie, HS256
JWT, `lib/auth.ts`), **`x-admin-key`** (`ADMIN_API_KEY`), **`x-cron-secret`** (`CRON_SECRET`),
**Privy Bearer** (`Authorization: Bearer <Privy access token>`, `lib/auth/privy.ts`), **attestation**
(EIP-712 signature by `ATTESTATION_SIGNER_PRIVATE_KEY`'s address).

| Route | Verb | Credential | Rate limit (scope, limit, window) | Writes | Unauth spend? | Unauth PII? |
| --- | --- | --- | --- | --- | --- | --- |
| `/api/admin/login` | POST | none (issues the admin session) | `admin-login` 10 / 15 min / IP | sets session cookie | no | no |
| `/api/admin/stats` | GET | admin session | none | — (reads D1 counts) | no | no |
| `/api/alerts` | GET, POST | Privy Bearer | none | `alert_preferences` (own DID only) | no | no — scoped to the caller's DID (`lib/alerts.ts:71,102`) |
| `/api/alerts/test` | POST | admin session | none | — | sends 1 email (admin-gated) | no |
| `/api/alerts/gelato` | POST | `x-cron-secret` | none | — | sends 1 email (cron-gated) | no |
| `/api/contact` | POST | none | `contact` 10 / h / IP | `contact_requests` | no | no (write-only) |
| `/api/cron/snapshot` | GET | `x-cron-secret` | none | `yield_snapshots` | RPC reads only | no |
| `/api/events` | GET | none | `events` 60 / min / IP | — | RPC reads (`eth_getLogs`) | no — on-chain data only |
| `/api/faucet` | POST | none | per-address 1 / 24 h + per-IP 3 / 24 h, both in D1; refuses when D1 is absent | `faucet_claims`, `faucet_ip_claims` | **yes, by design** — 0.01 Sepolia ETH | no |
| `/api/keeper` | GET | none | none | — | RPC reads | no |
| `/api/keeper` | POST | `x-cron-secret` | none | — (always UNAVAILABLE, `lib/aqua-keeper.ts:87`) | no | no |
| `/api/newsletter` | POST | none | `newsletter` 20 / h / IP | `subscribers` | no | no (write-only) |
| `/api/newsletter` | GET | `x-admin-key` | none | — | no | subscriber emails — operator only |
| `/api/nfc/verify` | GET, POST | none (the tap *is* the credential) | **none** — see P-4 | `nfc_counters` (counter advance) | CPU + RPC + D1 after a CMAC match | 2-byte UID suffix only; `uidHash` in the attestation (P-12) |
| `/api/relayer` | GET | none | none | — | no | no — capability answer only |
| `/api/rocks/next-id` | GET | none | `next-id` 60 / min / IP | — | no | no |
| `/api/rocks/[id]/activity` | GET | none | `rock-read` 60 / min / IP | — | no | no |
| `/api/rocks/[id]/bind` | POST | none (corroborated against the registry) | `bind` 60 / h / IP | `tag_bindings` | RPC reads | no — stores `keccak256(uid)` |
| `/api/rocks/[id]/claim` | GET | none | none | — | no | no |
| `/api/rocks/[id]/claim` | POST | **attestation** | `claim` 20 / h / IP | `pending_userops` delete | **yes** — relayer gas + a Pimlico UserOp | **yes on the error path (P-2)** |
| `/api/rocks/[id]/handover-message` | GET, POST | Privy Bearer | POST `handover-message` 30 / h / IP; GET none | `handover_messages` | RPC reads | gift text readable by any signed-in account (P-9) |
| `/api/rocks/[id]/pending-userop` | GET, POST | Privy Bearer | POST 30 / h / IP; GET none | `pending_userops` | RPC reads | recipient address to any signed-in account (P-5) |
| `/api/rocks/[id]/quote` | GET | none | `quote` 60 / min / IP | — | RPC reads | no |
| `/api/rocks/[id]/strategy` | GET | none | **none** | — | RPC reads incl. `eth_getLogs` (P-10) | no |
| `/api/rocks/[id]/vanity` | POST | Privy Bearer | `vanity` 20 / h / IP | `rocks` | no | no |
| `/api/rocks/[id]/vanity` | GET | none | none | — | no | no — no owner DID in the response |
| `/api/rocks/[id]/yield` | GET | none | `rock-read` 60 / min / IP | — | no | no |
| `/api/telemetry` | GET | `x-admin-key` | none | — | no | redacted logs, operator only. **POST is gone** (SA-2/SA-3) |
| `/api/version` | GET | none | none | — | no | build timestamp only |
| `/api/webhooks/alchemy` | POST | HMAC `x-alchemy-signature` (constant-time) | none | `rock_events` | no | no |
| `/api/webpush` `subscribe` | POST | Privy Bearer | `webpush-subscribe` 20 / h / IP | `push_subscriptions` | no | no |
| `/api/webpush` `unsubscribe` | POST | Privy Bearer | none | `push_subscriptions` delete | no | no — but see P-6 |
| `/api/webpush` `send` | POST | `x-cron-secret` | none | deletes dead subscriptions | push delivery (cron-gated) | no |

**Answering the question directly:** the only routes an unauthenticated caller can make spend money
are `/api/faucet` (by design, double-ledgered in D1) and `POST /api/rocks/[id]/claim` (relayer gas
and a Pimlico UserOp, gated on a valid attestation — see P-1). No route leaks an email, a full UID,
a wallet↔DID link or a stack trace to an anonymous caller. One route leaks a **secret** to an
anonymous caller on its error path: P-2.

---

## 2. Findings

Severity per spec 19 §1.3. "Open" means present in the tree at 12:12 UTC on 2026-09-12.

| # | Severity | Finding | Evidence | Status |
| --- | --- | --- | --- | --- |
| P-1 | Medium | Relayer route does not check the handover is claimable, does not enforce a per-rock limit, and has no daily spend cap. A captured attestation is a bearer token for its full 10-minute TTL. | `web/src/app/api/rocks/[id]/claim/route.ts:46-97`; `lib/rock-account.server.ts:105-158`; test `rock-account.server.perimeter.test.ts` P-1 | open |
| P-2 | **High** | `SEPOLIA_RPC_URL` — which carries the Alchemy/Infura API key in its path — is returned verbatim to an **unauthenticated** caller in the claim route's failure `reason`. | `lib/rock-account.server.ts:209-211` → `app/api/rocks/[id]/claim/route.ts:78-86`; test `rock-account.server.perimeter.test.ts` P-2 | open |
| P-3 | Medium | The service worker caches cookie- and header-authenticated `GET /api/**` responses for 24 h in Cache Storage. Only `Authorization`-bearing requests are excluded. | `src/sw.ts:63-80`; `app/admin/page.tsx:40` (`fetch("/api/admin/stats")`, cookie auth, no `Authorization`) | open |
| P-4 | Medium | `/api/nfc/verify` has no rate limiting at all — the only unauthenticated endpoint that does per-request AES work and, after a CMAC match, up to three registry reads, an indexed-events query, a Safe derivation and a D1 write. | `app/api/nfc/verify/route.ts:97-127` (no `consumeIpRateLimit`); `lib/nfc/verify.ts:107-207` | open |
| P-5 | Medium | `POST /api/rocks/[id]/pending-userop` checks *a* Privy identity, never *the rock's owner*. Any account can `{"discard":true}` another rock's pre-signed Safe owner swap, or overwrite it. The recipient then gets the registry claim but never the Rock Account. | `app/api/rocks/[id]/pending-userop/route.ts:56-64` (discard, no ownership check), `:106-114` (overwrite) | open |
| P-6 | Medium | `/api/webpush` `unsubscribe` deletes by endpoint with **no DID filter**, while the comment above it claims "Only the DID that registered the subscription may remove it". A control that is asserted but absent is worse than one that is absent. | `app/api/webpush/route.ts:143-146` | open |
| P-7 | Medium | The browser and the server disagree on the VAPID public key's name: the hook reads `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, the route reads `WEB_PUSH_VAPID_PUBLIC_KEY`, so a subscription is created against one key and pushed with another — every delivery fails. None of the four names (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`) is in `.env.example`, which spec 16 §2.2a makes authoritative. | `hooks/useNotifications.ts:68` vs `app/api/webpush/route.ts:76-78`; `.env.example` | open (narrowed at 12:15 UTC — see below) |
| P-8 | Low | No JWT algorithm pinning anywhere: `jwtVerify` is called without `algorithms` for the admin session (twice) and for Privy. Not exploitable — jose rejects `alg:none` and a key-type mismatch — but it is the one line that makes that guarantee local rather than incidental. | `lib/auth.ts:87`, `middleware.ts:48`, `lib/auth/privy.ts:81-84` | open |
| P-9 | Low | `GET /api/rocks/[id]/handover-message` returns any rock's gift note to any signed-in account. Documented and deliberate (Privy tokens carry a DID, not a wallet), but it is user-written text readable by strangers. | `app/api/rocks/[id]/handover-message/route.ts:10-16,115-156` | open, accepted |
| P-10 | Low | `/api/rocks/[id]/strategy` and `GET /api/keeper` have no rate limit and drive `eth_call`/`eth_getLogs` against the operator's paid RPC. | `app/api/rocks/[id]/strategy/route.ts:42`; `app/api/keeper/route.ts:26` | open |
| P-11 | Low | The D1 rate limiter fails **open** for every route but the faucet: a missing binding or a failing statement returns `allowed: true, enforced: false`. Documented, but it means every limit above is conditional on D1. | `lib/rate-limit.ts:55-58,79-87` | open, accepted |
| P-12 | Low | The verifier's promise that "the full UID is never returned" is weakened by the attestation, which carries `uidHash = keccak256(uid)` over a 7-byte UID — a trivially searchable preimage space. It is on chain by design, so this is a wording/expectation gap, not a new exposure. | `lib/nfc/verify.ts:70-76` vs `lib/nfc/attestation.ts:161-164` | open, accepted |
| P-13 | Low | `alert_preferences` is keyed by `rockId` with first-writer-wins on `ownerDid`: any signed-in account can squat a rock's row before its owner and permanently block the owner from storing preferences. | `lib/alerts.ts:99-114` | open |
| P-14 | Low | Admin session lifetime is 30 days with no revocation list; the cookie carries no `__Host-` prefix. `secure` is correct (`NODE_ENV === "production"` holds in the OpenNext worker). | `lib/auth.ts:36,40-46` | open |
| P-15 | Low | viem error text — including the RPC URL and its key — also reaches the telemetry ring buffer; `redactText` redacts emails and EVM addresses but not URLs or key-shaped strings. Operator-only exposure (`x-admin-key`), so it is P-2's twin behind a credential. | `lib/rock-account.server.ts:205-208`, `app/api/rocks/[id]/quote/route.ts:162-166`, `lib/telemetry.ts:60-63,89-93` | open |
| P-16 | Informational | Telemetry is an in-process ring buffer on Workers: every isolate has its own, so `/api/telemetry` shows a near-random slice of one isolate's recent history. It is not an audit log and should not be relied on as one. | `lib/telemetry.ts:49-51` | open, accepted |
| P-17 | Informational | `actions/verify-ntag.ts` still exists; D-018 says it is deleted. It is now a thin in-process wrapper over the same `verifyTap`, so the "one verifier" property holds and only the spec wording is stale. | `src/actions/verify-ntag.ts:9` | open, accepted |

### Closed by the parallel hardening pass while this audit was running

Recorded so the re-review can confirm they stay closed. Each was verified present earlier today and
absent at 12:12 UTC.

| # | Severity as found | Finding (as it arrived from `main`) | Now |
| --- | --- | --- | --- |
| P-18 | **High** | `/api/webpush` was fully unauthenticated. `action:"subscribe"` wrote a caller-supplied `rockId`/`userId`/`endpoint` straight into a `PushSubscriptions` table that had no migration; `action:"notify"` was an **open Web Push relay** — anyone could have the server sign a push to any endpoint with the site's VAPID key, with a caller-controlled title, body and click-through URL. `err.message` and `error.message` were returned to the caller. | Rewritten 12:08 UTC: Privy for subscribe/unsubscribe, `x-cron-secret` for send, VAPID via `requireEnv`, migration `drizzle/0005_heavy_celestials.sql`. Residual: P-6, P-7. |
| P-19 | **High** (build-breaking) | `api/webpush/route.ts` imported `@cloudflare/next-on-pages` — removed by D-016 and absent from `package.json` and `package-lock.json` — and declared `runtime = "edge"`. `npx tsc --noEmit`: `TS2307: Cannot find module '@cloudflare/next-on-pages'`. The build could not succeed. | Import gone; the route uses `getDb()` (D-016). |
| P-20 | Medium | `src/sw.ts` used `defaultCache` from `@serwist/next/worker`, whose rule at `index.worker.mjs:154-165` caches **every** same-origin `GET /api/**` response for 24 h, `Cache-Control: no-store` included — which would have persisted `/api/nfc/verify` responses, i.e. signed attestations, to disk. | Rewritten 12:11 UTC with an explicit rule list. Residual: P-3. |
| P-21 | Medium | **D-013 violation.** `components/ai-strategy-simulator.tsx` rendered "AI Strategy Oracle Live", "Oracle Connected", `14.2%` market volatility "Analyzed from Binance/Coinbase feeds", a `5.00%` Gelato threshold and a "Conservative" AI risk posture — all literals, with no `SIMULATED` badge and no `NEXT_PUBLIC_DEMO_MODE` gate. `app/demo/page.tsx` redirected `/demo` to `/rock/420?demo=true`. | Both files deleted ~12:07 UTC. |

**On D-014 and `?demo=true`:** neither deleted file violated D-014 — there was no hash-shaped string
and no explorer link in either. The component was also never mounted (`grep -rn AIStrategySimulator`
found only its own definition), and `?demo=true` was read by nothing in `src/` (`grep` for
`searchParams.get("demo")` and `demo=true`), so the parameter granted no state: it was a dead query
string on a route whose rock id (420) does not exist.

---

## 3. Answers to the specific questions

### (b) The relayer route

- **Can a captured or replayed attestation make it spend gas repeatedly?** Partly. `verifyAttestation`
  checks the signature, the rock id and the deadline — and nothing else. It does not consult
  `nfc_counters`, does not mark the attestation used, and does not read the registry. The same
  attestation verifies as many times as you send it inside its 10-minute TTL
  (`rock-account.server.perimeter.test.ts`, P-1). What actually stops the repeated gas spend today is
  not a check in our code: `walletClient.sendTransaction` estimates gas first, and a second claim
  reverts in estimation, so nothing is broadcast. That is an accident of viem's default, not a
  control — it disappears the moment a `gas` value is passed, and it does not cover the window before
  the first claim mines, where concurrent requests all estimate successfully and each broadcasts.
- **Is there a per-day cap?** No. `RELAYER_PRIVATE_KEY`'s balance is the only cap. Spec 19's
  checklist allows "the absence is documented as a Sepolia-only risk" — it is not documented anywhere
  in the route or in spec 16 #30. This is P-1.
- **Does it check the handover is claimable before broadcasting?** No. There is no `readRock` in the
  claim path. The registry is the only thing that decides, after the gas has been committed.
- **Per-IP and per-rock rate limit?** Per-IP only, 20 per hour (`claim/route.ts:53`). Per-rock is
  absent; the checklist asks for both.

### (c) The faucet

`FAUCET_PRIVATE_KEY` is `requireEnv` with **no default** — SA-4 (the Anvil key) is gone, and an unset
key is a 503 (`faucet/route.ts:37-43`), as is a key that is not 32 bytes of hex. Limits: 0.01 ETH per
claim, one claim per address per 24 h, three claims per IP-hash per 24 h, both ledgers in D1
(`faucet_claims`, `faucet_ip_claims`). It is the one route that refuses to act when the limiter is
unreachable (`:56-62`) — correct, and the pattern P-11 says the others should follow. The wallet
balance is checked before sending. The recipient address and tx hash are logged; `recipient` is an
`ADDRESS_KEYS` member so it is redacted to `0x1234…abcd` before it reaches the buffer.

### (d) The NFC verify route as an oracle

- **Timing:** no. The CMAC comparison is `node:crypto.timingSafeEqual` (`lib/nfc/sdm.ts:283`), and
  the work before it is fixed: one AES-CBC block decryption and three CMACs, identical for every
  input (`lib/nfc/verify.ts:107-120`). The response is the same shape for `invalid_cmac` and
  `invalid_picc_data` and carries no timing-dependent content.
- **Search space:** `c` is the 8-byte truncated SDM CMAC (`SDM_MAC_LENGTH`), so guessing is 2⁶⁴. Rate
  limiting cannot be what makes this safe, and it is not needed to make it safe.
- **But there is no limiter at all** (P-4), and the endpoint is the most expensive unauthenticated
  one in the app. That is an availability and cost finding, not a cryptographic one.
- **Does a replay reveal anything?** A replayed URL is rejected `stale_counter`, and that response
  still returns `uid` (2-byte suffix), `counter`, `effectiveRockId` and `resolution`
  (`verify.ts:171-183`) — i.e. a copied URL confirms which rock the tag is bound to and what counter
  value it was captured at. No attestation is produced, which is the property that matters. The
  counter advance is atomic in D1 (`INSERT … ON CONFLICT DO UPDATE … WHERE excluded.counter >`), so
  two concurrent replays cannot both win, and with no D1 binding the verifier fails closed unless
  `NEXT_PUBLIC_DEMO_MODE=true`.

### (e) The Privy verifier

Issuer pinned (`privy.io`), audience pinned (the app id), keys from
`https://auth.privy.io/api/v1/apps/{appId}/jwks.json` via `createRemoteJWKSet`, cached per app id in
a module-level variable that jose refreshes on rotation. Unset `NEXT_PUBLIC_PRIVY_APP_ID` is a 503,
never an allow. **Algorithm is not pinned** (P-8) — not exploitable here, but it should be
`algorithms: ["ES256"]`. A forged token is not reachable without Privy's signing key. The real
caveat is different and worth stating plainly: `requirePrivyIdentity` proves *an account*, not *the
rock's owner*, and Privy sign-up is open. Every route whose only gate is a Privy token is therefore
open to anyone who registers — which is what makes P-5 and P-13 reachable, and why `/api/alerts` and
`/api/rocks/[id]/vanity`, which compare the DID against a stored owner, are the right shape and the
others are not.

### (f) The admin session

HS256, signed and verified with `ADMIN_JWT_SECRET` and no fallback — SA-8 is closed
(`lib/auth.ts:19-21`). The `uah` (user-agent hash) claim is now checked in **both** places, in
constant time (`lib/auth.ts:91-94`) as well as in the middleware (`middleware.ts:53-56`) — SA-10 is
closed. Algorithm not pinned (P-8). Cookie: `httpOnly`, `sameSite: "strict"`, `secure` in production,
`path: "/"`, 30-day `maxAge` (P-14). **CSRF:** the only cookie-authenticated state-changing route is
`POST /api/alerts/test`; `SameSite=strict` withholds the cookie on any cross-site request, and a JSON
body forces a preflight that the middleware's fixed single-origin ACAO will not satisfy. No
`Access-Control-Allow-Credentials` is ever sent. The residual CSRF surface is nil; the exposure
would be one admin-triggered test email.

### (g) Secrets

- **Defaults:** none. Every secret is read through `requireEnv`/`optionalEnv` or a direct
  `process.env` read that fails closed. `NXP_MASTER_KEY` has no zero-key fallback
  (`lib/nfc/config.ts:38-43`); `FAUCET_PRIVATE_KEY`, `ADMIN_JWT_SECRET`, `ADMIN_PASSWORD`,
  `ALCHEMY_WEBHOOK_SECRET`, `CRON_SECRET`, `ADMIN_API_KEY`, `RELAYER_PRIVATE_KEY`,
  `ATTESTATION_SIGNER_PRIVATE_KEY` all reject when unset. SA-4, SA-8 and SA-9 are closed.
- **Secret in a `NEXT_PUBLIC_` variable:** `NEXT_PUBLIC_PIMLICO_API_KEY` — a paid key, browser-visible
  by construction, accepted in spec 16 #15 on condition that it is origin-restricted in the Pimlico
  dashboard. That condition is a dashboard action nobody can verify from the repository; it belongs
  on the deploy checklist. `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (P-7) is a public key and harmless, but it
  is the wrong name and is in no inventory.
- **Secret in a log or a response:** **yes — P-2**, and its operator-side twin P-15. This is the only
  secret disclosure found, and the unauthenticated half of it is the highest-severity open finding.
- **`.env.example` vs the code:** every variable the code reads is listed, in spec 16 §2.2a's order,
  **except** the three the new webpush route and hook introduced: `WEB_PUSH_VAPID_PUBLIC_KEY`,
  `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_SUBJECT` (route) and `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (hook).
  Part of P-7.

### (h) The webpush route and the service worker

In the tree as audited at 12:12 UTC: an unauthenticated caller can do **nothing** — `subscribe` and
`unsubscribe` require a Privy token, `send` requires `x-cron-secret`, and an unknown `action` is a
400 from the zod discriminated union. Arbitrary endpoints can still be subscribed, but only in the
caller's own name (the DID comes from the token, never the body) and at 20 per hour per IP.
Unsubscribe is not scoped to the owning DID (P-6). VAPID keys come from `requireEnv` with no
defaults; unset is 503 — but the browser subscribes against a differently-named variable, so no
delivery can currently succeed (P-7). `send` with neither `rockId` nor `userDid` broadcasts to every stored
subscription — operator-only, but worth knowing it is there. The SW no longer uses serwist's
`defaultCache` and excludes `Authorization`-bearing requests from caching, but still caches
cookie- and `x-admin-key`-authenticated `GET /api/**` for 24 h (P-3). The push handler renders a
server-supplied title/body and `notificationclick` opens `data.url` with no same-origin check; with
`send` now cron-gated the payload is the operator's, so this is latent rather than live — but the
`url` field is validated only as `z.string().max(2048)`. What this route was before 12:08 UTC is
P-18/P-19.

### (i) `demo/page.tsx` and `ai-strategy-simulator.tsx`

Both deleted at ~12:07 UTC. As they arrived from `main` the simulator was a clear D-013 violation
(P-21): five fabricated figures and an "Oracle Connected" live-status pill, no `SIMULATED` badge, no
`NEXT_PUBLIC_DEMO_MODE` gate. Neither file violated D-014 — no hash-shaped strings. `?demo=true` was
read by nothing and granted no state.

### (j) CORS and the middleware

The middleware does exactly two things (`src/middleware.ts`, matcher `/api/:path*`, `/admin/:path*`):

1. Gates `/admin/**` except `/admin/login` on the session cookie — verifying the HS256 JWT, the
   `role` claim and the `uah` claim, redirecting to `/admin/login` and clearing the cookie on any
   failure, and redirecting rather than opening when `ADMIN_JWT_SECRET` is unset.
2. Sets CORS on `/api/**`: `Access-Control-Allow-Origin: NEXT_PUBLIC_APP_URL` (a single fixed origin,
   never `*` and never reflected), `Allow-Methods: GET, POST, OPTIONS`, `Allow-Headers:
   Content-Type, Authorization, x-alchemy-signature, x-admin-key, x-cron-secret`, `Vary: Origin`. No
   `Allow-Credentials`. No route exports `OPTIONS`, so a preflight gets a 405 and cross-origin
   non-simple requests fail — restrictive, and correct for this app.

The in-memory `Map` rate limiter (SA-11) is gone from the middleware, with the reason recorded in the
file header; limits now live in D1 inside the handlers (`lib/rate-limit.ts`). SA-12 is closed: the
cron secret is the `x-cron-secret` header, not a query parameter.

---

## 4. SA-1 … SA-12 closure

| # | Spec 15 finding | Status |
| --- | --- | --- |
| SA-1 | Open email relay at `/api/alerts/test` | **Closed** — admin session required; the five fabricated presets are gone (`alerts/test/route.ts:24-33`) |
| SA-2 | Public `GET/POST /api/telemetry` | **Closed** — `x-admin-key` on GET; POST removed; redaction happens before the buffer (`lib/telemetry.ts:163-180`) |
| SA-3 | MCP relays those logs to an agent | **Closed** — `query_logs` needs `ADMIN_API_KEY` and the content is fenced (`mcp/index.ts:122-124,380-385`) |
| SA-4 | Anvil key as `FAUCET_PRIVATE_KEY` default | **Closed** — no default, format-validated |
| SA-5 | Anonymous read/write of alert preferences | **Closed** — Privy Bearer, scoped to the caller's DID |
| SA-6 | Unauthenticated `POST /api/keeper` | **Closed** — `x-cron-secret`; the rebalance itself is UNAVAILABLE |
| SA-7 | `body.source === 'gelato_keeper'` auth; raw HTML interpolation | **Closed** — `x-cron-secret` + `escapeHtml` |
| SA-8 | Insecure `ADMIN_JWT_SECRET` / `NXP_MASTER_KEY` defaults | **Closed** |
| SA-9 | `if (SECRET && mismatch) reject` | **Closed** — `lib/secure.ts` makes unset a 503 everywhere |
| SA-10 | `uah` unchecked; non-constant-time comparison | **Closed** — checked in both places; `timingSafeEqual` throughout |
| SA-11 | In-memory rate limiting on Workers | **Closed structurally** (D1), with the caveat in P-11 |
| SA-12 | Cron secret in the query string | **Closed** — header only |

Phase 5's acceptance test — "every endpoint under `/api/` either requires a credential, is
intentionally public and read-only with no PII, or is deleted" — **passes**, with the one exception
that P-2 makes an error path on a public endpoint disclose a secret.

---

## 5. Recommended fixes

Ordered by severity, then by cost.

1. **P-2 (High).** Never return a chain-error message to a client. In
   `lib/rock-account.server.ts:209-211` and `:305-307`, log the error and return a fixed reason
   (`"The claim could not be broadcast"`), the way `lib/nfc/attestation.ts:271-274` already does for
   the signer. Add a regression test asserting the response body contains no `http`.
2. **P-1 (Medium).** In `POST /api/rocks/[id]/claim`, before `submitClaimHandover`: (a) `readRock(id)`
   and refuse unless there is an unexpired handover; (b) add a per-rock limit alongside the per-IP one
   (`consumeRateLimit("claim-rock:" + id, …)`); (c) add a `RELAYER_MAX_DAILY_SPEND_WEI` env cap
   accumulated in D1, or state the absence in the route header and in spec 16 #30 as an accepted
   Sepolia-only risk. Consider marking the attestation `(uidHash, counter)` used, in `nfc_counters`
   or a sibling table, so a captured one is single-use server-side rather than only on chain.
3. **P-3 (Medium).** Extend the `NetworkOnly` matcher in `src/sw.ts:65-71` to any request carrying a
   credential — `Authorization`, `x-admin-key`, `x-cron-secret`, or `request.credentials !==
   "omit"` — or simply exclude `/api/` from caching entirely and keep the offline fallback for
   `/rock/**`. Add a `cacheWillUpdate` plugin that refuses to store a response carrying
   `Cache-Control: no-store`.
4. **P-4 (Medium).** Put `consumeIpRateLimit(req, "nfc-verify", …)` in front of `verifyTap`, with a
   generous limit (a real tap is one request). Consider a second, tighter bucket keyed on the UID
   once the CMAC matches, to bound the post-match RPC and D1 work.
5. **P-5 (Medium).** Gate `pending-userop` on the rock's owner, not on any Privy identity: compare the
   caller against `rocks.ownerAddress` (as `vanity` does) or require the giver's signature over the
   discard. At minimum, refuse `discard` unless the registry shows no outstanding handover.
6. **P-6 (Medium).** Add `and(eq(endpoint, …), eq(userDid, auth.identity.did))` to the unsubscribe
   delete, or change the comment. The code and the comment must agree.
7. **P-7 (Medium).** Settle on one name for the VAPID public key — `NEXT_PUBLIC_` is the right
   prefix for it, since the browser genuinely needs it — and have the route read the same one. Add
   it, `WEB_PUSH_VAPID_PRIVATE_KEY` and `WEB_PUSH_SUBJECT` to `.env.example` and to spec 16 §2.2's
   inventory. Nothing mounts `useNotifications` or `A2HSBanner` today, so this is cheap to fix
   before it is wired up.
8. **P-8 (Low).** Pass `algorithms: ["HS256"]` at `lib/auth.ts:87` and `middleware.ts:48`, and
   `algorithms: ["ES256"]` at `lib/auth/privy.ts:81`.
9. **P-10, P-13, P-14, P-15 (Low).** Rate-limit `strategy` and `GET /api/keeper`; key alert
   preferences on `(rockId, ownerDid)` or verify ownership against the registry; shorten the admin
   session and use a `__Host-` cookie name; add a URL/key pattern to `redactText`.
10. **P-11 (Low, decide rather than fix).** Either document "limits are advisory when D1 is
    unreachable" in `lib/rate-limit.ts` as an accepted risk, or make the spending and write routes
    follow the faucet and refuse.

---

## 6. Verdict

**The perimeter closed since spec 15 §1.4 was written.** All twelve SA findings are resolved, the
fail-closed rule (D-017) is applied uniformly through `lib/secure.ts`, no secret has a default, PII
is redacted before it reaches the log buffer, and the telemetry ingest endpoint — the
prompt-injection path into the user's agent — is gone. Phase 5's acceptance sweep passes.

**One open finding blocks a deployment that uses a paid RPC endpoint: P-2.** An unauthenticated
caller can read `SEPOLIA_RPC_URL`, API key included, from the claim route's error path; it is proven
by a test in this branch, and the fix is three lines. Fix P-2 before any deploy, and rotate the RPC
key if the current build has ever been exposed publicly.

**P-1 is the checklist item spec 19 actually asked about and it is not met.** The relayer does not
check that a handover is claimable, has no per-rock limit and has no daily cap, and the only thing
standing between a captured attestation and repeated relayer spend is viem's default gas estimation.
On Sepolia the loss is bounded by the relayer's balance; on a network with real value it is not. Fix
it, or record the acceptance explicitly — spec 19 permits the second, but only in writing, and it is
not written anywhere today.

**No Critical finding.** No path was found by which an unauthenticated caller takes a rock, redirects
a claim, spends from a Rock Account, or reads an email address, a full UID or a wallet↔DID link. The
attestation design does what its header claims: `subject` is inside the signed struct, so the relayer
cannot redirect the rock to itself, and no client-side path can set the verified state.

**Re-review note.** This audit raced a hardening pass on the same tree. P-18 through P-21 were real
at the start of it and closed before the end; `hooks/useNotifications.ts` was fixed at 12:15 UTC to
send the Privy bearer token, which closed half of P-7 and left the env-name half open. Anyone re-checking should re-confirm those four and
should not treat their absence as evidence that the perimeter was always in this shape.
