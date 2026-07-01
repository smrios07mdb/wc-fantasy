/**
 * Real-browser RENDER PROOF for the /playoffs CHOCOYO hero re-skin (feat/playoffs-chocoyo-reskin).
 *
 * THE STANDING LESSON (same as verify-pitch-layout.mjs): a source-contract smoke runs under Vitest + jsdom,
 * which has no layout/paint engine, so it can be green while the screen ships WRONG — the old .po-parrot
 * glyph "passed" its smoke and shipped INVISIBLE. This is that gap closed for the hero: it mounts a FAITHFUL
 * replica of the Chocoyo hero — the SAME class names + the SAME pure-SVG machete + the trophy <img> the real
 * `components.tsx` emits (the chocoyoHero.test.ts source smoke pins the real component TO this markup, so the
 * replica can't silently drift) — with the REAL `app/styles/ds.css` + `app/playoffs/playoffs.css` in headless
 * Chromium, serves the REAL /brand/*.png over an intercepted route, and asserts by true paint geometry that:
 *
 *   (1) THE HERO PAINTS — the trophy figure image actually LOADED (naturalWidth > 0 — not a broken/empty box),
 *       the machete SVG has a non-zero painted bbox, and the headline binds the copy ("LOWEST 2 GET THE CHOP").
 *   (2) THE BLADE DROPS — in the `is-drop` state the headline flips to "CHOP!", the machete rotates DOWN
 *       (computed `rotate` = 26deg vs the raised −14deg at rest), the doomed get the --elim strike, and under
 *       `prefers-reduced-motion: no-preference` the blade carries the one-shot `po-blade-swing` animation
 *       (while at rest it idles on `po-blade-sway`) — proving the choreography is wired, not a static class.
 *
 * Screenshots (desktop + mobile, live-raised + dropped-CHOP) are saved to /tmp and apps/web/screenshots for
 * the mockup review. OPT-IN — NOT part of `pnpm test` (that stays browser-free for CI). Run explicitly:
 *
 *     pnpm test:playoffs-hero      # or: node apps/web/scripts/verify-playoffs-hero.mjs
 *
 * Needs a Chromium binary (`npx playwright install chromium`); with none it SKIPS with exit 0.
 */
/* eslint-disable no-undef */
// PROBE() runs inside Chromium via page.evaluate(), where `document`/`getComputedStyle` are globals.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(__dir, ".."); // apps/web
const publicDir = resolve(appDir, "public");
const screenshotsDir = resolve(appDir, "screenshots");
const TMP = "/tmp";

const dsCSS = readFileSync(resolve(appDir, "app/styles/ds.css"), "utf8");
const playoffsCSS = readFileSync(resolve(appDir, "app/playoffs/playoffs.css"), "utf8");

// ── the machete SVG — byte-faithful to components.tsx <Machete> (static gradient id for the replica) ──
const MACHETE = `
<svg class="po-act-blade" viewBox="0 0 152 58" aria-hidden="true">
  <defs><linearGradient id="mchH" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#EEF1F6"/><stop offset="0.4" stop-color="#B6BFCC"/>
    <stop offset="0.56" stop-color="#8C97A8"/><stop offset="1" stop-color="#566073"/>
  </linearGradient></defs>
  <path d="M6 22 L34 23 Q40 23 40 28 L40 33 Q40 38 34 38 L6 36 Q3 35 3 31 L3 27 Q3 23 6 22 Z" fill="#4A3C2E"/>
  <rect x="6" y="24.2" width="29" height="3.2" rx="1.6" fill="#5E4B39"/>
  <circle cx="12" cy="31" r="1.5" fill="#2C241D"/><circle cx="22" cy="31" r="1.5" fill="#2C241D"/><circle cx="32" cy="31" r="1.5" fill="#2C241D"/>
  <path d="M40 23 L116 16.5 Q143.5 18 147 33 Q139 44.5 109 47.5 Q71 50.5 40 37 Z" fill="url(#mchH)" stroke="#474F5C" stroke-width="1"/>
  <path d="M46 24 Q100 20 134 26.5" stroke="#FFFFFF" stroke-width="2" opacity="0.5" fill="none" stroke-linecap="round"/>
  <path class="po-machete-edge" d="M40 37 Q71 50.5 109 47.5 Q139 44.5 147 33" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>`;

// Two provisional victims "on the block" (the desktop hero shows avatars + names, mobile shows avatars).
const VICTIMS = [
  { initials: "FR", name: "Fran" },
  { initials: "BR", name: "Bruno" },
];
const victimHtml = (withName) =>
  VICTIMS.map(
    (v) =>
      `<span class="po-victim"><span class="po-ava">${v.initials}</span>${
        withName ? `<span class="po-victim-name">${v.name}</span>` : ""
      }</span>`,
  ).join("");

