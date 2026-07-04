/**
 * verify-shell-stacking.mjs — T15-2 real-browser render/geometry proof (Playwright + chromium).
 *
 * Proves, at 360/390/430 + desktop 1180, against the REAL production CSS (ds.css + shell.css +
 * the route stylesheets, inlined byte-for-byte):
 *
 *  (a) every overlay surface — waivers bid composer, FA player card, pool drill-in, MoreSheet,
 *      PlayerScoreSheet — paints ABOVE the fixed bottom nav (computed z-index + elementFromPoint
 *      paint-order probe), with its action row + close-✕ inside the viewport and CLICKABLE
 *      (elementFromPoint at their centers resolves to them);
 *  (b) the nav does NOT receive a tap while a scrim is open — a real dispatched click at a nav
 *      tab's center must not navigate, and the hit at that point must not be the nav item;
 *  (c) the /lineup SaveBar rests fully ABOVE the nav band when scrolled to the bottom;
 *  (d) a REAL dispatched tap on every bottom tab <a> NAVIGATES (waitForURL race — presence is
 *      insufficient, per the PLAYERS-TAB precedent), and a More-sheet item <a> navigates too.
 *      (The More <button>'s open/close/focus behavior is React state — proven by the RTL DOM
 *      tests `moreSheetChrome.dom.test.tsx`, not replayable in a static replica.)
 *  (e) no horizontal overflow at any phone width; every tab slot ≥44×44 with EQUAL widths
 *      (6-slot spacing, F-P0-A1/C2); the bar's height stays within the shell's 58px content
 *      clearance constant;
 *  (f) step-27: the instant-pickup FA panel's drop-picker + confirm row are fully reachable —
 *      the action column orders ABOVE the pool list and the confirm button sits above the nav.
 *
 * House pattern (verify-players.mjs): served replica over pw.local via context.route fulfill —
 * the wildcard serves EVERY pw.local path, which is what lets a real <a> navigation land. The
 * replica markup uses the exact class names the components emit (pinned to source by the
 * shellStacking.contract.test.ts + existing component smokes, so the replica can't drift).
 * SKIPs (exit 0) if Playwright/Chromium is unavailable, like the other render proofs.
 */
/* eslint-disable no-undef */
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(here, "..");
const screenshotsDir = resolve(webDir, "screenshots");
mkdirSync(screenshotsDir, { recursive: true });

const css = (p) => readFileSync(resolve(webDir, p), "utf8");
const DS = css("app/styles/ds.css");
const SHELL = css("app/shell/shell.css");
const WAIVERS = css("src/waivers/waivers.css");
const POOL = css("src/pool/pool.css");
const PSC = css("components/PlayerScoreSheet.css");
const LINEUP = css("app/lineup/lineup.css");

/* ── replica builders (class-faithful, geometry-relevant markup only) ─────────────────────── */

const NAV_TABS = [
  ["/", "Dashboard"],
  ["/lineup", "Set lineup"],
  ["/vsfield", "The Cut"],
  ["/pool", "Quiniela"],
  ["/players", "Players"],
];

const svg = `<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85"><circle cx="12" cy="12" r="8.5"/></svg>`;

function bottomNav({ activeHref = "/" } = {}) {
  const tabs = NAV_TABS.map(
    ([href, label]) =>
      `<a class="sh-btnav-item${href === activeHref ? " is-active" : ""}" href="${href}"${
        href === activeHref ? ' aria-current="page"' : ""
      }>${svg}<span>${label}${label === "The Cut" ? '<span class="sh-nav-dotlive"></span>' : ""}</span></a>`,
  ).join("");
  return `<nav class="sh-btmnav" aria-label="Primary">${tabs}<button type="button" class="sh-btnav-item sh-more-btn" aria-label="More navigation options">${svg}<span>More</span></button></nav>`;
}

