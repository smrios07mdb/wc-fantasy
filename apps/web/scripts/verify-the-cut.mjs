/**
 * Real-browser RENDER PROOF for The Cut — the unified knockout surface on /vsfield (T15-CUT).
 *
 * Same standing lesson as verify-playoffs-hero.mjs: jsdom has no layout/paint engine, so only a real
 * browser can prove the screen. This mounts a FAITHFUL replica of the knockout surface — the SAME
 * class names + the SAME machete SVG + the trophy <img> the real KnockoutUI.tsx emits (the
 * theCutSkin.test.ts source smoke pins the real components TO these markers, so the replica can't
 * silently drift) — with the REAL app/styles/ds.css + app/vsfield/{vsfield,knockout}.css +
 * app/shell/shell.css in headless Chromium, serves the REAL /brand/trophy.png, and asserts by true
 * paint geometry across the FOUR knockout viewer states × phone widths 360/390/430 + desktop 1180:
 *
 *   a — live round, viewer SURVIVING   · cobalt YOU band, marquee loom, cut line between the rows
 *   b — viewer ON THE BLOCK           · danger band + Damocles; the marquee loom must YIELD
 *   c — viewer ELIMINATED, spectating · locked/slate band, fallen auto-relevant, struck rows
 *   e — CHAMPION endgame              · champion hero + medals; no cut line
 *   f — round locked, pend (bonus)    · ytp band, "THE BLADE DROPS SOON", no fabricated clock
 *
 * Asserted invariants (the port's contract):
 *   (1) paints: trophy image decodes; the machete SVG has a painted bbox; headline copy binds.
 *   (2) BLADE DISCIPLINE: exactly ONE .ko-mach machete per screen (loom XOR Damocles XOR rest).
 *   (3) YOU-band tone = state (accent/danger/ytp/locked) — color + icon + WORD, never color alone.
 *   (4) the cut line sits between last-safe and first-on-the-block by real geometry.
 *   (5) fallen rows are struck-through with the "cut in RXX" tag.
 *   (6) ≥44px ladder tap targets; NO horizontal overflow at 360 (F-P3-K2); content clears the
 *       fixed bottom nav (safe-area contract).
 *   (7) ceremony aftermath: Eliminated! stamps land, the victims row WRAPS (F-P3-K4), and the FAAB
 *       line reads the carry-forward truth — "carries over", NEVER "resets" (the excluded P1 copy).
 *   (8) choreography wiring: loom/Damocles/trophy animations present under no-preference, none
 *       under reduce (transform-only; class-driven opacity).
 *
 * Screenshots land in /tmp + apps/web/screenshots for review. OPT-IN — not part of `pnpm test`:
 *
 *     pnpm test:the-cut      # or: node apps/web/scripts/verify-the-cut.mjs
 *
 * Needs a Chromium binary (`npx playwright install chromium`); with none it SKIPS with exit 0.
 */
/* eslint-disable no-undef */
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(__dir, "..");
const publicDir = resolve(appDir, "public");
const screenshotsDir = resolve(appDir, "screenshots");
const TMP = "/tmp";

const dsCSS = readFileSync(resolve(appDir, "app/styles/ds.css"), "utf8");
const vsfieldCSS = readFileSync(resolve(appDir, "app/vsfield/vsfield.css"), "utf8");
const knockoutCSS = readFileSync(resolve(appDir, "app/vsfield/knockout.css"), "utf8");
const shellCSS = readFileSync(resolve(appDir, "app/shell/shell.css"), "utf8");

/* ── the ONE machete silhouette — byte-faithful to MacheteGlyph.tsx ── */
const MACHETE = (cls) => `
<svg class="ko-mach ${cls}" viewBox="0 0 120 44" aria-hidden="true">
  <rect x="1" y="25" width="26" height="12" rx="5" fill="#6B4A2E"></rect>
  <rect x="9" y="25" width="3" height="12" fill="#57391F"></rect>
  <rect x="16" y="25" width="3" height="12" fill="#57391F"></rect>
  <path d="M26 26 C48 21 84 15 116 5 C119 11 117 23 100 32 C82 41 52 41 26 40 Z" fill="#C4525F"></path>
  <path d="M26 23 C48 18 84 12 116 2 C119 8 117 20 100 29 C82 38 52 38 26 37 Z" fill="#93A2BC"></path>
  <path d="M32 26 C52 22 82 17 106 9" stroke="rgba(255,255,255,.4)" stroke-width="2.5" fill="none" stroke-linecap="round"></path>
</svg>`;
const BLADE_MINI = `
<svg class="ko-blade" viewBox="0 0 120 44" aria-hidden="true">
  <rect x="1" y="25" width="26" height="12" rx="5" fill="#6B4A2E"></rect>
  <path d="M26 26 C48 21 84 15 116 5 C119 11 117 23 100 32 C82 41 52 41 26 40 Z" fill="var(--elim)"></path>
  <path d="M26 23 C48 18 84 12 116 2 C119 8 117 20 100 29 C82 38 52 38 26 37 Z" fill="#93A2BC"></path>
</svg>`;

