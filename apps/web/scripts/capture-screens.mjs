/**
 * capture-screens.mjs — read-only prod-capture harness for the Claude Design feed (manifest Pass 2).
 *
 * Extends the verify-*.mjs real-browser pattern (Playwright chromium at 360/390/1440) with an INJECTED
 * authenticated session so gated identity surfaces render with real data. It navigates and screenshots
 * ONLY — no clicks on action controls, no form fills, no submits, no POSTs. Nothing mutates the live
 * league; the session is loaded from captures/.auth/state.json (produced once by capture-login.mjs).
 *
 * READ-ONLY FENCE (hard):
 *   - Per surface the harness does exactly: newContext(storageState) → page.goto → page.screenshot.
 *   - No .click()/.fill()/.press()/.check() and no request interception that could POST.
 *   - Write-dependent states (save/error toasts, placed bids, freeze) are NOT produced here — they
 *     salvage from design_reference/ or wait for the calendar (manifest §7b). This harness never
 *     performs a write to reach a state.
 *   - Session-expiry guard: if a gated route bounces to /sign-in or /auth/denied, the run FAILS loudly
 *     rather than saving a mislabeled signed-out screenshot.
 *
 * Output: captures/<route>__<state>__<viewport>.png  (deterministic names) + an INDEX.md row each.
 *
 *   Run:  node apps/web/scripts/capture-screens.mjs [surfaceKey…] [--base=https://host] [--no-auth]
 *         (no surfaceKey → every ACTIVE surface below; --no-auth → only the signed-out set,
 *          captured in a FRESH no-state context where landing on /sign-in is the target, not a bounce)
 */
/* eslint-disable no-undef */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const capturesDir = resolve(repoRoot, "captures");
const statePath = resolve(capturesDir, ".auth", "state.json");
const indexPath = resolve(capturesDir, "INDEX.md");
mkdirSync(capturesDir, { recursive: true });

