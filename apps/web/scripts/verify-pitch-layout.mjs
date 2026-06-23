/**
 * Real-browser layout guard for the /games/[matchId] FORMATION-GRID pitch (feat/pitch-formation-grid).
 *
 * THE STANDING LESSON: the default `pnpm test` suite runs under Vitest + jsdom, and jsdom has NO layout
 * engine — `getBoundingClientRect()` returns zeros there. So a unit test can be green while the rendered
 * pitch overflows, clips, or overlaps on a phone (exactly the failure this lane removed). `pitchRows()`
 * unit tests pin the SPLIT MATH; they cannot pin rendered GEOMETRY. This script is that geometry gate: it
 * mounts the REAL production ancestry — `<html>` (no height) → `<body class="min-h-screen">` → the route
 * layout's `<div.gd-host data-theme>` wrapper → `.sh-app` → `.sh-topbar`/`.sh-content`/`.sh-btmnav` →
 * `.gd-app` → fixed scoreboard / stake / tabs → the flex `.gd-tabwrap` → `.gd-lineups` — with the REAL
 * `ds.css` + `shell.css` + `games.css` in headless Chromium, so the pitch flex-fills (or COLLAPSES) the
 * real leftover exactly like the app, and asserts true `getBoundingClientRect()` bounds — the thing jsdom
 * structurally can't. It does NOT fabricate a definite-height root: an earlier version forced
 * `html,body{height:100%}` and skipped the wrapper, which made the chain definite no matter what and let a
 * real-phone collapse (the pitch rendering at ~0 height) sail through green. It no longer can — see the
 * NON-COLLAPSE FLOOR (a0) below, which goes RED the instant the height chain regresses.
 *
 * It is OPT-IN: NOT part of `pnpm test` (that must stay browser-free for CI). Run it explicitly:
 *
 *     pnpm test:layout            # or: node apps/web/scripts/verify-pitch-layout.mjs
 *
 * It needs a Chromium binary (`npx playwright install chromium`). If none is installed it SKIPS with
 * exit 0 (never red-flags a machine without browsers).
 *
 * For a battery of representative formations (4-3-3, 4-2-3-1 = mid 2+3, 3-5-2, 4-4-2 = flat back-4 + flat
 * mid-4, 4-5-1, 3-4-3 = flat mid-4 squeeze, 5-3-2 + 5-4-1 = the DEF-5 [3,2] splits), each seeded with a
 * REAL WORST-CASE XI (see `squad()`: every
 * player rated, ~half the outfielders subbed off, TWO-DIGIT fantasy-point pills on every token, real-length
 * names — the NED–SWE / ARG–AUT density from the MD2 screenshots) and rendered symmetric (same XI both
 * halves, away on top / home on bottom), it asserts at 360 AND 390 across a ROOMY (844) and a TIGHT (667,
 * iPhone-SE class) viewport height — so the flex-fill is exercised in both regimes, not just the roomy one
 * — and shows 1280 (desktop):
 *   (a0) the pitch does NOT collapse — on the phone viewports the tab body holds a real share of the
 *        screen (.gd-tabwrap ≥ 40% of clientH), the pitch fills it (≥ 90% of .gd-tabwrap), and clears an
 *        absolute floor ≈ 0.36·clientH (≈240px at 667). Every token has non-zero width AND height. An
 *        empty/collapsed pitch is RED. (This is the assertion the old guard lacked.)
 *   (a) the FULL pitch fits — no vertical scroll, no clip: content height ≤ the pitch box, every token
 *       within the pitch bounds, and the pitch box ≤ the viewport (one screen). Checked at BOTH heights.
 *   (b) ZERO overlap — no two tokens' effective boxes intersect, AND the rating square (left shoulder)
 *       never intersects the subbed-off/red badge (right shoulder) on the SAME token.
 *   (c) ZERO horizontal clip — no token's box exceeds the pitch / viewport width.
 *   (d) the right LINE STRUCTURE — each band renders the convention split (4-2-3-1 → MID [2,3], 3-5-2 →
 *       DEF [3] · MID [2,3], 4-4-2 → flat [4]/[4], etc.), per half.
 *   (e) NO CROSS-CENTERLINE — no away-half token's layout box reaches below the pitch vertical midpoint and
 *       no home-half token's reaches above it (the two attacking bands never collide in the centre). This is
 *       the MD2 bleed bug encoded directly; it uses getBoundingClientRect (NOT the visual clip), so it
 *       demands the FIX make tokens that genuinely FIT their half — clipping them with overflow alone is RED.
 *
 * Rendered screenshots for the mockup review are saved to /tmp at 360 × {667, 844} for 4-2-3-1, 4-4-2, 3-4-3.
 */
