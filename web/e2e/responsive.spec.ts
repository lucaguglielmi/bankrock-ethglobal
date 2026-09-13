import { test, expect, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PRIMARY_MOBILE_PROJECT } from "../playwright.config";
import {
  ROUTES,
  routeSlug,
  collectPageAudit,
  formatIssues,
  fontFamilyStartsWithInter,
  gotoAndSettle,
} from "./helpers";

/**
 * Browser checks for specs/17-mobile-ui-and-typography.md Part 7, items 1-9.
 *
 * Runs against a plain production build — there is no build flag — and, in this CI job, no chain
 * configured: no `NEXT_PUBLIC_REGISTRY_ADDRESS`. `/rock/1` and `/rock/2` therefore read
 * `UNAVAILABLE` (spec 15 Part 3) and show the honest empty state alone, never the live
 * `Trade`/`Give` controls, which only mount once a rock record actually reads `REAL`. The rock
 * dashboard itself is checked on `/rock/420`, the stage demo (`src/demo/rock-420`): gated by its
 * id alone, it renders a full, badged rock page from browser state with no chain at all, so items
 * 7 and 8 run against real controls instead of skipping. Point this job's env at a deployed
 * registry and `/rock/1` and `/rock/2` render their live pages too.
 *
 * Item 10 (Lighthouse mobile performance/accessibility budgets) is not run here: it needs a
 * throttled-network run against a public deployment, which is out of place in a PR-blocking unit
 * of CI. It stays a manual check per spec 17 Part 7's own note that device testing is manual.
 */

test.describe("layout and typography — items 1, 2, 3, 4, 5, 6", () => {
  for (const route of ROUTES) {
    test(`${routeSlug(route)}: no h-scroll, readable text, 44px targets, 16px inputs, Inter body, uncovered h1`, async ({
      page,
    }) => {
      await gotoAndSettle(page, route);
      const audit = await collectPageAudit(page);

      // 1. No horizontal scroll (a 1px tolerance for scrollbar/subpixel rounding).
      expect(
        audit.scrollWidth,
        `document.documentElement.scrollWidth (${audit.scrollWidth}) exceeds window.innerWidth (${audit.innerWidth})`,
      ).toBeLessThanOrEqual(audit.innerWidth + 1);

      // 2. No visible text below the readable floor.
      expect(audit.smallText, formatIssues(audit.smallText)).toEqual([]);

      // 3. Every visible interactive element is >= 44 x 44 (links inside p/li excepted).
      expect(audit.smallTargets, formatIssues(audit.smallTargets)).toEqual([]);

      // 4. Every visible input/select/textarea is >= 16px (T-9: avoids iOS Safari zoom-on-focus).
      expect(audit.smallInputs, formatIssues(audit.smallInputs)).toEqual([]);

      // 5. The body's computed font-family starts with Inter (D-024).
      expect(
        fontFamilyStartsWithInter(audit.bodyFontFamily),
        `computed body font-family was "${audit.bodyFontFamily}"`,
      ).toBe(true);

      // 6. The first h1 is not covered by the fixed header (L-3).
      expect(audit.h1Present, "expected an <h1> on this route").toBe(true);
      expect(audit.headerPresent, "expected the global fixed <header> to be present").toBe(true);
      expect(
        audit.h1CoveredByHeader,
        "the first <h1>'s top is above the fixed header's bottom edge",
      ).toBe(false);
    });
  }
});

