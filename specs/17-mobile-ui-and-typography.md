# Mobile UI and typography

## Purpose

[`07-frontend.md`](./07-frontend.md) describes the direction: white, spacious, mobile-first, with
excellent typography. This document is the contract that makes that direction checkable. It
records what the current UI does on a phone, decides the typeface, type scale and layout rules,
and defines acceptance tests that a build must pass before it is shown on a mobile device.

Bank Rock is opened by tapping a rock with a phone. The phone is the primary device, not a
secondary breakpoint. Every rule below is written for a 360 × 640 CSS-pixel viewport first and
relaxed upwards, never the other way round.

Facts were verified on 2026-09-12 by reading the source on this branch, compiling the theme with
the Tailwind 4 CLI, and fetching the production stylesheet from `bank-rock.com`. The status
vocabulary (**Fact**, **Decision**, **Hypothesis**) is the one defined in
[`15-exit-demo-mode.md`](./15-exit-demo-mode.md).

---

# Part 1 — Audit baseline

## 1.1 Typography

| # | Fact | Evidence |
| --- | --- | --- |
| T-1 | **The body typeface is never applied.** `globals.css` declares `--font-sans: var(--font-sans)` inside `@theme inline` — a self-reference. Tailwind emits it verbatim: the production stylesheet contains `:root{--font-sans:var(--font-sans)}` and `--default-font-family:var(--font-sans)`. A cyclic custom property is invalid at computed-value time, so `font-family: var(--font-sans)` on `body` is discarded and the page inherits the preflight fallback stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, …`). | `web/src/app/globals.css:10`; `curl https://bank-rock.com/_next/static/chunks/*.css`; reproduced with `@tailwindcss/cli` on a minimal input |
| T-2 | Geist is loaded and wasted. `layout.tsx` loads Geist and Geist Mono via `next/font` under `--font-geist-sans` / `--font-geist-mono`; five Geist `@font-face` rules are shipped in the production CSS; nothing references `--font-geist-sans`. Only `--font-mono` (correctly mapped to `--font-geist-mono`) works. **The monospace face is the only declared face that renders.** | `web/src/app/layout.tsx:7-15`; `globals.css:10-12`; production CSS |
| T-3 | Consequence of T-1: the body font differs by device — San Francisco on Apple, Segoe UI on Windows, Roboto on Android, whatever `sans-serif` maps to on Linux. The design has no typeface. | — |
| T-4 | Monospace is used for amounts, labels, buttons, badges and marketing copy, not only for hashes: balances (`rock-interface.tsx:609`, `aqua-position-card.tsx:115,119,139,148`), KPI numbers and sublabels (`admin/page.tsx:59-107`), explanatory copy (`mcp/page.tsx:152,211,314,327,455`, `aqua-info-modal.tsx:293`), link labels (`rock-interface.tsx:597`). | grep `font-mono` |
| T-5 | Pixel-literal sizes below the readable floor: `text-[9px]` (`rock-alerts.tsx:448`, category badges), `text-[10px]` and `text-[11px]` in roughly 50 places, including primary content — every alert topic description (`rock-alerts.tsx:465`), the cross-chain disclaimer (`cross-chain-modal.tsx:560`), the "Est. APR" figure (`aqua-position-card.tsx:152`), timestamps and hashes in the provenance timeline (`rock-activity.tsx:75,105`). About 150 further `text-xs` (12 px) uses, many for content the user must read (fee breakdowns in `trade-modal.tsx:517-573`, the whole transfer confirmation in `transfer-modal.tsx:253-283`). | grep `text-\[[0-9]+px\]`, `text-xs` |
| T-6 | The legal pages shrink text on phones: body is `text-sm sm:text-base` (14 px on mobile, 16 px on desktop) and three sections are `text-xs sm:text-sm` — 12 px privacy disclosures on the smallest screens. | `app/privacy/page.tsx:52,91,102,113`; `app/terms/page.tsx` same pattern |
| T-7 | Negative tracking is applied to body copy (`tracking-tight` on the hero paragraph, `app/page.tsx:28`) and `tracking-tighter` (−0.05 em) to every heading down to 24 px (`contact-modal.tsx:82`, `mcp/page.tsx:454`). At text sizes this reduces legibility; it is a display-size treatment. | grep `tracking-tight` |
| T-8 | Contrast failures against white (WCAG 2.2 AA requires 4.5:1 for text under 24 px): `text-neutral-400` = **2.52:1**, used for every uppercase section label at 12 px (`rock-interface.tsx:606`, `aqua-position-card.tsx`, `social-bridge.tsx:39`); `text-neutral-300` = 1.48:1 (placeholders); `text-green-600` = 3.30:1 (price impact, `trade-modal.tsx:553`); `text-yellow-600` = 2.94:1 (`trade-modal.tsx:553`); `text-amber-600` = 3.19:1. `text-neutral-500` passes at 4.74:1 on white but only 4.35:1 on `neutral-100` cards. | computed from Tailwind v4 palette hex values |
| T-9 | Inputs below 16 px trigger iOS Safari's automatic zoom on focus: `transfer-modal.tsx:189` (`text-sm`), `admin/login/page.tsx:54` (`text-sm`), `rock-alerts.tsx:363` (`select` at `text-xs`), `aqua-position-card.tsx:265` (`text-sm`). | source |
| T-10 | `prose` classes are used on the legal pages and the Aqua explainer, but `@tailwindcss/typography` is not installed; they are no-ops. | `app/privacy/page.tsx:52`, `aqua-info-modal.tsx:202`; `web/package.json` |
| T-11 | The animated headline renders one flex item per character with `flexWrap: "wrap"`, so words break mid-word at any width; `overflow: hidden` on the `h1` clips descenders and the blur-in animation. | `components/animated-text.tsx:47-62` |
| T-12 | Nothing in `web/src` references `prefers-reduced-motion` or the `motion-safe:` / `motion-reduce:` variants, although spec 07 requires reduced-motion support. | grep |

