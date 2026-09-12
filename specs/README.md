# Bank Rock specifications

This directory is the source of truth for the new Bank Rock ETHGlobal project. It was created independently for this repository; the previous Bank Rock project is not a dependency or specification source.

## Product statement

Bank Rock turns a handmade NFC-enabled rock into the physical interface for a self-custodial, giftable liquidity account.

A person taps a rock, signs in through Privy, and interacts with liquidity managed through Aqua. The NFC tag identifies the object but never stores a private key or grants financial authority.

Working line: **Liquidity you can hold.**

## Specification index

| Document | Purpose | Status |
| --- | --- | --- |
| [01-product.md](./01-product.md) | Product proposition, audience and principles | Active |
| [02-user-flows.md](./02-user-flows.md) | Activation, funding, trading, gifting and recovery | Active |
| [03-system-architecture.md](./03-system-architecture.md) | Components, trust boundaries and data ownership | Active |
| [04-aqua-integration.md](./04-aqua-integration.md) | Aqua model and Bank Rock strategy design | Active |
| [05-privy-wallets.md](./05-privy-wallets.md) | Authentication, wallets and ownership | Active |
| [06-nfc-security.md](./06-nfc-security.md) | Tag behaviour, cloning threat and claim security | Active |
| [07-frontend.md](./07-frontend.md) | Mobile-first interface and design-system direction | Active |
| [08-mvp-and-demo.md](./08-mvp-and-demo.md) | Hackathon scope, demo story and acceptance criteria | Active |
| [09-decisions.md](./09-decisions.md) | Open questions and architectural decisions | Active |
| [10-telemetry-and-observability.md](./10-telemetry-and-observability.md) | Structured logging, metrics, and agent-ready telemetry | Active |
| [11-mcp-and-connectors.md](./11-mcp-and-connectors.md) | Model Context Protocol servers and agent tools | Active |
| [12-deployment.md](./12-deployment.md) | The Cloudflare Worker that serves production, D1, the contract deploy order, CI and the deploy pipeline's history | Active |
| [13-after-the-hackathon-ideas.md](./13-after-the-hackathon-ideas.md) | Post-hackathon hardware security & social recovery roadmap | Roadmap |
| [14-progressive-web-app.md](./14-progressive-web-app.md) | PWA conversion, mobile standalone UX, and contextual notification policy | Active |
| [15-exit-demo-mode.md](./15-exit-demo-mode.md) | Audit baseline, simulation ledger, and the phased plan to replace simulated behaviour with real behaviour | Active |
| [16-environment-and-secrets.md](./16-environment-and-secrets.md) | Verified external dependencies on Ethereum Sepolia, every secret the code reads, who provides it, funding budget | Active |
| [17-mobile-ui-and-typography.md](./17-mobile-ui-and-typography.md) | Phone-first layout contract, typeface and type scale, contrast tokens, sheet primitive, and the CI checks that enforce them | Active |
| [18-demo-readiness.md](./18-demo-readiness.md) | What is still missing to run the three-minute demo end to end on a physical rock: the beat-by-beat state, the operator blockers, the tag's exact SDM settings, and the day-before checklist | Active |
| [19-contract-review-and-hardening.md](./19-contract-review-and-hardening.md) | The security review and Etherscan-readability standard every contract must pass before deployment, the process and evidence that sign it off, the status of the completed audit, and the pre-mainnet list | Active |
| [20-live-sepolia-plan.md](./20-live-sepolia-plan.md) | Going live on Sepolia: status of the deployment, the live rehearsal script and live check, the physical tag test, the demo rehearsal, and the parallel work packages | Active |

## Spec rules

- Product behaviour must be described here before implementation.
- Facts, decisions and hypotheses must be distinguishable.
- Security-sensitive behaviour requires an explicit threat model.
- The NFC tag is never treated as proof of identity.
- Aqua is not described as guaranteed yield.
- Scope additions must identify what they displace from the MVP.
- When a decision is made, update the relevant spec and the decision log.
- **Rule 1 of [`../STEERING.md`](../STEERING.md) is answered by
  [`../DEMO-STATE.md`](../DEMO-STATE.md).**
  That file is the living list of everything faked, mocked, hardcoded, unconfigured or merely
  unproven, one line each with the spec ID and the condition that makes it real. Read it before
  answering "what's next?", and add a line to it before merging any new simulated surface.
  [`15-exit-demo-mode.md`](./15-exit-demo-mode.md) §1.3 is the frozen audit baseline that file
  replaced, and is kept as history rather than updated.