test.describe("primary action above the fold — item 7", () => {
  test("the primary action on /rock/420 is fully inside the first viewport at 360x640", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== PRIMARY_MOBILE_PROJECT,
      "checked once, at the viewport spec 17 item 7 names (360x640)",
    );

    // The stage demo is an awake, funded rock, so its identity row carries "Add funds" — the
    // same button, in the same place, a live awake rock renders (rock-interface.tsx).
    await gotoAndSettle(page, "/rock/420");

    // "Retired rock" is a heading with no action (ArchivedRock), not a button; the other three
    // are button labels. Matching both element kinds is what the spec's own regex implies.
    const candidate = page
      .getByRole("button", {
        name: /Trade with this rock|Add funds|Start earning|Gift this rock|Awaken this rock|Claim this rock/,
      })
      .or(page.getByRole("heading", { name: /Retired rock/ }))
      .first();

    await expect(candidate, "the demo rock page rendered no primary action").toBeVisible();
    const box = await candidate.boundingBox();
    const viewport = page.viewportSize();
    expect(box, "the primary action has no bounding box").not.toBeNull();
    expect(viewport, "no viewport size reported for this project").not.toBeNull();

    if (box && viewport) {
      expect(box.y, "the primary action's top is above the viewport").toBeGreaterThanOrEqual(0);
      expect(box.x, "the primary action's left edge is left of the viewport").toBeGreaterThanOrEqual(0);
      expect(
        box.y + box.height,
        `the primary action's bottom (${(box.y + box.height).toFixed(1)}px) exceeds the viewport height (${viewport.height}px)`,
      ).toBeLessThanOrEqual(viewport.height);
      expect(
        box.x + box.width,
        `the primary action's right edge (${(box.x + box.width).toFixed(1)}px) exceeds the viewport width (${viewport.width}px)`,
      ).toBeLessThanOrEqual(viewport.width);
    }
  });
});

interface SheetCheck {
  /** Accessible-name substring (case-insensitive) of the button that opens the sheet. */
  triggerName: string | RegExp;
  /** The sheet's title, which `@base-ui/react` wires as the dialog's accessible name. */
  sheetTitle: string;
  /**
   * Accessible-name substring of the sheet's primary footer action. Omit for a sheet with no
   * footer (the Aqua explainer, which is tabs-only by design) to fall back to its Close button —
   * the one action always reachable without scrolling, on any sheet.
   */
  primaryButtonName?: string | RegExp;
}

/**
 * Opens a sheet from its trigger and checks spec 17 item 8: the primary action is reachable
 * without scrolling the page, and the sheet exposes its own scrollable body region — the
 * `Sheet`/`SheetBody` contract (§4.4) that replaced seven ad-hoc modals, each of which used to
 * clip its overflow at the top with no way back to it (L-5).
 */
async function assertSheetReachable(page: Page, check: SheetCheck): Promise<void> {
  const trigger = page.getByRole("button", { name: check.triggerName }).first();
  await expect(
    trigger,
    `no button matching "${check.triggerName}" ever appeared`,
  ).toBeVisible({ timeout: 10_000 });

  // Playwright scrolls a below-the-fold trigger into view before it can click it. That scroll is
  // the page's business, not the sheet's, so it is made explicitly here and the position it
  // leaves the page at is the baseline the "no scrolling to reach the action" check compares to.
  await trigger.scrollIntoViewIfNeeded();
  const scrollYBeforeOpen = await page.evaluate(() => window.scrollY);
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: check.sheetTitle });
  await expect(dialog, `sheet titled "${check.sheetTitle}" did not open`).toBeVisible();

  const primary: Locator = check.primaryButtonName
    ? dialog.getByRole("button", { name: check.primaryButtonName }).first()
    : dialog.getByRole("button", { name: "Close" }).first();
  await expect(primary, "the sheet's primary action was not found inside it").toBeVisible();

  // On phone widths the sheet slides up from the bottom edge (`Sheet`: a 200 ms transform
  // transition from `translate-y-full`) and `toBeVisible` is already satisfied mid-slide. Item 8's
  // claim is that the action ends up wholly inside the viewport, so wait for exactly that — it
  // retries until the transition has finished — and only then measure the sheet at rest.
  await expect(
    primary,
    "the sheet's primary action never came fully into the viewport",
  ).toBeInViewport({ ratio: 1 });

  const [box, viewport, pageScrollY, hasScrollRegion] = await Promise.all([
    primary.boundingBox(),
    Promise.resolve(page.viewportSize()),
    page.evaluate(() => window.scrollY),
    dialog.evaluate((dialogEl) =>
      Array.from(dialogEl.querySelectorAll("div")).some(
        (div) => getComputedStyle(div).overflowY === "auto",
      ),
    ),
  ]);

  expect(box, "the primary action has no bounding box (not actually rendered)").not.toBeNull();
  expect(viewport, "no viewport size reported").not.toBeNull();
  if (box && viewport) {
    expect(box.y, "the primary action's top is above the viewport").toBeGreaterThanOrEqual(0);
    expect(
      box.y + box.height,
      `the primary action's bottom (${(box.y + box.height).toFixed(1)}px) exceeds the viewport height (${viewport.height}px), so it needs scrolling`,
    ).toBeLessThanOrEqual(viewport.height);
  }

  // `<=` rather than `===`: a modal scroll lock may pin the document and report 0 while the page
  // stays visually where it was, which is not a scroll made to reach the action.
  expect(
    pageScrollY,
    "the page itself scrolled to reveal the sheet's primary action — it should already be in view",
  ).toBeLessThanOrEqual(scrollYBeforeOpen);

  expect(
    hasScrollRegion,
    "the sheet has no overflow-y:auto region for its body (SheetBody's scroll contract)",
  ).toBe(true);

  await page.keyboard.press("Escape");
  await expect(dialog, "Escape did not close the sheet").toBeHidden();
}

