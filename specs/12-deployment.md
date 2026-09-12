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
- **Pipeline:** `BankRockRegistry` deployed via Hardhat 3 from `contracts/` with a `sepolia` network entry; `SwapVMRouter` deployed from a checkout of `github.com/1inch/swap-vm` via Hardhat Ignition with `aqua = 0x1111113ccf1426a8e30e2bff5e005d929bf6a90a`, `weth = 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14`. Both addresses are recorded as environment variables, never hardcoded (D-015). Deploy scripts must actually deploy; the current `deploy.js` only prints a literal.

## Continuous Integration (CI)

A GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every pull request and push to `main`.

**The CI pipeline enforces:**
1. **Frontend Integrity:** Runs `npm run lint`, `npm run typecheck` (if applicable), and `npm run build` in the `/web` directory.
2. **Backend Integrity:** Runs `npm run build` in the `/mcp` directory to ensure the Oracle server compiles correctly.

3. **Contract Integrity:** Runs `npm test` in `/contracts` (Hardhat 3 Solidity tests).
4. **Definition-of-done greps** from Part 7 of [`15-exit-demo-mode.md`](./15-exit-demo-mode.md).

This guarantees that `main` is always stable and ready for Cloudflare to deploy.
