# Progressive Web App (PWA) & Notification Specification

## Overview

Bank Rock is designed to be tapped via NFC in the physical world using smartphones (iOS and Android). Turning the web application into a Progressive Web App (PWA) bridges the physical stone interface to mobile hardware, enabling home-screen installation, full-screen standalone execution, offline caching of rock metadata, and contextual notifications for liquidity events.

## PWA Architecture & Requirements

### 1. Web App Manifest (`app/manifest.ts`)

Next.js App Router provides native support for dynamic manifests via `src/app/manifest.ts`.

```typescript
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bank Rock — Tangible DeFi",
    short_name: "Bank Rock",
    description: "A physical interface to self-custodial liquidity and agentic Aqua strategies.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#000000",
    orientation: "portrait",
    categories: ["finance", "utilities"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
```

### 2. Avatar & Favicon Assets

To maintain the high-contrast monochrome aesthetic of Bank Rock:
- **`favicon.ico`**: Multi-resolution icon (16x16, 32x32, 48x48) displaying the minimalist Tuscan stone contour.
- **`icon.svg`**: Scalable vector favicon matching the brand logo.
- **`apple-touch-icon.png`**: 180x180 high-DPI icon optimized for iOS Home Screen icons with no transparency (rendered against clean white `#ffffff`).
- **Splash Screens**: Standard Apple splash screen meta tags configured in `layout.tsx` using `theme-color` and `apple-mobile-web-app-status-bar-style`.

### 3. Web Notification Policy (Anti-Spam & Context-Driven)

#### The Golden Rule: Never Prompt on Page Load
Notification prompts must **never** appear on initial page load, landing page visits, or first NFC taps. Unsolicited browser permission popups destroy trust and are frequently blocked permanently by users.

#### Intent-Driven Permission Flow
Notification access is requested **only** when a user explicitly initiates an action on the rock dashboard that requires asynchronous confirmation, such as:
1. **Trade Execution & Yield Accrual**: Alerting when an Aqua maker trade occurs against their rock's reserve and fees are deposited.
2. **Zero-Gas Ownership Transfer**: Alerting both the sender and recipient once the Safe UserOp is settled on Base Sepolia.
3. **Rebalancing Alerts**: Alerting when token inventory ratio crosses a user-defined threshold.
4. **Physical Drop Alerts**: Informing subscribers when a physical batch of Bank Rocks is ready to claim at global events.

#### UI Implementation Pattern
- A dedicated "Notifications" toggle or context prompt inside the Rock Dashboard settings / action confirmation dialogs:
  - "Notify me when this trade executes and fees are earned."
  - "Notify me when ownership transfer confirms on-chain."
- If permission is `default`, calling `Notification.requestPermission()` only upon that user click.
- If permission is `denied`, gracefully falling back to in-app activity toasts and audio/haptic feedback.
- If permission is `granted`, subscribing to Web Push via Service Worker registration.

### 4. Service Worker & Caching Strategy

- **App Shell & Assets (`stale-while-revalidate`)**: HTML structure, fonts, 3D rock geometry, and static CSS are cached for instant offline loading.
- **Rock Metadata (`stale-while-revalidate`)**: Rock ID, physical origin (Florence, Tuscany), chip hardware public parameters, and historical activity are cached locally.
- **On-Chain State & Privy Auth (`network-first`)**: Wallet balances, active Aqua pool reserves, live UserOps, and Privy session tokens always hit the network first, falling back to cached state with an "Offline — showing cached state" indicator if disconnected.

### 5. Mobile & Fullscreen UX Enhancements

- **Standalone Mode Handling**:
  - Detection: Check `window.matchMedia('(display-mode: standalone)').matches` or `navigator.standalone`.
  - SafeArea insets: CSS `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` applied to navigation headers and floating action bars.
- **iOS Add to Home Screen (A2HS) Prompt**:
  - Non-intrusive drawer banner shown to iOS Safari users inspecting an awakened rock: *"Install Bank Rock on your Home Screen for one-tap NFC scanning and haptic feedback."*

## Implementation Phases

1. **Phase 1 (Manifest & Icons)**: Create `manifest.ts`, SVG/PNG icons, and viewport/apple meta tags in `layout.tsx`.
2. **Phase 2 (Contextual Notifications)**: Create a reusable `useNotifications` React hook and UI trigger on the rock dashboard.
3. **Phase 3 (Service Worker & Offline Fallbacks)**: Implement offline-first caching for static assets and physical rock metadata.