/* ── replica pieces (class names pinned to KnockoutUI.tsx by theCutSkin.test.ts) ── */
const marquee = ({ pend = false, loom = true }) => `
<div class="ko-marq">
  ${loom ? MACHETE("loom") : ""}
  <img class="ko-trophy" src="/brand/trophy.png" alt="">
  <div class="ko-marq-tx">
    <div class="t">${pend ? "THE BLADE DROPS SOON" : "LOWEST 2 GET THE CHOP"}</div>
    <div class="s">${pend ? "Full time · official after stat corrections" : "10 standing · 8 advance · cut at full time"}</div>
  </div>
  <a class="ko-theater" href="/playoffs">Theater ›</a>
</div>`;

const youband = ({ variant, icon, a, b, n1, n2, pts = null, damocles = false }) => `
<div class="ko-you is-${variant} ko-you-mob">
  ${damocles ? MACHETE("damocles") : ""}
  <span class="ko-you-ic" aria-hidden="true">${icon}</span>
  <div class="ko-you-tx"><b>${a}</b><span>${b}</span></div>
  <div class="ko-you-num"><b class="mono">${n1}</b><span>${n2}</span></div>
  ${pts !== null ? `<div class="ko-you-pts mono">${pts}<span>pts</span></div>` : ""}
</div>`;

const shapeStrip = `
<div class="ko-shape">
  <span class="ko-shape-chip mono">7+2 · 1 GK + 6 outfield</span>
  <span class="ko-shape-tx">Knockout squads run reduced — lock-on-play still applies</span>
  <a class="ko-shape-cta" href="/lineup">Set lineup ›</a>
</div>`;

const cutline = `
<div class="ko-cut">
  <span class="beam"></span>
  <span class="chip">${BLADE_MINI}CUT LINE · LOWEST 2</span>
  <span class="beam r"></span>
</div>`;

const NAMES = [
  "Marlon",
  "Wilmer",
  "Chocoyo",
  "Cesar",
  "Alvaro",
  "Denis",
  "Sebastian",
  "Yader",
  "Armando",
  "Fran",
];
const initials = (n) => n.slice(0, 2).toUpperCase();

function maRow({ name, rank, pts, me = false, block = false, wl = "" }) {
  const sub = block
    ? `<span class="ko-blocksub">${BLADE_MINI} on the block · 3 to play</span>`
    : `<span class="ma-ytptag">3 to play</span>`;
  const right = me
    ? `<span class="da-lb-wld-self">you</span>`
    : wl
      ? `<span class="ma-row-wld ${wl[0]}">${wl}</span>`
      : "";
  return `
<div class="ko-rowwrap">
  <button type="button" class="ma-row${me ? " is-me" : ""}${block ? " is-block" : ""}">
    <span class="ma-row-rk mono">${rank}</span>
    <span class="vf-ava${me ? " is-me" : ""}">${initials(name)}</span>
    <span class="ma-row-name"><b>${me ? "You" : name}</b><span class="ma-row-sub">${sub}</span></span>
    <span class="ma-row-right"><span class="ma-row-pts mono">${pts}</span>${right}</span>
  </button>
</div>`;
}

function ladder({ meIdx = 3, meOnBlock = false, medals = false }) {
  const rows = NAMES.map((name, i) => {
    const rank = i + 1;
    const block = i >= 8 || (meOnBlock && i === meIdx);
    return maRow({
      name,
      rank,
      pts: 100 - i * 4,
      me: i === meIdx,
      block: !medals && block,
      wl: i === meIdx ? "" : i % 2 ? `W +${16 - i}` : `L −${12 - i}`,
    });
  });
  rows.splice(8, 0, medals ? "" : cutline);
  return `<div class="ma-list">${rows.join("")}</div>`;
}

const fallen = ({ open, viewerFallen = false }) => `
<div class="ko-fallen">
  <button type="button" class="ko-fallen-hd"><span class="arr">${open ? "▾" : "▸"}</span><span>THE FALLEN (4)</span><span class="ln"></span></button>
  ${
    open
      ? `
  <button type="button" class="ko-dead${viewerFallen ? " is-me" : ""}">
    <span class="vf-ava${viewerFallen ? " is-me" : ""}">CE</span>
    <span class="ko-dead-name">${viewerFallen ? "You" : "Cesar"}</span>
    <span class="ko-dead-pts mono">57</span>
    <span class="ko-dead-tag">cut in R32</span>
    <span class="ko-dead-chev">›</span>
  </button>
  <div class="ko-fallen-sum mono">Group stage — Norlan · Bismarck</div>`
      : ""
  }
</div>`;

