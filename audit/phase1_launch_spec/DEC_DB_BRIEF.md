# DEC-0 · D-DB Decision Brief

**Date:** 2026-07-06 · **Class:** read-only, docs-only decision instrument (`[skip render]`). **This brief lays out the D-DB call; it does not make it.** D-DB is a tier-0 product/architecture decision — Sergio's to make. Every axis below states **both prices**; no fork is recommended. The one closing note (§6) flags *evidence quality*, not a lean.

**Sources (consumed, not re-derived):** one-DB fork = `DESIGN_NOTES.md` §2 + `L4_junction_design.md` (V45-corrected). Per-league fork = `plan_per_league/` P1–P5 + `plan_per_league/DESIGN_NOTES.md` (the 12-axis comparison table, V-a/V-b/V-c verdicts, F-1…F-10 flags, 15 sub-decisions, 5 spikes). Gating map = `DEC0_DEPENDENCY_MAP.md`. Standing reality = INV-11 (single-tenant, one league row today), F-A07 (Supavisor pin), `render.yaml`. Platform constants are cited at 2026-07-06 and parameterized in the lanes — **re-instantiate the formulas at decision time** (§4.5).

---

## 1. The decision, in one paragraph

Pick the hosting shape for league data. **One shared DB** keeps today's single Postgres project, adds `league_id` scoping, and pays the **L4 junction** (`match_period` + composite FK) so one `fifa_match` can carry a different fantasy period per league — the 56-consumer, waves-W0–W5, expand/contract migration (E6 destructive) that is "the deepest migration of the program." **Per-league DB** gives each league its own data plane, so `fifa_match.periodId` stays a single-column FK and **the entire junction apparatus evaporates** — at ×N ops cost, no cross-league surfaces, and a new session→DB routing problem. Per-league has two live variants: **V-a** project-per-league (own Postgres/Auth/Realtime/keys — Supabase's recommended shape) and **V-b** schema-per-league (one project, `?schema=` per league). A third, **V-c** (extra `CREATE DATABASE` in one project), is **dismissed with independent evidence** — dashboard-invisible and unusable with PostgREST/Auth/Storage/Realtime (P1 §1) *and* arithmetically dead on connection math (binds at N≈2–3, P2 §2); it is not re-litigated here. Orthogonal to all of this is a **deployment axis** — **R-1** (one shared app fleet routing N DB targets) vs **R-2** (a full service-set per league) — which can be chosen **per service class** (P2 SUB-1: e.g. R-2 web + one R-1 multi-target ingest worker); it changes several answers below and is called out where it does.

---

## 2. Decision-critical axes (both prices, per axis)

Synthesized from `plan_per_league/DESIGN_NOTES.md` §2 — only the axes that actually move the decision. Full 12-axis table lives there.

### 2.1 Schema work (F-C01) — the headline
- **One-DB:** the L4 ladder — `match_period` + composite FK `(periodId,leagueId)→Period(id,leagueId)`, E1–E6 expand/contract (E6 = destructive column drop, "point of no return"), 56 sites rewired in waves W0–W5, raw-SQL lock-trigger rewrite, CI fence. Weeks-class.
- **Per-league:** **zero junction migration.** 50/56 consumer sites correct-by-construction, 0 rewired. The cost doesn't vanish — it **relocates** to 5–6 sites that become *undefended topology invariants* (see §3, F-3). V-b caveat: "no junction migration" ≠ "no migration" — the migration *history* must first be made schema-portable (§3, F-2).

### 2.2 Connection ceiling (P2 §2)
- **One-DB:** no multiplication. ~10–20 client conns vs M=200. F-A07's code-level fix (`pgbouncer=true` + explicit `connection_limit`) still required, but that is S-effort and is owed under *every* variant.
- **Per-league V-a:** server side **never binds** (each league owns its pooler). The multiplication lands elsewhere: **R-1** → per-web-instance RAM (N cached PrismaClients × ~O(10 MB) → binds ~N≈20–30 on a 512 MB starter, deferrable by LRU-capping); **R-2** → pure cost (= today ×N).
- **Per-league V-b:** **binds early.** One shared Supavisor pool with *perfectly correlated peaks* (every league is the same World Cup — F-7): `pool_timeout` storms from ~N≈3–5 at P=15 (raising P defers to ~N≈10), and `max_client_conn`=M binds at N≈20 (halves to ~N≈10 if web scales to 3 instances). Tier upgrade is the only real relief.

### 2.3 RLS / authz surface (P3 §2)
- **One-DB:** all 27 live policies are N-league-safe **as-is**; **zero policy work**. Residual = Realtime channel-*name* scoping (MT-2), not policy work.
- **Per-league V-a:** 0 policies evaporate (17/27 are intra-league OWN-class isolation — blind FAAB bids, hidden pool picks, private push rows — which sharding cannot address). 8 LM policies *optionally* simplify; zero-diff is the reversible stance. Channel-name scoping evaporates. New cost: N Auth realms (§2.6, F-6).
- **Per-league V-b:** 0 evaporate, and the 8 LM predicates are **promoted to the sole cross-league read barrier** while the surface *grows* machinery (per-schema policy replication, `search_path` re-pins, mirror-trigger fork, PostgREST grants). **V-b is strictly more RLS/authz work than one shared DB.**

