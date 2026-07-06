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
- **Remaining Window A order UNCHANGED:** T15-3 → T15-1 → T15-5 → T15-7, with **T15-6 promoted** and T15-13 still `PROPOSED` (gated on Sergio accepting the thread). — **Superseded**, see "Derived-status corrections (2026-07-05, ordering conflict resolved)" below.
- **PUSH-KEYS + AUTOFIRE_CUTS_ENABLED CLOSED** (2026-07-05, operator-confirmed DONE; struck below — see also `[[t15-3-keyboards-form-attrs]]` docs pass that first recorded them CLOSED).
- **INV-11 (stray second `league` row check) PASS** — exactly 1 row: id `7b30166f-ec55-4ce8-b133-beddc4f6eb90` / name "WC Fantasy League" / `created_at` 2026-06-08 17:56:29.343+00. Single-tenancy holds; `findFirst()` singletons are safe as-is. De-risks the DEC-0 one-DB / singleton call.
- **INV-4 (heartbeat/attention env vars + connection flags) resolves into three parts:**
  - **INV-4a (`DATABASE_URL` flags) PASS** — `pgbouncer=true` (Supavisor transaction pooler, prepared statements correctly disabled); `connection_limit` UNSET → Prisma default (1+2×CPU) applies. Persistent-container architecture ⇒ not serverless, so the default is safe today at current scale. **DECISION (F-A07 close):** pin an explicit modest `connection_limit` per service (web/worker/period-close), summed under the Supavisor Pool Size, tuned against Observability → Database Connections. Tracked as OPEN follow-up **F-A07-pin** (operator, dashboard — no code).
  - **INV-4b (period-close dead-man switch) CLOSED** (2026-07-05) — `PERIOD_CLOSE_HEARTBEAT_URL` is now wired to a Healthchecks.io check (green ping received; the external monitor is watching), the check's email integration is configured and confirmed "ready to deliver", and `PERIOD_CLOSE_ATTENTION_URL` is now a live HTTP sink (no longer inert). The dead-man switch is watched end-to-end: a hung/crashed cron stops the heartbeat → Healthchecks fires the email alert to a channel Sergio reads. Was PARTIAL/OPEN (external monitor + alert sink unwired); both are now live.
  - **INV-4c (retired services) PASS** — `wc-fantasy-scraper` + `wc-fantasy-faab-batch` both SUSPENDED-by-owner (inert, not deleted). Retire intent satisfied; confirms the render.yaml-removal-didn't-auto-delete-faab-batch note.

## Derived-status corrections (2026-07-05, ordering conflict resolved)

