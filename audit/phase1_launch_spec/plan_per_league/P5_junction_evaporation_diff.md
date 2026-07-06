# LANE P5 — junction-evaporation diff (what per-league DELETES vs the one-DB fork)

_Per-league-DB spec pass, 2026-07-06. Lane model: Opus (enumeration lane, read-only). Inputs: audit/phase1_launch_spec/L4_junction_design.md, L1_fc01_consumer_inventory.md (47+9 = 56 rows), L2_rls_wc_literal_catalog.md (A1/A3), DEC0_DEPENDENCY_MAP.md, packages/db/prisma/schema.prisma (43 leagueId refs). Verifier verdict appended at bottom after the independent re-check._

**Frame (INV-11, AUDIT_LAUNCH_readiness.md:1002):** prod = exactly one league / one DB. Under per-league, `fifa_match.periodId` stays a plain single-column FK — each DB holds one league's periods, so a fixture maps to exactly one period **by topology**. Every "a shared global fixture fans out to N leagues' periods" problem the L4 junction was built to solve **does not exist**. This lane is the evidence table of what that deletes. It picks no fork.

---

## 1. The junction ARTIFACT that evaporates (L4 apparatus → all unnecessary)

Under per-league the composite key `(match_id, league_id, period_id)` collapses to today's single FK. Every L4 construct below is deleted wholesale:

| L4 construct | L4 anchor | What per-league deletes |
|---|---|---|
| `match_period` table + composite FK `[periodId,leagueId]→[id,leagueId]` | L4 §Prisma-sketch (line 28-29), §1 | Entire new table + its 3 indexes; no `Period @@unique([id,leagueId])` needed (no multi-field `references:` — kills the "zero precedent, run prisma-validate spike" W0 task, V45:133) |
| Expand/contract **E1–E6** migration ladder | L4 §3 (lines 65-79) | All 6 migrations: E1 additive create, E2 backfill INSERT (V45 `DO UPDATE` correction moot), E3 dual-write window, E4/E5 cutover, **E6 destructive `DROP fifa_match.period_id`** — the program's only "point of no return" (§3, line 79) never happens |
| Consumer rewire **waves W0–W6** | L4 §4 (lines 81-92) | All 56 sites keep single-FK reads/`Period.matches` traversals unchanged (see §2). No `periodLinks: { some: { periodId } }` relation rewrite; no `periodFor`/`bindingsFor` helper module (L4 §4 line 83) |
| Raw-SQL **trigger rewrite** (self-heal unlock join) | L4 W4 / E5; L1 row 3 (migration `20260612220000:74-78`) | Trigger's `JOIN fifa_match ON m.period_id=NEW.period_id` stays valid & untouched — L1's #1 highest-risk, hardest-to-unit-test site (L1:63) is a no-op under per-league |
| **CI fence** (`fifaMatch.periodId` grep-ban) + E6 gate | L4 §3 E6 (line 78), §5 (line 103) | No fence to author/maintain; no "all 4 services deployed past E4/E5" deploy-ordering gate (which itself leans on the F-A17 no-ordering-barrier hazard) |
| **W0 prisma-validate spike** (composite-FK precedent) | V45:133 | Deleted — no composite `references:` introduced |
| Residual **F-A26 notify ledger-key** re-check | L4 §5 (line 98) | Per-league send is naturally single-league; no per-league ledger-key disambiguation *inside one DB* (cross-DB dup-push is a different, P1/P2-owned concern) |

**Net:** the entirety of L4 — the "deepest migration of the program" (DEC0:46) — becomes an empty no-op list under per-league (L4 §2b line 55 says so; this table is the itemization).

---

## 2. The 56 rewires — classification (consumes L1's table; no code re-trace)

Legend: **(a)** rewire evaporates, site is correct-by-construction in a single-league DB · **(b)** still needs attention under per-league (load-bearing-by-topology, or R-1 shared-app interaction) · counts at end. Contiguous same-reasoning rows grouped; every L1 row 1–47 + M1–M9 appears.

