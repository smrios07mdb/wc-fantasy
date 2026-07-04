# AUDIT — T15-A: Mobile UX/UI (READ-ONLY discovery, no sampling)

- **Date:** 2026-07-03
- **Branch:** `audit/t15-mobile-ux` (worktree off `main` @ `1e51201`)
- **Mission:** the complete, prioritized mobile punch-list for XI — The Starting Eleven, treated as a MOBILE-FIRST product (~12 managers, on phones, live, mid-knockout). Bar: Apple-feature-worthy. This audit feeds the T15 fix-thread sequence; nothing was fixed here.
- **Scope:** every route under `apps/web/app` (15 user-facing routes + the AppShell/bottom-nav layer + the CSS system + shared components), every enumerable screen state, audited statically at 360/390/430 px against the canonical design source `design/design_reference/` + `design/CLAUDE.md`.
- **Method:** 11 parallel read-only cluster auditors (A–K: shell/nav, dashboard+landing+standings, lineup, waivers, game-detail, vsfield+pool, commish, auth+settings, CSS system, dead surfaces, playoffs theater) + a completeness critic + 5 targeted gap-fill auditors for cross-surface lanes the clusters could each miss (timezone consistency, error/404 boundaries, PlayerScoreSheet consistency, period-selector consistency, NationFilter). 18 agent passes total, ~3.2M tokens, 648 tool calls. Every cluster read its scope files end-to-end (no sampling; `files_read` audited by the critic against a glob of the app tree). Cross-cluster duplicates were merged in synthesis — each standing finding lists its independently-reported instances, so corroboration is visible rather than double-counted.
- **Anchored ground truth (per the audit brief, not re-litigated):** FAAB $100 is one-time for the tournament, never reset (the reference's "playoff reset" copy is stale); the per-position FAAB claim cap is retired (TOTAL-15 only); `/vsfield`'s prior-matchday selector has no reveal gate by design; `/pool` has no Realtime subscription by locked decision.
- **Constraint compliance:** report-only. No source/test/config/brain file modified; the only working-tree additions are this file and `audit/T15_LIVE_WALKTHROUGH.md`, committed with `[skip render]`.

---

## 1. Summary

### 1a. Findings by severity

| Severity | Standing findings | Raw reports (pre-merge) | IDs |
|---|---|---|---|
| **P0** | 3 | 3 | F-P0-B1, F-P0-E1, F-P0-F1 |
| **P1** | 20 | 24 | F-P1-B1, F-P1-C1, F-P1-C2, F-P1-D1, F-P1-D2, F-P1-E1, F-P1-F1, F-P1-F2, F-P1-G1, F-P1-H1, F-P1-I1, F-P1-I2, F-P1-J1, F-P1-J2, F-P1-J3, F-P1-J4, F-P1-K1, F-P1-ERR1, F-P1-ERR2, F-P1-TZ1 |
| **P2** | 55 | 84 | F-P2-A1, F-P2-A2, F-P2-A3, F-P2-A4, F-P2-B1, F-P2-B2, F-P2-B3, F-P2-C1, F-P2-C2, F-P2-C3, F-P2-C4, F-P2-C5, F-P2-C6, F-P2-D1, F-P2-D2, F-P2-D3, F-P2-E1, F-P2-E2, F-P2-E3, F-P2-E4, F-P2-G1, F-P2-G2, F-P2-G3, F-P2-G4, F-P2-H1, F-P2-H2, F-P2-H3, F-P2-H4, F-P2-H5, F-P2-H6, F-P2-H7, F-P2-I1, F-P2-I2, F-P2-I3, F-P2-I4, F-P2-I5, F-P2-I6, F-P2-I7, F-P2-J1, F-P2-J2, F-P2-J3, F-P2-K1, F-P2-K2, F-P2-K3, F-P2-K4, F-P2-NF1, F-P2-PSC1, F-P2-PSC2, F-P2-PSC3, F-P2-PER1, F-P2-PER2, F-P2-ERR1, F-P2-TZ1, F-P2-TZ2, F-P2-TZ3 |
| **P3** | 37 | 41 | F-P3-A1, F-P3-A2, F-P3-A3, F-P3-A4, F-P3-A5, F-P3-B1, F-P3-B2, F-P3-C1, F-P3-D1, F-P3-E1, F-P3-E2, F-P3-E3, F-P3-F1, F-P3-F2, F-P3-F3, F-P3-G1, F-P3-G2, F-P3-G3, F-P3-H1, F-P3-H2, F-P3-I1, F-P3-I2, F-P3-I3, F-P3-I4, F-P3-I5, F-P3-J1, F-P3-J2, F-P3-K1, F-P3-K2, F-P3-K3, F-P3-K4, F-P3-NF1, F-P3-PSC1, F-P3-PER1, F-P3-PER2, F-P3-ERR1, F-P3-TZ1 |
| **Total** | 115 | 152 | |

Confidence split: 87 of 115 standing findings are **verified-static** (geometry/behavior provable from code); 28 carry **needs-live-verify** and map to numbered steps in `audit/T15_LIVE_WALKTHROUGH.md`, alongside the 88 raw live-verify checks the auditors emitted.

### 1b. Headline

The app is structurally healthier on mobile than the T15 backlog row assumed: a bottom-tab AppShell **already exists and mounts on every authenticated route**, tab targets clear 44px, safe-area-bottom is handled, the manifest/icon set is complete, dark theming is disciplined and gold-free, and the money copy is right — the stale "FAAB resets at playoffs" language was verifiably NOT ported (only dead class names/comments remain). The overhaul direction is therefore *fix the shell's collisions and finish the system*, not build a shell.

What actually bites, in order:

1. **Three P0s clip core content at real phone widths.** The `/standings` default (Matchday) tab clips the Points column entirely at 360–390px (`overflow:hidden`, no scroll fallback); `/games/[matchId]` clips the 5th tab (Standings) out of existence on any completed group match; `/vsfield`'s Season tab reuses the desktop table verbatim and loses its right columns. All three are the classic fixed-track-grid/flex-min-content overflow, all have designed mobile treatments in the reference that were never ported (F-P0-B1, F-P0-E1, F-P0-F1).
2. **The shell fights the screens it hosts (z-index inversion).** The fixed bottom nav (z-100) paints over every modal scrim except the score sheet — the waivers bid composer (z-90), the FA player card (z-95), pool drill-ins (z-50) — and stays *tappable* over open modals; `/lineup`'s sticky SaveBar (the primary Save action plus the only legality-error line) pins *inside* the nav's band (F-P1-I1, F-P1-C1).
3. **iOS keyboards defeat the forms.** Every text input in the system renders at 13–15px, so iOS zooms on every focus, app-wide, starting at the sign-in email (F-P1-I2). Worse: the commissioner's type-to-confirm words ("FREEZE", "CUT") fight autocapitalize — the case-sensitive gate on the two most consequential irreversible actions can silently refuse to arm on a stock iPhone keyboard (F-P1-G1).
4. **Guillotine legibility gaps on the two playoff surfaces.** `/playoffs` mobile paints an *eliminated* manager's rank in the cobalt "safe" accent (state keyed off the wrong flag; desktop does it right) (F-P1-K1); `/vsfield` silently shrinks the field when a manager is cut, with zero explanatory copy (F-P1-F1).
5. **Time renders three different ways.** Dashboard and `/games` print bare unlabeled UTC (~4h off for the prod league), `/lineup`/`/waivers` correctly print league-local with zone, `/pool` hardcodes America/New_York + "ET" (F-P1-TZ1 + F-P2-TZ1..3).
6. **The rulebook lies.** `/scoring` is wrong against the live engine in three sections — §1 rating bands (mislabeled, 0-band missing), §4 possession-lost divisor (says ÷3, engine ÷10; all four worked examples use the stale math) plus five scored categories missing entirely, §8 straight-red values one point harsher than the engine in every band (F-P1-J1..J3).
7. **No safety nets.** Zero `not-found.tsx`/`error.tsx`/`loading.tsx` anywhere: bad URLs and server exceptions render Next's white, unbranded, nav-less defaults on a dark app; tab switches on stadium cellular freeze with no skeleton (F-P1-ERR1/2, F-P2-ERR1).
8. **Waivers mobile buries the point of the screen.** The media query stacks the entire desktop rail (~1000–1200px of read-only budgets/order tables) *above* the claims content and the "+ New claim" button (F-P1-D1).

The P2 band is dominated by finish-the-system items: legacy `vh` on sheet heights, no scroll containment anywhere, a 22-value breakpoint zoo, five byte-identical ds.css copies, render-blocking Google-Fonts `@import`, an unreachable light theme, and a systemic sub-44px tap-target sweep. The P3 band is the delight backlog (motion cues, score pulses, empty-state charm, wayfinding niceties).

### 1c. Coverage roll-up

180 route×state cells audited across 16 lanes: **144 audited-static · 27 needs-live-verify · 9 dead-surface** (dead = draft-room live states now historically unreachable, never-dispatched "stale" ConnPill branches on the live surfaces, and view-as, which does not exist in the live console — recorded as a reference delta). Census corrections surfaced by the audit: there is **no `/games` index route** (game-detail entry is dashboard fixtures + `/vsfield` match cards + `/pool` links); **NationFilter is waivers-only** (the "lineup+waivers" claim in project memory is stale); the draft-room post-draft summary screen exists in code but is never rendered (dead code).

---

## 2. Coverage matrix

Status legend: `audited-static` = geometry/behavior established by reading code · `needs-live-verify` = mapped to a walkthrough step · `dead-surface` = unreachable/inert today. One row per route×state cell per reporting cluster (a few cells appear under two clusters — both perspectives kept deliberately).

| Route | State | Status | Cluster | Notes |
|---|---|---|---|---|
| `(any force-dynamic route)` | uncaught server exception (e.g. Prisma unreachable during matchday spike) → buil | needs-live-verify | GAP:no-error-404-boundaries | No error.tsx/global-error.tsx. global-error replaces root layout → likely loses ds.css entirely. Highest-plausibility dead-end under live load; confirm rendering by forcing a DB failure. |
| `(unmatched URL, e.g. /zzz)` | no route match → Next built-in default 404 (reached by unauthenticated AND authe | needs-live-verify | GAP:no-error-404-boundaries | No root not-found.tsx. Dark inheritance from ds.css body rule is likely overridden by Next's injected body{#fff/#000} style → white on light-mode phone. No nav/back. Verify on-device (light + dark scheme). |
| `/` | dashboard complete phase | audited-static | B |  |
| `/` | dashboard group phase (historical) | audited-static | B |  |
| `/` | dashboard knockout/playoff phase (CURRENT) | audited-static | B |  |
| `/` | dashboard loading/error | audited-static | B | no loading.tsx/error.tsx exists for this route — see finding |
| `/` | dashboard pre-draft/draft phase (historical) | audited-static | B | read for context; not a weighted cell but no additional findings beyond the tap-target/loading items already reported |
| `/` | denied (not allowlisted) | audited-static | B |  |
| `/` | signed-in hub · shell chrome (bottom nav, active=home) | audited-static | A | page.tsx:85 wraps Dashboard in AppShell; Dashboard tab primary. Bottom bar mounts. |
| `/` | signed-in unlinked | audited-static | B |  |
| `/` | signed-out marketing | audited-static | B |  |
| `/` | signed-out marketing · no shell | audited-static | A | page.tsx renders MarketingLanding with lp-* chrome, no AppShell — correct (no nav for logged-out). |
| `/ (dashboard)` | group phase · MatchdayModule scheduled fixture kickoff | audited-static | GAP:kickoff-time-zone-inconsistency | formatKickoffTime (Dashboard.tsx:459-462) = bare UTC 'HH:mm', no suffix. P1. Group-phase-gated, not on-screen in current playoff phase. |
| `/ (dashboard)` | pre-kickoff phase · PrimaryBanner big + 'First kick' secondary | audited-static | GAP:kickoff-time-zone-inconsistency | formatKickoffDate/Short (PrimaryBanner.tsx:316-362) = bare UTC; ' UTC' suffix claimed in comment (line 316) but never appended (line 338). P2. Pre-kickoff-gated. |
| `/auth/denied` | idle | audited-static | H | Explains the allowlist and offers 'ask the commissioner' plus a working 'Back to sign in' recovery path — not a dead end, but overly generic/alarming for the expired-link case. |
| `/commish` | Game operations tab @360px | audited-static | G | Freeze button ~26px tap target (#4), borderless freeze rows (#2). Frozen state IS legible (is-frozen bg tint + 'Frozen — unfreeze' + 'frozen since' + live pill + System-status frozen count) — clean on legibility. |
| `/commish` | Playoff cuts tab @360px | audited-static | G | Findings: tab overflow (#5), borderless rows + lost cut-highlight border (#2), cut-table name truncation (#6), CUT confirm-word keyboard (#1). Champion/blocked banners render (backgrounds survive, borders don't). |
| `/commish` | Roster & lineup repair tab @360px | audited-static | G | Checklist tap targets ~20px (#4), borderless selects (#2), FA search present + capped at 40 rows (good). Lock-on-play / kickoff guard explained in copy. |
| `/commish` | Stat corrections tab @360px | audited-static | G | iOS zoom on selects/steppers (#3), borderless inputs/form groups (#2), statgrid reflows to 2 cols on mobile (acceptable). Frozen-period note + '❄ frozen' option markers render clearly. |
| `/commish` | as manager (expected blocked banner) | dead-surface | G | No in-console blocked banner exists: resolveCommishAccess (commishGate.ts:23-32) redirects any non-commissioner to /auth/denied before the console renders (page.tsx:23-24). The 'copy map' in scope is advanceRefusalCop... |
| `/commish` | audit ledger timestamps (cluster G) | needs-live-verify | GAP:kickoff-time-zone-inconsistency | Cluster G reports UTC-only. Out of my read scope — confirm ledger renders UTC without league-local, then apply the same formatInLeagueTz convention. |
| `/commish` | audit log long-history | audited-static | G | Timestamp hover-only + UTC (#7). Capped at 50 rows, no pagination (acceptable for a ledger). Tone colors (info/warn/danger) render; Reverse is intentionally inert/disabled. |
| `/commish` | bottom-of-page safe-area / fixed-nav clearance | needs-live-verify | G | commish.css has flat 32px bottom padding and no env(safe-area-inset-bottom); clearance depends on AppShell (#10). |
| `/commish` | confirm/advance cut modal | audited-static | G | P1 keyboard defect (#1). Irreversibility copy names eliminated managers + champion in full (good). Danger-styled apply button; disabled-while-pending double-tap guard present. |
| `/commish` | frozen-period indicator | audited-static | G | Clean/legible: is-frozen row styling, 'frozen since' + held-corrections count, System-status 'Frozen periods' warn count, and '❄ frozen' markers in match/period selects. |
| `/commish` | mutation pending / error | audited-static | G | Clean: every mutating button is disabled-while-pending (double-tap protection on irreversible cut/freeze), errorText maps codes to human copy, .adm-msg is-ok/is-err surfaces present. Success green uses an off-token ha... |
| `/commish` | repair flow (add / trim / lineup) | audited-static | G | Dry-run-first, reason-required, partial-success (audit_pending/restate_pending) surfaced loudly. Checklist tap targets (#4), borderless selects (#2). Preview + Apply both disabled-while-pending. |
| `/commish` | shell chrome (commissioner-gated, active=commish) | audited-static | A | commish/layout.tsx:20 passes isCommissioner; More lights, commish entry appended in sheet. |
| `/commish` | stat-editor modal open | audited-static | G | Editor is inline (not an overlay) — no scroll-lock/close-affordance issues. Position-aware dimming (scoresForRole) works; per-field feed baseline shown. Number inputs zoom on iOS (#3) and lack inputmode (#9). |
| `/commish` | type-to-confirm freeze modal | audited-static | G | P1 keyboard defect (#1). Inline confirm (not fixed-bottom) so no hard keyboard occlusion, but confirm button sits under the reason field (#9). Corrected freeze-effect copy is accurate (restatement-gate only). |
| `/commish` | view-as / impersonation | audited-static | G | PRESENT (not a dead surface): ViewAsSwitcher + ?as= read-only inspector + ManagerView banner, matching the reference. Polish gaps only: dropdown dismissal + scroll chaining + small option targets (#8). |
| `/draft` | active/live draft (historical) | dead-surface | J | ClockBar/Ticker/AvailableList/QueuePanel/pick-toast paths are unreachable today; toast-vs-bottom-nav z-index defect and board-header overflow risk documented here for when/if a future draft runs. |
| `/draft` | loading / error (no-draft-yet state) | audited-static | J | page.tsx:20-30 renders a clean centered card if no draft row exists; not actually reachable in prod since the draft already exists, but geometry is sound at 360px. |
| `/draft` | mobile <640px (dormant post-draft surface) | dead-surface | I | Audited anyway: 100dvh + overflow:hidden vs bottom nav collision (P3 finding); density pinned compact; board hidden <960px behind tabs. No action needed unless the room is reused. |
| `/draft` | post-draft as commissioner | audited-static | J | ClockEditor misleading-dead-UI + undefined .btn-secondary + iOS-zoom input font-size all land here. |
| `/draft` | post-draft as manager | audited-static | J | Board+RosterPanel tabs render correctly gated (Ticker/ClockBar/timer-toggle/Force-pick all off); Realtime+availablePlayers over-fetch findings apply here. |
| `/draft` | pre-draft lobby (historical) | dead-surface | J | draft.status is permanently 'complete' in prod; Lobby component code path is unreachable today. |
| `/draft` | shell chrome (More sheet, active=draft) · fixed-height 100dvh model | needs-live-verify | A | draft/layout.tsx:17; .dr-app height:100dvh;overflow:hidden — confirm bottom content not hidden behind 58px fixed bar on a phone. |
| `/games/[matchId]` | Events tab | audited-static | E | Long-name overlap risk (P2), otherwise timeline ordering/markers/anomaly banner all check out against buildGameDetail.ts. |
| `/games/[matchId]` | Fpts fantasy chip trigger | audited-static | GAP:playerscoresheet-cross-surface-consistency | Colors by sign/ownership/notability + explicit +/- sign + fpt(s) unit (GameDetailClient.tsx:146-171; games.css:344-383). is-pop has no color → falls through to --accent for any owner (accent-reservation concern). |
| `/games/[matchId]` | Lineups tab | audited-static | E | Pitch fit-to-viewport engineering is deliberate and mostly sound; token tap-target floor (P2) and default-tab tab-bar clipping (P0) are the risks. |
| `/games/[matchId]` | Ratings tab | audited-static | E | Podium marginal-overflow risk (P3); ranked list rows are fine (ellipsis + min-width:0 present). |
| `/games/[matchId]` | Standings tab (group match) | audited-static | E | 9-column table fits comfortably at 360px — mobile padding tightened, team-name column has ellipsis + min-width:0; no overflow found. |
| `/games/[matchId]` | fantasy overlay on lineups | audited-static | E | OwnerChip/YOU-chip/rival-dot all wire correctly to loadGameDetail's ownerByPlayer; matches design's progressive-disclosure intent (dot on pitch, full chip in TeamList). |
| `/games/[matchId]` | fantasy-linked period · PlayerScoreSheet drill-in | audited-static | GAP:playerscoresheet-cross-surface-consistency | onOpen active only when view.periodId present (GameDetailClient.tsx:1156,1263-1269); overlay z-200; info-only, no forfeit. Same shared component + endpoint. |
| `/games/[matchId]` | full-time | audited-static | E | ClockPill 'Full-time' + final score render correctly. |
| `/games/[matchId]` | half-time | audited-static | E | No distinct half-time indicator on the scoreboard status pill — subsumed by the no-live-minute finding; the Events tab does synthesize an internal 'Half-time' marker. |
| `/games/[matchId]` | knockout match with ET/pens | audited-static | E | ET/pens scores never surfaced (P1) — schema has the columns, loader/UI don't use them. |
| `/games/[matchId]` | live in progress | audited-static | E | Tab-bar overflow (P0) and no-live-minute (P2) both apply; scorers row + live fantasy dot wiring look correct. |
| `/games/[matchId]` | loading | audited-static | E | No loading.tsx exists for this route (P2) — confirmed via directory listing. |
| `/games/[matchId]` | no fantasy period (periodId null) · drill-in disabled | dead-surface | GAP:playerscoresheet-cross-surface-consistency | onOpen=null → tokens/rows/chips/podium render as non-button divs (KitToken/LineupRow/StakeStrip/RatingsTab fall-through), no modal reachable. Intentional (modal is period-keyed). |
| `/games/[matchId]` | not-found/error | audited-static | E | matchId column is plain text (no @db.Uuid), so a malformed id gracefully resolves to null → notFound() rather than throwing; no finding. |
| `/games/[matchId]` | player-sheet open | audited-static | E | onOpen wiring (periodId-gated button vs static div) is correct and clear; PlayerScoreSheet internals out of this cluster's scope. |
| `/games/[matchId]` | scheduled (pre-kickoff) | audited-static | E | ClockPill 'Scheduled' + 'v' score placeholder render correctly; team-name squeeze (P3) applies here too. |
| `/games/[matchId]` | scheduled/live scoreboard meta row | audited-static | GAP:kickoff-time-zone-inconsistency | kickoffLabelUtc (buildGameDetail.ts:254-262) rendered at GameDetailClient.tsx:1071 = bare UTC, no suffix. P2. Reachable in current playoff phase. |
| `/games/[matchId]` | shell chrome (bottom nav, active=pool) | audited-static | A | games/[matchId]/layout.tsx:29 hardcodes active=pool; mislights when entered from Dashboard. |
| `/games/[matchId]` | unknown matchId → notFound() at page.tsx:25 (post auth-gate, authed managers onl | needs-live-verify | GAP:no-error-404-boundaries | Same built-in 404 wrapped by root layout only; games layout AppShell (bottom nav) does NOT wrap it. Confirm theme + absence of nav on a real device. |
| `/lineup` | ScorePill trigger (pitch token + bench row, locked/played) | audited-static | GAP:playerscoresheet-cross-surface-consistency | ScorePill colors by lock-state (slate/live); whole token/row is also tappable so the 11px pill is redundant (components.tsx:319,343,427,444). Chip divergence — see score-pill finding. |
| `/lineup` | all-locked (deadline) | audited-static | C | Every token !movable → lockedOnPlay → still tappable to open score sheet; Save reason 'window closed' shown but obscured by nav (P1). No horizontal overflow. |
| `/lineup` | current knockout period pre-kickoff (all movable) | audited-static | C | Tap-select swap works one-handed; eligible highlight + validator gate; no hover-only affordance blocks completion. Formation picker offers only fillable∩lock-legal playoff shapes. SaveBar occlusion (P1) and small tabs... |
| `/lineup` | empty / no-lineup-yet | audited-static | C | Designed card, not blank; 60vh not dvh (P3). Two copy branches (no squad vs no window). |
| `/lineup` | forfeit confirm sheet | audited-static | C | Real modal (fixed, z-200 > nav), Cancel autoFocus/ghost left + Bench&forfeit danger right, backdrop-cancel, >=44px buttons. Missing body-scroll lock/overscroll (P2, minor here). |
| `/lineup` | formation picker open | audited-static | C | Offers only fieldable shapes (hides illegal rather than disabling-with-lock-glyph per reference); single-shape → static indicator. Tabs ~30px tall (P2). |
| `/lineup` | frozen period (commish freeze) | needs-live-verify | C | editable/isMovable ignore frozenAt → may show swappable unplayed players + enabled Save (P2); depends on freeze semantics (restatement-only vs edit-block). |
| `/lineup` | group phase · played-starter, PlayerScoreSheet with forfeitProps | audited-static | GAP:playerscoresheet-cross-surface-consistency | forfeitProps gated to played-starter + non-readOnly (SetLineupClient.tsx:292-303); overlay z-200 above nav OK; header present on Points, absent on Stats (F3). Shared /api/player-box total. |
| `/lineup` | group-phase historical period (read-only) | audited-static | C | Save + picker disabled, tab 'final', tokens dimmed; but read-only not unmistakable at a glance and its clearest signal (SaveBar copy) is nav-occluded (P2). |
| `/lineup` | live knockout round — period tab default + order | audited-static | GAP:period-selector-consistency | Default = shared selectCurrentPeriod live-wave (loadLineup.ts:320-327); active always resolvable because the live wave is never periodIsDone-filtered from `periods`. Tabs ordered by shared sortByPeriodOrder (loadLineu... |
| `/lineup` | loading | needs-live-verify | C | No loading.tsx; force-dynamic SSR shows prior screen until ready (P3). Verify on throttled connection. |
| `/lineup` | mid-gap between rounds | audited-static | GAP:period-selector-consistency | selectCurrentPeriod falls to earliest pending with isCurrent (now < lastKickoff+DURATION → next round). Matches vsfield's identical predicate. Clean. |
| `/lineup` | mid-live (mixed locked/playing/played) | needs-live-verify | C | States render (amber played-starter tappable, red live-dot, steel locked) but legend under-describes them (P2); clock does not re-sample live (P2). Live token transition needs device verify. |
| `/lineup` | nation/country filter surface (census check) | dead-surface | GAP:nationfilter-thin-and-census-mismatch | No NationFilter and no nation-filter control exists — correct by design (fixed pitch squad, no pool). Confirms memory 'lineup+waivers' claim is stale (F5). |
| `/lineup` | player token / bench kickoff (lock deadline) | audited-static | GAP:kickoff-time-zone-inconsistency | KickoffTag (components.tsx:58) → formatInLeagueTz(league.timezone) = league-local wall clock + EDT/EST suffix. Correct reference behavior; no finding. |
| `/lineup` | playoff reduced roster (7 starters / 2 bench, cap<=9) | audited-static | C | Period-driven via period.kind knockout_round; hero reads 'Playoff XI · 7 starters'; offer-set = playoff shapes. playoff-roster-cap message would land in obscured SaveBar/toast. |
| `/lineup` | playoff reduced roster · played-starter | audited-static | GAP:playerscoresheet-cross-surface-consistency | Same modal + forfeit gating; period.kind switches formation set upstream only (SetLineupClient.tsx:152), the sheet/forfeit path is byte-identical to group. No cap-specific divergence in the sheet. |
| `/lineup` | pre-round (round pending, prior done) | audited-static | GAP:period-selector-consistency | Defaults to the upcoming editable wave; also exposes future pending rounds for pre-setting (intentional superset vs vsfield). Not a divergence bug. |
| `/lineup` | prior-matchday snapshot (incl. since-dropped fielded players) | audited-static | C | snapshotPlayers renders the historical XI incl. dropped men + matchday-total banner; interaction inert. Same read-only legibility caveat. |
| `/lineup` | save error (server rejection) | needs-live-verify | C | Error only via in-flow bottom toast → off-screen/behind nav on a scrolled phone (P1). Needs a forced-rejection device test. |
| `/lineup` | shell chrome (bottom nav, active=lineup primary tab) | audited-static | A | lineup/layout.tsx:17 mounts AppShell, isCommissioner threaded. |
| `/lineup · /vsfield · /games` | Points provenance — trigger chip vs modal hero during a live match | needs-live-verify | GAP:playerscoresheet-cross-surface-consistency | Modal total is always /api/player-box (identical in-period). But trigger chips read 3 different server sources: lineup slotMeta.pointsAtStake (SSR, not live-refetched), vsfield starter.points (Realtime), games line.fa... |
| `/playoffs` | ConnPill stale/Delayed branch | dead-surface | K | never produced by onStatus (PlayoffsClient:136-143); component + CSS branch unreachable |
| `/playoffs` | boundary tie zone (mobile) | needs-live-verify | K | cutBoundaryIndex/myMargin handle the whole-tied-set; .mpo-victims no-wrap clip risk unverified at real tie size |
| `/playoffs` | champion endgame (mobile) | audited-static | K | .mpo-hero.is-champion win/accent override present & correct (playoffs.css:603-622); 'You win'/'{name} wins' |
| `/playoffs` | eliminated-manager view (mobile) | audited-static | K | myband mis-signals (P1); board defaults to current live round the viewer isn't in; must roundnav back to self |
| `/playoffs` | error / failed refetch (mobile) | needs-live-verify | K | failed /api/playoffs silently keeps stale data, no error surface; initial-load throw path (error boundary) not inspected |
| `/playoffs` | future rounds / ladder (mobile) | audited-static | K | mobile ladder is a vertical stack; .po-col-future bleed does NOT apply (no .po-col ancestor) |
| `/playoffs` | live round mid-match (mobile) | audited-static | K | hero + myband + board render; myband eliminated-state bug (P1); row status word missing (P2); no score pulse (P3) |
| `/playoffs` | loading (mobile) | audited-static | K | SSR always provides data; ConnPill shows Loading spinner briefly; no skeleton needed (unlike reference) |
| `/playoffs` | pre-rounds edge (mobile) | audited-static | K | page.tsx null → generic centered 'guillotine hasn't started' card; fine on mobile |
| `/playoffs` | reduced-motion (mobile) | audited-static | K | client latch never leaves rest under reduce (PlayoffsClient:82); ds.css global backstop zeroes all anim/transition (ds.css:384) — no stuck blade |
| `/playoffs` | round settled / blade dropped (mobile) | audited-static | K | is-dropped from round.status==='past'; blade translateY transform; strike/dim on cut rows OK |
| `/playoffs` | shell chrome (More sheet, active=playoffs) · live knockout | audited-static | A | playoffs/layout.tsx:21; buried 2 taps deep during live guillotine — see IA finding. |
| `/pool` | fixture rows kickoff text (pick window) | needs-live-verify | GAP:kickoff-time-zone-inconsistency | fmtKickoff (PoolClient.tsx:136-145) hardcodes America/New_York + literal ' ET'; matches prod by coincidence, ignores league.timezone. P2. Verify against actual prod league.timezone. |
| `/pool` | group phase — matchday section order/labels | audited-static | GAP:period-selector-consistency | Sections ordered by raw cmpStr(label) not shared comparePeriodLabels (finding P3, benign for MD1-3). Labels raw period.label ('MD1'), consistent with all surfaces. |
| `/pool` | knockout phase — bracket round labels + order | audited-static | GAP:period-selector-consistency | Round order = hardcoded KNOCKOUT_ROUND_ORDER (poolView.ts:150) matching @app/shared. Labels EXPANDED via ROUND_TITLES (PoolClient.tsx:59-69) — diverges from every other surface (finding P2). 3rd-place synthesized as '... |
| `/pool` | knockout rounds incl. 3rd-place | audited-static | F | Vertical stacked bracket collapses to one column below 560px; synthetic '3P' round renders as its own titled section after Final — no defect found. |
| `/pool` | leaderboard | audited-static | F | Mobile-page-fit (table-layout:fixed at <=480px) survives intact — confirmed clean, matches ground-truth expectation; only the manager-name link tap target is undersized (P2). |
| `/pool` | locked mid-match | audited-static | F | LockPill renders correctly (color+icon+word); disabled buttons share the same undersized geometry as active ones. |
| `/pool` | not-open (page.tsx null view) | audited-static | F | Clean centered card; no mobile-specific defect (minor inline-style vs class inconsistency vs vsfield's equivalent, not worth a finding). |
| `/pool` | picks open pre-kickoff | audited-static | F | P1: pick buttons + match-detail link undersized; global intro copy adequately explains the reveal-at-kickoff mechanic. |
| `/pool` | revealed post-kickoff | audited-static | F | OthersReveal chips wrap correctly at narrow widths; team-name placeholder guard (TBD) verified sound. |
| `/pool` | shell chrome (bottom nav, active=pool/Quiniela primary tab) | audited-static | A | pool/layout.tsx:24; occupies a primary slot — see IA finding. |
| `/scoring` | copy-vs-engine accuracy | audited-static | J | Three distinct, verified engine-vs-copy mismatches found (§1 rating ladder, §4 possession-lost divisor + 5 missing categories, §8 red-card values); §2/§3/§5/§6/§7/second-yellow all cross-checked clean. |
| `/scoring` | default (auth-gated static reference) | audited-static | J | Two-column grid collapses to one column at <=720px; example-card grid collapses 4→2→1 at 1080px/600px; tables wrap safely, no forced-nowrap on prose columns, no horizontal overflow found at 360-430px. |
| `/scoring` | loading / error | audited-static | J | Fully static server-rendered content behind the same getSessionManager gate as /draft (no-session→/sign-in, unlinked→/auth/denied); no client fetch, so no loading-skeleton need. |
| `/scoring` | shell chrome (More sheet, active=scoring) | audited-static | A | scoring/layout.tsx:14. |
| `/settings` | notification prefs — permission-denied | audited-static | H | Handled with a clear 'blocked, check browser settings' message. |
| `/settings` | notification prefs — subscribed / enabling | audited-static | H | No persisted subscribed-status check on mount, no unsubscribe control, and any subscribe-flow exception leaves the UI stuck (both findings). |
| `/settings` | notification prefs — unsupported browser | audited-static | H | Message shown but no iOS install-to-Home-Screen guidance (finding). |
| `/settings` | profile rename (idle/error/saved) | audited-static | H | Save flow has proper try/catch, inline error mapping (empty/too_long/name_taken), and a transient success toast; input is 14px (iOS zoom) and lacks maxLength. |
| `/settings` | shell chrome (More sheet, active=settings) · native input present | audited-static | A | settings/layout.tsx:12; display-name input → keyboard-vs-fixed-bar needs live check. |
| `/sign-in` | error (invalid format / Supabase-returned error incl. rate-limit) | audited-static | H | Inline red-bordered field + message renders any Supabase otpError verbatim; not-allowlisted is NOT surfaced here (allowlist is checked post-click, at /auth/callback, by design — leaks no membership info at submit time). |
| `/sign-in` | idle (email entry) | audited-static | H | Email input correct type/inputMode/autoComplete; 15px font triggers iOS zoom (P1). Brand panel + value-props stack above the form on narrow viewports per the reference's verbatim collapse — whether the CTA sits below ... |
| `/sign-in` | submitting/sent (check-email) | audited-static | H | Static confirmation view is correct pattern; no resend button (design has one) but 'Use a different email' functionally resends since email state persists. No proactive '15-minute expiry' warning is shown (reference h... |
| `/standings` | Matchday tab (default on load) | audited-static | B | P0 clipping finding lives here |
| `/standings` | empty/loading | audited-static | B |  |
| `/standings` | group table (Cumulative tab) | audited-static | B |  |
| `/standings` | knockout/playoff display | audited-static | B | page is group-stage-only by design; no knockout-specific content, and the cut-line copy is stale post-transition (see finding) |
| `/standings` | live-reorder during match | needs-live-verify | B |  |
| `/standings` | season grid horizontal scroll @360 | audited-static | B |  |
| `/standings` | shell chrome (More sheet, active=standings) | audited-static | A | standings/layout.tsx:22. |
| `/vsfield` | ?manager= deep link | audited-static | F | seedManagerSelection guards unknown/self/duplicated params correctly; no mobile-specific issue. |
| `/vsfield` | H2H XI / aggregate · info-only PlayerScoreSheet (no forfeitProps) | audited-static | GAP:playerscoresheet-cross-surface-consistency | periodId = currentPeriod.id (VsFieldClient.tsx:320-326); overlay z-200; no forfeit; identical component to lineup. Same /api/player-box total in-period. |
| `/vsfield` | H2H/opponent selected (desktop CompareBand + mobile MaH2H) | audited-static | F | MaH2H back button + You/Opp toggle undersized (see finding); jersey drill-in itself is fine. |
| `/vsfield` | Season tab (power-record standings) | audited-static | F | P0: table has no mobile treatment and overflows/clips at 360-430px; reference (MobSeason) shows the intended stacked mobile list was never ported. |
| `/vsfield` | historical period via T11 selector | audited-static | F | ConnPill correctly shows 'Final'; the T11 .vf-periodtabs strip shares the undersized .tab control (see tap-targets finding). |
| `/vsfield` | live knockout round — period strip default + order + geometry | needs-live-verify | GAP:period-selector-consistency | Default period identical to lineup (loadVsField.ts:206). Order via selectableStartedPeriods→sortByPeriodOrder. Labels raw period.label (VsFieldClient.tsx:201). GEOMETRY DEFECT: overflow-x:auto + no scrollIntoView stra... |
| `/vsfield` | live period mid-match (period tab, split cockpit) | audited-static | F | Leaderboard rail / mobile standings, XI pitches, CompareBand geometry all verified clean at 360-430px; jersey token tap targets generous (~66x87px). |
| `/vsfield` | mid-gap between rounds | audited-static | GAP:period-selector-consistency | Live-wave predicate identical to lineup; both resolve the next round. selectablePeriods force-includes the live-wave default (alwaysIncludeId) so a tab always exists. Clean on default parity. |
| `/vsfield` | playoff phase (eliminated hidden from live field) | audited-static | F | P1: field/leaderboard shrinks with zero explanatory copy anywhere in the client. |
| `/vsfield` | pre-kickoff (period not started) | audited-static | F | Empty-scoring banner + swappable-XI copy present and correct; no defects found. |
| `/vsfield` | pre-round | audited-static | GAP:period-selector-consistency | Future/unstarted periods excluded from the strip (resolveDisplayedPeriodId rejects unstarted requests) — deliberately narrower than lineup, by design (no field to reveal). Not a bug. |
| `/vsfield` | scorepill trigger (XIToken jersey + BenchToken) | audited-static | GAP:playerscoresheet-cross-surface-consistency | Dark play-state pill + is-zero (components.tsx:340-396,471-503; vsfield.css:542-604). Re-implements the chip visually (by design, class-namespace note) — diverges from lineup/games chips. |
| `/vsfield` | shell chrome (bottom nav, active=vsfield primary tab) | audited-static | A | vsfield/layout.tsx:21. |
| `/vsfield & /pool` | loading/error states | audited-static | F | SSR avoids first-load flicker on both; ConnPill 'stale' is dead code (P3); pool pick busy-state is visually identical to locked (P3); no leaderboard staleness timestamp on /pool (P3). |
| `/vsfield & shared` | sheet open (Points tab) / sheet Stats tab | audited-static | F | Close button scroll-away (P2), vh-vs-dvh (P2, needs-live-verify), no body-scroll lock (P2, needs-live-verify). |
| `/waivers` | BidComposer modal · NationFilter collapsed (default, no selection) | audited-static | GAP:nationfilter-thin-and-census-mismatch | Sole entry is the ~18px .nf-toggle (F1). Toggle is a real <button>, tappable, no hover-gating; disclosure ▸ reads as 'more exists'. Sits in flex gap:8px row next to Watched chip. |
| `/waivers` | BidComposer modal · NationFilter expanded (48-chip grid, 168px scroller) | needs-live-verify | GAP:nationfilter-thin-and-census-mismatch | 28px chips 6px gap ~3/row at 360px (F2); 168px nf-grid nested in 90vh overflow:hidden modal, no overscroll-behavior — clip/scroll-chain/push-FA-list behavior is runtime-dependent (F4). |
| `/waivers` | FA panel absent (sealed-bid / locked phase) | needs-live-verify | D | Code-side, the BatchBar caption differentiates phase clearly ('Waivers process at…' vs 'Free agency open — locks at…') so the surface doesn't visually look broken when the FA panel isn't mounted. The actual cron-drive... |
| `/waivers` | FA panel mounted (period open / free-agency phase) | audited-static | D | Renders inline (no scrim), reuses claimableFreeAgents/droppableRoster; shares the 14px search-input and row-crowding findings with BidComposer. |
| `/waivers` | FreeAgentPanel (inline FA window) · NationFilter collapsed + expanded | audited-static | GAP:nationfilter-thin-and-census-mismatch | Same component, but inline (no modal chrome) so no 90vh clip risk; identical 28px chips + 18px toggle geometry (F1/F2 apply). enabled=false locked phase still renders the filter. |
| `/waivers` | NationFilter with a nation selected — active chip + clear affordance | audited-static | GAP:nationfilter-thin-and-census-mismatch | Selected chip contrast OK (text-primary on accent-soft + accent border, ds.css:370). Clear ✕ is 14px non-focusable span (F3); collapsed clear path is the only one until grid re-opened for 'All'. |
| `/waivers` | batch results | audited-static | D | Player-grouped layout (T11 R2) reads cleanly at 360px via a 2-column grid; isMine accenting present. Won/lost badges lack an icon (P2). |
| `/waivers` | batch results matchday labels | audited-static | GAP:period-selector-consistency | batch.matchdayLabel = period.label verbatim, keyed by batchClearedAt==runAt (loadWaivers.ts:301, rendered components.tsx:569). Terse raw labels, consistent with lineup/vsfield; diverges from pool's expanded names (fin... |
| `/waivers` | bid compose/edit/cancel | audited-static | D | Edit correctly locks the add target and only allows amount/drop changes; composerMaxBid mirrors the engine's over-budget rule. Icon-button tap targets (30x30) are the main defect. |
| `/waivers` | group-phase composer (historical) | audited-static | D | Same BidComposer/FreeAgentPanel code path as playoff phase, gated only by rosterCap=15 and isPlayoffPhase=false; the input-font-size, tap-target, and row-crowding findings apply equally here. |
| `/waivers` | live knockout round — BatchBar period label | needs-live-verify | GAP:period-selector-consistency | Current period via batchClearedAt===null predicate (loadWaivers.ts:169), diverges from live-wave predicate; can name a different round than lineup/vsfield at the same instant (finding P3). Semantically correct — claim... |
| `/waivers` | loading/error | audited-static | D | No loading.tsx skeleton (P2) despite a heavy multi-query, unbounded-fetch loader. Inline error banners exist for composer/claims-list/FA/release failures via friendly() + ERROR_MESSAGES mapping. |
| `/waivers` | next-batch time + release panel | audited-static | GAP:kickoff-time-zone-inconsistency | formatRunAt (WaiversClient.tsx:125-132) uses view.timezone (= league.timezone ?? 'UTC', loadWaivers.ts:196,368) via Intl in league tz; batch label via formatInLeagueTz. Correct; no finding. |
| `/waivers` | playoff phase (CURRENT — reduced-squad, eliminated struck) | audited-static | D | TeamBudgetsRail correctly strikes eliminated managers (row-elim, waivers.css:486-490) without removing them, matching the CONTRACT-P3 data-existence contract. Carries the mobile-rail-reorder (P1) and ReleasePanel lock... |
| `/waivers` | priority reorder | dead-surface | D | Intentionally deferred per an explicit code TODO (components.tsx:424-426) — claims render amount-descending (matching the engine's own resolution order) with no drag/up-down affordance. This is a documented product de... |
| `/waivers` | release flow | audited-static | D | Forfeit-deadline and unfillable-XI confirm gates are legible and reuse canFieldPlayoffXI; the locked-player silent-omission gap (P1) is the standout defect. |
| `/waivers` | shell chrome (More sheet, active=waivers) | audited-static | A | waivers/layout.tsx:12; More button lights via moreHasActive. |
| `/waivers` | view-only FaPlayerCardSheet (Points overview + Stats) | needs-live-verify | GAP:playerscoresheet-cross-surface-consistency | Own .pc-scrim/.pc-sheet chrome; Points tab is a season/cutoff OVERVIEW (no per-period breakdown, no zero-rating §1 line) — documented/by-design (no live period). z-95 < nav z-100 = P1. Header persists on both tabs. |
| `/waivers` | void+refund claim state | audited-static | D | Fully compliant: Refund icon + refund color + word consistently used across the void-note banner, ClaimRow's void tag, and BidLine's void branch. |
| `/waivers` | waivers not-open null view | dead-surface | D | Only reached when loadWaivers.ts returns null (manager row not found), which an already-authenticated + allowlisted + linked manager (per getSessionManager gating in page.tsx) should not hit in normal operation. Copy ... |
| `/waivers` | watchlist toggle | audited-static | D | Optimistic flip + revert-on-failure is sound (WaiversClient.tsx:200-217); list position is stable across toggles. Star control width (34px) is the tap-target defect. |
| `/waivers, /games/[matchId], /lineup (+ all 13 force-dynamic pages)` | route transition while server renders the Prisma-backed snapshot, no loading.tsx | audited-static | GAP:no-error-404-boundaries | Absence of loading.tsx confirmed by glob; all pages force-dynamic. No skeleton feedback on tap; ds .skeleton vocab unused at route level. |
| `MoreSheet` | open state (scrim + list + footer) | audited-static | A | MoreSheet.tsx: opens/closes via button+scrim; missing grabber/X/title, no scroll-lock/aria-modal — see findings. |
| `PWA install / standalone` | add-to-home-screen on iOS | needs-live-verify | A | Manifest+icons complete (favicon-32, icon-192/512, maskable-192/512 all exist); confirm dark splash, status bar, no white flash on launch. |
| `all four surfaces` | shared Stats tab (PlayerStatsTab / usePlayerTournamentStats / loadPlayerTourname | audited-static | GAP:playerscoresheet-cross-surface-consistency | Single hook + component + endpoint; team-participation gate is server-side in loadPlayerTournamentStats.ts:41-50 (home OR away), NOT duplicated per caller. buildPlayerTournamentStats is pure over gated rows. |
| `apps/web/app/layout.tsx + apps/web/app/styles/ds.css` | theme inheritance for framework-default pages (global dark body vs Next-injected | audited-static | GAP:no-error-404-boundaries | Dark comes from a GLOBAL body element rule (ds.css:149-158) + :root default (line 13), NOT per-route [data-theme]. Root layout has no shell/nav. So the ONLY thing that can flip the 404 to white is Next's injected styl... |
| `commissioner-gated nav entry` | manager vs commissioner | audited-static | A | All layouts call getViewerIsCommissioner(); COMMISH_NAV_ITEM rendered only when true in both top strip (AppShell.tsx:196) and More sheet (MoreSheet.tsx:86). Manager never sees it. |
| `cross-surface` | default-period parity: /lineup vs /vsfield at same instant | audited-static | GAP:period-selector-consistency | P1 risk CLEARED. Both loaders call selectCurrentPeriod over the full league period set (identical Prisma query, orderBy opensAt/label, matches kickoff-asc) with byte-identical isCurrent predicate. Provably same defaul... |
| `cross-surface` | label vocabulary parity across all period surfaces | audited-static | GAP:period-selector-consistency | Group matchdays consistent everywhere ('MD1/2/3'). Knockout rounds SPLIT: pool expanded ('Round of 32'), lineup/vsfield/waivers terse ('R32'). /playoffs render layer (out of scope) carries raw labels in playoffsView (... |
| `css-system` | breakpoints | audited-static | I | 22 distinct max-widths, per-screen invention (finding). Shell nav swap 639px; route layout swaps 760/767/768/820/960; phone-fit queries 480/360 only on lineup/standings/pool. 360-430px is covered everywhere; the 481-6... |
| `css-system` | bundle-weight | needs-live-verify | I | ~5× ds.css (~14KB raw each) + 16 route sheets; fonts = 15 weight-styles via 3rd-party CSS (finding); icons are inline SVG only — no icon library weight (clean). Actual chunk sizes/waterfall need a build/device check. |
| `css-system` | contrast | audited-static | I | Computed AA for core pairs: text-secondary/surface-0 9.9:1 PASS; text-tertiary 3.2-4.0:1 at 8-11px FAIL (finding); elim-on-elim-soft ≈3.3:1 FAIL (finding); ytp/accent/live/win on softs 4.6-5.3:1 pass at their bold mic... |
| `css-system` | ds-copies-drift | audited-static | I | Drift = 0 bytes today across styles/ds.css, _landing/ds.css, draft/ds.css, lineup/ds.css, vsfield/ds.css (all 443 lines, verified by full read). Global copy is de-facto source of truth. vs reference ds/ds.css: product... |
| `css-system` | motion | audited-static | I | Global prefers-reduced-motion clamp (ds.css:384, 0.001ms !important) + playoffs' explicit no-preference gates = best-in-class coverage. Entrances safe (tickin transform-only; lp-reveal rests visible; aupop snaps to en... |
| `css-system` | safe-areas | needs-live-verify | I | env(safe-area-inset-bottom) used ONLY in shell.css (btmnav, MoreSheet, sh-content clearance). Zero left/right inset handling despite viewport-fit=cover. Modal scrims and the lineup save bar ignore insets (findings). v... |
| `css-system` | tailwind-coexistence | audited-static | I | Only 2 utilities in the whole app (body min-h-screen antialiased); Preflight active; ds wins via documented-but-unenforced import order; content globs omit src/** (P3 finding); theme.extend empty (token handoff never ... |
| `css-system` | theme-light | audited-static | I | Unreachable (no toggle, no prefers-color-scheme rule; 14 layouts hardcode inert data-theme="dark"). If enabled: accent-soft is GREEN (ds.css:130, inherited from reference), lineup pitch turf hardcodes dark rgba (lineu... |
| `css-system` | tokens | audited-static | I | One coherent token set; all 5 ds copies byte-identical. Defects: commish.css var(--border)/var(--surface)/var(--pos) undefined (finding); draft.css var(--t-sm) typo; scoring.css:5 comment still claims topbar 'carries ... |
| `css-system` | typography/fonts | needs-live-verify | I | Fonts via render-blocking Google @import ×5 copies, 15 weight-styles, no preconnect/next/font (finding). Roles honored: display=Schibsted, sans=Hanken, mono=JetBrains on timers/countdowns (.countdown/.dr-clk/v2-match-... |
| `css-system` | z-index-scale | audited-static | I | Extra cell: no z-scale tokens. Root-context ladder: commish menu 40 < pool modal 50 < landing nav 60 < pc-scrim 80 < wv-scrim 90 < wv pc-scrim 95 < bottom nav 100/101/102 < forfeit/score-sheet 200. Nav-above-modals in... |
| `iOS safe-area landscape` | rotated notched iPhone | needs-live-verify | A | Bottom bar/sheet lack horizontal env() insets; confirm first/last tab + sheet edges not clipped by notch. |
| `league.timezone (source of truth)` | prod DB League row | needs-live-verify | GAP:kickoff-time-zone-inconsistency | schema default 'UTC' (schema.prisma:135); provisioning config sets 'America/New_York' (provision.config.example.json:5, plan.test.ts:12). Cannot read live row — confirm actual prod value. |
| `loading states` | auth callback exchange + settings SSR | needs-live-verify | H | No branded interstitial exists for the callback redirect chain (finding); /settings also has no loading.tsx, so a slow SSR (Prisma reads) shows a blank page during navigation — same underlying gap, not filed as a sepa... |
| `magic-link expired/invalid landing` | landed via /auth/callback failure | audited-static | H | All failure reasons (missing_code / exchange_failed / not_allowlisted) collapse to one /auth/denied render — see finding on cause conflation. |
| `sign-out` | mobile (<640px) | audited-static | H | Reachable via the bottom-nav More sheet footer (apps/web/app/shell/MoreSheet.tsx:108-112); a plain POST form, no confirm dialog — acceptable given it's non-destructive and re-entry is a magic link away. |

---

## 3. Findings (severity order)

IDs are `F-P{severity}-{cluster}{n}` (clusters A–K per the method note; TZ/ERR/PSC/PER/NF = the cross-surface gap lanes). Where several auditors independently hit the same defect, the block carries **Merged instances** — corroboration, not separate findings.

### P0 — broken / unusable on mobile

#### F-P0-B1 · Standings Matchday tab's Points column is fully clipped/unreachable at 360-390px (default tab on load)

- **Severity:** P0
- **Screen+State:** /standings · Matchday tab (default, useState('matchday')), any tournament phase
- **Location:** `apps/web/app/standings/standings.css:98-102,153-161,72-79`
- **Observed:** `.st-head-md`/`.st-mdrow` (standings.css:100,156) set `grid-template-columns: 36px minmax(120px, 1fr) 100px 64px` with 8px gaps — a minimum content width of 344px. `.st-mdrow`/`.st-head-md` are flex items inside `.st-table` (flex-direction:column, default align-items:stretch), so their box is stretched to `.st-table`'s inner width, but because each is itself a CSS-grid formatting context its automatic min-width resolves to that 344px track-minimum sum (the classic flex/grid auto-min-size overflow). `.st-app` padding is 14px/side below 480px (standings.css:441-444), `.st-table` has a 1px border, and `.st-mdrow` itself adds 14px/side padding, leaving only ~302px available at a 360px viewport and ~332px at 390px — both short of the required 344px. `.st-table` sets `overflow: hidden` (standings.css:78) and there is no horizontal-scroll fallback, so the shortfall (42px at 360px, 12px at 390px) is silently clipped on the right edge. The rightmost track is the right-aligned, bold, tabular-nums Points value (`.st-c-mdpts.mono`, components.tsx ~line 353) — at 360px it renders entirely past the clip boundary (invisible); at 390px only a sliver of it survives. Only ≥~416px (e.g. 430px) fits without clipping.
- **Design-reference delta:** design/design_reference/standings/mobile.jsx ports a dedicated mobile CARD layout (`MStandRow`/`.mst-figs`) specifically to avoid fixed-column overflow on phones. Production's standings.css:7-8 explicitly states '(no separate desktop/mobile trees): narrow viewports drop the Win% + Form columns via media queries' — collapsing to one responsive grid instead of the reference's purpose-built mobile card, and that grid has no breakpoint between 720px and 480px granular enough to keep the Matchday row inside a 360-390px viewport.
- **Fix theme:** responsive-table-overflow
- **Effort:** S
- **Confidence:** verified-static

#### F-P0-E1 · Tab bar overflows and clips the last tab out of reach at 360-390px when 5 tabs render (the common case)

- **Severity:** P0
- **Screen+State:** /games/[matchId] · Lineups tab (default), any completed/live group-stage match with both Statistics and Standings present
- **Location:** `apps/web/src/games/games.css:268-296 (`.gd-tabbar`/`.gd-tabbtn`), apps/web/src/games/games.css:1344-1349 (`.gd-app:has(.gd-lineups){overflow:hidden}`), apps/web/app/games/[matchId]/GameDetailClient.tsx:1189-1243 (5-tab render)`
- **Observed:** `.gd-tabbar{display:flex}` with `.gd-tabbtn{flex:1}` and no `min-width:0`, no `flex-wrap`, no `overflow-x:auto`. With default `overflow:visible` on a flex item, the browser's automatic minimum size floors each button at its label's min-content width (a single unbreakable word like "Statistics"/"Standings" can't wrap). At 360px viewport, `.gd-app` mobile padding (`var(--sp-3)`=12px/side) leaves 336px; summing the 5 tabs' min-content+padding (Lineups~65 + Statistics~91 + Events~61 + Ratings~68 + Standings~83) + 4×4px gaps + 10px tabbar padding ≈ 398px — about 62px over budget, so the row cannot fit and does not wrap. Statistics renders whenever any stat_team_match row exists (essentially any started match); Standings renders for any group-stage match with ingested standings — so 5 tabs is the NORMAL state for reviewing past group matches, not an edge case. On the default Lineups tab, `.gd-app:has(.gd-lineups)` sets `overflow:hidden` on the ancestor, so the overflowing tail of the tab row (typically the Standings button) is clipped invisible with no scroll affordance — completely untappable, and since it's invisible there's no way to discover it while on Lineups. Switching to a tab that IS reachable removes `.gd-lineups` from the DOM, which removes the `overflow:hidden`, so the same overflow then spills into page-level horizontal scroll instead (a different but still real violation of 'wide content must scroll in its own container, never the page body').
- **Design-reference delta:** design/design_reference/match_detail/matchdetail/md.css:89-94 — the design's mobile tab bar is explicitly `.md-tabbar.is-mob{overflow-x:auto}` with `.md-tabbtn{flex:none;padding:9px 13px;font-size:12px}` (content-sized, horizontally-scrollable tabs). The live app never applies an `.is-mob`-equivalent variant at all; it ships one equal-width flex layout for every viewport.
- **Fix theme:** tab-bar overflow / responsive navigation
- **Effort:** S
- **Confidence:** verified-static

#### F-P0-F1 · /vsfield Season tab standings table has no mobile layout — overflows and gets silently clipped at 360-430px

- **Severity:** P0
- **Screen+State:** /vsfield · Season tab (power-record season standings)
- **Location:** `apps/web/app/vsfield/components.tsx:778-836 (SeasonTable) + apps/web/app/vsfield/vsfield.css:1127-1156 (.v2-season/.dtable, no overflow-x/table-layout override) + apps/web/app/styles/ds.css:310-318 (.dtable base, width:100%, no responsive rule)`
- **Observed:** SeasonTable renders a plain `<table class="dtable">` with 6 columns (#, Manager [avatar+un-truncated `<b>{displayName}</b>`], Record e.g. "12-3-1", Win%, Points, By-period chips). `.dtable` is `table-layout:auto` (never overridden for `.v2-season`), the Manager cell has no max-width/ellipsis, and the numeric cells are unbreakable tokens. At 360-430px, minus the `.vf-scroll` 18px padding and the AppShell chrome, the container is well under 300px, but the table's natural minimum content width (rank + avatar+full name + "W-L-D" + "NN%" + points + period chips) is easily 450-600px+ for a real league with names like "Maximiliano". No ancestor (`.vf-scroll`, `.v2-season`) sets `overflow-x:auto`, and `.dtable`/`.v2-season` are never given `table-layout:fixed`. The document-level backstop at apps/web/app/styles/ds.css (`html, body { max-width:100%; overflow-x:hidden }`) then CLIPS the overflow rather than letting the page scroll — so the rightmost columns (Points, By-period W/L/D+pts chips, sometimes Win%) become genuinely unreachable: no scroll gesture anywhere on the page can reveal them. Verified there is no `@media` rule anywhere in vsfield.css targeting `.v2-season`/`.dtable` (only `.vf-periodtabs` and `.v2-matchstrip-scroll` get `overflow-x:auto`).
- **Design-reference delta:** design/design_reference/vsfield/mobile.jsx:87-105 — the reference's `MobSeason` renders the season standings as a stacked flex-row list (`.mvf-strow`: rank · avatar · name · record · pts), explicitly NOT an HTML table, precisely because a wide multi-column table doesn't fit a phone. The shipped app instead reuses the desktop `SeasonTable`/`.dtable` verbatim for both breakpoints with no mobile fork — the one place in this cluster where the sibling screen (/pool leaderboard) DID get the mobile-table treatment (`table-layout:fixed` + column widths at ≤480px in apps/web/src/pool/pool.css:483-520) but /vsfield's structurally identical season table never did.
- **Fix theme:** responsive-table / mobile-season-list
- **Effort:** M
- **Confidence:** verified-static


### P1 — mechanic-legibility or major usability failures

#### F-P1-B1 · Standings Cumulative table's expand-chevron and trend (+/-) columns clip off-screen at 360-390px

- **Severity:** P1
- **Screen+State:** /standings · Cumulative tab, any tournament phase
- **Location:** `apps/web/app/standings/standings.css:93-97,114-128,430-440`
- **Observed:** Same overflow mechanism as the Matchday finding: below 720px, `.st-head`/`.st-row-main` switch to `grid-template-columns: 32px minmax(96px, 1fr) 84px 46px 38px 22px` (standings.css:434) = 358px minimum, inside a box that only has ~302px available at 360px / ~332px at 390px (after `.st-app` 14px padding, `.st-table` border, and the row's own 14px padding), clipped by `.st-table{overflow:hidden}` (standings.css:78). Column math places the boundary at x≈302 (360px) / x≈332 (390px) against an unclipped 358px layout: the PF (points) column stays fully visible in both cases (good), but the trailing Move (`.st-c-move`, ▲/▼ trend) column is mostly clipped at 360px and the Chevron (`.st-c-chev`, the row's only visual 'tap to expand' affordance) is fully clipped at BOTH 360px and 390px. The row remains technically tappable via its visible portion, but the expand affordance is invisible, so most phone users won't discover that rows expand into a per-matchday detail breakdown.
- **Design-reference delta:** Same as the Matchday finding — design/design_reference/standings/mobile.jsx's dedicated mobile card avoids fixed grid-track overflow; production's single responsive grid (standings.css:7-8) does not.
- **Fix theme:** responsive-table-overflow
- **Effort:** S
- **Confidence:** verified-static

#### F-P1-C1 · Sticky SaveBar (primary Save action + live legality reason) is painted behind the fixed bottom tab bar on phones

- **Severity:** P1
- **Screen+State:** /lineup · any editable period while the pitch is scrolled into view (current knockout pre-kickoff, mid-live, playoff reduced)
- **Location:** `apps/web/app/lineup/lineup.css:866`
- **Observed:** `.sl-savebar` is `position:sticky; bottom:12px` with no z-index (lineup.css:866-877). The global mobile nav `.sh-btmnav` is `position:fixed; bottom:0; z-index:100`, shown only <640px (apps/web/app/shell/shell.css:170-182, 300-308); its band is ~52px (`.sh-btnav-item` padding 10/8 + 20px icon + 11px label, shell.css:190-209) PLUS `padding-bottom:env(safe-area-inset-bottom)` (~34px notched) = ~86px. A sticky element at bottom:12px pins its box to the 12-76px range above the viewport bottom, i.e. entirely inside that nav band, and z-index:auto < 100 means the nav paints on top. So while a manager looks at the pitch, the Save button and `.sl-savebar-reason` (the ONLY place illegal-formation/incomplete-XI feedback renders) are occluded. It clears the nav only at absolute max scroll (96px screen bottom-pad + 58px sh-content pad push its resting position ~150px up), so it is reachable but hidden during the editing task.
- **Design-reference delta:** n/a (reference uses autosave, not a sticky SaveBar; live-app integration defect vs apps/web/app/shell/shell.css bottom-nav)
- **Fix theme:** safe-area / bottom-bar stacking
- **Effort:** M
- **Confidence:** verified-static
- **Merged instances** (independently reported, folded into this finding):
  - [I · was P1] /lineup sticky save bar pins at bottom:12px — buried under the fixed bottom nav while editing — `apps/web/app/lineup/lineup.css:867`. .sl-savebar is position:sticky; bottom:12px (lineup.css:866-877), rendered as the live save affordance (app/lineup/components.tsx:729). On phones the body is the scroller (.sh-app height resolves auto), so sticky pins 12px above the VIEWPORT bottom — but the fixed .sh-btmnav occupies the bottom 58px + env(safe-area-inset-bottom) (shell.css:300-312), i.e. up to ~92px. The ~64px save bar is therefor

#### F-P1-C2 · Save rejection has no reliable on-screen surface — the error toast renders in normal flow at page bottom

- **Severity:** P1
- **Screen+State:** /lineup · save error (server rejects POST /api/lineup after client validation passed — e.g. locked-player-moved, window-closed race)
- **Location:** `apps/web/app/lineup/SetLineupClient.tsx:443`
- **Observed:** On a rejected save the client sets toast={kind:'error', text:res.error.message} (SetLineupClient.tsx:340-342) and renders it as the last flow child `<div role=status className='toast toast-danger'>` (SetLineupClient.tsx:443-450). ds.css `.toast` (ds.css:338) has NO fixed/overlay positioning and no z-index — it is block flow after the SaveBar. When the client validator passed but the server rejected (the live-match race the lock-on-play model exists to catch), the SaveBar reason is null, so the toast is the sole error channel. On a scrolled phone that toast sits below the fold and/or behind the fixed bottom nav, so the manager taps Save, sees 'Saving…' flip back, and gets no visible reason. Success has a fallback (the LockHero 'Saved' pill, components.tsx:580-582); the error case does not.
- **Design-reference delta:** n/a
- **Fix theme:** error surface
- **Effort:** M
- **Confidence:** needs-live-verify

#### F-P1-D1 · Mobile stacks the entire desktop rail (FaabBar + full WaiverOrderRail + 12-row TeamBudgetsRail table) ABOVE the primary claims content, burying BatchBar/void-note/+New claim behind ~1000-1200px of secondary scroll

- **Severity:** P1
- **Screen+State:** /waivers · My claims tab, any phase, 360-430px viewport
- **Location:** `apps/web/src/waivers/waivers.css:1038-1040`
- **Observed:** `.wv-claims-page` is a CSS grid (`main` then `aside` in DOM order). At >=768px it's two columns (main left, 320px rail right) — fine. Under the `@media (max-width: 768px)` query, `.wv-claims-page{grid-template-columns:1fr}` stacks to one column, and `.wv-rail{order:-1}` (line 1038-1040) forces the aside — which contains THREE full `.wv-card`s: `<FaabBar>` (~110px), `<WaiverOrderRail>` (a full list of every manager's waiver position, ~450px for a 12-manager league per `.wv-order-item` row heights in waivers.css:471-481), and `<TeamBudgetsRail>` (a `<table className="dtable wv-budgets-table">` with one row per manager; under `[data-density="comfortable"] .dtable td{padding-top/bottom:14px}` in apps/web/app/styles/ds.css:377-378 each row is ~46-48px tall, so 12 managers ≈ 620px including the header row) — to render FIRST, ahead of `.wv-claims-main` (WaiversClient.tsx:319-407, which holds the BatchBar countdown, the void+refund warning, the FA panel/composer trigger, and the pending-claims list). Combined the three rail cards are roughly 1100-1200px tall. On a 390x844 iPhone with app-shell chrome (~120px top+bottom nav) leaving ~700-720px of usable height, a manager must scroll past more than a full screen of read-only budget/order data before reaching the screen's primary interactive surface (batch countdown, void warnings, claim list, the '+ New claim' CTA).
- **Design-reference delta:** design/design_reference/waivers/mobile.jsx (MobileWaivers, lines 36-83): the phone layout shows ONLY a compact `<FaabBar st={st} compact/>` in the fixed header (line 51) — the rolling waiver order and the team-budgets table are NOT part of the mobile reference at all. The live app instead ports the full desktop rail verbatim and just reorders it to the top via CSS, rather than reducing it to the compact summary the design intended for phones.
- **Fix theme:** mobile IA / rail-reorder
- **Effort:** M
- **Confidence:** verified-static

#### F-P1-D2 · Playoff ReleasePanel silently excludes locked-by-play roster players from the release list with no count or explanation, obscuring why the visible list is a subset during the live guillotine trim-down

- **Severity:** P1
- **Screen+State:** /waivers · playoff phase, over-cap trim-down (ReleasePanel mounted)
- **Location:** `apps/web/src/waivers/ReleasePanel.tsx:50-53,108-135`
- **Observed:** `droppable = droppableRoster(roster, lockedPlayerIds)` (lines 50-53) filters out every locked-by-play player before rendering `.wv-rel-list` (lines 108-135); the header only shows the raw `{roster.length}/{rosterCap}` count (line 89-91), never how many of those are excluded because they've already played this round. The panel's own copy (`wv-rel-deadlines`, lines 94-106) explicitly anticipates a played-starter-forfeit scenario ('Release a played starter before {deadline} to avoid forfeiting his points'), meaning the mixed locked/unlocked case is a real, expected state — yet a manager staring at a shorter-than-expected list has no on-screen signal that N players are temporarily un-droppable because they've played, only that the engine will reject them (`release-locked` error, surfaced only reactively via WaiversClient.tsx:56 if they somehow try). This is a lock-on-play legibility gap layered onto the guillotine mechanic, both explicit ground-truth mechanics, at a moment (post-round-advance, pre-next-kickoff) that is live for the current tournament state.
- **Design-reference delta:** n/a (no ReleasePanel exists in design/design_reference — this is app-original per DECISIONS §D trim-down)
- **Fix theme:** lock-on-play legibility
- **Effort:** M
- **Confidence:** verified-static

#### F-P1-E1 · Extra-time / penalty-shootout scores are never surfaced even though the schema already stores them

- **Severity:** P1
- **Screen+State:** /games/[matchId] · knockout match decided in extra time or on penalties
- **Location:** `apps/web/app/games/[matchId]/loadGameDetail.ts:36-54 (match select), apps/web/src/games/types.ts:314-328 (`GdMatchInput`) and 106-117 (`GameDetailHeader`), apps/web/app/games/[matchId]/GameDetailClient.tsx:1005-1017 (`ClockPill`) and 1019-1091 (`Scoreboard`)`
- **Observed:** `packages/db/prisma/schema.prisma:407-410` defines `homeScoreEt`, `awayScoreEt`, `homeScorePens`, `awayScorePens` on `FifaMatch` — purpose-built columns for exactly this state. `loadGameDetail.ts`'s `match` select only pulls `homeScore`/`awayScore` (plus status/kickoff/team/period fields); none of the ET/pens columns are selected, threaded into `buildGameDetail`, or present anywhere in `GdMatchInput`/`GameDetailHeader`/`SquadSide`. `ClockPill` only branches on `MatchStatus` (`scheduled|in_progress|completed|postponed|abandoned` — `packages/shared/src/enums.ts:49-56`, no ET/pens-aware value), and `Scoreboard` renders only `home.score`–`away.score`. A knockout game that finished 1-1 after 120 minutes and was decided 5-4 on penalties therefore renders as a plain "1–1 · Full-time" board with nothing indicating a shootout happened or who advanced — the one question a manager opens a knockout match detail to answer. Separately, `buildEvents` (buildGameDetail.ts:374-496) does not special-case `period==='PEN'` goal events when accumulating the running score, so if the feed tags shootout kicks with `incidentType:'goal'`, they inflate `hs`/`as` past the true match score, which would trip the existing `eventScoreAnomaly` safety net and show only the generic "Timeline reconstructed from feed events; it may differ from the official score" note — not a clear penalties explanation.
- **Design-reference delta:** n/a — the design reference's showcase fixture (Spain 3–0 Saudi Arabia, Group H) is a group-stage match and never demonstrates an ET/pens state, so there is no reference screenshot to diverge from. Gap identified directly against my audit-focus item (knockout ET/pens display) and confirmed by the unused schema columns.
- **Fix theme:** knockout state legibility
- **Effort:** M
- **Confidence:** verified-static

#### F-P1-F1 · Eliminated managers silently disappear from the live field/leaderboard with zero in-UI explanation

- **Severity:** P1
- **Screen+State:** /vsfield · playoff phase (guillotine cuts active, live field)
- **Location:** `apps/web/app/vsfield/loadVsField.ts:36-53 (filterEliminatedFromField) + apps/web/app/vsfield/VsFieldClient.tsx (whole file — no elimination copy) + apps/web/app/vsfield/components.tsx (whole file — no elimination copy)`
- **Observed:** `filterEliminatedFromField` removes eliminated managers from `view.field` and re-ranks the remainder 1..N whenever `isLivePeriod` is true (loadVsField.ts:44-53), and the loader never returns the eliminated set or a total-roster count to the client (`return { ...view, field, benches, selectablePeriods, isLivePeriod }` — no eliminated info). Grepped both VsFieldClient.tsx and components.tsx for any elimination-related copy/state/pill (`elim`, `--elim`, `pill-elim`) — zero matches, even though ds.css defines a full `--elim`/`.pill-elim` token pair (apps/web/app/vsfield/ds.css:78,266) for exactly this purpose and it's already used correctly on /playoffs per design/CLAUDE.md. A manager glancing at the mobile standings (`MaYou`: "rank {me.rank} · of {n}") or the leaderboard rail mid-playoffs sees the field size and rank silently shrink between periods (e.g. "of 10" → "of 8") with no banner, note, or link explaining why — this is precisely the scenario the task's own audit focus calls out ("does the UI SAY why the field shrank?").
- **Design-reference delta:** n/a (no vsfield-specific reference conflict; this is the ground-truth-mandated mechanic-legibility bar — guillotine playoffs must be "instantly legible" per design/CLAUDE.md §2 — and the sibling /playoffs reference screen DOES show explicit struck-through/elim-styled rows for the same event, a treatment vsfield doesn't echo at all).
- **Fix theme:** mechanic-legibility / guillotine-copy
- **Effort:** M
- **Confidence:** verified-static

#### F-P1-F2 · /pool's core pick controls (Home/Draw/Away) render well under the 44px touch-target minimum

- **Severity:** P1
- **Screen+State:** /pool · Picks tab, pre-kickoff (every group/knockout fixture card)
- **Location:** `apps/web/src/pool/pool.css:189-217 (.pl-pickbtn, min-height:34px) + apps/web/src/pool/pool.css:132-151 (.pl-fx-mid/.pl-fx-view, zero vertical padding)`
- **Observed:** `.pl-pickbtn { min-height: 34px; padding: 0 var(--sp-2); ... }` (pool.css:194) — the 2-way/3-way Home/Draw/Away buttons that are the SOLE mechanism for making every pick in the app are 34px tall, well below the 44px (iOS HIG) / 48px (Android) touch-target floor, and below the app's own established 44px baseline (`[data-density="comfortable"] .btn { min-height: 44px }` in ds.css) — `.pl-pickbtn` is a bespoke class that doesn't inherit `.btn`'s density rule. This repeats on every single fixture card across every matchday and every knockout round for the whole life of the pool, i.e. it is the highest-frequency touch interaction in this cluster. The adjacent `.pl-fx-mid.pl-fx-view` link (match-detail tap target, same file lines 132-151) has `padding: 0 var(--sp-2)` — zero vertical padding — so its effective height is only the two stacked text lines (~36px), also under 44px, on every fixture card.
- **Design-reference delta:** n/a (pool has no dedicated design reference per the task brief; diverges from the app's own comfortable-density 44px convention already established in ds.css and applied to `.btn`/`.input`/`.select`).
- **Fix theme:** tap-targets
- **Effort:** S
- **Confidence:** verified-static

#### F-P1-G1 · Type-to-confirm word inputs (FREEZE/CUT) omit autocapitalize/autocorrect/spellcheck; the case-sensitive uppercase gate fights the iOS keyboard on irreversible actions

- **Severity:** P1
- **Screen+State:** /commish · Game operations freeze confirm + Playoff cuts apply confirm (commissioner, on iOS Safari/Chrome)
- **Location:** `apps/web/app/commish/CommishConsole.tsx:311`
- **Observed:** The freeze confirm input (line 311-318) and the cut apply input (line 823-830) render `<input className="adm-input" autoComplete="off">` with NO autoCapitalize, autoCorrect, or spellCheck. The arm condition is a case-sensitive exact match against an ALL-CAPS literal: `typed.trim() === FREEZE_CONFIRM_WORD` ("FREEZE", line 277) and `=== CUT_CONFIRM_WORD` ("CUT", line 784). On iOS the default autocapitalize is `sentences`, so typing into the empty field yields "Freeze"/"Cut" (first letter capitalized, rest lowercase); that never equals "FREEZE"/"CUT", so the Freeze/Apply-cut button stays `disabled` and the commissioner cannot complete the confirm without noticing and manually forcing caps-lock. Compounded by the 13px font (finding below) which also zooms the field on focus. This gates the two most consequential, irreversible actions (period freeze; the guillotine cut) exactly when the commissioner is under live time pressure.
- **Design-reference delta:** n/a (reference admin/components.jsx ConfirmModal confirmWord pattern is honored; the mobile-keyboard hardening is simply absent)
- **Fix theme:** confirm-input keyboard attrs
- **Effort:** S
- **Confidence:** verified-static

#### F-P1-H1 · Web Push enrollment has no error handling anywhere in the chain — real failures strand the UI on a permanent "Enabling…" with no error and no recovery

- **Severity:** P1
- **Screen+State:** /settings notification prefs · Enable-browser-notifications mid-flow (subscribe failure)
- **Location:** `apps/web/src/notifications/pushClient.ts:42-63`
- **Observed:** `enableBrowserPush` (pushClient.ts:42-63) awaits `requestPermission()`, `serviceWorker.register()`, `serviceWorker.ready`, `pushManager.subscribe()`, and `fetch()` back-to-back with zero try/catch — any of these can reject in normal mobile conditions (pushManager.subscribe() throwing on iOS Safari for a variety of documented reasons, a dropped mobile connection mid-registration, etc.). `NotificationsClient.handleEnable` (apps/web/src/notifications/NotificationsClient.tsx:74-92) calls `await enableBrowserPush(env)` with no try/catch either, after already having set `setEnableStatus("Enabling…")` at line 81. A rejection becomes an unhandled promise rejection that never reaches any of the `result.ok`/`result.reason` branches, so the status text is never replaced — the button visually looks like it's perpetually "working" with no way to tell the user it failed or let them retry. Contrast with the sibling `handleTest` (handlers.ts pattern, NotificationsClient.tsx:94-111) which DOES wrap its fetch in try/catch, confirming this is an omission rather than a deliberate choice.
- **Design-reference delta:** n/a — this is an implementation robustness gap, not a divergence from any designed state in notifs/components.jsx.
- **Fix theme:** error-handling
- **Effort:** S
- **Confidence:** verified-static

#### F-P1-I1 · Mobile bottom nav (z-100) paints above every modal scrim except the score sheet — modals occluded, nav tappable over open dialogs

- **Severity:** P1
- **Screen+State:** /waivers bid composer, /waivers·/lineup·/vsfield player card (.pc-scrim), /pool picks drill-in · any state at <640px
- **Location:** `apps/web/app/shell/shell.css:177`
- **Observed:** .sh-btmnav is position:fixed z-index:100 (shell.css:170-181; More backdrop 101, sheet 102 at shell.css:225,235). Route modals sit BELOW it: .pl-modal-overlay z-50 (src/pool/pool.css:361), .pc-scrim z-80 (app/styles/ds.css:430), .wv-scrim z-90 (src/waivers/waivers.css:537), .wv-app .pc-scrim z-95 (waivers.css:749), .adm-viewas-menu z-40 (commish.css:359). All are fixed elements in the root stacking context (no transformed ancestors). At 360-430px the tab bar (~58px + env(safe-area-inset-bottom), up to ~92px on notched iPhones) overlays the bottom of any centered modal — the wv-composer is max-height:90vh (waivers.css:543) so its bottom edge with the Place-bid actions region lands inside the covered strip — and the nav remains fully tappable above the scrim, so a mid-bid tap on a tab silently navigates away. Only .sl-forfeit-overlay/.sl-scoremodal (z-200, lineup.css:638, PlayerScoreSheet.css:20) is correctly above the nav — the layering is also inconsistent between sibling modals.
- **Design-reference delta:** n/a — design/design_reference App Shell.html defines the MobileTabBar but prescribes no z-scale; the inversion is an integration defect, not a ported one.
- **Fix theme:** z-index scale
- **Effort:** S
- **Confidence:** verified-static
- **Merged instances** (independently reported, folded into this finding):
  - [J · was P2] Draft toasts (fixed bottom:16px, z-index:80) sit behind the persistent mobile bottom-nav bar (z-index:100) — `apps/web/app/draft/draft.css:442-451`. `.dr-toasts { position: fixed; right:16px; bottom:16px; z-index:80; }`. AppShell always renders `.sh-btmnav` on /draft at <640px viewports (apps/web/app/shell/shell.css:170-182: `position:fixed; bottom:0; z-index:100`, ~58px+safe-area tall per the `calc(58px + env(safe-area-inset-bottom))` reference at shell.css:311). A toast's lower portion (its 16px–~58px footprint) falls directly behind the opa
  - [GAP:playerscoresheet-cross-surface-consistency · was P1] Waivers FA player card renders BELOW the bottom nav (z-95 vs nav z-100); the other three sheets overlay at z-200 — `apps/web/src/waivers/waivers.css:748`. FaPlayerCardSheet mounts as `.pc-scrim` (ds.css:430 base z-index 80, lifted to 95 by `.wv-app .pc-scrim` in waivers.css:748) inside `.wv-app` inside `.sh-content` (shell.css:157 — overflow-y:auto, no transform/opacity/z-index, so it creates NO stacking context). The fixed bottom nav `.sh-btmnav` is z-index 100 (shell.css:177) and is rendered by AppShell, which WaiversLayout always wraps (waivers/l

#### F-P1-I2 · Every text input in the design system is 13–15px — iOS Safari zoom-on-focus app-wide, starting at the sign-in email field

- **Severity:** P1
- **Screen+State:** /sign-in email · /waivers FA search + composer · /commish selects/number fields · /draft search · /settings display name — any state
- **Location:** `apps/web/app/styles/ds.css:226`
- **Observed:** ds .input/.select/.textarea are font-size: var(--fs-body)=14px (ds.css:223-228); .au-input is 15px (app/_auth/auth.css:210); .wv-comp-input 14px (src/waivers/waivers.css:589); .adm-select/.adm-input are var(--fs-sm)=13px (commish.css:532,602). iOS Safari zooms the page when a focused control is <16px, and the zoom PERSISTS after blur — on 360-430px this shifts layout, pushes the fixed bottom nav off-screen, and forces a pinch-out after every search/bid/rename. The lone compliant input is .wv-bid-input at 18px (waivers.css:793). Also: the bid amount input is type="number" without inputMode="numeric" (src/waivers/BidComposer.tsx:221) and no input anywhere sets enterKeyHint. Fix: bump form-control font-size to 16px under a coarse-pointer/max-width media query (visual size can stay via transform or padding), add inputmode/enterkeyhint.
- **Design-reference delta:** design/design_reference/ds/ds.css:224 has the same 14px .input — the prototype was viewed in fit-scaled desktop frames where iOS zoom never fired; porting it unadjusted is the defect.
- **Fix theme:** inputs / iOS keyboard
- **Effort:** M
- **Confidence:** verified-static
- **Merged instances** (independently reported, folded into this finding):
  - [D · was P1] Free-agent search input renders at 14px — below iOS Safari's 16px zoom-on-focus threshold — in both the bid composer and the instant-FA panel — `apps/web/src/waivers/waivers.css:582-591`. `.wv-comp-input{ ... font: var(--fw-medium) 14px var(--font-sans); }` (line 589) is applied to the 'Search free agents…' `<input>` in both `apps/web/src/waivers/BidComposer.tsx:146-151` and `apps/web/src/waivers/FreeAgentPanel.tsx:108-113`. The base `.input` class (apps/web/app/styles/ds.css:223-228) already resolves to `var(--fs-body)`=14px too, so there is no larger fallback. Any input with a co
  - [G · was P2] Every console input/select/number field is 13px (< 16px) and misses the 44px density rule — iOS zooms the viewport on each focus — `apps/web/app/commish/commish.css:532`. `.adm-select` (:532) and `.adm-input` (:602) set `font-size: var(--fs-sm)` which ds.css:27 defines as 13px; `.adm-num` (:587) sets no font-size at all (UA default, also < 16px). Because the console uses `.adm-*` classes rather than ds `.input/.select`, it also never receives the `[data-density="comfortable"] .input,.select { min-height:44px }` rule (ds.css:382). iOS Safari zooms the page whenever 
  - [H · was P1] Sign-in email input renders at 15px, under iOS Safari's 16px zoom-on-focus threshold, on the app's universal first-touch screen — `apps/web/app/_auth/auth.css:203-213`. `.au-input { ...; font: 500 15px var(--font-sans); ... }` (auth.css:210) styles the only input on `/sign-in` (apps/web/app/sign-in/page.tsx:93-104, `type="email"`). Any input with a computed font-size below 16px triggers iOS Safari's automatic pinch-zoom-in on focus; because this is the very first field every manager interacts with on every sign-in, the page will visibly zoom and re-layout each ti
  - [H · was P2] Display-name rename input renders at 14px (shared `.input` token), also under the iOS zoom threshold — `apps/web/src/settings/SettingsClient.tsx:60-71`. The `id="se-display-name"` input uses the shared `.input` class (apps/web/app/styles/ds.css:223-228), whose `font-size: var(--fs-body)` resolves to 14px (ds.css:26). Below the settings layout's `data-density="comfortable"` this only bumps `min-height` to 44px (ds.css:382), not font-size — so the field still triggers iOS zoom-on-focus, the same class of bug as the sign-in email field but on a lower
  - [J · was P3] Commissioner pick-clock-seconds input uses an explicit 13px font-size, below iOS's 16px zoom-on-focus threshold — `apps/web/app/draft/DraftRoomClient.tsx:588-596`. `<input type="number" ... style={{ fontSize: 13, padding: "4px 8px", ... }} aria-label="Pick clock seconds" />`. Any input under 16px font-size triggers iOS Safari's auto-zoom on focus. Low current impact since this input is only reachable via the already-flagged dead 'Set clock' control on the completed draft, but it's a real papercut for the commissioner on a phone.

#### F-P1-J1 · /scoring §1 Performance Rating table shows wrong band boundaries and omits the 0-point band entirely

- **Severity:** P1
- **Screen+State:** /scoring · copy-vs-engine accuracy
- **Location:** `apps/web/app/scoring/page.tsx:76-118`
- **Observed:** The page's §1 table reads: 9.0+ → +5, 8.5–8.9 → +4, 7.5–8.4 → +3, 7.0–7.4 → +2, 6.5–6.9 → +1, 6.0–6.4 → −1, Below 6.0 → −2. The live engine's `ratingPoints()` (packages/scoring/src/index.ts:38-47) is: <6.0→−2, <6.5→−1, <7.0→0, <7.5→+1, <8.0→+2, <8.5→+3, <9.0→+4, ≥9.0→+5. Three middle bands are mislabeled (7.5–7.9 is actually +2 not +3; 7.0–7.4 is actually +1 not +2; 6.5–6.9 is actually 0 not +1) and the entire 0-point band (6.5–6.9) is missing from the table — the exact band the 'Zero-rating line layer' work made sure still renders in the live scoring breakdown. Corroboration: the page's own §9 MID example card (apps/web/src/scoring/scoringData.ts:85) scores a 7.8 rating at +2 — matching the real engine, but directly contradicting the §1 table above it, which claims 7.5–8.4 → +3. A manager reading this page will misjudge what a 6.8 or 7.2-rated player is worth.
- **Design-reference delta:** n/a — this is engine-vs-copy drift, not a design_reference divergence.
- **Fix theme:** copy
- **Effort:** S
- **Confidence:** verified-static

#### F-P1-J2 · /scoring §4 'Possession lost' divisor is stale (page says ÷3, engine uses ÷10) and 5 live scoring categories are missing from the table entirely

- **Severity:** P1
- **Screen+State:** /scoring · copy-vs-engine accuracy
- **Location:** `apps/web/app/scoring/page.tsx:236-241`
- **Observed:** Page states 'Possession lost … −1 / 3' with worked calc '5 → floor(5/3) = −1'. The live engine (packages/scoring/src/index.ts:241-248) computes `-floorPer(input.possessionLost, 10)` — i.e. ÷10, not ÷3 (the code comment even documents the history: 'Recalibrated −1/8 → −1/10'). All four §9 worked examples (apps/web/src/scoring/scoringData.ts:56,75,94,113) also use the stale ÷3 math for their possession-lost line, so every card's stated total is computed under the wrong rule (e.g. the GK card's 'Total 14' bakes in a −1 that would actually be 0 under ÷10). Separately, the engine now scores 5 additional §4 accumulator categories that never appear on the page at all: shots on target (÷3), ball recoveries (÷5, outfield-only), big chances created (÷1), accurate crosses (÷4), and touches (÷25) — packages/scoring/src/index.ts:150-166, packages/scoring/src/types.ts:44-51. The reference table presents §4 as exhaustive when it's missing roughly a third of the live accumulator lines.
- **Design-reference delta:** n/a — engine-vs-copy drift.
- **Fix theme:** copy
- **Effort:** M
- **Confidence:** verified-static

#### F-P1-J3 · /scoring §8 'Straight red' minute-band points are off by exactly one point in every band

- **Severity:** P1
- **Screen+State:** /scoring · copy-vs-engine accuracy
- **Location:** `apps/web/app/scoring/page.tsx:421-424`
- **Observed:** Page: 'Straight red (min 0–29 / 30–59 / ≥60)' → '−5 / −4 / −3'. Engine's `redCardPoints()` (packages/scoring/src/index.ts:60-65) returns −4 / −3 / −2 for those exact bands (`if (minute < 30) return -4; if (minute < 60) return -3; return -2;`). Every band the page shows is one point harsher than what the engine actually applies.
- **Design-reference delta:** n/a — engine-vs-copy drift.
- **Fix theme:** copy
- **Effort:** S
- **Confidence:** verified-static

#### F-P1-J4 · Commissioner 'Set clock' control renders and functions on a permanently-complete draft (misleading dead UI)

- **Severity:** P1
- **Screen+State:** /draft post-draft as commissioner
- **Location:** `apps/web/app/draft/DraftRoomClient.tsx:383-385`
- **Observed:** `{state.sessionManagerIsCommissioner && (<ClockEditor .../>)}` has no `state.status` gate, unlike the adjacent timer-toggle/Force-pick controls which correctly check `state.status === "active"` (line 371). On the completed draft the commissioner still sees a live 'Set clock' input+button. Submitting it POSTs to `/api/draft/clock`, whose handler `handleClockUpdate` (apps/web/src/draft/handleClockUpdate.ts:44-65) has no draft-status guard at all — it unconditionally calls `updateLeagueClock` and returns 200 `{ draftPickSeconds: seconds }` (apps/web/app/api/draft/clock/route.ts:15-33). Compare `/api/draft/timer`, which correctly 409s with `where: { status: { not: "complete" } }` (apps/web/app/api/draft/timer/route.ts:32-41). The commissioner gets a false-positive 'success' for a control that can never again affect anything.
- **Design-reference delta:** n/a — ClockEditor was added post-port (Draft timer/clock threads); design_reference/draft/app.jsx has no equivalent commissioner clock-seconds editor to diverge from.
- **Fix theme:** dead-ui gating
- **Effort:** S
- **Confidence:** verified-static

#### F-P1-K1 · Mobile "Your survival" band mis-signals eliminated/zone state (accent-as-safe; blank when out)

- **Severity:** P1
- **Screen+State:** /playoffs mobile · eliminated-manager view (and any viewer whose margin is null)
- **Location:** `apps/web/app/playoffs/components.tsx:1100`
- **Observed:** The mobile band computes inZone = !!margin && !margin.safe (:1100), then styles the rank number is-zone/is-safe from inZone (:1110) and the band tint from inZone (:1107). margin (myMargin) returns null whenever the viewer isn't in the current round's ranked rows — i.e. exactly when they've been guillotined in an earlier round. So an eliminated manager gets inZone=false → is-safe → their rank renders in the cobalt ACCENT (the "you're safe" color), while the middle cell, if me is populated, simultaneously renders a red "Eliminated" skull (:1123) — a color/word contradiction. If view.me is null the band degrades to "You –/N … – pts" with no status word and still-accent styling. The desktop hero does this correctly by keying the rank color on me.state directly (me.state === "safe" ? is-safe : is-zone, :893) and shows an explicit "Out of the playoffs" fallback (:909); the mobile band has neither. On the guillotine screen the eliminated cohort only grows each round, so a large share of the ~12 phone users hit this every round.
- **Design-reference delta:** Diverges from the correct desktop path (same file, :893/:909) and from design/CLAUDE.md §3 functional-color rule (accent must never mark a functional state; here it marks an eliminated manager as safe).
- **Fix theme:** guillotine state legibility
- **Effort:** S
- **Confidence:** verified-static

#### F-P1-ERR1 · No root not-found.tsx: unmatched URLs and games notFound() render Next's bare default 404 outside the ds theme + app shell

- **Severity:** P1
- **Screen+State:** (unmatched URL, e.g. /zzz) and /games/[matchId] · unknown matchId → notFound()
- **Location:** `apps/web/app/games/[matchId]/page.tsx:25`
- **Observed:** notFound() (page.tsx:25) and any route miss have no not-found.tsx to catch them anywhere in the tree (glob of app/**/{not-found}.tsx is empty), so Next 15.1.4 renders its built-in default 404. That default is wrapped ONLY by the root layout (apps/web/app/layout.tsx:44-55 = html/body/children with no shell); the AppShell that carries the bottom tab bar and back-to-home lives in per-route layouts (apps/web/app/shell/AppShell.tsx:233-256, e.g. games/[matchId]/layout.tsx:28-31), so the 404 has NO nav, NO back affordance, NO XI brand, and no env(safe-area-inset) padding under the notch/home indicator on a viewport-fit=cover PWA. The app's dark surface is a GLOBAL body element rule (apps/web/app/styles/ds.css:149-158, background:var(--surface-0)=#0A0D12, imported globally at layout.tsx:8, :root dark by default so no data-theme needed) — so in principle the 404 would be dark. BUT Next's built-in not-found injects an inline <style> setting body{background:#fff;color:#000;margin:0} with a @media(prefers-color-scheme:dark) flip to #000/#fff; that <style> renders inside <body> AFTER ds.css's head <link> and targets the same body element selector, so it wins the cascade tie and overrides --surface-0. Net at 360-430px: WHITE page with black system-font '404 | This page could not be found.' on a light-mode phone, pure #000 (not app #0A0D12) on dark-mode — a jarring themeless dead-end. Middleware does not redirect (lib/supabase/middleware.ts:9-34 is auth-refresh only, comment lines 4-5), so garbage URLs surface this to authed AND unauthed visitors alike. Cannot read node_modules in this worktree to pin the exact 15.1.4 injected markup, so the white-vs-black outcome is flagged for live check.
- **Design-reference delta:** n/a — design/design_reference has no 404 screen; the recommended replacement should use ds vocabulary (card, btn-primary, brand) per design/CLAUDE.md §4
- **Fix theme:** error/404 boundary
- **Effort:** S
- **Confidence:** needs-live-verify

#### F-P1-ERR2 · No error.tsx / global-error.tsx: an uncaught server exception mid-matchday renders Next's bare error page, likely without ds.css at all

- **Severity:** P1
- **Screen+State:** (any force-dynamic route) · uncaught server exception (e.g. Prisma unavailable during a matchday traffic spike)
- **Location:** `apps/web/app/layout.tsx:44`
- **Observed:** There is no error.tsx or global-error.tsx anywhere (glob empty). Every route is force-dynamic with a Prisma-backed loader (13/13 pages export dynamic='force-dynamic'; e.g. games/[matchId]/page.tsx:16, waivers/page.tsx:15), so a DB blip / connection-pool exhaustion during a live knockout matchday throws in a Server Component render. With no error boundary up to the root, the error escalates to global-error, and with no global-error.tsx Next uses its built-in default, which REPLACES the root layout (renders its own html/body) — meaning ds.css imported at layout.tsx:8 is not even in the document, so no --surface-0 dark, no Schibsted/Hanken fonts, no nav, no back link. In production this is the generic 'Application error: a server-side exception has occurred' on a white(light)/black(dark) system-font page. This is the most detached dead-end of the three and the most plausible under live load. Absence is verified-static; the exact rendering (no-ds, white flash) depends on Next internals not readable here.
- **Design-reference delta:** n/a — no error screen in design/design_reference; global-error must self-contain html/body + inline critical ds tokens/fonts since it replaces the root layout
- **Fix theme:** error/404 boundary
- **Effort:** M
- **Confidence:** needs-live-verify

#### F-P1-TZ1 · Dashboard matchday kickoff renders bare UTC (~4h off league-local) with no zone label, contradicting /lineup lock deadlines

- **Severity:** P1
- **Screen+State:** / (dashboard) · group phase, MatchdayModule scheduled fixture >=60m out
- **Location:** `apps/web/app/_dashboard/Dashboard.tsx:459-462`
- **Observed:** formatKickoffTime does `d.getUTCHours()`/`getUTCMinutes()` and returns bare 'HH:mm' (used in MatchRow at line 447 for scheduled fixtures). No timezone suffix. For the prod league (America/New_York, UTC-4 in July) a 17:00Z kickoff prints '17:00' on the dashboard while /lineup's KickoffTag prints '1:00 PM EDT' for the identical fixture — a 4h contradiction. A manager glancing at the dashboard to judge when to lock reads the wrong hour. This module is group-phase-gated (modulesFor('group')), so it is not on-screen in the current live playoff phase, but it is the primary glance surface whenever a group matchday is live and the defect is unambiguous.
- **Design-reference delta:** Violates design/CLAUDE.md:44 ('UTC-stored; league-local is a display concern'); does not use the shared formatInLeagueTz that /lineup and /waivers use.
- **Fix theme:** time-zone consistency
- **Effort:** M
- **Confidence:** verified-static


### P2 — polish / consistency

#### F-P2-A1 · No color-scheme:dark and no <html> background → white first-paint flash + light native controls + white overscroll on iOS

- **Severity:** P2
- **Screen+State:** all routes · iOS Safari load, overscroll, and any native input
- **Location:** `apps/web/app/styles/ds.css:148`
- **Observed:** ds.css sets `body { background: var(--surface-0) }` (149) but never sets a background on `html`, and `color-scheme` appears nowhere in apps/web (grep confirms only design-reference files use it). layout.tsx (51-52) renders `<html lang="en">` with no color-scheme meta/attr. Consequences on a dark app viewed on iOS: (a) the root scroller is `html`, whose background is the UA default, so the rubber-band overscroll area at top/bottom shows a white band during the constant scrolling of live screens; (b) before CSS applies (cold load / slow 4G) the page paints white, not #0A0D12; (c) native form controls (Settings display-name input, any date/time) render in light chrome. themeColor #0A0D12 only styles the browser UI bar, not these. Fix: `color-scheme: dark` + `background: var(--surface-0)` on the root element (and `color-scheme: light` under [data-theme=light] when that ships).
- **Design-reference delta:** n/a (reinforces dark-first locked decision; reference only scopes color-scheme onto date/time inputs)
- **Fix theme:** dark-scheme correctness
- **Effort:** S
- **Confidence:** verified-static

#### F-P2-A2 · Light theme is completely unreachable despite being a locked first-class decision

- **Severity:** P2
- **Screen+State:** all routes · no appearance toggle exists anywhere
- **Location:** `apps/web/app/settings/page.tsx:50`
- **Observed:** design/CLAUDE.md §3 and the reference settings screen make light a first-class toggle (reference `settings/app.jsx:29` reads prefers-color-scheme and offers dark/light/system, writing data-theme on the root). In the live app the Appearance section is an unbuilt TODO (settings/page.tsx:50), and every route layout hardcodes `data-theme="dark"` (e.g. lineup/layout.tsx:16, vsfield/layout.tsx:20, pool/layout.tsx:23, all others). The [data-theme="light"] token block in ds.css:115 is therefore dead — no UI path can ever activate it. Recording once here per audit instruction; it is a single missing feature, not a per-screen defect.
- **Design-reference delta:** design/design_reference/settings/app.jsx:29 (theme dark/light/system switcher writing data-theme on root); design/CLAUDE.md §3 'Light is a first-class toggle'
- **Fix theme:** theme toggle
- **Effort:** M
- **Confidence:** verified-static
- **Merged instances** (independently reported, folded into this finding):
  - [H · was P2] /settings has no Appearance section at all — three bare TODO comments where the reference's "live hero" section belongs — `apps/web/app/settings/page.tsx:49-52`. `page.tsx` renders only "Public profile" and "Notifications"; the theme/accent/density/reduce-motion controls are three `{/* TODO(confirm) */}` comments (lines 49-52), never rendered. This is the settings-surface half of the broader locked "light is a first-class toggle" decision (root theme-toggle absence tracked separately by cluster A) — recorded here as the single settings-surface delta since 
  - [I · was P2] Light theme is unreachable dead code and internally broken: no toggle exists, per-route data-theme="dark" pins would fight one, and light --accent-soft is GREEN under the cobalt lock — `apps/web/app/styles/ds.css:130`. (a) No code path ever sets data-theme="light" — every consumer hardcodes data-theme="dark" on a route wrapper (grep: 14 layouts, e.g. app/lineup/layout.tsx:16), an attribute that is INERT (no [data-theme="dark"] block exists; dark is :root). If a real <html> toggle lands, these wrapper attrs won't block it (they set nothing) but the pattern invites someone to 'fix' theming per-route. (b) Inside [d

#### F-P2-A3 · Bottom-tab IA is phase-blind: live guillotine Playoffs (+ Standings, Waivers) buried in More while Quiniela holds a primary slot mid-knockout

- **Severity:** P2
- **Screen+State:** all mobile routes · live guillotine knockout (current tournament state)
- **Location:** `apps/web/src/shell/crossNav.ts:67`
- **Observed:** BOTTOM_TAB_ITEMS (67-72) is a hardcoded set — Dashboard · Set lineup · Vs the field · Quiniela — regardless of tournament phase, with Playoffs/Standings/Waivers/Scoring/Draft/Settings all in MORE_SHEET_ITEMS (76-84). During the live guillotine, the screen that answers the manager's only urgent question ('am I above the cut line this round?') is the /playoffs theater, reachable only via More → Playoffs (two taps, not glanceable), while Quiniela — a secondary side pick'em added after the reference IA — occupies a permanent primary tab. The reference shell drives primary nav from `primaryKeys(phase)` (nav.jsx:48) and modules from modulesFor(phase), i.e. phase-aware; the live bottom bar is static. Vs-the-field and Set-lineup being primary is correct; the gap is Playoffs vs Quiniela priority for the current phase.
- **Design-reference delta:** design/design_reference/shell/nav.jsx:48 (primaryKeys(phase)) + shell/mobile.jsx (phase-driven MobileTabBar/modulesFor)
- **Fix theme:** bottom-nav IA
- **Effort:** M
- **Confidence:** needs-live-verify

#### F-P2-A4 · MoreSheet lacks a grabber, close button, and title — dismissal is non-obvious on touch

- **Severity:** P2
- **Screen+State:** any mobile route · More sheet open
- **Location:** `apps/web/app/shell/MoreSheet.tsx:71`
- **Observed:** The bottom sheet (MoreSheet.tsx:71-114 / .sh-more-sheet shell.css:230) renders a bare list + footer with no grabber handle, no explicit close (X) control, no title header, and no swipe-to-dismiss. It can only be closed by tapping the scrim or selecting an item — there is no visible affordance signalling it is dismissible, which breaks the iOS bottom-sheet convention (grabber + swipe-down) users expect. The canonical reference MobileSheet has all three (`.sh-sheet-grab`, `.sh-sheet-x`, title header). For an Apple-feature-worthy bar this reads unfinished.
- **Design-reference delta:** design/design_reference/shell/nav.jsx:219 (MobileSheet with sh-sheet-grab + sh-sheet-x + title head)
- **Fix theme:** sheet ergonomics
- **Effort:** S
- **Confidence:** verified-static

#### F-P2-B1 · Live standings re-sorts have zero motion cue — a manager's row can silently teleport during a live match

- **Severity:** P2
- **Screen+State:** /standings · Matchday/Cumulative tabs during a live group or knockout scoring wave
- **Location:** `apps/web/app/standings/StandingsClient.tsx:43-83; apps/web/app/standings/standings.css (no transform/highlight transition on .st-row/.st-row-main beyond a background-color hover fade)`
- **Observed:** `startStandingsLive` nudges a full snapshot refetch on any `score_manager_period`/`standing` Realtime change (realtime.ts:69-76) or a 20s visibility-gated poll, and `onSnapshot: (v) => setView(v)` (StandingsClient.tsx:56) replaces the whole `StandingsView` wholesale. Rows are keyed by `managerId`, so React reorders DOM nodes on rank change with no `.score-pulse` (defined in ds.css, grep confirms zero usage in this cluster) or any transform-based reorder transition — a row simply appears at its new position on the next render. A manager scrolled mid-list can lose track of their own row without any highlight telling them something changed.
- **Design-reference delta:** n/a
- **Fix theme:** live-update motion
- **Effort:** M
- **Confidence:** needs-live-verify

#### F-P2-B2 · Season Grid's horizontal scroll has no visual affordance indicating more matchday columns exist off-screen

- **Severity:** P2
- **Screen+State:** /standings · Season tab @360px
- **Location:** `apps/web/app/standings/standings.css:459-464,565-571`
- **Observed:** `.st-season-scroll { overflow-x: auto; }` is a real scroll container (correctly built, unlike the Matchday/Cumulative clipping bugs above) with a sticky Manager column, but there is no edge fade/gradient, shadow, or textual hint signalling that additional matchday columns + the Total column continue past the visible edge. iOS Safari hides the native scrollbar until an active scroll gesture, so on first paint the table can look complete when it isn't. The code itself flags this as unfinished: 'Tighten the sticky Manager column on phones ... full mobile polish is T15' (standings.css:566).
- **Design-reference delta:** n/a — explicitly deferred in-code, this audit is the T15 pass called out
- **Fix theme:** scroll-affordance
- **Effort:** S
- **Confidence:** needs-live-verify

#### F-P2-B3 · Standings ContextBand still calls the playoff cut line "provisional ... fixed at the group→playoff transition" after that transition has already happened

- **Severity:** P2
- **Screen+State:** /standings · Cumulative tab, current live knockout window (guillotine playoffs already seeded/underway)
- **Location:** `apps/web/app/standings/components.tsx:274-283; apps/web/app/standings/loadStandings.ts:96-99`
- **Observed:** `ContextBand` unconditionally renders 'Top {fieldSize} qualify' + '... fixed at the group→playoff transition' (components.tsx:277-281). `loadStandings` never reads an actual persisted/locked field size — the comment says so directly: 'fieldSize omitted → the pure builder applies DEFAULT_PLAYOFF_FIELD_SIZE. The real field size is fixed only at the group→playoff transition (Theme C); there is no league column to read yet' (loadStandings.ts:96-99). Today the group→playoff transition has already occurred (guillotine playoffs are live per project state), so a manager visiting /standings still sees framing that describes a future event as if it hasn't happened, and the displayed cut-line number is a hardcoded default rather than the real locked field size.
- **Design-reference delta:** n/a — an acknowledged data-completeness gap in the loader, not a design-reference divergence
- **Fix theme:** stale-state copy
- **Effort:** M
- **Confidence:** verified-static

#### F-P2-C1 · Pitch legend describes only 2 states while the pitch renders 5+ live states — lock-on-play legend gap

- **Severity:** P2
- **Screen+State:** /lineup · mid-live (mixed locked/playing/played) and playoff reduced live
- **Location:** `apps/web/app/lineup/SetLineupClient.tsx:407`
- **Observed:** The legend (SetLineupClient.tsx:407-414) shows only 'Movable — still swappable' and 'Locked — has played, frozen'. But the pitch simultaneously renders: played-starter tokens (amber ytp border, still TAPPABLE to forfeit — the opposite of 'frozen', lineup.css:450-459), locked-playing tokens (red --live score-dot, lineup.css:681-692), voided/Forfeited (strike + danger pill, components.tsx:198-204), and green 'Starting'/red 'Out' availability medallions (components.tsx:150-158). A manager glancing during a live knockout match sees red/amber/steel/green tokens with no key, and the one legend row mentioning 'locked' wrongly implies played tokens are un-tappable. The reference explicitly keys three states incl. 'Locked · playing — on the pitch now'.
- **Design-reference delta:** design/design_reference/setlineup/components.jsx:248-256 (PitchLegend has 3 explicit color+icon+word states)
- **Fix theme:** state legibility / legend
- **Effort:** S
- **Confidence:** verified-static

#### F-P2-C2 · No 'next lock' countdown and the clock never re-samples — live lock urgency/staleness on the phone

- **Severity:** P2
- **Screen+State:** /lineup · mid-live period, manager idling on the screen during matches
- **Location:** `apps/web/app/lineup/SetLineupClient.tsx:122`
- **Observed:** `now = useMemo(() => new Date(), [activeId, starterIds])` (SetLineupClient.tsx:122) — the window/lock evaluation only refreshes on an edit or a period switch, never on a timer, and there is no realtime subscription. So a rostered player whose match kicks off while the manager watches stays visually 'movable' until a reload (the server still rejects a late save, but that rejection is the off-screen toast, see the P1). The LockHero (components.tsx:551-588) shows movable/locked counts + save status but no 'Next lock in Xh' deadline or the 'no auto-subs / even a benched 0-min starter' explainer the reference leads with. Per-player KickoffTag (components.tsx:49-64) partially mitigates by showing each token's own lock time.
- **Design-reference delta:** design/design_reference/setlineup/components.jsx:261-338 + mobile.jsx:41 (LockHero 'Next lock in Xh' deadline + lock-on-play explainer note)
- **Fix theme:** live lock legibility
- **Effort:** M
- **Confidence:** needs-live-verify

#### F-P2-C3 · 'No legal swap' case gives no feedback, and the swap hint lives below the fold on mobile

- **Severity:** P2
- **Screen+State:** /lineup · swap flow — a movable player selected with zero eligible targets
- **Location:** `apps/web/app/lineup/SetLineupClient.tsx:418`
- **Observed:** When a selected movable player has no eligible swap targets, eligibleIds is empty (view.ts:139-147) so nothing highlights, yet the hint still reads 'Tap a highlighted teammate to swap…' (SetLineupClient.tsx:418-421) — a dead-end with no explanation. The reference SelectionHint explicitly renders 'No legal swap for X — your only [pos] cover is frozen or already in.' Separately, the hint lives in `.sl-rail` (the aside), which at ≤820px stacks BELOW the tall pitch (lineup.css:141-149); on a 360x780 viewport the pitch (6 lanes ~400-480px) plus header/hero/formation above push the hint off-screen, so even the normal 'tap a highlighted teammate' guidance isn't visible right after the selecting tap (the eligible highlights on the pitch are the only on-screen cue).
- **Design-reference delta:** design/design_reference/setlineup/components.jsx:344-365 (SelectionHint surfaces the no-legal-swap reason)
- **Fix theme:** swap-flow legibility
- **Effort:** M
- **Confidence:** verified-static

#### F-P2-C4 · Frozen (commish-freeze) period may present editable swap affordances + an enabled Save the server then rejects

- **Severity:** P2
- **Screen+State:** /lineup · frozen period (commissioner freeze active on a live, not-yet-done window)
- **Location:** `apps/web/app/lineup/SetLineupClient.tsx:132`
- **Observed:** `editable` is gated only on readOnly, status!=='closed', and closesAt (SetLineupClient.tsx:132-135); it ignores frozenAt. The pitch's isMovable keys solely on period.locks (view.ts:48-50). loadLineup DOES compute slotMeta.movable = !periodFrozen && !voided (loadLineup.ts:239), but that field only affects classification of ALREADY-PLAYED players — an unplayed player in a frozen period still classifies 'movable' and Save stays enabled. If freeze is meant to hard-stop lineup edits, the UI misrepresents the window (and the server rejection lands in the off-screen toast). If freeze is restatement-only (project memory: 'frozen_at = auto-restatement gate ONLY'), edits are intended and this is correct — which is why it cannot be settled statically.
- **Design-reference delta:** n/a (reference has no freeze state)
- **Fix theme:** state legibility / edit-gating
- **Effort:** M
- **Confidence:** needs-live-verify

#### F-P2-C5 · Read-only prior matchday is not unmistakably read-only at a glance on mobile

- **Severity:** P2
- **Screen+State:** /lineup · group-phase historical period (read-only) and prior-matchday snapshot
- **Location:** `apps/web/app/lineup/components.tsx:526`
- **Observed:** The only read-only signals are the tab's small 'final' sub-label (components.tsx:526-527), token dimming/amber (which also occurs mid-live), and the SaveBar copy 'This window is closed — lineups can no longer be edited.' (components.tsx:731-733). That SaveBar copy is exactly what the fixed bottom nav occludes (see the P1), so on a phone the clearest read-only signal is hidden. There is no header/banner marking the historical view, so a manager who taps a 'final' tab sees a normal-looking pitch (the formation picker even still renders its tabs, just disabled — ReadOnlyPeriod.test.tsx:75-78) and may try to interact before realizing it's frozen. Mitigated by the loader defaulting the active tab to the live wave (loadLineup.ts:320-327), so users rarely LAND here.
- **Design-reference delta:** n/a (reference prototype has no read-only mode)
- **Fix theme:** read-only legibility
- **Effort:** S
- **Confidence:** verified-static

#### F-P2-C6 · Sub-token labels (opponent/kickoff/availability/score) are 9-11px, low-contrast over turf, and the opponent tag is unbounded at a 52px token

- **Severity:** P2
- **Screen+State:** /lineup · any period at ≤360px with resolved fixtures (opponent + kickoff shown)
- **Location:** `apps/web/app/lineup/components.tsx:354`
- **Observed:** Each pitch token stacks four micro-labels under a 52px (≤360px) / 62px (≤480px) disc: `.sl-tok-opp` is t-micro 11px text-tertiary (#6C7689) with NO max-width and NO ellipsis (components.tsx:354-356), so a real opponent like '@ Saudi Arabia' over the mowed-green gradient wraps unbounded and can visually collide with neighbours in a 5-wide MID lane; `.sl-tok-ko` is 9-9.5px (lineup.css:289-298, 908-911); `.sl-scorepill` is 9px in --locked on a 12% wash (lineup.css:660-677); `.sl-av-word` is 9px (lineup.css:570-577). Multiple sub-11px labels at these contrasts sit below the 14-15px body-legibility guidance and are marginal on WCAG AA against the turf.
- **Design-reference delta:** n/a (reference tokens are larger inside a fit-scaled 402px frame; density at real 360px CSS px differs)
- **Fix theme:** legibility
- **Effort:** M
- **Confidence:** needs-live-verify

#### F-P2-D1 · FA picker row crowds 5 fixed-width elements at 360px, squeezing player identity (name + team/points + next-opponent) into roughly a 90px column with triple-line ellipsis

- **Severity:** P2
- **Screen+State:** /waivers · FA panel mounted, bid compose (free-agent list)
- **Location:** `apps/web/src/waivers/waivers.css:632-666`
- **Observed:** Inside `.wv-comp-fa-wrap` (waivers.css:669-677) the button `.wv-comp-fa{padding:8px 10px; gap:10px}` carries, left to right: `KitChip` (min-width 26px, waivers.css:330-334), `NationFlag` (20px, ds.css:306), the flexible `.wv-comp-fa-id` column (name + team/points micro line + `OpponentLine`), and a `Pos` badge (min-width 30px, ds.css:251). Fixed items + gaps + button padding consume roughly 126px on their own; outside the button, `.wv-comp-fa-star`/`.wv-comp-fa-info` (34px each + 4px gaps, waivers.css:669-712) consume another ~76px. At a ~292px available content width inside the composer's `.wv-comp-pick` column on a 360px phone, that leaves only ~90px for the flexible identity column, which must fit three lines (bold name, team·points micro line, and the `OpponentLine` 'vs 🇫🇷 France' text) each independently ellipsized (`.wv-fa-opp{overflow:hidden;text-overflow:ellipsis}`, line 661-666). Real player/team names (e.g. 'Kylian Mbappé', 'Korea Republic') will render almost entirely truncated in this state.
- **Design-reference delta:** design/design_reference/waivers/components.jsx's `FaKit`/row markup does not carry the star + info trailing controls (those are app-original, Prompts 56/T2, added on top of an already-tight reference row without re-budgeting the flexible column's width).
- **Fix theme:** list-row density at 360px
- **Effort:** M
- **Confidence:** verified-static

#### F-P2-D2 · Free-agent pool (unbounded server fetch) is filtered/sorted synchronously on every keystroke with no memoization

- **Severity:** P2
- **Screen+State:** /waivers · bid compose, FA panel mounted (typing in the search box)
- **Location:** `apps/web/src/waivers/BidComposer.tsx:91-96`
- **Observed:** `loadWaivers.ts:250-254` fetches ALL unowned players league-wide with no `take` limit (`prisma.player.findMany({ where: { id: { notIn: excludeIds... } }, orderBy: {displayName:'asc'} })`), which per the player-pool memory (prod pool 1252 players, ~180 rostered across 12 managers) ships well over 1000 `WvPlayer` objects to the client on every /waivers load. `BidComposer.tsx:92-96` and `FreeAgentPanel.tsx:82-85` then call `claimableFreeAgents(...)` — a `.filter().sort()` over that full array — directly in the render body with no `useMemo`, so it re-executes on every re-render, including every keystroke in the search `<input>` (`query` state) and every 30s tick of the shared `now` clock. On a mid-range phone this is a real, unbounded per-keystroke CPU cost that could manifest as input lag while typing.
- **Design-reference delta:** n/a
- **Fix theme:** performance / list virtualization
- **Effort:** M
- **Confidence:** needs-live-verify

#### F-P2-D3 · CutoffTag (urgent/closed) and batch-result won/lost badges render color + word only, no icon — diverges from the locked 'color + icon + word' functional-state rule

- **Severity:** P2
- **Screen+State:** /waivers · bid compose/edit/cancel (CutoffTag), batch results (won/lost)
- **Location:** `apps/web/src/waivers/components.tsx:186-196,503-508`
- **Observed:** `CutoffTag` (lines 186-196) renders `<span className="wv-cutoff is-closed">cutoff passed</span>` or `<span className={"wv-cutoff"+(urgent?' is-urgent':'')}>{fmtCountdown}...</span>` — color class + text, no `<svg>` icon. Likewise the batch-result winner/loser pill (lines 503-508) renders `<span className={'wv-res-out '+(outcome==='won'?'wv-out-won':'wv-out-lost')}>{outcome==='won'?'won':'lost'}</span>` — again color + word only. This is inconsistent within the SAME file: the void/refund state (`Refund` icon used in `wv-void-tag`, `wv-voidnote`, and the void `BidLine` branch) correctly follows color+icon+word, but the cutoff-urgency and won/lost states do not.
- **Design-reference delta:** design/CLAUDE.md §3: 'Functional colors (always color + icon + word, never color alone)' — CutoffTag's urgent/closed states and the won/lost result badges violate this locked decision (the word alone likely keeps this from being a hard accessibility failure, but it is a real, citable design-token inconsistency).
- **Fix theme:** functional-state icons
- **Effort:** S
- **Confidence:** verified-static

#### F-P2-E1 · Long real player full names can visually overlap the Events-tab minute spine / opposite side

- **Severity:** P2
- **Screen+State:** /games/[matchId] · Events tab, any goal/sub/card by a player whose "First Last" name exceeds ~120-140px
- **Location:** `apps/web/app/games/[matchId]/GameDetailClient.tsx:789-843 (`EventBody`) and 846-880 (`TimelineRow`); apps/web/src/games/games.css:1687-1734 (`.gd-tev`, `.gd-tev-body`, `.gd-tev-line`)`
- **Observed:** `.gd-tev{grid-template-columns:1fr 64px 1fr}` (50px spine at ≤560px via games.css:1808-1811). Each half-column is ~120-140px wide at 360-390px. `EventBody` renders the FULL name (`fullNameById`, e.g. "Bukayo Saka") in `<b>` inside `.gd-tev-line{width:fit-content}`, and `.gd-tev-line b{white-space:nowrap}` forbids wrapping. The outer `.gd-tev-body{max-width:100%}` only constrains itself, not its `width:fit-content` child — `fit-content` sizes to the name's full intrinsic width regardless of the ancestor's max-width. There is no `overflow:hidden`/`text-overflow:ellipsis` anywhere in the chain. A name like "Cristiano Ronaldo" or "Nicolás Otamendi" (very plausible across a 32-nation World Cup roster) will render wider than its column and visually bleed toward the minute pill or the opposite team's column.
- **Design-reference delta:** n/a — matches the design reference byte-for-byte (design/design_reference/match_detail/matchdetail/md.css:247-249, identical `.md-tev-body{max-width:100%}` / `.md-tev-line{width:fit-content}` / `.md-tev-line b{white-space:nowrap}` with no ellipsis). This is a latent gap in the ported pattern itself, not a Code regression — the design's own showcase fixture only ever shows short names (Yamal, Oyarzabal, Mbappé), so the demo never exposed it.
- **Fix theme:** text truncation / overflow
- **Effort:** S
- **Confidence:** verified-static

#### F-P2-E2 · Pitch player tokens have no protected minimum size — floor is 7px, "legibility yields to the fit" by design

- **Severity:** P2
- **Screen+State:** /games/[matchId] · Lineups tab, dense XI (a back-5+mid-5 anomaly) or a short viewport (e.g. iPhone SE)
- **Location:** `apps/web/src/games/games.css:1385-1409 (`--shirt` clamp chain), apps/web/app/games/[matchId]/GameDetailClient.tsx:195-250 (`KitToken`)`
- **Observed:** `--shirt: clamp(7px, min(var(--gd-shirt-h), var(--gd-shirt-w)), 42px)` — the whole per-line token budget (jersey + name + fpts pill) is computed from the pitch's real leftover height divided by the busier side's row count, with every sub-piece (`--gd-name-h` floors at 5px, `--gd-foot-h` at 7px) explicitly allowed to shrink toward that floor rather than ever overflow or scroll (`.gd-phalf{overflow:hidden}` clips as a last resort). There is no floor tied to the 44×44px tap-target guideline anywhere in the chain — the code comment itself states "legibility yields to the fit." On a short viewport (iPhone SE-class) or any XI with 5+ formation lines per half, the resulting `<button className="gd-tok">` hit area (shirt-wrap width + stacked name/foot strip) can render meaningfully smaller than 44px, making individual players hard to tap accurately on the screen's default tab.
- **Design-reference delta:** n/a — this is the app's own engineered fit-to-viewport system (not present in the design reference's fixed 660px mobile pitch height); flagged because the trade-off explicitly has no tap-target floor.
- **Fix theme:** tap-targets
- **Effort:** M
- **Confidence:** needs-live-verify

#### F-P2-E3 · Live match status never shows a running minute or a half-time state — always a static "Live" word

- **Severity:** P2
- **Screen+State:** /games/[matchId] · live in progress; half-time
- **Location:** `apps/web/app/games/[matchId]/GameDetailClient.tsx:1005-1017 (`ClockPill`); packages/db/prisma/schema.prisma:367-437 (`FifaMatch` — no live-minute column); packages/shared/src/enums.ts:49-56 (`MatchStatus`, 5 values, no half-time/ET distinction)`
- **Observed:** `ClockPill` maps `MatchStatus` to a fixed label set (`Live` / `Full-time` / `Postponed` / `Abandoned` / `Scheduled`) with a pulsing dot for `in_progress` — there is no per-minute clock and no half-time-specific state, because `FifaMatch` carries no live-minute-tracking column at all (confirmed by reading the full model). During the exact state a manager is most likely to glance at this screen (a live match), the scoreboard cannot say what minute it is or that the game is at half-time versus actively being played.
- **Design-reference delta:** design/design_reference/match_detail/matchdetail/components.jsx:105-108 — the reference's `Scoreboard` explicitly renders `ph.key==='ht' ? 'Half-time' : ph.key==='pre' ? 'Kick-off <ko>' : ph.clock` (a live "32'" clock), a state the live data model cannot currently produce.
- **Fix theme:** live state legibility
- **Effort:** L
- **Confidence:** needs-live-verify

#### F-P2-E4 · Muted (appearance-only) fantasy-points chip likely fails WCAG AA contrast

- **Severity:** P2
- **Screen+State:** /games/[matchId] · any match with appearance-only (non-scoring) players — the majority of every lineup
- **Location:** `apps/web/src/games/games.css:369-372 (`.gd-fpts.is-muted`), apps/web/app/styles/ds.css:60 (`--text-tertiary: #6C7689`, dark theme) and :49 (`--surface-0: #0A0D12`)`
- **Observed:** `--text-tertiary` (#6C7689) against `--surface-0` (#0A0D12) computes to a contrast ratio of ≈4.25:1 by the WCAG relative-luminance formula — already below the 4.5:1 AA threshold for normal-size text (the chip text is 13px/9.4px, not "large text"). `.gd-fpts.is-muted` then layers `opacity:0.85` on top of that same color, pushing the effective contrast further below 4.25:1. This class renders on every player whose fantasy line is baseline/appearance-only (not `mine`, no goal/assist), i.e. the majority of the 22+ player pool in most matches, across pitch tokens, lineup rows, the ratings board, and the stake strip.
- **Design-reference delta:** n/a — token value is global (not games.css-specific), but the added `opacity:0.85` stacking is local to this file and worsens an already-borderline token.
- **Fix theme:** contrast
- **Effort:** S
- **Confidence:** verified-static

#### F-P2-G1 · `--border` and `--surface` tokens are undefined app-wide (22 refs, no fallback) — form groups, cut-preview rows, freeze rows and chips render borderless and the `.adm-form` slate wash is lost

- **Severity:** P2
- **Screen+State:** /commish · all four tabs (commissioner)
- **Location:** `apps/web/app/commish/commish.css:561`
- **Observed:** commish.css references `var(--border)` 22 times with NO fallback (e.g. `.adm-select` :529, `.adm-form` :561, `.adm-num` :591, `.adm-input` :599, `.adm-freeze` :713, `.adm-freeze-btn` :764, `.adm-adv-round` :824, `.adm-adv-chip` :853, `.adm-adv-row` :910, `.adm-adv-tiechip` :967) and `.adm-form` background at :563 uses `color-mix(... var(--surface))`. A repo-wide grep confirms `--border` and `--surface` are defined nowhere in apps/web (the app ds.css uses `--hairline`/`--hairline-strong` and `--surface-0..4`). An undefined var with no fallback is invalid-at-computed-value-time, so on every `<div>` surface the border reverts to `border-style:none` and `.adm-form`'s background reverts to transparent. Result: each repair/stat form group is a borderless, background-less container (its elevated-privileges slate wash gone), the cut-preview rows/chips lose their outlines, and the `.is-cut`/`.is-tied` highlight border on the guillotine table (`border-color: color-mix(--elim, var(--border))`, :917/:921) does not render — only the faint background tint survives. Backgrounds keep enough contrast that content stays reachable, but the visual structure and the deliberate slate treatment are degraded. (Native `<select>`/`<input>` MAY still draw a platform border — see live_verify.)
- **Design-reference delta:** design/design_reference/admin/mobile.jsx + design/CLAUDE.md §4 — the reference's slate `--adm-edge`/hairline chrome was ported against `--border`/`--surface` names the app ds.css does not provide
- **Fix theme:** token drift
- **Effort:** S
- **Confidence:** verified-static
- **Merged instances** (independently reported, folded into this finding):
  - [I · was P2] commish.css builds on undefined tokens: var(--border) collapses 10 border shorthands to NO border; var(--pos,#35c48a) paints an off-palette green — `apps/web/app/commish/commish.css:529`. --border and --surface are defined nowhere in apps/web (grep: no '--border:' or '--surface:' declarations). 'border: 1px solid var(--border)' appears on .adm-select(529), .adm-form(561), .adm-num(591), .adm-input(599), .adm-freeze(713), .adm-freeze-btn(764), .adm-adv-round(824), .adm-adv-chip(853), .adm-adv-row(910), .adm-adv-tiechip(967). A var() invalid at computed-value time makes the whole sho

#### F-P2-G2 · Tab bar overflows 360px — four long labels sum ~560px, horizontal-scroll with no affordance leaves the Game-operations tab off-screen

- **Severity:** P2
- **Screen+State:** /commish · tab bar at 360-390px (commissioner)
- **Location:** `apps/web/app/commish/CommishConsole.tsx:38`
- **Observed:** TABS use full-length labels "Playoff cuts" / "Stat corrections" / "Roster & lineup" / "Game operations" (CommishConsole.tsx:38-57), each `white-space:nowrap` in `.adm-tabs { overflow-x:auto }` (commish.css:81-100). At 14px bold the four tabs total ~558px vs ~324px of content width at 360px, so the row scrolls horizontally with no fade/scroll-hint and the 4th tab (Game operations — the freeze surface) is not visible until the commissioner discovers the tabs scroll. The design reference deliberately used short single-word mobile labels (Field/Stats/Ops/Draft) to fit; the app collapsed to one responsive tree keeping the long labels.
- **Design-reference delta:** design/design_reference/admin/mobile.jsx:6-11 (TABS_M use short labels: 'Field','Stats','Ops','Draft')
- **Fix theme:** tab-bar IA
- **Effort:** S
- **Confidence:** verified-static

#### F-P2-G3 · Guillotine cut-preview truncates manager names to ~5 characters at 360px and the CUT chip overflows its column

- **Severity:** P2
- **Screen+State:** /commish · Playoff cuts · cut preview table (live knockout round)
- **Location:** `apps/web/app/commish/commish.css:984`
- **Observed:** The cut-preview grid is `1fr 52px 52px 92px` on mobile (commish.css:984-987; base :895-902). At a 360px viewport the row's flexible name column computes to ~52px (324 console width − 36 card/row padding − 220 fixed/gaps), and `.adm-adv-row-name` is `overflow:hidden; text-overflow:ellipsis; white-space:nowrap` (:923-929), so real names like "Maximiliano" render as ~5-6 chars + ellipsis. This is the primary 'who is being guillotined' surface the commissioner reviews before the irreversible confirm. The last column (92px) also can't hold the `CUT (your pick)` chip (~15 chars, CommishConsole.tsx:746) without wrapping/overflow. Partly mitigated because the confirm copy spells the full names (advanceConfirmCopy :447), but the on-screen table itself is not legible.
- **Design-reference delta:** n/a
- **Fix theme:** cut-table density
- **Effort:** M
- **Confidence:** verified-static

#### F-P2-G4 · Audit ledger shows only a relative time on screen; the exact timestamp is hover-only (invisible on touch) and in UTC, not league-local

- **Severity:** P2
- **Screen+State:** /commish · Audit log rail (commissioner, long history)
- **Location:** `apps/web/app/commish/CommishConsole.tsx:2109`
- **Observed:** Each audit row renders `whenLabel` (e.g. "2h ago") with the precise time only in `title={entry.createdAtIso}` (CommishConsole.tsx:2109-2111). `title` tooltips do not appear on touch devices, so on a phone the exact time of a governance action is unreachable; and when it is reachable (desktop hover) it is the raw UTC ISO string (commishView.ts:356 `createdAt.toISOString()`), never converted to league-local. The locked time rule requires times to be explicit and league-local. For an append-only accountability ledger (capped at the 50 most recent, loadCommish.ts:40 — no pagination, acceptable), the exact when should be visible without hover and localized. `frozenSince` in the freeze rows (CommishConsole.tsx:209, `frozenAtIso.slice(0,10)`) similarly shows a bare UTC date with no timezone.
- **Design-reference delta:** design/CLAUDE.md §2 (UTC-stored / league-local displayed, always explicit)
- **Fix theme:** time display
- **Effort:** M
- **Confidence:** verified-static

#### F-P2-H1 · One generic danger-toned /auth/denied page conflates "not on the allowlist" with "your link simply expired"

- **Severity:** P2
- **Screen+State:** /auth/denied · reached via any callback failure (missing_code / exchange_failed / not_allowlisted)
- **Location:** `apps/web/app/auth/callback/route.ts:23,27,35`
- **Observed:** `/auth/callback` redirects EVERY failure mode — a missing code, a failed/expired code exchange, and a genuine not-on-allowlist rejection — to the same `/auth/denied` URL (route.ts:23,27,35), and `apps/web/app/auth/denied/page.tsx:14-25` renders one danger-red shield icon with copy hedging both causes ("Your email may not be on the allowlist, or the sign-in link expired"). A routine, benign event (a manager opens their inbox 20 minutes late and the magic link timed out) is presented with the same alarming iconography and "you may not be welcome here" framing as an actual access denial, when the fix is simply to request a new link.
- **Design-reference delta:** design/design_reference/auth/components.jsx:114-137 — the reference has two visually and tonally distinct views: `DeniedView` (tone-danger, shield icon, "ask the commissioner") and `ExpiredView` (tone-warn, clock icon, "links are valid 15 minutes, request a fresh one"). The live app collapses both into one, per an explicit in-code note (denied/page.tsx:18-20) acknowledging this as a deliberate, deferred simplification.
- **Fix theme:** auth-error-copy
- **Effort:** M
- **Confidence:** verified-static

#### F-P2-H2 · No branded "Signing you in…" interstitial during the magic-link code-exchange — the phone shows a blank unbranded page for the whole round trip

- **Severity:** P2
- **Screen+State:** magic-link tap → /auth/callback · mid-exchange (pre-redirect)
- **Location:** `apps/web/app/auth/callback/route.ts:14-43`
- **Observed:** The entire `exchangeCodeForSession` + allowlist Prisma query happens synchronously inside one server `GET` handler before any response is sent (route.ts:14-43); there is no intermediate client-rendered page. On a cold-started server or slow mobile connection, the manager's browser shows a blank, unbranded loading state for the full duration of that round trip with zero visual feedback, then jumps straight to the final destination.
- **Design-reference delta:** design/design_reference/auth/components.jsx:92-100 `VerifyingView` (spinner + "Signing you in… Verifying your secure link") — not implemented anywhere in the live redirect chain.
- **Fix theme:** auth-loading-state
- **Effort:** M
- **Confidence:** needs-live-verify

#### F-P2-H3 · Auth-route buttons render at 40px (compact) instead of the reference's locked 44px "comfortable" density

- **Severity:** P2
- **Screen+State:** /sign-in sent (check-email) + /auth/denied · idle
- **Location:** `apps/web/app/sign-in/page.tsx:71-77`
- **Observed:** `.btn` defaults to `min-height: 40px` (ds.css:198); `[data-density="comfortable"] .btn { min-height: 44px; }` only applies where an ancestor sets `data-density="comfortable"`. Neither `/sign-in` nor `/auth/denied` (nor `AuthChrome.tsx`) ever sets that attribute, so "Use a different email" (sign-in/page.tsx:71-77, plain `.btn.btn-ghost.btn-block`) and `/auth/denied`'s only CTA, "Back to sign in" (apps/web/app/auth/denied/page.tsx:27-29, plain `.btn.btn-primary.btn-block`), both render ~4px under the 44px tap-target guideline — inconsistent with `/settings`, which explicitly sets `data-density="comfortable"` (apps/web/app/settings/layout.tsx:13) and gets 44px throughout.
- **Design-reference delta:** design/design_reference/auth/app.jsx:35 — the prototype's `App()` effect unconditionally does `el.setAttribute('data-density', 'comfortable')` for every auth view; the live routes never apply this attribute anywhere in their tree.
- **Fix theme:** tap-targets
- **Effort:** S
- **Confidence:** verified-static

#### F-P2-H4 · Caption text (`--text-tertiary` on `--surface-1`) computes to roughly 4.0:1 contrast, under the 4.5:1 AA threshold for normal body text

- **Severity:** P2
- **Screen+State:** /sign-in idle + /auth/denied idle · fine-print / footer captions
- **Location:** `apps/web/app/_auth/auth.css:148-153`
- **Observed:** `.au-foot` (auth.css:148-153) and `.au-fineprint` (auth.css:274-279) both set `color: var(--text-tertiary)` on the `.au-card`/`.au-formcol` surface, which resolves to `--surface-1` (`#11151C`, ds.css:50). `--text-tertiary` is `#6C7689` (ds.css:60). A manual sRGB contrast calculation puts this pairing at roughly 4.0:1, below the 4.5:1 WCAG AA minimum for normal-weight 12px text — affecting the sign-up disclaimer, the "Trouble signing in?" footer, and the brand-panel season line.
- **Design-reference delta:** n/a — token pairing is carried unchanged from design/design_reference/ds/ds.css; not a Code-introduced regression.
- **Fix theme:** contrast
- **Effort:** S
- **Confidence:** needs-live-verify

#### F-P2-H5 · No way to see or revoke an already-enabled push subscription from Settings

- **Severity:** P2
- **Screen+State:** /settings notification prefs · returning user who already enabled push on this device
- **Location:** `apps/web/src/notifications/NotificationsClient.tsx:46-92`
- **Observed:** `NotificationsClient` never checks subscription status on mount (`enableStatus` initializes to `null` regardless of whether this device already has a live subscription), and the "Enable browser notifications" button always renders identically whether or not the device is already subscribed. There is no unsubscribe/disable control in the UI at all, even though `handleUnsubscribe`/`removeSubscription` exist server-side (apps/web/src/notifications/handlers.ts:58-70) with a routed endpoint. A manager has no way to confirm from Settings "is push currently on for this phone" or to turn it back off.
- **Design-reference delta:** n/a — the reference `PreferencesPanel` (design/design_reference/notifs/components.jsx:124-142) models per-category channel toggles, not per-device subscription lifecycle; this is a product gap inherent to how the feature was scoped, not a mismatch against a specific reference state.
- **Fix theme:** push-status-visibility
- **Effort:** M
- **Confidence:** verified-static

#### F-P2-H6 · "Enable browser notifications" gives no iOS Home-Screen-install guidance — the likely majority mobile path is a silent dead end

- **Severity:** P2
- **Screen+State:** /settings notification prefs · iOS Safari, PWA not installed to Home Screen
- **Location:** `apps/web/src/notifications/NotificationsClient.tsx:29-44`
- **Observed:** `browserEnv()` (lines 29-44) returns `null` whenever `PushManager` isn't in `window` — which is the case for every iOS Safari tab that hasn't been added to the Home Screen (Apple only exposes the Push API inside an installed standalone PWA). `handleEnable` then shows only "This browser doesn't support push notifications." (line 78-80) with no mention of the actual fix (Share → Add to Home Screen, then retry). For a ~12-manager league that is mostly on phones, this is likely the majority code path, and it offers zero actionable next step.
- **Design-reference delta:** n/a — the reference mocks (notifs/*, settings/*) don't model native browser API constraints; this is a live-implementation-specific gap with no corresponding designed state.
- **Fix theme:** push-ios-guidance
- **Effort:** S
- **Confidence:** verified-static

#### F-P2-H7 · /settings mobile layout diverges from the reference's iOS grouped drill-in pattern — one flat page instead of a navigable list

- **Severity:** P2
- **Screen+State:** /settings · root page (mobile)
- **Location:** `apps/web/app/settings/page.tsx:32-53`
- **Observed:** The live `/settings` renders both built sections ("Public profile", "Notifications") as two always-expanded `.card` blocks stacked in one scroll (page.tsx:32-53) — there is no root list, no profile-summary row, no chevron/back-button drill-in. This is a defensible simplification for only 2 of 6 sections today, but is a structural delta worth tracking as the section count grows.
- **Design-reference delta:** design/design_reference/settings/mobile.jsx:1-56 — canonical mobile pattern is a root grouped-list (profile card + chevron rows) that pushes into a per-section detail view with a back button; nothing in the live implementation matches this navigation model.
- **Fix theme:** settings-IA-delta
- **Effort:** L
- **Confidence:** verified-static

#### F-P2-I1 · Five byte-identical ds.css copies ship (global + _landing + draft + lineup + vsfield) — double-load today, silent fork tomorrow

- **Severity:** P2
- **Screen+State:** css-system · all routes (draft/lineup/vsfield/landing double-load their copy on top of the global)
- **Location:** `apps/web/app/lineup/ds.css:1`
- **Observed:** apps/web/app/styles/ds.css, app/_landing/ds.css, app/draft/ds.css, app/lineup/ds.css, app/vsfield/ds.css are 443-line byte-identical copies (verified by full read of all five). Each is imported by its route layout (e.g. lineup/layout.tsx:8) in addition to the global import (app/layout.tsx:8), so those routes ship and parse the DS twice (~14KB raw each, 5 chunks in the client bundle) and every copy re-declares the Google Fonts @import. layout.tsx:4-7 explicitly defers de-duping. Identity holds today, but any future token edit to one copy silently forks the system with zero build-time signal — the exact drift class this audit was asked to quantify (drift measured: currently 0 bytes). The global copy is the de-facto source of truth (loads first, others re-assert identical rules).
- **Design-reference delta:** design/design_reference/ds/ds.css is declared 'single source of truth · linked by every screen' — the 5-copy vendoring inverts that contract.
- **Fix theme:** ds-copies de-dup
- **Effort:** S
- **Confidence:** verified-static

#### F-P2-I2 · Fonts load via render-blocking Google @import (15 weight files, no preconnect, no next/font) — slow first paint + FOUT/CLS on phone networks

- **Severity:** P2
- **Screen+State:** css-system · cold load on cellular, all routes
- **Location:** `apps/web/app/styles/ds.css:10`
- **Observed:** @import url(fonts.googleapis.com/css2?...Schibsted(6 weights)+Hanken(5)+JetBrainsMono(4)&display=swap) sits at the top of the bundled global CSS (and is repeated in all 4 route ds copies). Chain: HTML → app CSS → Google CSS → woff2 files, with no <link rel=preconnect> to fonts.gstatic.com and no next/font usage anywhere (grep: zero matches for next/font|preconnect|.woff). On 4G that is 2+ extra serialized RTTs before brand type paints; display=swap means system-ui renders first then swaps to Schibsted/Hanken with no size-adjust fallback metrics → visible reflow on score heroes (.t-display-*, .po-headline 30px, .v2-bp-score 46px). next/font/google would self-host, subset, preload, and generate adjusted fallbacks in one move.
- **Design-reference delta:** design/design_reference/ds/ds.css:10 uses the same @import — correct for a static prototype, wrong loading strategy for the production app (production divergence here is expected, its absence is the finding).
- **Fix theme:** font loading
- **Effort:** M
- **Confidence:** verified-static
- **Merged instances** (independently reported, folded into this finding):
  - [A · was P2] Brand fonts load via render-blocking Google-Fonts CSS @import with no preconnect (FOUT/CLS) — `apps/web/app/styles/ds.css:10`. The three brand families (Schibsted Grotesk, Hanken Grotesk, JetBrains Mono) are pulled with `@import url('https://fonts.googleapis.com/css2?...&display=swap')` at the top of the GLOBAL ds.css imported in layout.tsx. A CSS @import of a remote stylesheet is invisible to the browser's preload scanner: the font CSS is only discovered after ds.css downloads and parses, then fonts.gstatic.com must be r

#### F-P2-I3 · Breakpoint zoo: 22 distinct max-width values across 16 sheets, no shared scale; nav swaps at 639 while routes swap at 760/767/768/820/960

- **Severity:** P2
- **Screen+State:** css-system · breakpoints, 360-430px phones plus 640-768px overlap zone
- **Location:** `apps/web/app/shell/shell.css:300`
- **Observed:** Full @media inventory: 360, 480, 520, 560, 600, 620, 639, 640, 720, 760, 767, 768, 820, 860, 880, 900, 940, 960, 980, 1040, 1080, 1100 — every screen invented its own set (shell 639; vsfield 760; commish 760; playoffs 767; waivers 768; lineup 820/480/360; draft 960; scoring 720/1080/600; standings 720/480; dashboard 900/600; games 720/560; pool 560/480; landing 8 values). Consequences at real widths: 640-759px devices (foldables, iPad mini split view) get the DESKTOP top-strip nav with vsfield/playoffs still in desktop cockpit — coherent by luck, not design; 481-639px gets bottom-nav + lineup's FULL-SIZE 78px tokens (compact fit only ≤480). Nothing breaks outright at 360/390/430 (all route mobile queries ≥480 cover them), so this is consistency debt: any new screen must guess a width, and the 639/760/767/768 near-misses are four different answers to the same question.
- **Design-reference delta:** n/a — the reference used a fit-scaled presenter stage instead of media queries, so no breakpoint system existed to port.
- **Fix theme:** breakpoint tokens
- **Effort:** M
- **Confidence:** verified-static

#### F-P2-I4 · Micro-size tertiary/elim text fails WCAG AA: --text-tertiary ≈3.2-4.0:1 on raised surfaces, --elim on elim-soft ≈3.3:1, at 8-11px sizes

- **Severity:** P2
- **Screen+State:** css-system · contrast (labels/captions on every screen; elim pills on /playoffs /standings /waivers during live guillotine)
- **Location:** `apps/web/app/styles/ds.css:60`
- **Observed:** Computed from the actual hexes: --text-tertiary #6C7689 vs --surface-1 #11151C = 4.00:1, vs --surface-2 #181D27 = 3.69:1, vs --surface-3 #212834 = 3.24:1 — all below the 4.5:1 requirement for small text, and this token is used at MICRO sizes: .t-label 11px (ds.css:179), .pc-tile span 9.5px (ds.css:409), .po-rn-tag 8px (playoffs.css:703), .gd-stake-tlab 8px (games.css:260), .st-fc-lab 8px (standings.css:283). --elim #B05563 over its elim-soft composite ≈3.3:1 at .po-victim-name 9.5px (playoffs.css:997-1002), .pill-elim 11px (ds.css:266), .st-cutline-label 11px (standings.css:374-380) — the guillotine cut-line labeling, a core mechanic signal, is the weakest text on the board. Passing pairs for reference: text-secondary/surface-0 9.9:1, --ytp on soft 5.3:1, --accent on soft 4.6:1, --live on soft 4.7:1, --locked on soft ≈4.5:1 (borderline). Fix: lighten --text-tertiary toward #7E889B and give elim labels a lighter text variant (#C4707F-class) or larger size.
- **Design-reference delta:** Token values match design/design_reference/ds/ds.css:60,78 exactly — the contrast debt is inherited from the reference, but §3's color+icon+word rule assumes the word itself is readable.
- **Fix theme:** contrast tokens
- **Effort:** S
- **Confidence:** verified-static

#### F-P2-I5 · Sub-44px tap targets are systemic in the DS: 28px modal close buttons, 28px chips, 30px icon buttons; the home dashboard route never gets the 'comfortable' density boost

- **Severity:** P2
- **Screen+State:** css-system · player-card/score modals on all routes, NationFilter chips on /waivers /lineup /draft, / (hub) rows
- **Location:** `apps/web/app/styles/ds.css:432`
- **Observed:** .pc-x close is 28×28 (ds.css:432); .sl-sm-close 28×28 (lineup.css:707-718, PlayerScoreSheet.css:37-48); .pl-modal-close 30×30 (pool.css:388-398); .wv-icon-btn 30×30 for edit/cancel-claim (waivers.css:278-288); .chip is height:28px and is the interactive NationFilter unit (ds.css:369, nf-grid waivers.css:1107); .pc-seg-btn ≈30px tall (ds.css:400); .wv-tab/.pl-tab ≈32px. The [data-density="comfortable"] escape hatch only lifts .btn/.input/.dtable/.pcard to 44px (ds.css:377-382) and is applied via per-route wrapper attrs — but app/page.tsx (the signed-in dashboard hub) sets NO density attr (grep confirms only layouts + _landing/chrome.tsx set it), so even .btn stays 40px there, and /draft pins compact (draft/layout.tsx:16). Close buttons on the sheets managers open mid-match (player score cards) are the worst offenders: 28px targets beside a 92vw-wide sheet edge.
- **Design-reference delta:** design/design_reference/ds/ds.css:351-357 defines the same comfortable-density remedy; the delta is production applying it inconsistently (missing on the hub) and never extending it to the modal-chrome controls added post-reference (.pc-x is production-only).
- **Fix theme:** tap-targets
- **Effort:** S
- **Confidence:** verified-static
- **Merged instances** (independently reported, folded into this finding):
  - [B · was P2] Multiple interactive controls in Dashboard/Standings sit under the 44px touch-target floor — `apps/web/app/standings/StandingsClient.tsx:108-136; apps/web/app/standings/components.tsx:374-389; apps/web/app/_dashboard/dashboard.css:326-360,420-470`. The global `.tab` rule (`padding: 7px 14px`, `--fs-sm` 13px/18px line-height, no min-height) renders at ~32px tall; `[data-density="comfortable"]` (set on the /standings layout, standings/layout.tsx:21) only raises `.btn`/`.input`/`.select`/`.dtable`/`.pcard`/`.vmrow` to 44px — `.tab` is not in that list, so the Matchday/Cumulative/Season switcher (StandingsClient.tsx:108-136) and the per-matchday
  - [C · was P2] Period tabs and formation-picker tabs are ~30px tall — under the 44px touch-target floor — `apps/web/app/lineup/ds.css:239`. Both control clusters use the ds `.tab` class: period tabs (`.sl-period-tabs .tab`, components.tsx:513-535 + lineup.css:36-41) and formation tabs (`.sl-formation-tabs .tab`, components.tsx:648-667). `.tab { padding:7px 14px; font-size:13px }` has no min-height → ~30px effective height. The comfortable-density bumps in ds.css:381-382 apply only to `.btn` and `.input`/`.select`, never `.tab`. On a k
  - [D · was P2] Claim edit/cancel icon buttons are 30x30px — well under the 44x44 minimum tap target — `apps/web/src/waivers/waivers.css:278-296`. `.wv-icon-btn{ width:30px; height:30px; ... }` (lines 281-282) backs the Edit and Cancel controls on every `ClaimRow` (apps/web/src/waivers/components.tsx:463-480). Unlike `.btn`, this bespoke class is not covered by `[data-density="comfortable"] .btn{min-height:44px}` (ds.css:381), so it never gets the density bump every other primary control on this density-comfortable screen receives. Two adjac
  - [D · was P2] Watchlist star and player-card-info controls on FA picker rows are only 34px wide, under the 44px minimum, with just 4px between them — `apps/web/src/waivers/waivers.css:678-712`. `.wv-comp-fa-info{width:34px}` (line 682) and `.wv-comp-fa-star{width:34px}` (line 699) are the two trailing controls on every `FaPickRow` (components.tsx:206-266), stretched to the row's height via `.wv-comp-fa-wrap{align-items:stretch}` but never widened past 34px, with only `gap:4px` between star/info and the main select button. At 360px width the row already crowds five fixed-width elements (K
  - [D · was P2] ReleasePanel and drop-picker player rows render at ~34-41px tall, under the 44px minimum, for a live selection control during the guillotine trim-down — `apps/web/src/waivers/waivers.css:806-817,1173-1184`. `.wv-drop-opt{padding:7px 9px}` (lines 806-817, the drop-to-make-room picker in BidComposer/FreeAgentPanel) and `.wv-rel-row{padding:7px 9px}` (lines 1173-1184, the ReleasePanel's per-player release toggle) both size to their content's natural height (KitChip-sm 20px + ~14px vertical padding ≈ 34px; with a two-line name+meta stack in `.wv-rel-row` closer to ~40-41px) — in both cases under the 44px
  - [E · was P2] Primary chrome controls ("Back", tab buttons) render well under the 44px tap-target minimum — `apps/web/src/games/games.css:20-29 (`.gd-back`), apps/web/src/games/games.css:276-288 (`.gd-tabbtn`)`. `.gd-back{padding:5px 13px; font:...13px/1...}` computes to roughly 23px tall (13px line-height + 10px vertical padding). `.gd-tabbtn{padding:10px 8px; font:...13px/1...}` computes to roughly 33px tall. Neither is overridden in the `@media (max-width:720px)` block, so both stay this size on every phone width. "Back" is the sole on-screen back-navigation affordance for a route with no `/games` inde
  - [F · was P2] Multiple /vsfield mobile navigation controls render under the 44px touch-target minimum — `apps/web/app/vsfield/ds.css:239 (.tab, ~34px tall — used by .vf-viewtabs and .vf-periodtabs) + apps/web/app/vsfield/vsfield.css:1434-1442 (.ma-back, ~21px tall) + apps/web/app/vsfield/vsfield.css:1555-1568 (.ma-sideseg button, ~33px tall) + apps/web/app/vsfield/vsfield.css:658-675 (.vf-bench-tok, ~36px tall)`. `.tab { padding: 7px 14px; font-size: var(--fs-sm)[13px]; ... }` with no explicit line-height (inherits body's 20px) computes to ~34px tall — used for the "This period/Season" VIEW_TABS (VsFieldClient.tsx:169-179) and the T11 prior-matchday selector (VsFieldClient.tsx:190-206), i.e. the two primary controls for choosing what the whole screen shows. `.ma-back { padding: 2px 0; font: 600 14px ...}` 
  - [F · was P2] /pool's secondary tap targets (match-detail link, leaderboard manager-name link) are also undersized — `apps/web/src/pool/pool.css:132-151 (.pl-fx-mid/.pl-fx-view) + apps/web/src/pool/pool.css:320-332 (.pl-mgr-link, padding:0)`. `.pl-fx-view` (the tappable score/kickoff area linking to `/games/<matchId>`) has zero vertical padding, computing to roughly 36px of tappable height per fixture card. `.pl-mgr-link { padding: 0; ...}` (pool.css:324) — the leaderboard's tappable manager name that opens `ManagerPicksModal` — has no padding at all, so its hit area is exactly the text glyph bounds (roughly 16-20px tall depending on t
  - [G · was P2] Multiple primary controls fall below the 44x44px touch minimum (tabs, freeze buttons, repair checklists, view-as options) — `apps/web/app/commish/commish.css:87`. `.adm-tab` (:87) is `padding:9px 14px` over a 14px/1 line = ~32px tall. `.adm-freeze-btn` (:760) is `padding:6px 12px` over 12px text = ~26px tall and is the trigger for the freeze confirm. `.adm-check` rows (:688) have no vertical padding (13px text, 4px grid gap) = ~20px tall targets for releasing players / setting the playoff XI. `.adm-viewas-opt` (:380, `padding:7px 9px`) and the inert `.adm-a

#### F-P2-I6 · No scroll containment anywhere: zero overscroll-behavior, zero body-scroll-lock, zero touch-action across the entire app CSS

- **Severity:** P2
- **Screen+State:** css-system · any open modal/sheet (bid composer, player card, More sheet, pool drill-in) while the page behind is scrollable
- **Location:** `apps/web/src/waivers/waivers.css:624`
- **Observed:** Greps across apps/web return ZERO hits for overscroll-behavior, touch-action, and -webkit-overflow-scrolling, and no JS body-scroll lock exists (no body.style.overflow/classList toggles). Every modal with internal scroll — .pc-sheet overflow-y:auto (ds.css:431), .wv-comp-list (waivers.css:620-627), .wv-comp-config (waivers.css:751-757), .pl-modal-list (pool.css:407-412), .sl-scoremodal (lineup.css:695-706) — will scroll-chain on iOS: when the inner list hits its end (or the touch starts on a non-scrollable part of the sheet), the gesture scrolls the page BEHIND the scrim, so the modal visually detaches from its background state; rubber-banding the sheet also triggers pull-to-refresh in standalone/PWA contexts. The MoreSheet (shell.css:230-243) has the same gap. Fix: overscroll-behavior:contain on every internal scroller + a body lock while any scrim is open.
- **Design-reference delta:** n/a — the reference prototypes ran in fixed-height presenter frames where chaining could not occur.
- **Fix theme:** scroll containment
- **Effort:** S
- **Confidence:** verified-static
- **Merged instances** (independently reported, folded into this finding):
  - [A · was P3] MoreSheet has no body-scroll lock, no overscroll containment, and no max-height/internal scroll — `apps/web/app/shell/shell.css:230`. .sh-more-sheet (230-243) sets no max-height and no overflow, and the sheet/backdrop have no `overscroll-behavior: contain`; MoreSheet.tsx never locks document scroll while open. A scroll-drag over the scrim chains to the page behind it (and can trigger pull-to-refresh). In portrait with 6-7 items + footer the sheet fits, but on a short viewport (landscape phone ~375px tall, or with the commissione
  - [C · was P2] Score/forfeit modals lack body-scroll lock + overscroll containment; score-modal close target is 28px — `apps/web/app/lineup/lineup.css:695`. Both overlays reuse `.sl-forfeit-overlay` (position:fixed; inset:0, lineup.css:631-640) with no body-scroll lock (no effect toggling body overflow) and no overscroll-behavior:contain. `.sl-scoremodal` is max-height:85vh; overflow-y:auto (lineup.css:695-706) — on iOS reaching the modal's scroll end chains to the page behind, and 85vh (not dvh) can exceed the visible area when the URL bar is shown. 
  - [D · was P2] No `overscroll-behavior` anywhere in the app and no body-scroll lock on any modal/sheet — scroll-chaining risk in the composer's nested lists — `apps/web/src/waivers/waivers.css:620-627,799-805`. `.wv-comp-list{overflow-y:auto; min-height:240px; max-height:420px}` (lines 620-627, the free-agent list) and `.wv-drop-pick{max-height:220px; overflow-y:auto}` (lines 799-805, the drop picker) are nested scrollable regions inside the fixed-position `.wv-scrim` modal, but neither they nor any ancestor sets `overscroll-behavior: contain`, and a repo-wide grep found zero occurrences of `overscroll-b
  - [F · was P2] No body-scroll lock / overscroll-behavior on the shared modal overlays — background can scroll-chain on iOS — `apps/web/components/PlayerScoreSheet.css:13-22 (.sl-forfeit-overlay) + apps/web/components/PlayerScoreSheet.tsx (no body-scroll-lock effect) + apps/web/src/pool/pool.css:358-375 (.pl-modal-overlay) + apps/web/src/pool/PoolClient.tsx (Escape-key handler exists, no scroll lock)`. Repo-wide grep for `document.body.style`, `overscroll-behavior`, and scroll-lock patterns returns zero matches. Both overlays are `position:fixed;inset:0` scrims with an internally-scrolling child, but neither the mount effect in PlayerScoreSheet.tsx nor PoolClient's ManagerPicksModal open effect sets `document.body.style.overflow = 'hidden'` (or any equivalent), and neither `.sl-forfeit-overlay`/
  - [GAP:playerscoresheet-cross-surface-consistency · was P2] No body-scroll lock or overscroll-behavior:contain on any sheet — scroll chaining / pull-to-refresh mid-match — `apps/web/components/PlayerScoreSheet.css:13`. `.sl-forfeit-overlay`/`.sl-scoremodal` (PlayerScoreSheet.css:13-36 / lineup.css:631-706) and `.pc-scrim`/`.pc-sheet` (ds.css:430-431) set neither `overscroll-behavior: contain` nor any body scroll-lock, and no call site adds an overflow:hidden class to the body on open (verified in SetLineupClient.tsx:461-468, VsFieldClient.tsx:320-326, GameDetailClient.tsx:1263-1269, FaPlayerCardSheet.tsx:45-53).

#### F-P2-I7 · Modal heights use legacy vh (85/88/90vh) and fixed overlays skip safe-area insets — bottom clipping when the iOS URL bar is visible

- **Severity:** P2
- **Screen+State:** /waivers composer (90vh) · player card (88vh) · score sheet (85vh) · /pool modal (80vh) · iOS Safari with collapsed-then-expanded toolbar; landscape notch
- **Location:** `apps/web/app/styles/ds.css:431`
- **Observed:** pc-sheet max-height:88vh (ds.css:431), wv-composer 90vh (waivers.css:543), sl-scoremodal 85vh (lineup.css:698, PlayerScoreSheet.css:28), pl-modal min(80vh,720px) (pool.css:369). On iOS, vh resolves to the LARGE viewport (toolbar hidden) while the fixed inset:0 scrims track the dynamic viewport — with the toolbar visible, a 90vh child can exceed its scrim's height; place-items:center then overflows it equally top and bottom, and neither the scrim nor the page scrolls to reach the clipped edges (only the sheet's own inner scroll survives; the composer's header/close X could sit above the visible top). None of the fixed overlays (pc-scrim padding 22px, wv-scrim 20px, sl-forfeit-overlay 16px) add env(safe-area-inset-bottom), and nothing app-wide handles safe-area-inset-left/right despite viewport-fit=cover (layout.tsx:41) extending content under the notch in landscape. Fix: swap modal caps to dvh/svh (e.g. max-height: calc(100dvh - 32px)) and add env() padding to the scrims. The shell bottom bar handles env() correctly (shell.css:181,240,311) — it is the only surface that does.
- **Design-reference delta:** n/a — presenter-frame prototypes never met a dynamic toolbar.
- **Fix theme:** safe-area / dvh
- **Effort:** S
- **Confidence:** needs-live-verify
- **Merged instances** (independently reported, folded into this finding):
  - [C · was P3] Empty 'no lineup' state uses 60vh instead of dvh — `apps/web/app/lineup/page.tsx:22`. The empty-state wrapper is minHeight:'60vh' (page.tsx:22). It is a designed card (.card, .t-h2, secondary copy — not a blank screen, good), but vh ignores the iOS URL-bar collapse so the vertical centering shifts slightly as the bar shows/hides. Trivial polish only.
  - [D · was P2] Bid composer modal sizes itself with `max-height: 90vh`, not `90dvh`/`90svh` — subject to iOS URL-bar collapse mis-sizing — `apps/web/src/waivers/waivers.css:540-551`. `.wv-composer{ ... max-height: 90vh; ... overflow: hidden; }` (line 543) combined with `.wv-scrim{position:fixed; inset:0; ...}` (lines 531-539). On iOS Safari, `vh` is computed off the layout viewport, which changes as the URL/toolbar chrome shows or hides; `90vh` measured while the chrome is collapsed (larger viewport) can leave the modal sized too tall once the chrome reappears (e.g. after a sc
  - [F · was P2] Shared sheets size themselves with `vh` instead of `dvh`, risking iOS Safari URL-bar mismatch — `apps/web/components/PlayerScoreSheet.css:28 (.sl-scoremodal max-height:85vh) + apps/web/app/vsfield/ds.css:431 (.pc-sheet max-height:88vh)`. `.sl-scoremodal { max-height: 85vh; }` and `.pc-sheet { ...max-height: 88vh; }` use the legacy `vh` unit rather than `dvh`/`svh`. On iOS Safari, `vh` resolves against the LARGE viewport (as if the address bar/toolbar were collapsed), which can be taller than the currently-visible viewport on a fresh load or mid-scroll-up. A sheet capped at 85-88vh of the large viewport can therefore render taller 

#### F-P2-J1 · Supabase Realtime channel (+ presence track) subscribes unconditionally on every /draft mount, even for a permanently-complete draft

- **Severity:** P2
- **Screen+State:** /draft post-draft as manager
- **Location:** `apps/web/app/draft/DraftRoomClient.tsx:108-205`
- **Observed:** The Realtime-subscribe `useEffect` depends only on `[draftId, sessionManagerId]` (line 205) — it never checks `state.status`. Every visit to /draft (now reachable only via the shell's 'More' sheet, per apps/web/src/shell/crossNav.ts:82) opens a `draft-room:<id>` channel, tracks presence, and keeps the socket open for as long as the tab stays foregrounded, even though the draft will never change again. Contrast the §5 polling backstop (apps/web/src/draft/resilience.ts:76-93), which self-cancels its `setInterval` the first time it observes `status === "complete"` — the Realtime channel has no equivalent teardown.
- **Design-reference delta:** n/a — resource-lifecycle issue, not a visual/design divergence.
- **Fix theme:** battery/network hygiene
- **Effort:** M
- **Confidence:** verified-static

#### F-P2-J2 · Commissioner draft controls use the undefined CSS class `.btn-secondary`, rendering as unstyled browser-default buttons

- **Severity:** P2
- **Screen+State:** /draft post-draft as commissioner
- **Location:** `apps/web/app/draft/DraftRoomClient.tsx:374,539,601`
- **Observed:** The 'Enable/Disable clock', 'Force pick', and 'Set clock' buttons all use `className="btn-secondary btn-sm"` — no base `.btn` class, and `.btn-secondary` is not defined anywhere in the repo (repo-wide search for the string found only these three usages; ds.css defines `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-quiet`, `.btn-danger`, `.btn-sm/-lg/-block` but never `.btn-secondary`). These controls fall back to unstyled native `<button>` chrome, breaking the dark/cobalt design system. The 'Set clock' instance is the one still reachable today (see the ClockEditor finding above), so this visual break is live on the completed-draft screen right now.
- **Design-reference delta:** n/a — token/class drift, not a design_reference divergence (the reference doesn't define `.btn-secondary` either).
- **Fix theme:** token drift / component consistency
- **Effort:** S
- **Confidence:** verified-static

#### F-P2-J3 · Draft-board column header manager name has no truncation safety net — risks bleeding into neighboring columns for long real names

- **Severity:** P2
- **Screen+State:** /draft post-draft as manager
- **Location:** `apps/web/app/draft/components.tsx:236-239`
- **Observed:** `<span className="t-micro" style={{fontWeight:700, whiteSpace:"nowrap"}}>{m.isMe ? "You" : m.displayName}</span>` inside `.dr-colhead` (apps/web/app/draft/draft.css:150-162), a grid column sized `minmax(108px,1fr)` (components.tsx:223). `.dr-colhead` sets no `overflow:hidden`/`max-width`, and the name span itself has no `text-overflow:ellipsis` (unlike `.dr-cell .cell-name`, which does get ellipsis handling, components.tsx:276-279 / draft.css:187-194). A long real display name (the league's own roster includes names like 'Maximiliano') combined with `white-space:nowrap` can exceed the ~108-110px column and visually spill over the adjacent header cell at 360-430px. Only surfaces when a manager taps into the 'Board' mobile tab.
- **Design-reference delta:** n/a — CSS omission, not a design_reference divergence.
- **Fix theme:** text truncation / overflow
- **Effort:** S
- **Confidence:** needs-live-verify

#### F-P2-K1 · Mobile per-row status is icon-only, and zone vs eliminated tags are color-identical

- **Severity:** P2
- **Screen+State:** /playoffs mobile · live round table + settled round
- **Location:** `apps/web/app/playoffs/components.tsx:543-555`
- **Observed:** Each manager row's status is a bare icon in a 24px chip — <span className="mpo-tag is-elim"><IcoSkull/></span> etc. (:543-555) — with no word, unlike the desktop statusPill which reads "Surviving / Facing the cut / Eliminated." Worse, .mpo-tag.is-zone and .mpo-tag.is-elim are byte-identical (both color: var(--elim); background: var(--elim-soft), playoffs.css:1579-1586), so "facing the cut" and "eliminated" tags are the same red square distinguished only by an 11px blade-vs-skull glyph. Violates the locked "functional state = color + icon + word" rule for the per-row surface. Row-level treatment partly compensates (eliminated rows dim to 0.6 + strike the name; zone rows get an elim-soft background), but the status chip itself is ambiguous at a 3-second glance during a live match.
- **Design-reference delta:** design/CLAUDE.md §3 (color+icon+word). Note the reference playoffs/mobile.jsx:16-18 is also icon-only, so this is reference-consistent but still a rule violation.
- **Fix theme:** guillotine state legibility
- **Effort:** S
- **Confidence:** verified-static

#### F-P2-K2 · Sub-44px tap targets: Board/Ladder toggle and mobile round-nav

- **Severity:** P2
- **Screen+State:** /playoffs mobile · all states (layout toggle + round navigation)
- **Location:** `apps/web/app/playoffs/playoffs.css:1475-1485`
- **Observed:** The Board/Ladder toggle uses ds .tab (padding:7px 14px, no min-height; ds.css:239) computing to ~30px tall; the [data-density="comfortable"] bump at ds.css:381 covers only .btn/.input/.select, not .tab. The mobile round-nav buttons .mpo-rn (padding:7px 0; font-size:13px; no min-height) are likewise ~30px tall. Both are primary interactive controls (switch layout; inspect a specific round) yet fall well below the 44px iOS touch minimum, and the round-nav buttons sit close together in a flex row so mis-taps are likely.
- **Design-reference delta:** n/a (mobile checklist tap-target floor)
- **Fix theme:** tap-targets
- **Effort:** S
- **Confidence:** verified-static

#### F-P2-K3 · No stale-feed detection; backgrounded/dead socket shows frozen points as "Live"

- **Severity:** P2
- **Screen+State:** /playoffs mobile · live round after tab backgrounding or a silent socket drop
- **Location:** `apps/web/app/playoffs/PlayoffsClient.tsx:136-143`
- **Observed:** onStatus maps channel status only to "live" | "reconnecting" | "loading" (:136-143) — it never produces "stale", so the ConnPill "Delayed" branch (components.tsx:135-140) and .po-banner-stale (playoffs.css:158-162) are dead code. The poll is visibility-gated with no immediate tick on re-show (liveController.ts:68-70), and there is no visibilitychange→refetch listener in PlayoffsClient. On iOS Safari, backgrounding a tab commonly suspends/kills the WebSocket without firing CHANNEL_ERROR; on return the pill can still read "Live" while points are frozen, and the board only self-corrects on the next visible poll tick (up to 20s later) — or never, if the socket is silently dead but the poll's /api/playoffs is what's failing. A failed refetch is also swallowed silently (liveController.ts:54-56 keeps prior state, no error surface).
- **Design-reference delta:** Reference playoffs/mobile.jsx:80-81 renders both a reconnecting and a "Delayed feed · points may be behind" stale banner; the shipped screen wires only reconnecting.
- **Fix theme:** live-feed trust
- **Effort:** M
- **Confidence:** needs-live-verify

#### F-P2-K4 · Reduced-lineup and lock-on-play mechanic surface is desktop-only on /playoffs

- **Severity:** P2
- **Screen+State:** /playoffs mobile · all states
- **Location:** `apps/web/app/playoffs/components.tsx:1087-1213`
- **Observed:** Desktop renders PLAYOFF_EXPLAINER/.po-explain (:989-996, :1016-1031) and the Rail/MyReducedPitch/ShapeChip (:1041, :1073); MobilePlayoffs (:1087-1213) renders none of them. On mobile the screen shows the hero, the "You" band, the round board, and the Reinforce (FAAB) module — but no reduced-lineup pitch, no "7+2 · 1 GK · 6 out" shape chip, no lock-on-play movable/locked strip, no "Set lineup" CTA, and no explainer. Two of the mechanics flagged P1-if-illegible (playoff reduced lineup 7+2; lock-on-play) have zero presence on the mobile guillotine surface; FAAB is the only mechanic explained on mobile (via the Reinforce copy, which is correct). A phone user cannot see their reduced XI or reach lineup-setting from this screen. Reference mobile also omitted the pitch, so this is reference-consistent — but a desktop/mobile parity + legibility gap on the centerpiece.
- **Design-reference delta:** Parity gap vs the shipped desktop .po-explain + rail; reference-consistent with playoffs/mobile.jsx.
- **Fix theme:** mechanic legibility on mobile
- **Effort:** M
- **Confidence:** verified-static

#### F-P2-NF1 · 48 nation chips render at 28px height with 6px gaps — sub-44px, dense mis-tap grid at 360px

- **Severity:** P2
- **Screen+State:** /waivers · BidComposer modal + FreeAgentPanel · NationFilter expanded
- **Location:** `apps/web/components/NationFilter.tsx:67`
- **Observed:** Each nation chip is the global .chip token: height:28px, padding:0 10px, font-size:13px (ds.css:369). .nf-grid lays them out flex-wrap with gap:6px (waivers.css:1107). At 360px inside the composer's padded pick column, a chip = flag(20px)+gap+name (e.g. 'Netherlands','Saudi Arabia' ≈ 95-115px) → only ~3 chips per row, ~16 rows for 48 nations. 28px-tall targets separated by 6px verticals mean adjacent-chip mis-taps when scrolling/selecting; the 13px label is also slightly under the 14-15px body floor. Same chips are used in the inline FreeAgentPanel where there is no modal chrome, so identical geometry.
- **Design-reference delta:** n/a
- **Fix theme:** tap-targets
- **Effort:** S
- **Confidence:** verified-static
- **Merged instances** (independently reported, folded into this finding):
  - [GAP:nationfilter-thin-and-census-mismatch · was P2] Nation-filter expand toggle is a ~18px tap target — the sole entry to the 48-nation filter — `apps/web/components/NationFilter.tsx:37`. .nf-toggle (waivers.css:1089) is font-size var(--fs-caption)=12px with padding 2px 6px and border:none — computed height ≈ 16-20px, width ≈ 60px for the 'Nations ▸' label. It is the ONLY control that reveals the collapsed filter, and at 360-390px a ~18px-tall target is well below the 44px effective minimum; a thumb reaching for it will frequently miss or hit the adjacent 'Watched' chip (the .wv-co
  - [GAP:nationfilter-thin-and-census-mismatch · was P2] Collapsed-state clear control is a 14×14px non-focusable span — near-untappable and keyboard-dead — `apps/web/components/NationFilter.tsx:44`. .nf-clear (waivers.css:1115) is width:14px height:14px font-size:10px rendering a ✕. When a nation is applied and the grid is collapsed, this ✕ is the only visible way to clear the filter (the 'All' chip only exists while the grid is open, NationFilter.tsx:60-65). A 14px target is far below 44px and effectively unhittable with a thumb at 360px. It is also a <span role="button"> with an onClick but
  - [GAP:nationfilter-thin-and-census-mismatch · was P2] Expanded 168px nation grid nested in a 90vh overflow:hidden modal — scroll-chain / pushes FA list off-screen — `apps/web/src/waivers/waivers.css:1107`. .nf-grid is max-height:168px; overflow-y:auto with NO overscroll-behavior:contain. It sits inside .wv-comp-pick (no overflow scroll of its own) above .wv-comp-list (min-height:240px, max 420px, waivers.css:620), all inside .wv-comp-body which on mobile is a single-column grid (waivers.css:1060) within .wv-composer (max-height:90vh; overflow:hidden, waivers.css:540). Opening the grid injects a 168p

#### F-P2-PSC1 · Close ✕ (and the Points|Stats tab strip) scroll out of reach on a dense breakdown — shared across all four sheets

- **Severity:** P2
- **Screen+State:** /lineup · /vsfield · /games played player with a long Points breakdown; /waivers Stats tab with a full game log
- **Location:** `apps/web/components/PlayerScoreSheet.css:37`
- **Observed:** `.sl-sm-close` is position:absolute; top:12px inside `.sl-scoremodal` (position:relative; overflow-y:auto; max-height:85vh — PlayerScoreSheet.css:25-48, mirrored lineup.css:695-718), and `.pc-x` is position:absolute inside `.pc-sheet` (overflow-y:auto; max-height:88vh — ds.css:431-432). Because an absolutely-positioned child of a scroll container scrolls WITH the content (its containing block is the scrollable padding box, not a fixed viewport), on a played player with many scored lines + context stats + season total + the forfeit section the ✕ scrolls off the top; the in-flow `.pc-seg` tab strip (PlayerScoreSheet.tsx:110-129) also scrolls away, so switching Points↔Stats needs a scroll-up too. The only close fallback is the scrim onClick (PlayerScoreSheet.tsx:93 / FaPlayerCardSheet.tsx:48), but at 360px the modal is width:100% minus ~16px padding (max-width 400px / 392px), leaving only ~14-16px of tappable scrim per side. Compounding: both close buttons are 28×28px (PlayerScoreSheet.css:37-48 / ds.css:432) — below the 44×44 min touch target. Another auditor (F) already observed the X scrolling away on `.pc-sheet`; this confirms the identical defect on the shared PlayerScoreSheet.
- **Design-reference delta:** n/a
- **Fix theme:** sheet chrome / tap-targets
- **Effort:** M
- **Confidence:** verified-static
- **Merged instances** (independently reported, folded into this finding):
  - [F · was P2] Shared PlayerScoreSheet's close (X) button scrolls out of reach on a long score breakdown — `apps/web/components/PlayerScoreSheet.css:25-48 (.sl-scoremodal max-height:85vh + overflow-y:auto; .sl-sm-close position:absolute inside it)`. `.sl-scoremodal { max-height: 85vh; overflow-y: auto; ...position: relative; }` is the ONLY scroll container — the header (name/points/close button) is inline content INSIDE it, not a separate sticky/fixed region. `.sl-sm-close { position: absolute; top: 12px; right: 12px; ... }` is positioned relative to `.sl-scoremodal`'s own padding box, so as the user scrolls the sheet's content (plausible on 

#### F-P2-PSC2 · Shared PlayerScoreSheet drops the player-identity header on the Stats tab; waivers + the canonical card keep it

- **Severity:** P2
- **Screen+State:** /lineup · /vsfield · /games · Stats tab of the PlayerScoreSheet modal
- **Location:** `apps/web/components/PlayerScoreSheet.tsx:131`
- **Observed:** In PlayerScoreSheet the header (`.sl-sm-head` pos badge · flag · name · period total) lives INSIDE `BreakdownBody` (PlayerScoreSheet.tsx:154-162), which renders only in the Points branch (line 135). The Stats branch (lines 138-140) renders `<PlayerStatsTab/>` alone — tiles + game log with NO name/pos/flag. So on lineup/vsfield/games, switching a specific player's card to Stats strips his identity from the top: the user sees only the ✕, the Points|Stats strip, and a wall of tiles/stats with nothing confirming WHO they opened. FaPlayerCardSheet renders `.pc-head` (pos · flag · shortName · season hero · star) OUTSIDE the tab conditional (FaPlayerCardSheet.tsx:59-84), so the waivers card keeps the header on both tabs. This also diverges from the canonical shared card, whose PlayerCard renders `.pc-head` outside the tab switch (persistent across Points/Stats).
- **Design-reference delta:** design/design_reference/screens_2026-06-13/playercard/playercard.jsx:165 (PlayerCard renders .pc-head before PcTabs, persistent across both tabs)
- **Fix theme:** sheet header parity
- **Effort:** S
- **Confidence:** verified-static

#### F-P2-PSC3 · The three trigger chips share no positive/negative/zero color language (lock-state vs play-state vs sign/ownership)

- **Severity:** P2
- **Screen+State:** /lineup ScorePill vs /vsfield jersey chip vs /games Fpts chip — same player, same points, same period
- **Location:** `apps/web/app/lineup/components.tsx:216`
- **Observed:** lineup ScorePill colors by LOCK STATE: `--locked` slate default, `--live` red when isLive (lineup.css:661-685); renders just `<b>{points}</b>` — no sign prefix, no unit, no is-zero. vsfield chip colors by PLAY STATE: one dark pill for BOTH s-live and s-played, `is-zero` only softens opacity (vsfield.css:565-583); renders `<b>{points}</b>` + 'pts', live dot only while playing (components.tsx:361-376). games Fpts colors by SIGN + OWNERSHIP + NOTABILITY: is-neg→`--loss`, is-muted→tertiary, default→`--accent`, is-pop→(no override) (games.css:344-375); renders an explicit `{v>=0?'+':''}{v}` sign + 'fpt(s)' (GameDetailClient.tsx:159-169). Net: a −2 reads slate on lineup, dark '−2 pts' on vsfield, red '−2 fpts' on games; a positive shows unsigned on lineup/vsfield but '+N' on games; a genuine 0 is green-family on games/lineup but opacity-dimmed on vsfield. Rounding is at least consistent (raw integers, no decimals, everywhere). Sub-issue: games `.gd-fpts.is-pop` has NO color rule, so a real return (G/A) for ANY owner falls through to `--accent` cobalt — accent marking a functional 'notable' state rather than only YOU.
- **Design-reference delta:** design/CLAUDE.md §3 (accent COBALT marks only YOU + primary actions, never a functional state) — games is-pop return chip falls through to --accent for any owner
- **Fix theme:** score-pill color parity
- **Effort:** M
- **Confidence:** verified-static

#### F-P2-PER1 · Knockout-round label vocabulary diverges across surfaces: /pool says "Quarter-finals" while /lineup, /vsfield, /waivers say "QF"

- **Severity:** P2
- **Screen+State:** /pool · knockout phase vs /lineup·/vsfield·/waivers · any knockout round
- **Location:** `apps/web/src/pool/PoolClient.tsx:59-69`
- **Observed:** /pool maps the canonical period labels through ROUND_TITLES {R32:'Round of 32', R16:'Round of 16', QF:'Quarter-finals', SF:'Semi-finals', Final:'Final', '3P':'3rd Place'} and renders roundTitle(round.label) in bracket headers (PoolClient.tsx:69, used at :259). Every other period surface renders the raw terse period.label instead: /lineup PeriodTabs prints {p.label} (apps/web/app/lineup/components.tsx:526), /vsfield .vf-periodtabs prints {p.label} (apps/web/app/vsfield/VsFieldClient.tsx:201), and /waivers prints period.label verbatim in the BatchBar sub (apps/web/src/waivers/components.tsx:285) and the batch-results matchdayLabel header (apps/web/src/waivers/components.tsx:569). A manager reading 'Quarter-finals' on the pool bracket then 'QF' on the lineup tab, vsfield strip, and waivers header for the SAME round must map two vocabularies — jarring on a phone where the surfaces are one bottom-nav tap apart. Group matchdays are consistent everywhere ('MD1/2/3'); only knockout rounds split. Fix: hoist one shared roundTitle or standardize on one house style.
- **Design-reference delta:** n/a — no single reference mandates one form; this is internal cross-surface inconsistency between /pool and the shared period.label.
- **Fix theme:** label vocabulary
- **Effort:** S
- **Confidence:** verified-static

#### F-P2-PER2 · /vsfield period strip scrolls horizontally with no scroll-into-view: the default (active) tab renders off-screen right during deep knockout, unlike /lineup which wraps

- **Severity:** P2
- **Screen+State:** /vsfield · live knockout round (SF/Final) with 6-7 started periods · 360-390px
- **Location:** `apps/web/app/vsfield/vsfield.css:67-73`
- **Observed:** .vf-periodtabs sets overflow-x:auto with NO flex-wrap (it inherits display:inline-flex + white-space:nowrap from ds.css:238-239), and VsFieldClient.tsx:190-206 renders the strip with no ref / scrollIntoView. As a stretched flex child of the column .vf-app it is width-constrained, becoming an internal horizontal scroller. The default displayed period is the live wave, which during the current guillotine knockout is a LATE round; selectableStartedPeriods returns every started period in canonical order (MD1, MD2, MD3, R32, R16, QF, SF ≈ 7 tabs at ~50-70px ≈ 350-490px), so the active tab is rightmost and sits beyond the 360px right edge. Nothing scrolls it into view on mount, so a manager landing on /vsfield mid-knockout sees the strip parked at MD1 with the live-round tab hidden — they cannot tell which round's field they view or that the current round is selected. /lineup handles the same situation with .sl-period-tabs flex-wrap:wrap (apps/web/app/lineup/lineup.css:33-35) so all tabs wrap and the active one stays visible. Two conceptually-identical selectors, two behaviors; the vsfield one strands the active tab.
- **Design-reference delta:** n/a
- **Fix theme:** selector geometry / auto-scroll
- **Effort:** M
- **Confidence:** verified-static

#### F-P2-ERR1 · No loading.tsx for any force-dynamic Prisma route: tab switches block with no skeleton, reading as a frozen tap on cellular

- **Severity:** P2
- **Screen+State:** /waivers, /games/[matchId], /lineup (and all 13 force-dynamic routes) · route transition while the server renders
- **Location:** `apps/web/app/waivers/page.tsx:15`
- **Observed:** Every route is force-dynamic and does an auth round-trip + a Prisma loader server-side per navigation (waivers/page.tsx:15,22 loadWaivers; games/[matchId]/page.tsx:16,24 loadGameDetail; lineup/page.tsx:12). With no loading.tsx at any level (glob empty), tapping a bottom-nav tab (AppShell.tsx:233-256) produces NO instant feedback — the previous screen stays fully frozen until the new server HTML streams, which on stadium wifi/4G mid-matchday reads as an unresponsive tap. ds.css already ships a .skeleton shimmer vocabulary (apps/web/app/styles/ds.css:356-357) plus .card/.pcard shells that go unused for route-level Suspense. The heavy loaders (waivers FAAB snapshot, games box score, lineup pitch) are exactly clusters C/D/E's flagged slow paths. Absence and force-dynamic nature are static facts; the perceived-jank magnitude is runtime and network-dependent.
- **Design-reference delta:** design/CLAUDE.md §4 ds vocabulary — the .skeleton component exists for exactly this loading state but is not wired to route transitions
- **Fix theme:** loading skeletons
- **Effort:** M
- **Confidence:** verified-static
- **Merged instances** (independently reported, folded into this finding):
  - [B · was P2] No designed loading or error state anywhere in the cluster — ds.css's `.skeleton` is defined but never used — `apps/web/app/page.tsx; apps/web/app/standings/page.tsx (no sibling loading.tsx/error.tsx anywhere under apps/web/app/)`. Neither `/` nor `/standings` (nor any route in the app, per a repo-wide glob) ships a `loading.tsx` or `error.tsx`. Both routes are `force-dynamic` server components doing multi-table Prisma reads (`loadDashboard` → loadDraftRoom + conditionally loadVsField/loadPlayoffs; `loadStandings` → manager+period+score reads) with no Suspense boundary splitting fast/slow parts, so a slow mobile connection s
  - [C · was P3] No loading skeleton for the lineup surface (SSR navigation shows the prior screen) — `apps/web/app/lineup/page.tsx:12`. The route is force-dynamic server-rendered (page.tsx:12) with no loading.tsx in apps/web/app/lineup/ (Glob confirms none). On a throttled phone the browser holds the previous screen with zero feedback until SSR completes, then swaps. The reference mobile flow renders hero/pitch/row skeletons for its loading state. Low severity because SSR delivers a complete page (no CLS, no blank flash on fast co
  - [D · was P2] No route-level loading skeleton for /waivers despite a multi-query, unbounded-fetch server loader — `apps/web/app/waivers/page.tsx:1-37`. There is no `loading.tsx` sibling for `apps/web/app/waivers/` (confirmed via directory listing: only layout.tsx/loadWaivers.ts/page.tsx + tests). `loadWaivers.ts` runs a 9-way `Promise.all` (league, managers, pending bids, roster, upcoming matches, season scores, periods, watchlist, eliminated ids) plus two further sequential queries (the unbounded free-agent pool fetch and the last-5-batches fetc
  - [E · was P2] No loading skeleton for the Game Detail route — `apps/web/app/games/[matchId]/ (no `loading.tsx` present — confirmed via directory listing: only page.tsx, layout.tsx, loadGameDetail.ts, GameDetailClient.tsx, and test files)`. `page.tsx` is `export const dynamic = "force-dynamic"` and awaits `loadGameDetail` server-side (a match fetch plus 6 parallel Prisma queries, plus a further 2-3 queries for the ownership overlay when `periodId` is set, plus group-standing queries) with no `loading.tsx` boundary. A tap on a fixture row from the dashboard or a /vsfield match card gives no interim visual feedback — the previous scree

#### F-P2-TZ1 · /games scoreboard kickoff prints bare UTC with no zone, diverging ~4h from lineup/waivers/pool for the same match

- **Severity:** P2
- **Screen+State:** /games/[matchId] · scheduled or live scoreboard meta row
- **Location:** `apps/web/src/games/buildGameDetail.ts:254-262`
- **Observed:** kickoffLabelUtc builds 'Wed 11 Jun · 17:00' entirely from getUTC* accessors, assigned to header.kickoffLabel (line 636) and rendered verbatim in the scoreboard meta at apps/web/app/games/[matchId]/GameDetailClient.tsx:1071. The unit test asserts the bare 'Sun 21 Jun · 18:00' — no zone suffix at all (the task's premise that /games is a 'labeled UTC' surface is wrong; it is unlabeled, same defect class as the dashboard). This route IS reachable in the current playoff phase (playoff match detail, and dashboard/pool match rows deep-link into it), so during a live playoff match its kickoff reads 4h off the wall clock a manager saw on /lineup and /pool.
- **Design-reference delta:** Violates design/CLAUDE.md:44 (league-local, always explicit); should route through packages/shared/src/time.ts formatInLeagueTz(instant, league.timezone).
- **Fix theme:** time-zone consistency
- **Effort:** M
- **Confidence:** verified-static

#### F-P2-TZ2 · Dashboard PrimaryBanner kickoff formatters emit unlabeled UTC; the ' UTC' suffix is claimed in the comment but never appended

- **Severity:** P2
- **Screen+State:** / (dashboard) · pre-kickoff phase, banner big + 'First kick' secondary
- **Location:** `apps/web/app/_dashboard/PrimaryBanner.tsx:316-339`
- **Observed:** formatKickoffDate's doc comment (line 316) advertises the example 'Thu 12 Jun · 17:00 UTC', but the return at line 338 is `${day} ${d.getUTCDate()} ${mon} · ${hh}:${mm}` with NO ' UTC' appended — the suffix is comment-only. formatKickoffShort (lines 341-362, used for the 'First kick' secondary at line 168) is likewise bare UTC. So the banner's largest kickoff display (content.big, rendered at line 398-400) shows a UTC time that a manager cannot even identify as UTC, and it is ~4h off the league wall clock. Pre-kickoff-phase-gated (not on-screen now), but it is the app's hero kickoff number during that state and is silently wrong. The misleading comment also masks the bug from future maintainers.
- **Design-reference delta:** Violates design/CLAUDE.md:44 (league-local + always explicit). Diverges from formatInLeagueTz used on /lineup and /waivers.
- **Fix theme:** time-zone consistency
- **Effort:** S
- **Confidence:** verified-static

#### F-P2-TZ3 · /pool hardcodes America/New_York + fixed 'ET' instead of league.timezone, matching prod only by coincidence and mislabeling DST

- **Severity:** P2
- **Screen+State:** /pool · fixture rows kickoff text (pre-kickoff pick window)
- **Location:** `apps/web/src/pool/PoolClient.tsx:136-145`
- **Observed:** fmtKickoff builds an Intl.DateTimeFormat with a literal `timeZone: 'America/New_York'` and appends a literal ' ET'. It never reads league.timezone (the pool view carries no timezone field — grep confirms the only reference is this hardcode). It therefore agrees with the prod league value by luck; if the commissioner changed league.timezone in settings (the settings screen exposes exactly that select per design/CLAUDE.md:372), /pool would silently keep showing ET while /lineup and /waivers follow the DB. Separately, the fixed 'ET' label disagrees with the dynamic 'EDT'/'EST' that formatInLeagueTz renders on lineup/waivers for the same instant — same time, two different zone tokens across screens.
- **Design-reference delta:** Consistency delta vs the shared formatInLeagueTz convention (packages/shared/src/time.ts) that every other league-local surface uses; not a rendering-value error today, but bypasses the UTC-stored/league-local source of truth (design/CLAUDE.md:44).
- **Fix theme:** time-zone consistency
- **Effort:** M
- **Confidence:** needs-live-verify


### P3 — nits / delight opportunities

#### F-P3-A1 · MoreSheet dialog is not a true modal: no aria-modal, no focus trap, no Escape handler

- **Severity:** P3
- **Screen+State:** any mobile route · More sheet open
- **Location:** `apps/web/app/shell/MoreSheet.tsx:72`
- **Observed:** The sheet uses role="dialog" (72) but omits aria-modal="true", does not move or trap focus into the dialog on open, and has no Escape/keydown dismissal (only click-close). Focus stays on the underlying page, so a keyboard/switch-control or VoiceOver user is not scoped to the sheet. The reference popovers include a click-outside + Esc helper (nav.jsx:15 useDismiss). Touch users can still tap the scrim, so this is a11y polish, not a blocker.
- **Design-reference delta:** design/design_reference/shell/nav.jsx:15 (useDismiss: click-outside + Escape)
- **Fix theme:** a11y / focus management
- **Effort:** S
- **Confidence:** verified-static

#### F-P3-A2 · Bottom bar and More sheet ignore horizontal safe-area insets (landscape notch clipping)

- **Severity:** P3
- **Screen+State:** all mobile routes · landscape on notched iPhone
- **Location:** `apps/web/app/shell/shell.css:170`
- **Observed:** .sh-btmnav (170-182), .sh-more-backdrop (222) and .sh-more-sheet (230) span left:0/right:0 and only pad `env(safe-area-inset-bottom)`. Because layout.tsx sets viewport-fit=cover, in landscape on a notched device content extends under the notch/rounded corners; the first/last bottom tab (Dashboard, More) and the sheet edges can sit under the notch or be clipped by the corner radius. .sh-content likewise adds no `env(safe-area-inset-left/right)` padding. Portrait (the dominant orientation for live scores) is unaffected, hence P3.
- **Design-reference delta:** n/a
- **Fix theme:** safe-area
- **Effort:** S
- **Confidence:** needs-live-verify

#### F-P3-A3 · No mobile top chrome at all — brand, live-connection state, and notifications entry are dropped on phones

- **Severity:** P3
- **Screen+State:** all mobile routes · shell chrome
- **Location:** `apps/web/app/shell/shell.css:300`
- **Observed:** At <640px .sh-topbar is display:none (300-303) and nothing replaces it, so phones get zero top chrome: no brand lockup, no notifications bell, and — most relevant for a live app — no global connection/staleness indicator. The reference mobile shell keeps a MobileTopBar (nav.jsx:192) with brand + ConnPill + ShellBell (mobile.jsx:15-24). A manager staring at live scores on a phone has no shell-level signal that the feed is live vs stale; whether the per-screen (vsfield) conn pill covers this needs a device check.
- **Design-reference delta:** design/design_reference/shell/nav.jsx:192 (MobileTopBar) + shell/mobile.jsx:15 (msh-head brand + ConnPill + ShellBell)
- **Fix theme:** mobile chrome / live-state legibility
- **Effort:** M
- **Confidence:** needs-live-verify

#### F-P3-A4 · /games/[matchId] hardcodes active="pool", mislighting the Quiniela tab when drilled in from the Dashboard

- **Severity:** P3
- **Screen+State:** /games/[matchId] · reached from dashboard fixtures
- **Location:** `apps/web/app/games/[matchId]/layout.tsx:29`
- **Observed:** The game-detail layout passes active="pool" so the mobile bottom bar always lights Quiniela. The screen is reached from BOTH the dashboard matchday list and the /pool fixtures, so a manager who tapped a fixture from the Dashboard sees the Quiniela tab highlighted, a minor location mismatch. Acceptable as documented, but not phase/entry aware.
- **Design-reference delta:** n/a
- **Fix theme:** active-tab derivation
- **Effort:** S
- **Confidence:** verified-static

#### F-P3-A5 · Middleware runs Supabase updateSession on /sw.js and /site.webmanifest (not excluded)

- **Severity:** P3
- **Screen+State:** all routes · static PWA asset fetches
- **Location:** `apps/web/middleware.ts:11`
- **Observed:** The matcher excludes _next/static, _next/image, favicon.ico and svg/png/jpg/jpeg/gif/webp, but not .js/.webmanifest — so /sw.js and /site.webmanifest each trigger a Supabase session refresh round-trip on fetch. Harmless (the files still serve) but wasteful; the service worker and manifest should be excluded from the auth middleware.
- **Design-reference delta:** n/a
- **Fix theme:** middleware matcher
- **Effort:** S
- **Confidence:** verified-static

#### F-P3-B1 · Marketing landing loses all in-page jump navigation below 860px with no mobile-menu substitute

- **Severity:** P3
- **Screen+State:** / · signed-out marketing, any viewport ≤860px
- **Location:** `apps/web/app/_landing/landing.css:51-55`
- **Observed:** `.lp-nav-links { display: none; }` at `@media (max-width: 860px)` removes the "The mechanics / Scoring / How it plays / The product" anchor links from the sticky nav with no hamburger or overflow menu replacing them — only "Log in" remains in `.lp-nav-cta`. The sections are still reachable by scrolling and are re-listed in the footer, so nothing is truly unreachable, but the quick-jump navigation pattern the desktop nav offers disappears entirely on every phone.
- **Design-reference delta:** n/a
- **Fix theme:** mobile-nav
- **Effort:** S
- **Confidence:** verified-static

#### F-P3-B2 · Dashboard group-phase drops half the design reference's modules (Waivers/Activity/lock widget)

- **Severity:** P3
- **Screen+State:** / · dashboard, group phase (now historical)
- **Location:** `apps/web/app/_dashboard/Dashboard.tsx:674-676`
- **Observed:** `modulesFor("group")` returns only `["record", "standings", "matchday"]`. design/CLAUDE.md §6 (Phase 3 Dashboard) specifies the group-phase module set as 'record / lock-on-play / waivers / standings / fixtures / activity' — production ships 3 of 6. Lock-on-play is partially recovered via MatchdayModule's 'Your XI locked X/Y' line, but there is no waivers reminder or activity feed on the dashboard home during the group stage.
- **Design-reference delta:** design/CLAUDE.md §6, Phase 3 — Dashboard bullet (group phase module list)
- **Fix theme:** module-parity
- **Effort:** M
- **Confidence:** verified-static

#### F-P3-C1 · Nested interactive controls: ScorePill (span role=button) inside token/bench button

- **Severity:** P3
- **Screen+State:** /lineup · any locked/played token or bench row (score pill present)
- **Location:** `apps/web/app/lineup/components.tsx:228`
- **Observed:** ScorePill is `<span role='button' tabIndex=0 onClick>` (components.tsx:228-242) rendered INSIDE the token `<button>` (PitchToken, components.tsx:322-349) and inside the bench-row `<button>` (BenchRow, components.tsx:429-450). Interactive-in-interactive nesting is invalid HTML/a11y; it works functionally via stopPropagation, and the pill is redundant with the whole-token tap (both call onScore for locked-on-play, components.tsx:319), so the practical impact is a screen-reader/validity nit rather than a broken interaction.
- **Design-reference delta:** n/a (reference uses the same span-role=button pattern)
- **Fix theme:** a11y semantics
- **Effort:** S
- **Confidence:** verified-static

#### F-P3-D1 · 'roster-illegal' error copy ('would break your positional limits') is unverifiable against the retired per-position FAAB cap without reading @app/faab

- **Severity:** P3
- **Screen+State:** /waivers · bid compose (over-budget/illegal roster rejection)
- **Location:** `apps/web/src/waivers/WaiversClient.tsx:45`
- **Observed:** `ERROR_MESSAGES["roster-illegal"] = "That add/drop would break your positional limits."` This copy is plausible either way: it could legitimately describe a still-valid structural check (e.g. a swap that would leave 0 GKs), or it could be dead/stale copy pointing at the RETIRED 2/5/5/3 per-position acquisition cap. `@app/faab`'s roster-legality validator is out of this cluster's scope, so this cannot be confirmed by reading the files assigned here.
- **Design-reference delta:** possible stale copy vs the retired per-position FAAB cap (ground truth) — unconfirmed
- **Fix theme:** copy
- **Effort:** S
- **Confidence:** needs-live-verify

#### F-P3-E1 · "Back" relies solely on router.back() with no fallback destination

- **Severity:** P3
- **Screen+State:** /games/[matchId] · entered via a deep link with no prior in-app history (e.g. a shared URL or a push notification)
- **Location:** `apps/web/app/games/[matchId]/GameDetailClient.tsx:1160-1162`
- **Observed:** `<button ... onClick={() => router.back()}>‹ Back</button>` has no fallback route. A manager landing here directly (this app has a live push-notification transport per project history) has no prior history entry inside the app, so `router.back()` may exit the tab/app rather than returning to a sensible screen. Mitigated in practice by the always-visible AppShell bottom nav on mobile (the layout highlights "pool"), which offers an alternate way back, so this is not a dead end — just a fragile primary affordance.
- **Design-reference delta:** design/design_reference/match_detail/README.md:44 — the reference's back bar is a breadcrumb ("‹ Back · Standings › Matchday 2 › Spain v Saudi Arabia") implying a known parent destination, not a blind `history.back()`.
- **Fix theme:** navigation fallback
- **Effort:** S
- **Confidence:** needs-live-verify

#### F-P3-E2 · Scoreboard's fixed 148px center-column reservation squeezes team names to a sliver at 360px

- **Severity:** P3
- **Screen+State:** /games/[matchId] · scheduled/live/full-time, any team with a longer name (Netherlands, Switzerland, Costa Rica, Korea Republic)
- **Location:** `apps/web/src/games/games.css:90-96 (`.gd-board-center{min-width:148px}`, unchanged inside the mobile media query), games.css:1366-1368 (mobile `.gd-team-nm{font-size:16px}`)`
- **Observed:** At 360px, `.gd-board-main` content width is ≈308px (336 app content minus 14px×2 mobile board padding) minus 36px of grid gaps minus the 148px center reservation, leaving ≈62px per team column; after the 34px mobile crest and 14px gap (`.gd-team{gap:14px}`, not reduced on mobile), only ≈14px remains for the team-name text before `text-overflow:ellipsis` (`.gd-team-nm`, `.gd-team{min-width:0}` already set) truncates it — effectively showing almost no legible name text. The flag-kit crest still conveys team identity, and the fuller name is available lower in the TeamList, so this is a legibility/polish gap rather than a break.
- **Design-reference delta:** n/a — the 148px minimum isn't reduced for the mobile breakpoint even though the two flanking `1fr` columns shrink substantially at 360px vs the 1180px desktop prototype.
- **Fix theme:** responsive scoreboard layout
- **Effort:** S
- **Confidence:** needs-live-verify

#### F-P3-E3 · Ratings podium's 3-column grid has no min-width:0 guard and can overflow with long country names in the top 3

- **Severity:** P3
- **Screen+State:** /games/[matchId] · Ratings tab, top-3 podium featuring players from longer-named nations
- **Location:** `apps/web/src/games/games.css:904-908 (`.gd-rb-podium{grid-template-columns:repeat(3,1fr)}`), games.css:964-970 (`.gd-rb-team`)`
- **Observed:** Neither `.gd-rb-pod` nor `.gd-rb-team` sets `min-width:0`, so an unbreakable country-name word (e.g. "Netherlands") combined with the flag glyph can push a podium column's min-content width above its fair ~104px share at 360px. Unlike the tab bar (a near-guaranteed overflow) this is marginal — my estimate is close to fitting, not clearly over — so it needs a real check rather than a confident static call.
- **Design-reference delta:** n/a — same missing-min-width:0 pattern as the tab-bar finding, applied to a lower-risk component.
- **Fix theme:** grid overflow guard
- **Effort:** S
- **Confidence:** needs-live-verify

#### F-P3-F1 · Pool pick buttons look identical whether locked or mid-flight (busy) — no distinct saving indicator

- **Severity:** P3
- **Screen+State:** /pool · Picks tab, tapping a pick control (POST /api/pool/pick in flight)
- **Location:** `apps/web/src/pool/components.tsx:130-148 (PickControl disabled={locked||busy}) + apps/web/src/pool/pool.css:214-217 (.pl-pickbtn:disabled { opacity: 0.6 })`
- **Observed:** `disabled={locked || busy}` applies the exact same `opacity:0.6` dimming for a genuinely locked (kicked-off) fixture and for a pick that is merely mid-network-round-trip. A manager on a slow connection who taps a pick sees the same visual as a locked match, with no spinner/"Saving…" text to confirm the tap registered.
- **Design-reference delta:** n/a.
- **Fix theme:** state-legibility / loading
- **Effort:** S
- **Confidence:** verified-static

#### F-P3-F2 · ConnPill's "stale" connection state is defined but never dispatched — dead code path

- **Severity:** P3
- **Screen+State:** /vsfield · any state (connection pill)
- **Location:** `apps/web/app/vsfield/components.tsx:48,88-93 (ConnState type + stale branch) vs apps/web/app/vsfield/VsFieldClient.tsx:76-119 (setConn only ever called with "historical"/"live"/"reconnecting"/"loading")`
- **Observed:** `ConnState` includes `"stale"` and `ConnPill` renders a distinct "Delayed" pill for it, but `VsFieldClient.tsx`'s `setConn` calls (mapping Realtime `onStatus` + the `isLivePeriod` branch) never produce `"stale"` — there is no timeout/staleness detector wired up. Not user-visible today, but it means a genuinely stale feed (subscribed + SUBSCRIBED status, but no fresh rows for a long time) shows as plain "Live" with no warning.
- **Design-reference delta:** n/a.
- **Fix theme:** state-legibility / dead-code
- **Effort:** S
- **Confidence:** verified-static

#### F-P3-F3 · /pool leaderboard has no "last updated" / staleness cue despite polling only while the tab is visible

- **Severity:** P3
- **Screen+State:** /pool · Leaderboard tab, tab returns to foreground after being backgrounded
- **Location:** `apps/web/src/pool/PoolClient.tsx:104-117 (leaderboard visibility-poll effect) + apps/web/src/pool/components.tsx:263-314 (LeaderboardTable — no updated/refreshing indicator)`
- **Observed:** The leaderboard refetches via `router.refresh()` on tab-activate, every 60s while visible, and on `visibilitychange`, but there is no visible "Updated Xs ago" / spinner cue (unlike /vsfield's `Updated {HH:MM}` label next to its ConnPill). A manager returning to the app mid-tournament has no way to tell whether the numbers on screen are freshly refetched or from before they backgrounded the tab.
- **Design-reference delta:** n/a.
- **Fix theme:** state-legibility
- **Effort:** S
- **Confidence:** verified-static

#### F-P3-G1 · View-as dropdown has no outside-tap/Escape dismissal and no overscroll containment; it is a 240px popover rather than a mobile sheet

- **Severity:** P3
- **Screen+State:** /commish · view-as switcher open (commissioner, ~12 managers)
- **Location:** `apps/web/app/commish/CommishConsole.tsx:2138`
- **Observed:** ViewAsSwitcher toggles `open` purely on its own button (CommishConsole.tsx:2138-2147) with no outside-click or Escape handler, so on a phone the only way to close the menu without choosing a manager is to find and re-tap the small trigger. The scroll list `.adm-viewas-scroll` (commish.css:373-379) sets `max-height/overflow-y:auto` but no `overscroll-behavior:contain`, so flicking through the manager list can scroll-chain to the page body. The 240px right-anchored popover (commish.css:355-360) is also a desktop pattern; a bottom sheet would be more thumb-reachable. View-as itself is present and matches the reference (ManagerView inspector + banner), so this is polish only.
- **Design-reference delta:** n/a (feature parity with reference ViewAsSwitcher/ManagerView is met)
- **Fix theme:** menu dismissal / sheet
- **Effort:** S
- **Confidence:** verified-static

#### F-P3-G2 · Numeric fields lack inputmode, confirm buttons sit directly under the last text input, and `.adm-msg.is-ok` uses a hardcoded green via an undefined token

- **Severity:** P3
- **Screen+State:** /commish · stat corrections + freeze/cut confirms (commissioner, iOS)
- **Location:** `apps/web/app/commish/CommishConsole.tsx:1643`
- **Observed:** The penalty (CommishConsole.tsx:1643-1661), rating (:1780-1788) and stat-line (:1952-1960) inputs are `type="number"` with no `inputMode` — iOS shows a usable numeric keypad but `inputmode="numeric"/"decimal"` would be more predictable (rating uses step 0.1). In every inline confirm block the primary button (Freeze/Apply-cut/Save) renders immediately below the last reason `<input>` (e.g. :332-344), so with the keyboard raised the confirm control can sit under it, forcing a keyboard dismiss before confirming. Separately, `.adm-msg.is-ok` (commish.css:637) resolves its color via `var(--pos, #35c48a)` where `--pos` is undefined, so success messages use an ad-hoc green instead of the `--win` token (minor token drift; contrast is fine).
- **Design-reference delta:** n/a
- **Fix theme:** input semantics / token drift
- **Effort:** S
- **Confidence:** verified-static

#### F-P3-G3 · Console bottom padding is a flat 32px with no safe-area-inset / fixed-bottom-nav clearance

- **Severity:** P3
- **Screen+State:** /commish · bottom of any tab (commissioner, phone with home indicator + AppShell bottom nav)
- **Location:** `apps/web/app/commish/commish.css:14`
- **Observed:** `.adm-console` sets `padding: 16px 18px 32px` (commish.css:14-20) with no `env(safe-area-inset-bottom)` and no allowance for the AppShell mobile bottom tab bar the console mounts inside. If the shell does not itself reserve that space for children, the last audit entry and the final Apply/confirm buttons could be occluded by the fixed bottom nav + home indicator. Cross-component with the shell, so runtime confirmation is required.
- **Design-reference delta:** n/a
- **Fix theme:** safe-area
- **Effort:** S
- **Confidence:** needs-live-verify

#### F-P3-H1 · "Enable browser notifications" has no busy-state guard against rapid double-tap

- **Severity:** P3
- **Screen+State:** /settings notification prefs · rapid repeated tap
- **Location:** `apps/web/src/notifications/NotificationsClient.tsx:136-139`
- **Observed:** Unlike the sign-in "Send magic link" button (`disabled={sending}`), the "Enable browser notifications" button (lines 137-139) has no `disabled` binding to an in-flight state, so an impatient double-tap while waiting for the native permission dialog can fire multiple concurrent `enableBrowserPush()` calls (each requesting permission / registering / subscribing / POSTing).
- **Design-reference delta:** n/a
- **Fix theme:** busy-state-guard
- **Effort:** S
- **Confidence:** verified-static

#### F-P3-H2 · Display-name input has no maxLength, so the 40-char cap is only discovered after tapping Save

- **Severity:** P3
- **Screen+State:** /settings profile rename · typing a long name
- **Location:** `apps/web/src/settings/SettingsClient.tsx:60-71`
- **Observed:** The input has no `maxLength={40}` even though `validateDisplayName` (apps/web/src/manager/displayName.ts:10-15) rejects names over 40 characters server-side. A manager typing a long display name gets no proactive stop and only learns of the limit after a round-trip Save attempt returns "Display name must be 40 characters or fewer."
- **Design-reference delta:** n/a
- **Fix theme:** input-validation-affordance
- **Effort:** S
- **Confidence:** verified-static

#### F-P3-I1 · Hover-only affordances with no @media (hover:hover) guard — sticky hover states on touch across all tables/rows/cards

- **Severity:** P3
- **Screen+State:** css-system · every list/table row on touch devices (dtable, pcard, db-match-row, gd-lr, st-row-main…)
- **Location:** `apps/web/app/styles/ds.css:315`
- **Observed:** Grep for 'hover: hover' returns zero matches; dozens of :hover rules restyle rows and buttons (.dtable tbody tr:hover ds.css:315, .pcard:hover ds.css:361, .db-match-row:hover dashboard.css:339, .gd-lr:hover games.css:798, .lp-peek:hover with translateY(-2px) landing.css:243). On iOS/Android a tap leaves the hover state stuck until the next tap elsewhere — rows stay highlighted after navigation-back, and the landing cards stay lifted. No functionality is hover-GATED (no hover-revealed content found — good), so this is polish, not breakage. Touch-native :active feedback exists only on .ma-row:active (vsfield.css:1323) and .sh-more-item:active (shell.css:262-266); the pattern should be inverted: wrap hover rules in @media (hover:hover) and add :active equivalents.
- **Design-reference delta:** n/a — reference targeted desktop demo browsing.
- **Fix theme:** touch semantics
- **Effort:** M
- **Confidence:** verified-static

#### F-P3-I2 · Stale 'reset' vocabulary survives in class names and comments (copy itself is verified FIXED)

- **Severity:** P3
- **Screen+State:** /waivers playoff banner · /playoffs reinforce module · dashboard reinforce comment
- **Location:** `apps/web/src/waivers/waivers.css:53`
- **Observed:** The user-facing FAAB copy is CORRECT everywhere (verified: WaiversClient.tsx:284-292 renders 'FAAB carries over… not wiped or replenished'; playoffs/components.tsx:491-494 renders 'Carries over · no reset'; reinforceModule.test.tsx enforces it). But the styling layer still names the machinery for the retired rule: .wv-resetbanner (waivers.css:53-69), .po-reset-tag (playoffs.css:1172), dashboard.css:569 comment '(playoff — FAAB reset reminder)', .db-rf-* block. Harmless at runtime; a future contributor grepping 'reset' will find live-looking hooks for a dead mechanic. Rename to .wv-carrybanner/.po-carry-tag when convenient.
- **Design-reference delta:** design/design_reference Waivers.html + Guillotine Playoffs.html still demo the reset (known-STALE per audit ground rules) — the app diverged correctly; only naming lags.
- **Fix theme:** naming hygiene
- **Effort:** S
- **Confidence:** verified-static

#### F-P3-I3 · Minor token/animation lint: var(--t-sm) typo, width-animating meters, one opacity-from-0 entrance

- **Severity:** P3
- **Screen+State:** css-system · motion + tokens
- **Location:** `apps/web/app/draft/draft.css:86`
- **Observed:** (1) draft.css:86 uses var(--t-sm, 0.8125rem) — --t-sm is a class name, not a token (--fs-sm is the token); the fallback silently saves it. (2) Layout-property animations: .meter>span transitions width (ds.css:322), .gd-stat-fill transitions width (games.css:1183-1187) — small elements, one-shot, low risk, but they violate the transform/opacity-only rule. (3) .au-pop keyframes animate opacity 0→1 (auth.css:298-313) on the check-email/denied icon — the project rule bans opacity-from-0 on list/toast ENTRANCES; a status icon is adjacent, and the global reduced-motion clamp (ds.css:384-386, 0.001ms !important) snaps it to the visible end-state, so no strand risk. Everything else is clean: tickin animates transform only (draft.css:114), .lp-reveal rests visible (landing.css:299-302), playoffs blades are fully gated behind prefers-reduced-motion (playoffs.css:344-365,901-908).
- **Design-reference delta:** n/a
- **Fix theme:** motion lint
- **Effort:** S
- **Confidence:** verified-static

#### F-P3-I4 · /draft fixed 100dvh app shell collides with the mobile bottom nav (dormant surface — draft completed)

- **Severity:** P3
- **Screen+State:** /draft · <640px, post-draft summary or any revisit
- **Location:** `apps/web/app/draft/draft.css:13`
- **Observed:** .dr-app is height:100dvh; overflow:hidden (draft.css:12-18) inside .sh-content, whose <640px padding-bottom (58px + inset, shell.css:309-312) sits BELOW the 100dvh box — so the fixed bottom nav overlays the bottom ~58-92px of the draft surface, and the internal scrollers' (.dr-railscroll/.dr-body) last rows end behind the bar; the outer page can scroll the 58px of padding to compensate, an awkward double-scroll. Also /draft pins data-density="compact" (draft/layout.tsx:16), opting out of the 44px touch boosts. Low priority solely because the draft happened pre-tournament and the mobile board is already hidden (<960px shows tabs, draft.css:457-490); the height model should still switch to min-height at <640px if the room is ever reused.
- **Design-reference delta:** design/design_reference Draft Room.html assumed #root{height:100vh} with no competing bottom bar.
- **Fix theme:** height model
- **Effort:** S
- **Confidence:** verified-static

#### F-P3-I5 · Tailwind ships full Preflight for exactly two utilities; content globs omit src/**, and coexistence relies on undocumented import-order discipline

- **Severity:** P3
- **Screen+State:** css-system · tailwind-coexistence, all routes
- **Location:** `apps/web/tailwind.config.ts:4`
- **Observed:** Grep shows the ONLY Tailwind utilities in the app are min-h-screen + antialiased on <body> (app/layout.tsx:52) — the entire framework + Preflight reset loads for those two classes. Coexistence hazards are real but currently managed: (a) ds.css must import AFTER globals.css so its element rules beat Preflight ties (layout.tsx:3-8 comment documents this; nothing enforces it); (b) Preflight's -webkit-appearance:button already forced a Safari clip workaround (lineup.css:260-265 overflow:visible); (c) tailwind.config.ts content covers ./app and ./components but NOT ./src — any utility class added to src/waivers|pool|games components will silently produce no CSS. Either finish the teardown (replace the two utilities with ds rules, drop Tailwind) or add ./src to content and a lint note pinning the import order.
- **Design-reference delta:** n/a — design/CLAUDE.md assumed Tailwind implementation via the ds token handoff (theme.extend is empty; the handoff never happened, which is fine since ds classes won).
- **Fix theme:** tailwind teardown
- **Effort:** S
- **Confidence:** verified-static

#### F-P3-J1 · Server always fetches and ships the entire undrafted player pool (~1000+ rows) on every /draft load, unused once the draft is complete

- **Severity:** P3
- **Screen+State:** /draft post-draft as manager
- **Location:** `apps/web/app/draft/loadDraftRoom.ts:99-110`
- **Observed:** `availableRows`/`availablePlayers` are computed unconditionally regardless of `draft.status`. For the completed 12-manager/15-round draft, 'available' = all players minus ~180 owned, i.e. roughly 1000+ player rows queried and serialized into `DraftRoomState.availablePlayers`, even though the 'complete' render branch (apps/web/app/draft/DraftRoomClient.tsx:395-424) never mounts `AvailableList`/`QueuePanel` and never touches this array. Wasted Prisma query + extra JSON payload on a low-traffic, mobile-data-sensitive screen.
- **Design-reference delta:** n/a — data-loading efficiency, not a design divergence.
- **Fix theme:** payload trim
- **Effort:** S
- **Confidence:** verified-static

#### F-P3-J2 · Ported post-draft 'Summary' screen is dead code — never imported/rendered by DraftRoomClient

- **Severity:** P3
- **Screen+State:** /draft post-draft as manager
- **Location:** `apps/web/app/draft/components.tsx:769-829`
- **Observed:** `Summary` (a full congratulatory recap: 'Your squad is set' + per-position grid) is defined and exported but DraftRoomClient's import list (DraftRoomClient.tsx:33-42) never includes it — the live 'complete' branch instead reuses the Board+RosterPanel tabs (DraftRoomClient.tsx:395-424). The substitute view is itself reasonably dignified (shows the full draft board plus the viewer's squad, arguably richer than the reference's static summary), so this is not a broken experience — just unreachable, unused code worth deleting or wiring in.
- **Design-reference delta:** design_reference/draft/app.jsx:152 renders `<Summary picks={picks}/>` as the sole post-draft view; the live app substitutes an interactive Board/Roster tab pair instead and leaves the ported Summary component unmounted.
- **Fix theme:** dead code cleanup
- **Effort:** S
- **Confidence:** verified-static

#### F-P3-K1 · Confirmed .po-col .po-col-future selector bleed (desktop-ladder only; not visible at phone widths)

- **Severity:** P3
- **Screen+State:** /playoffs desktop/landscape ladder · future column header (no effect ≤767px)
- **Location:** `apps/web/app/playoffs/playoffs.css:1346`
- **Observed:** .po-col .po-col-future (descendant combinator) matches both the future column's body <div class="po-col-future"> (direct child of .po-col) and the header <span class="po-col-tag po-col-future">Upcoming</span> (grandchild via .po-col-head; components.tsx:361 vs :375). The header tag therefore inherits flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:18px 8px, bloating the tiny "Upcoming" label into a padded centered block. A > child combinator fixes it. Contained to .po-col (the desktop ladder), which is display:none under the 767px mobile switch (playoffs.css:72-79); the mobile ladder tag .mpo-lround-tag.po-col-future has no .po-col ancestor and correctly picks up only the intended color rule (:1276). Recorded per audit mandate; not user-visible on portrait phones.
- **Design-reference delta:** n/a (implementation bug, pre-existing on main)
- **Fix theme:** selector scoping
- **Effort:** S
- **Confidence:** verified-static

#### F-P3-K2 · Nested double horizontal padding wastes ~19% width at 360px

- **Severity:** P3
- **Screen+State:** /playoffs mobile · all states
- **Location:** `apps/web/app/playoffs/playoffs.css:34-43`
- **Observed:** The production .po-app adds 20px padding around the .mpo block, which the reference rendered edge-to-edge inside its iOS frame; the mpo children add their own 14/12px (.mpo-head padding:14px at :1388; .mpo-scroll padding:12px at :1464-1470). Header content is inset 34px from each screen edge (68px total, ~19% of 360px), squeezing the already data-dense board. Not overflow (html/body overflow-x:hidden backstops), just cramped.
- **Design-reference delta:** Reference .mpo is full-bleed within the device frame.
- **Fix theme:** mobile spacing
- **Effort:** S
- **Confidence:** verified-static

#### F-P3-K3 · Redundant "Guillotine" + round-line chrome, and no score-pulse on ticking points

- **Severity:** P3
- **Screen+State:** /playoffs mobile · live
- **Location:** `apps/web/app/playoffs/components.tsx:173-178`
- **Observed:** "Guillotine" and the round descriptor appear twice within the first ~120px on mobile (screenhead title "Guillotine · <ROUND> · ROUND X OF Y" at :173-178 vs hero eyebrow "Guillotine · R{n}/{total}" at :959-962). Separately, when live points change on refetch the myband/board numbers (:1143-1146, rows :532) jump with no pulse — the design vocabulary's useScorePulse/.score-pulse (ds.css:333-334) is used on the other live surfaces but not here, slightly reducing "something just changed" glanceability during a live round.
- **Design-reference delta:** Reference theater uses a score pulse on live points.
- **Fix theme:** delight / live feedback
- **Effort:** S
- **Confidence:** verified-static

#### F-P3-K4 · Mobile board victims row has no flex-wrap (clip risk on a large boundary-tie set)

- **Severity:** P3
- **Screen+State:** /playoffs mobile · live round with a large whole-tied-set zone
- **Location:** `apps/web/app/playoffs/playoffs.css:1624-1628`
- **Observed:** The in-board guillotine victims row (.mpo-victims { display:flex; gap:9px; padding-left:38px }, no wrap; rendered by MPoBoard, components.tsx:576-585) is a non-wrapping flex row of 26px avatars. In the documented live boundary-tie state the whole tied set is marked zone, so this row could hold many avatars; at ~5-6 it still fits 360px, but a larger tie would overflow and be silently clipped by the body overflow-x:hidden backstop. The hero's OnTheBlock row does wrap (.po-block-row{flex-wrap:wrap}), so only the in-board row is exposed.
- **Design-reference delta:** n/a
- **Fix theme:** tie-zone robustness
- **Effort:** S
- **Confidence:** needs-live-verify

#### F-P3-NF1 · Census correction: NationFilter is waivers-only; /lineup ships no nation filter (memory 'lineup+waivers' claim is stale)

- **Severity:** P3
- **Screen+State:** /lineup · nation/country filter (does not exist)
- **Location:** `apps/web/src/waivers/BidComposer.tsx:165`
- **Observed:** Repo-wide grep confirms NationFilter is imported at exactly two live sites — BidComposer.tsx:31/165 and FreeAgentPanel.tsx:29/127 — plus its wiring test. /lineup (SetLineupClient.tsx, components.tsx, loadLineup.ts) uses <Flag>/<FlagBadge>/toIso2 for per-player flag+kit rendering but has NO nation-filter control and no country/nation filter state anywhere. This is correct by design: the lineup is a fixed 15/9-man pitch squad, not a searchable pool, so there is nothing to filter. The draft pool keeps its own .dr-nation-* classes (draft.css:293+) and does not import the component. The MEMORY 'shared NationFilter across lineup+waivers' (lineup-waivers-polish-layer) is therefore stale/aspirational on the lineup side and should stop propagating.
- **Design-reference delta:** n/a
- **Fix theme:** copy / census hygiene
- **Effort:** S
- **Confidence:** verified-static

#### F-P3-PSC1 · A genuine 0-point breakdown line renders in win-green on all three period sheets

- **Severity:** P3
- **Screen+State:** /lineup · /vsfield · /games · Points tab, a scored line worth 0 (e.g. the zero-rating §1 line)
- **Location:** `apps/web/components/PlayerScoreSheet.tsx:251`
- **Observed:** LineRow builds `ptsClass = ...${line.points >= 0 ? ' is-pos' : ' is-neg'}` (PlayerScoreSheet.tsx:251) and `.sl-sm-row-pts.is-pos { color: var(--win) }` (PlayerScoreSheet.css:129 / lineup.css:799), so a 0-pt line paints '0' in win-green — a neutral value in the gain color. This is at least CONSISTENT across the three shared surfaces (same component), and the memory-noted zero-rating fix correctly lives in the shared component/endpoint, not a caller; but green-for-zero is a minor legibility nit. Not applicable to waivers (its Points tab is an overview, no per-line breakdown).
- **Design-reference delta:** n/a
- **Fix theme:** copy / functional-color
- **Effort:** S
- **Confidence:** verified-static

#### F-P3-PER1 · /pool re-orders period sections with a raw string comparator instead of the shared canonical period order

- **Severity:** P3
- **Screen+State:** /pool · group phase (matchday sections)
- **Location:** `apps/web/src/pool/poolView.ts:127-129`
- **Observed:** selectPoolPicksView orders group matchday sections with .sort(([a],[b]) => cmpStr(a,b)) — a plain lexicographic compare on the label — rather than the shared comparePeriodLabels/sortByPeriodOrder (packages/shared/src/periodOrder.ts) that /lineup and /vsfield use as the single canonical source. For MD1/MD2/MD3 lexicographic and canonical order coincide, so no visible bug today, but this is the silent re-divergence class the census flagged: a two-digit matchday ('MD10') would sort before 'MD2' here while staying correct on lineup/vsfield. The knockout bracket avoids it via the hardcoded KNOCKOUT_ROUND_ORDER (poolView.ts:36,150) matching @app/shared KNOCKOUT_ROUNDS. Fix: sort pool sections through comparePeriodLabels so all four surfaces share one ordering source.
- **Design-reference delta:** n/a
- **Fix theme:** canonical period order reuse
- **Effort:** S
- **Confidence:** verified-static

#### F-P3-PER2 · /waivers BatchBar current period uses a different predicate than the live-wave used by /lineup and /vsfield, so it can name a different round at the same instant

- **Severity:** P3
- **Screen+State:** /waivers · live knockout round whose batch already cleared
- **Location:** `apps/web/app/waivers/loadWaivers.ts:169`
- **Observed:** loadWaivers picks its current period via selectCurrentPeriod(periodRows, p => p.batchClearedAt === null), whereas loadLineup:320 and loadVsField:206 both use selectCurrentPeriod(..., p => now < lastKickoff + MATCH_DURATION_MS). During a live knockout round whose blind-bid batch already cleared (batchClearedAt stamped ~6h before first kickoff), the waivers predicate excludes that round and, absent a status='open' fast-path, falls through to the NEXT round — so the BatchBar 'Waivers process at' + sub label can read the next round (e.g. 'R16') while /lineup and /vsfield show the live round (e.g. 'R32') active, at the same wall-clock instant. This is NOT a wrong-roster/claims mismatch (the FA pool + pending claims on /waivers are live/global and per-player-kickoff scoped, not bound to this period — loadWaivers.ts:243-265; the T11 prior-matchday selector was deliberately removed from /waivers), so the label is semantically correct for its purpose. But it is a genuine cross-surface label divergence a glancing manager may misread, and it is the exact seam that produced a prior BatchBar-wrong-period bug. Fix: document as intended or make the copy explicit ('next batch: R16').
- **Design-reference delta:** n/a
- **Fix theme:** label vocabulary / period semantics
- **Effort:** S
- **Confidence:** needs-live-verify

#### F-P3-ERR1 · Recommended custom boundaries should carry XI branding, a back-home affordance and safe-area padding (delight + wayfinding)

- **Severity:** P3
- **Screen+State:** (the eventual app/not-found.tsx + app/error.tsx) · rendered state
- **Location:** `apps/web/app/styles/ds.css:186`
- **Observed:** Beyond merely being dark, an Apple-feature-worthy 404/500 should not strand the user: give it the XI BrandBadge, ds surface (.card / --surface-0), a clear cobalt btn-primary 'Back to dashboard' link (accent #4D8DFF is the sanctioned primary-action color per the locked decisions), a friendly on-brand line ('That fixture isn't in this tournament'), and padding-bottom:env(safe-area-inset-bottom) so the CTA clears the home indicator on viewport-fit=cover. error.tsx (a client boundary below root) can render INSIDE the root layout, so unlike global-error it keeps ds.css; use it for route-level throws and reserve global-error for root-layout failures. This turns a dead-end into a one-tap recovery.
- **Design-reference delta:** n/a — net-new surface; should compose ds.css .card (line 186) + .btn-primary (line 204) + Brand per design/CLAUDE.md §4
- **Fix theme:** empty-state charm
- **Effort:** S
- **Confidence:** verified-static

#### F-P3-TZ1 · No enforced single time-format helper — four divergent kickoff formatters plus a UTC-only commish audit ledger

- **Severity:** P3
- **Screen+State:** cross-surface · dashboard/games (bare UTC) vs pool (hardcoded ET) vs lineup/waivers (formatInLeagueTz) vs commish ledger (UTC-only, cluster G)
- **Location:** `packages/shared/src/time.ts:14`
- **Observed:** formatInLeagueTz already exists as the intended single source (it is the one that produces league-local + dynamic zone abbrev), and /lineup and /waivers correctly consume it. But three other kickoff formatters were hand-rolled (Dashboard.formatKickoffTime, PrimaryBanner.formatKickoffDate/Short, buildGameDetail.kickoffLabelUtc) plus /pool's inline hardcode, and cluster G reports the commish audit ledger is UTC-only. Proposed invariant: every instant displayed to a manager MUST route through formatInLeagueTz(instant, league.timezone) so it renders the league wall clock with an explicit zone suffix — no getUTC* string-building, no literal timeZone strings, no bare 'HH:mm'. The commish ledger part I have not read and is out of my file scope → live_verify.
- **Design-reference delta:** design/CLAUDE.md:44 already mandates league-local + explicit-zone display; the divergent formatters are the delta.
- **Fix theme:** time-zone consistency
- **Effort:** M
- **Confidence:** needs-live-verify

---

## 4. Fix-thread plan (Phase 2 synthesis)

Twelve candidate threads, in recommended execution order. Mapping to the brief's sequence: broken-content first (T15-1), then the AppShell/bottom-nav work (T15-2/4), then global polish (T15-3/5/10), then per-screen passes in user-impact order (T15-6..9), then delight (T15-12). Risk classes: **visual-only** = CSS/JSX/copy, no loader/engine/schema; **contract-touching** = widens a loader read or threads new data (never mutates). Merge column: per CLAUDE.md the default is HOLD; "delegable" flags threads contained enough that Sergio may pre-authorize Code to merge on a green gate.

| # | Thread | Scope (finding IDs) | Risk class | Size | Merge |
|---|---|---|---|---|---|
| T15-1 | **P0 hotfixes: unreachable content at phone widths** | F-P0-B1 + F-P1-B1 (standings grids → reference `MStandRow` card or scrollable tracks), F-P0-E1 (games tab strip → reference `overflow-x:auto` pattern), F-P0-F1 (vsfield Season → reference `MobSeason` stacked list), F-P2-G2 (commish tab-strip overflow affordance, same fix shape) | visual-only | S–M | delegable on green gate + 360/390/430 screenshots |
| T15-2 | **Shell stacking, safe-areas & sheet mechanics** | F-P1-I1 (z-scale: scrims/sheets above nav, nav inert under scrim; incl. merged waivers-card + draft-toast instances), F-P1-C1 (SaveBar offset above nav band), F-P2-I6/I7 (scroll containment + body-scroll lock on every sheet/modal; vh→dvh + safe-area on fixed overlays), F-P2-PSC1 (sheet close-✕ stays reachable), F-P2-A4 + F-P3-A1 (MoreSheet grabber/close/title, focus trap), F-P3-A2 (landscape safe-area-x), F-P3-G3 (commish bottom clearance) | visual-only, global chrome | M | HOLD — one z/viewport token pass touches every screen; needs the Playwright bounds harness extended |
| T15-3 | **Keyboards & form attributes** | F-P1-I2 (16px input floor under a coarse-pointer query, app-wide), F-P1-G1 (FREEZE/CUT: autocapitalize/autocorrect/spellcheck off), inputmode/enterkeyhint sweep (bid amount `inputMode=numeric`, email fields), F-P3-H2 (display-name maxLength), F-P3-H1 (push enable double-tap guard) | visual-only (attributes + one CSS rule) | S | delegable — attribute-only, but includes /commish files; gate + manual FREEZE modal check |
| T15-4 | **Phase-aware bottom nav + IA** | F-P2-A3 (primary tabs keyed on tournament phase — Playoffs surfaces during knockout; Quiniela demotes; per reference `primaryKeys(phase)`), F-P3-A4 (/games active-tab fix), F-P3-A3 (mobile top chrome: brand + ConnPill + notifications entry — decision needed), F-P3-A5 (middleware excludes sw.js/manifest) | visual-only + pure nav selectors | M | HOLD — embeds a product decision (which 4–5 tabs); needs Sergio's IA sign-off first |
| T15-5 | **Error/404/loading boundaries** | F-P1-ERR1 (root + games not-found.tsx), F-P1-ERR2 (error.tsx + self-contained global-error.tsx), F-P2-ERR1 (per-route loading.tsx skeletons using the ds `.skeleton` vocabulary; incl. merged B/D/E/C instances) | additive files only | S–M | delegable — zero existing-path risk |
| T15-6 | **Time truth** | F-P1-TZ1 (dashboard MatchdayModule), F-P2-TZ1 (/games scoreboard), F-P2-TZ2 (PrimaryBanner), F-P2-TZ3 (/pool league.timezone threading), F-P2-G4 (commish ledger tap-visible league-local timestamps), F-P3-TZ1 (single shared formatter) | contract-touching (threads `league.timezone` into two snapshots; display-only) | M | HOLD |
| T15-7 | **Rulebook truth (/scoring)** | F-P1-J1 (§1 ladder + 0-band), F-P1-J2 (§4 ÷10 + five missing categories + regenerate all four §9 worked examples), F-P1-J3 (§8 red values) | copy-only, but every value must be sourced from `packages/scoring` (consider generating tables from engine constants to kill future drift) | S–M | HOLD — league rulebook trust surface |
| T15-8 | **Guillotine legibility (playoffs + vsfield)** | F-P1-K1 (mobile You-band keyed on `me.state` + explicit Out fallback), F-P2-K1 (zone-vs-elim tags: distinct color + word), F-P1-F1 (vsfield elimination explanation/copy), F-P2-K3 (stale-feed wiring + visibilitychange refetch), F-P2-K4 (reduced-shape chip + Set-lineup link on mobile), F-P3-K2 (padding), F-P3-K4 (victims flex-wrap) | visual-only (K3 touches the live controller — client-side) | M | HOLD — the centerpiece, live mid-tournament |
| T15-9 | **Per-screen passes** (sub-threads, impact order): **9a /lineup** F-P1-C2 (save-error overlay), F-P2-C1/C3 (legend, no-legal-swap feedback), F-P2-C4 (frozen-period presentation), F-P2-C2 (lock countdown + clock re-sample), F-P2-C5/C6 (read-only banner, micro-labels), F-P3-C1 (nested controls) · **9b /waivers** F-P1-D1 (mobile IA: compact FaabBar up top, rails below main), F-P1-D2 (release-list locked count + why), F-P2-D1/D2/D3 (FA row layout, composer perf, cutoff icons), F-P2-NF1 (NationFilter ergonomics), F-P3-D1 (stale positional-limits copy) · **9c /games** F-P1-E1 (ET/pens: widen loader select — **contract-touching**), F-P2-E1/E2/E3/E4 (events name truncation, token floor, live minute, muted-chip contrast), F-P3-E1/E2/E3 (back fallback, center-column squeeze, podium guard) · **9d /pool** F-P1-F2 (44px pick buttons), F-P3-F1/F3 (busy state, staleness cue) · **9e /commish** F-P2-G1 (undefined tokens — may land with T15-2), F-P2-G3 (cut-preview truncation), F-P3-G1/G2 (view-as sheet, numeric inputmode) · **9f auth/settings** F-P1-H1 (push error handling), F-P2-H6/H5 (iOS install guidance, subscription visibility/revoke), F-P2-H1/H2 (denied-vs-expired split, callback interstitial), F-P2-H3/H4/H7 (button density, caption contrast, grouped-settings layout) · **9g /draft** F-P1-J4 (gate Set clock), F-P2-J1 (unsubscribe realtime), F-P2-J2 (.btn-secondary), F-P2-J3 + F-P3-J1/J2 (header truncation, pool overfetch, summary state or remove), F-P3-I4 (draft 100dvh vs bottom nav) · **9h /standings** F-P2-B2/B3 (season-grid scroll affordance, stale provisional-cut copy) · **9i shared components** F-P2-PSC2/PSC3 (Stats-tab identity header, trigger-chip color language), F-P2-PER1/PER2 (round-label vocabulary, period-strip scroll-into-view), F-P3-PSC1 (0-pt line in win-green), F-P3-PER1/PER2 (pool period comparator, BatchBar predicate) | mostly visual-only; 9c partially contract-touching | M–L each | 9a–9b HOLD (live surfaces); 9c HOLD (loader); 9d–9i delegable case-by-case |
| T15-10 | **CSS system consolidation + perf** | F-P2-I1 (five ds.css copies → one global), F-P2-I2 (fonts → next/font self-host + fallback metrics; incl. merged A instance), F-P2-A1 (color-scheme:dark + html background), F-P2-I3 (breakpoint scale), F-P2-I5 + F-P2-K2 (systemic sub-44 sweep — the DS-level part incl. `.tab`/round-nav; per-screen instances land in their passes), F-P2-I4 (micro-text contrast tokens), F-P3-I1 (hover:hover guards), F-P3-I3 (animation lint), F-P3-I5 (tailwind globs/preflight) | visual-only, structural | M–L | HOLD — needs screenshot-diff regression pass |
| T15-11 | **Light theme completion** | F-P2-A2 (Appearance section per reference — incl. merged I + H instances; un-pin per-layout `data-theme="dark"`; light-mode contrast pass across the 16 route sheets) | visual-only, wide | L | HOLD — also a scope decision: fine to defer post-tournament, but it is a locked design decision left unshipped |
| T15-12 | **Delight pass** | F-P2-B1 (standings reorder motion), F-P3-K3 (score-pulse on playoffs, de-duped chrome), F-P3-B1/B2 (landing jump-nav, dashboard module parity), F-P3-F2 (wire or drop the stale ConnPill state), F-P3-ERR1 (branded 404 personality), F-P3-I2 (purge dead 'reset' vocabulary), empty-state charm, :active feedback states across controls | visual-only | S–M | delegable |

Suggested first PR wave (max value, min risk): **T15-1 + T15-3 + T15-5** are all small, contained, and independently shippable; **T15-2** immediately after as the enabling chrome pass; **T15-4** once Sergio picks the tab set. T15-7 (rulebook) can ship any time — it is copy-only and managers are reading wrong rules today.

---

## 5. Out-of-scope notes & corrections

- **Stale BACKLOG labels (start-of-thread check, per CLAUDE.md "Status is derived"):** `feat/playoffs-chocoyo-reskin` (BACKLOG.md:133) and `fix/eliminated-predicate-data-existence` (BACKLOG.md:134–135) both still read "merge HELD" but are verified ancestors of `origin/main` (`git merge-base --is-ancestor` on `a95c765` and `97a36b5`). This thread may not touch BACKLOG.md; flip them in the next docs pass.
- **Memory/census corrections:** NationFilter is **waivers-only** — the "shared NationFilter across lineup+waivers" claim in project memory is stale. There is **no `/games` index route**. A bottom-tab AppShell already ships; T15's "bottom nav first" framing should be read as "fix/finish the shell", not "build one".
- **Verified clean (worth as much as the findings):** FAAB no-reset copy is correct everywhere user-visible on /waivers and /playoffs (only dead class names/comments/tests still say "reset" — F-P3-I2); no per-position-cap copy leaked; sealed bids show only the viewer's own claims; the blade choreography is transform-only, one-shot, reduced-motion-safe (and the champion mobile variant fix is present); the swap flow on /lineup is tap-select with no hover dependency and no drag requirement; every authenticated route mounts the shell; `verify-playoffs-hero.mjs` (12 cases) already proves the hero/blade/champion visuals on desktop+mobile — the walkthrough deliberately does not re-test those.
- **Not findings (locked decisions honored):** /vsfield prior-matchday reveal-gate absence; /pool's no-Realtime polling model; the guillotine/elim color vocabulary itself.
- **Known pre-existing bug re-confirmed:** the `.po-col .po-col-future` selector bleed (playoffs.css:1346) is real but desktop-ladder-only — invisible at phone widths (F-P3-K1). The 1-char child-combinator fix belongs to T15-8 or any contained pass.
- **Methodology note:** cluster K (playoffs) failed twice under schema-forced output in the workflow (structured-output retry cap) and was recovered via a plain-text auditor pass; its findings are fully integrated above. Two cross-surface defects (timezone triple-render, missing boundaries) were caught only by the critic's gap lanes — worth repeating that pattern in future audits.
- **Deliberately unaudited:** API route handlers' logic (only their UI-facing shapes), the worker/cron lanes, desktop-only geometry (except where it is the only implementation, e.g. the vsfield Season table), and anything behind `packages/` engines — those have their own audit lanes (see `audit/AUDIT_2026-06_p0_integrity.md`, `audit/AUDIT_2026-06_p1_ingestion.md`).

---

## 6. Live-walkthrough reconciliation (2026-07-03)

Reconciles the static audit above against the executed live walkthrough (`audit/T15_WALKTHROUGH_RESULTS.md` — two iPhone-Mirroring sessions plus a ~6 pm ET live-match pass, with on-device operator confirmation where noted). §1's tallies remain the static-pass snapshot; this section is the authoritative post-walkthrough delta.

### 6a. Confirmed FAILs (8)

| Step | Surface | Confirms | Live evidence |
|---|---|---|---|
| 6 | 404 | F-P1-ERR1 | `/zzz` → stock white Next.js 404: unbranded, no nav or in-app way back, not dark-scheme-aware |
| 13 | /standings | F-P2-B3 | "PROVISIONAL CUT · … fixed at the group→playoff transition" still renders with R32 knockouts live |
| 27 | /waivers | F-P1-I1 (**escalated**, see 6c) | instant-pickup composer's drop-picker + confirm control sit behind the fixed bottom nav; no amount of scrolling reveals them — the available acquisition flow is effectively unusable at ~390px |
| 38 | /games | F-P2-E3 | in-play match (Argentina–Cape Verde) renders a bare "● Live" pill + score, no running minute or HT state anywhere |
| 39 | /games | F-P1-E1 | drawn knockouts (NED 1–1 MAR, GER 1–1 PAR) render "1–1 · Full-time" with no AET / pens / who-advanced indicator |
| 52 | /settings + /draft | F-P1-I2 | focusing a text input zooms the whole viewport and it STAYS zoomed after blur — and, on /draft, after reload; corroborated on two independent inputs |
| 58 | /games vs /pool vs /lineup | F-P2-TZ1 (+ F-P1-TZ1 family) | same kickoff = "19:00" (UTC, no zone label) on /games vs "3:00 PM ET" on /pool; /lineup alone is correct ("EDT"); re-confirmed live ("22:00" = the 6 pm ET kickoff) |
| 65 | /vsfield | F-P2-K3 | resume-from-background: "● LIVE" pill sat over a ~24-min-stale "Updated" stamp for ~20 s with no reconnecting/delayed cue, then silently self-healed |

### 6b. New finding registered — F-P0-A1

**F-P0-A1 · Bottom-nav taps unreliably registered (primary navigation) — P0, hardware-confirmed.** Walkthrough N1. Any authenticated route, Safari + PWA: taps on the bottom tabs frequently do not register at all (no navigation, no active-highlight move); the operator confirms on real hardware unprompted — bottom icons "highly unresponsive most of the time". Whole-app primary navigation intermittently dead is P0 by definition. Distinct from the tap-target-*size* findings (steps 19/34/64): this is responsiveness/hit-testing. Candidate causes to rule out at fix time: scrim/z-index tap-swallowing (cf. F-P1-I1), misaligned hit areas, blocked handlers. Fix lane: **T15-2** (shell stacking/hit-testing); **T15-CUT** rebuilds the knockout-phase tab set on the same bar and must not regress it.

### 6c. Severity moves

- **Step-27 composer occlusion escalated to P0-grade within F-P1-I1** (ID unchanged): the z-inversion is not cosmetic — it fully blocks the only available acquisition flow's action row behind the nav.
- **P0 demotions — F-P0-B1, F-P0-E1, F-P0-F1 → 360-conditional:** none reproduced at native ~390px (standings PTS column fully visible, right-aligned; all five /games tabs fit with ~14px to spare; /vsfield Season "Power record" table fits cleanly). They remain plausible at a true 360px (SE/mini-class) viewport, which the mirror cannot render — fixes stay planned (T15-1) but lose first-wave urgency.

### 6d. New-finding routing

- **N2 + N6** (raw-email team-name fallback across /waivers, /vsfield, /pool, /playoffs ladder, draft board — PII, MEDIUM) + **N3** ("vs Team 288" raw internal ID in FA fixture copy) + **N4** ("balldontlie" provider string in user-facing score copy) → proposed mini-thread **T15-13 · Identity & copy truth** (display-name fallback chain, unresolved-opponent placeholder mapping, provider-string purge).
- **N5** (draft "Your squad" over-cap position tile styled as satisfied) → folded into **T15-9g** (/draft per-screen pass).
- **Step-64** (/playoffs Board/Ladder toggle tucks under the iOS status-bar tap zone when scrolled) → owned by **T15-CUT** — the unified knockout screen replaces that toggle's placement outright.

### 6e. Still open — no data point captured

- **F-P1-C2 (save-rejection surface):** never exercised — no lineup edit was staged on live production (SaveBar never summoned), so no verdict either way. Still needs-live-verify.
- Micro-state-gated remainders: live lock-flip at a kickoff holding the viewer's player; step 63 eliminated-viewer band (needs a finalized cut); FA-window flip; a penalty-decided knockout; plus the operator on-device queue listed in the walkthrough file.

### 6f. Revised fix-thread order (supersedes §4's suggested wave)

**T15-CUT** (unified knockout re-skin — absorbs T15-4's IA decision + all of T15-8; **IN PROGRESS**, `feat/the-cut-reskin`) → **T15-2** (shell stacking — now also carries F-P0-A1 and the step-27 P0 escalation) → **T15-3** → **T15-1** (demoted, 360-conditional) → **T15-5** → **T15-7**. **T15-6 (time truth) is flagged for promotion** — step 58 is now a live-confirmed FAIL on the most-viewed surfaces. New **T15-13** (identity/copy truth) proposed above; **T15-9g** inherits N5.