## 1.2 Layout on phones

| # | Fact | Evidence |
| --- | --- | --- |
| L-1 | `viewportFit: "cover"` is set, so content extends under the notch and the home indicator, and **no** `env(safe-area-inset-*)` appears anywhere in `web/src`. No `dvh` unit is used; the hero is `h-[100vh]`, the Aqua explainer `h-[95vh]`, the onboarding modal `max-h-[90vh]` — on iOS Safari the visible height is smaller than `100vh` while the URL bar is shown, so bottoms are cut off. | `layout.tsx:21`; `app/page.tsx:15`; `aqua-info-modal.tsx:156`; `privy-onboarding-modal.tsx:47`; grep |
| L-2 | The header is `fixed` with `p-6` (24 px) on every side and six items in one row (`Bank Rock`, `Shop`, `AI Oracle`, `Live Demo →`, mute, `Connect Wallet`) with `gap-6`. The sum exceeds 360 px; nothing collapses. When signed in, the right side becomes an address pill (`0x71C8…1b47`), an `Embedded` badge, a copy icon and a `Log out` button — about 300 px on its own. | `components/header.tsx:14-18`; `components/login-button.tsx:32-70` |
| L-3 | No page reserves space for the fixed header; the rock page starts at `p-6`, so its `h1` sits under the header until the user scrolls. The legal pages add a second `sticky top-0 z-40` header that is permanently hidden behind the global `fixed top-0 z-50` one. | `rock-interface.tsx:542`; `app/privacy/page.tsx:15` |
| L-4 | Two fixed bottom elements share the same anchor, `fixed bottom-6 left-1/2 -translate-x-1/2`: the judge demo switcher (`z-40`) and the update toast (`z-[100]`). On the rock page both render; the toast covers the switcher, and the switcher covers page content because no bottom padding is reserved. Neither respects the home-indicator inset. | `components/demo-switcher.tsx:22`; `components/version-check.tsx:70`; `rock-interface.tsx` mounts both |
| L-5 | Seven hand-rolled modals. Four have no maximum height and no internal scrolling while they lock body scroll: contact (`contact-modal.tsx:74`), trade (`trade-modal.tsx:292`), give (`transfer-modal.tsx:146`), cross-chain (`cross-chain-modal.tsx:327`). Their content exceeds 640 px, and because the backdrop is `items-center` + `overflow-y-auto`, the overflow is clipped at the **top** and cannot be reached. The contact form's submit button is unreachable on a 640 px-tall phone, and more so with the keyboard open. `info-modal.tsx:54` is the one correct pattern (`max-h-full overflow-y-auto`). `about-rocks.tsx` has no Escape handler. | source |
| L-6 | **The trade confirmation cannot be completed on small phones.** The swipe-to-swap control is a 56 px knob in an `overflow-hidden` track with `dragConstraints={{ right: 300 }}` and a fixed 200 px threshold. The track is about 280 px wide at 360 px and about 240 px at 320 px; the knob disappears under the clip before the threshold is reached. | `trade-modal.tsx:600-656` |
| L-7 | Full 42-character addresses rendered without truncation inside narrow columns (`cross-chain-modal.tsx:369`, `transfer-modal.tsx:296`); an unbreakable config path (`mcp/page.tsx:316`); rows with several fixed-width children and no `flex-wrap` (`mcp/page.tsx:433,457`, `newsletter-signup.tsx:131`, `rock-activity.tsx:90`, `version-check.tsx:70`). | source |
| L-8 | Touch targets. Every size in `ui/button.tsx` is 24–36 px tall (`h-6` … `h-9`, `size-6` … `size-9`) and the base class is `whitespace-nowrap`. Hand-rolled icon buttons go lower: copy owner address `p-1` + 14 px icon ≈ 22 px (`rock-interface.tsx:555`), `cross-chain-modal.tsx:374,736` ≈ 20–22 px, `trade-modal.tsx:361,370` ≈ 28 px, `aqua-position-card.tsx:207` has no padding at all, `login-button.tsx:52` `p-0.5` + 12 px icon. Spec 07 requires 44 × 44. | `components/ui/button.tsx:22-32`; source |
| L-9 | Grid without a mobile fallback: `grid-cols-3` for the spread selector — three cells of ~82 px each holding `0.30% (Standard)` at 12 px. | `aqua-position-card.tsx:231` |
| L-10 | Three.js on phones: the landing canvas has no `dpr` cap and no `frameloop` control, renders `ContactShadows` at 512 and an HDRI `Environment`; the Aqua explainer runs a second full-bleed canvas behind a scrolling modal; the "How it works" hover background only responds to mouse events and is dead weight on touch. | `rock-canvas.tsx:93-125`; `aqua-info-modal.tsx:161`; `how-it-works.tsx:86-92` |
| L-11 | Charts: a `h-64` wrapper contains a heading **plus** a `ResponsiveContainer height="100%"`, so the chart overflows its box; tick labels are 10 px. | `analytics-dashboard.tsx:59-74,93-102` |
| L-12 | Tooltips are hover-only with no tap or long-press affordance; the glossary terms in the Aqua explainer are unreachable on touch. | `components/ui/tooltip.tsx`; `aqua-info-modal.tsx:92-104` |
| L-13 | On the active rock page the two primary actions (`Trade with this rock`, `Give this rock`) come after the header block, the faucet banner and two metric cards — below the fold on a 360 × 640 viewport. Spec 07 puts the primary action above the fold. | `rock-interface.tsx:542-640` |
| L-14 | Body scroll locking is done by writing `document.body.style.overflow` from individual modals; two open layers (onboarding over trade) leave the page unlocked or stuck. | `contact-modal.tsx:36-42`, others |