/* eslint-disable no-undef */
// The PROBE() callback runs inside Chromium via page.evaluate(), not Node — `document` is a browser
// global there, so no-undef is disabled for this file (it is never executed in the Node process).
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(__dir, ".."); // apps/web
const screenshotsDir = resolve(appDir, "screenshots");
const TMP = "/tmp";

const dsCSS = readFileSync(resolve(appDir, "app/styles/ds.css"), "utf8");
const gamesCSS = readFileSync(resolve(appDir, "src/games/games.css"), "utf8");
const shellCSS = readFileSync(resolve(appDir, "app/shell/shell.css"), "utf8");

const NARROW_MAX = 720; // games.css pitch breakpoint
// The pitch FLEX-FILLS the real leftover (no chrome constant), so the guard must exercise it at a
// roomy AND a tight viewport height — the tight one (667, iPhone-SE class) is where the fit is hardest.
// [width, height] pairs: phones at both heights, desktop shown at the tall height.
const VIEWPORTS = [
  [360, 844],
  [360, 667],
  [390, 844],
  [390, 667],
  [1280, 844],
];
const SHOT_WIDTH = 360; // the phone width whose 667 + 844 renders are saved to /tmp for the review

// ── faithful replica of pitchRows(players, band) (apps/web/src/games/pitchRows.ts) ──
function pitchRows(players, band) {
  const n = players.length;
  if (n === 0) return [];
  if (n <= 4) return [players.slice()];
  if (n === 5)
    return band === "DEF"
      ? [players.slice(0, 3), players.slice(3)]
      : [players.slice(0, 2), players.slice(2)];
  const lineCount = Math.ceil(n / 4);
  const base = Math.floor(n / lineCount);
  const extra = n % lineCount;
  const sizes = Array.from({ length: lineCount }, (_, i) =>
    i >= lineCount - extra ? base + 1 : base,
  );
  const out = [];
  let idx = 0;
  for (const s of sizes) {
    out.push(players.slice(idx, idx + s));
    idx += s;
  }
  return out;
}

const LANES = ["GK", "DEF", "MID", "FWD"];

/** Mirror of the component's pitchMetrics: line count + widest line for one side. */
function metrics(players) {
  const byLane = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const p of players) byLane[p.pos].push(p);
  let rows = 0;
  let cols = 0;
  for (const lane of LANES) {
    const lines = pitchRows(byLane[lane], lane);
    rows += lines.length;
    for (const l of lines) cols = Math.max(cols, l.length);
  }
  return { rows, cols, byLane };
}

