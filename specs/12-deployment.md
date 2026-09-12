# Deployment & CI/CD Pipeline

This document outlines the deployment architecture and continuous integration pipelines for Bank Rock.

## Infrastructure Providers

To achieve an automated "push to main and go live" workflow, we utilize the following managed platforms:

### 1. Web Application (Frontend)
- **Provider (Fact, corrected 2026-09-12):** a **Cloudflare Worker** named `web`, built and published by `@opennextjs/cloudflare` (`opennextjs-cloudflare deploy`, the `npm run deploy` script). Decision D-021 chose Cloudflare and D-016 chose the OpenNext adapter; what this section used to say — that the target is a *Pages project* — was wrong about the last hop. `web/wrangler.jsonc` is Workers-only configuration: it declares `main: .open-next/worker.js`, an `assets` binding, a `services` self-reference, and `routes` with `custom_domain: true` for both `bank-rock.com` and `www.bank-rock.com`. **The production domain is attached to that Worker, not to a Pages project**, which is why a successful publish to the Pages project `bankrock-ethglobal` left `bank-rock.com` serving an older build (see *Deploy pipeline history*).
- **Framework:** Next.js 16.3.5 (Turbopack)
- **Pipeline:** GitHub Actions (`.github/workflows/deploy.yml`) running `npm run deploy` on push to `main`, **or on demand**: the workflow declares `workflow_dispatch: {}`, so a failed run can be re-tried from the Actions tab once the thing it was missing is supplied, without an empty commit. Node 22, one deploy at a time (`concurrency: deploy-production`, `cancel-in-progress: false`). `npm run deploy:pages` is kept as a **manual alternative** — it publishes the same OpenNext output to the Pages project `bankrock-ethglobal`, which is useful as a preview surface (`bankrock-ethglobal.pages.dev`) and is *not* what serves the custom domain.
- **Domain:** `https://bank-rock.com` (D-022), and `www.bank-rock.com`, both attached as custom domains in `wrangler.jsonc` `routes`. The `www` host must redirect to the apex with the path preserved. **Fact:** that redirect now ships **in the application** — `web/next.config.ts` `redirects()` matches `host = www.bank-rock.com` and 308s to `https://bank-rock.com/:path*`, with the path substituted by Next rather than by a dashboard template. The old Cloudflare redirect rule that returned the literal string `:path*` (spec 15 R-1) **must be deleted in the dashboard**, because a dashboard rule is evaluated before the request reaches the Worker: shipping the redirect in the app makes the correct behaviour the default, it does not overrule a rule that is still in place.
- **Configuration:** `web/wrangler.jsonc` — D1 binding `DB` → `bankrock-db`, the `ASSETS` and `IMAGES` bindings, the `WORKER_SELF_REFERENCE` service binding, `compatibility_date` `2026-09-11` so `nodejs_compat` is on by default, and `observability`. Runtime environment variables and secrets are set **on the Worker** (dashboard → Workers & Pages → `web` → Settings → Variables and Secrets), never in files and not on a Pages project. `@cloudflare/next-on-pages` must not be installed — it is a different adapter and its `getRequestContext()` does not work under OpenNext (D-016).
- **Service worker (Fact, spec 14 §4 / spec 15 R-6):** `public/sw.js` is **not** produced by a Next.js bundler plugin. `@serwist/next`'s webpack plugin does not run under Turbopack, which is Next 16's default and what this app builds with, so nothing ever wrote the file and `/sw.js` returned 404. It is now built independently by `web/scripts/build-sw.mjs`, wired in as the **`prebuild`** npm script: esbuild bundles `src/sw.ts` and `@serwist/build`'s `injectManifest` writes the result to `public/sw.js` before Next starts. Because it is `prebuild`, every path that runs `next build` — CI, `deploy`, `deploy:pages`, a local build — gets the worker without remembering to ask for it.

### 2. Master Oracle MCP Server
- **Provider:** Cloudflare Workers
- **Framework:** Node.js / TypeScript
- **Pipeline:** Cloudflare's native GitHub integration (Wrangler Action).
- **Workflow:**
  - Auto-deploys on pushes to `main`.
- **Configuration:** Deploy the MCP server as a Cloudflare Worker since it synergizes perfectly with the Cloudflare D1 database.

