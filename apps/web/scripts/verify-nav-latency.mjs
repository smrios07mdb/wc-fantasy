/**
 * verify-nav-latency.mjs — NAV-LAT real-browser proof (Playwright + chromium) that the route-level
 * loading.tsx skeletons make slow MPA navigation VISIBLE instead of reading as a dead tap (F-P0-A1
 * residual / walkthrough N1 + step 7). Companion to T15-2's touch-down `:active` feedback.
 *
 * Unlike the other render proofs, this one does NOT hand-write a replica of the skeleton: it transpiles
 * and renders the ACTUAL `RouteSkeleton` component (all 6 variants) with react-dom/server, and drives
 * the nav active-state through the ACTUAL `crossNav` selectors — so the skeleton HTML + active
 * highlighting it proves are the real component output, byte-for-byte, and cannot drift. Only the shell
 * chrome frame around it is a class-faithful replica (real ds.css + shell.css, the exact classes
 * AppShell / app/loading.tsx emit — already pinned by verify-shell-stacking + the DOM tests).
 *
 * Proves, at 390 (phone) + 1180 (desktop), against the REAL production CSS:
 *  (a) STREAMING — a server that flushes shell+skeleton FIRST, holds, then streams content (Next's
 *      streaming-SSR sequence): navigating mid-delay paints the loading.tsx skeleton DOM (a present
 *      `[data-skeleton]`, not merely the absence of the old page), BEFORE the content marker arrives;
 *  (b) the app shell + bottom nav stay VISIBLE and the tapped destination stays ACTIVE-highlighted
 *      while the skeleton shows (mobile bottom bar at 390; top strip at desktop);
 *  (c) NO layout-shift class of failure — the shell frame (nav rect + content rect) is byte-identical
 *      between the skeleton phase and the real-content phase; the skeleton fills, never exceeds, the frame;
 *  (d) NO horizontal overflow at either width, for every destination's skeleton.
 * Emits a screenshot of every skeleton for eyeball review. SKIPs (exit 0) if Playwright/Chromium or the
 * render deps are unavailable, like the sibling render proofs.
 */
/* eslint-disable no-undef */
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createServer } from "node:http";

const here = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(here, "..");
const screenshotsDir = resolve(webDir, "screenshots");
mkdirSync(screenshotsDir, { recursive: true });

const css = (p) => readFileSync(resolve(webDir, p), "utf8");
const DS = css("app/styles/ds.css");
const SHELL = css("app/shell/shell.css");

/* ── render the REAL components (transpile TSX/TS → CJS → renderToStaticMarkup) ─────────────── */
// RouteSkeleton.tsx and crossNav.ts both have ZERO non-type runtime imports, so a bare Function
// injection with `react` supplied is sufficient — no bundler needed.
const require = createRequire(pathToFileURL(resolve(webDir, "x.js")));

let ts, React, renderToStaticMarkup;
try {
  ts = require("typescript");
  React = require("react");
  ({ renderToStaticMarkup } = require("react-dom/server"));
} catch (e) {
  console.log(
    `⚠ SKIP — render deps unavailable (${e.message?.split("\n")[0]}); nav-latency proof not run.`,
  );
  process.exit(0);
}