const champion = `
<div class="ko-champ">
  ${MACHETE("rest")}
  <img src="/brand/trophy.png" alt="">
  <div class="ey">CHAMPION</div>
  <div class="who">Marlon</div>
  <div class="ln"><b>96 pts</b> in the Final · outlasted the whole field over 5 rounds</div>
</div>`;

const medalRow = `
<div class="ko-rowwrap ko-medal-row">
  <span class="ko-medal c">CHAMPION</span>
  ${maRow({ name: "Marlon", rank: 1, pts: 96 })}
</div>
<div class="ko-rowwrap ko-medal-row">
  <span class="ko-medal r">RUNNER-UP</span>
  ${maRow({ name: "Wilmer", rank: 2, pts: 89 })}
</div>
<div class="ko-rowwrap ko-final-cut">
  <div class="ko-ghost"><span class="ma-row-rk mono">3</span><span class="vf-ava">CH</span><span class="ko-ghost-name">Chocoyo</span><span class="ko-dead-tag">cut in Final</span><span class="ko-ghost-pts mono">84</span></div>
</div>`;

const ceremony = (phase) => `
<div class="koc is-${phase}">
  <div class="koc-inner">
    <div class="koc-eyebrow">R32 · RESULTS OFFICIAL</div>
    <div class="koc-head">${phase === "aftermath" ? "THE BLADE HAS FALLEN" : "LOWEST 2 GET THE CHOP"}</div>
    <div class="koc-sub">${phase === "aftermath" ? "8 advance to the next round" : "The Chocoyo doesn’t miss."}</div>
    <div class="koc-mech">${MACHETE("koc-mach")}<img class="koc-trophy" src="/brand/trophy.png" alt=""><span class="koc-slash"></span></div>
    <div class="koc-victims">
      ${["Armando", "Fran", "Norlan", "Bismarck", "Denis"]
        .map(
          (n) => `
      <div class="koc-victim${phase === "aftermath" ? " is-out" : ""}">
        <span class="koc-blood"></span><span class="vf-ava">${initials(n)}</span>
        <span class="koc-stamp">Eliminated!</span><b class="koc-vname">${n}</b><span class="koc-vpts mono">63 pts</span>
      </div>`,
        )
        .join("")}
    </div>
    ${
      phase === "aftermath"
        ? `<div class="koc-verdict">
      <span class="koc-verdict-safe">✓ You survive — 4th of 10 · +16 clear</span>
      <span class="koc-faab">Your FAAB carries over — <a href="/waivers">reinforce via waivers</a></span>
    </div>`
        : ""
    }
    <div class="koc-actions"><button type="button" class="btn btn-primary btn-sm">Back to the ladder</button></div>
  </div>
</div>`;

/* ── screen assemblies (mobile ma-scroll tree inside the shell chrome) ── */
function mobileScreen(inner, { withNav = true } = {}) {
  return `
<div class="sh-app sh-app-top">
  <div class="sh-content">
    <div class="vf-app">
      <div class="vf-top"><div class="vf-status"><b class="display vf-brand-title">The Cut</b>
        <span class="t-micro text-tertiary">ROUND OF 32 · GUILLOTINE</span></div></div>
      <div class="ma-scroll">${inner}</div>
    </div>
  </div>
  ${withNav ? `<nav class="sh-btmnav"><a class="sh-btnav-item is-active"><span>The Cut<span class="sh-nav-dotlive"></span></span></a></nav>` : ""}
</div>`;
}
function desktopScreen(railInner) {
  return `
<div class="vf-app">
  <div class="vf-top"><div class="vf-status"><b class="display vf-brand-title">The Cut</b>
    <span class="t-micro text-tertiary">ROUND OF 32 · GUILLOTINE</span></div></div>
  ${marquee({})}
  <div class="da-body"><div class="da-lb">${railInner}</div><div class="da-main"><div class="da-scroll"></div></div></div>
</div>`;
}