// ── Viewports ─────────────────────────────────────────────────────────────────────────────────
// Two mobile widths (touch/mobile context, matching the verify harness) + one desktop.
const VIEWPORTS = {
  "mobile-360": { width: 360, height: 800, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  "mobile-390": { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  "desktop-1440": {
    width: 1440,
    height: 900,
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1,
  },
};

// ── Surface manifest ────────────────────────────────────────────────────────────────────────────
// Wave 1 (manifest §6): every state below is reachable by pure goto — default renders plus the
// query-param deep-links the app itself supports (/vsfield ?period=/?manager=, games/[matchId]).
// Click-gated states (NationFilter expanded, BidComposer, drill-in sheets, tab toggles, /lineup
// period tabs — client onClick only, no ?period= read) are NOT captured: the read-only fence
// forbids clicks. They defer to Wave 2+ or the fixture decision, like write-dependent states.
//
// The baked ids below were discovered read-only from the live app's own rendered links/RSC payload
// (2026-07-06): MD1 period id + rival manager id from /vsfield, match ids from the match strips.
const GROUP_MD1_PERIOD = "67f4a84f-a966-4655-bdd8-f84d8bb83386"; // "MD1" — group-phase deep-link
const RIVAL_MANAGER = "cf538d48-addb-47ea-a291-57bcb539e95c"; // NOT the viewer (viewer=1f7cbbf2…)
const KO_MATCH = "743423ed-f9c6-4d6f-8665-d5b6b7f44ef8"; // completed R16 match
const GROUP_MATCH = "4358860e-e4b3-489c-8b13-0014d282804b"; // completed MD1 group match

const ALL_VPS = ["mobile-360", "mobile-390", "desktop-1440"];
const SURFACES = [
  {
    key: "lineup",
    active: true,
    route: "/lineup",
    state: "pitch-populated", // playoff XI · 7 starters, pitch + bench (manifest §2 default render)
    phase: "knockout",
    viewports: ALL_VPS,
    source: "live",
    fullPage: true,
  },
  // /lineup group-phase historical snapshot: PeriodTabs are client onClick only (components.tsx:525)
  // and the page reads no ?period= — NOT goto-reachable. Deferred; /vsfield?period= carries the
  // group-phase variant for Wave 1.
  {
    key: "vsfield",
    active: true,
    route: "/vsfield",
    state: "cut-ladder", // The Cut cockpit: KOYouBand + KoLadder + KOFallen (manifest §2 default)
    phase: "knockout",
    viewports: ALL_VPS,
    source: "live",
    fullPage: true,
    suppressCeremony: true, // fresh contexts look like new devices → first-open latch would fire
  },
  {
    key: "vsfield-h2h",
    active: true,
    route: `/vsfield?manager=${RIVAL_MANAGER}`,
    state: "h2h-compare", // H2H vs a rival via the ?manager= deep-link (desktop cockpit compare)
    phase: "knockout",
    viewports: ALL_VPS,
    source: "live",
    fullPage: true,
    suppressCeremony: true,
  },
  {
    key: "vsfield-ceremony",
    active: true,
    route: "/vsfield",
    state: "ko-ceremony", // the one-shot cut takeover (manifest §2) — an UNSEEDED context fires the
    phase: "knockout", //     first-open latch deterministically; that's the capture, not a bug
    viewports: ["mobile-390", "desktop-1440"],
    source: "live",
    fullPage: false, // the takeover is a viewport overlay; full-page height adds nothing
    settleMs: 1500, // let the entrance animation finish
  },
  {
    key: "vsfield-group",
    active: true,
    route: `/vsfield?period=${GROUP_MD1_PERIOD}`,
    state: "group-cockpit", // T11 historical group cockpit: leaderboard rail + XI pitches (§2)
    phase: "group",
    viewports: ALL_VPS,
    source: "live",
    fullPage: true,
  },
  {
    key: "players",
    active: true,
    route: "/players",
    state: "pool-table", // PlKit crest stat-table incl. eliminated "· out" rows + OwnerChips (§2)
    phase: "knockout",
    viewports: ALL_VPS,
    source: "live",
    fullPage: true,
  },
  {
    key: "games-ko",
    active: true,
    route: `/games/${KO_MATCH}?from=vsfield`,
    state: "lineups-pitch", // F-D08 box-score identity surface: kit-jersey formation pitch (§2)
    phase: "knockout",
    viewports: ALL_VPS,
    source: "live",
    fullPage: true,
  },
  {
    key: "games-group",
    active: true,
    route: `/games/${GROUP_MATCH}?from=vsfield`,
    state: "lineups-pitch", // same surface on a completed group match — group-phase variant
    phase: "group",
    viewports: ALL_VPS,
    source: "live",
    fullPage: true,
  },
  {
    key: "waivers",
    active: true,
    route: "/waivers",
    state: "claims-rails", // Claims tab + FAAB rails: the KitChip no-jersey contrast surface (§2)
    phase: "knockout",
    viewports: ALL_VPS,
    source: "live",
    fullPage: true,
  },
  {
    key: "draft",
    active: true,
    route: "/draft",
    state: "board-complete", // DRAFT COMPLETE Board+RosterPanel — the D4(a) bespoke-grid surface
    phase: "post-draft",
    viewports: ALL_VPS,
    source: "live",
    fullPage: true,
  },
  {
    key: "pool",
    active: true,
    route: "/pool",
    state: "bracket-flags", // KO bracket frame + resolved fixture flag cards (§2 default)
    phase: "knockout",
    viewports: ALL_VPS,
    source: "live",
    fullPage: true,
  },
  // ── Wave 1.5 — authed default/reachable states (manifest §6 remainder) ──────────────────────────
  // Standings Cumulative tab and the playoffs board↔ladder toggle read NO searchParams (client
  // onClick only) → DEFERRED. /commish DOES honor a read-only ?tab= (app/commish/page.tsx:33) but
  // Wave 1.5 scope is the default tab only; non-default tabs defer by scope, not by fence.
  {
    key: "dashboard",
    active: true,
    route: "/",
    state: "hub-live", // authed `/` = Dashboard hub (selectLandingView `ok`), CURRENT live phase
    phase: "knockout",
    viewports: ALL_VPS,
    source: "live",
    fullPage: true,
  },
  {
    key: "standings",
    active: true,
    route: "/standings",
    state: "matchday-tab", // default tab; Cumulative is client-onClick → deferred
    phase: "knockout",
    viewports: ALL_VPS,
    source: "live",
    fullPage: true,
  },
  {
    key: "playoffs",
    active: true,
    route: "/playoffs",
    state: "theater-default", // Chocoyo theater hero, current round
    phase: "knockout",
    viewports: ALL_VPS,
    source: "live",
    fullPage: true,
    suppressCeremony: true, // fresh context = new device; keep the latch quiet here too
  },
  {
    key: "scoring",
    active: true,
    route: "/scoring",
    state: "rulebook", // trust surface — F-D12 rebrand copy sweep input
    phase: "knockout",
    viewports: ALL_VPS,
    source: "live",
    fullPage: true,
  },
  {
    key: "settings",
    active: true,
    route: "/settings",
    state: "profile", // profile/preferences (display-name rename surface)
    phase: "knockout",
    viewports: ALL_VPS,
    source: "live",
    fullPage: true,
  },
  {
    key: "commish",
    active: true,
    route: "/commish",
    state: "console-default", // commissioner console, default tab (?tab= exists but deferred)
    phase: "knockout",
    viewports: ALL_VPS,
    source: "live",
    fullPage: true,
  },
  // ── Wave 1.5 — signed-out set (fresh context, NO storageState) ─────────────────────────────────
  // noAuth INVERTS the session guard: these render in a no-state context, and the landed pathname
  // must equal the requested route (a bounce = mislabeled capture = loud failure). The sign-in
  // "check your email" confirmation is post-submit (a fill) → deferred.
  {
    key: "public-landing",
    active: true,
    route: "/",
    state: "marketing-landing", // signed-out `/` (selectLandingView signed-out branch)
    phase: "n/a",
    viewports: ALL_VPS,
    source: "live",
    fullPage: true,
    noAuth: true,
  },
  {
    key: "public-signin",
    active: true,
    route: "/sign-in",
    state: "request-view", // magic-link REQUEST view only
    phase: "n/a",
    viewports: ALL_VPS,
    source: "live",
    fullPage: true,
    noAuth: true,
  },
  {
    key: "public-denied",
    active: true,
    route: "/auth/denied",
    state: "denied", // dual-cause denied screen — direct goto renders it
    phase: "n/a",
    viewports: ALL_VPS,
    source: "live",
    fullPage: true,
    noAuth: true,
  },
];

function baseUrl() {
  const arg = process.argv.find((a) => a.startsWith("--base="));
  return (
    arg ? arg.split("=")[1] : process.env.CAPTURE_BASE_URL || "https://wc-fantasy-web.onrender.com"
  ).replace(/\/$/, "");
}

function selectedKeys() {
  const keys = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  return keys.length ? keys : null;
}

// --no-auth → run ONLY the signed-out (noAuth) surfaces; no session file required.
const noAuthOnly = process.argv.includes("--no-auth");

const captured = []; // { route, state, viewport, source, phase, file }
const failures = [];

async function captureSurface(base, storageState, surface) {
  for (const vp of surface.viewports) {
    const viewportCfg = VIEWPORTS[vp];
    const ctx = await browser.newContext({
      // noAuth surfaces get a FRESH no-state context (authed `/` renders the Dashboard, not the
      // landing); everything else gets the injected authenticated session (read-only either way).
      ...(surface.noAuth ? {} : { storageState }),
      viewport: { width: viewportCfg.width, height: viewportCfg.height },
      isMobile: viewportCfg.isMobile,
      hasTouch: viewportCfg.hasTouch,
      deviceScaleFactor: viewportCfg.deviceScaleFactor,
    });
    // KOCeremony first-open latch: every capture context is a fresh "device", so the one-shot cut
    // takeover would fire over every /vsfield knockout shot. Suppression is CLIENT-LOCAL ONLY — a
    // getItem shim that answers the latch's own `xi:seenCut:*` keys (seenCeremony.ts KEY SCHEME) as
    // already-seen. No server state is touched; the dedicated ko-ceremony surface omits the flag so
    // the takeover itself is captured deliberately.
    if (surface.suppressCeremony) {
      await ctx.addInitScript(() => {
        const orig = Storage.prototype.getItem;
        Storage.prototype.getItem = function (k) {
          if (typeof k === "string" && k.startsWith("xi:seenCut:")) return "1";
          return orig.call(this, k);
        };
      });
    }
    const page = await ctx.newPage();
    const target = `${base}${surface.route}`;
    await page.goto(target, { waitUntil: "networkidle", timeout: 45000 });

    // Session-expiry / gate guard — never save a signed-out screen mislabeled as the surface.
    // INVERTED for noAuth surfaces: /sign-in and /auth/denied ARE the targets there; instead the
    // landed pathname must equal the requested route (a bounce = mislabeled capture = failure).
    const landed = page.url();
    if (surface.noAuth) {
      const wantPath = new URL(`${base}${surface.route}`).pathname;
      const gotPath = new URL(landed).pathname;
      if (gotPath !== wantPath) {
        failures.push(
          `${surface.key} [${vp}]: expected ${wantPath}, landed on ${gotPath} — signed-out render bounced.`,
        );
        await ctx.close();
        continue;
      }
    } else if (/\/sign-in/.test(landed) || /\/auth\/denied/.test(landed)) {
      failures.push(
        `${surface.key} [${vp}]: gated route bounced to ${landed} — session missing/expired. Re-run capture-login.mjs.`,
      );
      await ctx.close();
      continue;
    }

    // Settle late layout (kit tokens, flags — or the ceremony's entrance animation) before the shot.
    await page.waitForTimeout(surface.settleMs ?? 600);

    const file = `${surface.key}__${surface.state}__${vp}.png`;
    await page.screenshot({ path: resolve(capturesDir, file), fullPage: !!surface.fullPage });
    captured.push({
      route: surface.route,
      state: surface.state,
      viewport: vp,
      source: surface.source,
      phase: surface.phase,
      file,
    });
    console.log(`  ✓ ${file}`);
    await ctx.close();
  }
}

// browser is module-scoped so captureSurface can reach it after launch.
let browser;

function writeIndex() {
  const rows = captured.map(
    (c) =>
      `| \`${c.route}\` | ${c.state} | ${c.viewport} | ${c.source} | ${c.phase} | \`${c.file}\` |`,
  );

  // MERGE, never clobber: an existing INDEX.md keeps its header, prior rows, and everything after
  // the table (the "Reading notes for Claude Design" section). New rows replace a same-file row
  // in place or append after the last table row.
  if (existsSync(indexPath)) {
    const lines = readFileSync(indexPath, "utf8").split("\n");
    const sepIdx = lines.findIndex((l) => /^\|\s*---/.test(l));
    if (sepIdx !== -1) {
      let end = sepIdx + 1;
      while (end < lines.length && lines[end].startsWith("|")) end++;
      const existing = lines.slice(sepIdx + 1, end);
      const fileOf = (row) => (row.match(/`([^`]+\.png)`/) || [])[1];
      const merged = existing.map((row) => {
        const f = fileOf(row);
        const replacement = rows.find((r) => fileOf(r) === f);
        return replacement ?? row;
      });
      for (const r of rows) if (!merged.some((row) => fileOf(row) === fileOf(r))) merged.push(r);
      writeFileSync(
        indexPath,
        [...lines.slice(0, sepIdx + 1), ...merged, ...lines.slice(end)].join("\n"),
        "utf8",
      );
      console.log(`  · INDEX.md → merged ${rows.length} row(s) into ${merged.length}-row table`);
      return;
    }
  }

  const header = [
    "# captures/ — INDEX",
    "",
    "Read-only prod captures for the Claude Design feed (manifest `audit/CAPTURE_MANIFEST_screens.md`).",
    "Real live-league identities (Sergio waived synthetic; participants consented). Generated by",
    "`apps/web/scripts/capture-screens.mjs` against an injected authenticated session — navigate +",
    "screenshot only, no writes.",
    "",
    "| Route | State | Viewport | Source | Phase | File |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  writeFileSync(indexPath, header.concat(rows, "").join("\n"), "utf8");
  console.log(`  · INDEX.md → ${captured.length} row(s)`);
}

async function main() {
  const base = baseUrl();
  const only = selectedKeys();
  const surfaces = SURFACES.filter(
    (s) => s.active && (!only || only.includes(s.key)) && (!noAuthOnly || s.noAuth),
  );

  // The session is required only when an AUTHED surface is selected — the signed-out set runs
  // in a no-state context and must not demand (or touch) the blessed session.
  let storageState = null;
  if (surfaces.some((s) => !s.noAuth)) {
    if (!existsSync(statePath)) {
      console.log(`FAILED: no session at ${statePath}.`);
      console.log("Run the one-time bootstrap first:  node apps/web/scripts/capture-login.mjs");
      process.exit(1);
    }
    storageState = JSON.parse(readFileSync(statePath, "utf8"));
    // An empty/authless state file means the login bootstrap saved a signed-out context (seen once:
    // a URL-probe race against the streamed client-side gate redirect). Fail before burning a run.
    if (!(storageState.cookies || []).some((c) => /^sb-.+-auth-token/.test(c.name))) {
      console.log(
        `FAILED: session at ${statePath} has no Supabase auth cookie (signed-out state).`,
      );
      console.log("Re-run the bootstrap:  node apps/web/scripts/capture-login.mjs");
      process.exit(1);
    }
  }

  if (!surfaces.length) {
    console.log("No active surfaces selected — nothing to capture.");
    process.exit(0);
  }

  let chromium;
  try {
    ({ chromium } = await import("@playwright/test"));
  } catch {
    console.log(
      "FAILED: playwright not installed (run from apps/web where @playwright/test resolves).",
    );
    process.exit(1);
  }

  browser = await chromium.launch({ headless: true });
  console.log(`capture target: ${base}  ·  ${surfaces.length} surface(s)`);
  for (const surface of surfaces) {
    console.log(`${surface.route} (${surface.state}):`);
    await captureSurface(base, storageState, surface);
  }
  await browser.close();

  writeIndex();

  console.log("");
  if (failures.length) {
    console.log(`FAILED — ${failures.length} issue(s):`);
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(`ALL GREEN — ${captured.length} capture(s) · ${capturesDir}`);
}

await main();
