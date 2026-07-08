/**
 * capture-screens.mjs — read-only prod-capture harness for the Claude Design feed (manifest Pass 2).
 *
 * Extends the verify-*.mjs real-browser pattern (Playwright chromium at 360/390/1440) with an INJECTED
 * authenticated session so gated identity surfaces render with real data. It navigates and screenshots
 * ONLY — no clicks on action controls, no form fills, no submits, no POSTs. Nothing mutates the live
 * league; the session is loaded from captures/.auth/state.json (produced once by capture-login.mjs).
 *
 * READ-ONLY FENCE (hard):
 *   - NETWORK FENCE (all waves): every capture context carries a Playwright route rule that ABORTS
 *     every non-GET/HEAD request. No POST/PUT/PATCH/DELETE can leave the browser, period. Auth needs
 *     no exception — the injected session cookie is refreshed server-side by SSR, never by a browser
 *     write. Any fence hit fails that surface loudly (it means an interaction was misclassified).
 *   - Wave 1 surfaces do exactly: newContext(storageState) → page.goto → page.screenshot. No steps.
 *   - Wave 2 surfaces (--wave2) additionally run a declarative `steps` list of PURE-CLIENT
 *     interactions (open sheet/panel/tab, type into a client-side filter, select) verified against
 *     component source to fire no write. Mutating controls (save/submit/confirm/claim/pick/star/
 *     sign-out/commish writes) are never scripted; the network fence backstops the classification.
 *   - Write-dependent states are NOT produced here — they salvage from design_reference/ or wait for
 *     the calendar (manifest §7b). This harness never performs a write to reach a state.
 *   - Session-expiry guard: if a gated route bounces to /sign-in or /auth/denied, the run FAILS loudly
 *     rather than saving a mislabeled signed-out screenshot.
 *
 * Output: captures/<route>__<state>__<viewport>.png  (deterministic names) + an INDEX.md row each
 *         (Wave 2 rows land in the separate "Wave 2 — interaction states" table with trigger + note).
 *
 *   Run:  node apps/web/scripts/capture-screens.mjs [surfaceKey…] [--base=https://host] [--no-auth]
 *         node apps/web/scripts/capture-screens.mjs --wave2 [surfaceKey…]
 *         (no surfaceKey → every ACTIVE surface in the selected wave; --no-auth → only the signed-out
 *          set, captured in a FRESH no-state context where landing on /sign-in is the target;
 *          --wave2 → the interaction-state set below, desktop-1440 + mobile-390)
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

// ── Wave 2 surface manifest — interaction / click-gated states ─────────────────────────────────
// Every step below is a PURE CLIENT interaction, classified against component source (recon
// 2026-07-08, four read-only lanes over SetLineupClient / VsFieldClient+KnockoutUI / WaiversClient+
// BidComposer+NationFilter / PlayersClient / StandingsClient / PoolClient / CommishConsole /
// GameDetailClient / DraftRoomClient / MoreSheet). Never scripted: lineup Save (`POST /api/lineup`),
// pool pick chips (`POST /api/pool/pick`), watchlist stars (`POST /api/manager/watchlist`), claim
// submit/cancel, FA add / release, commish write panels, draft clock/pick controls, sign-out.
// The per-context non-GET abort fence backstops all of it.
//
// Steps vocabulary (executed in order after goto + auth guard):
//   { click: sel } · { fill: [sel, text] } · { press: key } · { waitFor: sel } · { waitMs: n }
// `trigger` (human trigger path) and `note` (one line for Claude Design) feed the Wave 2 INDEX table.
const W2_VPS = ["mobile-390", "desktop-1440"];
const DESK = ["desktop-1440"];
const MOB = ["mobile-390"];
const WAVE2_SURFACES = [
  // ── (a) perishable knockout — /vsfield The Cut ──────────────────────────────────────────────
  {
    key: "vsfield-fallen",
    active: true,
    route: "/vsfield",
    state: "fallen-expanded",
    phase: "knockout",
    viewports: W2_VPS,
    source: "live",
    fullPage: true,
    suppressCeremony: true,
    // TWO KOFallen mounts exist (desktop cockpit + mobile column, CSS-gated at 760px) — target
    // the visible one for the active viewport.
    steps: [{ click: "button.ko-fallen-hd >> visible=true" }],
    trigger: "/vsfield → click THE FALLEN header",
    note: "Eliminated-managers fold expanded under the ladder; rows carry cut-round tags.",
  },
  {
    key: "vsfield-season",
    active: true,
    route: "/vsfield",
    state: "season-tab",
    phase: "knockout",
    viewports: W2_VPS,
    source: "live",
    fullPage: true,
    suppressCeremony: true,
    steps: [{ click: '.vf-viewtabs button:has-text("Season")' }],
    trigger: "/vsfield → click Season view tab",
    note: "SeasonTable replaces the KO ladder — cumulative season standing inside The Cut chrome.",
  },
  {
    key: "vsfield-r16",
    active: true,
    route: "/vsfield",
    state: "r16-settled-ladder",
    phase: "knockout",
    viewports: W2_VPS,
    source: "live",
    fullPage: true,
    suppressCeremony: true,
    steps: [{ click: '.vf-periodtabs button:has-text("R16")' }],
    trigger: "/vsfield → click R16 period tab",
    note: "Historical settled cut round — completed R16 ladder with the cut applied. Perishable.",
  },
  {
    key: "vsfield-aftermath",
    active: true,
    route: "/vsfield",
    state: "ceremony-aftermath",
    phase: "knockout",
    viewports: W2_VPS,
    source: "live",
    fullPage: false, // viewport takeover
    // NO suppressCeremony — the unseeded first-open latch fires the ceremony deliberately.
    steps: [
      { waitFor: "div.koc" },
      { click: '.koc button:has-text("Skip")' },
      { waitMs: 600 },
    ],
    trigger: "/vsfield unseeded → ceremony fires → click Skip",
    note: "KOCeremony aftermath panel: settled verdict + 'reinforce via waivers' FAAB CTA. Wave 1 shot the entrance; this is the resting end-state.",
  },
  // ── (b) D4a consolidation targets — shared NationFilter (live truth: ONE inline collapsible on
  //        both viewports; no desktop-panel/mobile-sheet split, no internal search — see INDEX note)
  {
    key: "players-nf-open",
    active: true,
    route: "/players",
    state: "nationfilter-open",
    phase: "knockout",
    viewports: W2_VPS,
    source: "live",
    fullPage: true,
    steps: [{ click: "button.nf-toggle" }],
    trigger: "/players → click Nations toggle",
    note: "Shared NationFilter chip grid expanded (same component waivers composes). Inline collapsible, not a sheet.",
  },
  {
    key: "players-nf-selected",
    active: true,
    route: "/players",
    state: "nationfilter-selected",
    phase: "knockout",
    viewports: W2_VPS,
    source: "live",
    fullPage: true,
    steps: [
      { click: "button.nf-toggle" },
      { click: ".nf-grid button.chip >> nth=0" },
      { click: ".nf-grid button.chip >> nth=1" },
    ],
    trigger: "/players → open Nations → select two nation chips",
    note: "Selected-band state: two active nation chips filtering the pool table (pure client filter).",
  },
  {
    key: "players-nf-focus",
    active: true,
    route: "/players",
    state: "nationfilter-focus-visible",
    phase: "knockout",
    viewports: DESK,
    source: "live",
    fullPage: false,
    steps: [{ click: "button.nf-toggle" }, { press: "Tab" }],
    trigger: "/players → open Nations → keyboard Tab onto first chip",
    note: "Keyboard focus on a nation chip. DOM truth: .chip has NO custom :focus-visible ring (only .btn does) — this documents the browser-default outline for the D4a a11y pass.",
  },
  // ── (c) MoreSheet (mobile) ──────────────────────────────────────────────────────────────────
  {
    key: "moresheet",
    active: true,
    route: "/",
    state: "more-open",
    phase: "knockout",
    viewports: MOB,
    source: "live",
    fullPage: false,
    steps: [
      { click: 'button.sh-more-btn[aria-label="More navigation options"]' },
      { waitFor: '[role="dialog"][aria-label="More navigation"]' },
    ],
    trigger: "/ (mobile) → tap More in bottom bar",
    note: "More navigation sheet over the dashboard: overflow nav items + commish entry + sign-out (never activated).",
  },
  // ── (d) waivers — BidComposer states (sealed-bid phase; FA panel not mounted, see BLOCKED) ──
  {
    key: "waivers-composer",
    active: true,
    route: "/waivers",
    state: "composer-open",
    phase: "knockout",
    viewports: W2_VPS,
    source: "live",
    fullPage: false,
    steps: [{ click: 'button:has-text("+ New claim")' }, { waitFor: ".wv-composer" }],
    trigger: "/waivers → click + New claim",
    note: "BidComposer sheet at rest: FA search, position segments, Nations toggle, watched chip, pick list. Rows with a live pending bid show the 'Your bid ×N' badge (S3).",
  },
  {
    key: "waivers-composer-search",
    active: true,
    route: "/waivers",
    state: "composer-search-active",
    phase: "knockout",
    viewports: W2_VPS,
    source: "live",
    fullPage: false,
    steps: [
      { click: 'button:has-text("+ New claim")' },
      { waitFor: ".wv-composer" },
      { fill: ["input.wv-comp-input", "ma"] },
      { waitMs: 300 },
    ],
    trigger: "/waivers → + New claim → type 'ma' in FA search",
    note: "Composer with a client-side search narrowing the FA pick list.",
  },
  {
    key: "waivers-composer-nf",
    active: true,
    route: "/waivers",
    state: "composer-nations-open",
    phase: "knockout",
    viewports: DESK,
    source: "live",
    fullPage: false,
    steps: [
      { click: 'button:has-text("+ New claim")' },
      { waitFor: ".wv-composer" },
      { click: ".wv-composer button.nf-toggle" },
    ],
    trigger: "/waivers → + New claim → click Nations toggle inside composer",
    note: "The same shared NationFilter expanded INSIDE the composer — the second of its two hosts.",
  },
  {
    key: "waivers-composer-picked",
    active: true,
    route: "/waivers",
    state: "composer-selected",
    phase: "knockout",
    viewports: W2_VPS,
    source: "live",
    fullPage: false,
    steps: [
      { click: 'button:has-text("+ New claim")' },
      { waitFor: ".wv-composer" },
      { click: "button.wv-comp-fa >> nth=0" },
      { waitMs: 300 },
    ],
    trigger: "/waivers → + New claim → select first FA row",
    note: "Composer with a target selected: bid amount stepper (−/+), FAAB budget line, pre-confirm. Selection is pure client state — nothing is placed.",
  },
  {
    key: "waivers-card",
    active: true,
    route: "/waivers",
    state: "fa-card-open",
    phase: "knockout",
    viewports: W2_VPS,
    source: "live",
    fullPage: false,
    steps: [
      { click: 'button:has-text("+ New claim")' },
      { waitFor: ".wv-composer" },
      { click: 'button.wv-comp-fa-info[aria-label="View player card"] >> nth=0' },
      { waitFor: ".pc-scrim" },
      { waitMs: 500 },
    ],
    trigger: "/waivers → + New claim → click ⓘ on first FA row",
    note: "View-only FaPlayerCardSheet over the composer (Points tab default). Card data loads via GET only.",
  },
  // ── (e) draft room — post-complete click-gated (live rail is dead; see BLOCKED) ─────────────
  {
    key: "draft-squad",
    active: true,
    route: "/draft",
    state: "squad-tab",
    phase: "post-draft",
    viewports: MOB,
    source: "live",
    fullPage: true,
    steps: [{ click: '.dr-mtabs button:has-text("Your squad")' }],
    trigger: "/draft (mobile) → tap Your squad tab",
    note: "Post-draft RosterPanel view behind the mobile Board/Your-squad toggle.",
  },
  // ── (f) /players — search / filters / paging / card ─────────────────────────────────────────
  {
    key: "players-search",
    active: true,
    route: "/players",
    state: "search-active",
    phase: "knockout",
    viewports: W2_VPS,
    source: "live",
    fullPage: true,
    steps: [{ fill: ["input.pl-search-input", "ma"] }, { waitMs: 300 }],
    trigger: "/players → type 'ma' in search",
    note: "Search-active pool table (pure client filter, no IO).",
  },
  {
    key: "players-seg",
    active: true,
    route: "/players",
    state: "position-mid",
    phase: "knockout",
    viewports: DESK,
    source: "live",
    fullPage: true,
    steps: [{ click: '.pl-seg button:has-text("MID")' }],
    trigger: "/players → click MID position segment",
    note: "Position-segmented table state (MID active).",
  },
  {
    key: "players-fchip",
    active: true,
    route: "/players",
    state: "free-agents-chip",
    phase: "knockout",
    viewports: DESK,
    source: "live",
    fullPage: true,
    steps: [{ click: 'button.pl-fchip:has-text("Free agents")' }],
    trigger: "/players → click Free agents availability chip",
    note: "Availability-filtered pool (unowned only) — rows lose OwnerChips.",
  },
  {
    key: "players-paged",
    active: true,
    route: "/players",
    state: "paged-more",
    phase: "knockout",
    viewports: DESK,
    source: "live",
    fullPage: true,
    steps: [{ click: "button.pl-loadmore" }, { waitMs: 300 }],
    trigger: "/players → click Load 25 more",
    note: "Paged reveal after one Load-25-more click; pager button re-rendered below the longer table.",
  },
  {
    key: "players-card",
    active: true,
    route: "/players",
    state: "card-points",
    phase: "knockout",
    viewports: W2_VPS,
    source: "live",
    fullPage: false,
    steps: [
      { click: "button.mt-idc >> nth=0" },
      { waitFor: ".pc-scrim" },
      { waitMs: 500 },
    ],
    trigger: "/players → click first player row",
    note: "FaPlayerCardSheet (waivers-owned, R3's one cross-module dependency) on Points tab.",
  },
  {
    key: "players-card-stats",
    active: true,
    route: "/players",
    state: "card-stats",
    phase: "knockout",
    viewports: W2_VPS,
    source: "live",
    fullPage: false,
    steps: [
      { click: "button.mt-idc >> nth=0" },
      { waitFor: ".pc-scrim" },
      { click: '.pc-seg button:has-text("Stats")' },
      { waitMs: 500 },
    ],
    trigger: "/players → open player card → click Stats tab",
    note: "Card Stats tab: per-match tournament statline (GET-loaded on open).",
  },
  // ── (g) /lineup — selection + prior-period snapshot + formation reshape ─────────────────────
  {
    key: "lineup-select",
    active: true,
    route: "/lineup",
    state: "swap-selected",
    phase: "knockout",
    viewports: W2_VPS,
    source: "live",
    fullPage: true,
    steps: [{ click: "button.sl-tok.is-movable >> nth=0" }, { waitMs: 200 }],
    trigger: "/lineup → tap first movable pitch player",
    note: "Swap-selection state: .st-selected token + .st-eligible highlights on legal swap targets. Pure client; Save never touched.",
  },
  {
    key: "lineup-md1",
    active: true,
    route: "/lineup",
    state: "md1-readonly",
    phase: "group",
    viewports: W2_VPS,
    source: "live",
    fullPage: true,
    steps: [{ click: '.sl-period-tabs button:has-text("MD1")' }, { waitMs: 300 }],
    trigger: "/lineup → click MD1 period tab",
    note: "Group-phase historical snapshot (11 starters, read-only, matchday total banner) — fills the Wave 1 '/lineup group-phase not captured' gap.",
  },
  {
    key: "lineup-formation",
    active: true,
    route: "/lineup",
    state: "formation-reshaped",
    phase: "knockout",
    viewports: DESK,
    source: "live",
    fullPage: true,
    steps: [
      { click: '.sl-formation-tabs button:has-text("3-2-1")' },
      { waitMs: 300 },
    ],
    trigger: "/lineup → click 3-2-1 formation tab",
    note: "Pitch reshaped to an unsaved formation + 'Unsaved changes' hero pill. Client-only working state; nothing submitted, context discarded.",
  },
  // ── (h) /standings tabs · /pool drill-ins · /commish ?tab= · /games tabs ────────────────────
  {
    key: "standings-cumulative",
    active: true,
    route: "/standings",
    state: "cumulative-tab",
    phase: "knockout",
    viewports: W2_VPS,
    source: "live",
    fullPage: true,
    steps: [{ click: '.st-tabs button:has-text("Cumulative")' }],
    trigger: "/standings → click Cumulative tab",
    note: "Cumulative standings table (Wave 1.5 deferral now captured).",
  },
  {
    key: "standings-season",
    active: true,
    route: "/standings",
    state: "season-tab",
    phase: "knockout",
    viewports: W2_VPS,
    source: "live",
    fullPage: true,
    steps: [{ click: '.st-tabs button:has-text("Season")' }],
    trigger: "/standings → click Season tab",
    note: "Season grid panel (third tab — inventory said 3 tabs, not 2).",
  },
  {
    key: "standings-expanded",
    active: true,
    route: "/standings",
    state: "cumulative-row-expanded",
    phase: "knockout",
    viewports: DESK,
    source: "live",
    fullPage: true,
    steps: [
      { click: '.st-tabs button:has-text("Cumulative")' },
      { click: "button.st-row-main >> nth=0" },
      { waitMs: 200 },
    ],
    trigger: "/standings → Cumulative → click first manager row",
    note: "Expanded per-manager breakdown row inside the cumulative table.",
  },
  {
    key: "pool-leaderboard",
    active: true,
    route: "/pool",
    state: "leaderboard-tab",
    phase: "knockout",
    viewports: W2_VPS,
    source: "live",
    fullPage: true,
    steps: [{ click: '.pl-tabs button:has-text("Leaderboard")' }],
    trigger: "/pool → click Leaderboard tab",
    note: "Quiniela leaderboard (starts a GET-only visibility poll; pick chips never touched).",
  },
  {
    key: "pool-mgrpicks",
    active: true,
    route: "/pool",
    state: "manager-picks-modal",
    phase: "knockout",
    viewports: W2_VPS,
    source: "live",
    fullPage: false,
    steps: [
      { click: '.pl-tabs button:has-text("Leaderboard")' },
      { click: "button.pl-mgr-link >> nth=0" },
      { waitFor: ".pl-modal-overlay" },
    ],
    trigger: "/pool → Leaderboard → click first manager row",
    note: "ManagerPicksModal: a rival's reveal-gated pick history (already-gated view, no fetch).",
  },
  {
    key: "pool-completed",
    active: true,
    route: "/pool",
    state: "completed-expanded",
    phase: "knockout",
    viewports: DESK,
    source: "live",
    fullPage: true,
    steps: [{ click: "details.pl-completed > summary" }, { waitMs: 200 }],
    trigger: "/pool → click Completed archive disclosure",
    note: "≥24h archived fixtures fold opened (native details element).",
  },
  {
    key: "commish-stats",
    active: true,
    route: "/commish?tab=stats",
    state: "stat-corrections-tab",
    phase: "knockout",
    viewports: DESK,
    source: "live",
    fullPage: true,
    trigger: "/commish?tab=stats (GET deep link, no click)",
    note: "Stat-corrections console tab. Read-only capture; no write control activated.",
  },
  {
    key: "commish-repair",
    active: true,
    route: "/commish?tab=repair",
    state: "roster-repair-tab",
    phase: "knockout",
    viewports: DESK,
    source: "live",
    fullPage: true,
    trigger: "/commish?tab=repair (GET deep link, no click)",
    note: "Roster & lineup repair console tab. Read-only capture; no write control activated.",
  },
  {
    key: "commish-ops",
    active: true,
    route: "/commish?tab=ops",
    state: "game-ops-tab",
    phase: "knockout",
    viewports: DESK,
    source: "live",
    fullPage: true,
    trigger: "/commish?tab=ops (GET deep link, no click)",
    note: "Game-operations (freeze/unfreeze) console tab at rest. Read-only capture; confirm-word inputs untouched.",
  },
  {
    key: "games-events",
    active: true,
    route: `/games/${KO_MATCH}?from=vsfield`,
    state: "events-tab",
    phase: "knockout",
    viewports: W2_VPS,
    source: "live",
    fullPage: true,
    steps: [{ click: '.gd-tabbar button:has-text("Events")' }],
    trigger: "/games/<R16 id> → click Events tab",
    note: "Match events timeline on the completed R16 match.",
  },
  {
    key: "games-stats",
    active: true,
    route: `/games/${KO_MATCH}?from=vsfield`,
    state: "statistics-tab",
    phase: "knockout",
    viewports: DESK,
    source: "live",
    fullPage: true,
    steps: [{ click: '.gd-tabbar button:has-text("Statistics")' }],
    trigger: "/games/<R16 id> → click Statistics tab",
    note: "Team statistics comparison bars (tab renders only when the feed carried stats).",
  },
  {
    key: "games-ratings",
    active: true,
    route: `/games/${KO_MATCH}?from=vsfield`,
    state: "ratings-tab",
    phase: "knockout",
    viewports: DESK,
    source: "live",
    fullPage: true,
    steps: [{ click: '.gd-tabbar button:has-text("Ratings")' }],
    trigger: "/games/<R16 id> → click Ratings tab",
    note: "Player ratings tab (T16's sole additive contract read).",
  },
  {
    key: "games-scoresheet",
    active: true,
    route: `/games/${KO_MATCH}?from=vsfield`,
    state: "scoresheet-open",
    phase: "knockout",
    viewports: W2_VPS,
    source: "live",
    fullPage: false,
    steps: [
      { click: "button.gd-tok >> nth=0" },
      { waitFor: ".sl-scoremodal" },
      { waitMs: 500 },
    ],
    trigger: "/games/<R16 id> → click a pitch player token",
    note: "PlayerScoreSheet points-breakdown modal (info-only host: no forfeit button here by design).",
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
// --wave2 → run the interaction-state set instead of the Wave 1 goto-only set.
const wave2 = process.argv.includes("--wave2");

const captured = []; // { route, state, viewport, source, phase, file, trigger?, note? }
const failures = [];

/** Execute a surface's declarative interaction steps. Throws on a missing/hidden target so the
 *  surface fails loudly instead of screenshotting a wrong state. */