const ICO_BLADE = `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 4h14v5l-14 6zM5 15l7 5"/></svg>`;

// state: "" (live/raised) or "is-drop" (blade down / CHOP!)
function desktopHero(state) {
  const dropped = state === "is-drop";
  return `
<div class="po-hero ${state}">
  <div class="po-marquee">
    <span class="po-eyebrow"><span class="po-eyebrow-dot"></span>Guillotine playoffs · Round 2 of 6</span>
    <h2 class="po-headline display">${dropped ? "CHOP!" : "LOWEST 2 GET THE CHOP"}</h2>
    <p class="po-subcopy">The Chocoyo doesn&rsquo;t miss.</p>
    <p class="po-substats"><b>8</b> still standing · <b>2</b> get chopped · <b>6</b> advance</p>
  </div>
  <div class="po-stage">
    <div class="po-act-wrap">
      <div class="po-act">
        <img class="po-act-fig" src="/brand/trophy.png" alt="">
        ${MACHETE}
        <span class="po-act-cap">Chocoyo · your executioner</span>
      </div>
      <div class="po-block">
        <span class="po-block-lab">${ICO_BLADE}${dropped ? "Guillotined" : "On the block"}</span>
        <div class="po-block-row">${victimHtml(true)}</div>
      </div>
    </div>
    <div class="po-hero-me">
      <span class="t-label">Your survival</span>
      <div class="po-hero-rankrow"><b class="po-hero-rank is-safe">6<small>of 8</small></b>
        <span class="po-hero-status is-safe">Surviving</span></div>
      <div class="po-hero-margin is-safe"><b>+4</b> pts clear of the blade — Fran is first out</div>
      <span class="t-micro text-tertiary">57 pts this round · group seed #6</span>
    </div>
  </div>
</div>`;
}

function mobileHero(state) {
  const dropped = state === "is-drop";
  return `
<div class="mpo" style="max-width:402px;margin:0 auto">
  <div class="mpo-head">
    <div class="mpo-hero ${state}">
      <div class="mpo-hero-top">
        <div class="mpo-hero-act"><img class="po-act-fig" src="/brand/trophy.png" alt="">${MACHETE}</div>
        <div class="mpo-hero-copy">
          <span class="po-eyebrow"><span class="po-eyebrow-dot"></span>Guillotine · R2/6</span>
          <h2 class="mpo-headline display">${dropped ? "CHOP!" : "LOWEST 2 GET THE CHOP"}</h2>
          <span class="mpo-hero-sub">The Chocoyo doesn&rsquo;t miss · 8 standing · 6 advance</span>
        </div>
      </div>
      <div class="mpo-hero-block">
        <span class="po-block-lab">${ICO_BLADE}${dropped ? "Guillotined" : "On the block"}</span>
        <div class="po-block-row">${victimHtml(false)}</div>
      </div>
    </div>
    <div class="mpo-myband">
      <div class="mpo-my-rank"><span class="t-label">You</span><b class="is-safe">6<small>/8</small></b></div>
      <div class="mpo-my-mid"><span class="mpo-my-status is-safe">Surviving</span>
        <span class="t-micro text-tertiary">+4 clear of the blade</span></div>
      <div class="mpo-my-pts"><b class="mono">57</b><span class="t-micro text-tertiary">pts</span></div>
    </div>
  </div>
</div>`;
}

// The complete-arm CHAMPION endgame (the hero owns it in-place). Desktop uses .po-champ/.po-champ-name;
// mobile reuses .mpo-hero with the is-champion class (must read celebratory win/accent, NOT the cut-red).
// A not-me champion ("Marlon") keeps the copy simple. This is the .is-dropped rest-state path where the
// reduced-motion + tonal bugs hid — the two reasons this coverage exists.
function championHero(_state, surface) {
  if (surface === "mobile") {
    return `
<div class="mpo" style="max-width:402px;margin:0 auto">
  <div class="mpo-head">
    <div class="mpo-hero is-champion is-dropped">
      <div class="mpo-hero-top">
        <div class="mpo-hero-act"><img class="po-act-fig" src="/brand/trophy.png" alt="">${MACHETE}</div>
        <div class="mpo-hero-copy">
          <span class="po-eyebrow"><span class="po-eyebrow-dot"></span>Guillotine complete</span>
          <h2 class="mpo-headline display">Marlon wins</h2>
          <span class="mpo-hero-sub">The guillotine is done — one left standing.</span>
        </div>
      </div>
    </div>
    <div class="mpo-myband"><div class="mpo-my-rank"><span class="t-label">You</span><b class="is-safe">1<small>/8</small></b></div></div>
  </div>
</div>`;
  }
  return `
<div class="po-hero is-champion is-dropped">
  <div class="po-champ">
    <div class="po-act"><img class="po-act-fig" src="/brand/trophy.png" alt="">${MACHETE}</div>
    <div class="po-champ-copy">
      <span class="po-eyebrow"><span class="po-eyebrow-dot"></span>Guillotine complete</span>
      <h2 class="po-champ-name display">Marlon — champion</h2>
      <p class="po-subcopy">The Chocoyo is sated — every round cut, one left standing.</p>
      <p class="po-substats">Tournament complete · <b>6</b> rounds survived</p>
    </div>
  </div>
</div>`;
}

