# Deployment & CI/CD Pipeline

This document outlines the deployment architecture and continuous integration pipelines for Bank Rock.

## Infrastructure Providers

To achieve an automated "push to main and go live" workflow, we utilize the following managed platforms:

### 1. Web Application (Frontend)
- **Provider (Fact, corrected 2026-09-12):** a **Cloudflare Worker** named `web`, built and published by `@opennextjs/cloudflare` (`opennextjs-cloudflare deploy`, the `npm run deploy` script). Decision D-021 chose Cloudflare and D-016 chose the OpenNext adapter; what this section used to say — that the target is a *Pages project* — was wrong about the last hop. `web/wrangler.jsonc` is Workers-only configuration: it declares `main: .open-next/worker.js`, an `assets` binding, a `services` self-reference, and `routes` with `custom_domain: true` for both `bank-rock.com` and `www.bank-rock.com`. **The production domain is attached to that Worker, not to a Pages project**, which is why a successful publish to the Pages project `bankrock-ethglobal` left `bank-rock.com` serving an older build (see *Deploy pipeline history*).
- **Framework:** Next.js 16.3.5 (Turbopack)
- **Pipeline:** GitHub Actions (`.github/workflows/deploy.yml`) running `npm run deploy` on push to `main`, **or on demand**: the workflow declares `workflow_dispatch: {}`, so a failed run can be re-tried from the Actions tab once the thing it was missing is supplied, without an empty commit. Node 22, one deploy at a time (`concurrency: deploy-production`, `cancel-in-progress: false`). `npm run deploy:pages` is kept as a **manual alternative** — it publishes the same OpenNext output to the Pages project `bankrock-ethglobal`, which is useful as a preview surface (`bankrock-ethglobal.pages.dev`) and is *not* what serves the custom domain.
- **Domain:** `https://bank-rock.com` (D-022), and `www.bank-rock.com`, both attached as custom domains in `wrangler.jsonc` `routes`. The `www` host must redirect to the apex with the path preserved. **Fact:** that redirect now ships **in the application** — `web/next.config.ts` `redirects()` matches `host = www.bank-rock.com` and 308s to `https://bank-rock.com/:path*`, with the path substituted by Next rather than by a dashboard template. **Correction, 2026-09-12 evening:** the literal `:path*` (spec 15 R-1) was never a dashboard rule — the zone API showed no redirect ruleset at all. It was this very app redirect, for the *empty* path only: the OpenNext Cloudflare adapter substitutes `:path*` for `/rock/1` but leaves it literal for `/`. `next.config.ts` now has a dedicated root rule plus `/:path+`.
- **Configuration:** `web/wrangler.jsonc` — D1 binding `DB` → `bankrock-db`, the `ASSETS` and `IMAGES` bindings, the `WORKER_SELF_REFERENCE` service binding, `compatibility_date` `2026-09-11` so `nodejs_compat` is on by default, `observability`, and the **`vars` block that holds every non-secret configuration value** (*Configuration model (D-034)*, below). Secrets are set **on the Worker** as encrypted secrets (dashboard → Workers & Pages → `web` → Settings → Variables and Secrets → Secret, or `wrangler secret put`), never in files and not on a Pages project. `@cloudflare/next-on-pages` must not be installed — it is a different adapter and its `getRequestContext()` does not work under OpenNext (D-016).
- **Service worker (Fact, spec 14 §4 / spec 15 R-6):** `public/sw.js` is **not** produced by a Next.js bundler plugin. `@serwist/next`'s webpack plugin does not run under Turbopack, which is Next 16's default and what this app builds with, so nothing ever wrote the file and `/sw.js` returned 404. It is now built independently by `web/scripts/build-sw.mjs`, wired in as the **`prebuild`** npm script: esbuild bundles `src/sw.ts` and `@serwist/build`'s `injectManifest` writes the result to `public/sw.js` before Next starts. Because it is `prebuild`, every path that runs `next build` — CI, `deploy`, `deploy:pages`, a local build — gets the worker without remembering to ask for it.

