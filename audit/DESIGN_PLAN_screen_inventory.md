# XI — Design Plan & Screen Inventory

**Status:** DRAFT · knowledge-derived, **not yet reconciled against the live repo route tree**
**Scope window:** Execution is Window B (post-2026-07-19). The live app stays byte-untouched and `design/design_reference/` is frozen through the tournament; this document is a *plan and inventory to execute after the final*, not a call to change anything live.
**Lens:** Every screen is assessed twice — as it stands today (WC2026, national teams) and under the locked UCL retarget (Decision b: UEFA Champions League, Swiss model, club identity).

> **Confidence legend:** ✓ grounded (explicitly reconciled in a prior thread) · ~ inferred (consistent across brain files, not repo-verified this pass) · ? hypothesis (needs live/repo confirmation before acting).

---

## 1. Purpose

Two goals, both requested:
1. **Inventory every screen** — one row per route, its job, how it's reached, and whether it earns its place.
2. **Find and resolve redundancy** — the app currently has surfaces whose function overlaps (knockout, standings, player-browsing). Name each overlap and decide the canonical owner *before* the UCL build, so we don't carry the duplication into the retarget.

The output feeds the existing Window-B threads (UCL-4 product surfaces, STORE-1/2/3, T15-10 CSS consolidation) rather than inventing new ones.

---

## 2. Screen inventory

Route set reconciled against the live route tree (see `audit/DESIGN_PLAN_reconciliation.md` §4): **15 `page.tsx`** + 2 non-API `route.ts` handlers. Nav placement is a **dual-surface matrix** — desktop top strip (≥640px, `NAV_ITEMS`) and mobile (<640px: `BOTTOM_TAB_ITEMS` or `MORE_SHEET_ITEMS`) are two independent lists, not one (reconciliation §1). Archetype = the `RouteSkeleton` variant each screen maps to — screens sharing an archetype are the first redundancy candidates.

| Route | Screen | Job | Desktop strip | Mobile bottom | Mobile More | Not-in-nav / other entry | Archetype | Conf. |
|---|---|---|---|---|---|---|---|---|
| `/` | **Dashboard** | League-overview hub; aggregates modules (record, standings, matchday, fixtures, waivers, activity, lock) | YES "Home" | YES "Dashboard" | — | | dashboard | ✓ |
| `/lineup` | **Set lineup** | Pitch, formation picker, roster-fillability, submit XI | YES "Set lineup" | YES "Set lineup" | — | | pitch | ✓ |
| `/vsfield` | **Vs the field** | Field-wide standing; **becomes the Guillotine / "The Cut" bracket in knockout** (phase-aware) | YES → "The Cut" in KO | YES → "The Cut" in KO | — | | cockpit | ✓ |
| `/players` | **Players** | Browse the full player pool; statline; acquire | YES "Players" | YES "Players" | YES (hardcoded "Browse players" fallback — redundant on mobile) | | list | ✓ |
| `/pool` | **Pool (Quiniela)** | Fixture pick'em / predictions | YES "Quiniela" | YES "Quiniela" | — | | list | ✓ |
| `/scoring` | **Scoring** | Rulebook; every value engine-sourced (trust surface) | YES "Scoring" | — | YES | | list | ✓ |
| `/waivers` | **Waivers** | FAAB claims + free-agent browse + NationFilter chip grid | YES "Waivers" | — | YES | | list | ✓ |
| `/draft` | **Draft room** | Draft flow; ships its **own** bespoke nation grid | YES "Draft room" | — | YES | also dashboard CTAs + signed-out marketing card; not phase-gated, persists post-draft | cockpit | ✓ |
| `/settings` | **Settings** | Account / preferences | YES "Settings" | — | YES | nav-only, zero other inbound links | form | ✓ |
| `/standings` | **Standings** | Matchday · Cumulative · Season tabs (3, not 2); all-play-all "power record" | **YES "Standings"** | — | **YES** | nav-only: zero inbound `href` outside the two nav entries | list | ✓ |
| `/playoffs` | **Playoffs (Theater)** | Ceremonial browser presentation post-T15-CUT (Chocoyo hero / blade / champion endgame) over the full server pipeline (`loadPlayoffs`/`buildPlayoffsView`) — **not logic-free** | **YES → "Theater" in KO** | — | **YES** | plus deep links: vsfield KO marquee, dashboard banner/modules | board | ✓ |
| `/commish` | **Commissioner console** | Commissioner-only admin/writes | CONDITIONAL (`isCommissioner`) | — (never, by design) | CONDITIONAL | non-commissioner → `/auth/denied` | list | ✓ |
| `/games/[matchId]` | **Game detail** | Box score, events timeline, lineups | — | — | — | deep-link only (dashboard / vsfield / pool fixtures) — no index route, out of nav by design | pitch | ✓ |
| `/` (out) | **Marketing landing** | Signed-out marketing page + anchor nav | n/a | n/a | n/a | public `/`; anchor nav `display:none` ≤860px, no hamburger replacement | — | ✓ |
| `/sign-in` | **Sign in** | Magic-link request | — | — | — | shell-free; reached via no-session redirects + `/auth/denied` | form | ✓ |
| `/auth/denied` | **Auth denied** | Non-allowlisted / non-ok gate landing | — | — | — | shell-free; reached from all 3 auth/callback failure redirects, every gated page's non-ok redirect, landing Denied state link | — | ✓ |
| `/auth/callback` | **Auth callback** | Allowlist gate (signs out non-allowlisted) | — | — | — | Redirect handler | — | ✓ |
| `/auth/sign-out` | **Sign out** | POST handler (not a rendered screen) | — | — | — | Form action | — | ✓ |