| L1 rows | subsystem | class | reasoning |
|---|---|---|---|
| 1, 2 | schema DDL + historical migration | (a) | Column + `period` relation stay; no junction DDL. (leagueId-apparatus fate = §3) |
| **3** | locking — raw-SQL trigger | (a) | `m.period_id=NEW.period_id` correct at 1 league/DB; L1's #1-risk site neutralized |
| **4, 5, 6, 7** | ingest stamp/resolve/port | **(b)** | Row 5 `resolvePeriodId` `findFirst{kind,label}` with **NO league filter** (prismaStore.ts:97-104) is the literal F-C01 root (L1:63). Per-league makes it *correct* — but only because the DB holds one league. It becomes **load-bearing-by-topology**: an undefended single-tenant invariant. Rows 4/6/7 stamp/port the same unscoped value. See newConstraints. |
| 8, 9, 10 | locking — source-match scope | (a) | lock-on-play scope resolves within the one league |
| 11, 12 | recompute dirty-walk + slot scoring | (a) | L1's #3-risk ("fans out to only ONE league, zeroing others", L1:63) — at 1 league/DB that one *is* the answer. Correct-by-construction |
| 13, 14, 15 | period-close `Period.matches` | (a) | Reverse reads single-league |
| 16, 17 | notify (F-A26) | (a) | Not-starting scope single-league; no per-league fan-out. (cross-DB push dedup = P1 index) |
| 18–22 | pool | (a) | `period.kind/label` reads single-valued |
| 23–27 | lineup | (a) | `periodId in [...]` / `match:{periodId}` joins single-league |
| 28–30 | vsfield | (a) | per-player pts joins single-league |
| 31–33 | games / player-box | (a) | match.period + owner-slot scope single-league |
| 34 | dashboard | (a) | tournament-phase read single-league |
| **35** | shell `loadNavPhase` (global memoized) | **(b)** | league-in-scope=N, **module-memoized** (loadNavPhase.ts:15-16). Fine under **R-2** (deployment-per-league: one process = one league). Under **R-1** (shared app routing N leagues) the memo **leaks nav phase across tenants** — needs per-request league binding / memo keyed by league. Same class as M8. |
| 36, 37 | standings, waivers | (a) | `Period.matches` reverse reads single-league |
| 38, 39 | faab | (a) | batch-window fixture reads single-league |
| 40–45 | commish + autofire | (a) | already league-scoped upstream; single-league correct |
| **46** | elimination (global `period.kind=ko`) | (a)* | (a) by design, per L4:130: elimination is DELIBERATELY competition-global — `fifa_team.eliminated` is competition truth, not league-scoped, and "must NOT gain league scoping" — so its global scope is intentional, not an undefended invariant. *A topology-defended-but-intentional site, distinct from the 6 (b) |
| 47 | ingest `memoryStore` double | (a) | Test double; N-period link capability now vestigial-harmless |
| M1–M6 | `Period.matches` reverse reads (faab/autofire/transition/commish/players) | (a) | Same reverse-read pattern; single-league |
| M7 | player-box season aggregate | (a) | `match:{period:{leagueId}}` single-valued |
| **M8** | player-tournament-stats label (league-in-scope=N) | **(b)** | player-scoped label source (loadPlayerTournamentStats.ts:64-74). Unambiguous only because DB is single-league; under any DB-sharing it needs a declared league/competition-global label source. Load-bearing-by-topology (L1:95 flags it with row 35). |
| M9 | recompute `memoryStore` double | (a) | Already junction-shaped (L4 res-a); no change |

**Counts: 50 (a) / 6 (b) / 0 (c) — the (b) count is deployment-model-dependent, not flat: 6 (b) under R-1 (shared app); under R-2 (deployment-per-league) row 35 → (a), leaving ~5. The ingest cluster {4,5,6,7} and M8 stay (b) under both.** The (b) six = ingest cluster {4,5,6,7} + nav {35} + player-stats {M8}. Every one is *correct today at N=1* — none is a rewrite — but each trades L4's explicit code-level defense for an **undefended topology invariant**. The one-DB exec summary's "all 56 rewires evaporate" is true for the rewrite cost and understates this silent-invariant shift (newConstraints).

---

## 3. League-scoping schema apparatus (13 models carry `league_id`)

Under per-league every `league_id` is single-valued (one league row survives as config). **SUB-DECISION: keep vestigial vs drop.**