// ── faithful replica of <KitToken> (GameDetailClient.tsx) ──
function tok(p) {
  const rate =
    p.rating != null
      ? `<span class="gd-tok-rate" style="background:#46A05A">${p.rating.toFixed(1)}</span>`
      : "";
  const own =
    p.own === "me"
      ? `<span class="gd-tok-own is-me">YOU</span>`
      : p.own === "rival"
        ? `<span class="gd-tok-own is-rival"></span>`
        : "";
  const status =
    p.red || p.off != null
      ? `<span class="gd-tok-status">` +
        (p.red ? `<span class="gd-rev is-red"></span>` : "") +
        (p.off != null ? `<span class="gd-rev is-off">▾${p.off}&#39;</span>` : "") +
        `</span>`
      : "";
  // FAITHFUL to <Fpts> (GameDetailClient.tsx): the chip is `gd-fpts gd-fpts-sm <tone>` (default size="sm").
  // That `gd-fpts-sm` is load-bearing for GEOMETRY — `.gd-fpts-sm b { font-size: 13px }` pins the points
  // NUMBER at a FIXED 13px on mobile, because the mobile `--shirt` rule resizes only the `.gd-fpts` SPAN,
  // not its <b>. So the real chip never shrinks with the jersey: a ~20px pill (13px number + 1px border +
  // padding) regardless of token size. An earlier replica rendered a bare `gd-fpts`, whose <b> inherited
  // the shrunk span size, so the guard measured a fake ~8px foot and never saw the pill push the token past
  // its half. Rendering the real classes is what lets this guard SEE the bleed it now asserts against.
  const tone = p.fpts < 0 ? " is-neg" : p.own === "me" ? " is-pop" : " is-muted";
  const fpts =
    p.fpts != null
      ? `<span class="gd-fpts gd-fpts-sm${tone}"><b>${p.fpts >= 0 ? "+" : ""}${p.fpts}</b><small>fpt${Math.abs(p.fpts) === 1 ? "" : "s"}</small></span>`
      : "";
  return (
    `<button class="gd-tok${p.own === "me" ? " is-me" : ""}" type="button">` +
    `<span class="gd-tok-shirt-wrap"><span class="gd-tok-shirt" style="background:#6CACE4"></span>${rate}${own}${status}</span>` +
    `<span class="gd-tok-name">${p.name}</span>` +
    `<span class="gd-tok-foot">${fpts}</span></button>`
  );
}

// ── faithful replica of <PitchHalf> / <LaneColumn> ──
function half(which, players) {
  const m = metrics(players);
  const lanes = LANES.map((lane) => {
    const lines = pitchRows(m.byLane[lane], lane);
    if (!lines.length) return "";
    const cls = `gd-pcol${lines.length > 1 ? " is-wide" : ""}`;
    const plines = lines
      .map((ln) => `<div class="gd-pline">${ln.map(tok).join("")}</div>`)
      .join("");
    return `<div class="${cls}">${plines}</div>`;
  }).join("");
  return `<div class="gd-phalf is-${which}">${lanes}</div>`;
}

// Representative .gd-app chrome (REAL classes — their heights come from the real games.css) so the pitch
// flex-fills a realistic leftover, exactly like the app. Not asserted; they exist to squeeze the pitch.
const CHROME =
  `<button class="gd-back" type="button">‹ Back</button>` +
  `<div class="gd-board"><div class="gd-board-main"><span class="gd-team-nm">Argentina</span>` +
  `<div class="gd-board-center"><span class="gd-score">2 – 1</span></div>` +
  `<span class="gd-team-nm">Austria</span></div>` +
  `<div class="gd-board-meta"><span>Group A · Matchday 3</span><span>Full time</span></div></div>` +
  `<div class="gd-stake"><span class="gd-stake-lab">YOUR XI</span><span class="gd-stake-total">+18</span></div>` +
  `<div class="gd-tabbar"><button class="gd-tabbtn is-active" type="button">Lineups</button>` +
  `<button class="gd-tabbtn" type="button">Ratings</button></div>`;

// A tall team-lists stand-in so .gd-tabwrap genuinely overflows — proving the pitch FILLS the viewport
// and the lists scroll BELOW it, rather than the lists squeezing the pitch (a literal flex:1 failure).
function tallLists() {
  let rows = "";
  for (let i = 0; i < 24; i += 1)
    rows += `<div class="gd-tl-row" style="height:34px;border-top:1px solid var(--hairline)">Player ${i + 1}</div>`;
  return `<div class="gd-tl-grid"><div class="gd-tl">${rows}</div><div class="gd-tl">${rows}</div></div>`;
}

