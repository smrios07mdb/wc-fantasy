# SEQUENCE — T15 remainder + Launch readiness (two-window plan)

**Adopted:** 2026-07-04 (Chat sequencing thread; Sergio has final call on every gate)
**Scope:** sequences `audit/AUDIT_T15_mobile_ux.md` (115 findings + walkthrough reconciliation §6) and `audit/AUDIT_LAUNCH_readiness.md` (98 findings, §5 11-thread proposal) into two windows around the live WC2026 tournament (R16 began 2026-07-04; ends ~2026-07-19).
**Governing axis:** value half-life vs blast radius — T15's value expires 2026-07-19 and is mostly visual-only; launch work is durable but migration-heavy and gated on DEC-0. Nothing migration-class touches the live app during the knockout window.
**Maintenance:** flip `Status` as threads land; this file is tracking only — PROJECT.md / DECISIONS.md / BACKLOG.md remain the brain. Re-upload to Project knowledge after each merge, same as the brain files.

---

## Derived-status corrections baked into this plan (2026-07-04)

- T15-CUT is **DONE/MERGED** (2026-07-03) — audit §6f's "IN PROGRESS" label is stale.
- T15-2's scope **grew post-audit**: PLAYERS-TAB (merged 2026-07-04) took the mobile bottom bar to 6 slots (5 tabs + More); T15-2 now owns the tighter spacing + the F-P0-A1 tap-reliability fix + the step-27 P0 escalation.
- Launch INV-1 (UCL feed) is **RESOLVED** (balldontlie `/ucl/v1` exists). Residuals: pricing (Sergio, in DEC-0) + `/ucl/v1`-vs-WC schema diff (folds into UCL-1/UCL-3).
- F-P0-B1/E1/F1 **demoted to 360-conditional** (§6c); T15-6 **promoted** (step-58 live-confirmed FAIL).

## Derived-status corrections (2026-07-05)