**Count:** 13 authenticated routes (12 rendered + the `/games` detail) · **5** auth/marketing surfaces (`/`, `/sign-in`, `/auth/denied`, `/auth/callback`, `/auth/sign-out`) — `/auth/denied` was previously undercounted (reconciliation §4.2).

---

## 3. Redundancy & efficiency findings

Adjudicated against repo truth — see `audit/DESIGN_PLAN_reconciliation.md` §3 for full evidence and `file:line` citations. Verdict tags: CONFIRMED (holds as stated) · CORRECTED (holds with a factual amendment) · REFUTED (premise false).

### R1 — Two knockout surfaces: `/vsfield` (The Cut) vs `/playoffs` (Theater) — largely REFUTED
- **CONFIRMED** — `/vsfield` is THE knockout ladder (reconciliation §3 R1: `loadVsField` imports `buildPlayoffsView`, gates on `knockoutPhaseActive`).
- **CORRECTED** — "ceremonial" describes only the browser presentation layer, not an absence of logic.
- **REFUTED** — "no logic": the route runs the full server pipeline (`loadPlayoffs`/`buildPlayoffsView`) plus a live Realtime controller and a first-open ceremony latch.
- **REFUTED** — "not in nav": present in both the desktop strip and the More sheet, relabeled "Theater" in KO.
- **REFUTED** — "entry point unclear": reachable via nav on both viewports plus contextual CTAs (vsfield KO marquee, dashboard banner/modules).
- The dashboard also independently reads `loadPlayoffs` for its own bracket mirror — the fold-vs-keep decision is still real, but the "unreachable route" urgency is gone.
**Open decision (unchanged in kind, sharpened in §6):** fold the champion-endgame choreography into `/vsfield`'s final state and retire `/playoffs`, or keep Theater as a deliberate destination.

### R2 — "Where do I stand" split across `/standings`, `/vsfield`, dashboard module — split CONFIRMED/REFUTED; computation is centralized
- **CONFIRMED** — three display surfaces exist and answer the "where do I stand" question.
- **REFUTED** — "`/standings` isn't in nav": it's in both the desktop strip and the More sheet (nav-only otherwise — zero content-page inbound links).
- **REFUTED** — "reached via a dashboard module": the dashboard's StandingsModule links to `/vsfield`, not `/standings`.
- **CONFIRMED** — single ranking engine: pure `computeStandings` → sole writer `recomputeStanding` → one persisted `standing` table. Consumers differ only in read path (`/standings` recomputes on the fly from the same pure helper; `/vsfield` reads the persisted table; the dashboard re-sorts a precomputed rank) — no forked math.
- **Nuance:** `/standings` has three tabs (Matchday · Cumulative · Season), not two; `/vsfield`'s primary rail answers "live now" with season standing on a secondary tab, so the three surfaces aren't identical at default state.
**Open decision (unchanged in kind, sharpened in §6):** pick ONE canonical standings surface for the UCL league phase.