const STATES = {
  a: () =>
    mobileScreen(
      marquee({}) +
        youband({
          variant: "safe",
          icon: "✓",
          a: "Surviving · 4th of 10",
          b: "Tap a row to compare",
          n1: "+16",
          n2: "clear of the blade",
          pts: 79,
        }) +
        shapeStrip +
        ladder({ meIdx: 3 }) +
        fallen({ open: false }),
    ),
  b: () =>
    mobileScreen(
      marquee({ loom: false }) +
        youband({
          variant: "block",
          icon: "⚠",
          a: "ON THE BLOCK · 9th of 10",
          b: "Need 5 pts — 4 still to play",
          n1: "−4",
          n2: "behind the blade",
          pts: 57,
          damocles: true,
        }) +
        shapeStrip +
        ladder({ meIdx: 8, meOnBlock: true }) +
        fallen({ open: false }),
    ),
  c: () =>
    mobileScreen(
      marquee({}) +
        youband({
          variant: "out",
          icon: "✗",
          a: "Cut in the Round of 32",
          b: "Spectating — rows still open",
          n1: "10",
          n2: "still standing",
        }) +
        shapeStrip +
        ladder({ meIdx: 5 }) +
        fallen({ open: true, viewerFallen: true }),
    ),
  e: () =>
    mobileScreen(
      champion +
        youband({
          variant: "out",
          icon: "✗",
          a: "Cut in the Round of 16",
          b: "Placement = round survived, then pts",
          n1: "7th",
          n2: "of 12 overall",
        }) +
        `<div class="ma-list">${medalRow}</div>` +
        fallen({ open: true, viewerFallen: true }),
    ),
  f: () =>
    mobileScreen(
      marquee({ pend: true }) +
        youband({
          variant: "pend",
          icon: "⏳",
          a: "Provisionally safe · 4th of 10",
          b: "Order can move on stat corrections",
          n1: "+16",
          n2: "clear at full time",
          pts: 79,
        }) +
        shapeStrip +
        ladder({ meIdx: 3 }) +
        fallen({ open: false }),
    ),
};