function moreSheetOpen() {
  const items = [
    ["/scoring", "Scoring"],
    ["/waivers", "Waivers"],
    ["/standings", "Standings"],
    ["/playoffs", "Theater"],
    ["/draft", "Draft room"],
    ["/settings", "Settings"],
    ["/players", "Browse players"],
  ]
    .map(([href, label]) => `<a href="${href}" class="sh-more-item">${label}</a>`)
    .join("");
  return `<div class="sh-more-backdrop" aria-hidden="true"></div>
  <div role="dialog" aria-modal="true" aria-label="More navigation" class="sh-more-sheet" tabindex="-1">
    <div class="sh-sheet-grab" aria-hidden="true"></div>
    <div class="sh-sheet-head"><span class="sh-sheet-title">More</span>
      <button type="button" class="sh-sheet-x" aria-label="Close menu"><span aria-hidden="true">✕</span></button></div>
    <div class="sh-more-sheet-items">${items}</div>
    <div class="sh-more-footer"><div class="sh-more-identity">Signed in as <b>x@y.z</b></div>
      <button type="button" class="btn btn-ghost btn-sm sh-more-signout">Sign out</button></div>
  </div>`;
}

const faRows = (n, cls = "wv-fa-row") =>
  Array.from(
    { length: n },
    (_, i) =>
      `<button class="${cls}" style="min-height:44px">Player ${i + 1} · MID · 12 pts</button>`,
  ).join("");

function bidComposer() {
  return `<div class="wv-scrim" role="dialog" aria-modal="true" aria-label="Waiver claim">
    <div class="wv-composer" id="composer">
      <div class="wv-comp-head"><b class="wv-comp-title">New waiver claim</b>
        <button class="wv-icon-btn" id="composer-x" aria-label="Close">✕</button></div>
      <div class="wv-comp-body">
        <div class="wv-comp-pick">
          <div class="wv-comp-search"><input class="input wv-comp-input" placeholder="Search free agents…"/></div>
          <div class="wv-comp-list">${faRows(40)}</div>
        </div>
        <div class="wv-comp-config">
          <div class="wv-comp-fixed"><span class="t-label">Claiming</span><b>T. Player</b></div>
          <div class="wv-comp-field"><span class="t-label">Drop to make room</span>
            <div class="wv-drop-pick">${faRows(9, "wv-drop-opt")}</div></div>
          <div class="wv-comp-rules t-micro">Sealed until the batch. Budget rule enforced.</div>
          <div class="wv-comp-actions"><button class="btn btn-primary" id="place-bid">Place bid</button></div>
        </div>
      </div>
    </div>
  </div>`;
}

function faPanelInFlow() {
  // The IN-FLOW instant-pickup panel (step-27): selected player, full squad ⇒ drop-picker + confirm.
  return `<section class="wv-fa" aria-label="Free agents">
    <div class="wv-fa-head"><span class="t-label">Free agents · instant pickup</span></div>
    <div class="wv-comp-body">
      <div class="wv-comp-pick">
        <div class="wv-comp-search"><input class="input wv-comp-input" placeholder="Search free agents…"/></div>
        <div class="wv-comp-list" id="fa-pool">${faRows(40)}</div>
      </div>
      <div class="wv-comp-config" id="fa-config">
        <div class="wv-comp-fixed"><span class="t-label">Adding</span><b>T. Player</b></div>
        <div class="wv-comp-field"><span class="t-label">Drop to make room · squad full 9/9</span>
          <div class="wv-drop-pick" id="fa-drops">${faRows(9, "wv-drop-opt")}</div></div>
        <div class="wv-comp-actions"><button class="btn btn-primary" id="fa-confirm">Add free agent</button></div>
      </div>
    </div>
  </section>`;
}

function playerCard() {
  const lines = Array.from(
    { length: 28 },
    (_, i) => `<div class="pc-lrow">Stat line ${i + 1}</div>`,
  ).join("");
  return `<div class="pc-scrim" role="dialog" aria-modal="true" aria-label="Player card">
    <div class="pc-sheet" id="pc-sheet">
      <button class="pc-x" id="pc-x" aria-label="Close"><span aria-hidden="true">✕</span></button>
      <div class="pc-head"><b>T. Player</b><span class="pc-headtotal">41</span></div>
      <div class="pc-seg" role="tablist"><button class="pc-seg-btn is-active">Points</button><button class="pc-seg-btn">Stats</button></div>
      <div class="pc-body" id="pc-body">${lines}</div>
      <div class="pc-foot">View only · acquire from the Free Agents panel.</div>
    </div>
  </div>`;
}