Three-way Window-A ordering conflict **RESOLVED** (Sergio-confirmed): remaining order is
**T15-6 → T15-1 → T15-7**. Supersedes the 07-04 table's `T15-6 → T15-5 → T15-7 → … → T15-1 (last)`
and the earlier 07-05 line's unplaced "T15-6 promoted" note — T15-6 ranks ahead of T15-1 because its
promotion was driven by a live-confirmed FAIL (step-58), a higher-confidence signal than T15-1's
360-conditional P0s (not reproduced at real device widths). T15-7 is already `DONE` (MERGED+DEPLOYED
`main@2267a4c`); **T15-6 is now CLOSED too** (MERGED+DEPLOYED `main@071eac1`, Sergio's post-deploy
on-device gate PASS, 2026-07-05), leaving **T15-1 as the sole open thread of the resolved order**
(T15-13 still `PROPOSED`, gated on Sergio accepting).
T15-5/T15-3 are already `DONE`/CLOSED and were never part of this three-way conflict's threads. See
`DECISIONS.md` and `audit/T15-5_NOTES.md` for the full record.

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
| A3 | **T15-3 — keyboards & form attributes** | F-P1-I2 (16px floor), F-P1-G1 (FREEZE/CUT autocap), inputmode/enterkeyhint sweep, F-P3-H1/H2 | contained · implementation (delegable + manual FREEZE check) | Sonnet 5 / medium | `DONE` — MERGED+DEPLOYED `main@c12427a` (2026-07-05) |
| A4 | **T15-6 — time truth** (promoted) | F-P1-TZ1, F-P2-TZ1/TZ2/TZ3, F-P2-G4, F-P3-TZ1 (shared formatter) | clearance · implementation (contract-touching, HOLD) | Opus 4.8 / medium (ran as Fable 5 / high) | `DONE` — **MERGED `--ff-only` + DEPLOYED** `main@071eac1` (2026-07-05; deploy hash flip `dfba3187`→`b4642846`, health 200; **Sergio's post-deploy on-device gate PASS**). All 6 finding IDs resolved: 5 ad-hoc formatters retired onto `formatInLeagueTz` (+3 shared siblings), `league.timezone` threaded read-only into 4 snapshots, /commish tap-visible timestamps + frozenSince fixed, /pool ET→EDT supersede, new CI `timeTruthFence` (class-killer). |
| A5 | **T15-5 — error/404/loading boundaries** | F-P1-ERR1/ERR2, F-P2-ERR1 | contained · implementation (additive files only, delegable) | Sonnet 5 / low–medium | `DONE` — CLOSED, device gate PASS `main@b4f3612` (2026-07-05) |
| A6 | **T15-7 — rulebook truth (/scoring)** | F-P1-J1/J2/J3 — every value sourced from `packages/scoring`; consider generating tables from engine constants | clearance · implementation (copy-only, trust surface, HOLD) | Opus 4.8 / high | `DONE` — **MERGED `--ff-only` + DEPLOYED** `main@2267a4c` (2026-07-05, Sergio's on-device visual PASS). F-P1-J1/J2/J3 all fixed. §1/§4/§8 render from local data tables + §9 from `ScoreInput` fixtures pushed through `scorePlayerMatch`, probed against the engine in `scoringData.test.ts` (page-vs-engine drift now fails CI). Engine-side exported RULES manifest **DEFERRED** (not built). `packages/scoring` byte-untouched. |
| A7 | **HARD-1 — observability core** (launch, interleaved) | F-A01/A02/A03/A04, F-A09/A16; additive-only slice (F-A05 optional, Sergio's call) | clearance · implementation (review, worker hot-path adjacency; **match-free deploy window**) | Fable 5 / high | `TODO` — gated-on: Sergio's mid-tournament authorization. Read-only diagnosis precursor **COMPLETE** (2026-07-06, `audit/phase1_launch_spec/HARD1_DIAGNOSIS.md`): all six findings (F-A01/A02/A03/A04/A05/A09+A16) re-derived still-open at the live tip. Diagnosis unblocks nothing on its own — implementation remains gated on Sergio's mid-tournament deploy authorization + a match-free window. Note: INV-4b closed only the cron dead-man switch; F-A02's resident-worker gap stays open. |
| A8 | **T15-13 — identity & copy truth** | N2/N6 raw-email PII fallback, N3 "vs Team 288", N4 provider string | contained · **gated-on: Sergio accepting the thread** | Sonnet 5 / medium | `PROPOSED` |
| A9 | **T15-1 — 360-conditional P0 hotfixes** (demoted) | F-P0-B1+F-P1-B1, F-P0-E1, F-P0-F1, F-P2-G2 | contained · implementation (delegable, if calendar permits) | Sonnet 5 / medium | `TODO` — **2nd of remaining order** (see 2026-07-05 ordering resolution below) |
| A10 | **T15-9 — per-screen passes, delegable subsets (9d–9i)** | per audit §4 row T15-9; HOLD subsets 9a/9b/9c only if a live gap forces them | contained · implementation | Opus 4.8 / medium per sub-thread | `TODO` |

**Operator steps this week (Sergio, no code):** ~~PUSH-KEYS~~ CLOSED · ~~AUTOFIRE_CUTS_ENABLED live verification~~ CLOSED · ~~INV-11~~ PASS · ~~INV-4b (external monitor on the heartbeat)~~ CLOSED (2026-07-05, Healthchecks.io + email alert live) — INV-4 now fully PASS/CLOSED, with the sole remaining operator follow-up **F-A07-pin** (explicit `connection_limit` per service).

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
- [ ] **Accept/reject T15-13** as a thread. ~~confirm T15-6 promotion~~ — **CONFIRMED + CLOSED** (T15-6 ran 1st per the resolved order and is `DONE`, `main@071eac1`, 2026-07-05).
- [x] Operator steps: ~~PUSH-KEYS~~ · ~~INV-11~~ · ~~AUTOFIRE_CUTS_ENABLED check~~ · ~~INV-4b (external monitor wiring)~~ — all CLOSED 2026-07-05. INV-4 now fully resolved: INV-4a/INV-4b/INV-4c PASS/CLOSED. **F-A07-pin OPEN** (sole remaining operator follow-up).

## Standing constraints (apply to every thread)

- One theme per thread; worktrees isolated; `--ff-only`; hold by default; high-risk classes (resolver/purity/migration/shared-validator/live-scoring/production-data) always hold for Sergio.
- Visual verification on the **live Render deploy only** — every visual thread ships a Playwright render-proof script (the `verify-*.mjs` precedent) + screenshots as its pre-merge evidence.
- Status is derived: start of every thread, cross-check the item against BACKLOG.md + the PROJECT.md session log before trusting any label (including this file's).
- Brain files re-uploaded after each merge; docs commits `[skip render]`.
- **Intra-Window-B ordering: F-D15 before MT-2's dual-write wave.** F-D15 (the UCL-2 enum rename, thread B5) must land **before** MT-2's ingest dual-write wave (thread B3) — both rewrite the SAME two `prismaStore` files, so landing them out of order forces a rebase conflict on shared lines. Sequence the enum rename first, then MT-2 dual-writes onto the renamed surface. (Recorded 2026-07-06.)