---

# Part 2 — Decisions

### D-024 — One typeface, actually applied, with a fixed scale

**Decision:** the interface uses **Inter** (variable) for all text — body, UI and headings — loaded
through `next/font/google` and mapped to `--font-sans`. Geist Sans is removed. Geist Mono remains,
restricted to hashes, addresses, code and file paths. Font sizes come from a named scale defined
in `@theme`; arbitrary pixel or rem sizes are prohibited.

**Why Inter:** it is the most neutral and most legibility-tested screen face available at no
cost; it ships tabular figures, an optical-size axis, and full weight range in one file; it has
no stylistic quirks that compete with the object photography spec 07 wants to foreground. The
heading treatment (heavy weight, tight tracking) is kept; it simply now renders in a declared
face on every device instead of the OS default (T-3).

**Consequence:** T-1 to T-7 are fixed at the source. The change to headings is visible only on
devices whose system font differed from Inter; that is intended.

**Rejected:** keeping Geist (never seen by users; slightly stylised `a`/`g`); two families
(display + text) — two near-identical grotesques is a smell, and one variable file is lighter.

### D-025 — Mobile layout contract

**Decision:** every route must render on a 320 px-wide viewport with no horizontal scroll, every
interactive element must offer a 44 × 44 CSS-pixel hit area, no input may be below 16 px, every
overlay must be a bottom sheet on phones with its own scroll region, and fixed chrome must
respect safe-area insets and never cover content. The full contract is Part 4 and is enforced by
the checks in Part 7.

**Consequence:** the seven ad-hoc modals are replaced by one `Sheet` primitive; the header
collapses under `md`; fixed bottom elements move into one `BottomDock`; the swipe gesture is
replaced; `vh` becomes `dvh`.

**Displaces:** see Part 8.

---

# Part 3 — Typography system

## 3.1 Loading and wiring

`app/layout.tsx`:

```tsx
import { Inter, Geist_Mono } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  axes: ["opsz"],           // optical size; omit if the Google build stops exposing it
});
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });
// <html className={`${inter.variable} ${geistMono.variable} h-full antialiased`}>
```

`app/globals.css` — replaces the three broken lines:

```css
@theme inline {
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
               "Helvetica Neue", Arial, sans-serif;
  --font-mono: var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --font-heading: var(--font-sans);
}
html { font-family: var(--font-sans); font-optical-sizing: auto; }
```

`next/font` self-hosts the files and emits a size-adjusted fallback, so there is no layout shift
and no third-party request. Only two font files are loaded (Inter variable, Geist Mono variable).

## 3.2 Scale

Sizes are tokens in `@theme`; fluid sizes use `clamp()` so headings scale with the viewport
without breakpoint classes. Body text does not scale: it is 16 px everywhere.