### 2.4 Ongoing ×N migration cost + single→multi path (vs INV-11)
- **One-DB:** 1 `migrate deploy` per release. League #2 = one row + the junction waves already paid; the `league.findFirst` singletons (F-C11, 7 sites) must be threaded first.
- **Per-league:** **×N `migrate deploy`** forever (N direct URLs V-a / N schema params V-b). Partial-loop failure ⇒ mixed-schema fleet within one deploy ⇒ **expand/contract becomes mandatory and permanent** (F-1) — a failure class F-A15's forward-only discipline doesn't cover. Upside: against INV-11 (one league row today), N=1 adoption is nearly the status quo, and F-C11 **evaporates** (each league is one row per DB/schema).

### 2.5 Cross-league product surfaces
- **One-DB:** trivially possible (global standings, discovery, cross-league play) — one DB, one query.
- **Per-league V-a:** **impossible without a new control-plane build** — N Auth realms, N Realtime realms, N DBs; any global surface needs new infra.
- **Per-league V-b:** possible via cross-schema queries, but each such surface **re-imports the multi-tenant authz problem V-b was meant to shed.**

### 2.6 Deployment-per-league (F-4, F-6)
- **One-DB:** today's shape — 1 project, 4 services, 1 migrate point, one `auth.users`, one session across all leagues.
- **Per-league V-a:** `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` are **build-time-inlined** (`render.yaml:64-66`), so one shared R-1 build cannot carry N projects' browser keys — **V-a couples strongly to R-2** (or a runtime-config refactor of the Supabase client layer). Plus auth fragmentation: a multi-league human = N unlinked `auth.users`, N magic-link sign-ins, no SSO; per-project Auth config (Site URL, redirects, SMTP) is a ×N manual birth step (F-6).
- **Per-league V-b:** one Auth unchanged (no per-league Auth config); the S3 sub-decision only picks where `app_user` lives.

### 2.7 $ and ops
- **One-DB:** 1 project (P_pro = $25/mo); today's ops surface.
- **Per-league V-a:** `Cost(N) ≈ 25 + 10·(N−1)` $/mo at Micro (+ optional PITR ×N) + N×4 Render services under R-2 (and `render.yaml` env groups cannot hold `sync:false` secrets — F-10 — so R-2 is N×4 hand-entered secret sets unless provisioning moves to the Render API).
- **Per-league V-b:** 1 project, but migrate/seed/publication/grants loop ×N schemas, and **pooler-budget management becomes a standing ops duty** (the §2.2 ceilings are compute-tier-bought).

### 2.8 Feed budget (F-A20, F-5)
- **One-DB:** one puller — satisfied.
- **Per-league:** R-1 worker (fetch-once-fan-out-writes) stays F-A20-safe but tick = t_fetch + N·t_write (staleness grows with N). **R-2 is a correctness breach by construction** (F-5): N workers, 1 vendor key, N uncoordinated in-process limiters, no 429 backoff — F-A20's "never >1 instance" violated. The F-A20-safe shapes are R-1 ingest or the hybrid.

**Hybrid to evaluate beside the poles:** the deployment axis is per-service-class, so **R-2 web** (right keys per league, no routing problem) + **one R-1 multi-target ingest worker** (F-A20-safe) + R-1 crons is a coherent composition (P2 SUB-1 C).

---

## 3. Standing costs that ride with junction-evaporation (EITHER per-league fork)

If per-league is chosen, these are **not optional** — they are the price of deleting the junction's defenses:

- **F-3 — the junction's deletion also deletes its defense (CONFIRMED design hole; P5 §2/§3 + V-P5 finding 1).** One-DB actively guards period↔league consistency via the composite FK + CI fence. Per-league replaces that with an *undefended topology invariant*: the vestigial `[leagueId,…]` uniques do **not** protect the highest-risk site — `resolvePeriodId` does `findFirst{kind,label}` with **no league filter**, so a mis-inserted second league would silently stamp the wrong league's period. A cheap guard **must be specced in**: a `league`-table single-row `CHECK`/trigger or a startup assertion. (This is the standing safety cost that the "no migration at all" headline hides.)
- **V-b only — the `public.`-qualification constraint, forever (F-2).** 37 `public.`-qualified raw-SQL occurrences across 8/30 migration files land in `public` regardless of `?schema=`; the migration history must be rewritten/templated *and* every future migration kept qualification-clean forever, plus an `auth.users`→N-schemas mirror-trigger fork. This is why "V-b is migration-free" is false.

---

## 4. Verify-at-decision spikes — must be run/answered *before* the call is final