### R3 — Player browsing overlaps: `/players` vs `/waivers` — CONFIRMED on 3 of 4 sub-claims
- **CONFIRMED** — waivers runs an independent FA list; `/players` inlines its own copy of the live-owned predicate (not exported from `@app/faab`) — parallel logic, zero shared list-layer code.
- **CONFIRMED** — the shared card is waivers-owned (`FaPlayerCardSheet`) and `/players` imports it — the one cross-module dependency.
- **CONFIRMED** — the MoreSheet "Browse players" fallback still exists (hardcoded, not sourced from `MORE_SHEET_ITEMS`) and is redundant now that Players is a first-class bottom tab.
- **CORRECTED** — NationFilter is not waivers-owned; it's a shared component (`apps/web/components/NationFilter.tsx`) consumed by three surfaces: players, waivers `BidComposer`, waivers `FreeAgentPanel`.
**Open decision (unchanged in kind):** `/players` owns browsing; `/waivers` owns the claim/bid action and composes rather than parallels the browse list; drop the MoreSheet fallback.

### R4 — Duplicated identity UI: `<Flag>` / NationFilter vs draft's bespoke nation grid — grid duplication CONFIRMED; `<Flag>` sub-claim REFUTED
- **CONFIRMED** — draft's nation grid is bespoke (local state, never imports `NationFilter`), even though `NationFilter` was originally extracted *from* the draft pool for reuse elsewhere — draft itself was never migrated onto its own extraction.
- **REFUTED** — "`<Flag>`/flag.ts not reused by draft": draft owns the `<Flag>` component and consumes it directly.
- **CORRECTED** — the real split is primitive-vs-component: `flag.ts` (toIso2/flagEmoji/isHomeNation) is broadly reused (~12 importers); the `<Flag>` component is reused by NationFilter, but `PlayerAvatar` re-implements the home-nation SVG markup rather than importing the component — one duplication, not the one originally named.
- **NEW (a11y, P2):** draft's bespoke grid uses non-semantic `<span onClick>` for its toggle and chips (not focusable/keyboard-operable), while the shared `NationFilter` uses real `<button>` elements. The un-migrated copy is also the less accessible one.
**Open decision (sharpened in §6):** the UCL club-identity rebuild remains the forcing function for a single `ClubFilter` + crest resolver pass — now scoped to include the `<span onClick>` a11y fix and the `PlayerAvatar` SVG-vs-`<Flag>` dedup.

### R5 — "`/standings` and `/playoffs` absent from both nav surfaces" — REFUTED on both viewports
Both routes are in the desktop strip and the More sheet on both viewports; neither is reachable from zero surfaces. The kernel of truth: both are absent from the 5 *primary* mobile bottom tabs — a documented depth choice (one tap deeper via More), not an absence. No route in the app is single-viewport-only, and no dashboard module is CSS-hidden at any width.
**Reframed open decision (§6):** this is a bottom-bar-depth question (should Standings/Playoffs promote to a primary mobile tab), not a reachability-repair question.

---

## 4. Navigation IA assessment

- The mobile bottom bar is at **6 slots** (Dashboard · Set lineup · Vs the field · **Quiniela · Players** · More) — the practical ceiling; tap reliability was already strained at the 5→6 transition (F-P0-A1, now closed). Adding UCL surfaces (Swiss table, two-legged bracket) **without removing something** risks overload. (Order corrected per reconciliation §4.6 — Players is 5th, after Pool/"Quiniela".)
- **Keep:** no separate bracket tab — `/vsfield` stays the phase-aware surface (locked decision). The 640px chrome swap (top strip ↔ bottom bar) and the distinct 760px vsfield internal layout stay as-is.
- **Re-derive, don't extend:** the nav was built for the WC group→knockout model. The UCL competition model changes the standings shape and the knockout metaphor, so the IA should be re-derived against the UCL model in the UCL-4 thread, not patched surface-by-surface. Resolving R1–R3 is a precondition — consolidate the redundant surfaces *first*, then decide final nav placement.

---

## 5. Design plan — what we need to do

Sequenced; ties to the existing Window-B threads. Sergio makes the sequencing/authorization calls — this is the proposal.