| Token | Size | Line height | Tracking | Weight | Use |
| --- | --- | --- | --- | --- | --- |
| `text-display` | `clamp(3rem, 14vw, 9rem)` (50 px at 360, 144 px from 1030) | 0.95 | −0.04 em | 800 | Landing hero only |
| `text-h1` | `clamp(2rem, 1.5rem + 2.2vw, 3rem)` (32 → 48 px) | 1.1 | −0.025 em | 800 | Page title (`Rock #12`, `Dormant Rock`) |
| `text-h2` | `clamp(1.5rem, 1.2rem + 1.2vw, 1.875rem)` (24 → 30 px) | 1.2 | −0.02 em | 700 | Section and sheet titles |
| `text-h3` | `1.25rem` (20 px) | 1.3 | −0.01 em | 600 | Card titles |
| `text-lead` | `clamp(1.125rem, 1rem + 0.5vw, 1.25rem)` (18 → 20 px) | 1.5 | 0 | 400 | Hero and intro paragraphs |
| `text-base` | `1rem` (16 px) | 1.6 | 0 | 400 | All body copy, all inputs, legal text |
| `text-sm` | `0.875rem` (14 px) | 1.5 | 0 | 400/500 | Secondary copy, helper text, table cells |
| `text-caption` | `0.8125rem` (13 px) | 1.45 | 0 | 500 | Timestamps, metadata — **the floor for anything a user reads** |
| `text-label` | `0.75rem` (12 px) | 1.3 | +0.06 em | 600, uppercase | Eyebrow labels and badges only; never a sentence |
| `text-num-lg` | `clamp(1.75rem, 1.25rem + 2vw, 2.5rem)` (28 → 40 px) | 1.1 | −0.02 em | 700, tabular | Headline balance |
| `text-num` | `1.25rem` (20 px) | 1.3 | 0 | 600, tabular | Secondary amounts |

```css
@theme inline {
  --text-display: clamp(3rem, 14vw, 9rem);            --text-display--line-height: 0.95; --text-display--letter-spacing: -0.04em;
  --text-h1: clamp(2rem, 1.5rem + 2.2vw, 3rem);         --text-h1--line-height: 1.1;       --text-h1--letter-spacing: -0.025em;
  --text-h2: clamp(1.5rem, 1.2rem + 1.2vw, 1.875rem);   --text-h2--line-height: 1.2;       --text-h2--letter-spacing: -0.02em;
  --text-h3: 1.25rem;                                   --text-h3--line-height: 1.3;       --text-h3--letter-spacing: -0.01em;
  --text-lead: clamp(1.125rem, 1rem + 0.5vw, 1.25rem);  --text-lead--line-height: 1.5;
  --text-base: 1rem;                                    --text-base--line-height: 1.6;
  --text-sm: 0.875rem;                                  --text-sm--line-height: 1.5;
  --text-caption: 0.8125rem;                            --text-caption--line-height: 1.45;
  --text-label: 0.75rem;                                --text-label--line-height: 1.3;    --text-label--letter-spacing: 0.06em;
  --text-num-lg: clamp(1.75rem, 1.25rem + 2vw, 2.5rem); --text-num-lg--line-height: 1.1;   --text-num-lg--letter-spacing: -0.02em;
  --text-num: 1.25rem;                                  --text-num--line-height: 1.3;
  --text-xs: initial; /* removed: 12 px sentences are not allowed; use text-caption or text-label */
}
```

Rules:

1. Nothing renders below 12 px. Nothing a user must read renders below 13 px. `text-xs` is
   removed from the theme so it cannot be used by habit; the only 12 px token is `text-label`,
   which is uppercase, tracked and never a sentence.
2. No `text-[…px]` or `text-[…rem]`. If a size is missing, add a token here first.
3. `tracking-tighter` only on `text-display`. `tracking-tight` only on `h1`/`h2`. Body copy has
   zero tracking. `text-label` has positive tracking.
4. Weights: 400 body, 500 emphasis in running text, 600 buttons and card titles, 700 section
   titles, 800 page titles and display. `font-black` (900) is not used.
5. Headings must fit in three lines at 360 px. If a heading does not, shorten the copy, not the
   type.
6. Paragraph measure 45–75 characters: `max-w-prose` (65 ch) on any block of running text.
7. Never smaller on phones than on desktop. A responsive size class only ever increases with
   the viewport (`text-base sm:text-lead`, never `text-sm sm:text-base`).

## 3.3 Numbers

- Every amount, balance, fee, counter and timestamp uses `tabular-nums` so columns align and
  live values do not jitter. Provide it as a `<Amount>` component that also formats with
  `Intl.NumberFormat` and never renders more precision than the token has (USDC 2 dp, WETH 4 dp).
- Numbers are set in Inter, not monospace. Monospace is for identifiers, not quantities.
- Units follow the number in `text-sm font-medium text-ink-2`, never uppercase-tracked.

## 3.4 Monospace policy

`font-mono` is allowed only inside these components: `<Address>`, `<TxHash>`, `<CodeBlock>`,
`<InlineCode>`. Minimum size 13 px. It is not used for labels, buttons, badges, amounts, prose or
tab titles.

## 3.5 Colour and contrast tokens

Text colours are semantic tokens with verified contrast on the surfaces they may appear on.
Raw `text-neutral-*` / `text-green-*` classes are not used for text.