async function runSteps(page, steps) {
  for (const s of steps) {
    if (s.click) await page.locator(s.click).first().click();
    else if (s.fill) await page.locator(s.fill[0]).first().fill(s.fill[1]);
    else if (s.press) await page.keyboard.press(s.press);
    else if (s.waitFor)
      await page.locator(s.waitFor).first().waitFor({ state: "visible", timeout: 15000 });
    else if (s.waitMs) await page.waitForTimeout(s.waitMs);
    else throw new Error(`unknown step ${JSON.stringify(s)}`);
  }
}

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
    // NETWORK FENCE (hard, every context): abort every non-GET/HEAD request at the driver layer.
    // Auth needs no exception (SSR refreshes the session server-side; capture-login only navigates).
    // A hit is recorded and FAILS the surface — a scripted interaction must never even attempt a
    // write, so any attempt means a misclassification to investigate, not a capture to keep.
    const fenceHits = [];
    await ctx.route("**/*", (route) => {
      const req = route.request();
      const method = req.method();
      if (method !== "GET" && method !== "HEAD") {
        fenceHits.push(`${method} ${req.url()}`);
        return route.abort();
      }
      return route.continue();
    });

    const page = await ctx.newPage();
    page.setDefaultTimeout(15000);
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

    // Wave 2: run the pure-client interaction steps, then settle again before the shot.
    if (surface.steps) {
      try {
        await runSteps(page, surface.steps);
      } catch (err) {
        failures.push(
          `${surface.key} [${vp}]: interaction step failed — ${String(err).split("\n")[0]}`,
        );
        await ctx.close();
        continue;
      }
      await page.waitForTimeout(surface.settleMs ?? 600);
    }

    // Fence audit: any attempted write voids the capture (see fence comment above).
    if (fenceHits.length) {
      failures.push(
        `${surface.key} [${vp}]: NETWORK FENCE HIT (${fenceHits.length}) — ${fenceHits.join(" · ")} — capture discarded; interaction misclassified.`,
      );
      await ctx.close();
      continue;
    }

    const file = `${surface.key}__${surface.state}__${vp}.png`;
    await page.screenshot({ path: resolve(capturesDir, file), fullPage: !!surface.fullPage });
    captured.push({
      route: surface.route,
      state: surface.state,
      viewport: vp,
      source: surface.source,
      phase: surface.phase,
      file,
      trigger: surface.trigger,
      note: surface.note,
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

// ── Wave 2 INDEX writer ─────────────────────────────────────────────────────────────────────────
// Wave 2 rows live in their OWN table under this heading — the Wave 1 table above it is never
// touched (Wave 1 entries are frozen; see captures/INDEX.md conventions). Merge semantics mirror
// writeIndex: replace a same-file row in place, append new rows after the last table row.
const WAVE2_HEADING = "## Wave 2 — interaction states";
const WAVE2_SCAFFOLD = [
  "",
  WAVE2_HEADING,
  "",
  "Click-gated states (branch `capture/wave-2`): the same read-only harness plus a HARD network",
  "fence — every capture context aborts ALL non-GET requests at the Playwright driver layer, so no",
  "write can leave the browser. Interactions are pure client state (open sheet/panel/tab,",
  "client-side filter, selection), classified against component source before scripting; mutating",
  "controls (save/submit/claim/pick/star/sign-out/commish writes) were never activated.",
  "Viewports: desktop-1440 + mobile-390 wherever the state exists on both.",
  "",
  "| Route | State | Viewport | Trigger path | File | Note |",
  "| --- | --- | --- | --- | --- | --- |",
];

function writeIndexWave2() {
  const rows = captured.map(
    (c) =>
      `| \`${c.route}\` | ${c.state} | ${c.viewport} | ${c.trigger ?? "—"} | \`${c.file}\` | ${c.note ?? ""} |`,
  );
  if (!rows.length) return;

  let lines = existsSync(indexPath) ? readFileSync(indexPath, "utf8").split("\n") : [];
  let headIdx = lines.findIndex((l) => l.trim() === WAVE2_HEADING);
  if (headIdx === -1) {
    while (lines.length && lines[lines.length - 1] === "") lines.pop();
    headIdx = lines.length + 1; // heading lands after the leading "" of the scaffold
    lines = lines.concat(WAVE2_SCAFFOLD, "");
  }
  const sepIdx = lines.findIndex((l, i) => i > headIdx && /^\|\s*---/.test(l));
  if (sepIdx === -1) throw new Error("Wave 2 INDEX table separator not found");
  let end = sepIdx + 1;
  while (end < lines.length && lines[end].startsWith("|")) end++;
  const existing = lines.slice(sepIdx + 1, end);
  const fileOf = (row) => (row.match(/`([^`]+\.png)`/) || [])[1];
  const merged = existing.map((row) => rows.find((r) => fileOf(r) === fileOf(row)) ?? row);
  for (const r of rows) if (!merged.some((row) => fileOf(row) === fileOf(r))) merged.push(r);
  writeFileSync(
    indexPath,
    [...lines.slice(0, sepIdx + 1), ...merged, ...lines.slice(end)].join("\n"),
    "utf8",
  );
  console.log(`  · INDEX.md → merged ${rows.length} Wave 2 row(s) into ${merged.length}-row table`);
}

async function main() {
  const base = baseUrl();
  const only = selectedKeys();
  const surfaces = (wave2 ? WAVE2_SURFACES : SURFACES).filter(
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

  if (wave2) writeIndexWave2();
  else writeIndex();

  console.log("");
  if (failures.length) {
    console.log(`FAILED — ${failures.length} issue(s):`);
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(`ALL GREEN — ${captured.length} capture(s) · ${capturesDir}`);
}

await main();