| model | schema:line | leagueId constraints (uniques/indexes) |
|---|---|---|
| Manager | 164 | `@@unique([leagueId,userId])` :207 · `@@unique([leagueId,draftSlot])` :208 · `@@unique([leagueId,waiverOrderPosition])` :210 · `@@index([leagueId])` :211 |
| AllowlistEmail | 236 | `@@unique([leagueId,email])` :246 |
| RosterPlayer | 455 | `@@index([leagueId,playerId])` :468 · **partial unique (league_id,player_id) WHERE dropped_at IS NULL** (INVARIANT-1, doc :446) |
| Period | 515 | `@@unique([leagueId,label])` :542 · `@@index([leagueId])` :543 |
| Draft | 555 | `leagueId @unique` :555 (one draft/league) |
| FaabBatch | 618 | `@@index([leagueId,runAt])` :628 |
| FaabBid | 638 | `@@index([leagueId,status])` :658 |
| Watchlist | 670 | `@@index([leagueId])` :681 |
| Standing | 922 | `@@unique([leagueId,managerId,scope])` :935 · `@@index([leagueId,scope])` :936 |
| PlayoffEntry | 949 | `@@unique([leagueId,managerId])` :964 · `@@index([leagueId,status])` :965 |
| RecomputeDirty | 980 | `leagueId String?` (nullable) — no index |
| PoolPick | 1004 | `@@index([leagueId,matchId])` :1016 |
| CommishAudit | 1119 | `@@index([leagueId,createdAt])` :1140 |

