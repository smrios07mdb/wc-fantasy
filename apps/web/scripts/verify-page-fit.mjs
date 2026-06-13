/**
 * Per-page mobile-fit verification (Prompt 41) — `/lineup` pitch + `/pool` leaderboard.
 *
 * Prompt 40 fixed the shell/nav and added a document-level `overflow-x: hidden` backstop in
 * ds.css. That backstop makes `documentElement.scrollWidth <= clientWidth` PASS even when content
 * overflows inside a nested container (the table/pitch is clipped, not reflowed). So this script
 * asserts ELEMENT BOUNDS instead: every element's `getBoundingClientRect()` must satisfy
 * `left >= -1` and `right <= clientWidth + 1`. getBoundingClientRect reports true geometry even
 * under `overflow: hidden`, so it catches the clipped/nested overflow the document check misses.
 *
 * The pages are reproduced as self-contained HTML (faithful `.sl-*` / `.pl-*` markup) with the
 * REAL ds.css + lineup.css / pool.css inlined — no Next.js server required. The lineup harness
 * fields a 4-5-1 (a 5-wide MID lane, the worst case) with long opponent nations; the pool harness
 * uses long team names + email-address fallbacks (the real blow-out source).
 *
 * Run:  node apps/web/scripts/verify-page-fit.mjs
 * Screenshots → apps/web/screenshots/fit_<width>_<page>.png
 */

/* eslint-disable no-undef */
// page.evaluate() callbacks run in Chromium, not Node — document/getComputedStyle are browser
// globals; the no-undef rule false-positives here.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(__dir, "..");
const repoRoot = resolve(appDir, "../..");
const screenshotsDir = resolve(appDir, "screenshots");

const dsCSS = readFileSync(resolve(appDir, "app/styles/ds.css"), "utf8");
const lineupCSS = readFileSync(resolve(appDir, "app/lineup/lineup.css"), "utf8");
const poolCSS = readFileSync(resolve(repoRoot, "apps/web/src/pool/pool.css"), "utf8");

const PHONE_WIDTHS = [320, 375, 390, 414];

// ── shared page chrome ────────────────────────────────────────────────────────
function doc(title, css, bodyAttrs, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${title}</title>
  <style>${dsCSS}</style>
  <style>${css}</style>
</head>
<body ${bodyAttrs}>
${body}
</body>
</html>`;
}

// ── /lineup harness ────────────────────────────────────────────────────────────
function avatar(pos, initials, flag) {
  return `<span class="avatar avatar-sm player-avatar pos-${pos}" aria-label="x">${initials}<span class="pa-flag" aria-hidden="true">${flag}</span></span>`;
}

function pitchToken(pos, name, ko, opp, oppFlag, locked) {
  const kind = locked ? "is-locked" : "is-movable";
  const lock = locked
    ? `<svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true"></svg>`
    : "";
  return `<button type="button" class="sl-tok st-idle ${kind}" disabled>
    <span class="sl-tok-top">${avatar(pos, "FS", oppFlag)}${lock}</span>
    <span class="sl-tok-name">${name}</span>
    <span class="sl-tok-ko">${ko}</span>
    <span class="sl-tok-opp t-micro text-tertiary">vs ${oppFlag} ${opp}</span>
  </button>`;
}

function lane(pos, n, opp, oppFlag) {
  const toks = Array.from({ length: n }, (_, i) =>
    pitchToken(pos, `F. Mbappé${i}`, "Sat 14:00", opp, oppFlag, false),
  ).join("\n");
  return `<div class="sl-lane sl-lane-${pos}">${toks}</div>`;
}

function periodTab(label, active, upcoming) {
  return `<button type="button" role="tab" class="tab ${active ? "is-active" : ""}">${label}${
    upcoming ? '<span class="sl-tab-sub t-micro">upcoming</span>' : ""
  }</button>`;
}

function formationTab(f, active) {
  return `<button type="button" role="tab" class="tab mono ${active ? "is-active" : ""}">${f}</button>`;
}