test.describe("sheets are reachable without sign-in — item 8", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== PRIMARY_MOBILE_PROJECT,
      "sheet reachability is checked once, at 360x640 (spec 17 U2 acceptance)",
    );
  });

  test("contact sheet, from /shop", async ({ page }) => {
    await gotoAndSettle(page, "/shop");
    await assertSheetReachable(page, {
      triggerName: "Convince Us",
      sheetTitle: "Claim a Testnet Rock",
      primaryButtonName: "Send message",
    });
  });

  test("about-rocks sheet, from /", async ({ page }) => {
    await gotoAndSettle(page, "/");
    // "More about the rocks" is on the second slide now.
    await page.getByRole("button", { name: "Next slide" }).click();
    await assertSheetReachable(page, {
      triggerName: "More about the rocks",
      sheetTitle: "The stone itself",
      primaryButtonName: "Close",
    });
  });

  test("info sheet ('How do I control the rock?'), from /", async ({ page }) => {
    await gotoAndSettle(page, "/");
    await assertSheetReachable(page, {
      triggerName: "How do I control the rock?",
      sheetTitle: "How do I control the rock?",
      primaryButtonName: "Got it",
    });
  });

  // The Aqua explainer is no longer a sheet: "What is Aqua?" on the landing page is a link to
  // /learn/defi (components/how-it-works.tsx), and a page is covered by items 1-6 and 9 above.

  test("add funds sheet, from /rock/420", async ({ page }) => {
    // The demo rock's "Add funds" opens its own badged sheet (src/demo/rock-420/demo-fund-sheet)
    // through the same door — header CTA, owner menu — a live rock's wallet-transfer sheet uses.
    // Its footer action is disabled until an amount is typed; reachability is what is checked.
    await gotoAndSettle(page, "/rock/420");
    await assertSheetReachable(page, {
      triggerName: "Add funds",
      sheetTitle: "Add funds",
      primaryButtonName: /Add to the rock|Adding…|Done/,
    });
  });
});

test.describe("accessibility: zero color-contrast / target-size violations — item 9", () => {
  for (const route of ROUTES) {
    test(`${routeSlug(route)}: axe reports no color-contrast or target-size violations`, async ({
      page,
    }) => {
      await gotoAndSettle(page, route);

      // @axe-core/playwright types against its own copy of playwright; the runtime object is the same.
      const results = await new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]["page"] })
        .withRules(["color-contrast", "target-size"])
        .analyze();

      const summary = results.violations
        .map((violation) => {
          const targets = violation.nodes
            .slice(0, 5)
            .map((node) => node.target.join(" "))
            .join(", ");
          return `${violation.id} (${violation.impact ?? "unknown impact"}, ${violation.nodes.length} node(s)): ${targets}`;
        })
        .join("\n");

      expect(results.violations, summary).toEqual([]);
    });
  }
});