**SUB-DECISION: league-scoping apparatus fate — A: KEEP-VESTIGIAL vs B: DROP.**
- **A KEEP-VESTIGIAL** — zero migration (this is what makes the "no migration at all" headline literally true), `league` row persists as single-row config, all FKs/uniques/indexes retained. Cost: schema still carries multi-tenant shape it no longer uses; the `[leagueId,X]` uniques degrade to a *constant-prefix* — still correct (unique-on-X within the one constant league), and in fact act as a **safety net**: if a second league were ever mis-inserted into the same DB, `@@unique([leagueId,label])` / `([leagueId,managerId])` / `([leagueId,waiverOrderPosition])` re-scope correctly instead of colliding.
- **B DROP** — cleanup migrations **×N DBs** (contra the headline's "no migration"; and F-A15 forward-only reality means each is its own irreversible step per DB). Simplifies schema but **bakes single-tenancy in** and removes the safety net. Non-cosmetic case: **RosterPlayer INVARIANT-1** partial unique `(league_id, player_id) WHERE dropped_at IS NULL` is a *correctness* constraint (one live owner per player), not an index — dropping league_id there rewrites the invariant to `(player_id) WHERE dropped_at IS NULL`, a load-bearing constraint change requiring its own verification, not a mechanical strip.

Constraints **semantically weakened if kept vestigial** (constant-prefix, listed for the brief, not a blocker): Manager ×3 uniques, AllowlistEmail, Period label-unique, Draft league-unique, Standing, PlayoffEntry, RosterPlayer INVARIANT-1.

---

## 4. Multi-tenant work items that EVAPORATE (index; one line each)

| item | source anchor | evaporates because |
|---|---|---|
| 8× `league.findFirst` F-C11 singleton sites | prompt/packages ctx; L4 §2b line 53 | single-league DB ⇒ the implicit "first league" *is* the league; loops become correct (F-C10/C11) |
| MT-2 junction waves **W0–W5** | L4 §4 (81-92) | no junction ⇒ no waves (§1) |
| Realtime **channel-NAME** scoping (standings/playoffs), the C3 open item | L2-A3 :43 (`channel-NAME sharing, not policy`) | under **V-a** each league = own Supabase project/Realtime realm ⇒ channel names can't collide across leagues (see P3); under V-b it does NOT evaporate |
| L2-A1 **"MT-2 action" column** items | L2-A1 :13-17 | already mostly "none"; RLS `league_member` joins to `draft.league_id` etc. are single-valued (RLS *policy fate* under V-a/V-b = **P3**, not re-derived here) |
| DEC0 **MT-2 row** gated on "junction exists at all" | DEC0:9, :26 | the gate's premise (a junction to build) is void; MT-2's junction core is empty (F-C11 loops still want MT-1, junction-independent) |

RLS policy fate (27 policies / 14 tables, L2-A1) (unverified — L2-internal discrepancy: A1 enumerates 14 tables, A5:49 says "27 discrete policies across 16 tables"; P3 verifier to resolve) under V-a vs V-b is **P3's** lane — not duplicated here.

---

## 5. THE ANTI-DIFF (what per-league CREATES that one-DB doesn't) — pointer only

Per-league deletes the junction but is **not free**; the synthesis owns the comparison. Indexed to lanes:
- **P1** — provisioning fan-out: `provision` CLI (apps/worker/package.json:9) + ×N ingest of the whole `fifa_*`/`stat_player_match` universe (prod 1252 players/48 teams copied per DB) + `rank:generate` ×N; migrations ×N across DBs (F-A15 forward-only, no down files).
- **P2** — client-connection multiplication: the `@app/db` module-singleton PrismaClient (packages/db/src/index.ts:12-16, 93 importers) is one-DB-shaped; per-league needs N clients/routing (F-A07 no connection_limit / pgbouncer compounds ×N).
- **P3** — auth/RLS fragmentation under V-a (N Supabase projects = N anon/service_role keys, N Auth realms); RLS-policy fate of the 27 policies.
- **P4** — session→league→DB registry/factory/routing (the "new session→DB routing problem", DESIGN_NOTES §2 / L4 §2b:54) + deployment axis R-1 (shared app, needs runtime routing + fixes row-35/M8 memo leak) vs R-2 (deployment-per-league env groups).

---

## V-P5 verifier verdict (independent re-check)

_Opus, adversarial re-check, 2026-07-06. Scope: re-read P5 against L1 (56 rows), L4 (§1/§3/§4/§6 + V45), L2-A1/A3, DEC0, and fresh greps of packages/db/prisma/schema.prisma (leagueId) + @app/db importers + league.findFirst._

**Anchors audited — all CONFIRMED:** §1 junction table (L4 Prisma-sketch 28-29, E6 L4:78, §5 L4:98/103, V45:133 prisma-validate spike, DEC0:46 "deepest migration of the program", L4:55 no-op); §3 all 13 models + every constraint line (207/208/210/211/246/468/542/543/555/628/658/681/935/936/964/965/1016/1140) + INVARIANT-1 doc :446-447; §4 L2-A3:43 ("channel-NAME sharing, not policy"), L2-A1:13-17, DEC0:9/:26 ("junction exists at all"); §5 index.ts:12-16 singleton, package.json:9 provision. **Fresh-grep facts CONFIRMED:** 43 leagueId refs; 13 leagueId-bearing models (exactly the §3 set); 8× league.findFirst; 93 @app/db importers (precise `from '@app/db'` grep).

**Completeness CONFIRMED:** every L1 row 1–47 + M1–M9 appears in §2; counts 50(a)/6(b)/0(c) reproduce.

**Findings:**
1. **CONFIRMED (design hole, strongest)** — §3-A sells KEEP-VESTIGIAL as a "safety net" if a second league is mis-inserted, but the vestigial `@@unique([leagueId,label])` (schema:542) *permits* two same-label periods to coexist, which is the exact precondition under which §2's own row-5 `resolvePeriodId` `findFirst({kind,label})` — no league filter, L1's #1 F-C01 root (L1:63 #2) — stamps the wrong league's period onto the league-id-less fifa_match. The net protects Manager/Standing rows but NOT the single highest-risk site, and per-league deletes L4's E6 fence with nothing proposed to guard the new topology invariant. §3-A and §2 contradict.
2. **CORRECTED (anchor)** — §4 "MT-2 junction waves **W1–W6**" is wrong; L4's waves are **W0–W5** (six, numbered 0-5; V45:130 lists W0:1,2,7,47 / W1:4-6 / W2:8-17 / W3:18-45 / W4:3 / W5:1). No W6 exists.
3. **CORRECTED (parameterization)** — the flat "6 (b)" count silently assumes deployment model R-1. §2 itself says row 35 is "Fine under R-2"; under R-2 (deployment-per-league) it becomes (a), making the split 55(a)/1(b)-ish. Count is plan-dependent, stated flat.
4. **CORRECTED (classification wobble)** — row 46 (elimination) is bucketed (a)* on weak "read-only/idempotent" grounds, yet P5 calls it "load-bearing... defended only by topology" — which is the legend's own (b) criterion and the §2-close "undefended topology invariant" property (a 7th such site, excluded from the "6"). The (a) bucket is defensible only on L4's stronger rationale ("correctly global... must NOT gain league scoping", L4:130), which P5 doesn't cite; the stated reason doesn't distinguish it from M8 (also read-only, classified (b)).
5. **UNVERIFIABLE (inherited discrepancy)** — §4 says "27 policies / 14 tables"; L2-A5 says 27 policies across **16** tables (A1 enumerates 14). P5 matches A1's table count, contradicting A5. Punted to P3 correctly; flag for the P3 verifier.

**Discipline:** picks no fork (line 5 "picks no fork"), SUB-DECISION marked at §3, platform numbers parameterized by N. Clean except finding 3's flat count.

**Overall: CORRECTIONS** — structurally sound (full 56-row + 13-model + all-anchor coverage), but one internal contradiction (§3 safety-net vs resolvePeriodId), one wrong anchor (wave labels), one plan-dependent count, and one classification wobble to fix.

Folded: 3 corrections applied in place.
