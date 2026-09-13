# Bank Rock — web

The Next.js 16 application behind `https://bank-rock.com`: the landing and explainer pages, the
rock dashboard (`/rock/[id]`), the tag redirect (`/r/[id]`), the NFC verifier, the API routes, and
the service worker. Deployed as the Cloudflare Worker `web` with `@opennextjs/cloudflare`
(`wrangler.jsonc`; D1 binding `DB`). Product and architecture live in
[`../specs/`](../specs/README.md); what is still unconfigured or unproven is
[`../DEMO-STATE.md`](../DEMO-STATE.md); the whole-project overview is the
[root README](../README.md).

## Commands

| Command | What |
| --- | --- |
| `npm ci` | Install (Node 22) |
| `npm run dev` | Local dev server on `http://localhost:3000` |
| `npm run lint`, `npm run typecheck`, `npm test` | The gate CI runs (ESLint, `tsc --noEmit`, Vitest) |
| `npm run e2e` | Playwright viewport × route matrix with axe (spec 17 Part 7); `npm run e2e:ui` opens the runner |
| `npm run build` | `next build` (the `prebuild` step generates `public/sw.js`) |
| `npm run preview` | OpenNext build + local Worker preview |
| `npm run deploy` | OpenNext build + publish the Worker — what `.github/workflows/deploy.yml` runs on `main` |
| `npm run deploy:pages` | Manual Cloudflare Pages preview; no domain points at it |
| `npm run db:generate` | Generate a Drizzle migration from `src/lib/db/schema.ts` into `drizzle/` |
| `npm run db:migrate:local`, `npm run db:migrate:prod` | Apply the migrations to the local or the remote D1 database |
| `npm run cf-typegen` | Regenerate the Worker binding types (`cloudflare-env.d.ts`) |
| `npm run rehearse:sepolia -- --dry-run` | The live-chain rehearsal (`scripts/rehearse-sepolia.ts`, spec 20 WP-2); drop the flag to broadcast |
| `node scripts/export-public-vars.mjs` | Prints the `NEXT_PUBLIC_*` values from `wrangler.jsonc` for a build (D-034) |

From the repository root, `bash scripts/spec-checks.sh` runs the 21 static definition-of-done
checks that CI blocks on, and `bash scripts/check-live.sh` asks the deployed site whether every
configured address has code.

## Configuration

Non-secret values are in `wrangler.jsonc` `vars` (committed; the single source of truth — D-034).
Secrets are set on the Worker and never in a file; `.env.example` lists every variable, where it
lives in production, and what unset means for the UI (always `UNAVAILABLE` with a reason, never a
placeholder — D-013). Copy it to `.env.local` for local work.

`NEXT_PUBLIC_DEMO_MODE=true` enables the badged simulation surfaces for local rehearsal only;
production pins it to `false`, and the deploy workflow asserts that.

Every contract address is read from `src/lib/chain` and nowhere else (D-015); a spec check fails
the build if a 20-byte literal appears anywhere else under `src/`.

## Where things are

| Path | What |
| --- | --- |
| `src/app/` | Pages and API routes. `rock/[id]` is the dashboard; `r/[id]` is the tag redirect (it never verifies — that would spend the tap); `learn/*` and `mcp` are the explainers |
| `src/components/rock-interface.tsx` | The four-tab dashboard (Liquidity, Trade, Ownership, Contracts); `rock/` holds its parts |
| `src/components/ui/` | The primitives: `Sheet` (the only overlay), `Address`, `Amount`, `CodeBlock`, `HelpTerm`, `Term` |
| `src/lib/ui/glossary.ts` | Every term the pages explain, one sentence each; rendered by `<Term k="…">` |
| `src/lib/chain/` | Chain id, addresses, ABIs, explorer links |
| `src/lib/aqua/` | Strategy encoding, quote maths, calldata builders, chain reads, event decoding |
| `src/lib/nfc/` | SDM decryption and CMAC, the monotonic counter store, the attestation signer, rock resolution |
| `src/lib/rock-account.ts`, `rock-account.server.ts` | Safe derivation, registry reads, the relayer, stored UserOperations |
| `src/hooks/` | `useBankRock` (awaken, ship, dock, gift, retire), `useTakerActions` (swap), the reads |
| `src/lib/db/` | Drizzle schema for D1 |
| `src/demo/rock-420/` | The browser-only stage demo rock (`/rock/420`, DEMO-STATE S-5): seeded state in `localStorage`, `DEMO` capabilities, no chain, no database, no transaction hashes |
| `drizzle/` | D1 migrations |
| `e2e/` | The Playwright responsive matrix |