function loadTsModule(relPath) {
  const src = readFileSync(resolve(webDir, relPath), "utf8");
  const out = ts.transpileModule(src, {
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  const mod = { exports: {} };
  new Function("exports", "require", "module", "React", out)(mod.exports, require, mod, React);
  return mod.exports;
}

const { RouteSkeleton } = loadTsModule("app/shell/RouteSkeleton.tsx");
const { navItemsForPhase, selectMobileNavPartition } = loadTsModule("src/shell/crossNav.ts");

const renderSkeleton = (variant, label, bare = false) =>
  renderToStaticMarkup(React.createElement(RouteSkeleton, { variant, label, bare }));

/* ── shell chrome replica (real ds/shell classes; labels + active state from real crossNav) ──── */
const NAV = navItemsForPhase("group", false); // group-phase base labels (the common case)
const dot = (size = 18) =>
  `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85"><circle cx="12" cy="12" r="8.5"/></svg>`;

function topStrip(activeId) {
  const items = NAV.navItems
    .map(
      (it) =>
        `<span class="sh-nav-item${it.id === activeId ? " is-active" : ""}"${it.id === activeId ? ' data-active=""' : ""}>${it.label}</span>`,
    )
    .join("");
  return `<header class="sh-topbar" aria-label="Global">
    <span class="sh-brand"><span class="skeleton" style="width:28px;height:28px;border-radius:var(--r-md)"></span>
      <span class="sh-brand-txt"><b class="display">XI</b><span class="t-micro text-tertiary">WC Fantasy League</span></span></span>
    <div class="sh-topnav-scroll"><nav class="sh-topnav">${items}</nav></div>
    <div class="sh-top-r"><span class="skeleton" style="width:72px;height:30px;border-radius:var(--r-md)"></span></div>
  </header>`;
}

function bottomBar(activeId) {
  const { bottomActive, moreHasActive } = selectMobileNavPartition(activeId);
  const tabs = NAV.bottomTabItems
    .map(
      (it) =>
        `<span class="sh-btnav-item${it.id === bottomActive ? " is-active" : ""}"${it.id === bottomActive ? ' data-active=""' : ""}>${dot(20)}<span>${it.label}</span></span>`,
    )
    .join("");
  return `<nav class="sh-btmnav" aria-label="Primary">${tabs}<span class="sh-btnav-item sh-more-btn${moreHasActive ? " is-active" : ""}"${moreHasActive ? ' data-active=""' : ""}>${dot(20)}<span>More</span></span></nav>`;
}

// The full authenticated frame with the skeleton in `.sh-content` — mirrors AppShell's dual-nav output.
function shellDoc({ activeId, contentHtml }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
  <style>${DS}\n${SHELL}\nhtml,body{height:100%;margin:0}</style></head>
  <body><div class="sh-app sh-app-top" data-theme="dark" data-accent="cobalt" data-density="comfortable">
    ${topStrip(activeId)}
    <div class="sh-content">${contentHtml}</div>
    ${bottomBar(activeId)}
  </div></body></html>`;
}

// A stand-in for the REAL page content, used for the no-layout-shift comparison — a tall block that
// fills the same `.sh-content` frame the skeleton fills.
const REAL_CONTENT = `<div data-realpage="" style="padding:var(--sp-4)"><div style="height:1200px"></div></div>`;

/* ── the 12 in-scope destinations (5 bottom tabs + 6 More targets + gated commish) ───────────── */
const ROUTES = [
  { path: "/", variant: "dashboard", label: "Dashboard", activeId: "home", bare: true, home: true },
  { path: "/lineup", variant: "pitch", label: "Set lineup", activeId: "lineup" },
  { path: "/vsfield", variant: "cockpit", label: "Vs the field", activeId: "vsfield" },
  { path: "/pool", variant: "list", label: "Quiniela", activeId: "pool" },
  { path: "/players", variant: "list", label: "Players", activeId: "players" },
  { path: "/standings", variant: "list", label: "Standings", activeId: "standings" },
  { path: "/waivers", variant: "list", label: "Waivers", activeId: "waivers" },
  { path: "/scoring", variant: "list", label: "Scoring rules", activeId: "scoring" },
  { path: "/settings", variant: "form", label: "Settings", activeId: "settings" },
  { path: "/playoffs", variant: "board", label: "Playoffs", activeId: "playoffs" },
  { path: "/draft", variant: "cockpit", label: "Draft room", activeId: "draft" },
  { path: "/commish", variant: "list", label: "Commissioner console", activeId: "commish" },
];

const skeletonFor = (r) => renderSkeleton(r.variant, r.label, !!r.bare);

/* ── local server: /static (skeleton) · /real (content) · /stream (skeleton→hold→content) ────── */
const HOLD_MS = 800;
const byIndex = (q) => ROUTES[Number(new URL(q, "http://x").searchParams.get("i")) || 0];

const server = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const r = byIndex(req.url);
  if (u.pathname === "/static") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(shellDoc({ activeId: r.activeId, contentHtml: skeletonFor(r) }));
    return;
  }
  if (u.pathname === "/real") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(shellDoc({ activeId: r.activeId, contentHtml: REAL_CONTENT }));
    return;
  }
  if (u.pathname === "/stream") {
    // Model Next streaming SSR: flush the shell + skeleton immediately, HOLD (slow loaders), then
    // stream the real content in and close. The skeleton must be painted throughout the hold.
    res.writeHead(200, { "content-type": "text/html" });
    const doc = shellDoc({ activeId: r.activeId, contentHtml: skeletonFor(r) });
    const splitAt = doc.indexOf("</body>");
    res.write(doc.slice(0, splitAt)); // <head> + shell + skeleton, flushed now
    setTimeout(() => {
      res.write(REAL_CONTENT + doc.slice(splitAt)); // content appended after the delay
      res.end();
    }, HOLD_MS);
    return;
  }
  res.writeHead(404).end("nope");
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const BASE = `http://127.0.0.1:${server.address().port}`;

/* ── runner ───────────────────────────────────────────────────────────────────────────────── */
let chromium;
try {
  ({ chromium } = await import("@playwright/test"));
} catch {
  console.log("⚠ SKIP — @playwright/test not installed; nav-latency render proof not run.");
  server.close();
  process.exit(0);
}
let browser;
try {
  browser = await chromium.launch();
} catch (e) {
  console.log(
    `⚠ SKIP — chromium unavailable (${e.message?.split("\n")[0]}); render proof not run.`,
  );
  server.close();
  process.exit(0);
}

const context = await browser.newContext({ deviceScaleFactor: 2 });
const page = await context.newPage();

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
const shot = async (name) => {
  await page.screenshot({ path: resolve(screenshotsDir, name) });
  await page.screenshot({ path: resolve("/tmp", name) });
};

const PHONE = { w: 390, h: 844, tag: "390" };
const DESK = { w: 1180, h: 900, tag: "1180" };

// One in-page snapshot of everything we assert about a rendered document.
const frameProbe = () => {
  const de = document.documentElement;
  const nav = document.querySelector(".sh-btmnav");
  const top = document.querySelector(".sh-topbar");
  const content = document.querySelector(".sh-content");
  const skel = document.querySelector("[data-skeleton]");
  const activeBottom = document.querySelector(".sh-btmnav .sh-btnav-item.is-active");
  const activeTop = document.querySelector(".sh-topbar .sh-nav-item.is-active");
  const rect = (el) =>
    el
      ? (({ x, y, width, height, top, right, bottom, left }) => ({
          x,
          y,
          width,
          height,
          top,
          right,
          bottom,
          left,
        }))(el.getBoundingClientRect())
      : null;
  const cs = (el, p) => (el ? getComputedStyle(el)[p] : null);
  return {
    hOverflow: de.scrollWidth > de.clientWidth + 0.5,
    scrollW: de.scrollWidth,
    clientW: de.clientWidth,
    navDisplay: cs(nav, "display"),
    navRect: rect(nav),
    topDisplay: cs(top, "display"),
    topRect: rect(top),
    contentRect: rect(content),
    hasSkeleton: !!skel,
    skeletonVariant: skel?.getAttribute("data-skeleton-variant") || null,
    skeletonBlocks: document.querySelectorAll("[data-skeleton] .skeleton").length,
    skeletonRole: skel?.getAttribute("role") || null,
    skeletonBusy: skel?.getAttribute("aria-busy") || null,
    skeletonRight: skel ? skel.getBoundingClientRect().right : null,
    activeBottomLabel: activeBottom?.textContent?.trim() || null,
    activeTopLabel: activeTop?.textContent?.trim() || null,
    hasRealPage: !!document.querySelector("[data-realpage]"),
  };
};

/* ═══ 1 · per-route static skeleton — present, framed, active-highlighted, no overflow ═══ */
for (const vp of [PHONE, DESK]) {
  await page.setViewportSize({ width: vp.w, height: vp.h });
  for (let i = 0; i < ROUTES.length; i++) {
    const r = ROUTES[i];
    await page.goto(`${BASE}/static?i=${i}`, { waitUntil: "load" });
    const s = await page.evaluate(frameProbe);
    const onPhone = vp.tag === "390";
    // active-highlight expectation: bottom-tab routes light a bottom slot; More-target routes light
    // the More button; the top strip lights the matching item (commish is not in the top strip).
    const { bottomActive, moreHasActive } = selectMobileNavPartition(r.activeId);
    const expectBottomActive = onPhone && (bottomActive !== null || moreHasActive);
    const fails = [
      ...(s.hasSkeleton ? [] : ["no [data-skeleton] in the content area"]),
      ...(s.skeletonVariant === r.variant
        ? []
        : [`skeleton variant ${s.skeletonVariant} ≠ ${r.variant}`]),
      ...(s.skeletonBlocks > 0 ? [] : ["skeleton has zero shimmer blocks"]),
      ...(s.skeletonRole === "status" && s.skeletonBusy === "true"
        ? []
        : ["skeleton missing role=status / aria-busy"]),
      ...(s.hOverflow ? [`horizontal overflow: scrollW ${s.scrollW} > clientW ${s.clientW}`] : []),
      ...(s.skeletonRight === null || s.skeletonRight <= s.clientW + 0.5
        ? []
        : [`skeleton right ${s.skeletonRight?.toFixed(1)} exceeds viewport ${s.clientW}`]),
    ];
    if (onPhone) {
      if (s.navDisplay === "none") fails.push("bottom nav hidden at 390 during loading");
      if (expectBottomActive && !s.activeBottomLabel)
        fails.push("no active-highlighted slot in the bottom bar during loading");
    } else {
      if (s.topDisplay === "none") fails.push("top strip hidden at desktop during loading");
      if (s.navDisplay !== "none")
        fails.push("bottom bar visible at desktop (should be top strip)");
      if (r.activeId !== "commish" && !s.activeTopLabel)
        fails.push("no active-highlighted item in the top strip during loading");
    }
    if (onPhone) await shot(`nav-latency-${r.activeId}-${vp.tag}.png`);
    report(`skeleton framed + active + no-overflow · ${r.path} · ${vp.tag}`, fails);
  }
}

/* ═══ 2 · no layout shift — shell frame identical between skeleton phase and real-content phase ═══ */
{
  await page.setViewportSize({ width: PHONE.w, height: PHONE.h });
  for (let i = 0; i < ROUTES.length; i++) {
    const r = ROUTES[i];
    await page.goto(`${BASE}/static?i=${i}`, { waitUntil: "load" });
    const skel = await page.evaluate(frameProbe);
    await page.goto(`${BASE}/real?i=${i}`, { waitUntil: "load" });
    const real = await page.evaluate(frameProbe);
    // A layout SHIFT is a change in an element's position/width. The content box growing taller
    // downward when the real content arrives is legitimate growth, not a shift — so compare
    // top/left/width for the content frame; the fixed nav is compared on every axis (it must not move).
    const samePos = (a, b) =>
      a &&
      b &&
      Math.abs(a.top - b.top) < 0.5 &&
      Math.abs(a.left - b.left) < 0.5 &&
      Math.abs(a.width - b.width) < 0.5;
    const same = (a, b) => samePos(a, b) && Math.abs(a.height - b.height) < 0.5;
    const fails = [
      ...(same(skel.navRect, real.navRect)
        ? []
        : ["bottom nav rect shifts between skeleton and real content"]),
      ...(samePos(skel.contentRect, real.contentRect)
        ? []
        : ["content frame rect shifts between skeleton and real content"]),
      ...(skel.activeBottomLabel === real.activeBottomLabel
        ? []
        : ["active-tab highlight differs between skeleton and real content"]),
      ...(real.hOverflow ? ["real-content phase overflows horizontally"] : []),
    ];
    report(`no layout shift — shared shell frame · ${r.path}`, fails);
  }
}

/* ═══ 3 · streaming — skeleton paints during the delay, BEFORE content, shell stable throughout ═══ */
{
  await page.setViewportSize({ width: PHONE.w, height: PHONE.h });
  for (let i = 0; i < ROUTES.length; i++) {
    const r = ROUTES[i];
    // Navigate but return as soon as the response commits (first flush) — the skeleton chunk.
    await page.goto(`${BASE}/stream?i=${i}`, { waitUntil: "commit" });
    let midFail = [];
    let mid = null;
    try {
      await page.waitForSelector("[data-skeleton]", { state: "attached", timeout: HOLD_MS - 200 });
      mid = await page.evaluate(frameProbe);
    } catch {
      midFail.push("skeleton never attached during the server delay (dead-tap window not covered)");
    }
    if (mid) {
      if (!mid.hasSkeleton) midFail.push("skeleton absent mid-delay");
      if (mid.hasRealPage)
        midFail.push("content arrived before the hold elapsed (cannot prove skeleton-first)");
      if (mid.navDisplay === "none")
        midFail.push("bottom nav not visible during the streamed skeleton phase");
      if (!mid.activeBottomLabel)
        midFail.push(
          "tapped destination not active-highlighted during the streamed skeleton phase",
        );
      if (mid.hOverflow) midFail.push("horizontal overflow during the streamed skeleton phase");
    }
    if (i === 0 || r.activeId === "standings")
      await shot(`nav-latency-stream-${r.activeId}-mid.png`);
    // Now let the content stream in and confirm it lands in the SAME frame (no shift).
    let post = null;
    try {
      await page.waitForSelector("[data-realpage]", { state: "attached", timeout: 4000 });
      post = await page.evaluate(frameProbe);
    } catch {
      midFail.push("content never streamed in after the delay");
    }
    if (mid && post) {
      const same = (a, b) =>
        a &&
        b &&
        Math.abs(a.top - b.top) < 0.5 &&
        Math.abs(a.left - b.left) < 0.5 &&
        Math.abs(a.width - b.width) < 0.5;
      if (!same(mid.navRect, post.navRect))
        midFail.push("nav rect shifted when content streamed in");
      if (post.hOverflow) midFail.push("overflow after content streamed in");
    }
    report(`streaming skeleton-first, shell stable · ${r.path}`, midFail);
  }
}

await browser.close();
server.close();

const failCount = results.filter((r) => r.fails.length).length;
console.log(
  `\n${failCount === 0 ? "ALL GREEN" : "FAILURES"} — ${results.length - failCount}/${results.length} checks · screenshots ${screenshotsDir}`,
);
process.exit(failCount === 0 ? 0 : 1);