function scoreSheet() {
  const lines = Array.from(
    { length: 30 },
    (_, i) => `<div class="sl-sm-row">Scored line ${i + 1} · +2</div>`,
  ).join("");
  return `<div class="sl-forfeit-overlay" role="presentation">
    <div role="dialog" aria-modal="true" class="sl-scoremodal card" id="scoremodal">
      <button type="button" class="btn btn-ghost btn-sm sl-sm-close" id="sm-x" aria-label="Close">✕</button>
      <div class="pc-seg" role="tablist" id="sm-tabs"><button class="pc-seg-btn is-active">Points</button><button class="pc-seg-btn">Stats</button></div>
      <div class="sl-sm-body" id="sm-body"><div class="sl-sm-head"><b class="sl-sm-name">T. Player</b></div>${lines}</div>
    </div>
  </div>`;
}

function poolModal() {
  const rows = Array.from(
    { length: 24 },
    (_, i) => `<div class="pl-mp-row">Fixture ${i + 1} · Home</div>`,
  ).join("");
  return `<div class="pl-modal-overlay" role="presentation">
    <div role="dialog" aria-modal="true" class="pl-modal card" id="pl-modal">
      <div class="pl-modal-head"><span class="t-h3 pl-modal-title">Your picks</span>
        <button type="button" class="pl-modal-close" id="pl-x" aria-label="Close">✕</button></div>
      <div class="pl-modal-list">${rows}</div>
    </div>
  </div>`;
}

function saveBarPage() {
  const filler = Array.from(
    { length: 30 },
    (_, i) => `<div style="padding:14px 0">Pitch row ${i + 1}</div>`,
  ).join("");
  return `<div class="sl-app"><div style="padding:16px">${filler}
    <div class="sl-savebar between" id="savebar">
      <span class="sl-savebar-reason t-sm text-tertiary">Lineup is legal — ready to save.</span>
      <button class="btn btn-primary" id="save-btn">Save lineup</button>
    </div></div></div>`;
}

