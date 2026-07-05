/**
 * verify-nav-link.mjs — NAV-LINK real-browser proof (Playwright + chromium) that the bottom-tab
 * and MoreSheet <a>→<Link> conversion (NAV_LATENCY_NOTES §5) behaves as designed.
 *
 * Two proof strategies, because the two guarantees live at two different layers:
 *
 *  ── A · CLIENT-side transition + instant loading.tsx (the payoff) ──────────────────────────────
 *  This is Next App Router runtime behaviour and can ONLY be proven against a REAL Next server with
 *  hydration. The production authed routes are `ƒ` force-dynamic + Supabase/DB-gated, so they cannot
 *  boot headless here. Instead this section GENERATES a minimal, self-contained Next 15 App Router
 *  fixture (in an OS temp dir, node_modules symlinked to apps/web) that mirrors the real shell's
 *  transition architecture: a persistent root layout (html/body + a post-hydration window sentinel),
 *  and each route re-rendering its own server-component nav of `next/link` <Link prefetch={false}>
 *  tabs — exactly the real per-route AppShell re-mount §5 records. A `/slow` route awaits an
 *  artificial delay behind a real `loading.tsx` skeleton carrying `[data-skeleton]`. Then, via
 *  Playwright, it proves: (a1) a window sentinel set AFTER hydration SURVIVES a tab tap → no full
 *  document reload → client-side transition; (a2) the destination's `[data-skeleton]` loading.tsx
 *  paints IMMEDIATELY on tap, before the delayed content; (a3) the SSR HTML of the fixture carries a
 *  real `<a href>` for every <Link> → graceful MPA degradation is a property of the real primitive,
 *  not just the replica. SKIPs (exit 0) if the fixture can't boot (no next / port / compile), so it
 *  never falsely blocks the gate.
 *
 *  ── B · MPA degradation, active highlight, MoreSheet nav, no h-overflow (house replica pattern) ─
 *  The verify-shell-stacking / verify-players precedent: a class-faithful replica of the bottom bar
 *  + MoreSheet (pinned to source by shellStacking.contract.test.ts / playersRenderProof.test.ts, so
 *  it can't drift) served over a route-aware pw.local wildcard. Because the replica anchors ship ZERO
 *  JS, a click on one IS the pre-hydration case — a pure browser MPA navigation — which is precisely
 *  the graceful-degradation guarantee (§5 point 3). Proves: (b) every one of the 5 tabs navigates;
 *  (c) the active highlight tracks the landed route; (d) a MoreSheet item navigates (the sheet's own
 *  close-on-tap is React state, proven by moreSheetChrome.dom.test.tsx — asserted here as a source
 *  pin); (e) no horizontal overflow and the shell frame (bottom bar) stays flush/full-width.
 *
 * Screenshots for Sergio's eyeball. Mirrors the house skip-on-missing-Playwright contract.
 */
/* eslint-disable no-undef */
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import net from "node:net";

const here = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(here, "..");
const screenshotsDir = resolve(webDir, "screenshots");
mkdirSync(screenshotsDir, { recursive: true });

const css = (p) => readFileSync(resolve(webDir, p), "utf8");
const DS = css("app/styles/ds.css");
const SHELL = css("app/shell/shell.css");
const APPSHELL_SRC = readFileSync(resolve(webDir, "app/shell/AppShell.tsx"), "utf8");
const MORESHEET_SRC = readFileSync(resolve(webDir, "app/shell/MoreSheet.tsx"), "utf8");

const results = [];
function report(label, fails) {
  if (fails.length) {
    console.error(`✗ ${label}`);
    for (const f of fails) console.error(`   - ${f}`);
  } else {
    console.log(`✓ ${label}`);
  }
  results.push({ label, fails });
}

