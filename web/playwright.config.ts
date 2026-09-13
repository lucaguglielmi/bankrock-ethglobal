import { defineConfig, devices } from "@playwright/test";

/**
 * Browser checks for specs/17-mobile-ui-and-typography.md Part 7.
 *
 * Runs against a plain production build (`next build`, no build flags, no chain configured)
 * started with `next start` on a fixed port, so the same server can be reused across every
 * project instead of rebuilding per viewport. See e2e/helpers.ts for what each route renders in
 * that state.
 *
 * Five viewports, matching the task list exactly (spec 17 §4.1 names 320/390/430/768/1280; this
 * substitutes 360×640 — the "design at" width the spec leads with — for 430×932, which is not in
 * scope here). The three phone-width projects get `isMobile`/`hasTouch` so tap targets and touch
 * affordances are exercised the way a phone would; 768×1024 and 1280×800 are tablet/desktop and
 * get neither, matching how a mouse-and-keyboard visitor at those widths actually arrives.
 */

const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;

/** Exported so e2e/helpers.ts can restrict viewport-specific checks to a single project. */
export const PRIMARY_MOBILE_PROJECT = "mobile-360x640";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: BASE_URL,
    browserName: "chromium",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "mobile-320x568",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 320, height: 568 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: PRIMARY_MOBILE_PROJECT,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 360, height: 640 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "mobile-390x844",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "tablet-768x1024",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: "desktop-1280x800",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