1. **Reconcile this inventory against repo truth (REQUIRED FIRST).** Derive the actual `app/` route tree, confirm each screen's real entry points, and confirm/refute R1–R5. Nothing below acts on a knowledge-derived claim until this lands. *(Code, read-only, docs-only.)*
2. **Resolve the design-gating DEC-0 decisions** (membership model → onboarding shape; pool-tie semantics → two-legged UI; crest/kit **licensing posture** → club identity). These block screens 3, 6, and parts of 5. *(Chat/Sergio.)*
3. **UCL club-identity visual system** (F-D08) — the design long pole; grounded in a locked decision, no DEC-0 gate for the visual exploration. *(Claude Design → UCL-4.)*
4. **Consolidate the redundant surfaces** per R1–R5 — a design decision per finding (canonical owner), then implement in UCL-4 / T15-10.
5. **Swiss-table standings + two-legged knockout surfaces** — the new core competitive visuals (resolves R1/R2 for UCL). Partially DEC-0-dependent; design the format-locked parts, flag the tie-semantics forks. *(Claude Design → UCL-4.)*
6. **Multi-league onboarding** — create / invite / join / league-switcher (new screens; none exist today). Membership-model-dependent → gated on the DEC-0 call in step 2. *(Claude Design → MT-1/UCL-4.)*
7. **Store presence + reviewer path** — screenshots, app-preview, icon, the reviewer-reachable demo path (F-B01), privacy/ToS pages. *(Claude Design + STORE-1.)*
8. **Rebrand / copy sweep** (F-D12: "World Cup 2026" + "three matchdays" baked into copy) — sequence **after** T15-10 CSS consolidation, which is ordered before UCL-4's branding sweep.

---

## 6. Open decisions that gate the design (DEC-0)

Reachability is no longer at stake for any of these (§3, reconciliation §3/§5) — all four are now pure product/design calls on confirmed facts:

- **Theater fold-vs-keep (R1):** either (a) fold the champion-endgame choreography into `/vsfield`'s final state and retire `/playoffs`, or (b) keep Theater as a deliberate ceremonial destination it already reliably reaches (nav + contextual CTAs on both viewports). Not an "unreachable route" rescue — a choreography/ownership call.
- **Canonical standings owner (R2):** the three surfaces already share one computation engine (`computeStandings`) — the open call is which surface is *the* canonical display for the UCL league phase (`/standings`'s 3-tab list, `/vsfield`'s live-now rail, or the dashboard module), with the other two linking to it rather than reimplementing.
- **Mobile bottom-bar depth for Standings/Playoffs (R5, reframed):** both are already reachable via desktop strip + mobile More sheet on every viewport — the live question is whether either promotes to one of the 5 *primary* bottom tabs for the UCL retarget, not whether either is reachable at all.
- **R3/R4 cleanups:** (R3) drop the MoreSheet's redundant hardcoded "Browse players" link, and decide whether `/waivers` composes the `/players` browse list instead of maintaining its own; (R4) the UCL club-identity pass (F-D08) is confirmed as the forcing function to consolidate draft's bespoke nation grid onto shared `NationFilter`/`<Flag>` — scope now includes the `<span onClick>` a11y fix and the `PlayerAvatar` SVG-vs-`<Flag>` markup dedup.
- **Membership model** (join-table vs `manager.user_id`; per-league vs global commissioner) → shapes onboarding screens (step 6).
- **Pool-tie semantics** (per-leg 1X2 vs aggregate advancer; round = leg or tie) → shapes the two-legged UI (step 5).
- **Crest/kit licensing posture** (INV-10) → whether club identity uses licensed marks or a neutral system; the visual system (step 3) is designed to accept real assets either way, but the sourcing decision is Sergio's.

---

## 7. Confidence & next verification

**See `audit/DESIGN_PLAN_reconciliation.md`** for the full repo-truth reconciliation (7 adversarially-verified read-only lanes, every claim carrying `file:line` evidence) and its §5 verification-integrity appendix — this document's §2/§3/§6 above are now folded in from that reconciliation rather than standing as unverified hypotheses.

This document was originally derived from `PROJECT.md`, `DECISIONS.md`, `ARCHITECTURE.md`, the two audit files, and the nav/latency notes — not from a live repo pass. That gap is now closed: §2's nav matrix, §3's R1–R5 verdicts, and §6's sharpened decisions all reflect the reconciliation above. Remaining unactioned items are the DEC-0 design/product calls themselves (Sergio's), not further fact-finding.