| Token | Value | On white | On `neutral-50` card | Allowed for |
| --- | --- | --- | --- | --- |
| `text-ink` | neutral-950 | 19.7:1 | 19.1:1 | Primary text, headings |
| `text-ink-2` | neutral-700 `#404040` | 10.4:1 | 9.9:1 | Body and secondary copy |
| `text-ink-3` | neutral-600 `#525252` | 7.8:1 | 7.5:1 | Captions, labels, metadata — the default for anything small |
| `text-ink-4` | neutral-500 `#737373` | 4.7:1 | 4.5:1 | Placeholders and disabled text only; never on `neutral-100` or darker |
| `text-positive` | green-700 `#15803d` | 5.0:1 | 4.8:1 | Earned fees, success |
| `text-warning` | amber-700 `#b45309` | 5.0:1 | 4.8:1 | Price impact, caution |
| `text-danger` | red-700 `#b91c1c` | 6.5:1 | 6.2:1 | Errors, clone detected |
| `text-link` | blue-700 `#1d4ed8` | 6.7:1 | 6.4:1 | Links, "Verified physical" |

`neutral-400` and lighter are decorative (rules, disabled icons) and never carry text.
`green-600`, `yellow-600`, `amber-600` are not text colours (T-8).

## 3.6 Microcopy

Unchanged from spec 07 (plain English, `Top Up` not `Deposit`). Added: a label, badge or button
never exceeds two words on a phone; a helper line never exceeds one sentence; an error message
says what to do next.

---

# Part 4 — Responsive layout system

## 4.1 Viewports

Design at **360 × 640** first. Verify at 320 × 568 (floor), 390 × 844, 430 × 932, 768 × 1024 and
1280 × 800. Tailwind breakpoints stay at their defaults (`sm` 640, `md` 768, `lg` 1024); the base
(unprefixed) classes *are* the phone design. A `md:` class with no working base layout is a bug.

## 4.2 Page frame

```css
:root {
  --gutter: 1rem;                 /* 16 px < 640 */
  --header-h: 3.5rem;             /* 56 px */
  --dock-h: 0px;                  /* set by <BottomDock> via ResizeObserver */
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
}
@media (min-width: 640px)  { :root { --gutter: 1.5rem; } }
@media (min-width: 1024px) { :root { --gutter: 3rem; --header-h: 4.5rem; } }

html  { scroll-padding-top: calc(var(--header-h) + var(--safe-top)); }
main  { padding-top: calc(var(--header-h) + var(--safe-top));
        padding-bottom: calc(var(--dock-h) + var(--safe-bottom) + 1.5rem);
        padding-inline: var(--gutter); }
```

- Content max-widths: rock page `max-w-3xl`, prose pages `max-w-2xl`, landing sections
  `max-w-5xl`. All centred with `mx-auto`; never a fixed pixel width.
- Full-height sections use `min-h-dvh` / `h-dvh`. `100vh`, `h-screen` and `min-h-screen` are
  banned (L-1).
- The landing hero may sit under the transparent header; every other route starts below it.
- `body { overflow-x: clip }` is **not** a fix and is not used; horizontal overflow must be
  absent, not hidden.
- `viewport` export gains `interactiveWidget: "resizes-content"` so the on-screen keyboard
  shrinks the layout instead of covering sheet footers on Android.

## 4.3 Header

| Viewport | Left | Right |
| --- | --- | --- |
| `< md` | Wordmark (`text-h3`, 700) | Sound toggle (44 px icon button) · auth control · menu (44 px icon button) opening a `Sheet` with Shop, AI Oracle, Live Demo |
| `≥ md` | Wordmark | Shop · AI Oracle · Live Demo → · sound · auth control |

- Height `var(--header-h)`; `padding-top: var(--safe-top)`; `px-[var(--gutter)]`.
- Auth control signed out: `Connect` button, 44 px tall, `text-sm` 600. The "last used" hint
  moves into the Privy sheet, not under the button.
- Auth control signed in: one chip, 44 px tall, showing `0x71C8…1b47` in `<Address>` form.
  Tapping opens an account `Sheet` with the full address + copy, the network, `Embedded wallet`
  status and `Log out`. Nothing else lives in the header (L-2).
- `Live Demo` links to `/rock/1` only while `NEXT_PUBLIC_DEMO_MODE=true` (spec 15 D-013);
  otherwise the item is absent.

## 4.4 Sheet — the only overlay primitive

Built on `@base-ui/react` `Dialog` (already a dependency; `shadcn/tailwind.css` supplies its
`data-open` variants). Every current modal — trade, give, cross-chain, Aqua explainer, contact,
info, onboarding, about-rocks — is a `Sheet`.

| | `< sm` (phones) | `≥ sm` |
| --- | --- | --- |
| Position | Bottom, full width, `rounded-t-3xl`, visual grab bar (no swipe-to-dismiss; close button, Escape and backdrop dismiss) | Centred dialog, `max-w-md` (`max-w-2xl` for the explainer), `rounded-3xl` |
| Height | `max-h-[90dvh]` | `max-h-[85dvh]` |
| Structure | Sticky header (title `text-h2`, 44 px close button) · scrollable body · sticky footer holding the primary action | same |
| Padding | `px-4`, footer `pb-[calc(1rem+var(--safe-bottom))]` | `p-6` |