function buildHTML(body) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${dsCSS}</style><style>${playoffsCSS}</style>
<style>body{margin:0;background:var(--surface-0);padding:18px}</style></head>
<body class="antialiased">
<div data-theme="dark" data-accent="cobalt" data-density="comfortable">
${body}
</div>
</body></html>`;
}

// ── the paint probe (runs in Chromium) ──
const PROBE = (sel) => {
  const round = (n) => Math.round(n);
  const rect = (el) => {
    const b = el.getBoundingClientRect();
    return { w: round(b.width), h: round(b.height) };
  };
  const hero = document.querySelector(sel);
  const fig = hero.querySelector(".po-act-fig");
  const blade = hero.querySelector(".po-act-blade");
  const headline = hero.querySelector(".po-headline, .mpo-headline, .po-champ-name");
  const victimName = hero.querySelector(".po-victim-name");
  const cs = getComputedStyle(blade);
  return {
    hero: rect(hero),
    fig: { ...rect(fig), naturalWidth: fig.naturalWidth || 0, complete: !!fig.complete },
    blade: rect(blade),
    headline: (headline?.textContent || "").trim(),
    headlineColor: headline ? getComputedStyle(headline).color : "",
    figAnim: getComputedStyle(fig).animationName,
    bladeRotate: cs.rotate,
    bladeAnim: cs.animationName,
    victimStrike: victimName
      ? getComputedStyle(victimName).textDecorationLine
      : "(mobile: no name)",
  };
};

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

  const context = await browser.newContext();
  // Serve the REAL vendored brand PNGs (so the trophy figure genuinely loads — a broken box would fail (1)).
  await context.route("**/brand/**", async (route) => {
    const path = new URL(route.request().url()).pathname; // e.g. /brand/trophy.png
    try {
      route.fulfill({ path: resolve(publicDir, path.replace(/^\//, "")) });
    } catch {
      route.fulfill({ status: 404, body: "" });
    }
  });

  const failures = [];
  const shots = [];
  let currentHtml = "";
  await context.route("**/pw.local/", (route) =>
    route.fulfill({ contentType: "text/html", body: currentHtml }),
  );

  const cases = [
    { surface: "desktop", state: "", w: 1120, h: 900, build: desktopHero, sel: ".po-hero" },
    { surface: "desktop", state: "is-drop", w: 1120, h: 900, build: desktopHero, sel: ".po-hero" },
    { surface: "mobile", state: "", w: 402, h: 860, build: mobileHero, sel: ".mpo-hero" },
    { surface: "mobile", state: "is-drop", w: 402, h: 860, build: mobileHero, sel: ".mpo-hero" },
    // the complete-arm champion endgame (the .is-dropped rest path where the reduced-motion + tonal bugs hid)
    {
      surface: "desktop",
      champion: true,
      wantHeadline: "Marlon — champion",
      w: 1120,
      h: 900,
      build: championHero,
      sel: ".po-hero",
    },
    {
      surface: "mobile",
      champion: true,
      wantHeadline: "Marlon wins",
      w: 402,
      h: 860,
      build: championHero,
      sel: ".mpo-hero",
    },
  ];

  for (const motion of ["reduce", "no-preference"]) {
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: motion });
    for (const c of cases) {
      const label = `${c.surface} ${c.champion ? "champion" : c.state || "live"} [${motion}]`;
      currentHtml = buildHTML(c.build(c.state, c.surface));
      await page.setViewportSize({ width: c.w, height: c.h });
      await page.goto("http://pw.local/");
      // Wait for the trophy image to actually decode (the paint we're proving).
      await page
        .waitForFunction(
          () => {
            const img = document.querySelector(".po-act-fig");
            return img && img.complete && img.naturalWidth > 0;
          },
          { timeout: 4000 },
        )
        .catch(() => {});
      // Let the blade animation settle (swing is 0.55s) so the dropped screenshot is stable.
      await page.waitForTimeout(motion === "reduce" ? 120 : 620);
      const d = await page.evaluate(PROBE, c.sel);
      const dropped = c.state === "is-drop";

      const fails = [];
      // (1) the hero paints
      if (d.hero.w <= 0 || d.hero.h <= 0)
        fails.push(`hero has zero size (${d.hero.w}×${d.hero.h})`);
      if (d.fig.naturalWidth <= 0 || !d.fig.complete)
        fails.push(
          `trophy image did NOT load (naturalWidth ${d.fig.naturalWidth}) — broken/empty box`,
        );
      if (d.fig.w <= 0 || d.fig.h <= 0)
        fails.push(`trophy figure rendered zero-size (${d.fig.w}×${d.fig.h})`);
      if (d.blade.w <= 0 || d.blade.h <= 0)
        fails.push(`machete SVG rendered zero-size (${d.blade.w}×${d.blade.h}) — did not paint`);
      const wantHeadline = c.wantHeadline ?? (dropped ? "CHOP!" : "LOWEST 2 GET THE CHOP");
      if (d.headline !== wantHeadline) fails.push(`headline "${d.headline}" ≠ "${wantHeadline}"`);

      // (2) the blade dropped — only assert state-specific facts on the reduce pass (static, deterministic).
      // Skipped for the champion endgame (settled blade, not a live cut; asserted separately in (3)).
      if (motion === "reduce" && !c.champion) {
        const rot = parseFloat(d.bladeRotate);
        if (dropped) {
          if (!(rot > 10))
            fails.push(`dropped blade rotate ${d.bladeRotate} not swung down (want ≈26deg)`);
          // Desktop renders victim NAMES (struck through in --elim); mobile renders avatars only (dimmed,
          // not a name strike), so the name-strike check only applies where a name element exists.
          if (d.victimStrike !== "(mobile: no name)" && !d.victimStrike.includes("line-through"))
            fails.push(`doomed not struck through (text-decoration-line: ${d.victimStrike})`);
        } else if (!(rot < 0)) {
          fails.push(`resting blade rotate ${d.bladeRotate} not raised (want ≈−14deg)`);
        }
      }
      // the choreography is WIRED (under no-preference the blade carries the swing/sway animation).
      // The champion blade is settled (is-dropped, not is-drop) → carries neither, so skip it.
      if (motion === "no-preference" && !c.champion) {
        const want = dropped ? "po-blade-swing" : "po-blade-sway";
        if (!d.bladeAnim.includes(want))
          fails.push(`blade animation "${d.bladeAnim}" missing "${want}" — choreography not wired`);
      }
      // (3) the CHAMPION endgame reads CELEBRATORY (not the cut-red) AND does not wobble under reduce —
      // the two regressions this champion coverage exists to pin (--elim = rgb(176, 85, 99)).
      if (c.champion) {
        if (d.headlineColor === "rgb(176, 85, 99)")
          fails.push(
            `champion headline is elimination-red ${d.headlineColor} — should be win/accent`,
          );
        if (motion === "reduce" && d.figAnim !== "none")
          fails.push(
            `champion trophy animates under reduce-motion (animation-name: ${d.figAnim}) — not gated`,
          );
      }

      if (fails.length) {
        failures.push(`FAIL [${label}]`);
        for (const f of fails) failures.push(`    ${f}`);
      } else {
        console.log(
          `  ✓ [${label}] hero ${d.hero.w}×${d.hero.h} · trophy loaded (${d.fig.naturalWidth}px) · ` +
            `machete ${d.blade.w}×${d.blade.h} · "${d.headline}" · blade ${d.bladeRotate}/${d.bladeAnim}`,
        );
      }

      // Save the mockup-review shots (clean static frames from the reduce pass).
      if (motion === "reduce") {
        const name = `playoffs-hero_${c.surface}_${c.champion ? "champion" : c.state || "live"}.png`;
        const el = await page.$(c.surface === "desktop" ? ".po-hero" : ".mpo");
        const buf = await (el ?? page).screenshot();
        for (const dir of [TMP, screenshotsDir]) writeFileSync(resolve(dir, name), buf);
        shots.push(resolve(screenshotsDir, name));
      }
    }
    await page.close();
  }

  await browser.close();

  console.log("");
  for (const s of shots) console.log(`  📸 ${s}`);
  console.log("");
  if (failures.length) {
    console.error(`✗ playoffs Chocoyo hero render proof FAILED:`);
    for (const f of failures) console.error(f);
    process.exit(1);
  }
  console.log(
    `✓ playoffs Chocoyo hero: all render checks passed (desktop + mobile, live-raised + dropped-CHOP; ` +
      `trophy image loaded, machete painted, blade swings on drop, doomed struck).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