function buildHTML(home, away) {
  const hm = metrics(home);
  const am = metrics(away);
  const rows = Math.max(hm.rows, am.rows, 1);
  const cols = Math.max(hm.cols, am.cols, 1);
  const pitch =
    `<div class="gd-pitch" style="--pitch-rows:${rows};--pitch-cols:${cols}">` +
    `<div class="gd-pitch-lines" aria-hidden="true"><span class="gd-pl-mid"></span><span class="gd-pl-circle"></span><span class="gd-pl-box gd-pl-box-l"></span><span class="gd-pl-box gd-pl-box-r"></span></div>` +
    `<div class="gd-pitch-grid">${half("home", home)}${half("away", away)}</div></div>`;
  // THE REAL ANCESTRY — this is the whole point of the hardened guard. We reproduce the production
  // chain EXACTLY, top to bottom, so the pitch flex-fills (or COLLAPSES) precisely like the app:
  //   <html>            — NO height (ds.css sets only `html,body{margin:0}`); resolves height:100%
  //                       against the viewport only if a descendant rule asks it to.
  //   <body min-h-screen> — Tailwind's `min-height:100vh` and nothing else (NO forced height:100%).
  //   <div.gd-host data-theme> — the route layout's wrapper (now class-hooked). Whether THIS gets a
  //                       definite height is what makes or breaks the chain — and it only does so via
  //                       games.css's own `:has(.gd-host){height:100%}` fix. Remove that fix and the
  //                       non-collapse floor below goes RED, exactly as it does on a real phone.
  //   .sh-app → .sh-topbar(hidden <640) + .sh-content(flex:1 scroll) + .sh-btmnav(fixed) → .gd-app →
  //   chrome rows + .gd-tabwrap(flex:1, container-type:size) → .gd-lineups(pitch=100cqh; lists below).
  // The EARLIER guard fabricated a definite root (`html,body{height:100%}`) and skipped the wrapper —
  // so the chain could never go indefinite and the collapse was invisible. It no longer is.
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>${dsCSS}</style><style>${shellCSS}</style><style>${gamesCSS}</style>
<!-- emulate Tailwind's one load-bearing utility from the root layout's <body class="min-h-screen"> -->
<style>.min-h-screen{min-height:100vh}</style></head>
<body class="min-h-screen antialiased">
<div class="gd-host" data-theme="dark" data-accent="cobalt" data-density="comfortable">
<div class="sh-app sh-app-top"><header class="sh-topbar"></header><div class="sh-content"><div class="gd-app">
${CHROME}
<div class="gd-tabwrap"><div class="gd-lineups">
${pitch}
<div class="gd-legend"><span class="gd-lg"><span class="gd-lg-rate" style="background:#46A05A">7.0</span>Rating</span></div>
${tallLists()}
</div></div>
</div></div><nav class="sh-btmnav"></nav></div>
</div>
</body></html>`;
}

// ── fixtures ──
function P(pos, name, opts = {}) {
  return {
    pos,
    name,
    rating: opts.rating ?? 7.0,
    fpts: opts.fpts ?? 2,
    off: opts.off ?? null,
    red: opts.red ?? false,
    own: opts.own ?? null,
  };
}

// Real surnames + real-length tokens, so the chip/name widths match a live XI, not "Defender 1".
const SURNAMES = [
  "van Dijk",
  "Dumfries",
  "Aké",
  "Geertruida",
  "Reijnders",
  "Schouten",
  "Koopmeiners",
  "Simons",
  "Gakpo",
  "Frimpong",
  "Gravenberch",
  "Depay",
  "Malen",
  "Weghorst",
  "Bergwijn",
];
// Always TWO-DIGIT fantasy points (mixed sign) — the wide `+18 fpts` / `-13 fpts` pills from the real
// MD2 sheets. The 2-digit width never wraps (nowrap), but the 13px-pinned number is what made the pill
// tall enough to bleed; the values here keep that pill present on every token.
const TWO_DIGIT = [12, -10, 18, 14, -13, 21, 11, -16, 19, 13, 17, -11, 22];

/**
 * Build an XI for a formation as the REAL WORST CASE from the MD2 screenshots (NED–SWE, ARG–AUT): EVERY
 * player carries a rating, ~HALF the outfielders are subbed off (▾min badge), fantasy points are TWO-DIGIT
 * pills on every token, names are real-length, and two starters are owned (YOU + a rival). This is the
 * density that pushed the full token — jersey + name + the 13px-pinned points pill — past its 50% half and
 * bled across the halfway line. It replaces the old idealized fixture (light badges, single-digit points);
 * the line STRUCTURE per band is unchanged, so the structure check (d) still pins the formation split.
 */
function squad(def, mid, fwd) {
  const players = [P("GK", "Verbruggen", { rating: 6.9, fpts: 10 })];
  let k = 0;
  const add = (pos, count) => {
    for (let i = 0; i < count; i += 1) {
      players.push(
        P(pos, SURNAMES[k % SURNAMES.length], {
          rating: Math.round(64 + ((k * 7) % 30)) / 10, // 6.4..9.3, EVERY player rated
          fpts: TWO_DIGIT[k % TWO_DIGIT.length], // always two-digit, mixed sign
        }),
      );
      k += 1;
    }
  };
  add("DEF", def);
  add("MID", mid);
  add("FWD", fwd);
  // ~HALF the outfielders subbed off — the heavy-subs case (every other outfielder gets a ▾min badge).
  const outfield = players.filter((p) => p.pos !== "GK");
  for (let i = 0; i < outfield.length; i += 2) outfield[i].off = 52 + ((i * 6) % 38);
  // keep the rating-vs-sub overlap case explicit on a midfielder (rated AND subbed off — both shoulders).
  const midIdx = players.findIndex((p) => p.pos === "MID");
  if (midIdx >= 0) {
    players[midIdx].off = 63;
    players[midIdx].rating = 7.6;
  }
  // one red card on a DIFFERENT player than any sub-off (a sent-off man is not also subbed) — otherwise the
  // status pill would carry red + ▾min and (legitimately) collide with the rating square on the DESKTOP token,
  // a separate axis from the mobile bleed under test. The last defender is rated + red, never subbed.
  const redIdx = players
    .map((p, i) => (p.pos === "DEF" ? i : -1))
    .filter((i) => i >= 0)
    .pop();
  if (redIdx != null && redIdx >= 0) {
    players[redIdx].red = true;
    players[redIdx].off = null;
  }
  const fwdIdx = players.findIndex((p) => p.pos === "FWD");
  if (fwdIdx >= 0) {
    players[fwdIdx].own = "me";
    players[fwdIdx].name = "Gravenberch";
    players[fwdIdx].rating = 8.4;
    players[fwdIdx].fpts = 24;
  }
  players[players.length - 1].own = "rival";
  return players;
}

const FORMATIONS = {
  "4-3-3": { def: 4, mid: 3, fwd: 3, lines: { DEF: [4], MID: [3], FWD: [3] } },
  "4-2-3-1": { def: 4, mid: 5, fwd: 1, lines: { DEF: [4], MID: [2, 3], FWD: [1] } },
  "3-5-2": { def: 3, mid: 5, fwd: 2, lines: { DEF: [3], MID: [2, 3], FWD: [2] } },
  "4-4-2": { def: 4, mid: 4, fwd: 2, lines: { DEF: [4], MID: [4], FWD: [2] } },
  "4-5-1": { def: 4, mid: 5, fwd: 1, lines: { DEF: [4], MID: [2, 3], FWD: [1] } },
  "3-4-3": { def: 3, mid: 4, fwd: 3, lines: { DEF: [3], MID: [4], FWD: [3] } },
  // DEF-5 shapes (real GROUP_FORMATIONS, src/lineup/view.ts) — the back-5 splits [3,2] (deeper line first),
  // so the wing-back pair [2] lands toward the centre. Same rows=5 max as the MID-5 forms, but the only
  // shapes that render the DEF-5 split near the halfway line — so they exercise (e) on a band the others miss.
  "5-3-2": { def: 5, mid: 3, fwd: 2, lines: { DEF: [3, 2], MID: [3], FWD: [2] } },
  "5-4-1": { def: 5, mid: 4, fwd: 1, lines: { DEF: [3, 2], MID: [4], FWD: [1] } },
};
const SHOT_FORMATIONS = ["4-2-3-1", "4-4-2", "3-4-3"]; // saved to /tmp for the mockup review

// ── geometry probe (runs in Chromium) ──
const PROBE = () => {
  const round = (n) => Math.round(n);
  const rectOf = (el) => {
    const b = el.getBoundingClientRect();
    return { l: round(b.left), r: round(b.right), t: round(b.top), b: round(b.bottom) };
  };
  const union = (rects) => ({
    l: Math.min(...rects.map((x) => x.l)),
    r: Math.max(...rects.map((x) => x.r)),
    t: Math.min(...rects.map((x) => x.t)),
    b: Math.max(...rects.map((x) => x.b)),
  });
  const pitchEl = document.querySelector(".gd-pitch");
  const pitch = rectOf(pitchEl);
  const tabwrapEl = document.querySelector(".gd-tabwrap");
  const tokens = [...document.querySelectorAll(".gd-tok")].map((t) => {
    const tokRect = rectOf(t);
    const rateEl = t.querySelector(".gd-tok-rate");
    const statusEl = t.querySelector(".gd-tok-status");
    const ownEl = t.querySelector(".gd-tok-own");
    // The fpts PILL itself is in the bbox, not just the (height-pinned) .gd-tok-foot box around it. The pill
    // is the element whose 13px-pinned points number historically overflowed the foot and bled past the
    // halfway line. Because .gd-tok-foot has a fixed height and the token is a flex COLUMN sized to its
    // items' main sizes, a re-pinned pill grows BELOW the foot without growing the .gd-tok rect — so unless
    // its own rect is unioned in, the centerline / vertical-bounds / horizontal-clip checks would miss
    // exactly the regression class this guard exists to catch (a future revert of the b{font-size:inherit}).
    const fptsEl = t.querySelector(".gd-fpts");
    const parts = [rateEl, statusEl, ownEl, fptsEl].filter(Boolean).map(rectOf);
    const phalf = t.closest(".gd-phalf");
    return {
      name: (t.querySelector(".gd-tok-name").textContent || "").trim(),
      // which half this token belongs to — the centerline assertion needs it (away renders on TOP of the
      // vertical pitch, home on the BOTTOM; neither may cross the halfway line into the other's slice).
      half: phalf && phalf.classList.contains("is-away") ? "away" : "home",
      tok: tokRect,
      rate: rateEl ? rectOf(rateEl) : null,
      status: statusEl ? rectOf(statusEl) : null,
      bbox: union([tokRect, ...parts]),
    };
  });
  // line structure, in DOM order (GK, DEF, MID, FWD) per half
  const halves = [...document.querySelectorAll(".gd-phalf")].map((ph) => ({
    which: ph.classList.contains("is-home") ? "home" : "away",
    lanes: [...ph.querySelectorAll(".gd-pcol")].map((pc) =>
      [...pc.querySelectorAll(".gd-pline")].map((pl) => pl.querySelectorAll(".gd-tok").length),
    ),
  }));
  return {
    clientW: document.documentElement.clientWidth,
    clientH: document.documentElement.clientHeight,
    pitch,
    pitchScrollH: pitchEl.scrollHeight,
    pitchClientH: pitchEl.clientHeight,
    tabwrapH: tabwrapEl ? round(tabwrapEl.getBoundingClientRect().height) : -1,
    tokens,
    halves,
  };
};

/** Overlap by > tol px in BOTH axes (touching / 1px rounding is not an overlap). */
function overlaps(a, b, tol = 1) {
  const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l);
  const oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
  return ox > tol && oy > tol;
}

function check(label, narrow, formationName, data) {
  const fails = [];
  const { pitch, tokens, halves } = data;
  const expectedLanes = (() => {
    const f = FORMATIONS[formationName].lines;
    return [[1], f.DEF, f.MID, f.FWD]; // GK is always one line
  })();

  // (a0) NON-COLLAPSE FLOOR — the regression THIS hardening exists to catch. On a real phone the height
  // chain went indefinite and the pitch collapsed to ~0 while every other check still passed. Three
  // independent floors make an empty/collapsed pitch unambiguously RED (only checked on the phone
  // viewports, where the pitch is cqh-driven; desktop uses a fixed 516px pitch):
  //   • the tab body got a real share of the screen (catches the height chain going indefinite at .sh-app),
  //   • the pitch fills that tab body (catches a pitch-specific `100cqh` collapse), and
  //   • an absolute floor ≈ 0.36·clientH (≈240px at 667) — the concrete tight-viewport floor.
  if (narrow) {
    if (data.tabwrapH < 0.4 * data.clientH) {
      fails.push(
        `tab body collapsed: .gd-tabwrap ${data.tabwrapH}px < 40% of the ${data.clientH}px screen (height chain went indefinite)`,
      );
    }
    if (data.tabwrapH > 0 && data.pitchClientH < 0.9 * data.tabwrapH) {
      fails.push(
        `pitch underfills its tab body: ${data.pitchClientH}px < 90% of .gd-tabwrap ${data.tabwrapH}px (100cqh did not resolve)`,
      );
    }
    const floor = Math.round(0.36 * data.clientH);
    if (data.pitchClientH < floor) {
      fails.push(
        `pitch ${data.pitchClientH}px below the non-collapse floor ${floor}px (0.36×${data.clientH}) — collapsed/empty pitch`,
      );
    }
  }
  // (a1) every token has real, non-zero width AND height (a zero-sized token = a vanished pitch)
  for (const t of tokens) {
    const w = t.tok.r - t.tok.l;
    const h = t.tok.b - t.tok.t;
    if (w <= 0 || h <= 0) {
      fails.push(`token "${t.name}" has zero size (${w}×${h}px) — pitch did not render`);
      break;
    }
  }

  // (a) no vertical scroll / clip + fits one screen
  if (narrow && data.pitchClientH > data.clientH + 1) {
    fails.push(`pitch ${data.pitchClientH}px taller than the ${data.clientH}px screen`);
  }
  if (data.pitchScrollH > data.pitchClientH + 2) {
    fails.push(
      `pitch content overflows its box (scrollH ${data.pitchScrollH} > clientH ${data.pitchClientH})`,
    );
  }
  for (const t of tokens) {
    if (t.bbox.t < pitch.t - 1 || t.bbox.b > pitch.b + 1) {
      fails.push(
        `token "${t.name}" outside pitch vertically (${t.bbox.t}..${t.bbox.b} vs ${pitch.t}..${pitch.b})`,
      );
      break;
    }
  }

  // (e) NO CROSS-CENTERLINE — the MD2 bleed bug, encoded directly. On the vertical mobile pitch the away
  // half renders on TOP (own goal at the screen top, attack toward the centre) and the home half on the
  // BOTTOM; the halfway line is the pitch's vertical midpoint. A token whose LAYOUT box (getBoundingClientRect,
  // which ignores any overflow:hidden clip) extends past that midline into the other team's slice is exactly
  // the overlap Sergio saw — two attacking bands colliding in the centre. So: no away token's box may reach
  // BELOW the midpoint, and no home token's may reach ABOVE it. Phone-only (desktop splits left/right, not
  // top/bottom, and is fixed-height). This goes RED on the shipped CSS with the dense fixture and is the
  // assertion the fix must turn green by SIZING (smaller tokens that fit), not by clipping.
  if (narrow) {
    const mid = (pitch.t + pitch.b) / 2;
    for (const t of tokens) {
      if (t.half === "away" && t.bbox.b > mid + 1) {
        fails.push(
          `away-half token "${t.name}" crosses the halfway line (box bottom ${t.bbox.b} > midpoint ${Math.round(mid)})`,
        );
        break;
      }
    }
    for (const t of tokens) {
      if (t.half === "home" && t.bbox.t < mid - 1) {
        fails.push(
          `home-half token "${t.name}" crosses the halfway line (box top ${t.bbox.t} < midpoint ${Math.round(mid)})`,
        );
        break;
      }
    }
  }

  // (c) no horizontal clip (pitch clips via overflow:hidden; also never past the viewport)
  for (const t of tokens) {
    if (
      t.bbox.l < pitch.l - 1 ||
      t.bbox.r > pitch.r + 1 ||
      t.bbox.l < 0 ||
      t.bbox.r > data.clientW + 1
    ) {
      fails.push(
        `token "${t.name}" clips horizontally (${t.bbox.l}..${t.bbox.r} vs pitch ${pitch.l}..${pitch.r})`,
      );
      break;
    }
  }

  // (b) rating vs subbed-off/red badge on the SAME token
  for (const t of tokens) {
    if (t.rate && t.status && overlaps(t.rate, t.status)) {
      fails.push(
        `token "${t.name}": rating square overlaps the sub/red badge (rate ${t.rate.l}..${t.rate.r}, status ${t.status.l}..${t.status.r})`,
      );
      break;
    }
  }
  // (b) any two tokens' effective boxes
  outer: for (let i = 0; i < tokens.length; i += 1) {
    for (let j = i + 1; j < tokens.length; j += 1) {
      if (overlaps(tokens[i].bbox, tokens[j].bbox)) {
        fails.push(`tokens overlap: "${tokens[i].name}" ∩ "${tokens[j].name}"`);
        break outer;
      }
    }
  }

  // (d) line structure per half
  for (const h of halves) {
    const got = JSON.stringify(h.lanes);
    const want = JSON.stringify(expectedLanes);
    if (got !== want) fails.push(`${h.which} half structure ${got} ≠ expected ${want}`);
  }

  return fails;
}

async function main() {
  mkdirSync(screenshotsDir, { recursive: true });
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    const msg = String(err && err.message);
    if (/Executable doesn't exist|playwright install|Failed to launch/i.test(msg)) {
      console.log("⏭ SKIP — no Chromium binary. Install with: npx playwright install chromium");
      process.exit(0);
    }
    throw err;
  }

  const tmpHtml = resolve(screenshotsDir, "_tmp_pitch.html");
  const failures = [];
  let passed = 0;

  for (const formationName of Object.keys(FORMATIONS)) {
    const f = FORMATIONS[formationName];
    const xi = squad(f.def, f.mid, f.fwd);
    writeFileSync(tmpHtml, buildHTML(xi, xi)); // symmetric: same XI both halves
    for (const [width, height] of VIEWPORTS) {
      const narrow = width <= NARROW_MAX;
      const page = await browser.newPage();
      await page.setViewportSize({ width, height });
      await page.goto(`file://${tmpHtml}`);
      await page.waitForTimeout(120);
      const data = await page.evaluate(PROBE);
      const label = `${formationName} @ ${width}×${height} ${narrow ? "(phone)" : "(desktop)"}`;
      const fails = check(label, narrow, formationName, data);
      if (fails.length) {
        failures.push(`FAIL [${label}]`);
        for (const f2 of fails) failures.push(`    ${f2}`);
      } else {
        passed += 1;
        console.log(
          `  ✓ [${label}] pitch ${data.pitchClientH}px — fits, no overlap, no clip, structure OK`,
        );
      }
      // Save the review screenshots at BOTH heights (chrome + pitch in context = the real fold).
      if (width === SHOT_WIDTH && SHOT_FORMATIONS.includes(formationName)) {
        const out = resolve(TMP, `pitch_${formationName}_${width}x${height}.png`);
        await page.screenshot({ path: out });
        console.log(`    📸 ${out}`);
      }
      await page.close();
    }
  }

  await browser.close();

  console.log("");
  if (failures.length) {
    console.error(`✗ pitch layout guard: ${passed} passed, FAILURES below`);
    for (const f of failures) console.error(f);
    process.exit(1);
  }
  console.log(
    `✓ pitch layout guard: all ${passed} render checks passed (360 & 390 @ 667 + 844, 1280; 8 formations, ` +
      `real worst-case dense XI; no token crosses the halfway line).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