### 2. Master Oracle MCP Server
- **Provider:** Cloudflare Workers — **the same Worker as the site**, not a second one. The hosted
  endpoint is the Next.js route `web/src/app/api/mcp/route.ts` (`web/src/lib/mcp/`), so it ships
  with every deploy of `web` and reads the Worker's own variables (`NEXT_PUBLIC_REGISTRY_ADDRESS`,
  `SEPOLIA_RPC_URL`, `AQUA_APP_DEPLOY_BLOCK`). Nothing to configure separately.
- **URL:** `https://bank-rock.com/api/mcp` (Streamable HTTP, stateless, anonymous; spec 11 §5).
- **Pipeline:** the `web` deploy (`.github/workflows/deploy.yml`) on pushes to `main`.
- **Check after a deploy:** `POST /api/mcp` with an `initialize` request returns `200` and a
  `serverInfo` of `bankrock-oracle-mcp`; `GET /api/mcp` returns `405`.
- **The stdio server (`mcp/`)** is not deployed anywhere; it is run from a checkout by an operator.

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
| 4 | Environment | commit the outputs to `web/wrangler.jsonc` `vars` (D-034), which `scripts/spec-checks.sh` then compares against `contracts/deployments/*.json` | a build that can reach the chain |
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
  (see §1); the root-path case was the app's own redirect, fixed in `next.config.ts`, re-checked with
  `curl -sIL https://www.bank-rock.com`, which must end 200.
- Verify the registry source on Sepolia Etherscan afterwards: `contracts/scripts/verify.md`.

## Configuration model (D-034)

**One source of truth per kind of value, and exactly three homes.** Before this, every runtime value
was typed into the Cloudflare dashboard: nothing was reviewable, a wrong address was invisible in a
diff, and the deployed configuration could not be compared with the deploy records that produced it.

