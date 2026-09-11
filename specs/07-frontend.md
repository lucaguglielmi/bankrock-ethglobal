# Frontend specification

## Direction

A highly polished, spacious, and minimalist web application inspired by high-end modern design (like parallel.ai). The interface should be distinctly white, clean, and rely on excellent typography, subtle SVG state interactions, and premium Three.js artifacts rather than generic crypto tropes.

## Technology preference

- React or Next.js
- TypeScript
- Tailwind CSS 4
- shadcn/ui primitives
- Radix primitives where lower-level behaviour is needed
- viem or wagmi for EVM interactions
- Privy SDK for authentication and signing

This file defines direction, not an implementation commitment.

## Primary routes

- / — Landing page explaining the product with high-end interactive visuals.
- /shop — Shop page (delivery at crypto conference or standard shipping).
- /dashboard — Bank rock dashboard (controllable via MCP) for the signed-in user.
- /r/{rockId} — Public rock page opened from NFC, featuring a WebXR AR toggle.
- /r/{rockId}/awaken — Activation flow.
- /r/{rockId}/fund — Funding and top-up flow.
- /r/{rockId}/trade — Visitor swap flow.
- /r/{rockId}/manage — Owner strategy controls and Cash In flow.
- /r/{rockId}/give — Ownership handover (sponsored gas).
- /oracle — AI chat interface connected via MCP.

## Public rock page

Above the fold:

- distinctive rock visual or photograph;
- rock name and ID;
- current state: dormant, active, gift pending, lost or archived;
- total actual reserve value;
- primary action based on visitor role.

Supporting sections:

- token composition;
- liquidity streams;
- trades and fees;
- provenance timeline;
- technical details with explorer links.

## Visual language

- **Aesthetic:** Very white and spacious design, maximizing whitespace.
- **Typography:** Excellent, crisp typography tailored for high legibility and premium feel.
- **Animations:** 
  - Subtle text animations (e.g., smallshift letter by letter).
  - Elegant loading animations (e.g., an on-screen show while data fetches).
  - Heavy use of SVG animations for cool interactions between states.
- **Three.js & WebXR Artifacts:** A subtle but incredibly polished 3D artifact to anchor the landing page.
  - On the public rock page (`/r/{rockId}`), include a **Dynamic WebXR (AR) View** toggle. Users can place the 3D rock in their physical environment using their camera, with live token balances and yield stats floating around it as data holograms.
  - **Dynamic Metadata (Gamification):** The 3D rock visual evolves based on its on-chain success (e.g., changes texture from "Granite" to "Obsidian" or "Gold" when TVL or volume milestones are met). Must be aggressively optimized for mobile.
- **Color Palette:** Avoid excessive glassmorphism, neon gradients, and trading-terminal density. Keep it clean and minimal.

## Component policy

Reusable components should be created before route-specific versions:

- RockIdentity
- RockStateBadge
- ReservoirBalance
- LiquidityStream
- StrategyCard
- TransactionStepper
- RiskDisclosure
- OwnershipTimeline
- TapInstruction
- WalletAction
- EmptyState
- ExplorerLink
- OracleChatInterface (AI interaction layer)

No inline styling. Product screens should use tokens and shared components.

## Accessibility

- WCAG 2.2 AA target.
- Full keyboard access.
- Reduced-motion support.
- Minimum 44 by 44 CSS pixel touch targets.
- Visible focus states.
- Text equivalents for balance and flow visualizations.
- Plain-language transaction summaries.
- Status announcements for pending, success and failure states.
- Do not depend on the ability to scan NFC; provide manual URL and ID entry.

## Writing style

Microcopy must be short, clean, and highly effective at communicating with beginners and non-crypto native users. 

- Use plain English instead of crypto jargon (e.g., "Top Up" instead of "Deposit", "Give" instead of "Transfer").
- Always pair unfamiliar language with precise, simple meanings if it cannot be avoided.
- Focus on the experience and the physical nature of the object.