These gate admissibility, not preference (`plan_per_league/DESIGN_NOTES.md` §5). The decision must not be made on unrun assumptions.

1. **V-b pooler spike (W0-class — BLOCKS V-b).** Confirm on the lockfile-resolved Prisma (**6.19.3** — re-read `pnpm-lock.yaml` at spike time, not the `^6.2.1` manifest floor) that *every* generated query is schema-qualified under `?schema=` + `pgbouncer=true` (transaction pooling makes `search_path` unsafe). prisma#28611 shows this mechanism regressing on the v7 adapter path. Until this passes, **V-b is not admissible.** (P2 §3, V-P1 finding 6.)
2. **Supavisor pool keying** (per `(user,database)`) — load-bearing for all P2-2/V-b/V-c math; re-confirm on the live dashboard. (P2 §1.)
3. **S term** (platform services + `reserved_connections` consuming direct slots against X=60) — read off the dashboard; tightens every V-b/V-c server budget. (P2 §2.)
4. **Render cross-service deploy ordering** (INV-2 caveat) — dashboard-unverified; affects F-1 severity (partial-fleet schema skew). (P4 §3.)
5. **Platform constants** (M=200 / P=15 / X=60 Micro-class; $25+$10 pricing; pause-on-Pro unavailability) are cited at 2026-07-06 and parameterized — **re-instantiate the formulas at decision time; do not reuse the constants.**
6. **Per-PrismaClient RSS on a Render starter.** Measure real resident memory per cached PrismaClient on a 512 MB starter instance. Gates V-a×R-1 admissibility: its ~N≈20–30 league ceiling (§2.2) currently rests on a guessed ~10 MB/client, not a measurement — §6 flags this as the brief's one evidence-quality gap. V-a×R-1 cannot be treated as a bounded, sized option until this is measured.

---

## 5. What each choice unblocks downstream

From `DEC0_DEPENDENCY_MAP.md` (per-thread gating). D-DB is the #1 leverage decision — decide it first; every day of junction work before the call is at risk.

| Choice | Unblocked | Evaporates |
|---|---|---|
| **One-DB (shared + junction)** | MT-2's junction core is **build-ready the day D-DB lands** — L4 is implementation-complete (V45-corrected). MT-1 (D-MEM/D-COMM) and the UCL-2 middle proceed on the shared topology. F-C01 migration is *the* work. | — |
| **Per-league (V-a or V-b)** | All **56 junction rewires + the entire L4 apparatus evaporate** (no `match_period`, no composite FK, no E1–E6, no CI fence). F-C11 `findFirst` singletons resolve for free. Per-league worker loops are junction-independent (need only MT-1). | MT-2's junction core; the L4 spec; channel-name scoping (V-a). **Replaced by**: N-birth flow (B0–B7), session→DB routing, the F-3 guard, ×N migrations, and — for cross-league surfaces — a control-plane build that doesn't exist yet. |

**Independent of D-DB:** with D-DB + D-ROUND + D-MEM/D-COMM decided, the critical path (threads 3→4→6) is fully unblocked **regardless of D-FEED**; D-FEED then only throttles UCL-1/UCL-3 and the final wiring of UCL-2's seams. The four build-ready-now UCL-2 steps (F-D15 rename, lock self-heal, label seam, eliminated/FAAB copy) carry **zero D-DB exposure** either way.

---

## 6. Under-supported — consider spiking before commit (evidence quality, not a lean)

On close read, one comparison-table cell rests on a weaker footing than the others, and it is **not** among the five §5 spikes:

- **V-a × R-1 client-registry RAM ceiling (~N≈20–30).** This binds the RAM viability of V-a under a shared app fleet, yet it rests on `m_client ≈ O(10 MB)` — an explicit *order-of-magnitude* estimate in P2 §2 (line 31: "engine pool + caches, O(10 MB)"), not a measurement. Because it is the *binding* constraint for one of the two live per-league variants under R-1, a cheap **"measure real per-`PrismaClient` RSS on a starter instance" spike** would harden the one axis on which V-a×R-1 viability turns. (Note: this is not itself an argument for or against per-league — only that if V-a×R-1 is on the table, this number should be measured, not assumed.)

Everything else load-bearing in the table is either anchored to repo/platform fact (P2 verifier: F-A07/F-A15/F-A20/INV-11 exact, §2 arithmetic reproduced in full) or already carried as a §4 admissibility spike (the `?schema=` qualification "believed" wording → spike #1; Supavisor keying → spike #2). No other cell reads as under-supported enough to gate the call.

---

_Companion to the two fork specs; picks no fork. The DEC-0 map's D-DB cell ("per-league ⇒ F-C01 needs no migration at all", `DEC0_DEPENDENCY_MAP.md:9`) should be read with §3 (F-3 defense deletion, F-2 V-b history rewrite) — "no migration" is true only of the junction, and only under V-a KEEP-VESTIGIAL._
