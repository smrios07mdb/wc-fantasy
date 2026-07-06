# T15-1 — 360px viewport clips: DIAGNOSIS NOTES (read-only, docs-only)

- **Date:** 2026-07-06
- **Baseline:** `origin/main` @ `cfab03b` (re-derived via `git ls-remote origin -h refs/heads/main` at thread open).
- **Class:** read-only confirmation pass over the existing T15 audit inventory (`audit/AUDIT_T15_mobile_ux.md`). NOT a fresh audit. No source/test/schema touched. No fix proposed as code.
- **Mission:** produce a complete 360px-clip inventory (file:line + CSS rule), each with a REPRODUCES-AT-360 verdict; split reachable-now vs phase-gated; split source/headless-confirmable vs Sergio device-gate; propose the fix-thread shape + exact rule/site list. Do NOT write the fix.
- **Live-verify posture:** the deployed surface (`https://wc-fantasy-web.onrender.com`) is auth-gated (allowlist + magic-link) on every clip surface, and **no Chrome extension is connected to this session** (`list_connected_browsers → []`). A live 360px headless/browser capture was therefore not run. All four clips are **deterministic CSS-geometry defects** (fixed grid-track sums / natural table min-width exceeding the available container, with `overflow:hidden` and no scroll fallback) — the static geometry IS the proof of reproduction; they do not depend on which manager is signed in. Live capture remains available on request if Sergio connects the extension and signs in. See §3 for the confirmable-vs-device-gate split.

---

## 1. Complete 360px-clip inventory

Four clips total: three P0 + one P1. All are the same defect class — a fixed-track grid or an auto-layout table whose minimum content width exceeds the available container, clipped (not scrolled) by an `overflow:hidden` ancestor. All four have a designed mobile treatment in `design/design_reference/` that was never ported.

### CLIP-1 · F-P0-B1 — /standings Matchday tab: Points/trailing columns clipped (default tab on load)

- **Severity:** P0
- **Screen+state:** `/standings` · Matchday tab (`useState('matchday')` default), any tournament phase.
- **Location / rule:** `apps/web/app/standings/standings.css:98-102,153-161` — `.st-head-md`/`.st-mdrow` set `grid-template-columns: 36px minmax(120px,1fr) 100px 64px` + 8px gaps ⇒ **344px min content width**. Clipped by `.st-table { overflow: hidden }` (`standings.css:78`), no `overflow-x` fallback.
- **Geometry at 360px:** `.st-app` 14px/side padding (`standings.css:441-444`) + `.st-table` 1px border + `.st-mdrow` 14px/side padding leave **~302px** available at 360px (~332px at 390px). Shortfall vs the 344px track sum = **~42px at 360px / ~12px at 390px**, silently clipped off the right edge (the rightmost `64px` PF/points track). No scroll gesture reveals it.
- **REPRODUCES-AT-360:** **YES — deterministic.** 344px required > 302px available. Confirmed clean at ≥720px only via the desktop grid; the ≤480px path uses the same fixed track.

### CLIP-2 · F-P1-B1 — /standings Cumulative tab: expand-chevron + trend columns clipped

- **Severity:** P1 (same route/CSS family as CLIP-1; folded into the same fix thread)
- **Screen+state:** `/standings` · Cumulative (group table) tab.
- **Location / rule:** `apps/web/app/standings/standings.css:430-440` — below 720px, `.st-head`/`.st-row-main` switch to `grid-template-columns: 32px minmax(96px,1fr) 84px 46px 38px 22px` ⇒ **358px min content width**. Same `.st-table { overflow: hidden }` clip (`standings.css:78`).
- **Geometry at 360px:** ~302px available (360px) / ~332px (390px) vs 358px layout. Column boundary math: **PF (points) stays fully visible** in both cases (good), but the trailing `.st-c-move` (▲/▼ trend) column is mostly clipped at 360px, and the `.st-c-chev` column — the row's **only visual "tap to expand" affordance** — is fully clipped at BOTH 360px and 390px. Rows stay technically tappable via the visible portion, but the expand affordance is invisible, so per-matchday breakdown is undiscoverable.
- **REPRODUCES-AT-360:** **YES — deterministic** (chevron fully clipped at 360 AND 390; trend column mostly clipped at 360).