Behaviour, provided by the primitive and never re-implemented per modal: focus trap, Escape,
backdrop tap, scroll lock (no `document.body.style.overflow` anywhere, L-14), return focus on
close, `aria-labelledby`. Nested sheets stack; the primitive manages the lock count.

The primary action of a sheet is always visible without scrolling the sheet body at 360 × 640
(L-5). The Aqua explainer's background canvas is removed (L-10); the explainer is a sheet with
tabs and static illustrations.

## 4.5 Controls

- `Button` sizes are redefined: `sm` 40 px (inline secondary only), `default` 48 px, `lg` 56 px,
  `icon` 44 × 44, `icon-lg` 48 × 48. No size below 40 px exists. `whitespace-nowrap` is removed
  from the base; a button label may wrap to two lines.
- `IconButton` is the only way to render an icon-only control: `size-11` (44 px), 20 px icon,
  required `aria-label`. All `p-1`/`p-1.5` icon buttons are replaced (L-8).
- Inputs: `text-base` minimum (T-9), `h-12`, `inputMode="decimal"` for amounts,
  `autoComplete="off" spellCheck={false}` for addresses, an inline action (`Paste`, `Max`) as a
  44 px button inside the field rather than absolute-positioned text.
- Percent shortcuts, token toggles and chain tiles are 44 px tall and wrap (`flex-wrap`) rather
  than shrink.
- Native `<select>` is 48 px tall at `text-base` or replaced by a `Sheet` picker.
- Checkboxes are 24 px with a 44 px clickable label.
- **Swipe-to-confirm is removed** (L-6). The trade confirmation is a full-width 56 px button
  labelled `Swap 25 USDC → 0.0091 WETH`; the sheet already provides the review step.

## 4.6 Long strings

- `<Address value onCopy explorerHref>`: middle-truncates to `0x71C8…1b47`, `font-mono
  text-caption`, 44 px copy button, optional explorer icon button. Full value on the account
  sheet only.
- `<TxHash>`: same, `0x89f7…f041`. A hash is only ever rendered through this component (which
  also enforces spec 15 D-014: it accepts a value that came from a receipt, never a string
  literal).
- `<CodeBlock>`: `overflow-x-auto`, `break-all` for single tokens such as file paths, copy
  button in the corner, `text-caption font-mono`.
- Every horizontal `flex` row of chips, links or stats has `flex-wrap`; every `justify-between`
  row with text on both sides stacks (`flex-col sm:flex-row`) below `sm` (L-7).

## 4.7 Motion

- Every entrance animation is `motion-safe:`; under `prefers-reduced-motion: reduce` content is
  simply present (T-12).
- `AnimatedText` animates per **word** (`inline-block`, `white-space: nowrap` per word) with no
  `overflow: hidden` on the heading (T-11).
- Primary-button state morphing (STEERING.md) is kept; it uses transforms and opacity only.

## 4.8 3D and media

- The landing canvas: `dpr={[1, 1.5]}`, `frameloop="demand"` when idle, paused on
  `visibilitychange`, not mounted under `prefers-reduced-motion`, `touch-action: pan-y` so it
  never captures vertical scroll, `ContactShadows` resolution 256 on phones, no HDRI
  `Environment` below `md` (a three-light rig instead). Same rock, smaller bill (L-10).
- The hover-driven 3D background in "How it works" is desktop-only (`hidden md:block`) and not
  loaded on phones.
- The rock page loads no Three.js at all; it is the page opened from the tag.
- Budget, mobile Lighthouse preset over simulated 4G: LCP ≤ 2.5 s on `/` and `/rock/[id]`,
  CLS ≤ 0.1, `/rock/[id]` JavaScript ≤ 350 kB gzipped.

## 4.9 Chrome and stacking

`<BottomDock>` is rendered once in the root layout: `fixed inset-x-0 bottom-0`, `px-[var(--gutter)]`,
`pb-[var(--safe-bottom)]`, children stacked with `gap-2`, `pointer-events-none` on the container
and `pointer-events-auto` on children. It measures itself and writes `--dock-h`. Its only
occupants are the demo switcher (when the flag is on; collapsed to a 44 px pill by default), the
update toast and the `sonner` `Toaster` (`position="bottom-center"`, `offset` bound to the dock).
Nothing else may be `position: fixed` at the bottom (L-4).

| Layer | z-index |
| --- | --- |
| Header | 40 |
| Bottom dock | 45 |
| Sheet backdrop + panel | 50 |
| Toasts | 60 |

Legal pages lose their own sticky header (L-3); their section list becomes an in-page contents
block under the title.

---

# Part 5 — Per-surface requirements

