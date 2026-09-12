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
| [12-deployment.md](./12-deployment.md) | Cloudflare Pages, Workers, D1 database and CI/CD | Active |
| [13-after-the-hackathon-ideas.md](./13-after-the-hackathon-ideas.md) | Post-hackathon hardware security & social recovery roadmap | Roadmap |
| [14-progressive-web-app.md](./14-progressive-web-app.md) | PWA conversion, mobile standalone UX, and contextual notification policy | Active |
| [15-exit-demo-mode.md](./15-exit-demo-mode.md) | Audit baseline, simulation ledger, and the phased plan to replace simulated behaviour with real behaviour | Active |
| [16-environment-and-secrets.md](./16-environment-and-secrets.md) | Verified external dependencies on Ethereum Sepolia, every secret the code reads, who provides it, funding budget | Active |
| [17-mobile-ui-and-typography.md](./17-mobile-ui-and-typography.md) | Phone-first layout contract, typeface and type scale, contrast tokens, sheet primitive, and the CI checks that enforce them | Active |

## Spec rules

- Product behaviour must be described here before implementation.
- Facts, decisions and hypotheses must be distinguishable.
- Security-sensitive behaviour requires an explicit threat model.
- The NFC tag is never treated as proof of identity.
- Aqua is not described as guaranteed yield.
- Scope additions must identify what they displace from the MVP.
- When a decision is made, update the relevant spec and the decision log.
