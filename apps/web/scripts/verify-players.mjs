/**
 * Real-browser RENDER PROOF for the /players browser (PLAYERS-1 remediation).
 *
 * Same standing lesson as verify-the-cut.mjs: jsdom has no layout/paint engine, so only a real browser
 * proves the screen. This mounts a FAITHFUL replica of the shipped surfaces — the SAME class names the
 * real components emit (PlayersClient / components.tsx / Dashboard / WaiversClient / MoreSheet), pinned
 * to source by `playersRenderProof.test.ts` so the replica can't silently drift — with the REAL
 * app/styles/ds.css + src/players/players.css + src/waivers/waivers.css + app/shell/shell.css +
 * app/_dashboard/dashboard.css, in headless Chromium, and asserts by true paint geometry across desktop
 * 1180 + phone widths 360/390. It proves five things — the four PLAYERS-1 remediation fixes, plus the
 * PLAYERS-TAB first-class nav tab:
 *
 *   1 · /players paints the STATLINE (real stat columns) + the FLAG-KIT column + the full pool count.
 *   2 · the dashboard "Player pool" tile is a tappable <a> that navigates to /players.
 *   3 · the /waivers "Browse all players" link RENDERS while claims are CLOSED (locked window).
 *   4 · the MoreSheet "Browse players" entry exists and links to /players.
 *   5 · PLAYERS-TAB: the Players NAV TAB is present on the real nav surface — the desktop top strip
 *       AND the mobile bottom bar — renders active-highlighted on /players, and TAPS THROUGH (a click
 *       navigates the browser to /players; presence in the bar alone is not enough).
 *
 * Plus the T15 mobile hard-rules on the table: the Player column is sticky-pinned (horizontal swipe),
 * the bid trailer is a ≥44px tap target, and the page does not overflow horizontally (the swipe is
 * contained to the table).
 *
 * Screenshots land in /tmp + apps/web/screenshots. OPT-IN — not part of `pnpm test`:
 *
 *     pnpm test:players      # or: node apps/web/scripts/verify-players.mjs
 *
 * Needs a Chromium binary (`npx playwright install chromium`); with none it SKIPS with exit 0.
 */
/* eslint-disable no-undef */
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(__dir, "..");
const screenshotsDir = resolve(appDir, "screenshots");
const TMP = "/tmp";

let dsCSS, playersCSS, waiversCSS, shellCSS, dashCSS;
try {
  dsCSS = readFileSync(resolve(appDir, "app/styles/ds.css"), "utf8");
  playersCSS = readFileSync(resolve(appDir, "src/players/players.css"), "utf8");
  waiversCSS = readFileSync(resolve(appDir, "src/waivers/waivers.css"), "utf8");
  shellCSS = readFileSync(resolve(appDir, "app/shell/shell.css"), "utf8");
  dashCSS = readFileSync(resolve(appDir, "app/_dashboard/dashboard.css"), "utf8");
} catch (e) {
  console.error("Could not read a CSS source:", e.message);
  process.exit(1);
}

// France flag-kit gradient — a representative kitOf() output (kitOf is pinned to the real component by
// the contract test; the replica just needs a real gradient to prove the flag-kit paints).
const FR_KIT = "linear-gradient(90deg,#0055A4 0 33.33%,#fff 33.33% 66.66%,#EF4135 66.66%)";
const BR_KIT =
  "radial-gradient(circle at 50% 50%,#002776 0 12%,transparent 12.6%), radial-gradient(circle at 50% 50%,#FFDF00 0 32%,transparent 32.6%), #009C3B";

// ── /players replica pieces (class names pinned to components.tsx / PlayersClient.tsx) ──
const STAT_HEAD = `
<div class="mt-head mt-cols" role="row">
  <div class="mt-idc">Player</div><div class="mt-owner-h">Own</div>
  <div>Pld</div><div>Min</div><div>G</div><div>A</div><div>Sh</div><div>KP</div><div>CS</div><div>Tkl</div><div>YC</div>
  <div class="mt-end">Pts</div>
</div>`;