function screen({ body, overlay = "", styles, activeHref = "/" }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
  <style>${styles.join("\n")}</style></head>
  <body><div data-theme="dark" data-accent="cobalt" data-density="comfortable">
    <div class="sh-app sh-app-top"><div class="sh-content">${body}</div>${bottomNav({ activeHref })}</div>
    ${overlay}
  </div></body></html>`;
}

const PAGE_FILLER = `<div style="padding:16px">${Array.from({ length: 40 }, (_, i) => `<p style="margin:12px 0">Content row ${i + 1}</p>`).join("")}</div>`;

/* ── runner ───────────────────────────────────────────────────────────────────────────────── */

let chromium;
try {
  ({ chromium } = await import("@playwright/test"));
} catch {
  console.log("⚠ SKIP — @playwright/test not installed; shell-stacking render proof not run.");
  process.exit(0);
}

let browser;
try {
  browser = await chromium.launch();
} catch (e) {
  console.log(
    `⚠ SKIP — chromium unavailable (${e.message?.split("\n")[0]}); render proof not run.`,
  );
  process.exit(0);
}

const context = await browser.newContext({ deviceScaleFactor: 2 });
const page = await context.newPage();
let currentHtml = "<!DOCTYPE html><html><body>boot</body></html>";
await context.route("**/pw.local/**", (route) =>
  route.fulfill({ contentType: "text/html", body: currentHtml }),
);

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
async function serve(html) {
  currentHtml = html;
  await page.goto("http://pw.local/", { waitUntil: "load" });
}

const VIEWPORTS = [
  { w: 360, h: 780, tag: "360" },
  { w: 390, h: 844, tag: "390" },
  { w: 430, h: 932, tag: "430" },
];

/* Probe helpers evaluated in-page. */
const probe = {
  // paint-order + clickability of one element (by selector): center hit must resolve to it
  hit: (sel) => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    return {
      found: true,
      rect: { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height },
      inViewport:
        r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight + 0.5 && r.right <= innerWidth + 0.5,
      hitSelf: !!hit && (hit === el || el.contains(hit) || hit.contains(el)),
      hitDesc: hit ? `${hit.tagName.toLowerCase()}.${String(hit.className).split(" ")[0]}` : "none",
    };
  },
};

/* ═══ 1 · bar geometry: equal 6 slots, ≥44px, no overflow, bar within clearance ═══ */
for (const vp of VIEWPORTS) {
  await page.setViewportSize({ width: vp.w, height: vp.h });
  await serve(screen({ body: PAGE_FILLER, styles: [DS, SHELL] }));
  const g = await page.evaluate(() => {
    const items = [...document.querySelectorAll(".sh-btmnav .sh-btnav-item")];
    const nav = document.querySelector(".sh-btmnav");
    const navR = nav.getBoundingClientRect();
    const rects = items.map((el) => el.getBoundingClientRect());
    const de = document.documentElement;
    return {
      count: items.length,
      widths: rects.map((r) => r.width),
      heights: rects.map((r) => r.height),
      navH: navR.height,
      navBottom: navR.bottom,
      innerH: innerHeight,
      hOverflow: de.scrollWidth > de.clientWidth,
      offRight: rects.filter((r) => r.right > de.clientWidth + 0.5).length,
      display: getComputedStyle(nav).display,
    };
  });
  const wMin = Math.min(...g.widths);
  const wMax = Math.max(...g.widths);
  const fails = [
    ...(g.display !== "none" ? [] : ["bottom bar hidden at phone width"]),
    ...(g.count === 6 ? [] : [`expected 6 slots, found ${g.count}`]),
    ...(g.hOverflow ? ["document overflows horizontally"] : []),
    ...(g.offRight === 0 ? [] : [`${g.offRight} slot(s) clipped past the right edge`]),
    ...(wMin >= 44 ? [] : [`slot width ${wMin.toFixed(1)}px < 44px`]),
    ...(Math.min(...g.heights) >= 44
      ? []
      : [`slot height ${Math.min(...g.heights).toFixed(1)}px < 44px`]),
    ...(wMax - wMin <= 2 ? [] : [`uneven slots: ${wMin.toFixed(1)}–${wMax.toFixed(1)}px`]),
    ...(g.navH <= 58 ? [] : [`bar ${g.navH.toFixed(1)}px exceeds the 58px .sh-content clearance`]),
    ...(Math.abs(g.navBottom - g.innerH) < 0.5 ? [] : ["bar not flush with viewport bottom"]),
  ];
  await shot(`shellstack-bar-${vp.tag}.png`);
  report(`bar geometry · 6 equal ≥44px slots, no overflow · ${vp.tag}`, fails);
}

/* desktop: bar hidden, top strip visible */
{
  await page.setViewportSize({ width: 1180, height: 900 });
  await serve(screen({ body: PAGE_FILLER, styles: [DS, SHELL] }));
  const d = await page.evaluate(() => ({
    bar: getComputedStyle(document.querySelector(".sh-btmnav")).display,
  }));
  report("bar hidden at desktop 1180", d.bar === "none" ? [] : [`display ${d.bar}`]);
}

/* ═══ 2 · every overlay paints above the nav; chrome clickable; nav tap-proof ═══ */
const OVERLAYS = [
  {
    name: "waivers bid composer",
    overlay: bidComposer,
    styles: [DS, SHELL, WAIVERS],
    scrimSel: ".wv-scrim",
    closeSel: "#composer-x",
    actionSel: "#place-bid",
    scrollBodySel: ".wv-comp-body",
  },
  {
    name: "FA player card",
    overlay: playerCard,
    styles: [DS, SHELL, WAIVERS],
    scrimSel: ".pc-scrim",
    closeSel: "#pc-x",
    actionSel: null,
    scrollBodySel: "#pc-body",
    fixedChromeSel: "#pc-x",
  },
  {
    name: "pool drill-in",
    overlay: poolModal,
    styles: [DS, SHELL, POOL],
    scrimSel: ".pl-modal-overlay",
    closeSel: "#pl-x",
    actionSel: null,
    scrollBodySel: ".pl-modal-list",
  },
  {
    name: "PlayerScoreSheet",
    overlay: scoreSheet,
    styles: [DS, SHELL, PSC],
    scrimSel: ".sl-forfeit-overlay",
    closeSel: "#sm-x",
    actionSel: null,
    scrollBodySel: "#sm-body",
    fixedChromeSel: "#sm-x",
  },
  {
    name: "MoreSheet",
    overlay: moreSheetOpen,
    styles: [DS, SHELL],
    scrimSel: ".sh-more-backdrop",
    closeSel: ".sh-sheet-x",
    actionSel: ".sh-more-item[href='/scoring']",
    scrollBodySel: ".sh-more-sheet-items",
    insideNav: true, // renders inside .sh-btmnav in production; replica mirrors stacking only
  },
];

for (const vp of VIEWPORTS) {
  await page.setViewportSize({ width: vp.w, height: vp.h });
  for (const o of OVERLAYS) {
    await serve(
      screen({ body: PAGE_FILLER, overlay: o.overlay(), styles: o.styles, activeHref: "/" }),
    );
    const z = await page.evaluate(
      ({ scrimSel }) => {
        const nav = document.querySelector(".sh-btmnav");
        const scrim = document.querySelector(scrimSel);
        return {
          navZ: parseInt(getComputedStyle(nav).zIndex, 10),
          scrimZ: parseInt(getComputedStyle(scrim).zIndex, 10),
          navPE: getComputedStyle(nav).pointerEvents,
        };
      },
      { scrimSel: o.scrimSel },
    );
    const closeHit = await page.evaluate(probe.hit, o.closeSel);
    let actionHit = { found: true, inViewport: true, hitSelf: true, rect: { h: 44, w: 44 } };
    if (o.actionSel) {
      await page.evaluate((sel) => {
        document.querySelector(sel)?.scrollIntoView({ block: "nearest" });
      }, o.actionSel);
      actionHit = await page.evaluate(probe.hit, o.actionSel);
    }
    // chrome stays put while the body scrolls (PSC1) — for the sheets with fixed chrome
    let chromeMoved = false;
    if (o.fixedChromeSel && o.scrollBodySel) {
      chromeMoved = await page.evaluate(
        ({ chrome, body }) => {
          const x = document.querySelector(chrome);
          const b = document.querySelector(body);
          const before = x.getBoundingClientRect().top;
          b.scrollTop = b.scrollHeight;
          return Math.abs(x.getBoundingClientRect().top - before) > 0.5;
        },
        { chrome: o.fixedChromeSel, body: o.scrollBodySel },
      );
    }
    // (b) nav must not receive the tap: real click at the Dashboard tab's center → no navigation
    const navTap = await page.evaluate(() => {
      const item = document.querySelector('.sh-btnav-item[href="/"]');
      const r = item.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      return { cx, cy, hitIsNav: !!hit && (hit === item || item.contains(hit)) };
    });
    // The tap must not reach the NAV LINK (a navigation to ITS href). For the MoreSheet the
    // click legitimately lands on sheet content occupying that band (items are real <a>s whose
    // navigation is correct behavior) — so the failure condition is specifically "landed on the
    // covered tab's destination".
    const urlBefore = page.url();
    await page.mouse.click(navTap.cx, navTap.cy);
    await page.waitForTimeout(120);
    const landed = new URL(page.url()).pathname;
    const navigated = page.url() !== urlBefore && (!o.insideNav || landed === "/");

    const fails = [
      ...(Number.isFinite(z.scrimZ) && z.scrimZ > z.navZ
        ? []
        : [`scrim z ${z.scrimZ} does not beat nav z ${z.navZ}`]),
      ...(o.insideNav || z.navPE === "none"
        ? []
        : [`nav pointer-events '${z.navPE}' — expected none under an open scrim`]),
      ...(closeHit.found ? [] : [`close ✕ ${o.closeSel} not found`]),
      ...(closeHit.inViewport ? [] : ["close ✕ outside the viewport"]),
      ...(closeHit.hitSelf ? [] : [`close ✕ not clickable — hit ${closeHit.hitDesc}`]),
      ...(closeHit.rect && Math.min(closeHit.rect.w, closeHit.rect.h) >= 30
        ? []
        : [`close ✕ ${closeHit.rect?.w}×${closeHit.rect?.h} — under target size`]),
      ...(actionHit.found ? [] : [`action row ${o.actionSel} not found`]),
      ...(actionHit.inViewport ? [] : ["action row outside the viewport"]),
      ...(actionHit.hitSelf ? [] : [`action row not clickable — hit ${actionHit.hitDesc}`]),
      ...(chromeMoved ? ["✕/tab chrome scrolled away with the body (PSC1 regression)"] : []),
      ...(navTap.hitIsNav
        ? ["elementFromPoint at the nav tab resolves to the NAV under a scrim"]
        : []),
      ...(navigated ? ["a real tap on the nav NAVIGATED while a scrim was open"] : []),
    ];
    await shot(`shellstack-${o.name.replace(/\s+/g, "-")}-${vp.tag}.png`);
    report(`${o.name} · above nav, chrome clickable, nav tap-proof · ${vp.tag}`, fails);
  }
}

/* close-✕ 44px targets (ds + PSC sheets carry the T15-2 bump; pool close is 30px house chrome) */
{
  await page.setViewportSize({ width: 390, height: 844 });
  await serve(screen({ body: PAGE_FILLER, overlay: playerCard(), styles: [DS, SHELL, WAIVERS] }));
  const pc = await page.evaluate(probe.hit, "#pc-x");
  await serve(screen({ body: PAGE_FILLER, overlay: scoreSheet(), styles: [DS, SHELL, PSC] }));
  const sm = await page.evaluate(probe.hit, "#sm-x");
  const fails = [
    ...(pc.rect.w >= 44 && pc.rect.h >= 44 ? [] : [`pc-x ${pc.rect.w}×${pc.rect.h} < 44×44`]),
    ...(sm.rect.w >= 44 && sm.rect.h >= 44
      ? []
      : [`sl-sm-close ${sm.rect.w}×${sm.rect.h} < 44×44`]),
  ];
  report("card/score-sheet close ✕ ≥ 44×44 (PSC1)", fails);
}

/* ═══ 3 · (c) SaveBar above the nav band ═══ */
for (const vp of VIEWPORTS) {
  await page.setViewportSize({ width: vp.w, height: vp.h });
  await serve(screen({ body: saveBarPage(), styles: [DS, SHELL, LINEUP] }));
  const s = await page.evaluate(() => {
    const se = document.scrollingElement;
    se.scrollTop = se.scrollHeight;
    const bar = document.querySelector("#savebar").getBoundingClientRect();
    const nav = document.querySelector(".sh-btmnav").getBoundingClientRect();
    const save = document.querySelector("#save-btn").getBoundingClientRect();
    const hit = document.elementFromPoint(save.left + save.width / 2, save.top + save.height / 2);
    const btn = document.querySelector("#save-btn");
    return {
      barBottom: bar.bottom,
      navTop: nav.top,
      saveClickable: !!hit && (hit === btn || btn.contains(hit)),
    };
  });
  const fails = [
    ...(s.barBottom <= s.navTop + 0.5
      ? []
      : [`SaveBar bottom ${s.barBottom.toFixed(1)} overlaps nav top ${s.navTop.toFixed(1)}`]),
    ...(s.saveClickable ? [] : ["Save button not clickable at rest"]),
  ];
  await shot(`shellstack-savebar-${vp.tag}.png`);
  report(`SaveBar fully above the nav band (F-P1-C1) · ${vp.tag}`, fails);
}

/* ═══ 4 · (f) step-27: FA panel action column above the pool list, confirm reachable ═══ */
for (const vp of VIEWPORTS) {
  await page.setViewportSize({ width: vp.w, height: vp.h });
  await serve(
    screen({ body: `<div class="wv-app">${faPanelInFlow()}</div>`, styles: [DS, SHELL, WAIVERS] }),
  );
  const s = await page.evaluate(() => {
    const config = document.querySelector("#fa-config").getBoundingClientRect();
    const pool = document.querySelector("#fa-pool").getBoundingClientRect();
    document.querySelector("#fa-confirm").scrollIntoView({ block: "center" });
    const confirm = document.querySelector("#fa-confirm").getBoundingClientRect();
    const nav = document.querySelector(".sh-btmnav").getBoundingClientRect();
    const el = document.querySelector("#fa-confirm");
    const hit = document.elementFromPoint(
      confirm.left + confirm.width / 2,
      confirm.top + confirm.height / 2,
    );
    const drops = document.querySelector("#fa-drops").getBoundingClientRect();
    return {
      configAboveList: config.top < pool.top,
      confirmAboveNav: confirm.bottom <= nav.top + 0.5,
      confirmClickable: !!hit && (hit === el || el.contains(hit)),
      dropsVisible: drops.height > 0,
    };
  });
  const fails = [
    ...(s.configAboveList ? [] : ["action column did NOT order above the pool list"]),
    ...(s.confirmAboveNav ? [] : ["confirm button still under the nav band"]),
    ...(s.confirmClickable ? [] : ["confirm button not clickable"]),
    ...(s.dropsVisible ? [] : ["drop-picker collapsed"]),
  ];
  await shot(`shellstack-step27-${vp.tag}.png`);
  report(`step-27 instant-pickup reachable (drop-picker + confirm) · ${vp.tag}`, fails);
}

/* ═══ 5 · (d) tap-through: every bottom tab really navigates; a More item navigates ═══ */
{
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [href, label] of NAV_TABS) {
    await serve(screen({ body: PAGE_FILLER, styles: [DS, SHELL], activeHref: "/x-none" }));
    let navigatedTo = null;
    try {
      await Promise.all([
        page.waitForURL((u) => u.pathname === href, { timeout: 4000 }),
        page.click(`.sh-btmnav .sh-btnav-item[href='${href}']`),
      ]);
      navigatedTo = new URL(page.url()).pathname;
    } catch {
      navigatedTo = `TIMEOUT (at ${new URL(page.url()).pathname})`;
    }
    report(
      `tap-through · "${label}" → ${href}`,
      navigatedTo === href ? [] : [`navigation landed on ${navigatedTo}`],
    );
  }
  // a More-sheet item navigates (the sheet's own toggle is RTL-proven; links must really work)
  await serve(screen({ body: PAGE_FILLER, overlay: moreSheetOpen(), styles: [DS, SHELL] }));
  let moreNav = null;
  try {
    await Promise.all([
      page.waitForURL((u) => u.pathname === "/standings", { timeout: 4000 }),
      page.click(".sh-more-item[href='/standings']"),
    ]);
    moreNav = new URL(page.url()).pathname;
  } catch {
    moreNav = `TIMEOUT (at ${new URL(page.url()).pathname})`;
  }
  report(
    "tap-through · More sheet item → /standings",
    moreNav === "/standings" ? [] : [`navigation landed on ${moreNav}`],
  );
}

/* ═══ 6 · :active press feedback exists (F-P0-A1 C1 fix is declared) ═══ */
{
  // Computed-style probes can't trigger :active without a held pointer; assert the DECLARATION
  // the way the players harness asserts painted deltas — via the stylesheet the page actually
  // loaded (drift-proof: same inlined shell.css the components ship).
  const hasActive = /\.sh-btnav-item:active\s*{[^}]*background/.test(SHELL);
  const hasTouchAction = /\.sh-btnav-item\s*{[^}]*touch-action:\s*manipulation/.test(SHELL);
  report("nav press feedback declared (:active + touch-action)", [
    ...(hasActive ? [] : ["no .sh-btnav-item:active background rule"]),
    ...(hasTouchAction ? [] : ["no touch-action: manipulation on .sh-btnav-item"]),
  ]);
}

await browser.close();

const failCount = results.filter((r) => r.fails.length).length;
console.log(
  `\n${failCount === 0 ? "ALL GREEN" : "FAILURES"} — ${results.length - failCount}/${results.length} checks · screenshots ${screenshotsDir}`,
);
process.exit(failCount === 0 ? 0 : 1);