function benchRow(name, ko, opp, oppFlag) {
  return `<button type="button" class="sl-bench-row st-idle is-movable">
    ${avatar("MID", "FS", oppFlag)}
    <span class="sl-bench-name">${name}</span>
    <span class="sl-bench-ko">${ko}</span>
    <span class="sl-bench-opp t-micro text-tertiary">vs ${oppFlag} ${opp}</span>
    <span class="pill pill-ytp sl-locktag-mini">Movable</span>
  </button>`;
}

function lineupHTML() {
  const periods = [
    periodTab("Group MD1", true, false),
    periodTab("Group MD2", false, true),
    periodTab("Group MD3", false, true),
    periodTab("Round of 32", false, true),
    periodTab("Round of 16", false, true),
    periodTab("Quarter-final", false, true),
    periodTab("Semi-final", false, true),
    periodTab("Final", false, true),
  ].join("\n");

  const formations = ["3-4-3", "3-5-2", "4-3-3", "4-4-2", "4-5-1", "5-3-2", "5-4-1"]
    .map((f) => formationTab(f, f === "4-5-1"))
    .join("\n");

  // 4-5-1: GK1 / DEF4 / MID5 (worst-case lane width) / FWD1
  const lanes = [
    lane("FWD", 1, "Saudi Arabia", "🇸🇦"),
    lane("MID", 5, "Saudi Arabia", "🇸🇦"),
    lane("DEF", 4, "Saudi Arabia", "🇸🇦"),
    lane("GK", 1, "Saudi Arabia", "🇸🇦"),
  ].join("\n");

  const bench = [
    benchRow("F. Verylongsurname", "Sun 20:00", "United States", "🇺🇸"),
    benchRow("A. Anotherlongname", "Sun 20:00", "South Korea", "🇰🇷"),
  ].join("\n");

  const body = `
<div class="sl-app">
  <div class="sl-screen">
    <header class="sl-topbar between">
      <div class="sl-topbar-id"><h1 class="t-h2">Set lineup</h1><span class="t-sm text-tertiary">Test Manager</span></div>
      <div class="tabs sl-period-tabs" role="tablist">${periods}</div>
    </header>

    <div class="sl-hero card">
      <div class="sl-hero-formation"><span class="t-label text-tertiary">Formation</span><span class="t-h2 mono">4-5-1</span></div>
      <div class="sl-hero-stats">
        <div class="sl-hero-stat"><span class="sl-hero-num">9</span><span class="t-caption text-tertiary">movable</span></div>
        <div class="sl-hero-stat"><span class="sl-hero-num sl-hero-num-locked">2</span><span class="t-caption text-tertiary">locked</span></div>
      </div>
      <div class="sl-hero-saved"><span class="pill pill-ytp">Unsaved changes</span></div>
    </div>

    <div class="sl-formation" role="group" aria-label="Formation">
      <span class="t-label text-tertiary sl-formation-label">Formation</span>
      <div class="tabs sl-formation-tabs" role="tablist">${formations}</div>
    </div>

    <div class="sl-body">
      <section class="sl-pitchcol">
        <div class="sl-pitch">
          <div class="sl-pitch-lines" aria-hidden="true">
            <span class="sl-pl-box sl-pl-box-top"></span>
            <span class="sl-pl-goal sl-pl-goal-top"></span>
            <span class="sl-pl-mid"></span>
            <span class="sl-pl-circle"></span>
            <span class="sl-pl-box sl-pl-box-bot"></span>
            <span class="sl-pl-goal sl-pl-goal-bot"></span>
          </div>
          <div class="sl-pitch-lanes">${lanes}</div>
        </div>
        <div class="sl-legend t-caption text-tertiary">
          <span><span class="sl-dot sl-dot-movable"></span> Movable — still swappable</span>
          <span><span class="sl-dot sl-dot-locked"></span> Locked — has played, frozen</span>
        </div>
      </section>
      <aside class="sl-rail">
        <p class="sl-hint t-sm">Pick a formation above to reshape your XI, then tap a movable player and a teammate to swap.</p>
        <div class="sl-bench card">
          <div class="sl-bench-head between"><span class="t-label">Bench</span><span class="t-caption text-tertiary">2 reserves</span></div>
          <div class="sl-bench-list">${bench}</div>
        </div>
      </aside>
    </div>

    <div class="sl-savebar between">
      <span class="sl-savebar-reason t-sm text-tertiary">Lineup is legal — ready to save.</span>
      <button type="button" class="btn btn-primary">Save lineup</button>
    </div>
  </div>
</div>`;
  return doc("Set lineup — fit verify", lineupCSS, "", body);
}