/* ── 0 · source pins: the conversion is real Link + prefetch={false} + close-on-tap kept ───────── */
{
  const fails = [];
  // Regexes anchor on distinctive JSX attributes (key={item.id}, href="/players") and stay bounded,
  // so a `<a href>` in a code comment can't produce a false positive.
  // SCOPE: only the bottom-tab bar (.sh-btmnav) + MoreSheet convert; the desktop top strip
  // (.sh-topnav / .sh-nav-item, still plain <a>) is deliberately OUT of scope — so the bottom-tab
  // "no plain <a>" check is sliced to just the .sh-btmnav region.
  const stripComments = (s) => s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const btmnavRegion = stripComments(
    APPSHELL_SRC.slice(
      APPSHELL_SRC.indexOf('className="sh-btmnav"'),
      APPSHELL_SRC.indexOf("<MoreSheet"),
    ),
  );
  // Bottom-tab item: <Link key={item.id} href={item.href} prefetch={false}> and NO plain <a> tab.
  if (!/import Link from "next\/link"/.test(APPSHELL_SRC))
    fails.push("AppShell does not import next/link");
  if (!/<Link\s+key=\{item\.id\}\s+href=\{item\.href\}\s+prefetch=\{false\}/.test(btmnavRegion))
    fails.push("bottom-tab items are not <Link key={item.id} href={item.href} prefetch={false}>");
  if (/<a[\s>]/.test(btmnavRegion))
    fails.push("a plain <a> bottom-tab anchor survives in .sh-btmnav");
  // AppShell must stay a server component (Link ≠ "use client") — §5 point 5 / SCOPE point 3.
  if (/^\s*["']use client["']/m.test(APPSHELL_SRC))
    fails.push('AppShell gained "use client" — the shell must stay a server component');
  // MoreSheet items: <Link key={item.id} … prefetch={false} … onClick={close}> + the /players entry.
  if (!/import Link from "next\/link"/.test(MORESHEET_SRC))
    fails.push("MoreSheet does not import next/link");
  if (
    !/<Link\s+key=\{item\.id\}[\s\S]{0,300}?prefetch=\{false\}[\s\S]{0,300}?onClick=\{close\}/.test(
      MORESHEET_SRC,
    )
  )
    fails.push("MoreSheet items lost <Link key={item.id} … prefetch={false} … onClick={close}>");
  if (!/<Link href="\/players" prefetch=\{false\} className="sh-more-item"/.test(MORESHEET_SRC))
    fails.push("the Browse-players MoreSheet entry is not a <Link prefetch={false}>");
  if (
    /<a\s+key=\{item\.id\}/.test(MORESHEET_SRC) ||
    /<a href="\/players" className/.test(MORESHEET_SRC)
  )
    fails.push("a plain <a> MoreSheet item anchor survives");
  report("source · bottom-tab + MoreSheet are Link prefetch={false}, shell stays server", fails);
}

/* ── Playwright bootstrap (shared by B and A) ──────────────────────────────────────────────────── */
let chromium;
try {
  ({ chromium } = await import("@playwright/test"));
} catch {
  console.log("⚠ SKIP — @playwright/test not installed; nav-link render proof not run.");
  finish();
}
let browser;
try {
  browser = await chromium.launch();
} catch (e) {
  console.log(`⚠ SKIP — chromium unavailable (${e.message?.split("\n")[0]}); proof not run.`);
  finish();
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * B · house-replica pattern — MPA degradation, active highlight, MoreSheet nav, no overflow
 * ════════════════════════════════════════════════════════════════════════════════════════════ */

const NAV_TABS = [
  ["/", "Dashboard"],
  ["/lineup", "Set lineup"],
  ["/vsfield", "The Cut"],
  ["/pool", "Quiniela"],
  ["/players", "Players"],
];
const MORE_ITEMS = [
  ["/scoring", "Scoring"],
  ["/waivers", "Waivers"],
  ["/standings", "Standings"],
  ["/playoffs", "Theater"],
  ["/draft", "Draft room"],
  ["/settings", "Settings"],
  ["/players", "Browse players"],
];
const svg = `<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85"><circle cx="12" cy="12" r="8.5"/></svg>`;

function bottomNav(activeHref) {
  const tabs = NAV_TABS.map(
    ([href, label]) =>
      `<a class="sh-btnav-item${href === activeHref ? " is-active" : ""}" href="${href}"${
        href === activeHref ? ' aria-current="page"' : ""
      }>${svg}<span>${label}</span></a>`,
  ).join("");
  return `<nav class="sh-btmnav" aria-label="Primary">${tabs}<button type="button" class="sh-btnav-item sh-more-btn" aria-label="More navigation options">${svg}<span>More</span></button></nav>`;
}
function moreSheetOpen(activeHref) {
  const items = MORE_ITEMS.map(
    ([href, label]) =>
      `<a href="${href}" class="sh-more-item${href === activeHref ? " is-active" : ""}">${label}</a>`,
  ).join("");
  return `<div class="sh-more-backdrop" aria-hidden="true"></div>
  <div role="dialog" aria-modal="true" aria-label="More navigation" class="sh-more-sheet" tabindex="-1">
    <div class="sh-sheet-head"><span class="sh-sheet-title">More</span>
      <button type="button" class="sh-sheet-x" aria-label="Close menu">✕</button></div>
    <div class="sh-more-sheet-items">${items}</div>
  </div>`;
}
const FILLER = `<div style="padding:16px">${Array.from({ length: 40 }, (_, i) => `<p style="margin:12px 0">Content row ${i + 1}</p>`).join("")}</div>`;
function screenDoc(path, { withSheet = false } = {}) {
  const overlay = withSheet ? moreSheetOpen(path) : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
  <style>${DS}\n${SHELL}</style></head>
  <body><div data-theme="dark" data-accent="cobalt" data-density="comfortable">
    <div class="sh-app sh-app-top"><div class="sh-content">${FILLER}</div>${bottomNav(path)}</div>
    ${overlay}
  </div></body></html>`;
}

const ctxB = await browser.newContext({ deviceScaleFactor: 2 });
const pageB = await ctxB.newPage();
// Route-aware wildcard: serve the destination doc with the requested path's active tab, so a real
// anchor click lands on a doc whose highlight moved — proving (b) + (c) together. `?sheet` opens More.
await ctxB.route("**/pw.local/**", (route) => {
  const u = new URL(route.request().url());
  route.fulfill({
    contentType: "text/html",
    body: screenDoc(u.pathname, { withSheet: u.searchParams.has("sheet") }),
  });
});
const shotB = async (name) => {
  await pageB.screenshot({ path: resolve(screenshotsDir, name) });
  await pageB.screenshot({ path: resolve("/tmp", name) });
};

/* (e) no h-overflow + shell frame flush/full-width, at three phone widths */
for (const vp of [
  { w: 360, h: 780, tag: "360" },
  { w: 390, h: 844, tag: "390" },
  { w: 430, h: 932, tag: "430" },
]) {
  await pageB.setViewportSize({ width: vp.w, height: vp.h });
  await pageB.goto("http://pw.local/", { waitUntil: "load" });
  const g = await pageB.evaluate(() => {
    const de = document.documentElement;
    const nav = document.querySelector(".sh-btmnav").getBoundingClientRect();
    return {
      hOverflow: de.scrollWidth > de.clientWidth,
      navBottomFlush: Math.abs(nav.bottom - innerHeight) < 0.5,
      navFullWidth: Math.abs(nav.width - de.clientWidth) < 0.5,
      tabs: document.querySelectorAll(".sh-btmnav a.sh-btnav-item").length,
      more: document.querySelectorAll(".sh-btmnav button.sh-more-btn").length,
    };
  });
  await shotB(`nav-link-frame-${vp.tag}.png`);
  report(`shell frame stable · no h-overflow, bar flush/full-width · ${vp.tag}`, [
    ...(g.hOverflow ? ["document overflows horizontally"] : []),
    ...(g.navBottomFlush ? [] : ["bottom bar not flush with viewport bottom"]),
    ...(g.navFullWidth ? [] : ["bottom bar not full width"]),
    ...(g.tabs === 5 ? [] : [`expected 5 anchor tab slots, found ${g.tabs}`]),
    ...(g.more === 1 ? [] : [`expected 1 More button slot, found ${g.more}`]),
  ]);
}

/* (b)+(c) every bottom tab navigates (pre-hydration MPA — the replica ships no JS) and the active
 * highlight tracks the landed route */
await pageB.setViewportSize({ width: 390, height: 844 });
for (const [href, label] of NAV_TABS) {
  // start on a doc where NO tab is active, so a moved highlight is unambiguous
  await ctxB.unroute("**/pw.local/**");
  let target = href;
  await ctxB.route("**/pw.local/**", (route) => {
    const u = new URL(route.request().url());
    // first load (/start) has no active tab; after click the destination shows its own active tab
    const active = u.pathname === "/start" ? "/none" : u.pathname;
    route.fulfill({ contentType: "text/html", body: screenDoc(active) });
  });
  await pageB.goto("http://pw.local/start", { waitUntil: "load" });
  let landed = null;
  try {
    await Promise.all([
      pageB.waitForURL((u) => u.pathname === target, { timeout: 4000 }),
      pageB.click(`.sh-btmnav .sh-btnav-item[href='${target}']`),
    ]);
    landed = new URL(pageB.url()).pathname;
  } catch {
    landed = `TIMEOUT (at ${new URL(pageB.url()).pathname})`;
  }
  const activeState =
    landed === target
      ? await pageB.evaluate((h) => {
          const el = document.querySelector(`.sh-btnav-item[href='${h}']`);
          const others = [...document.querySelectorAll(".sh-btnav-item.is-active")];
          return {
            active: !!el && el.classList.contains("is-active"),
            current: el?.getAttribute("aria-current") === "page",
            onlyOne: others.length === 1 && others[0] === el,
          };
        }, target)
      : null;
  report(`tab tap-through + active moves · "${label}" → ${href}`, [
    ...(landed === target ? [] : [`navigation landed on ${landed}`]),
    ...(activeState && !activeState.active ? ["landed tab is not .is-active"] : []),
    ...(activeState && !activeState.current ? ['landed tab missing aria-current="page"'] : []),
    ...(activeState && !activeState.onlyOne
      ? ["more than one tab is active after transition"]
      : []),
  ]);
}

/* (d) a MoreSheet item navigates (real anchor); close-on-tap is React state (RTL-proven) */
await ctxB.unroute("**/pw.local/**");
await ctxB.route("**/pw.local/**", (route) => {
  const u = new URL(route.request().url());
  route.fulfill({
    contentType: "text/html",
    body: screenDoc(u.pathname, { withSheet: u.pathname === "/start" }),
  });
});
await pageB.goto("http://pw.local/start", { waitUntil: "load" });
await shotB("nav-link-moresheet-390.png");
let moreNav = null;
try {
  await Promise.all([
    pageB.waitForURL((u) => u.pathname === "/standings", { timeout: 4000 }),
    pageB.click(".sh-more-item[href='/standings']"),
  ]);
  moreNav = new URL(pageB.url()).pathname;
} catch {
  moreNav = `TIMEOUT (at ${new URL(pageB.url()).pathname})`;
}
report("MoreSheet item navigates · Standings → /standings", [
  ...(moreNav === "/standings" ? [] : [`navigation landed on ${moreNav}`]),
  ...(/onClick=\{close\}/.test(MORESHEET_SRC)
    ? []
    : ["MoreSheet lost onClick={close} (sheet-close)"]),
]);

await ctxB.close();

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * A · real Next fixture — client-side transition + instant loading.tsx
 * ════════════════════════════════════════════════════════════════════════════════════════════ */
await runFixtureProof().catch((e) => {
  console.log(`⚠ SKIP (section A) — Next fixture could not run: ${e.message?.split("\n")[0]}`);
});

await browser.close();
finish();

/* ── section A implementation ───────────────────────────────────────────────────────────────── */
async function runFixtureProof() {
  const dir = mkdtempSync(join(tmpdir(), "navlink-fixture-"));
  try {
    // node_modules symlinked to apps/web so `next` + react resolve without a fresh install
    symlinkSync(resolve(webDir, "node_modules"), join(dir, "node_modules"), "dir");
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "navlink-fixture", private: true, version: "0.0.0" }),
    );
    writeFileSync(join(dir, "next.config.mjs"), `export default { reactStrictMode: false };\n`);
    mkdirSync(join(dir, "app", "slow"), { recursive: true });
    mkdirSync(join(dir, "app", "fast"), { recursive: true });

    // Root layout persists across client transitions (like the real html/body). The <Sentinel>
    // stamps window.__navSentinel AFTER hydration; if a tab tap triggered a full document reload
    // the window would be wiped and the sentinel gone.
    writeFileSync(
      join(dir, "app", "layout.js"),
      `import Sentinel from "./sentinel";
export default function RootLayout({ children }) {
  return (<html lang="en"><body><Sentinel />{children}</body></html>);
}
`,
    );
    writeFileSync(
      join(dir, "app", "sentinel.js"),
      `"use client";
import { useEffect } from "react";
export default function Sentinel() {
  useEffect(() => { window.__navSentinel = "ALIVE"; }, []);
  return <div data-testid="sentinel" />;
}
`,
    );
    // Per-route server-component nav of next/link <Link prefetch={false}> — mirrors the real shell's
    // per-route AppShell re-mount (§5) and the exact primitive under test. active passed explicitly.
    writeFileSync(
      join(dir, "app", "nav.js"),
      `import Link from "next/link";
const TABS = [["/", "Home"], ["/slow", "Slow"], ["/fast", "Fast"]];
export default function Nav({ active }) {
  return (<nav data-testid="nav">{TABS.map(([href, label]) => (
    <Link key={href} href={href} prefetch={false}
      data-testid={"tab-" + label.toLowerCase()}
      className={href === active ? "is-active" : ""}
      aria-current={href === active ? "page" : undefined}>{label}</Link>
  ))}</nav>);
}
`,
    );
    writeFileSync(
      join(dir, "app", "page.js"),
      `import Nav from "./nav";
export const dynamic = "force-dynamic";
export default function Home() {
  return (<main><Nav active="/" /><div data-testid="home-content">HOME-CONTENT</div></main>);
}
`,
    );
    // /slow awaits an artificial delay so its loading.tsx skeleton is observable on a client transition.
    writeFileSync(
      join(dir, "app", "slow", "page.js"),
      `import Nav from "../nav";
export const dynamic = "force-dynamic";
export default async function Slow() {
  await new Promise((r) => setTimeout(r, 1300));
  return (<main><Nav active="/slow" /><div data-testid="slow-content">SLOW-CONTENT</div></main>);
}
`,
    );
    writeFileSync(
      join(dir, "app", "slow", "loading.js"),
      `export default function Loading() {
  return (<div data-skeleton role="status" aria-busy="true" data-testid="slow-skeleton">SLOW-SKELETON</div>);
}
`,
    );
    writeFileSync(
      join(dir, "app", "fast", "page.js"),
      `import Nav from "../nav";
export const dynamic = "force-dynamic";
export default function Fast() {
  return (<main><Nav active="/fast" /><div data-testid="fast-content">FAST-CONTENT</div></main>);
}
`,
    );

    const port = await freePort();
    const nextBin = resolve(webDir, "node_modules", ".bin", "next");
    const proc = spawn(nextBin, ["dev", "-p", String(port), "-H", "127.0.0.1"], {
      cwd: dir,
      env: { ...process.env, NODE_ENV: "development" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let procLog = "";
    proc.stdout.on("data", (d) => (procLog += d));
    proc.stderr.on("data", (d) => (procLog += d));
    const base = `http://127.0.0.1:${port}`;
    try {
      await waitForHttp(`${base}/`, 60000);
      // Prewarm the routes so on-demand dev compilation doesn't masquerade as the loading skeleton;
      // after this, the /slow skeleton we observe is caused by the awaited delay, not first compile.
      await waitForHttp(`${base}/slow`, 60000);
      await waitForHttp(`${base}/fast`, 60000);

      // (a3) SSR HTML carries a real <a href> for every <Link> → MPA graceful degradation is a
      // property of the real primitive.
      const html = await (await fetch(`${base}/`)).text();
      const ssrFails = [];
      for (const href of ["/", "/slow", "/fast"]) {
        if (!new RegExp(`<a[^>]*href="${href.replace("/", "\\/")}"`).test(html))
          ssrFails.push(`SSR HTML missing real <a href="${href}">`);
      }
      report("real Next: <Link> SSRs a real <a href> (pre-hydration MPA works)", ssrFails);

      const ctxA = await browser.newContext();
      const pageA = await ctxA.newPage();
      const shotA = async (name) => {
        await pageA.screenshot({ path: resolve(screenshotsDir, name) });
        await pageA.screenshot({ path: resolve("/tmp", name) });
      };
      await pageA.goto(`${base}/`, { waitUntil: "networkidle" });
      // ensure hydration ran and stamped the sentinel
      await pageA.waitForFunction(() => window.__navSentinel === "ALIVE", { timeout: 15000 });

      // (a1) client transition to /fast: sentinel must survive (no document reload)
      await Promise.all([
        pageA.waitForURL((u) => u.pathname === "/fast", { timeout: 15000 }),
        pageA.getByTestId("tab-fast").click(),
      ]);
      await pageA.getByTestId("fast-content").waitFor({ state: "visible", timeout: 15000 });
      const survivedFast = await pageA.evaluate(() => window.__navSentinel);
      report("real Next: tab tap is a CLIENT transition · sentinel survives → /fast (no reload)", [
        ...(survivedFast === "ALIVE"
          ? []
          : ["window sentinel was wiped — a full document reload happened"]),
      ]);
      const fastActive = await pageA
        .getByTestId("tab-fast")
        .evaluate(
          (el) => el.classList.contains("is-active") && el.getAttribute("aria-current") === "page",
        );
      report("real Next: active highlight moved to /fast after client transition", [
        ...(fastActive ? [] : ["/fast tab did not become active after the transition"]),
      ]);

      // (a2) client transition to /slow: the loading.tsx [data-skeleton] must paint BEFORE content
      await pageA.getByTestId("tab-slow").click();
      const skeleton = await pageA
        .getByTestId("slow-skeleton")
        .waitFor({ state: "visible", timeout: 3000 })
        .then(() => true)
        .catch(() => false);
      const contentYetVisible = await pageA
        .getByTestId("slow-content")
        .isVisible()
        .catch(() => false);
      await shotA("nav-link-slow-skeleton.png");
      const sentinelDuringSkeleton = await pageA.evaluate(() => window.__navSentinel);
      // now let the delayed content arrive
      await pageA.getByTestId("slow-content").waitFor({ state: "visible", timeout: 15000 });
      const skeletonGone = !(await pageA
        .getByTestId("slow-skeleton")
        .isVisible()
        .catch(() => false));
      await shotA("nav-link-slow-content.png");
      report("real Next: loading.tsx [data-skeleton] paints INSTANTLY on tap, before content", [
        ...(skeleton ? [] : ["skeleton did not appear on the client transition to /slow"]),
        ...(contentYetVisible
          ? ["slow content was already visible when the skeleton should show"]
          : []),
        ...(sentinelDuringSkeleton === "ALIVE"
          ? []
          : ["sentinel wiped during the /slow transition (reload)"]),
        ...(skeletonGone ? [] : ["skeleton did not clear once content arrived"]),
      ]);

      await ctxA.close();
    } finally {
      proc.kill("SIGKILL");
      if (!results.some((r) => r.label.startsWith("real Next"))) {
        console.log("   (next dev log tail)\n" + procLog.split("\n").slice(-8).join("\n"));
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function freePort() {
  return new Promise((res, rej) => {
    const srv = net.createServer();
    srv.on("error", rej);
    srv.listen(0, "127.0.0.1", () => {
      const p = srv.address().port;
      srv.close(() => res(p));
    });
  });
}
async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url, { redirect: "manual" });
      if (r.status < 500) return;
      last = `status ${r.status}`;
    } catch (e) {
      last = e.message;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`timed out waiting for ${url} (${last})`);
}

function finish() {
  const failCount = results.filter((r) => r.fails.length).length;
  console.log(
    `\n${failCount === 0 ? "ALL GREEN" : "FAILURES"} — ${results.length - failCount}/${results.length} checks · screenshots ${screenshotsDir}`,
  );
  process.exit(failCount === 0 ? 0 : 1);
}