function buildHTML(body) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${dsCSS}</style><style>${vsfieldCSS}</style><style>${knockoutCSS}</style><style>${shellCSS}</style>
<style>body{margin:0;background:var(--surface-0)}</style></head>
<body class="antialiased"><div data-theme="dark" data-accent="cobalt" data-density="comfortable">
${body}
</div></body></html>`;
}

/* ── in-page probe ── */
const PROBE = () => {
  const q = (sel) => document.querySelector(sel);
  const qa = (sel) => [...document.querySelectorAll(sel)];
  const rect = (el) => (el ? el.getBoundingClientRect() : null);
  const machetes = qa("svg.ko-mach").map((el) => {
    const r = el.getBoundingClientRect();
    return { cls: el.getAttribute("class"), w: r.width, h: r.height };
  });
  const trophy = q(".ko-trophy, .ko-champ img, .koc-trophy");
  const you = q(".ko-you");
  const youNum = q(".ko-you-num b");
  const cut = q(".ko-cut");
  const rows = qa(".ma-row, .ko-ghost").map((el) => ({
    h: el.getBoundingClientRect().height,
    top: el.getBoundingClientRect().top + (document.scrollingElement?.scrollTop ?? 0),
    block: el.className.includes("is-block"),
  }));
  const dead = q(".ko-dead .ko-dead-name");
  // Nav clearance is a SCROLLED-TO-BOTTOM fact: the page may extend below the fold (that's what
  // scrolling is for); the contract is that at the bottom the last content clears the FIXED nav
  // (the shell's .sh-content bottom padding). Measure there, then restore.
  const nav = q(".sh-btmnav");
  const se = document.scrollingElement;
  const prevScroll = se ? se.scrollTop : 0;
  if (se) se.scrollTop = se.scrollHeight;
  const navTopScrolled = nav ? nav.getBoundingClientRect().top : null;
  const lastContent = qa(".ko-fallen, .ma-list")
    .map((el) => el.getBoundingClientRect().bottom)
    .sort((x, y) => y - x)[0];
  if (se) se.scrollTop = prevScroll;
  const stamp = q(".koc-victim.is-out .koc-stamp");
  const victims = q(".koc-victims");
  const faab = q(".koc-faab");
  return {
    machetes,
    trophy: trophy ? { complete: trophy.complete, naturalWidth: trophy.naturalWidth } : null,
    youClass: you ? you.className : "",
    youWord: you ? (you.querySelector(".ko-you-tx b")?.textContent ?? "") : "",
    youNumColor: youNum ? getComputedStyle(youNum).color : "",
    youAnimLoom: (() => {
      const loom = q(".ko-mach.loom");
      return loom ? getComputedStyle(loom).animationName : "";
    })(),
    youAnimDamocles: (() => {
      const dam = q(".ko-mach.damocles");
      return dam ? getComputedStyle(dam).animationName : "";
    })(),
    cutRect: cut ? { top: rect(cut).top + (document.scrollingElement?.scrollTop ?? 0) } : null,
    rows,
    deadStrike: dead ? getComputedStyle(dead).textDecorationLine : "",
    deadTag: q(".ko-dead-tag")?.textContent ?? "",
    marqueeTitle: q(".ko-marq-tx .t")?.textContent ?? "",
    champWho: q(".ko-champ .who")?.textContent ?? "",
    medalC: (() => {
      const el = q(".ko-medal.c");
      return el ? { text: el.textContent, color: getComputedStyle(el).color } : null;
    })(),
    scrollW: document.scrollingElement?.scrollWidth ?? 0,
    innerW: window.innerWidth,
    navTop: navTopScrolled,
    lastContentBottom: lastContent ?? null,
    stampOpacity: stamp ? getComputedStyle(stamp).opacity : null,
    victimsWrap: victims ? getComputedStyle(victims).flexWrap : null,
    victimsRight: victims ? rect(victims).right : null,
    faabText: faab ? faab.textContent : null,
    bodyText: document.body.textContent ?? "",
  };
};

/* ── runner ── */
const results = [];
function report(label, fails) {
  if (fails.length) {
    console.error(`✗ ${label}`);
    for (const f of fails) console.error(`    - ${f}`);
  } else {
    console.log(`✓ ${label}`);
  }
  results.push({ label, fails });
}

let browser;
try {
  browser = await chromium.launch();
} catch (e) {
  console.log(
    `SKIP: no Chromium available (${e.message.split("\n")[0]}) — run: npx playwright install chromium`,
  );
  process.exit(0);
}

mkdirSync(screenshotsDir, { recursive: true });
const context = await browser.newContext({ deviceScaleFactor: 2 });
let currentHtml = "";
await context.route("**/pw.local/**", (route) => {
  const url = route.request().url();
  if (url.includes("/brand/")) {
    const file = url.split("/brand/")[1].split("?")[0];
    try {
      return route.fulfill({
        contentType: "image/png",
        body: readFileSync(resolve(publicDir, "brand", file)),
      });
    } catch {
      return route.fulfill({ status: 404, body: "" });
    }
  }
  return route.fulfill({ contentType: "text/html", body: currentHtml });
});

const MOBILE_WIDTHS = [360, 390, 430];
const stateChecks = {
  a: (d, w) => {
    const fails = [];
    if (!d.trophy?.complete || d.trophy.naturalWidth <= 0) fails.push("trophy did not decode");
    if (d.machetes.length !== 1 || !d.machetes[0].cls.includes("loom"))
      fails.push(
        `blade discipline: want exactly the loom, got [${d.machetes.map((m) => m.cls).join(", ")}]`,
      );
    if (d.machetes[0] && (d.machetes[0].w <= 0 || d.machetes[0].h <= 0))
      fails.push("machete has zero painted size");
    if (!d.youClass.includes("is-safe")) fails.push(`YOU band not is-safe (${d.youClass})`);
    if (!/Surviving/.test(d.youWord)) fails.push(`YOU word "${d.youWord}" lacks Surviving`);
    if (!/77, 141, 255/.test(d.youNumColor))
      fails.push(`safe margin not cobalt (${d.youNumColor})`);
    if (!d.cutRect) fails.push("cut line missing");
    else {
      const safeRows = d.rows.filter((r) => !r.block);
      const blockRows = d.rows.filter((r) => r.block);
      const lastSafe = Math.max(...safeRows.map((r) => r.top));
      const firstBlock = Math.min(...blockRows.map((r) => r.top));
      if (!(d.cutRect.top > lastSafe && d.cutRect.top < firstBlock))
        fails.push(
          `cut line at ${d.cutRect.top} not between last-safe ${lastSafe} and first-block ${firstBlock}`,
        );
      if (blockRows.length !== 2)
        fails.push(`expected 2 on-the-block rows, got ${blockRows.length}`);
    }
    const short = d.rows.filter((r) => r.h < 44);
    if (short.length)
      fails.push(
        `${short.length} ladder rows under 44px (min ${Math.min(...short.map((r) => r.h)).toFixed(1)})`,
      );
    if (d.scrollW > d.innerW + 1)
      fails.push(`horizontal overflow: scrollWidth ${d.scrollW} > ${d.innerW} @${w}`);
    if (d.navTop !== null && d.lastContentBottom !== null && d.lastContentBottom > d.navTop + 1)
      fails.push(
        `content bottom ${d.lastContentBottom.toFixed(0)} paints under the nav top ${d.navTop.toFixed(0)}`,
      );
    return fails;
  },
  b: (d) => {
    const fails = [];
    if (d.machetes.length !== 1 || !d.machetes[0].cls.includes("damocles"))
      fails.push(
        `blade discipline: the loom must YIELD to Damocles, got [${d.machetes.map((m) => m.cls).join(", ")}]`,
      );
    if (!d.youClass.includes("is-block")) fails.push(`YOU band not is-block (${d.youClass})`);
    if (!/ON THE BLOCK/.test(d.youWord)) fails.push("YOU word lacks ON THE BLOCK");
    if (!/229, 72, 77/.test(d.youNumColor))
      fails.push(`block margin not danger (${d.youNumColor})`);
    return fails;
  },
  c: (d) => {
    const fails = [];
    if (!d.youClass.includes("is-out")) fails.push(`YOU band not is-out (${d.youClass})`);
    if (!/Cut in the/.test(d.youWord)) fails.push("YOU word lacks the cut-round phrasing");
    if (!/126, 141, 168/.test(d.youNumColor))
      fails.push(`out number not locked-slate (${d.youNumColor})`);
    if (!d.deadStrike.includes("line-through"))
      fails.push(`fallen name not struck (${d.deadStrike})`);
    if (!/cut in R32/.test(d.deadTag)) fails.push(`fallen tag "${d.deadTag}" wrong`);
    return fails;
  },
  e: (d) => {
    const fails = [];
    if (d.champWho !== "Marlon") fails.push(`champion hero name "${d.champWho}"`);
    if (!d.trophy?.complete || d.trophy.naturalWidth <= 0)
      fails.push("champion trophy did not decode");
    if (d.machetes.length !== 1 || !d.machetes[0].cls.includes("rest"))
      fails.push(
        `blade discipline: want the resting blade only, got [${d.machetes.map((m) => m.cls).join(", ")}]`,
      );
    if (d.cutRect) fails.push("cut line must NOT render in the champion endgame");
    if (!d.medalC || d.medalC.text !== "CHAMPION") fails.push("CHAMPION medal missing");
    else if (!/47, 191, 113/.test(d.medalC.color))
      fails.push(`CHAMPION medal not win-green (${d.medalC.color}) — gold is banned`);
    return fails;
  },
  f: (d) => {
    const fails = [];
    if (!d.youClass.includes("is-pend")) fails.push(`YOU band not is-pend (${d.youClass})`);
    if (!/226, 135, 60/.test(d.youNumColor))
      fails.push(`pend margin not ytp orange (${d.youNumColor})`);
    if (d.marqueeTitle !== "THE BLADE DROPS SOON")
      fails.push(`pend marquee title "${d.marqueeTitle}"`);
    if (/UTC/.test(d.bodyText)) fails.push("pend copy carries a fabricated clock (UTC)");
    return fails;
  },
};

for (const motion of ["reduce", "no-preference"]) {
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: motion });

  for (const [state, build] of Object.entries(STATES)) {
    for (const w of MOBILE_WIDTHS) {
      currentHtml = buildHTML(build());
      await page.setViewportSize({ width: w, height: 820 });
      await page.goto("http://pw.local/");
      await page
        .waitForFunction(
          () => {
            const img = document.querySelector(".ko-trophy, .ko-champ img");
            return img && img.complete && img.naturalWidth > 0;
          },
          { timeout: 4000 },
        )
        .catch(() => {});
      await page.waitForTimeout(motion === "reduce" ? 80 : 250);
      const d = await page.evaluate(PROBE);
      const fails = stateChecks[state](d, w);
      // Choreography wiring: under no-preference the visible big blade must animate; under reduce it must not.
      const anim = d.youAnimLoom || d.youAnimDamocles;
      if (state === "a" || state === "b") {
        if (motion === "no-preference" && (!anim || anim === "none"))
          fails.push("blade idle animation not wired under no-preference");
        if (motion === "reduce" && anim && anim !== "none")
          fails.push(`blade animates under reduced motion (${anim})`);
      }
      report(`state ${state} · mobile ${w} [${motion}]`, fails);
      if (motion === "reduce" && w === 390) {
        // Hide the FIXED nav stub for the capture only — Playwright paints fixed elements at the
        // viewport position when stitching fullPage shots, which lands them mid-page over the cut
        // line. The nav-clearance ASSERTION above already covered the real geometry.
        await page.evaluate(() => {
          const nav = document.querySelector(".sh-btmnav");
          if (nav) nav.style.visibility = "hidden";
        });
        const shot = `the-cut-${state}-390.png`;
        await page.screenshot({ path: resolve(TMP, shot), fullPage: true });
        await page.screenshot({ path: resolve(screenshotsDir, shot), fullPage: true });
      }
    }
  }

  // Desktop rail (state a shape): marquee above the cockpit, YOU band + ladder in the left rail.
  currentHtml = buildHTML(
    desktopScreen(
      youband({
        variant: "safe",
        icon: "✓",
        a: "Surviving · 4th of 10",
        b: "Tap a row to compare",
        n1: "+16",
        n2: "clear of the blade",
      }) +
        shapeStrip +
        `<div class="da-lb-head"><span class="t-label">The ladder</span><span class="t-micro text-tertiary">live · pts</span></div>` +
        ladder({ meIdx: 3 }) +
        fallen({ open: false }),
    ),
  );
  await page.setViewportSize({ width: 1180, height: 860 });
  await page.goto("http://pw.local/");
  await page.waitForTimeout(motion === "reduce" ? 80 : 250);
  {
    const d = await page.evaluate(PROBE);
    const fails = [];
    if (!d.trophy?.complete) fails.push("desktop marquee trophy did not decode");
    // Desktop shows the marquee loom AND the rail band: still exactly one big machete.
    if (d.machetes.length !== 1)
      fails.push(`blade discipline on desktop: ${d.machetes.length} machetes`);
    if (!d.youClass.includes("is-safe")) fails.push("desktop rail YOU band missing");
    if (d.scrollW > d.innerW + 1) fails.push(`desktop horizontal overflow ${d.scrollW}`);
    report(`state a · desktop 1180 [${motion}]`, fails);
    if (motion === "reduce") {
      await page.screenshot({ path: resolve(TMP, "the-cut-a-desktop.png"), fullPage: true });
      await page.screenshot({
        path: resolve(screenshotsDir, "the-cut-a-desktop.png"),
        fullPage: true,
      });
    }
  }

  // The ceremony takeover — armed, then aftermath (stamps land, victims WRAP, FAAB truth).
  for (const phase of ["armed", "aftermath"]) {
    currentHtml = buildHTML(
      mobileScreen(marquee({ loom: false }), { withNav: true }) + ceremony(phase),
    );
    await page.setViewportSize({ width: 390, height: 820 });
    await page.goto("http://pw.local/");
    await page.waitForTimeout(motion === "reduce" ? 80 : 400);
    const d = await page.evaluate(PROBE);
    const fails = [];
    if (phase === "aftermath") {
      if (d.stampOpacity !== "1")
        fails.push(`Eliminated! stamp opacity ${d.stampOpacity} (class-driven reveal broken)`);
      if (d.victimsWrap !== "wrap")
        fails.push(`victims row flex-wrap "${d.victimsWrap}" — F-P3-K4`);
      if (d.victimsRight > 390 + 1)
        fails.push(`victims row clips off-screen (right ${d.victimsRight})`);
      if (!d.faabText || !d.faabText.includes("carries over"))
        fails.push(`FAAB line lost the carry-forward truth: "${d.faabText}"`);
      if (/resets/i.test(d.faabText ?? ""))
        fails.push("FAAB line says RESETS — the excluded P1 copy shipped");
    }
    report(`ceremony ${phase} · mobile 390 [${motion}]`, fails);
    if (motion === "reduce" && phase === "aftermath") {
      await page.screenshot({ path: resolve(TMP, "the-cut-ceremony.png"), fullPage: true });
      await page.screenshot({
        path: resolve(screenshotsDir, "the-cut-ceremony.png"),
        fullPage: true,
      });
    }
  }

  await page.close();
}

// ─────────────────────── first-open cut-ceremony latch proof (real-browser) ───────────────────────
// feat/cut-ceremony-first-open. A jsdom smoke can't prove localStorage-gated behavior in a REAL
// browser, so this drives sequential same-origin loads with a faithful in-page latch that uses the
// EXACT key scheme `xi:seenCut:<leagueId>:<roundLabel>` (pinned by seenCeremony.test.ts, so this
// hardcoded string can't drift from the module). It proves the one-shot contract:
//   1. FIRST open (empty store)   → the ceremony takeover PAINTS and the seen key is WRITTEN.
//   2. SECOND open (key persists) → SETTLES: no takeover replays.
//   3. cross-surface              → the SHARED key suppresses the /playoffs Theater blade (no replay).
//   4. reduced-motion             → the STATIC aftermath shows (no animation) and STILL records.
// Desktop + mobile.
{
  const LEAGUE = "lg1";
  const ROUND = "R32";
  const KEY = `xi:seenCut:${LEAGUE}:${ROUND}`;
  // Faithful mirror of seenCeremony.ts: read the shared key, remove the one-shot node when already
  // seen, else write the key. (fail-toward-seen on a throwing store — no replay spam.)
  const latchScript = `<script>