- **F-P0-A1 CLOSED** (Sergio's live on-device pass, verdict A) — the tap-reliability finding that drove A1/T15-2 is resolved; no residual dead-tap case survives the T15-2 + NAV-LAT fix set.
- **A1 (T15-2) DONE/MERGED** (2026-07-04, `1a8c36d`) — the `TODO` / `FIRST THREAD` label in the Window-A table is stale.
- **NAV-LAT DONE/MERGED+DEPLOYED** (2026-07-04) — the route `loading.tsx` skeleton layer shipped.
- **NAV-LINK DONE/MERGED+DEPLOYED** (2026-07-05, `feat/nav-link-conversion` → `main@909cecf`) — the `<Link>`+`prefetch={false}` conversion (§5 recommendation); merged after Sergio's on-device gate PASSED. Not a Window-A blocker.
- **Remaining Window A order UNCHANGED:** T15-3 → T15-1 → T15-5 → T15-7, with **T15-6 promoted** and T15-13 still `PROPOSED` (gated on Sergio accepting the thread).

## Model & effort rubric (for every Code prompt)

| Class of work | Model | Effort |
|---|---|---|
| Diagnosis-heavy, global-chrome, worker-adjacent, or migration/resolver-class | **Fable 5** | high (max for schema-core migrations MT-1/2, UCL-1/2) |
| Standard implementation with contracts to respect (loader threading, engine-sourced copy, review-class) | **Opus 4.8** | medium–high |
| Contained, mechanical, attribute/copy/boilerplate passes | **Sonnet 5** | low–medium |
| Subagents / dynamic workflow | **Opus only**, narrow scope + hard output caps — **never Sonnet subagents** (locked process decision, DECISIONS 2026-07-03 `[[no-sonnet-subagents]]`) | — |

---

## Window A — NOW → ~2026-07-19 (app LIVE mid-knockout)

| # | Thread | Scope (IDs) | Class / kind | Model / effort | Status |
|---|---|---|---|---|---|
| A1 | **T15-2 — shell stacking, z-scale, safe-areas + tap reliability** | F-P0-A1 (diagnose first), F-P1-I1 incl. step-27 P0, F-P1-C1, F-P2-I6/I7, F-P2-PSC1, F-P2-A4+F-P3-A1, F-P3-A2, F-P3-G3, 6-slot bar spacing | clearance · implementation (HOLD) | **Fable 5 / high** | `TODO` — **FIRST THREAD** |
| A2 | **DEC-0 — launch decisions + investigations** | Tier-0 decisions (membership, commissioner, wrapper, pool ties, one-DB, UCL pricing) + INV-2..11 | contained · **decision (Chat/Sergio)**, no code | Chat (Fable 5 / medium) | `TODO` — runs in parallel with A1 |
| A3 | **T15-3 — keyboards & form attributes** | F-P1-I2 (16px floor), F-P1-G1 (FREEZE/CUT autocap), inputmode/enterkeyhint sweep, F-P3-H1/H2 | contained · implementation (delegable + manual FREEZE check) | Sonnet 5 / medium | `TODO` |
| A4 | **T15-6 — time truth** (promoted) | F-P1-TZ1, F-P2-TZ1/TZ2/TZ3, F-P2-G4, F-P3-TZ1 (shared formatter) | clearance · implementation (contract-touching, HOLD) | Opus 4.8 / medium | `TODO` |
| A5 | **T15-5 — error/404/loading boundaries** | F-P1-ERR1/ERR2, F-P2-ERR1 | contained · implementation (additive files only, delegable) | Sonnet 5 / low–medium | `TODO` |
| A6 | **T15-7 — rulebook truth (/scoring)** | F-P1-J1/J2/J3 — every value sourced from `packages/scoring`; consider generating tables from engine constants | clearance · implementation (copy-only, trust surface, HOLD) | Opus 4.8 / high | `TODO` |
| A7 | **HARD-1 — observability core** (launch, interleaved) | F-A01/A02/A03/A04, F-A09/A16; additive-only slice (F-A05 optional, Sergio's call) | clearance · implementation (review, worker hot-path adjacency; **match-free deploy window**) | Fable 5 / high | `TODO` — gated-on: Sergio's mid-tournament authorization |
| A8 | **T15-13 — identity & copy truth** | N2/N6 raw-email PII fallback, N3 "vs Team 288", N4 provider string | contained · **gated-on: Sergio accepting the thread** | Sonnet 5 / medium | `PROPOSED` |
| A9 | **T15-1 — 360-conditional P0 hotfixes** (demoted) | F-P0-B1+F-P1-B1, F-P0-E1, F-P0-F1, F-P2-G2 | contained · implementation (delegable, if calendar permits) | Sonnet 5 / medium | `TODO` |
| A10 | **T15-9 — per-screen passes, delegable subsets (9d–9i)** | per audit §4 row T15-9; HOLD subsets 9a/9b/9c only if a live gap forces them | contained · implementation | Opus 4.8 / medium per sub-thread | `TODO` |

**Operator steps this week (Sergio, no code):** PUSH-KEYS (VAPID on both services + web rebuild) · INV-4 (heartbeat/attention env vars actually set — else the existing dead-man switch is inert) · INV-11 (stray second `league` row check) · AUTOFIRE_CUTS_ENABLED live verification.

**Explicitly excluded from Window A:** MT-1/2, UCL-1..4 (migration-class, gated-on DEC-0, zero present value, max live blast radius) · STORE-1/2/3 · HARD-2 · T15-10 (wide-radius CSS regression risk mid-live) · T15-11 (L) · T15-12 · F-P3-A3 top-chrome mini-decision.

---

## Window B — POST-2026-07-19 (tournament over)

| # | Thread | Class / kind | Gated on | Model / effort | Status |
|---|---|---|---|---|---|
| B1 | **STORE-1 — compliance artifacts** (F-B07/B08/B11–B13/B15) | clearance (review — deletion touches auth) · implementation | — (parallelizable; start with B2) | Opus 4.8 / medium | `TODO` |
| B2 | **MT-1 — tenant identity core** (F-C02/C03/C04/C05/C06/C07/C08/C13/C14/C19) | clearance (**migration**, Sergio) · implementation | DEC-0 (membership + commissioner) | **Fable 5 / max** | `GATED` |
| B3 | **MT-2 — tenant runtime** (F-C01/C09/C10/C11/C12/C18, F-A06, F-A08/C16) | clearance (**migration**) · implementation | MT-1 + DEC-0 (competition model) | **Fable 5 / max** | `GATED` |
| B4 | **UCL-1 — competition schema** (F-D01/D02/D07/D14/D19/D20/D22, F-C17) | clearance (**migration**) · implementation | DEC-0 (feed/pricing) | **Fable 5 / max** | `GATED` |
| B5 | **UCL-2 — format machine** (F-D03/D04/D05/D10/D11/D15/D16/D17/D23) | clearance (**migration**) · implementation | UCL-1 + DEC-0 (pool-tie / round=leg-or-tie) | **Fable 5 / max** | `GATED` |
| B6 | **UCL-3 — feed adapter** (F-D09, F-A13/A14) | clearance (review) · implementation | DEC-0 (feed contract signed) | Opus 4.8 / high | `GATED` |
| B7 | **UCL-4 — product surfaces** (F-D06/D08/D12/D18/D19/D24/D25) | clearance (review/design) · implementation (+ Claude Design) | UCL-1 + UCL-2 | Opus 4.8 / medium | `GATED` |
| B8 | **HARD-2 — public-load hardening** (F-A07/A12/A15–A21/A29/A30/A31) | clearance (review) · implementation | before open signup (interleave) | Opus 4.8 / high | `TODO` |
| B9 | **STORE-2 — wrapper + native push** (F-B01/B02/B03/B19, F-A22–A25, F-B04/B05, F-A08) | clearance (review, L) · implementation | STORE-1 + MT-1 + DEC-0 wrapper + INV-8/9 spikes | Fable 5 / high | `GATED` |
| B10 | **STORE-3 — native quality layer** (F-B09/B10/B14/B16/B17/B18, F-A32/A33) | contained/design · implementation | STORE-2 | Sonnet 5 → Opus 4.8 / medium | `GATED` |
| B11 | **T15 remainder** — T15-10 (CSS consolidation, before UCL-4's branding sweep), T15-11 (light theme), T15-12 (delight), F-P3-A3 (mini-decision) | T15-10/11 clearance · T15-12 contained · F-P3-A3 decision | — | T15-10 Opus/high · T15-11 Opus/medium · T15-12 Sonnet/low | `TODO` |

---

## Decisions Sergio must make (blocking gates)

- [ ] **Clear T15-2 to open** (HOLD-class; live-Render visual verification is Sergio's gate — no local runs).
- [ ] **Convene DEC-0**: UCL feed pricing (WC tier doesn't carry; UCL tier vs ALL-ACCESS $499.99/mo) · membership model (join table vs `manager.user_id`) · commissioner model (per-league vs global) · wrapper tech (Capacitor recommended) · pool two-legged-tie semantics + guillotine "round" = leg or tie · FAAB replenishment over a 10-month season · one shared DB vs DB-per-league (decides whether F-C01 needs a migration at all).
- [ ] **HARD-1 mid-tournament authorization** — additive-only worker-adjacent deploy in a match-free window now, vs ~2 more weeks of unobservable auto-fired irreversible cuts.
- [ ] **Accept/reject T15-13** as a thread; **confirm T15-6 promotion**.
- [ ] Operator steps: PUSH-KEYS · INV-4 · INV-11 · AUTOFIRE_CUTS_ENABLED check.

## Standing constraints (apply to every thread)

- One theme per thread; worktrees isolated; `--ff-only`; hold by default; high-risk classes (resolver/purity/migration/shared-validator/live-scoring/production-data) always hold for Sergio.
- Visual verification on the **live Render deploy only** — every visual thread ships a Playwright render-proof script (the `verify-*.mjs` precedent) + screenshots as its pre-merge evidence.
- Status is derived: start of every thread, cross-check the item against BACKLOG.md + the PROJECT.md session log before trusting any label (including this file's).
- Brain files re-uploaded after each merge; docs commits `[skip render]`.
