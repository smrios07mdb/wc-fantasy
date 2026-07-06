# XI-R — Design Plan Reconciliation (repo truth)

**Status:** DONE · repo-derived, companion to `audit/DESIGN_PLAN_screen_inventory.md` (executes its §5 step 1)
**Derived from:** `main@602d717` (local == `origin/main` at derivation time), 2026-07-06
**Method:** route tree enumerated directly (`page.tsx`/`layout.tsx`/`loading.tsx`/`route.ts` glob); nav placement and R1–R5 audited by 7 read-only lanes, each adversarially re-verified against the cited lines; every claim below carries `file:line` evidence. Read-only pass — no source touched.
**Scope note:** this document adjudicates facts only. The design decisions on the confirmed findings (plan §5 step 4 — canonical owners, promote/retire calls) are deliberately NOT made here.

**Headline:** the inventory's two `?`-rows are wrong in the same direction — §2's "Nav placement" column tracks only the **mobile** surface. Every route the plan places in "More sheet" is *also* a first-class desktop top-strip item, and the two routes marked "**Not in either nav**" (`/standings`, `/playoffs`) are in **both** the desktop strip and the mobile More sheet. R5's premise dissolves; R2/R1 survive only in corrected form; R3 is confirmed almost entirely; R4 is half right.

---

## 1. How the two navs actually work (read this before the matrix)

Three **different** static lists in `apps/web/src/shell/crossNav.ts`, all rendered simultaneously and swapped by pure CSS:

| Surface | List (def) | Rendered at | Visible |
|---|---|---|---|
| Desktop top strip `.sh-topnav` | `NAV_ITEMS` — 11 items (crossNav.ts:47–69) | AppShell.tsx:224 | ≥640px |
| Mobile bottom bar `.sh-btmnav` | `BOTTOM_TAB_ITEMS` — 5 items (crossNav.ts:73–83) | AppShell.tsx:281 | <640px |
| Mobile More sheet | `MORE_SHEET_ITEMS` — 6 items (crossNav.ts:87–95) | AppShell.tsx:311 → MoreSheet.tsx:99 | <640px only |

- **Both navs are always in the DOM** (AppShell.tsx:204 `.sh-topbar`, :280 `.sh-btmnav`); the swap is one media query, no `matchMedia`/hydration fork: defaults `.sh-topbar{display:flex}` (shell.css:79) + `.sh-btmnav{display:none}` (shell.css:179), flipped by `@media (max-width:639px)` (shell.css:399–404).
- **The More sheet is mobile-only**: MoreSheet mounts *inside* `.sh-btmnav` (AppShell.tsx:306). On desktop there is no More affordance — all 11 `NAV_ITEMS` render in the horizontal scroll box `.sh-topnav-scroll` (shell.css:97).
- **`navItemsForPhase` only relabels, never adds/removes** (crossNav.ts:121–146): in knockout/complete, vsfield → "The Cut" (:134, machete glyph + live dot) and playoffs → "Theater" (:136). No route gains or loses a nav surface by phase.
- **Commissioner entry is list-external and gated**: `COMMISH_NAV_ITEM` (crossNav.ts:40–44) renders only under `isCommissioner` — desktop strip (AppShell.tsx:243) and More sheet (MoreSheet.tsx:118), never the bottom bar; `selectMobileNavPartition` treats it as a More-area id (crossNav.ts:181–183).
- **One list-external mobile extra**: the More sheet hardcodes an additive "Browse players" link to `/players` (MoreSheet.tsx:114–116) that is *not* in `MORE_SHEET_ITEMS` — see R3(c).

## 2. Per-screen placement matrix

Labels shown are group-phase; KO relabels noted. "—" = not on that surface.

