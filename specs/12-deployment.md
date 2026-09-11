# Deployment & CI/CD Pipeline

This document outlines the deployment architecture and continuous integration pipelines for Bank Rock.

## Infrastructure Providers

To achieve an automated "push to main and go live" workflow, we utilize the following managed platforms:

### 1. Web Application (Frontend)
- **Provider:** Vercel
- **Framework:** Next.js 16.3.5 (Turbopack)
- **Pipeline:** Vercel's native GitHub integration.
- **Workflow:** 
  - Every commit pushed to `main` triggers an automatic production deployment.
  - Pull requests automatically generate preview environments.
- **Configuration:** No custom configuration required; Vercel detects the Next.js preset automatically. Ensure the root directory in Vercel is set to `web`.

### 2. Master Oracle MCP Server
- **Provider:** Railway (or Render)
- **Framework:** Node.js (TypeScript)
- **Pipeline:** Railway's GitHub integration.
- **Workflow:**
  - Auto-deploys on pushes to `main`.
- **Configuration:** Point the Railway service root directory to `mcp`. Ensure the start command is `npm run start` and the build command is `npm run build`.

### 3. Database
- **Provider:** Supabase
- **Pipeline:** Manual migration execution via the Supabase CLI or SQL editor. We do not automatically apply database migrations on push to `main` to prevent accidental data loss.

### 4. Smart Contracts
- **Provider:** Target testnets (e.g., Base Sepolia)
- **Pipeline:** Deployed manually via Hardhat/Foundry scripts once tested.

## Continuous Integration (CI)

A GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every pull request and push to `main`.

**The CI pipeline enforces:**
1. **Frontend Integrity:** Runs `npm run lint`, `npm run typecheck` (if applicable), and `npm run build` in the `/web` directory.
2. **Backend Integrity:** Runs `npm run build` in the `/mcp` directory to ensure the Oracle server compiles correctly.

This guarantees that `main` is always stable and ready for Vercel and Railway to deploy.
