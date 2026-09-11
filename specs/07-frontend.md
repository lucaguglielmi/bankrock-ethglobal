# Frontend specification

## Direction

A mobile-first web application with a tactile, restrained visual identity. The interface should combine the permanence of stone with the movement of water without resembling a generic crypto dashboard.

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

- / — short product explanation and manual rock lookup
- /r/{rockId} — public rock page opened from NFC
- /r/{rockId}/awaken — activation flow
- /r/{rockId}/fund — funding flow
- /r/{rockId}/trade — visitor swap flow
- /r/{rockId}/manage — owner strategy controls
- /r/{rockId}/give — ownership handover
- /collection — rocks controlled by the signed-in user

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

- Stone provides shape, texture and identity.
- Water provides motion and state.
- Actual balances appear as the reservoir.
- Aqua strategies appear as separate flowing channels.
- Fees may accumulate as sediment or layers, but exact numeric values remain visible.
- Status must never rely on colour or animation alone.

Avoid excessive glassmorphism, neon gradients and trading-terminal density.

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

Use verbs from the physical metaphor only where they remain clear:

- Awaken
- Fill
- Open a stream
- Trade
- Give
- Replace tag

Always pair unfamiliar language with precise financial meaning. For example: “Open a stream — create an Aqua liquidity strategy.”