| Route | Desktop strip (≥640) | Mobile bottom (<640) | Mobile More | Not-in-nav / other entry | Viewport layout notes |
|---|---|---|---|---|---|
| `/` (hub) | YES "Home" (crossNav.ts:48) | YES "Dashboard" (:74) | — | | Same route, two labels. Dashboard grid re-columns 3→2→1 at 900/600px, **no module is display:none'd on any viewport** (dashboard.css:615,617,643) |
| `/lineup` | YES "Set lineup" (:50) | YES "Set lineup" (:75) | — | | |
| `/vsfield` | YES "Vs the field" → **"The Cut"** in KO (:51,:134) | YES same relabel (:76) | — | | Internal cockpit swap at **760px**: desktop `.da-body` split ↔ stacked `.ma-scroll` tree (vsfield.css:1204–1210; mirrored in knockout.css:910/:965). MatchStrip + KO marquee sit in the shared body above the split (VsFieldClient.tsx:387,386) → render on both viewports |
| `/players` | YES "Players" (:59) | YES "Players" (:82) | **YES (hardcoded)** "Browse players" (MoreSheet.tsx:114–116) | | Mobile-only duplication: bottom tab AND additive More-sheet link (see R3c) |
| `/pool` | YES "Quiniela" (:62) | YES "Quiniela" (:77) | — | | |
| `/scoring` | YES "Scoring" (:66) | — | YES (:88) | | |
| `/waivers` | YES "Waivers" (:55) | — | YES (:89) | | |
| `/draft` | YES "Draft room" (:49) | — | YES (:93) | also dashboard CTAs (Dashboard.tsx:127,201; PrimaryBanner.tsx:94,143) + signed-out marketing EXPLORE card (MarketingLanding.tsx:158) | Nav entry is NOT phase-gated — persists post-draft |
| `/settings` | YES "Settings" (:68) | — | YES (:94) | nav-only: zero other inbound links | |
| `/standings` | **YES "Standings" (:54)** | — | **YES (:91)** | nav-only: repo-wide grep finds **zero** inbound `href` outside the two nav entries | Table drops Pct + Form columns ≤720px (standings.css:436,443) |
| `/playoffs` | **YES "Playoffs" → "Theater" in KO (:64,:136)** | — | **YES (:92)** | plus deep links: vsfield KO "Theater ›" (KnockoutUI.tsx:78), dashboard PrimaryBanner (PrimaryBanner.tsx:218,242,303) + modules (Dashboard.tsx:478,576,583) | Route-internal dual-DOM swap at **767px**: `.po-desktop` ↔ `.po-mobile` (playoffs.css:72–74) |
| `/commish` | CONDITIONAL `isCommissioner` (AppShell.tsx:243) | — (never, by design) | CONDITIONAL (MoreSheet.tsx:118) | page-level gate `resolveCommishAccess`: non-commissioner → `/auth/denied` (commish/page.tsx:24; commishGate.ts:30); layout is chrome-only | |
| `/games/[matchId]` | — | — | — | deep-link only: pool fixture rows (src/pool/components.tsx:220), dashboard match rows (Dashboard.tsx:433 `?from=home`), vsfield MatchStrip (vsfield/components.tsx:158 `?from=vsfield`) — all three hosts render on both viewports. Highlights an existing tab via `?from` (games/[matchId]/page.tsx:45) | Layout compaction at 720/560px, nothing removed (src/games/games.css:1313,1816) |
| `/sign-in` | — | — | — | shell-free auth screen; reached via no-session redirects (e.g. games/[matchId]/page.tsx:36) and `/auth/denied`'s "Back to sign in" (auth/denied/page.tsx:27) | |
| `/auth/denied` | — | — | — | shell-free (denied/page.tsx:5); reached from all 3 auth/callback failure redirects (auth/callback/route.ts:35), every gated page's non-ok redirect (e.g. games/[matchId]/page.tsx:37), landing Denied state link (app/page.tsx:139) | **Missing from plan §2** — see gaps |
| `/` (signed-out marketing) | n/a — same route, `selectLandingView` branch | n/a | n/a | public `/` | Anchor nav `.lp-nav-links` **display:none ≤860px, no hamburger replacement** (landing.css:51,55 — F-P3-B1 confirmed at 860). Hero/show grids collapse at 940/880px (landing.css:71,330) |
| `/auth/callback`, `/auth/sign-out` | — | — | — | `route.ts` handlers, no UI (auth/callback/route.ts, auth/sign-out/route.ts) | |