| Surface | Requirements on a 360 × 640 viewport |
| --- | --- |
| Landing hero | `min-h-dvh`; `text-display` headline wraps by word, three lines maximum; `text-lead` paragraph, `max-w-prose`, zero tracking; two CTAs stacked full-width (`flex-col sm:flex-row`); canvas per 4.8. |
| Landing sections | Cards `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`; the newsletter trust line wraps; section padding `py-16 sm:py-24`, never `p-24` on phones. |
| Rock page — dormant | Title, state badge, attestation line, then the primary button, all within the first viewport; the demo switcher (if present) does not overlap the button. |
| Rock page — active | Order on phones: identity row (title + state badge) → attestation line → headline reserve (`text-num-lg` + unit) → `Trade` (primary, 56 px) and `Give` (secondary) → cross-chain entry → position card → alerts → provenance. Metric cards become one card with two rows; the second card's "strategy" copy becomes a `text-caption` line under the reserve. The primary action is above the fold (L-13). |
| Trade sheet | Amount input `text-num-lg`, unit selector as a 44 px chip; the fee card is a two-column definition list at `text-sm`; price impact uses `text-warning`/`text-danger` tokens; confirmation is a button (4.5). |
| Give sheet | Recipient field `text-base` with a 44 px `Paste` button; ENS names are either resolved or rejected before enabling the action (spec 15 X-3); the confirmation shows `<Address>` for both parties; the consent checkbox has a 44 px label. |
| Cross-chain sheet | Chain tiles 44 px, `grid-cols-2 sm:grid-cols-5`; the Rock Account address through `<Address>`; the disclaimer at `text-sm`, not 11 px; the whole sheet carries the `SIMULATED` badge (spec 15). |
| Aqua explainer | Sheet with tabs; no background canvas; glossary terms are tappable `Popover`s (`@base-ui/react`), not hover tooltips (L-12); the comparison table is a stacked list below `sm`. |
| Position card | Reserve figures in `text-num` tabular; labels `text-label text-ink-3`; spread selector `grid-cols-1 sm:grid-cols-3` with 48 px options (L-9); `Sync state` is a real button. |
| Alerts | Topic title `text-sm` 600, description `text-sm text-ink-2` (not 11 px), category badge `text-label`; the email field and frequency select at `text-base`; `Enable push` is a 48 px button in its own row. |
| Provenance timeline | Row = icon · title (`text-sm` 600) · description (`text-sm text-ink-2`) · `text-caption` timestamp · `<TxHash>`; indent 24 px, not 40; no hash or explorer link when there is no real transaction (spec 15 D-014). |
| Social bridge | Email through `truncate`; vanity input full width with the prefix as a static label above it. |
| Shop | Two cards stacked; contact form as a sheet with a reachable submit. |
| MCP page | Config path in `<CodeBlock>`; tool signatures wrap; the two CTAs stack; the footer link row wraps. |
| Legal pages | `text-base` body on all viewports; no sticky sub-header; headings `text-h2`/`text-h3`. |
| Admin | KPI numbers `text-num-lg` tabular, deltas `text-sm`; feed rows stack below `sm`; charts get an explicit height separate from their heading, tick labels 12 px, `interval="preserveStartEnd"`. |
| Demo switcher | Only with `NEXT_PUBLIC_DEMO_MODE=true`; lives in the dock; collapsed pill 44 px; scenario buttons 48 px; cannot set the attestation state (spec 15 F-7). |
| Update toast | Lives in the dock; one line + one 44 px action + one 44 px dismiss; wraps below `sm`. |
| Onboarding sheet | Steps as a stacked list; step badge `text-label`; the hook-order crash (spec 15 X-1) fixed first. |
| SIMULATED badge, demo banner, UNAVAILABLE empty state (spec 15) | `text-label` badge with `text-ink` on `amber-100`; banner one line at `text-sm` inside the header flow, not fixed; empty state = icon, one-sentence `text-base` explanation, optional 48 px action. |

---

# Part 6 — Phases

Each phase is independently shippable. This work is UI-only, runs in parallel with Phases 1–5 of
spec 15, and lands **before** its Phase 6 (the badges, banner and empty states are new surfaces
that must follow this contract).

**U0 — Typography foundation (½ day).** Wire Inter (3.1); add the scale and colour tokens
(3.2, 3.5); delete `text-xs` from the theme; replace every `text-[…px]` and `text-xs`; strip
tracking from body copy; add `<Amount>`, `<Address>`, `<TxHash>`, `<CodeBlock>`; restrict
`font-mono` to them. *Acceptance:* the Part 7 typography greps pass; computed `font-family` on
`body` starts with `Inter`.

**U1 — Frame and chrome (½ day).** Page frame variables and safe areas (4.2); header collapse
(4.3); `BottomDock` and z-index scale (4.9); `dvh` everywhere; `viewport.interactiveWidget`.
*Acceptance:* no horizontal scroll on any route at 320 px; the first heading of every route is
below the header; nothing fixed overlaps anything else fixed.

