/**
 * capture-login.mjs — ONE-TIME session bootstrap for the read-only prod-capture harness.
 *
 * The capture harness (capture-screens.mjs) needs an authenticated Supabase session to reach the
 * gated surfaces (/lineup, /vsfield, /players, …). Auth is magic-link (passwordless), so the session
 * can only be produced by the human completing the login in a real browser. This helper opens a HEADED
 * Chromium at the prod /sign-in, waits for YOU to finish the magic-link flow (open the emailed link
 * INSIDE that Chromium window), then saves the resulting Playwright `storageState` (cookies +
 * localStorage) to captures/.auth/state.json — which is gitignored and NEVER committed.
 * capture-screens.mjs then loads that state read-only.
 *
 * Detection is by polling, not a keyboard prompt: the helper probes a gated route in a separate tab
 * every 5s until it stops bouncing to /sign-in, then saves and exits. No stdin needed, so it also
 * works when run non-interactively (backgrounded, stdin=/dev/null).
 *
 * This script authenticates nothing itself: it only opens a browser and reads the session YOU create.
 * It performs no writes against the app — navigation only.
 *
 *   Run:  node apps/web/scripts/capture-login.mjs [--base=https://host]
 *   Then: node apps/web/scripts/capture-screens.mjs
 *
 * The saved session expires (Supabase refresh-token lifetime). Re-run this helper when capture-screens
 * reports a session-expired redirect.
 */
/* eslint-disable no-undef */
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const authDir = resolve(repoRoot, "captures", ".auth");
const statePath = resolve(authDir, "state.json");
mkdirSync(authDir, { recursive: true });

function baseUrl() {
  const arg = process.argv.find((a) => a.startsWith("--base="));
  return (arg ? arg.split("=")[1] : process.env.CAPTURE_BASE_URL || "https://wc-fantasy-web.onrender.com").replace(
    /\/$/,
    "",
  );
}

async function main() {
  const base = baseUrl();

  let chromium;
  try {
    ({ chromium } = await import("@playwright/test"));
  } catch {
    console.log("FAILED: playwright not installed (run from apps/web where @playwright/test resolves).");
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log(`\nOpening ${base}/sign-in in a visible browser.`);
  console.log("→ Request a magic link there, then open the emailed link IN THAT WINDOW (paste the URL");
  console.log("  into its address bar — a link clicked in your mail app lands in the wrong browser).");
  console.log("→ No keyboard input needed here: I probe a gated route every 5s and save automatically.\n");
  await page.goto(`${base}/sign-in`, { waitUntil: "domcontentloaded", timeout: 60000 });

  // Poll for the session instead of prompting. The probe runs in its own tab (cookies are shared
  // context-wide) so it never disturbs the tab the human is signing in with.
  const deadline = Date.now() + 15 * 60 * 1000;
  for (;;) {
    if (Date.now() > deadline) {
      console.log("FAILED: no authenticated session appeared within 15 minutes. Re-run to try again.");
      await browser.close();
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 5000));
    // Primary signal: the Supabase auth cookie exists in this context only once the magic-link
    // flow has completed HERE. A URL probe alone is not sufficient — the gate answers 200 and
    // redirects client-side (streamed by Next), so a domcontentloaded URL check races the
    // redirect and can false-positive on a signed-out context.
    const cookies = await context.cookies(base);
    if (!cookies.some((c) => /^sb-.+-auth-token/.test(c.name))) continue;
    // Belt-and-braces: hit a gated route, give the streamed redirect time to land, then check
    // we are still NOT on /sign-in.
    const probe = await context.newPage();
    let url = null;
    try {
      await probe.goto(`${base}/lineup`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await probe.waitForTimeout(3000);
      url = probe.url();
    } catch {
      url = null; // transient navigation failure — keep waiting
    } finally {
      await probe.close();
    }
    if (!url || /\/sign-in/.test(url) || /\/auth\/denied/.test(url)) continue;
    console.log(`  ✓ Session confirmed (reached ${url}).`);
    break;
  }

  await context.storageState({ path: statePath });
  console.log(`\nSaved session → ${statePath}`);
  console.log("This file is gitignored. Now run: node apps/web/scripts/capture-screens.mjs\n");

  await browser.close();
}

await main();