**Cross-cutting:** no route is reachable on one viewport only. Desktop shows all 11 nav routes on the strip; mobile covers the same 11 via 5 bottom tabs + 6 More items (+ the hardcoded Browse-players extra). The 640px shell swap, vsfield's 760px internal swap, and the marketing 860px anchor drop are three independent breakpoints, as the plan's §4 assumed (shell.css comment at :399 even states 640 is "intentionally distinct" from vsfield's 760).

## 3. R1–R5 adjudication

### R1 — `/vsfield` vs `/playoffs` · claim: Theater is logic-free, out of nav, entry unclear → **largely REFUTED; one clause CONFIRMED, one CORRECTED**

- **CONFIRMED — `/vsfield` is THE knockout ladder.** loadVsField imports `buildPlayoffsView` (loadVsField.ts:15), gates on `knockoutPhaseActive = playoffEntryRows.length > 0` (:274) and calls it (:469); KnockoutUI renders "one ladder, two sections" (KnockoutUI.tsx:7); nav relabels the slot "The Cut" (crossNav.ts:134).
- **CORRECTED — (a) "ceremonial only".** Ceremonial describes the *browser presentation* only: the client holds "NO playoff logic — only presentational layout state" (PlayoffsClient.tsx:9), renders "Theater" (:206; layout.tsx:16; components.tsx:471 "demote-lite … ceremonial THEATER").
- **REFUTED — (b) "no logic".** The route still runs the full server pipeline: `page.tsx:29` awaits `loadPlayoffs`, which calls the pure `buildPlayoffsView` (loadPlayoffs.ts:144); the client runs a JWT Realtime live controller (`startPlayoffsLive`, PlayoffsClient.tsx:161), refetch/poll, and the first-open ceremony latch (`decideCeremonyLatch`, :134).
- **REFUTED — (c) "not in nav".** In `NAV_ITEMS` (crossNav.ts:64) and `MORE_SHEET_ITEMS` (:92); relabeled "Theater" in KO (:136). Excluded only from the 5 primary bottom tabs — a placement choice, not absence.
- **REFUTED — (d) "entry point unclear".** Desktop: top-strip tab. Mobile: More-sheet item. Both phases. Plus contextual links on both viewports: vsfield KO marquee "Theater ›" (KnockoutUI.tsx:78, shared body → both viewports) and dashboard CTAs (PrimaryBanner.tsx:242; Dashboard.tsx:478).
- **NEW:** the dashboard independently consumes `loadPlayoffs` as "the READ-ONLY mirror of … the same `PlayoffsView` the /playoffs theater renders" (loadDashboard.ts:23,48) — bracket derivation runs even on `/`. The R1 *decision* (fold-vs-keep) remains real, but its "unreachable route" urgency premise is false.

### R2 — standings split across three surfaces · **CONFIRMED for the 3-surface split; both reachability sub-claims REFUTED; computation is centralized**

- **CONFIRMED — three display surfaces:** `/standings` (tabs), `/vsfield` (leaderboard rail + Season tab), dashboard StandingsModule.
- **REFUTED — "`/standings` isn't in nav":** crossNav.ts:54 (desktop strip) + :91 (More sheet).
- **REFUTED — "reached via a dashboard module":** the StandingsModule's CTA and every ranked row link to **`/vsfield`**, not `/standings` (Dashboard.tsx:340 `cta={{ label: "Vs the field", href: "/vsfield" }}`, :351 `` href={`/vsfield?manager=${e.managerId}`} ``). Repo-wide grep: **no** content page emits `href="/standings"` — the route is nav-only.
- **CONFIRMED — single ranking engine, no forked math.** Pure `computeStandings` (packages/recompute/src/standing.ts:132, all-play-all W/L/D + seed) → sole writer `recomputeStanding` (recompute.ts:121) → one persisted `standing` table (prismaStore.ts:329). Consumers differ only in read path: `/standings` **recomputes on the fly** from `score_manager_period` via the same pure helper, documented byte-identical (standingsView.ts:281); `/vsfield` reads persisted `standing` (loadVsField.ts:190) and its live rail reuses the shared `periodRecords` helpers (buildVsField.ts:96); the dashboard module re-sorts `vsField.season` by precomputed rank (Dashboard.tsx:329).
- **Corrections/nuances:** `/standings` has **three** tabs — Matchday | Cumulative | Season — not two (StandingsClient.tsx:32,116,125,134). `/vsfield`'s *primary* rail answers "live now" (buildVsField.ts:158), with the season standing behind a secondary tab (VsFieldClient.tsx:78) — so the three surfaces are not answering the identical question at their default state. Documented divergence vector: the live field pads inactive managers to 0 while persisted `standing` only compares row-holders (buildVsField.ts:87–93).

### R3 — `/players` vs `/waivers` · **CONFIRMED on 3 of 4 sub-claims; NationFilter ownership CORRECTED**

- **CONFIRMED — waivers runs an independent FA list.** loadWaivers computes ineligibles via `listFaIneligiblePlayerIds` and queries live-unowned directly (loadWaivers.ts:249,251). Correction to the plan's parenthetical: `/api/faab/free-agent` is a **POST-only $0-grant write**, not a list fetch (route.ts:9). `/players` runs its own full-pool pipeline and **inlines** the `liveOwnedWhere` predicate because it isn't exported from `@app/faab` (loadPlayers.ts:19,96) — parallel logic, zero shared list-layer code.
- **CONFIRMED — the shared card is waivers-owned and `/players` imports it.** `PlayersClient.tsx:13` imports `FaPlayerCardSheet` from `@/src/waivers/FaPlayerCardSheet` — "the ONE cross-module dep" (PlayersClient.tsx:6). Transitively, the card pulls the shared `PlayerStatsTab`, itself consumed by both `PlayerScoreSheet` (vsfield+lineup) and the FA card (components/PlayerStatsTab.tsx:15).
- **CONFIRMED — the MoreSheet "Browse players" fallback still exists.** Hardcoded additive `<Link href="/players">Browse players</Link>` (MoreSheet.tsx:114–115), *not* sourced from `MORE_SHEET_ITEMS`; redundant on mobile now that Players is a first-class bottom tab (crossNav.ts:82) — and the adjacent "first-class Players tab is T15-2's to add" comment is stale. Desktop is unaffected (More sheet doesn't exist ≥640px).
- **CORRECTED — NationFilter is not waivers-owned.** It's a shared component at `apps/web/components/NationFilter.tsx` ("factored out of the draft pool", :3), consumed by **three** surfaces: PlayersClient.tsx:12, waivers BidComposer.tsx:31, waivers FreeAgentPanel.tsx:29.

### R4 — draft's bespoke nation grid vs `NationFilter` · **grid duplication CONFIRMED; the `<Flag>` sub-claim REFUTED**

- **CONFIRMED — draft's grid is bespoke.** `AvailableList` renders an inline `dr-nation-filter` grid with local state (draft/components.tsx:332 `nationGridOpen` useState, :374 markup) and never imports `NationFilter`. The irony is documented at the source: NationFilter was **extracted from the draft pool** for waivers/players reuse (NationFilter.tsx:3,5) — draft was never migrated onto its own extraction. Full picture with R3(d): NationFilter has 3 shared consumers; draft is the 4th nation-grid surface and the only bespoke one.
- **REFUTED — "`<Flag>`/flag.ts not reused by draft".** Draft *owns* the choke point: `<Flag>` lives at `app/draft/Flag.tsx`, and draft consumes it directly (components.tsx:27 import, :36 `CountryFlag` wrapper, :409 in the grid).
- **CORRECTED — the reuse split is primitive-vs-component.** `src/draft/flag.ts` (toIso2/flagEmoji/isHomeNation) is the broadly-reused primitive (~12 importers: draft, NationFilter, PlayerAvatar, pool, PlayerScoreSheet, players, GameDetail, kitOf, waivers, Dashboard, lineup, buildPlayerTournamentStats). The `<Flag>` *component* is reused by NationFilter (NationFilter.tsx:16) but **PlayerAvatar re-implements the home-nation SVG** ("same geometry as Flag.tsx", PlayerAvatar.tsx:11) while importing only the flag.ts resolvers (:15) — so the render markup itself is duplicated once.
- **NEW (P2, a11y):** draft's bespoke grid uses non-semantic `<span onClick>` for both the toggle (components.tsx:376) and every chip (:404) — not focusable, not keyboard/AT operable — while the shared NationFilter uses `<button type="button">` (NationFilter.tsx:37,68). The un-migrated copy is also the less accessible one.

### R5 — "`/standings` and `/playoffs` absent from both nav surfaces" · **REFUTED on both viewports**

- Both are in `NAV_ITEMS` (crossNav.ts:54,64 → desktop strip, AppShell.tsx:224) **and** `MORE_SHEET_ITEMS` (:91,92 → More sheet, MoreSheet.tsx:99).
- **Kernel of truth:** both are absent from the 5 primary mobile bottom tabs (`BOTTOM_TAB_ITEMS` = home/lineup/vsfield/pool/players, crossNav.ts:73–83) — the documented IA §3 decision ("Standings + Playoffs … grouped together in overflow", crossNav.ts:90; playoffs "out of the 4 primary bottom tabs", :86). On mobile they're one level deeper, not unreachable.
- Per-route reachability beyond nav — `/standings`: **zero** inbound links (nav-only on both viewports). `/playoffs`: vsfield KO marquee + dashboard banner/module CTAs (see R1d), all on both viewports. `/settings`: nav-only. `/draft`: nav + dashboard CTAs + marketing card. `/commish`: gated, both viewports. `/games`: deep-link-only from three both-viewport hosts. **No route is single-viewport-only**, and no dashboard module is CSS-hidden at any width (dashboard.css:615,643 — column changes only), so the plan's F-P3-B2-adjacent worry about viewport-dependent link loss doesn't materialize in nav/links.
- The linked decision in the plan ("promote / keep contextual / retire") is thus about **bottom-bar promotion and mobile depth**, not about rescuing unreachable routes.

## 4. Route tree vs plan §2 + inventory gaps

Actual tree: **15 `page.tsx`** (`/`, `/auth/denied`, `/commish`, `/draft`, `/games/[matchId]`, `/lineup`, `/players`, `/playoffs`, `/pool`, `/scoring`, `/settings`, `/sign-in`, `/standings`, `/vsfield`, `/waivers`) + **2 non-API `route.ts`** (`/auth/callback`, `/auth/sign-out`) + 13 `loading.tsx` + root `error.tsx`/`not-found.tsx` + games `not-found.tsx`. No screen exists in the repo that isn't listed here; `/api/*` are non-screen handlers.

Gaps found in the plan, ordered by materiality:

1. **§2's "Nav placement" column is single-surface (mobile-only) and wrong for its two `?`-rows.** `/standings` "Not in either nav — reached via dashboard module" (§2:36) and `/playoffs` "Not in nav — entry point unclear" (§2:37) are both false on both counts (see R2, R1, R5): both routes are desktop-strip + More-sheet items, the dashboard module links to `/vsfield` instead, and `/playoffs` has multiple contextual CTAs. Likewise every "More sheet" row (`/scoring`, `/waivers`, `/draft`, `/settings`) and every "Bottom bar" row is *also* a desktop top-strip item.
2. **`/auth/denied` is missing from §2**, so "4 auth/marketing surfaces" (§2:45) undercounts — it's 5. Root cause: §2 derived its route set from "11 `loading.tsx` routes + `/` + `/games`" (§2:23), and `/auth/denied` is a static page with no `loading.tsx` (denied/page.tsx:5) — the enumeration method structurally drops it. It is one of the most-reached auth surfaces (all three callback failure reasons, every gated page's non-ok redirect, the landing Denied state).
3. **R5's premise conflates "not a bottom tab" with "not in nav"** — the actual open question it leaves is bottom-bar promotion for the UCL Swiss table, not reachability repair.
4. **"13 authenticated routes (12 rendered + `/games`)" — CONFIRMED.** All §2 archetypes CONFIRMED against each route's `RouteSkeleton` variant (draft=cockpit, settings=form, standings=list, playoffs=board, commish=list, etc.), so every `~`/`?` archetype marker upgrades to ✓ — except `/games`, marked "—" but actually using the **pitch** variant (games/[matchId]/loading.tsx:84).
5. **`/` is a 4-way branch** — `selectLandingView` returns `signin | hub | unlinked | denied` on the same route (selectLandingView.ts:13; page.tsx:53). §2 inventories 2 of the 4 states (hub, marketing); `unlinked`/`denied` are inline states, worth a footnote row.
6. **§4's bottom-bar order is off**: actual order is Dashboard · Set lineup · Vs the field · **Quiniela · Players** · More (crossNav.ts:74–82) — Players is 5th, after Pool, and Pool's user-facing label is "Quiniela".
7. **Un-inventoried mobile redundancy:** the hardcoded More-sheet "Browse players" link (MoreSheet.tsx:114–116) duplicates the Players bottom tab on mobile (R3c) — a nav row §2 doesn't have.
8. **Stale in-code comments found on the way** (no action taken, read-only pass): AppShell.tsx:182–184 and commish/layout.tsx:8–9 claim only the hub threads `isCommissioner`, but 10 layouts now thread `getViewerIsCommissioner`, so the gated Commissioner entry appears on all authed screens for commissioners; MoreSheet's "first-class Players tab is T15-2's to add" comment predates the tab's existence.

## 5. Verification integrity note

7 mapper lanes, each adversarially verified (citations re-read, counter-evidence searched), plus a completeness critic. Verifiers **held** R1/R2/R3/R5; the nav-matrix verifier caught one summary typo (5, not 4, routes are desktop+bottom — the table itself was correct); the inventory-crosscheck verifier caught that lane's miss of gap #1 (independently established by four other lanes). R4's re-run returned a malformed placeholder and was discarded — its adjudication above rests on the original fully-cited lane report, independently confirmed line-by-line by its verifier and the critic. The single most load-bearing fact (crossNav.ts:54/64/91/92 placement of `/standings` + `/playoffs`) was independently confirmed by five lanes and by direct read during synthesis.