**U2 — Sheets and controls (1–2 days).** `Sheet` primitive; migrate the eight overlays; `Button`
and `IconButton` sizes; inputs to 16 px; remove the swipe gesture; remove per-modal scroll locks.
*Acceptance:* every sheet's primary action is visible without scrolling at 360 × 640; every
interactive element ≥ 44 px; zero inputs < 16 px.

**U3 — Surfaces (1 day).** The Part 5 table, row by row; charts; popovers; animated text;
canvas budget.

**U4 — Verification in CI (½ day).** The Part 7 checks, run on every pull request.

---

# Part 7 — Definition of done

Static checks, added to `ci.yml` next to the spec 15 greps:

```
# Fonts are wired (T-1, T-2)
grep -q "var(--font-inter)" web/src/app/globals.css
! grep -qE "^\s*--font-sans:\s*var\(--font-sans\)" web/src/app/globals.css
! grep -rq "Geist(" web/src/app/layout.tsx

# Scale only — no arbitrary sizes, no text-xs (T-5, 3.2)
! grep -rE "text-\[[0-9.]+(px|rem)\]" web/src
! grep -rE "\btext-xs\b" web/src --include=*.tsx --include=*.ts   # the theme line `--text-xs: initial` in globals.css is the fix, not a violation

# Viewport units (L-1)
! grep -rE "\b(h|min-h|max-h)-(screen|\[[0-9]+vh\])" web/src
grep -q "safe-area-inset" web/src/app/globals.css

# One overlay primitive, one scroll lock (L-5, L-14)
! grep -rq "document\.body\.style\.overflow" web/src

# Display tracking only on display (T-7)
! grep -rE "tracking-tighter" web/src | grep -v "text-display"

# No pixel drag thresholds (L-6)
! grep -rE "dragConstraints=\{\{" web/src

# Contrast: raw low-contrast text classes are not used for text (T-8)
! grep -rE "text-(neutral-(300|400)|green-600|yellow-600|amber-600)\b" web/src --include=*.tsx
```

Browser checks, `web/e2e/responsive.spec.ts`, run in CI against a production build with
`NEXT_PUBLIC_DEMO_MODE=true` so every surface renders. For each route in
`/`, `/rock/1`, `/rock/2`, `/shop`, `/mcp`, `/alerts`, `/privacy`, `/admin/login` and each
viewport in 320 × 568, 360 × 640, 390 × 844, 768 × 1024, 1280 × 800:

1. `document.documentElement.scrollWidth <= window.innerWidth`.
2. No visible element with computed `font-size < 12px`; no visible element with text content
   longer than 40 characters below 13 px.
3. Every visible `a[href], button, input, select, textarea, [role=button]` has a bounding box of
   at least 44 × 44, except links inside `p` and `li`.
4. Every visible `input, select, textarea` has computed `font-size >= 16px`.
5. `getComputedStyle(document.body).fontFamily` starts with `Inter`.
6. The first `h1` is not covered by the header (`top >= header.bottom`).
7. On `/rock/2` at 360 × 640 the `Trade with this rock` button is fully inside the first viewport.
8. Open each sheet (trade, give, cross-chain, contact, explainer): the primary button's bounding
   box is inside the viewport without scrolling the page; the sheet body is scrollable.
9. `axe-core` reports zero `color-contrast` and zero `target-size` violations.
10. Lighthouse mobile on `/` and `/rock/2`: performance ≥ 80, accessibility ≥ 95, LCP ≤ 2.5 s,
    CLS ≤ 0.1.

And the one check that stays manual, per the user's instruction that they test on devices: a
tap on a real rock, on an iPhone with the URL bar visible and on a small Android, reaches the
primary action without scrolling and the trade sheet's confirm button without hunting.

---

# Part 8 — Scope displacement

| Cut or reduced | Was in | Rationale |
| --- | --- | --- |
| Swipe-to-swap gesture | `trade-modal.tsx` | Unreachable on small phones (L-6); the review step already prevents accidental swaps. |
| Aqua explainer background canvas | `aqua-info-modal.tsx` | A second WebGL context behind a scrolling modal, on the page opened from a tag (L-10). |
| Hover 3D background on phones | `how-it-works.tsx` | Mouse-only; dead weight on touch. |
| HDRI environment on the landing canvas below `md` | `rock-canvas.tsx` | Network and GPU cost with no visible benefit at phone size. |
| Header "Live Demo" link outside demo mode | `header.tsx` | Follows spec 15 D-013. |
| `text-xs` as a size | theme | Removed so the floor cannot be crossed by habit. |
| Geist Sans | `layout.tsx` | Never rendered; replaced by Inter (D-024). |

Nothing from the MVP list in spec 08 is displaced. The WebXR/AR item was already cut by spec 15
Part 6.

---

## Amendments to the decision log

Decisions D-024 and D-025 are added to [`09-decisions.md`](./09-decisions.md). Spec 07's
typography and accessibility sections now defer to this document.