### 3. Database
- **Provider:** Cloudflare D1 — database `bankrock-db`, id `f0a28d6f-0a36-46aa-b711-8b5297913d2e`, bound to the Worker as **`DB`** with `migrations_dir: drizzle` (`web/wrangler.jsonc`).
- **Pipeline (Fact, changed 2026-09-12):** the deploy job now applies migrations itself, `npx wrangler d1 migrations apply bankrock-db --remote`, **before** publishing the Worker. The ordering is deliberate: every migration in `drizzle/` is additive (create table, add column) and the Worker's routes need the tables to exist, so new schema must precede new code. *This supersedes this section's previous rule — "we do not automatically apply database migrations on push to `main`".* The rule's reason still stands and becomes a constraint on the migrations rather than on the pipeline: **a destructive migration must not be merged to `main`**, because merging it now applies it. A `DROP`, a `NOT NULL` on an existing column or a rename is applied by hand, out of band, with a backup taken first.
- **Locally / by hand:** `cd web && npm run db:migrate:prod` runs the same command; `npm run db:migrate` targets the local D1.

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
  returns 200 and the `www` redirect is correct (D-022). The app now ships the redirect itself
  (see §1), so what remains is to delete or correct the dashboard rule and re-check with
  `curl -sIL https://www.bank-rock.com`, which must end 200.
- Verify the registry source on Sepolia Etherscan afterwards: `contracts/scripts/verify.md`.

## Continuous Integration (CI)

`.github/workflows/ci.yml` runs on every pull request and push to `main`, with
`cancel-in-progress` concurrency so a second push supersedes the run in flight. **Every job sets up
Node 22** (`actions/setup-node@v4`, `node-version: 22`, npm cache keyed on each workspace's
lockfile): Hardhat 3 requires `>= 22.13`, so the contracts job cannot run on 20, and the other jobs
are pinned to the same version so that "works in CI" means one runtime and not three. Five jobs, all
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

## Deploy pipeline history (Fact, 2026-09-12)

The deploy workflow had never reached the Cloudflare upload before this date, and the two reasons
are worth recording because both look like "the deploy is broken" and neither was.

| When | Where it stopped | Why |
| --- | --- | --- |
| Every run on `main` before **13:29 UTC** | `npm ci`, in the install step, before any build | Spec 15 **B-2**: `@cloudflare/next-on-pages@1.13.16` peers `next <= 15.5.2` and the project is on `next@16.3.5`, so a clean install fails `ERESOLVE`. Both workflows start with `npm ci`, so *every* Actions run was red — the deploy job never produced a build artefact, and its later steps had never executed at all |
| The first run past install | The "Fail early if Cloudflare credentials are missing" step | `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` were not set as repository secrets. **Nothing else failed** — install, Node 22 setup and the guard all behaved, and the guard did its job: it stopped before `wrangler` could emit a confusing auth error |

| **Run 16**, on `9c5bc1a` | Nowhere — it succeeded | …and `bank-rock.com` still served the *old* build. The run published to the **Pages** project `bankrock-ethglobal`, and `bankrock-ethglobal.pages.dev` did serve the new one (`/r/1` → 200, Inter, build version `1789220402685`). But the custom domain is attached to the **Worker** `web`, which was still on version `1789198731586`. A green deploy that changes nothing a user can see is the most expensive kind of green, and this one was caused by the pipeline publishing to a surface no domain points at |
| **Run 19**, on `de0412b` (the first run that targets the Worker) | The "Build and deploy the Worker" step, inside `wrangler deploy` | `Authentication error [code: 10000]` on `/accounts/…/workers/services/web`. The migration step *before* it succeeded, so the token has **D1: Edit** but not **Workers Scripts: Edit** — it was created for the Pages deploy. The build itself completed (`.open-next/worker.js` was produced). Runs 20 and 21 (`b0a03c4`, `600d244`) repeated it identically. Nothing in the repository can fix this: the token has to be extended or replaced in the Cloudflare dashboard, then the workflow re-run |

**Reading of it.** Four distinct failures, one after another, each hiding the next:

1. removing `@cloudflare/next-on-pages` (D-016) cleared **B-2** for both workflows at once;
2. the two missing GitHub secrets were an operator action, not code — spec 16 §2.3.1 and spec 18
   Part 2 step 0. `workflow_dispatch` exists so that step 0 can be verified by re-running the same
   commit rather than by pushing a no-op;
3. the pipeline was publishing to the wrong surface. Fixed by deploying the Worker (`npm run
   deploy`), which is what `wrangler.jsonc` describes and what the custom domains are attached to;
4. the token was scoped for the wrong surface too. Publishing a Worker needs **Account → Workers
   Scripts: Edit**, and attaching its custom domains needs **Zone (`bank-rock.com`) → Workers
   Routes: Edit** and **DNS: Edit** (spec 16 §2.3.1). Wrangler's own hint on the token
   ("Please ensure it has the correct permissions") is the only warning it gives before the 10000.

**The check that catches the third one, and which no green tick substitutes for:** after a deploy,
read `NEXT_PUBLIC_APP_VERSION` from the live apex and confirm it changed. `next.config.ts` sets it
to the build's `Date.now()`, so it is a build fingerprint that costs one request to verify.
