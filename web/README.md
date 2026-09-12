# Bank Rock — web

The Next.js 16 application behind `https://bank-rock.com`: the rock pages, the NFC verifier, the
API routes, and the service worker. Deployed as the Cloudflare Worker `web` with
`@opennextjs/cloudflare` (`wrangler.jsonc`; D1 binding `DB`). Product and architecture live in
[`../specs/`](../specs/README.md); what is still unconfigured or unproven is
[`../DEMO-STATE.md`](../DEMO-STATE.md).

## Commands

| Command | What |
| --- | --- |
| `npm ci` | Install (Node 22) |
| `npm run dev` | Local dev server |
| `npm run lint`, `npm run typecheck`, `npm test` | The gate CI runs |
| `npm run e2e` | Playwright viewport × route matrix with axe (spec 17 Part 7) |
| `npm run build` | `next build` (the `prebuild` step generates `public/sw.js`) |
| `npm run deploy` | OpenNext build + publish the Worker — what `.github/workflows/deploy.yml` runs on `main` |
| `npm run deploy:pages` | Manual Cloudflare Pages preview; no domain points at it |
| `npm run rehearse:sepolia -- --dry-run` | The live-chain rehearsal (`scripts/rehearse-sepolia.ts`, spec 20 WP-2) |
| `node scripts/export-public-vars.mjs` | Prints the `NEXT_PUBLIC_*` values from `wrangler.jsonc` for a build (D-034) |

## Configuration

Non-secret values are in `wrangler.jsonc` `vars` (committed; the single source of truth — D-034).
Secrets are set on the Worker and never in a file; `.env.example` lists every variable and where
it lives in production. `NEXT_PUBLIC_DEMO_MODE=true` enables the badged simulation surfaces for
local rehearsal only; production pins it to `false`.
