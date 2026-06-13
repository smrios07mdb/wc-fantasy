/**
 * Mobile nav overflow + swap verification (Prompt 40).
 *
 * Tests the shell CSS in isolation using a self-contained HTML page that replicates the
 * AppShell structure and inlines the relevant CSS. Runs headless Chromium via Playwright
 * at 320/375/390/414px to assert:
 *
 *   1. Zero horizontal document overflow at every phone width.
 *   2. Navigation does NOT change document.scrollingElement.scrollLeft (the page no
 *      longer slides horizontally when the active tab is scrolled into view).
 *   3. The bottom bar (.sh-btmnav) is PRESENT below 640px and ABSENT above it (top strip
 *      the inverse).
 *
 * The page is served via file:// so no server is required.
 * Screenshots are saved to apps/web/screenshots/.
 *
 * Run:  node apps/web/scripts/verify-mobile-nav.mjs
 */

/* eslint-disable no-undef */
// The page.evaluate() callbacks run in the browser (Chromium), not Node.js.
// document / getComputedStyle are browser globals, not Node globals — the
// no-undef rule fires a false positive here; disable it for this file.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(__dir, "..");
const screenshotsDir = resolve(appDir, "screenshots");

// ── Inline the CSS files ──────────────────────────────────────────────────────
const dsCSS = readFileSync(resolve(appDir, "app/styles/ds.css"), "utf8");
const shellCSS = readFileSync(resolve(appDir, "app/shell/shell.css"), "utf8");

// ── Test HTML: AppShell structure replica ─────────────────────────────────────
// Mirrors the server-rendered markup of AppShell.tsx so we can verify CSS
// behaviour without running Next.js. Eight top-nav items to reproduce the
// original overflow bug; the MoreSheet client JS is not needed for layout proofs.
const NAV_ITEMS = [
  { id: "home", label: "Home" },
  { id: "draft", label: "Draft room" },
  { id: "lineup", label: "Set lineup" },
  { id: "vsfield", label: "Vs the field" },
  { id: "waivers", label: "Waivers" },
  { id: "pool", label: "Pool" },
  { id: "scoring", label: "Scoring" },
  { id: "settings", label: "Settings" },
];

const BOTTOM_ITEMS = [
  { id: "home", label: "Dashboard" },
  { id: "lineup", label: "Set lineup" },
  { id: "vsfield", label: "Vs the field" },
  { id: "pool", label: "Pool" },
];

const ROUTES = ["/", "/vsfield", "/pool", "/scoring", "/lineup"];

