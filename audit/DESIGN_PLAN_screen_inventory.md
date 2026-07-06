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

Route set derived from the nav-latency route reconciliation (11 `loading.tsx` routes + `/` + `/games/[matchId]`, cross-checked against `crossNav.ts`). Archetype = the `RouteSkeleton` variant each screen maps to — screens sharing an archetype are the first redundancy candidates.

| Route | Screen | Job | Nav placement | Archetype | Conf. |
|---|---|---|---|---|---|
| `/` | **Dashboard** | League-overview hub; aggregates modules (record, standings, matchday, fixtures, waivers, activity, lock) | Bottom bar (Dashboard) + desktop strip | dashboard | ✓ |
| `/lineup` | **Set lineup** | Pitch, formation picker, roster-fillability, submit XI | Bottom bar (Set lineup) | pitch | ✓ |
| `/vsfield` | **Vs the field** | Field-wide standing; **becomes the Guillotine / "The Cut" bracket in knockout** (phase-aware) | Bottom bar (Vs the field) | cockpit | ✓ |
| `/players` | **Players** | Browse the full player pool; statline; acquire | Bottom bar (Players) — promoted to first-class tab | list | ✓ |
| `/pool` | **Pool (Quiniela)** | Fixture pick'em / predictions | Bottom bar (Pool) | list | ✓ |
| `/scoring` | **Scoring** | Rulebook; every value engine-sourced (trust surface) | More sheet | list | ✓ |
| `/waivers` | **Waivers** | FAAB claims + free-agent browse + NationFilter chip grid | More sheet | list | ✓ |
| `/draft` | **Draft room** | Draft flow; ships its **own** bespoke nation grid | More sheet (Draft room) | cockpit | ~ |
| `/settings` | **Settings** | Account / preferences | More sheet | form | ~ |
| `/standings` | **Standings** | Matchday + Cumulative tabs; all-play-all "power record" | **Not in either nav** — reached via a dashboard module | list | ? |
| `/playoffs` | **Playoffs (Theater)** | Ceremonial only post-T15-CUT (Chocoyo hero / blade / champion endgame); **no logic** | **Not in nav** — entry point unclear after demotion | board | ? |
| `/commish` | **Commissioner console** | Commissioner-only admin/writes | Gated; not a public nav slot | list | ~ |
| `/games/[matchId]` | **Game detail** | Box score, events timeline, lineups | Deep-link only (dashboard / vsfield / pool fixtures) — **no index route, out of nav by design** | — | ✓ |
| `/` (out) | **Marketing landing** | Signed-out marketing page + anchor nav | Public `/` | — | ✓ |
| `/sign-in` | **Sign in** | Magic-link request | Public | form | ✓ |
| `/auth/callback` | **Auth callback** | Allowlist gate (signs out non-allowlisted) | Redirect handler | — | ✓ |
| `/auth/sign-out` | **Sign out** | POST handler (not a rendered screen) | Form action | — | ✓ |

**Count:** 13 authenticated routes (12 rendered + the `/games` detail) · 4 auth/marketing surfaces.

---

## 3. Redundancy & efficiency findings

Ranked by impact. Each is a **hypothesis to confirm against repo truth** before acting.

### R1 — Two knockout surfaces: `/vsfield` (The Cut) vs `/playoffs` (Theater) — HIGH
T15-CUT locked `/vsfield` as THE knockout ladder ("one ladder, two sections"); `/playoffs` was demoted to a ceremonial Theater with no logic and is **not in the nav**. That's a whole route whose competitive function was absorbed. Under UCL this sharpens: the Swiss league phase + two-legged playoffs have **no single-elimination "guillotine" moment** (F-D16/F-D23 eliminated-flag semantics are WC-specific), so the blade/guillotine metaphor itself needs rethinking, not just porting.
**Recommendation:** Decide explicitly — either (a) fold the champion-endgame choreography into `/vsfield`'s final state and **retire `/playoffs`**, or (b) keep it as a deliberate ceremonial destination and **give it a real entry point**. Do not let it persist as an unreachable route.

### R2 — "Where do I stand" is split across three places: `/standings`, `/vsfield`, dashboard module — HIGH
All three answer the same question. `/standings` (Matchday + Cumulative, all-play-all record) isn't in the nav; `/vsfield` shows the live field; the dashboard has a standings module. Under UCL the **Swiss single-table league phase makes the standings table the central competitive object** — so this can't stay ambiguously owned.
**Recommendation:** Pick ONE canonical standings surface for the UCL league phase. The others link to it; none reimplement it.

### R3 — Player browsing overlaps: `/players` vs `/waivers` — MEDIUM
`/players` owns browsing (statline, shared card); `/waivers` maintains its **own** free-agent list + NationFilter; `/players` already imports the shared card from `/waivers`. The MoreSheet also keeps a redundant "Browse players" entry now that Players is a primary tab.
**Recommendation:** `/players` owns browsing; `/waivers` owns the claim/bid *action* and composes the `/players` browse rather than running a parallel list. Drop the MoreSheet "Browse players" fallback.

### R4 — Duplicated identity UI: `<Flag>` / NationFilter vs draft's bespoke nation grid — MEDIUM (and a UCL forcing function)
Draft ships its own nation grid instead of reusing `NationFilter` (pre-existing duplication). The single `<Flag>`/`flag.ts` choke point is reused by `PlayerAvatar` and `NationFilter` but not by draft.
**Recommendation:** The UCL club-identity rebuild (F-D08 crest/kit system) is the forcing function — consolidate onto ONE `ClubFilter` + crest resolver consumed by waivers, draft, players, and PlayerAvatar in a single pass.

### R5 — Reachability gaps (adjacent to redundancy): `/standings` and `/playoffs` are full routes absent from both nav surfaces — MEDIUM
A route reachable from neither nav is either under-exposed or dead weight. Combined with F-P3-B2 (dashboard drops ~half its design-reference modules in group phase), the dashboard→sub-screen link map is unaudited.
**Recommendation:** For every non-nav route, make an explicit call: **promote to nav**, **keep as a clearly-linked contextual destination**, or **retire**.

---

## 4. Navigation IA assessment

- The mobile bottom bar is at **6 slots** (Dashboard · Set lineup · Vs the field · Players · Pool · More) — the practical ceiling; tap reliability was already strained at the 5→6 transition (F-P0-A1, now closed). Adding UCL surfaces (Swiss table, two-legged bracket) **without removing something** risks overload.
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

- **Membership model** (join-table vs `manager.user_id`; per-league vs global commissioner) → shapes onboarding screens (step 6).
- **Pool-tie semantics** (per-leg 1X2 vs aggregate advancer; round = leg or tie) → shapes the two-legged UI (step 5).
- **Crest/kit licensing posture** (INV-10) → whether club identity uses licensed marks or a neutral system; the visual system (step 3) is designed to accept real assets either way, but the sourcing decision is Sergio's.
- **Which non-nav routes survive** (R1, R5) → `/playoffs` keep-vs-retire; `/standings` canonical-vs-absorbed.

---

## 7. Confidence & next verification

This document is derived from `PROJECT.md`, `DECISIONS.md`, `ARCHITECTURE.md`, the two audit files, and the nav/latency notes — **not** from a live repo pass. Before any of §5 is actioned, the inventory needs a repo-truth reconciliation (the handoff below). Treat §2's `?`/`~` rows and all of §3 as hypotheses until then.