(function(){
  try {
    var key = ${JSON.stringify(KEY)};
    var seen; try { seen = localStorage.getItem(key) !== null; } catch (e) { seen = true; }
    var node = document.querySelector("[data-oneshot]");
    if (seen) { if (node) node.remove(); document.documentElement.setAttribute("data-latch","settled"); }
    else { try { localStorage.setItem(key,"1"); } catch (e) {} document.documentElement.setAttribute("data-latch","fired"); }
  } catch (e) { document.documentElement.setAttribute("data-latch","error"); }
})();
</script>`;
  const cutPage = () =>
    buildHTML(
      mobileScreen(marquee({ loom: false }), { withNav: true }) +
        `<div data-oneshot>${ceremony("aftermath")}</div>` +
        latchScript,
    );
  // A minimal Theater blade one-shot node, gated by the SAME key (cross-surface proof).
  const theaterPage = () =>
    buildHTML(
      `<div data-oneshot class="po-hero is-drop" style="width:220px;height:90px">CHOP!</div>` +
        latchScript,
    );
  const LATCH_PROBE = (key) => {
    let stored = null;
    try {
      stored = localStorage.getItem(key);
    } catch {
      stored = "(throws)";
    }
    const mach = document.querySelector(".koc .ko-mach");
    return {
      latch: document.documentElement.getAttribute("data-latch"),
      hasKoc: !!document.querySelector(".koc"),
      hasBlade: !!document.querySelector("[data-oneshot].po-hero"),
      stored,
      machAnim: mach ? getComputedStyle(mach).animationName : null,
    };
  };

  for (const [surface, w] of [
    ["mobile", 390],
    ["desktop", 1180],
  ]) {
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: w, height: 840 });
    await page.goto("http://pw.local/");
    await page.evaluate(() => {
      try {
        localStorage.clear();
      } catch {
        /* ignore */
      }
    });

    currentHtml = cutPage();
    await page.goto("http://pw.local/");
    let d = await page.evaluate(LATCH_PROBE, KEY);
    report(`latch · first open FIRES + writes key · ${surface}`, [
      ...(d.hasKoc ? [] : ["ceremony takeover missing on first open"]),
      ...(d.latch === "fired" ? [] : [`latch=${d.latch}, expected fired`]),
      ...(d.stored === "1" ? [] : [`seen key not written (stored=${d.stored})`]),
    ]);

    currentHtml = cutPage();
    await page.goto("http://pw.local/");
    d = await page.evaluate(LATCH_PROBE, KEY);
    report(`latch · second open SETTLES (no replay) · ${surface}`, [
      ...(!d.hasKoc ? [] : ["ceremony takeover REPLAYED on second open"]),
      ...(d.latch === "settled" ? [] : [`latch=${d.latch}, expected settled`]),
    ]);

    currentHtml = theaterPage();
    await page.goto("http://pw.local/");
    d = await page.evaluate(LATCH_PROBE, KEY);
    report(`latch · cross-surface Theater no-replay (shared key) · ${surface}`, [
      ...(!d.hasBlade ? [] : ["Theater blade REPLAYED — the shared key was not honored"]),
    ]);

    await page.close();
  }

  // reduced-motion: fresh store → static aftermath paints AND records, with no running animation.
  const rpage = await context.newPage();
  await rpage.emulateMedia({ reducedMotion: "reduce" });
  await rpage.setViewportSize({ width: 390, height: 840 });
  await rpage.goto("http://pw.local/");
  await rpage.evaluate(() => {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });
  currentHtml = cutPage();
  await rpage.goto("http://pw.local/");
  const dr = await rpage.evaluate(LATCH_PROBE, KEY);
  report(`latch · reduced-motion static aftermath + records`, [
    ...(dr.hasKoc ? [] : ["static aftermath takeover missing under reduced motion"]),
    ...(dr.stored === "1" ? [] : ["seen key not written under reduced motion"]),
    ...(!dr.machAnim || dr.machAnim === "none"
      ? []
      : [`machete animates under reduced motion (${dr.machAnim})`]),
  ]);
  await rpage.close();
}

await browser.close();

const summaryPath = resolve(TMP, "the-cut-verify.json");
writeFileSync(summaryPath, JSON.stringify(results, null, 2));
const failCount = results.filter((r) => r.fails.length).length;
console.log(
  `\n${failCount === 0 ? "ALL GREEN" : `${failCount} CASE(S) FAILED`} — ${results.length} cases · summary ${summaryPath} · screenshots ${screenshotsDir}`,
);
process.exit(failCount === 0 ? 0 : 1);