function makeHTML(activeId) {
  const topNavLinks = NAV_ITEMS.map((item) => {
    const isActive = item.id === activeId;
    return `<a href="${item.id === "home" ? "/" : "/" + item.id}"
               class="sh-nav-item${isActive ? " is-active" : ""}"
               ${isActive ? 'aria-current="page"' : ""}>${item.label}</a>`;
  }).join("\n          ");

  const bottomNavLinks = BOTTOM_ITEMS.map((item) => {
    const isActive = item.id === activeId;
    return `<a href="${item.id === "home" ? "/" : "/" + item.id}"
               class="sh-btnav-item${isActive ? " is-active" : ""}"
               ${isActive ? 'aria-current="page"' : ""}>${item.label}</a>`;
  }).join("\n          ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>AppShell — mobile nav verify (active: ${activeId})</title>
  <style>
    /* ds.css */
    ${dsCSS}
  </style>
  <style>
    /* shell.css */
    ${shellCSS}
  </style>
  <style>
    /* Test page content block to ensure page has real content */
    .test-content {
      padding: 24px;
      min-height: 200px;
      font-family: var(--font-sans, sans-serif);
      color: var(--text-primary, #fff);
    }
    .test-content h1 { margin: 0 0 16px; font-size: 18px; }
    /* Dark root needed for ds tokens */
    :root {
      --surface-0: #0A0D12;
      --surface-1: #12151B;
      --surface-2: #1C2029;
      --surface-3: #252933;
      --text-primary: #F0F2F5;
      --text-secondary: #8A93A3;
      --text-tertiary: #5A6270;
      --hairline: rgba(255,255,255,0.08);
      --accent: #4D8DFF;
      --font-sans: system-ui, sans-serif;
      --r-md: 6px;
      --r-pill: 999px;
      --fs-caption: 11px;
    }
  </style>
</head>
<body>
<div class="sh-app sh-app-top" data-active="${activeId}">
  <header class="sh-topbar" aria-label="Global">
    <a class="sh-brand" href="/">
      <span class="sh-brand-txt">
        <b class="display">XI</b>
        <span class="t-micro">WC Fantasy</span>
      </span>
    </a>

    <div class="sh-topnav-scroll">
      <nav class="sh-topnav" aria-label="Primary">
          ${topNavLinks}
      </nav>
    </div>

    <div class="sh-top-r">
      <span class="sh-top-who">Signed in as <b>Test</b></span>
      <form action="/auth/sign-out" method="post">
        <button type="submit" class="btn btn-ghost btn-sm">Sign out</button>
      </form>
    </div>
  </header>

  <div class="sh-content">
    <div class="test-content">
      <h1>Screen: ${activeId}</h1>
      <p>Test content for overflow verification. Active route: ${activeId}.</p>
    </div>
  </div>

  <nav class="sh-btmnav" aria-label="Primary" id="sh-btmnav">
          ${bottomNavLinks}
    <button type="button" class="sh-btnav-item sh-more-btn">More</button>
  </nav>
</div>
</body>
</html>`;
}

// ── Main ─────────────────────────────────────────────────────────────────────
const PHONE_WIDTHS = [320, 375, 390, 414];
const DESKTOP_WIDTH = 768;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const failures = [];
  let passed = 0;

  for (const width of [...PHONE_WIDTHS, DESKTOP_WIDTH]) {
    for (const routeId of ROUTES.map((r) => (r === "/" ? "home" : r.slice(1)))) {
      const page = await browser.newPage();
      await page.setViewportSize({ width, height: 812 });

      // Write test HTML to a temp file and open it
      const html = makeHTML(routeId);
      const tmpPath = resolve(screenshotsDir, `_tmp_${width}_${routeId}.html`);
      writeFileSync(tmpPath, html);
      await page.goto(`file://${tmpPath}`);
      // Wait for CSS to apply
      await page.waitForTimeout(100);

      const isPhone = width < 640;
      const label = `${width}px/${routeId}`;

      // ── (1) No horizontal overflow ─────────────────────────────────────────
      const overflow = await page.evaluate(() => {
        const scrollWidth = document.documentElement.scrollWidth;
        const clientWidth = document.documentElement.clientWidth;
        return { scrollWidth, clientWidth, overflows: scrollWidth > clientWidth };
      });

      if (overflow.overflows) {
        failures.push(
          `FAIL [${label}] overflow: scrollWidth=${overflow.scrollWidth} > clientWidth=${overflow.clientWidth}`,
        );
      } else {
        passed++;
        console.log(`  ✓ [${label}] no overflow (scrollWidth=${overflow.scrollWidth})`);
      }

      // ── (2) scrollLeft unchanged after scrollIntoView on active nav item ──
      // Simulate scrollIntoView on the active top nav link; ensure scrollingElement.scrollLeft stays 0.
      const scrollSlide = await page.evaluate(() => {
        const el = document.querySelector('[aria-current="page"].sh-nav-item');
        if (!el) return { slide: false };
        const before = document.scrollingElement?.scrollLeft ?? 0;
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
        const after = document.scrollingElement?.scrollLeft ?? 0;
        return { slide: after !== before, before, after };
      });

      if (scrollSlide.slide) {
        failures.push(
          `FAIL [${label}] page slid on scrollIntoView: scrollLeft changed ${scrollSlide.before} → ${scrollSlide.after}`,
        );
      } else {
        passed++;
        if (isPhone) {
          // top nav hidden on phone, no active item to scroll; that's fine
          console.log(`  ✓ [${label}] no slide on active-tab scrollIntoView (top nav hidden)`);
        } else {
          console.log(`  ✓ [${label}] no slide on active-tab scrollIntoView`);
        }
      }

      // ── (3) Bottom bar / top strip visibility swap ─────────────────────────
      const navState = await page.evaluate(() => {
        const btmnav = document.getElementById("sh-btmnav");
        const topbar = document.querySelector(".sh-topbar");
        const btmDisplay = btmnav ? getComputedStyle(btmnav).display : "none";
        const topDisplay = topbar ? getComputedStyle(topbar).display : "none";
        return { btmDisplay, topDisplay };
      });

      const bottomVisible = navState.btmDisplay !== "none";
      const topVisible = navState.topDisplay !== "none";

      if (isPhone) {
        if (bottomVisible && !topVisible) {
          passed++;
          console.log(`  ✓ [${label}] bottom bar shown, top strip hidden (phone)`);
        } else {
          failures.push(
            `FAIL [${label}] phone: bottom=${navState.btmDisplay} top=${navState.topDisplay} (expected bottom≠none, top=none)`,
          );
        }
      } else {
        if (!bottomVisible && topVisible) {
          passed++;
          console.log(`  ✓ [${label}] top strip shown, bottom bar hidden (desktop)`);
        } else {
          failures.push(
            `FAIL [${label}] desktop: bottom=${navState.btmDisplay} top=${navState.topDisplay} (expected bottom=none, top≠none)`,
          );
        }
      }

      // ── Screenshot ────────────────────────────────────────────────────────
      const screenshotPath = resolve(screenshotsDir, `${width}_${routeId}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      await page.close();

      // Clean up temp HTML
      import("node:fs").then(({ unlinkSync }) => {
        try {
          unlinkSync(tmpPath);
        } catch {
          /* ignore */
        }
      });
    }
  }

  await browser.close();

  console.log(`\n── Results ─────────────────────────────────────`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failures.length}`);
  if (failures.length > 0) {
    console.error("\nFailures:");
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  } else {
    console.log(`\n✅  All assertions passed.`);
    console.log(`   Screenshots saved to apps/web/screenshots/`);
    console.log(
      `   Files: ${[...PHONE_WIDTHS, DESKTOP_WIDTH].flatMap((w) => ROUTES.map((r) => `${w}_${r === "/" ? "home" : r.slice(1)}.png`)).join(", ")}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
