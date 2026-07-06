# DEC-0 Decision-Dependency Map

**Date:** 2026-07-06 · Companion to `DESIGN_NOTES.md`. Decision-first discipline: every product call below is an **input Sergio/Chat makes in DEC-0** — this pass branch-specs both sides and picks none. Threads are §5 of `audit/AUDIT_LAUNCH_readiness.md` (as sequenced into Window B by `audit/SEQUENCE_T15_LAUNCH.md`).

## The decisions (from SEQUENCE "Decisions Sergio must make" + audit INV-10)

| ID | Decision | Options on the table | What it gates (leverage) |
|---|---|---|---|
| **D-DB** | One shared DB vs DB-per-league (+ sub-choice: competition model = match junction vs competition-scoped shared periods w/ `league_period` overlay) | shared+junction / per-league-DB / shared-periods | **Whether F-C01 needs a migration at all.** Per-league-DB ⇒ all 56 junction rewires evaporate (at ×N ops cost, no cross-league surfaces, new session→DB routing problem). Highest-leverage schema call. Gates MT-2's core. |
| **D-ROUND** | Guillotine "round" = leg or tie (two-legged rounds) | per-leg cut (~9 cut moments) / per-tie cut (5, matching WC cadence) | **Highest-leverage UCL-2 call**: decides tie-period shape admissibility (Shape A only valid under tie) and blocks UCL-2 steps 5–8, 10(KO), 11. Also re-parameterizes the cut schedule/min-field math. |
| **D-FEED** | UCL feed provider + pricing (INV-1; `/ucl/v1` exists, pricing + schema diff open) | balldontlie UCL tier / ALL-ACCESS $499.99/mo / alternative provider | The long pole. Gates UCL-1 (edition schema data source), UCL-3 (adapter), and the value-leaves (not seams) of UCL-2 steps 3/4/9/10. Stage-text vocabulary, leg identification, Swiss-standings endpoint, per-player rating parity. |
| **D-MEM** | Membership model | join table vs `manager.user_id` | MT-1 core (F-C03/C08/C02/C05); transitively MT-2, STORE-2. |
| **D-COMM** | Commissioner model | per-league role vs global super-commissioner | MT-1 (F-C04/C06/C07); the one RLS follow-on (commish_audit policy re-scope). |
| **D-POOLTIE** | Pool two-legged-tie semantics | per-leg 1X2 (leg1 1X2 + leg2 advancer) vs single per-tie advancer pick | UCL-2 step 11 / UCL-4 pool surface (F-D06). Influences `tie_id` linkage shape (which is built shape-independently regardless). |
| **D-WRAP** | Wrapper technology | Capacitor (recommended in audit) / TWA / none-yet | STORE-2 only (+ INV-8/9 spikes). No schema impact. |
| **D-FAAB** | FAAB replenishment over a ~10-month season | none (WC model) / periodic top-up / per-phase reset | Product/config call inside UCL-2/UCL-4; **not structural** — no schema fork found in this pass (budget lives on manager/league config; copy already flagged). Decide before UCL provisioning config is written. |

## Per-thread gating (build-ready NOW vs decision-blocked)