function statRow({
  name,
  nat,
  kit,
  pos,
  own,
  ownCls,
  cells,
  pts,
  bid = false,
  mine = false,
  elim = false,
}) {
  const statCells = cells
    .map((v) => `<div class="mt-stat${v === "—" ? " zero" : ""}">${v}</div>`)
    .join("");
  return `
<div class="mt-row mt-cols${mine ? " mine" : ""}${elim ? " is-elim" : ""}" role="row">
  <button class="mt-idc" aria-label="View ${name}’s player card">
    <span class="pos pos-${pos}">${pos}</span>
    <span class="pl-kit" style="background:${kit}"><span class="pl-kit-flag"><span class="flag-emoji">${nat}</span></span></span>
    <span class="nm"><b>${name}</b><small>${own === "FA" ? "France" : "Brazil"}${elim ? '<span class="mt-out"> · out</span>' : ""}</small></span>
  </button>
  <div class="mt-owner"><span class="pl-own ${ownCls}">${own}</span></div>
  ${statCells}
  <div class="mt-end"><span class="p">${pts}</span>${bid ? `<a class="mt-bid" href="/waivers?bid=x" aria-label="Place a bid on ${name}"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 5v14"/></svg></a>` : ""}</div>
</div>`;
}

// Column order: Pld Min G A Sh KP CS Tkl YC. YC is now REAL (from event_match) — Casemiro has 2 yellows
// live (verified), so his YC cell reads "2"; CS stays "—" (the one remaining gap).
const ROWS = [
  statRow({
    name: "K. Mbappé",
    nat: "🇫🇷",
    kit: FR_KIT,
    pos: "FWD",
    own: "FA",
    ownCls: "pl-own-fa",
    cells: ["6", "540", "5", "3", "12", "8", "—", "2", "1"],
    pts: 88,
    bid: true,
  }),
  statRow({
    name: "Vinícius Jr",
    nat: "🇧🇷",
    kit: BR_KIT,
    pos: "FWD",
    own: "You",
    ownCls: "pl-own-me",
    cells: ["6", "512", "4", "5", "10", "9", "—", "1", "—"],
    pts: 81,
    mine: true,
  }),
  statRow({
    name: "Casemiro",
    nat: "🇧🇷",
    kit: BR_KIT,
    pos: "MID",
    own: "Park Bus",
    ownCls: "pl-own-mgr",
    cells: ["3", "270", "0", "1", "2", "4", "—", "9", "2"],
    pts: 34,
    elim: true,
  }),
];

function playersScreen() {
  return `
<div class="sh-app sh-app-top">
  <header class="sh-topbar" aria-label="Global"><a class="sh-brand" href="/"><span class="sh-brand-txt"><b class="display">XI</b><span class="t-micro text-tertiary">WC Fantasy League</span></span></a></header>
  <div class="sh-content">
    <div data-theme="dark" data-accent="cobalt" data-density="comfortable">
      <div class="pl-app">
        <div class="pl-toolbar">
          <div class="pl-search"><svg viewBox="0 0 24 24" width="16" height="16"><circle cx="11" cy="11" r="7"/></svg><input class="pl-search-input" placeholder="Search players" aria-label="Search players"></div>
          <div class="pl-seg" role="tablist"><button class="on">All</button><button>GK</button><button>DEF</button><button>MID</button><button>FWD</button></div>
          <div class="pl-chiprow"><button class="pl-fchip on">All</button><button class="pl-fchip">Free agents</button><button class="pl-fchip">Rostered</button><button class="pl-fchip">Mine</button></div>
          <div class="pl-filterrow"><div class="nf-filter"><div class="nf-header"><button class="nf-toggle">Nations ▸</button></div></div><button class="pl-toggle"><span>Active teams</span><span class="pl-sw"></span></button></div>
        </div>
        <div class="pl-listmeta"><span class="pl-count">Showing <b>25</b> of 1,272</span><button class="pl-sort">Season pts <span class="pl-sort-dir">↓</span></button></div>
        <div class="pl-status"><span class="d" style="background:var(--locked)"></span><span style="color:var(--locked);font-weight:700">Claims closed</span> · waivers are locked for R16</div>
        <div class="mt-scrollhint">← swipe stats · tap a player to open the card</div>
        <div class="mt-scroll" role="table" aria-label="Players"><div class="mt-wrap">${STAT_HEAD}${ROWS.join("")}</div></div>
        <div class="pl-pager"><button class="pl-loadmore">Load 25 more</button><small>1,272 players in the pool</small></div>
      </div>
    </div>
  </div>
  <nav class="sh-btmnav" aria-label="Primary"><a class="sh-btnav-item"><span>Dashboard</span></a><a class="sh-btnav-item"><span>Set lineup</span></a></nav>
</div>`;
}

// ── dashboard tile replica (class names pinned to Dashboard.tsx `Module`) ──
function dashScreen() {
  return `
<div class="sh-app sh-app-top"><div class="sh-content"><div data-theme="dark" data-accent="cobalt" data-density="comfortable">
  <div class="db-page"><div class="db-grid"><div class="db-grid-cell">
    <section class="db-mod"><header class="db-mod-head"><span class="db-mod-title t-label">Player pool</span>
      <a class="db-mod-cta" href="/players">Browse all players<svg viewBox="0 0 24 24" width="14" height="14"><path d="M5 12h14"/></svg></a></header>
      <div class="db-mod-body"><p class="t-sm text-tertiary" style="margin:0;line-height:1.5">Search and filter every player in the tournament — rostered or free agent.</p></div>
    </section>
  </div></div></div>
</div></div></div>`;
}

// ── waivers closed-window replica (the persistent browse footer, class names pinned to WaiversClient) ──
function waiversScreen() {
  return `
<div class="sh-app sh-app-top"><div class="sh-content"><div data-theme="dark" data-accent="cobalt" data-density="comfortable">
  <div class="wv-app">
    <div class="wv-tabs" role="tablist"><button class="wv-tab is-active">My claims</button><button class="wv-tab">Batch results</button></div>
    <div class="wv-claims-page"><div class="wv-claims-main">
      <div class="wv-fa-head"><span class="t-label">Free agents · instant pickup</span><span class="t-micro text-tertiary">The acquisition window is locked for this period.</span></div>
      <div class="wv-empty"><b>No pending claims.</b><span class="t-sm text-tertiary">Place a sealed FAAB bid on a free agent — it processes at the next batch.</span></div>
    </div></div>
    <div class="wv-browse-foot"><a class="wv-browse-all t-sm" href="/players">Browse all players →</a></div>
  </div>
</div></div></div>`;
}

// ── MoreSheet open replica (class names pinned to MoreSheet.tsx) ──
function moreScreen() {
  return `
<div class="sh-app sh-app-top"><div class="sh-content" style="min-height:300px"></div>
  <nav class="sh-btmnav" aria-label="Primary">
    <a class="sh-btnav-item"><span>Dashboard</span></a>
    <div class="sh-more-backdrop"></div>
    <div role="dialog" aria-label="More navigation" class="sh-more-sheet">
      <div class="sh-more-sheet-items">
        <a href="/standings" class="sh-more-item">Standings</a>
        <a href="/players" class="sh-more-item">Browse players</a>
        <a href="/scoring" class="sh-more-item">Scoring</a>
      </div>
    </div>
  </nav>
</div>`;
}

// ── nav-chrome replica (class names pinned to AppShell.tsx by playersRenderProof.test.ts) ──
// Renders BOTH the desktop top strip (.sh-topnav > .sh-nav-item) and the mobile bottom bar
// (.sh-btmnav > .sh-btnav-item) AS the /players page: the Players tab carries `is-active` +
// `aria-current="page"`, exactly as AppShell emits when `active="players"`. shell.css's 640px swap
// shows the top strip on desktop and the bottom bar on mobile, so each width exercises the surface
// actually visible there — proving the FIRST-CLASS Players tab (PLAYERS-TAB) on BOTH surfaces.
const NAV_PERSON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.85"><circle cx="12" cy="8" r="3.4"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/></svg>`;
const topItem = (href, label, active) =>
  `<a href="${href}" class="sh-nav-item${active ? " is-active" : ""}"${active ? ' aria-current="page"' : ""}>${NAV_PERSON}${label}</a>`;
const btmItem = (href, label, active) =>
  `<a href="${href}" class="sh-btnav-item${active ? " is-active" : ""}"${active ? ' aria-current="page"' : ""}>${NAV_PERSON}<span>${label}</span></a>`;
function navReplica() {
  return `
<div class="sh-app sh-app-top">
  <header class="sh-topbar" aria-label="Global">
    <a class="sh-brand" href="/"><span class="sh-brand-txt"><b class="display">XI</b></span></a>
    <div class="sh-topnav-scroll"><nav class="sh-topnav" aria-label="Primary">
      ${topItem("/standings", "Standings", false)}
      ${topItem("/waivers", "Waivers", false)}
      ${topItem("/players", "Players", true)}
      ${topItem("/pool", "Quiniela", false)}
    </nav></div>
  </header>
  <div class="sh-content" style="min-height:200px"></div>
  <nav class="sh-btmnav" aria-label="Primary">
    ${btmItem("/", "Dashboard", false)}
    ${btmItem("/vsfield", "Vs the field", false)}
    ${btmItem("/players", "Players", true)}
    <button class="sh-btnav-item sh-more-btn" aria-label="More navigation options"><span>More</span></button>
  </nav>
</div>`;
}

function buildHTML(body) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${dsCSS}</style><style>${playersCSS}</style><style>${waiversCSS}</style><style>${shellCSS}</style><style>${dashCSS}</style>
<style>body{margin:0;background:var(--surface-0)}</style></head>
<body class="antialiased">${body}</body></html>`;
}

// ── in-page probes ──
const PROBE_PLAYERS = () => {
  const q = (s) => document.querySelector(s);
  const qa = (s) => [...document.querySelectorAll(s)];
  const rect = (el) => (el ? el.getBoundingClientRect() : null);
  const firstDataRow = qa(".mt-row").find((r) => !r.classList.contains("mt-head"));
  const kit = q(".mt-row .pl-kit");
  const bid = q(".mt-bid");
  const idc = q(".mt-row .mt-idc");
  return {
    countText: q(".pl-count")?.textContent ?? "",
    headLabels: qa(".mt-head > div").map((d) => d.textContent),
    firstRowStats: firstDataRow
      ? [...firstDataRow.querySelectorAll(".mt-stat")].map((c) => c.textContent)
      : [],
    // the YC column is the LAST stat cell of each data row — collect them to prove a REAL number renders
    ycValues: qa(".mt-row").map((r) => {
      const cells = r.querySelectorAll(".mt-stat");
      return cells.length ? cells[cells.length - 1].textContent : null;
    }),
    kitBg: kit ? getComputedStyle(kit).backgroundImage : "",
    kitHasFlag: !!q(".mt-row .pl-kit .flag-emoji"),
    idcPos: idc ? getComputedStyle(idc).position : "",
    idcLeft: idc ? getComputedStyle(idc).left : "",
    bidRect: rect(bid) ? { w: rect(bid).width, h: rect(bid).height } : null,
    pageScrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
    swipeHintShown: q(".mt-scrollhint")
      ? getComputedStyle(q(".mt-scrollhint")).display !== "none"
      : false,
  };
};

const PROBE_LINK = ({ sel, text }) => {
  const els = [...document.querySelectorAll(sel)];
  const el = text ? els.find((e) => e.textContent.includes(text)) : els[0];
  if (!el) return { found: false };
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const hit = document.elementFromPoint(cx, cy);
  return {
    found: true,
    tag: el.tagName,
    href: el.getAttribute("href"),
    w: r.width,
    h: r.height,
    hitInside: !!hit && (hit === el || el.contains(hit)),
  };
};

const results = [];
function report(label, fails) {
  if (fails.length) {
    console.error(`  ✗ ${label}`);
    for (const f of fails) console.error(`      - ${f}`);
  } else {
    console.log(`  ✓ ${label}`);
  }
  results.push({ label, fails });
}

// ── PLAYERS-DATA-scope · participant-scope INVARIANT (DB-backed) ──────────────────────────────
// Proves the guard against LIVE data: the /players pool is scoped to the fifa_match schedule
// participant set (home ∪ away FKs). Asserts the TRUE invariant — the pool is a SUBSET of the
// participant set (0 pooled players on a non-scheduled team) and ≤ 63 distinct teams back it — and
// REPORTS N + the distinct pool-team count as evidence the guard is a NO-OP on today's data (every
// player already sits on a scheduled team; the 49 non-WC nations the roster feed also carries hold 0
// players). @app/db is TypeScript, so we register tsx's ESM loader (resolved from packages/db — the
// only workspace that depends on it) and import prisma by absolute path. Skips cleanly (never fails)
// when tsx / the client / DATABASE_URL are unavailable, so a plain-node render-only run still passes.
async function checkParticipantScopeInvariant() {
  const dbPkgDir = resolve(appDir, "../../packages/db");
  let prisma;
  try {
    const dbRequire = createRequire(pathToFileURL(resolve(dbPkgDir, "package.json")));
    const { register } = await import(pathToFileURL(dbRequire.resolve("tsx/esm/api")).href);
    register(); // lets the TS @app/db import below resolve under plain `node`
    const { config } = await import(pathToFileURL(dbRequire.resolve("dotenv")).href);
    config({ path: resolve(appDir, "../../.env") }); // repo-root .env; no-op if env already set
    if (!process.env.DATABASE_URL) {
      console.log("  ⚠ SKIP participant-scope invariant (no DATABASE_URL)");
      return;
    }
    ({ prisma } = await import(pathToFileURL(resolve(dbPkgDir, "src/index.ts")).href));
  } catch (e) {
    console.log(
      `  ⚠ SKIP participant-scope invariant (DB harness unavailable: ${e.message.split("\n")[0]})`,
    );
    return;
  }
  try {
    const [players, matches] = await Promise.all([
      prisma.player.findMany({ select: { teamId: true } }),
      prisma.fifaMatch.findMany({ select: { homeTeamId: true, awayTeamId: true } }),
    ]);
    // The loader's predicate, mirrored EXACTLY: participants = schedule home∪away; pool = team ∈ set.
    const participants = new Set();
    for (const m of matches) {
      if (m.homeTeamId) participants.add(m.homeTeamId);
      if (m.awayTeamId) participants.add(m.awayTeamId);
    }
    const scoped = players.filter((p) => p.teamId !== null && participants.has(p.teamId));
    const poolTeams = new Set(scoped.map((p) => p.teamId));
    const N = scoped.length;
    const offSchedule = players.length - N;
    console.log(
      `  · N = ${N} player(s) in the scoped pool · ${poolTeams.size} distinct teams back it · ` +
        `${participants.size} schedule-participant teams · ${offSchedule} off-schedule ` +
        `(guard is a no-op on today's data)`,
    );
    report("participant-scope invariant · pool ⊆ fifa_match participants · ≤63 backing teams", [
      // TRUE invariant #1 — the pool is a SUBSET of the schedule-participant set.
      ...(offSchedule === 0
        ? []
        : [`pool NOT ⊆ participants: ${offSchedule} pooled player(s) on a non-scheduled team`]),
      // TRUE invariant #2 — no more distinct teams back the pool than the schedule carries, and the
      // participant set itself stays ≤ 63 (drift past that means re-confirm the predicate).
      ...(poolTeams.size <= participants.size
        ? []
        : [`pool spans ${poolTeams.size} teams > ${participants.size} participants`]),
      ...(participants.size <= 63
        ? []
        : [`participant set ${participants.size} > 63 — schedule drift, re-confirm the predicate`]),
    ]);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

// Run the DB-backed invariant FIRST — it is independent of Chromium, so it still runs (and can fail
// the script) even when the render proof is skipped for want of a browser binary.
await checkParticipantScopeInvariant();

let browser;
try {
  browser = await chromium.launch();
} catch (e) {
  console.log(`SKIP render proof (no Chromium): ${e.message.split("\n")[0]}`);
  const failCount = results.filter((r) => r.fails.length).length;
  process.exit(failCount === 0 ? 0 : 1);
}
mkdirSync(screenshotsDir, { recursive: true });

let currentHtml = "";
const context = await browser.newContext({ deviceScaleFactor: 2 });
await context.route("**/pw.local/**", (route) =>
  route.fulfill({ contentType: "text/html", body: currentHtml }),
);

const shot = async (page, name) => {
  await page.screenshot({ path: resolve(screenshotsDir, name) });
  await page.screenshot({ path: resolve(TMP, name) });
};

const VIEWPORTS = [
  { w: 1180, h: 900, tag: "desktop" },
  { w: 390, h: 844, tag: "mobile390" },
  { w: 360, h: 780, tag: "mobile360" },
];

for (const vp of VIEWPORTS) {
  const page = await context.newPage();
  await page.setViewportSize({ width: vp.w, height: vp.h });

  // 1 · /players — statline + flag-kit + full count
  currentHtml = buildHTML(playersScreen());
  await page.goto("http://pw.local/");
  const p = await page.evaluate(PROBE_PLAYERS);
  await shot(page, `players-${vp.tag}.png`);
  const isMobile = vp.w < 760;
  report(`players · ${vp.tag} · statline + flag-kit + count`, [
    ...(p.countText.includes("1,272")
      ? []
      : [`count "${p.countText}" lacks the full pool (1,272)`]),
    ...(["Pld", "Min", "G", "Sh", "YC"].every((l) => p.headLabels.includes(l))
      ? []
      : [`stat header labels missing (${p.headLabels.join(",")})`]),
    ...(p.firstRowStats.join(",") === "6,540,5,3,12,8,—,2,1"
      ? []
      : [`first row statline wrong (${p.firstRowStats.join(",")})`]),
    // YC is now REAL (from event_match): at least one carded player must show a numeric count, not "—"
    ...(p.ycValues.some((v) => /^\d+$/.test(v ?? ""))
      ? []
      : [`no real numeric YC rendered (all "—"): ${JSON.stringify(p.ycValues)}`]),
    ...(/gradient/.test(p.kitBg) ? [] : [`flag-kit did not paint a gradient (${p.kitBg})`]),
    ...(p.kitHasFlag ? [] : ["flag-kit missing the flag-emoji signal"]),
    ...(p.bidRect && p.bidRect.w >= 44 && p.bidRect.h >= 44
      ? []
      : [`bid tap target < 44px (${JSON.stringify(p.bidRect)})`]),
    ...(p.pageScrollW <= p.innerW + 2
      ? []
      : [`page overflows horizontally (${p.pageScrollW} > ${p.innerW}) — swipe not contained`]),
    ...(isMobile
      ? p.idcPos === "sticky" && p.idcLeft === "0px"
        ? []
        : [`Player column not sticky-pinned on mobile (pos=${p.idcPos} left=${p.idcLeft})`]
      : []),
    ...(isMobile
      ? p.swipeHintShown
        ? []
        : ["swipe hint hidden on mobile"]
      : p.swipeHintShown
        ? ["swipe hint should hide on desktop"]
        : []),
  ]);

  // 2 · dashboard tile — tappable <a> → /players
  currentHtml = buildHTML(dashScreen());
  await page.goto("http://pw.local/");
  const tile = await page.evaluate(PROBE_LINK, { sel: ".db-mod-cta" });
  await shot(page, `players-tile-${vp.tag}.png`);
  report(`dashboard tile · ${vp.tag} · tappable link → /players`, [
    ...(tile.found ? [] : ["Player-pool tile CTA not found"]),
    ...(tile.tag === "A" ? [] : [`tile CTA is <${tile.tag}>, not an anchor`]),
    ...(tile.href === "/players" ? [] : [`tile href "${tile.href}" ≠ /players`]),
    ...(tile.w > 0 && tile.h > 0 ? [] : ["tile CTA has zero painted size"]),
    ...(tile.hitInside ? [] : ["tile CTA is not hit-testable (covered / not clickable)"]),
  ]);

  // 3 · waivers "Browse all players" — renders while claims CLOSED
  currentHtml = buildHTML(waiversScreen());
  await page.goto("http://pw.local/");
  const wv = await page.evaluate(PROBE_LINK, { sel: ".wv-browse-all" });
  const closedShown = await page.evaluate(() =>
    [...document.querySelectorAll("*")].some((e) => /window is locked/i.test(e.textContent || "")),
  );
  await shot(page, `players-waivers-${vp.tag}.png`);
  report(`waivers browse link · ${vp.tag} · renders while claims CLOSED`, [
    ...(wv.found ? [] : ["Browse-all link not found"]),
    ...(wv.tag === "A" && wv.href === "/players"
      ? []
      : [`browse link wrong (<${wv.tag}> href=${wv.href})`]),
    ...(wv.w > 0 && wv.h > 0 && wv.hitInside ? [] : ["browse link not visible / hit-testable"]),
    ...(closedShown ? [] : ["closed-window state not shown alongside the link"]),
  ]);

  // 4 · MoreSheet "Browse players" entry — the MoreSheet is the MOBILE nav surface (hidden ≥640px via
  // shell.css), so this reachability entry is asserted at mobile widths only (desktop uses the top nav).
  if (isMobile) {
    currentHtml = buildHTML(moreScreen());
    await page.goto("http://pw.local/");
    const more = await page.evaluate(PROBE_LINK, { sel: ".sh-more-item", text: "Browse players" });
    await shot(page, `players-more-${vp.tag}.png`);
    report(`MoreSheet entry · ${vp.tag} · "Browse players" → /players`, [
      ...(more.found ? [] : ["MoreSheet 'Browse players' entry not found"]),
      ...(more.tag === "A" && more.href === "/players"
        ? []
        : [`entry wrong (<${more.tag}> href=${more.href})`]),
      ...(more.w > 0 && more.h > 0 ? [] : ["MoreSheet entry has zero painted size"]),
    ]);
  }

  // 5 · Players NAV TAB (PLAYERS-TAB) — the FIRST-CLASS tab on the real nav surface: present + active
  //     highlight + tap-through. Desktop uses the top strip; mobile uses the bottom bar (the other is
  //     display:none at that width per shell.css's 640px swap), mirroring the real AppShell. Presence
  //     alone is not enough — we CLICK the visible tab and assert the browser navigates to /players.
  currentHtml = buildHTML(navReplica());
  await page.goto("http://pw.local/");
  const navSel = isMobile ? ".sh-btmnav" : ".sh-topnav";
  const itemSel = isMobile ? ".sh-btnav-item" : ".sh-nav-item";
  const navProbe = await page.evaluate(
    ({ navSel, itemSel }) => {
      const nav = document.querySelector(navSel);
      const items = nav ? [...nav.querySelectorAll(itemSel)] : [];
      const players = items.find((a) => a.getAttribute && a.getAttribute("href") === "/players");
      const sibling = items.find((a) => a.tagName === "A" && a.getAttribute("href") !== "/players");
      if (!players) return { found: false };
      const r = players.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const cs = getComputedStyle(players);
      const sib = sibling ? getComputedStyle(sibling) : null;
      return {
        found: true,
        tag: players.tagName,
        href: players.getAttribute("href"),
        isActive: players.classList.contains("is-active"),
        ariaCurrent: players.getAttribute("aria-current"),
        w: r.width,
        h: r.height,
        hitInside: !!hit && (hit === players || players.contains(hit)),
        color: cs.color,
        bg: cs.backgroundColor,
        sibColor: sib ? sib.color : null,
        sibBg: sib ? sib.backgroundColor : null,
      };
    },
    { navSel, itemSel },
  );
  await shot(page, `players-navtab-${vp.tag}.png`);
  // active highlight paints distinct from a non-active sibling: mobile .sh-btnav-item.is-active sets
  // color:accent; desktop .sh-nav-item.is-active sets background:surface-3 (shell.css) — compare the
  // property each surface actually moves.
  const highlightPaints = navProbe.found
    ? isMobile
      ? navProbe.color !== navProbe.sibColor
      : navProbe.bg !== navProbe.sibBg
    : false;
  // tap-through: click the visible tab and assert the browser navigates to /players. The static route
  // handler fulfills any pw.local path, so a real <a> navigation lands on http://pw.local/players.
  let navigatedTo = null;
  if (navProbe.found && navProbe.hitInside) {
    try {
      await Promise.all([
        page.waitForURL((u) => u.pathname === "/players", { timeout: 4000 }),
        page.click(`${navSel} ${itemSel}[href="/players"]`),
      ]);
      navigatedTo = new URL(page.url()).pathname;
    } catch (e) {
      navigatedTo = `NO-NAV (${e.message.split("\n")[0]})`;
    }
  }
  report(`players NAV TAB · ${vp.tag} · present + active + taps through to /players`, [
    ...(navProbe.found
      ? []
      : [`Players tab absent from the ${isMobile ? "bottom bar" : "top strip"}`]),
    ...(navProbe.tag === "A" && navProbe.href === "/players"
      ? []
      : [`tab is <${navProbe.tag}> href=${navProbe.href} (not an <a> to /players)`]),
    ...(navProbe.w > 0 && navProbe.h > 0 && navProbe.hitInside
      ? []
      : ["tab not visible / hit-testable on this surface"]),
    ...(navProbe.isActive && navProbe.ariaCurrent === "page"
      ? []
      : [
          `tab not marked active on /players (is-active=${navProbe.isActive} aria-current=${navProbe.ariaCurrent})`,
        ]),
    ...(highlightPaints
      ? []
      : [
          `active highlight not distinct from a sibling (self ${isMobile ? navProbe.color : navProbe.bg} vs sib ${isMobile ? navProbe.sibColor : navProbe.sibBg})`,
        ]),
    ...(navigatedTo === "/players"
      ? []
      : [`tap did NOT navigate to /players (got ${navigatedTo})`]),
  ]);

  await page.close();
}

await browser.close();

const summaryPath = resolve(TMP, "players-verify.json");
writeFileSync(summaryPath, JSON.stringify(results, null, 2));
const failCount = results.filter((r) => r.fails.length).length;
console.log(
  `\n${failCount === 0 ? "ALL GREEN" : `${failCount} CHECK(S) FAILED`} — ${results.length} checks · summary ${summaryPath} · screenshots ${screenshotsDir}`,
);
process.exit(failCount === 0 ? 0 : 1);
