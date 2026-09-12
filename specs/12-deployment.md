# Deployment & CI/CD Pipeline

This document outlines the deployment architecture and continuous integration pipelines for Bank Rock.

## Infrastructure Providers

To achieve an automated "push to main and go live" workflow, we utilize the following managed platforms:

### 1. Web Application (Frontend)
- **Provider:** Cloudflare Pages via `@opennextjs/cloudflare` (decision D-021; this section previously said Vercel, which was never used).
- **Framework:** Next.js 16.3.5 (Turbopack)
- **Pipeline:** GitHub Actions (`.github/workflows/deploy.yml`) running `npm run deploy:pages` on push to `main`.
- **Domain:** `https://bank-rock.com` (D-022). The `www` host must redirect to the apex with the path preserved.
- **Configuration:** `web/wrangler.jsonc` (D1 binding `DB`, assets, `compatibility_date >= 2026-08-04` so `nodejs_compat` is on by default). Secrets are set in the Pages project dashboard, never in files. `@cloudflare/next-on-pages` must not be installed — it is a different adapter and its `getRequestContext()` does not work under OpenNext (D-016).

### 2. Master Oracle MCP Server
- **Provider:** Cloudflare Workers
- **Framework:** Node.js / TypeScript
- **Pipeline:** Cloudflare's native GitHub integration (Wrangler Action).
- **Workflow:**
  - Auto-deploys on pushes to `main`.
- **Configuration:** Deploy the MCP server as a Cloudflare Worker since it synergizes perfectly with the Cloudflare D1 database.

### 3. Database
- **Provider:** Cloudflare D1
- **Pipeline:** Manual migration execution via Wrangler CLI or Cloudflare dashboard. We do not automatically apply database migrations on push to `main` to prevent accidental data loss.

### 4. Smart Contracts
- **Provider:** Ethereum Sepolia, chain ID 11155111 (D-023)
- **Pipeline:** three contracts, two scripts, in this order. Every resulting address is recorded
  as an environment variable and never hardcoded (D-015); each script refuses to run without the
  inputs it needs and writes what it deployed to `contracts/deployments/`.

**Deploy order:**

| # | Step | Command (from `contracts/`) | Produces |
| --- | --- | --- | --- |
| 1 | Registry | `SEPOLIA_RPC_URL=… DEPLOYER_PRIVATE_KEY=… ATTESTATION_SIGNER_ADDRESS=… npm run deploy` | `NEXT_PUBLIC_REGISTRY_ADDRESS`, `REGISTRY_DEPLOY_BLOCK` |
| 2 | Attester set | none — the constructor takes it, and the script reads it back off chain | the registry's trusted attester |
| 3 | Aqua app + taker | `SEPOLIA_RPC_URL=… DEPLOYER_PRIVATE_KEY=… NEXT_PUBLIC_AQUA_ADDRESS=… node scripts/deploy-aqua-app.js` | `NEXT_PUBLIC_AQUA_APP_ADDRESS`, `NEXT_PUBLIC_AQUA_TAKER_ADDRESS`, `AQUA_APP_DEPLOY_BLOCK` |
| 4 | Environment | paste the outputs into the Cloudflare Pages project (Settings → Environment variables) | a build that can reach the chain |
| 5 | Tag | program the NTAG 424 DNA tag per spec 18 §4.2 | a rock that can be tapped |

Notes on the order:

- **Step 2 is not a separate transaction.** `ATTESTATION_SIGNER_ADDRESS` is a constructor
  argument and the deploy script reads `attester()` back off the chain before recording anything.
  `setAttester` exists for rotation, and is `onlyOwner`.
- **Aqua itself is never deployed.** It exists at its canonical Sepolia address and is an *input*
  to step 3, which refuses to continue if that address has no code. No script in this repository
  deploys `Aqua`, and none should.
- **There is no SwapVM router** (D-030). `XYCSwap` is the reference AquaApp, vendored unmodified;
  `XYCSwapTaker` is the taker periphery. Neither has an owner, so the deployer key keeps no
  privilege over them. The router path is documented, not taken:
  `contracts/scripts/deploy-swapvm-router.md`.
- **Step 5 cannot precede step 4's `www` fix.** No physical tag may be encoded until `/r/`
  returns 200 and the `www` redirect is correct (D-022).
- Verify the registry source on Sepolia Etherscan afterwards: `contracts/scripts/verify.md`.

## Continuous Integration (CI)

`.github/workflows/ci.yml` runs on every pull request and push to `main`, with
`cancel-in-progress` concurrency so a second push supersedes the run in flight. Five jobs, all
blocking:

| Job | Steps |
| --- | --- |
| **Web** | `npm ci`, `lint`, `typecheck`, `test` (Vitest), `build` with `NEXT_PUBLIC_DEMO_MODE: "false"` set explicitly |
| **Contracts** | `npm ci`, `npm test` (Hardhat 3 Solidity tests; `pretest` compiles), then two generated-file checks |
| **MCP server** | `npm ci`, `npm run build` (`prebuild` regenerates the ABI), then a generated-file check |
| **Spec checks** | `bash scripts/spec-checks.sh` — the static checks of spec 15 Part 7 and spec 17 Part 7 |
| **Responsive UI and accessibility** | Playwright + `axe-core` over spec 17 Part 7 items 1–9, against a production build with `NEXT_PUBLIC_DEMO_MODE: "true"` so every surface renders |

Two things are worth stating because they are easy to lose:

- **The production build is never produced with demo mode on.** The flag defaults to `false`, and
  the Build step sets it to `"false"` anyway, so a change to that default cannot quietly turn
  CI's build into a simulated one without this line changing too (D-013). A spec check asserts
  the same line exists in `deploy.yml`.
- **Generated files must be committed and current.** Each job regenerates its artefact and then
  fails on a dirty working tree: `contracts/abi/BankRockRegistry.json`,
  `web/src/lib/chain/abi/registry.ts` and `mcp/registry-abi.ts` are all derived from the compiled
  contract, and a stale copy means the web app or the MCP server is compiling against an ABI the
  contract no longer has.

- **The two builds are deliberately opposite.** The Web job builds with demo mode **off**,
  because that is what production ships. The responsive job builds with it **on**, because
  spec 17 Part 7 asks for every surface to render before it is measured. Neither build is the
  other's artefact.

**What CI still does not cover, and why:** the responsive job configures no chain, so `/rock/*`
reads `UNAVAILABLE` and the two checks that need a live rock (items 7 and 8) skip with a stated
reason rather than fail — point that job's environment at a deployed registry and they exercise
the real sheets. Spec 17 Part 7 item 10, the Lighthouse mobile budget, is not run at all: it needs
a throttled run against a public deployment. Device testing stays manual, by the user, as spec 17
says.
