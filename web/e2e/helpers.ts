import type { Page } from "@playwright/test";

/**
 * Shared helpers for specs/17-mobile-ui-and-typography.md Part 7's browser checks.
 *
 * Every route is read against a `NEXT_PUBLIC_DEMO_MODE=true` build with no chain configured
 * (no `NEXT_PUBLIC_REGISTRY_ADDRESS` in CI) — the state spec 17's own preamble assumes ("so every
 * surface renders") and spec 15 Part 3 calls `UNAVAILABLE`. `/rock/1` and `/rock/2` therefore
 * show the honest empty state plus, in demo mode, a disabled `RockSample` — never the live
 * `Trade`/`Give` UI, which only mounts once a rock record actually reads `REAL`.
 * Checks 7 and 8, which need those controls, detect this and skip with a clear reason (per the
 * task) instead of failing on data nobody configured for CI.
 */

export const ROUTES = [
  "/",
  "/rock/1",
  "/rock/2",
  "/savings",
  "/shop",
  "/mcp",
  "/alerts",
  "/privacy",
  "/admin/login",
] as const;

export type Route = (typeof ROUTES)[number];

/** A slug safe to use in a test title / project name. */
export function routeSlug(route: Route): string {
  return route === "/" ? "home" : route.replace(/^\//, "").replace(/\//g, "-");
}

export interface AuditIssue {
  selector: string;
  detail: string;
}

export interface PageAudit {
  scrollWidth: number;
  innerWidth: number;
  bodyFontFamily: string;
  h1Present: boolean;
  headerPresent: boolean;
  /** null when there is no h1 or no header to compare (itself worth failing on separately). */
  h1CoveredByHeader: boolean | null;
  smallText: AuditIssue[];
  smallTargets: AuditIssue[];
  smallInputs: AuditIssue[];
}

/**
 * Runs the whole of items 1, 2, 3, 4, 5 and 6 in one round trip to the page instead of one
 * Locator call per candidate element — with three hundred-plus DOM nodes on some routes (the
 * provenance timeline, the MCP tool list) a per-element `boundingBox()`/`evaluate()` pair would
 * be both slow and prone to timing flakiness across five viewport projects.
 */
export async function collectPageAudit(page: Page): Promise<PageAudit> {
  return page.evaluate<PageAudit>(() => {
    function describe(el: Element): string {
      const id = el.id ? `#${el.id}` : "";
      const classAttr = typeof el.className === "string" ? el.className : "";
      const cls = classAttr.trim()
        ? "." + classAttr.trim().split(/\s+/).slice(0, 2).join(".")
        : "";
      const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
      return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ""}`;
    }

    function isVisible(el: Element): boolean {
      const style = window.getComputedStyle(el);
      if (style.display === "none") return false;
      if (style.visibility === "hidden" || style.visibility === "collapse") return false;
      if (parseFloat(style.opacity || "1") <= 0.01) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      // Tailwind's `sr-only` (and similar visually-hidden patterns) clips content into a
      // 1x1px absolutely-positioned box rather than a zero-size one, so it passes the check
      // above; treat that shape as hidden too, the way axe-core's own visibility test does.
      if (rect.width <= 1 && rect.height <= 1 && style.position === "absolute") return false;
      return true;
    }

    /** Text that belongs directly to this element (its own text nodes), not its descendants'. */
    function ownText(el: Element): string {
      let text = "";
      el.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? "";
      });
      return text.trim();
    }

    const smallText: { selector: string; detail: string }[] = [];
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      if (!isVisible(el)) continue;
      const text = ownText(el);
      if (!text) continue;
      const fontSize = parseFloat(window.getComputedStyle(el).fontSize || "0");
      if (fontSize < 12 - 0.01) {
        smallText.push({
          selector: describe(el),
          detail: `font-size ${fontSize}px (floor is 12px) on "${text.slice(0, 60)}"`,
        });
      } else if (fontSize < 13 - 0.01 && text.length > 40) {
        smallText.push({
          selector: describe(el),
          detail: `font-size ${fontSize}px with ${text.length} characters of text (>40 chars needs >=13px): "${text.slice(0, 60)}…"`,
        });
      }
    }

    const smallTargets: { selector: string; detail: string }[] = [];
    const targets = document.body.querySelectorAll(
      "a[href], button, input, select, textarea, [role='button']",
    );
    for (const el of Array.from(targets)) {
      if (!isVisible(el)) continue;
      if (el.tagName === "A" && el.closest("p, li")) continue; // spec's stated exception
      const rect = el.getBoundingClientRect();
      const MIN = 44 - 0.5; // subpixel-rounding tolerance
      if (rect.width < MIN || rect.height < MIN) {
        smallTargets.push({
          selector: describe(el),
          detail: `${rect.width.toFixed(1)} x ${rect.height.toFixed(1)}px (needs >= 44 x 44)`,
        });
      }
    }

    const smallInputs: { selector: string; detail: string }[] = [];
    for (const el of Array.from(document.body.querySelectorAll("input, select, textarea"))) {
      if (!isVisible(el)) continue;
      const fontSize = parseFloat(window.getComputedStyle(el).fontSize || "0");
      if (fontSize < 16 - 0.01) {
        smallInputs.push({
          selector: describe(el),
          detail: `font-size ${fontSize}px (needs >= 16px so iOS Safari does not zoom on focus)`,
        });
      }
    }

    const h1 = document.querySelector("h1");
    const header = document.querySelector("header");
    let h1CoveredByHeader: boolean | null = null;
    if (h1 && header) {
      const h1Rect = h1.getBoundingClientRect();
      const headerRect = header.getBoundingClientRect();
      // A small tolerance for the header's own bottom border / shadow.
      h1CoveredByHeader = h1Rect.top < headerRect.bottom - 1;
    }

    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      bodyFontFamily: window.getComputedStyle(document.body).fontFamily,
      h1Present: Boolean(h1),
      headerPresent: Boolean(header),
      h1CoveredByHeader,
      smallText,
      smallTargets,
      smallInputs,
    };
  });
}

/** Formats a short bulleted list for an assertion failure message; caps output for readability. */
export function formatIssues(issues: AuditIssue[], limit = 10): string {
  const shown = issues.slice(0, limit).map((issue) => `  - ${issue.selector}: ${issue.detail}`);
  const rest = issues.length > limit ? `\n  … and ${issues.length - limit} more` : "";
  return shown.join("\n") + rest;
}

/** `getComputedStyle(document.body).fontFamily` starts with `Inter` (item 5), ignoring quoting. */
export function fontFamilyStartsWithInter(fontFamily: string): boolean {
  return /^["']?inter\b/i.test(fontFamily.trim());
}

/**
 * Navigates to a route and waits for the page to be visually settled: fonts loaded (item 5
 * depends on the real font, not a fallback, having applied) and no pending navigation.
 */
export async function gotoAndSettle(page: Page, route: Route): Promise<void> {
  await page.goto(route, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready).catch(() => undefined);
}