// ── /pool harness ──────────────────────────────────────────────────────────────
function poolRow(rank, name, played, correct, points, me) {
  return `<tr class="${me ? "row-me" : ""}">
    <td class="mono">${rank}</td>
    <td><b>${name}</b></td>
    <td class="num mono">${played}</td>
    <td class="num mono">${correct}</td>
    <td class="num mono">${points}</td>
  </tr>`;
}

function poolHTML() {
  // Long team names + email-address fallbacks — the documented blow-out source.
  const rows = [
    poolRow(1, "You", 12, 9, 27, true),
    poolRow(2, "averylongteamname.manager@example-domain.co.uk", 12, 8, 24, false),
    poolRow(3, "The Unstoppable Galácticos United FC XI", 12, 7, 21, false),
    poolRow(4, "anotherreallylongemailaddress@somemailprovider.com", 12, 6, 18, false),
    poolRow(5, "Bob", 12, 5, 15, false),
  ].join("\n");

  const body = `
<div class="pl-app" data-density="comfortable">
  <div class="pl-tabs">
    <button class="pl-tab">My picks</button>
    <button class="pl-tab is-active">Leaderboard</button>
  </div>
  <div class="pl-board-page">
    <div class="pl-board-head"><span class="t-h2">Leaderboard</span><span class="t-sm text-tertiary">5 managers</span></div>
    <table class="dtable pl-board">
      <thead><tr>
        <th style="width:36px">#</th>
        <th>Manager</th>
        <th class="num">Played</th>
        <th class="num">Correct</th>
        <th class="num">Points</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>`;
  return doc("Pool leaderboard — fit verify", poolCSS, 'data-density="comfortable"', body);
}

// ── element-bounds probe ───────────────────────────────────────────────────────
const PROBE = () => {
  const cw = document.documentElement.clientWidth;
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue; // skip non-rendered
    if (r.right > cw + 1 || r.left < -1) {
      out.push({
        sel:
          el.tagName.toLowerCase() +
          (el.className && typeof el.className === "string"
            ? "." + el.className.trim().split(/\s+/).join(".")
            : ""),
        left: Math.round(r.left),
        right: Math.round(r.right),
        cw,
        text: (el.textContent || "").trim().slice(0, 28),
      });
    }
  }
  return out;
};

const PAGES = [
  { id: "lineup", html: lineupHTML() },
  { id: "pool", html: poolHTML() },
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const failures = [];
  let passed = 0;

  for (const { id, html } of PAGES) {
    const tmp = resolve(screenshotsDir, `_tmp_fit_${id}.html`);
    writeFileSync(tmp, html);
    for (const width of PHONE_WIDTHS) {
      const page = await browser.newPage();
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`file://${tmp}`);
      await page.waitForTimeout(120);

      const label = `${width}px/${id}`;
      const offenders = await page.evaluate(PROBE);
      if (offenders.length > 0) {
        failures.push(`FAIL [${label}] ${offenders.length} element(s) past viewport:`);
        for (const o of offenders.slice(0, 8)) {
          failures.push(
            `        ${o.sel}  left=${o.left} right=${o.right} (cw=${o.cw})  "${o.text}"`,
          );
        }
      } else {
        passed++;
        console.log(`  ✓ [${label}] all elements within [${-1}, clientWidth+1]`);
      }

      await page.screenshot({
        path: resolve(screenshotsDir, `fit_${width}_${id}.png`),
        fullPage: true,
      });
      await page.close();
    }
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }

  await browser.close();

  console.log(`\n── Results ─────────────────────────────────────`);
  console.log(`  Passed: ${passed} / ${PAGES.length * PHONE_WIDTHS.length}`);
  if (failures.length > 0) {
    console.error("\nFailures:");
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`\n✅  All elements fit the viewport at ${PHONE_WIDTHS.join("/")}px.`);
  console.log(`   Screenshots → apps/web/screenshots/fit_<width>_<page>.png`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