### CLIP-3 · F-P0-E1 — /games/[matchId] tab bar clips the 5th tab out of reach (group match, 5 tabs)

- **Severity:** P0
- **Screen+state:** `/games/[matchId]` · default Lineups tab, on a **completed/live group-stage match that has BOTH team stats and an ingested group table** (⇒ 5 tabs render).
- **Location / rule:**
  - Tab bar: `apps/web/src/games/games.css:268-296` — `.gd-tabbar { display:flex }`, `.gd-tabbtn { flex:1 }`, **no `min-width:0`, no `flex-wrap`, no `overflow-x:auto`**. Flex auto-min-size floors each button at its label's unbreakable min-content width ("Statistics"/"Standings" cannot wrap).
  - Clip: `apps/web/src/games/games.css:1344-1349` — `.gd-app:has(.gd-lineups){ overflow:hidden }` clips the overflowing tail (the Standings button) invisibly while on the default Lineups tab. No scroll affordance ⇒ the 5th tab is untappable AND undiscoverable.
  - Tab count: `apps/web/app/games/[matchId]/GameDetailClient.tsx:1189-1243` — Lineups (always) · Statistics (`view.statistics` gated, :1200) · Events (always) · Ratings (always) · **Standings (`view.standings` gated, :1232)**.
- **Geometry at 360px:** `.gd-app` mobile padding `var(--sp-3)`=12px/side leaves 336px. 5 tabs' min-content+padding (Lineups~65 + Statistics~91 + Events~61 + Ratings~68 + Standings~83) + 4×4px gaps + 10px tabbar padding ≈ **398px** ⇒ ~62px over budget, no wrap, tail clipped.
- **REPRODUCES-AT-360:** **YES — deterministic, but ONLY on 5-tab (group) matches.** A **knockout** match returns `view.standings=null` ⇒ 4 tabs (~310px) ⇒ **fits at 360px, does NOT clip.** So the live current-round knockout game-detail pages are safe; the clip bites whenever anyone opens a *past group match* from dashboard history. (Note: the audit's coverage-matrix row "Standings tab (group match) — 9-column table fits at 360px, no overflow" refers to the Standings *table content*, which is fine; CLIP-3 is the *tab bar*, a distinct element — no contradiction.)

### CLIP-4 · F-P0-F1 — /vsfield Season tab: power-record standings table overflows/clips (no mobile layout)

- **Severity:** P0
- **Screen+state:** `/vsfield` · Season tab (power-record standings).
- **Location / rule:** `apps/web/app/vsfield/components.tsx:778-836` (`SeasonTable`) renders a plain `<table class="dtable">` with 6 columns (# · Manager [avatar + **un-truncated** `<b>{displayName}</b>`] · Record "12-3-1" · Win% · Points · by-period chips). `.dtable` is `table-layout:auto` (`apps/web/app/styles/ds.css:310-318`), never overridden to `fixed` on `.v2-season`; Manager cell has no `max-width`/ellipsis; numeric cells are unbreakable. **No ancestor** (`.vf-scroll`, `.v2-season`) sets `overflow-x:auto` (`apps/web/app/vsfield/vsfield.css:1127-1156`).
- **Geometry at 360px:** natural min content width for real names (e.g. "Maximiliano") easily **450–600px+**; container is well under 300px after `.vf-scroll` 18px padding + shell chrome. The document backstop `html,body { max-width:100%; overflow-x:hidden }` (ds.css) **CLIPS** rather than scrolls ⇒ rightmost columns (Points, by-period chips, sometimes Win%) are genuinely unreachable — no scroll gesture anywhere reveals them.
- **REPRODUCES-AT-360:** **YES — deterministic** (and worse at 430px than the standings cases because the overflow is unbounded, not a fixed shortfall).

---

## 2. Reachable-now (current playoff phase) vs phase-gated

Current tournament phase = **mid-knockout / playoff**.

| Clip | Reachable NOW? | Notes |
|---|---|---|
| CLIP-1 `/standings` Matchday | **Reachable-now** | `/standings` is a first-class nav route (AppShell `standings` icon `AppShell.tsx:95`; RouteSkeleton lists it). The page renders **group-stage data** (group-stage-only by design; cut-line copy is stale post-transition) — historical content, but the route + tab + clip are all live and one tap from More. |
| CLIP-2 `/standings` Cumulative | **Reachable-now** | Same route; sibling tab. |
| CLIP-3 `/games/[matchId]` 5-tab | **Reachable-now, but ONLY on completed group-match detail pages** | Entry via dashboard fixtures / `/vsfield` match cards / `/pool` links. Live **knockout** game-detail = 4 tabs = safe. The clip bites on any past **group** match (5 tabs). So: reachable now via history, NOT on the current live knockout games. |
| CLIP-4 `/vsfield` Season | **Reachable-now, high-traffic** | `/vsfield` is a primary nav tab and a current-phase surface; the Season tab is always present. Highest-traffic of the four. |

**Net:** all four are reachable in the current phase. CLIP-4 is the highest-priority (primary current-phase surface, unbounded overflow); CLIP-1/2 sit on a historical-data route but are still one tap from the nav; CLIP-3 only fires on the group-match history path.

---

## 3. Source/headless-confirmable vs Sergio device-gate

**Source-confirmed (deterministic CSS geometry) — all four.** Each is a fixed-track-sum-or-auto-table-min-width vs available-container overflow with an `overflow:hidden` clip and no scroll fallback. The numbers in §1 are the proof; these reproduce at 360px CSS width regardless of session/data. This confirms the audit's `verified-static` confidence — T15-1 adds nothing to overturn it.

**Headless-confirmable (if auth available):** all four would render identically at 360px CSS width in any authenticated session; a headless 360px screenshot would show the clip. **Not run this thread** — no connected Chrome extension, and the surfaces are auth-gated. Available on request.

**Sergio device-gate (needs live data / real viewport):**
- **CLIP-3 live-data reachability:** confirm a completed **group** match with **both** `view.statistics` and `view.standings` ingested actually exists in prod and opens with 5 tabs (the builder returns null for either ⇒ fewer tabs ⇒ no clip). Deterministic given 5 tabs; the *precondition* is data-dependent.
- **Dynamic-viewport / notch interplay:** whether iOS Safari's dynamic viewport (URL bar collapse) + notch/safe-area shifts the effective CSS width enough to change the exact clip boundary by a few px on CLIP-1/CLIP-2 (the shortfall there is only ~12px at 390px). CLIP-3/CLIP-4 have large enough margins (~62px / unbounded) that no device nuance saves them.
- **On-device eyeball at 360–390px** of `/vsfield` Season and `/standings` (both tabs) to see the clipped columns in situ — consistent with the device gates Sergio already owes on sibling T15 threads.

---

## 4. Proposed fix-thread shape (NOT written here)

**Shape:** one small CSS-only fix thread, theme **`responsive-table-overflow`** (the audit's own fix-theme tag for CLIP-1/2/4) + a flex tab-bar fix for CLIP-3. No TSX logic change required for the tables (CLIP-4 may want a `min-width:0`/ellipsis on the Manager cell rather than a scroll wrapper, matching the ported mobile list). No schema, no scoring, no resolver — low blast radius, CSS-only, gate = typecheck/lint/format/build + the existing DOM tests.

**Exact rule/site list the fix will touch (all CSS unless noted):**

1. **CLIP-1** — `apps/web/app/standings/standings.css:78` (`.st-table { overflow:hidden }`) and `:98-102,153-161` (`.st-head-md`/`.st-mdrow` fixed grid). Options: add `overflow-x:auto` scroll fallback on `.st-table`, or reflow to the reference's stacked mobile card (`design/design_reference/standings/mobile.jsx`) below 480px. Prefer the reference card port over horizontal scroll for a leaderboard.
2. **CLIP-2** — `apps/web/app/standings/standings.css:78` (same clip) and `:430-440` (`.st-head`/`.st-row-main` ≤720px fixed grid). Same remedy; at minimum ensure the `.st-c-chev` expand affordance is never clipped (it is the sole discovery cue for per-matchday breakdown).
3. **CLIP-3** — `apps/web/src/games/games.css:268-296` (`.gd-tabbar`/`.gd-tabbtn`: add `overflow-x:auto` + `min-width:0`/`flex:0 0 auto` or `flex-wrap`, and a scroll affordance) and `:1344-1349` (`.gd-app:has(.gd-lineups){overflow:hidden}` must not clip the tab row — scope the `overflow:hidden` to the pitch content, not the tab bar's ancestor). No TSX change to the tab-render conditionals (`GameDetailClient.tsx:1189-1243`) needed.
4. **CLIP-4** — `apps/web/app/vsfield/vsfield.css:1127-1156` (`.v2-season`/`.dtable`: add `overflow-x:auto` wrapper OR `table-layout:fixed` + `min-width:0`/ellipsis on the Manager cell) and/or port the reference stacked list (`MobSeason` in the vsfield reference). `apps/web/app/vsfield/components.tsx:778-836` (`SeasonTable`) only if a stacked-list port is chosen over a scroll wrapper.

**Sequencing note:** CLIP-4 first (primary current-phase surface, worst overflow), then CLIP-1/2 (same file, batch together), then CLIP-3. A red DOM/geometry test per surface at 360px (element bounds vs container, per the mobile-page-fit precedent) should anchor the fix TDD-style.

---

## Appendix A — gap-fill sweep (clip sources the cluster audit might have missed)

Ran `grep -rnE "min-width:[0-9]{3}|width:[0-9]{3}px|white-space:nowrap|overflow-x"` across `apps/web/app` + `apps/web/src` CSS/TSX. **No new clip source found beyond the four above.** Every other fixed-width or nowrap resolved to a non-clip:

- **Scroll-contained** (fixed-width child inside an `overflow-x:auto` strip): `.v2-match{min-width:148px}` in `.v2-matchstrip-scroll` (vsfield.css:119-130); `.gd-*` match strip (games.css:95); draft board `overflow-x:auto` (draft.css:96); commish `overflow-x:auto` (commish.css:91); playoffs bracket `overflow-x:auto` + `min-width:150px` (playoffs.css:1214-1219). All correct.
- **Centered / absolutely-positioned graphics** < 360px: champion trophy `width:168px` (knockout.css:527); cut-ceremony `koc-mech 230px`/`koc-trophy 140px`/`koc-mach 132px` (knockout.css:722-743); pitch centre-circle `width:130px` (games.css:469); playoffs machete `width:150px` (playoffs.css:462). None clip.
- **Desktop-only / mobile-restacked**: `.da-lb{width:228px}` vsfield left rail (vsfield.css:202) and `.po-hero-me{width:300px}` playoffs survival panel (playoffs.css:485) are desktop split-layout rails; the audit's F and K clusters read both files end-to-end and found the mobile layouts restack them (no clip finding filed). `knockout.css:949-957` widths are inside `@media (min-width:761px)` (desktop). `.drawer{width:380px}` is the never-mounted draft drawer (dead surface).
- **`white-space:nowrap`** hits are all on pills/badges/tokens/eyebrows carrying short strings — none are wide rows.

Conclusion: T15-1 **confirms** the audit's clip inventory is complete. This is a confirmation pass, not a discovery — no gap found.

## Appendix B — flagged fence CI-gap check (timeTruthFence)

The `d4df16c` note raised a possible "fence-CI-gap" on `timeTruthFence.test.ts` (does it gate CI or run non-blocking?). **Checked read-only:**

- The test lives at `apps/web/src/fences/timeTruthFence.test.ts`.
- Root `test` script = `vitest run` (`package.json:12`); the single root `vitest.config.ts` collects the whole tree.
- `npx vitest list --run` confirms the fence's cases ARE collected (`timeTruthFence.test.ts > time-truth fence — … > bans getUTC* …`, `bans literal timeZone strings`, etc.).
- `.github/workflows/ci.yml:50-51` runs `pnpm test` as a plain step with **no `continue-on-error`** ⇒ blocking.

**Verdict: the fence-CI-gap is NOT real.** `timeTruthFence.test.ts` runs inside the blocking `pnpm test` CI step; a fence violation fails CI. No action needed. (Flagged for Chat.)

---

## 5. CLOSEOUT — FIX delivered, CLOSED-pending-gate (2026-07-06)

**Status:** implemented on `worktree-t15-1-viewport-clips` (branched from `4d29867`, the diagnosis tip). **MERGE HELD** for Sergio's on-device 360px gate (real iPhone width, incl. the CLIP-1/2 dynamic-viewport / notch ~12px margin called out in §3). CSS-only + one JSX-className wrap; no loader/engine/schema/RLS/migration/Realtime touched.

**Per-clip before → after** (all mirror the existing repo scroll idiom — `.st-season-scroll` / `.sh-topnav-scroll` = `overflow-x:auto` + `min-width:0`; no new pattern invented):

| Clip | File:rule changed | Before | After | Scope |
|---|---|---|---|---|
| CLIP-4 (P0) /vsfield Season | `vsfield/components.tsx` SeasonTable (JSX className only) + `vsfield.css` new `.v2-season-scroll` | 6-col `.dtable` (un-truncated displayName) clipped by document backstop | `.dtable` wrapped in `.v2-season-scroll{overflow-x:auto}` → row reachable by scroll | NEW wrapper; base `.dtable` untouched |
| CLIP-1 (P0) /standings Matchday | `standings/standings.css` `.st-table` | `overflow:hidden` clipped the 344px fixed grid | `overflow-x:auto` → grid scrolls in unison (header+rows share the flex-column scroll port) | `.st-table` only (standings-scoped) |
| CLIP-2 (P1) /standings Cumulative | same rule (`.st-table`) | expand-chevron / trend column clipped off right edge | same `overflow-x:auto` → 358px grid scrolls; chevron reachable | batched with CLIP-1 |
| CLIP-3 (P0, phase-gated) /games tab bar | `src/games/games.css` `.gd-tabbar` | 5-tab group bar (~398px) clipped tail; 5th tab unreachable | `min-width:0` + `overflow-x:auto` → tabs scroll internally; engages only on overflow so 4-tab knockout + desktop keep flex:1 stretch | `.gd-tabbar` only |

**Deviation from the proposed shape (deliberate, safer):** the CLIP-3 note suggested also removing the tab row from the `games.css:1344-1349` `.gd-app:has(.gd-lineups){overflow:hidden}` swallow. Not done — scoping the scroll to `.gd-tabbar` itself makes the bar scroll internally so it never overflows *any* ancestor (document backstop OR the lineups-tab clip), in every tab state. Touching the `:has(.gd-lineups)` rule was avoided because it is the load-bearing **vertical** overflow:hidden of the pitch-fill height model documented at `games.css:1314-1343`; leaving it intact removes risk with no loss of coverage.

**Blast-radius guards held (asserted in the test):**
- The shared base `.dtable` rule (`vsfield/ds.css:331`, also used by /waivers TeamBudgetsRail etc.) was **NOT** edited — scroll lives only on the new `.v2-season-scroll` wrapper.
- The `html,body{max-width:100%;overflow-x:hidden}` document backstop (`ds.css:413`, replicated byte-identically across the 5 per-route `ds.css` copies — guarded by `appShell.test.ts`) was **NOT** touched. The byte-identical-ds.css test still passes.

**Tests:** new `apps/web/src/mobile/viewport360Clips.test.ts` — 9 cases, red→green. Per clip it (a) proves the defect numerically from the CSS grid tracks / tab min-content vs a 360px budget, then (b) asserts the scoped scroll fallback exists; plus two blast-radius guards (base `.dtable` gains no overflow; `html,body` backstop preserved). Source-contract style per the repo precedent (`appShell.test.ts` — Vitest has no layout engine).

**DoD gate (green):** typecheck ✓ · lint ✓ · format:check ✓ · `pnpm test` 3403 passed / 0 failed (+9 new) ✓ · `@app/web` build ✓. Fence verifiers GREEN **unmodified**: the-cut (43), players (14, incl. mobile360), playoffs-hero, pitch-layout (40, incl. 360/390). No DB/RLS/scoring touched → Postgres integration suite N/A.

**Awaiting:** Sergio's on-device 360–390px eyeball on `/vsfield` Season, `/standings` (both tabs), and a past **group** `/games/[matchId]` (5-tab). Then merge.