| | Home | What lives there | Changed by |
| --- | --- | --- | --- |
| **[1]** | `web/wrangler.jsonc` `vars`, **in git** | Non-secret, account-independent configuration: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_DEMO_MODE`, the six addresses, `REGISTRY_DEPLOY_BLOCK`, `AQUA_APP_DEPLOY_BLOCK`, `RELAYER_DAILY_CAP_WEI` | A commit, reviewed like code, applied by the next deploy |
| **[2]** | GitHub Actions input, read by `deploy.yml` | `NEXT_PUBLIC_PIMLICO_API_KEY` (repository **secret**). The Privy app id moved to **[1]** on 2026-09-12: it is a public identifier shipped in every bundle, so git is its honest home | The operator, once, in repository settings |
| **[3]** | Encrypted **secrets on the Worker** (`wrangler secret put`, or dashboard → Variables and Secrets → Secret) | `SEPOLIA_RPC_URL`, `PIMLICO_API_KEY`, `ATTESTATION_SIGNER_PRIVATE_KEY`, `RELAYER_PRIVATE_KEY`, `FAUCET_PRIVATE_KEY`, `NXP_MASTER_KEY`, `ADMIN_*`, `CRON_SECRET`, `RESEND_API_KEY`, `ALCHEMY_WEBHOOK_SECRET`, the web-push server pair | The operator, in the dashboard or with `wrangler` |

Spec 16 §2.2 marks every variable with its home; §2.3 is the operator's whole remaining list.

**There is no fourth home, and the dashboard's *Variables* pane is not one.** `wrangler deploy`
deletes every plain-text variable on the Worker and re-sets exactly the `vars` block from the
configuration file — Cloudflare's own wording is *"Wrangler will delete all vars before setting
those found in the Wrangler configuration"* — and `keep_vars` is deliberately not set. Secrets are
the exception: *"Secrets are never deleted by a deployment"*. So a value typed into the dashboard's
Variables pane lives until the next deploy and then disappears, which is the worst of both kinds;
a secret typed there is permanent and never enters git. The asymmetry is what makes the model work.
(Sources: [Wrangler configuration → source of truth](https://developers.cloudflare.com/workers/wrangler/configuration/),
[`wrangler deploy --keep-vars`](https://developers.cloudflare.com/workers/wrangler/commands/workers/).)

### Build time versus runtime — verified, not assumed (Fact, 2026-09-12)

`NEXT_PUBLIC_*` values are **inlined by Next at build time**, so the `vars` block alone is not
enough: the build has to see them too. `web/scripts/export-public-vars.mjs` prints the
`NEXT_PUBLIC_*` entries of `wrangler.jsonc` as `KEY=VALUE` lines, and the deploy job appends them to
`$GITHUB_ENV` before `npm run deploy`. One file, both halves; nothing is retyped.

Measured on this repository, by running the export script and then `opennextjs-cloudflare build`
(the same build `npm run deploy` performs) and grepping the output for the registry address
`0x2A3101Fc525C6DBEc39bef45034E23b13f28F757`:

| Where | Result |
| --- | --- |
| Client chunk (`.open-next/assets/_next/static/chunks/…`) | **Contains the literal.** `registryAddress:"0x2A3101Fc…F757"` — the whole `lib/demo.ts` `env` object is frozen into the bundle |
| Server bundle (`.open-next/server-functions/default/handler.mjs` and its chunks) | **Contains the literal too** — 10 files in `.open-next/`, plus 1 client chunk |
| A server-only variable left unset at build (`AQUA_APP_DEPLOY_BLOCK`) | **Absent from the whole build.** The code is emitted as `deployBlock:process.env.AQUA_APP_DEPLOY_BLOCK||""`, a runtime read |

**So both mechanisms are in use, and each covers what the other cannot.** `NEXT_PUBLIC_*` must be in
the *build* environment, which is what the export step is for; server-only variables
(`REGISTRY_DEPLOY_BLOCK`, `AQUA_APP_DEPLOY_BLOCK`, `RELAYER_DAILY_CAP_WEI`, every secret) are read
from `process.env` at *runtime*, which the Worker provides: `@opennextjs/cloudflare`'s entry
(`.open-next/worker.js` → `cloudflare/init.js`) runs `populateProcessEnv` on the first request,
copying every string-valued binding — `vars` **and** secrets — into `process.env`. That is why
`lib/demo.ts` can read public config through literal member access and `requireEnv` /`optionalEnv`
can read secrets by name, and both work in the same runtime.

A consequence worth stating: **changing anything in [1] or [2] requires a re-deploy**, not a Worker
restart, because the public half of it is inside the bundle.

### The drift check

`scripts/spec-checks.sh` check **`D-034`** (blocking, in the `spec-checks` CI job) compares the
address and deploy-block `vars` in `web/wrangler.jsonc` against
`contracts/deployments/sepolia.json` and `contracts/deployments/sepolia-aqua-app.json` — the files
the deploy scripts themselves wrote — plus the chain id. Addresses are compared case-insensitively,
because the two files carry different EIP-55 spellings of the same address and that is not drift.
A mismatch fails the build and names both values.

This is the bug the decision exists to prevent: the addresses are inlined into the bundle, so a
stale one points the whole application at a contract we did not deploy, on a deploy that looks
green and serves a page that looks fine.

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
| **Run 22**, on `8108580`, 14:12–14:18 UTC | Nowhere — and this time it counts | After the token was extended (Workers Scripts, Workers Routes, DNS), `wrangler deploy` published the Worker `web`. The apex went from `1789198731586` to `1789222449317` at 14:18:34 UTC; `/`, `/r/1`, `/rock/1`, `/sw.js` and the manifest all answer 200 with `x-opennext: 1`. **The first build from this repository to reach a user.** `www` still 308s to the literal `:path*` for the bare root — later shown to be the app's own redirect on the empty path, not a dashboard rule (DEMO-STATE W-1) |

**Reading of it.** Four distinct failures, one after another, each hiding the next, and one green run that changed what a user sees:

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