| §5 thread | Gated on (decisions) | Non-decision gates | Verdict |
|---|---|---|---|
| **0 DEC-0** | — (it IS the decisions) | INV-1 feed facts to price D-FEED | **Convene now** — D-DB and D-ROUND are the two structural pins; D-FEED is the calendar long pole |
| **1 HARD-1** | **none** | Sergio's match-free-window deploy authorization | **BUILD-READY NOW** — the L3 slice (F-A02+A03-info+A04, one worker redeploy, no SDK, no schema) |
| **2 STORE-1** | none | — (parallelizable per audit) | **BUILD-READY NOW** — F-B07/B08/B11–B13/B15 |
| **3 MT-1** | **D-MEM + D-COMM** | — | **DECISION-BLOCKED** (both calls are cheap to make — no investigation open) |
| **4 MT-2** | **D-DB** (junction exists at all) + competition-model sub-choice; row-35/M8 league-context leaves want MT-1 | MT-1 first (identity/session-league) | **DECISION-BLOCKED**, but the junction spec (L4, V45-corrected) is implementation-complete the day D-DB lands shared+junction; per-league worker loops (F-C11) are junction-independent and only need MT-1 |
| **5 UCL-1** | **D-FEED** (edition/club data source) | — | **DECISION-BLOCKED** (schema shapes can be pre-specced; this pass only touched its Swiss-table corner via L5 §2) |
| **6 UCL-2** | **D-ROUND** (steps 5–8, 10-KO, 11) · **D-FEED** (value-leaves of 3/4/9/10) · **D-POOLTIE** (step 11) | UCL-1 for the Swiss table's edition key | **SPLIT — 4 steps BUILD-READY NOW** (F-D15 rename; self-heal re-scope; label seam w/ WC-parity config; eliminated/FAAB copy) — all four have zero DEC-0 exposure, and the first two de-risk the LIVE WC deployment. Everything else decision-blocked |
| **7 UCL-3** | **D-FEED** (contract signed) | — | **DECISION-BLOCKED** |
| **8 UCL-4** | **D-POOLTIE** (pool surface) + upstream UCL-1/UCL-2 | Claude Design assets (crest/kit) | **DECISION-BLOCKED** (crest/kit licensing posture is also an INV-10 item) |
| **9 HARD-2** | none | interleave; before open signup | **BUILD-READY** (anytime; absorbs F-A01/A09/A16 + L3's 8 deferred items) |
| **10 STORE-2** | **D-WRAP** (+D-MEM via MT-1) | STORE-1 + INV-8/9 spikes | **DECISION-BLOCKED** |
| **11 STORE-3** | — | STORE-2 | Sequenced last |

## Build-ready-NOW work list (zero DEC-0 exposure, in recommended order)

1. **HARD-1 slice** (thread 1; L3 §RECOMMENDED SLICE, V3-corrected) — sole gate is the deploy-window authorization. Protects the live WC league immediately.
2. **UCL-2 step 2 — lock self-heal re-scope** (`lineup_slot.lock_source_match_id` + trigger predicate) — required under every tie shape AND closes the open live WC edge case (F-D11/p0:F-P2-06). Migration-class ⇒ hold-for-Sergio applies; timing: idle window post-2026-07-19.
3. **UCL-2 step 1 — F-D15 enum rename** (~38 files, ~15 hand-edits, 1 enum migration) — idle-window execution; **must precede MT-2 W1** (V45 hard ordering constraint: shared-file churn in ingest/recompute prismaStores).
4. **UCL-2 step 3 — label-derivation seam** (vocabulary-injected `derivePeriodLabel`, fail-loud unmapped, kills F-D17) with WC vocabulary as parity config #1; UCL alias values remain a D-FEED leaf.
5. **UCL-2 step 10-copy + the V2 literal sweep** — competition-neutral eliminated/FAAB copy + the 6 verifier-found branding sites (webmanifest, layout metadata, AuthChrome, vsfield `knockoutRoundName` dedup, CommishConsole label, dashboard/playoffs/vsfield copy class). Folds into the F-D12 branding pass.
6. **STORE-1** (thread 2) and **HARD-2** (thread 9) — parallel lanes whenever capacity exists.

## Decision-leverage ranking (what to decide first and why)

1. **D-DB** — flips MT-2 between "deepest migration of the program" and "no migration"; every day of junction work before this call is at risk. Decide first. (INV-11's single-league prod check already de-risked the shared-DB singleton status quo.)
2. **D-ROUND** — unblocks the entire UCL-2 middle (steps 5–8) and settles which shape's schema delta ships; interacts with D-POOLTIE (a per-tie pool reads naturally beside a per-tie cut).
3. **D-FEED** — the calendar long pole (external vendor); start now per the audit's own "start DEC-0 today", but note the seams (label vocabulary, tie linkage, Swiss ingest) are built decision-independent — only alias values/endpoints wait.
4. **D-MEM + D-COMM** — cheap to decide, unblock all of MT-1 (the critical path's first migration thread).
5. **D-POOLTIE, D-WRAP, D-FAAB** — leaf decisions; decide before their threads mobilize (UCL-4, STORE-2, UCL provisioning respectively).

**Net:** with D-DB + D-ROUND + D-MEM/D-COMM decided, threads 3→4→6 (the critical path) are fully unblocked regardless of D-FEED; D-FEED then only throttles UCL-1/UCL-3 and the final wiring of UCL-2's seams.
