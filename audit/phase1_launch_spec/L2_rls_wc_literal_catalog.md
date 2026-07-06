# LANE L2 — RLS Policy Catalog (A) + WC-Format Literal Catalog (B)

_Phase-1 launch-spec pass, 2026-07-06. Lane model: Opus (auditor, read-only). Inputs: packages/db/prisma/migrations/**, audit/AUDIT_LAUNCH_readiness.md Lane C C1b rows (~841-858) + Lane D rows (~897-960). Verifier verdict appended at bottom after the independent re-check._

Method: greped all 30 `packages/db/prisma/migrations/**/migration.sql` for `CREATE/DROP/ALTER POLICY`, `ENABLE/FORCE ROW LEVEL SECURITY`, `SECURITY DEFINER`, `REVOKE/GRANT ... FUNCTION`, `supabase_realtime` (44 hits/12 files; 0 `ALTER POLICY`, 0 `FORCE` — confirms F-C15). Read every policy body + the 3 supersede migrations. Enumerated all 36 Prisma models via `@@map`. Part B: greped `group_md|knockout_round|group_stage` (94 files), `World Cup|WC2026|worldcup|group_standings|KNOCKOUT_ROUNDS|Round of 16|third_place|Group [A-L]`, `TournamentPhase` (20 files), `'group'` phase-gates, over `*.{ts,tsx,prisma,sql,yaml,css}` excluding node_modules/.next/docs/audit; test hits counted, not enumerated. Read enums.ts, constants.ts, map.ts, feed/client.ts, faab/errors.ts, ds.css, MarketingLanding.tsx, PoolClient.tsx.

## PART A — LIVE-STATE RLS policy catalog

Scope-class legend: OWN=own-row (manager.id=row.manager_id AND user_id=auth.uid()) · LM=league-member (EXISTS manager WHERE m.league_id=row.league_id) · LM+C=league-member+is_commissioner · GLOBAL=USING(true) shared reference · SECDEF=via SECURITY DEFINER helper · CLOCK=own-or-kickoff-gated. All hits cross-checked vs audit C1b (~841-858); every migration policy IS in that inventory (no MISSING/contradicted rows) — my value-add is the op-split + MT-2 action column. Server path bypasses RLS (ENABLE-not-FORCE, F-C15 settled).

### A1. Policies (LIVE, after all supersedes)

| table | policy | op | scope | defined at | supersede history | N-league-safe? | MT-2 action | audit |
|---|---|---|---|---|---|---|---|---|
| manager | manager_select_own | SELECT | OWN | 20260605170000:55 | — | Y — user_id=uid | none | known |
| draft | draft_select_league_member | SELECT | LM | 20260605170000:61 | — | Y — predicate on row.league_id | none | known |
| draft_pick | draft_pick_select_league_member | SELECT | LM (JOIN draft) | 20260605170000:72 | — | Y — join to draft.league_id | none | known |
| faab_bid | faab_bid_select_own_pending | SELECT | OWN+pending | 20260603223500:95 | — | Y — own manager | none | known |
| faab_bid | faab_bid_select_settled | SELECT | LM | 20260620120000:63 | replaced bare `USING(status<>'pending')` (20260603223500:105, DROP :58) — was cross-league leak | Y — now league-scoped | none (fixed) | known |
| faab_bid | insert/update/delete_own_pending | INS/UPD/DEL | OWN+pending | 20260603223500:109/121/138 | — | Y — own manager | none | known |
| standing | standing_select_league_member | SELECT | LM | 20260606170000:50 | — | Y — row.league_id | none | known |
| score_manager_period | ..._select_league_member | SELECT | SECDEF | 20260606170000:87 | — | Y — helper joins on league_id | none; SECDEF is the template for future no-league_id tables | known |
| pool_pick | pool_pick_select_league_member | SELECT | LM+CLOCK | 20260621120000:87 | replaced plain LM (20260610130000:96, DROP :81) — added kickoff gate | Y — LM + SECDEF clock | none | known |
| pool_pick | insert_own / update_own | INS/UPD | OWN | 20260610130000:107/120 | — (no DELETE → deny) | Y — own manager | none | known |
| push_subscription | select/insert/delete_own | SEL/INS/DEL | OWN | 20260610140000:123/133/143 | — | Y — own manager | none (but endpoint @unique is global — C3, not policy) | known |
| notification_preference | select/insert/update_own | SEL/INS/UPD | OWN | 20260610140000:154/164/174 | — | Y — own manager | none | known |
| playoff_entry | ..._select_league_member | SELECT | LM | 20260614130000:88 | — (no write → deny) | Y — row.league_id | none | known |
| match_lineup_entry | ..._select_all | SELECT | GLOBAL | 20260614120000:69 | — | Y — shared real-match ref (no league_id) | none | known |
| group_standing | ..._select_all | SELECT | GLOBAL | 20260626120000:80 | — | Y — shared tournament ref (no league_id) | none (UCL: Swiss table reuses USING(true)) | known |
| watchlist | select/insert/update/delete_own | all | OWN | 20260630120000:111/123/136/155 | — | Y — own manager | none | known |
| commish_audit | ..._select_commish | SELECT | LM+C | 20260701120000:115 | — (no write → deny) | Y — LM + is_commissioner | re-scope IF commissioner becomes per-league role (C1c) | known |

### A2. SECURITY DEFINER helpers + function grants (the browser/Realtime backstop plumbing)

| object | migration:line | purpose | hardening | MT-2 |
|---|---|---|---|---|
| `vsfield_caller_shares_league_with_manager(text)` | 20260606170000:68 | league-join for score_manager_period (no league_id col) | STABLE, `SET search_path=public`, REVOKE PUBLIC / GRANT authenticated | none — joins on league_id, generalizes |
| `pool_pick_match_kicked_off(text)` | 20260621120000:62 | kickoff clock-gate reading RLS-denied fifa_match | STABLE, search_path pinned, REVOKE PUBLIC / GRANT authenticated (:77-78) | none — match is global ref |
| `mirror_auth_user_to_app_user()` | 20260606010000:16 | auth→app_user signup mirror (trigger) | SECDEF; REVOKE EXECUTE PUBLIC/anon/authenticated (20260606180000:27-40); self-test asserts | none — global identity is correct for N leagues |
| `enforce_lineup_lock()` | 20260606180000:48 | lock-on-play latch (trigger) | `SET search_path=''` pinned (not SECDEF) | none |

### A3. supabase_realtime publication membership (all idempotent, pg_publication-guarded)
Added by migration: `pool_pick` (20260610130000:149) · `score_manager_period` (20260606170000:103) · `standing` (:110) · `playoff_entry` (20260614130000:111). Added out-of-band via Supabase dashboard, not migration: `draft`, `draft_pick` (per comment 20260606170000:92). Explicitly NOT published (server-only): `faab_bid` (20260620120000:55), `commish_audit` (20260701120000:29), notification tables (push sidesteps Realtime, 20260610140000:8). MT-2: all published tables deliver RLS-filtered rows, so N-league channel scoping already works; C3 open item is channel-NAME sharing (standings/playoffs), not policy.

### A4. RLS-ENABLED, NO-POLICY tables (browser default-deny) — 22 models + `_prisma_migrations`
All enabled by the dynamic loop at **20260605170000:42** (`ALTER TABLE ... ENABLE RLS` for every policy-less public table), except `notification_sent` (explicit ENABLE, no policy, 20260610140000:119) and `faab_bid` (explicit 20260603223500:90, but it HAS policies). Default-deny set: league, app_user, allowlist_email, fifa_stage, fifa_group, fifa_team, player, fifa_match, roster_player, lineup_slot, period, draft_queue, faab_batch, stat_player_match, event_match, shot_match, stat_team_match, rating_player_match, manual_stat_player_match, score_player_match, recompute_dirty, notification_sent, + `_prisma_migrations`. MT-2: all safe (browser never reads; server owner bypasses) — none needs a policy unless a future browser/Realtime feature reads it, at which point tenant tables (period, roster_player, lineup_slot, faab_batch, draft_queue) need the LM/SECDEF pattern.

### A5. Cross-check vs audit C1b (~841-858)
- Completeness: audit C1b enumerates 15 policy rows; I confirm **27 discrete policies across 16 tables** — audit compresses CRUD-own sets into one row (e.g. row 850/855/856 each cover 2-4 policies). No policy in migrations is MISSING from the audit's coverage, and no audit claim is contradicted by the SQL. All rows = **known-to-audit**.
- One nuance not stated in C1b: `draft`/`draft_pick` Realtime publication membership was added via the Supabase dashboard (not a migration) — the migration comment (20260606170000:92) is the only record; a fresh-Postgres DoD DB will NOT have them published. Not a leak (RLS still gates), but a reproducibility gap. **NEW note.**

## PART B — WC-format string-literal catalog (source only; tests counted, not listed)

Kinds: enum-value / phase-gate / period-label / regex / feed-endpoint / season-default / user-copy / branding / schema-comment.

| file | line(s) | literal(s) | kind | UCL-2 action |
|---|---|---|---|---|
| packages/shared/src/enums.ts | 14,18,59,78 | LEAGUE_STATUSES['group'], PERIOD_KINDS['group_md','knockout_round'], STANDING_SCOPES['group_stage'], POOL_PREDICTIONS[HOME/DRAW/AWAY] | enum-value | rename-migration (Prisma enum + this array in lockstep) |
| packages/shared/src/constants.ts | 95-97,103,106-108 | faabBudget WC "ENTIRE tournament" copy, seasonYear 2026, KNOCKOUT_ROUNDS[R32,R16,QF,SF,Final] | enum-value/season/user-copy | rename-migration + copy-rewrite |
| packages/shared/src/periodOrder.ts | 14-37 | MD<n>+KNOCKOUT_INDEX ordering off KNOCKOUT_ROUNDS | period-label | auto-generalizes (downstream of constant) |
| packages/ingest/src/map.ts | 435-441,449,468,478,482 | KNOCKOUT regex table (F-D17 dup copy), THIRD_PLACE_RE, `.includes("group")`, MD{n} | regex | regex-rewrite (core F-D05/D10) |
| packages/ingest/src/ingest.ts | 67,79-90,284-307 | derivePeriodLabel sole caller, country_name→team name, "12 groups ~48 rows" | regex/schema-comment | regex-rewrite + copy |
| packages/feed/src/client.ts | 30-34,156,169,176 | '/fifa/worldcup/v1' base, seasons??[2026]×3, 'group_standings' endpoint | feed-endpoint/season | re-source (new provider/contract) |
| packages/feed/src/types.ts | 2,55,62,340,395 | "FIFA World Cup API", "Group Stage\|Round of 16..." union, "Group A", "group_standings", [2026] | feed-endpoint | re-source |
| packages/pool/src/pool.ts | 100-110,223,228 | group_md/knockout_round result branches | phase-gate | re-source-from-shared |
| apps/worker/src/provision/plan.ts | 117-131,173-175 | group_md/knockout_round period build, KNOCKOUT_ROUNDS validate (hard-reject other labels) | enum-value | re-source (auto once KNOCKOUT_ROUNDS updated) |
| apps/worker/src/commish/transition.ts | 13,93,188-197 | leagueStatus==='group'→'playoff' cutover gate | phase-gate | rename-migration |
| apps/worker/src/commish/transitionStore.ts | 6,92 | `status:'group'` conditional claim | phase-gate | rename-migration |
| apps/worker/src/faab/prismaStore.ts | 23 | `status in ['group','playoff']` | phase-gate | rename-migration |
| apps/worker/src/elimination/{store,prismaStore,memoryStore,selectEliminatedTeams}.ts | store:17,prismaStore:24,memoryStore:42,select:75 | `period.kind='knockout_round'` gate | phase-gate | re-source-from-shared (auto) |
| apps/worker/src/autofire/prismaStore.ts | 88 | `kind:'knockout_round'` | phase-gate | re-source (auto) |
| packages/recompute/src/{recompute,store,standing}.ts | recompute:122,store:23-86,standing | filter kind==='group_md' for standings | phase-gate | re-source (auto) |
| apps/web/src/dashboard/selectTournamentPhase.ts | 24,42-67 | 'group_md'/'knockout_round' keys + `label==='Final'` | phase-gate/period-label | re-source + regex-rewrite |
| apps/web/src/dashboard/selectDashboardPhase.ts | 24-30 | 'group'/'playoff' UI vocab | phase-gate | copy-rewrite |
| apps/web/src/dashboard/resolveKnockoutPhase.ts | (TournamentPhase consumer) | knockout phase branch | phase-gate | re-source (auto) |
| apps/web/src/pool/PoolClient.tsx | 59-68 | ROUND_TITLES{Round of 32...Final,"3P":"3rd Place"} | period-label/user-copy | copy-rewrite |
| apps/web/src/pool/resolvePoolPeriod.ts | 1-41 | THIRD_PLACE_POOL_LABEL='3P', knockout_round synth | period-label | rename-migration / DEC-0-dependent |
| apps/web/src/lineup/view.ts | 331,427 | knockout_round → playoff reduced-roster branch | phase-gate | re-source (auto) |
| apps/web/src/lineup/types.ts | 69 | knockout_round doc | phase-gate | re-source |
| apps/web/app/_landing/MarketingLanding.tsx | 249,505,1290,1311,1341 | "World Cup 2026", "three matchdays", "World Cup fantasy league" | user-copy | copy-rewrite (narrative reframe) |
| packages/faab/src/errors.ts | 213 | "eliminated from the World Cup" | user-copy | copy-rewrite |
| packages/faab/src/faEligibility.ts | 55-66 | fifa_team.eliminated gate | phase-gate | auto-generalizes (mechanism), copy elsewhere |
| apps/web/app/styles/ds.css | 2 | "WORLD CUP FANTASY — DESIGN SYSTEM" header | branding | copy-rewrite |
| apps/web/app/{draft,lineup,vsfield,_landing}/ds.css | :2 each (4 app copies; +9 design/ copies excluded per scope) | same header | branding | copy-rewrite (dedup opportunity) |
| apps/web/app/games/[matchId]/GameDetailClient.tsx | 943 | "Group A" group label | user-copy | copy-rewrite / DEC-0-dependent |
| apps/web/src/games/buildGameDetail.ts | 913-914,930-959 | "Top 2 advance", isQualifying<=2 | phase-gate/user-copy | DEC-0-dependent (fails-safe null for UCL) |
| packages/db/prisma/schema.prisma | 292,382,405,808,810,823 | "knocked OUT of the World Cup", raw "Round of 16" round_name, is_third_place, "/group_standings", "WC2026-ONLY", season 2026 | schema-comment/enum-value | rename-migration + copy |
| render.yaml | 173-199 | group-standings daily cron + WC worker env | feed-endpoint/branding | re-source / delete-for-UCL |

Test-file hits (counted, not enumerated): `group_md|knockout_round` appears in ~48 `*.test.*` files; `World Cup`/`Group A`/`Round of 16`/`worldcup` across map.test.ts, feed.test.ts, buildGameDetail.test.ts, pool.test.ts, thirdPlace.test.ts, plan.test.ts, poolView.test.ts (7+ suites).

### SIZING (F-D15 rename + F-D05/D10 rewrite)
- **F-D15 `group_md`/`knockout_round` rename:** grep = **94 files** total. Removing ~48 test files and 7 historical migrations (immutable — a rename ships a NEW migration, never rewrites old ones), the real edit surface is **~38 non-test source `.ts/.tsx` files + `schema.prisma` enum + 1 new migration**. The audit's "~20+ files" **undercounts ~2×**; however only ~15 of those are hand-edited literal comparisons/keys — the remainder are pure `PeriodKind` consumers that auto-follow if the value is re-sourced from `@app/shared` (F-D17 catch: `map.ts:435-441` keeps an independent KNOCKOUT copy that will NOT auto-follow).
- **TournamentPhase consumers:** grep `TournamentPhase` = **20 files (10 non-test + 10 test)**, NOT the audit's claimed 23 — that count is **overstated**; correct value-add figure is 10 source files.
- **F-D05/F-D10 `derivePeriodLabel` rewrite:** the function + both regex tables (KNOCKOUT `:435-441`, THIRD_PLACE_RE `:449`, group `.includes` `:478`) are **co-located in `packages/ingest/src/map.ts`**, with exactly **ONE non-test caller** (`ingest.ts:67`). Core rewrite = **1-2 files**; the emitted label vocabulary (MD{n}/R32/…/Final/3P) then propagates read-only to `KNOCKOUT_ROUNDS`, `periodOrder.ts`, `PoolClient` ROUND_TITLES, `selectTournamentPhase` `label==='Final'` — downstream rename, not independent rewrites. Genuinely contained.

---

# V2 — Independent verifier verdict (Opus, adversarial re-check)

- **A (RLS): CONFIRMED-with-1-correction.** 27 live policies re-counted exact; supersedes both verified; A4 22-model default-deny list exact; A3 dashboard note verified. Sole error: A5 "16 tables" — policies live on **14** tables, not 16.
- **B (literals): CONFIRMED-with-1-mischaracterization + 6 missed sites.** 10/10 spot-rows verified except the GameDetailClient row (dynamic binding, not a literal). Catalog is source-scoped and misses several user-facing branding/period-label sites.
- **Sizing: CONFIRMED.** 94 `group_md|knockout_round` files (7 migrations + ~48 tests); `TournamentPhase` = 20 code files (10 src + 10 test); `derivePeriodLabel` has exactly ONE non-test caller (`ingest.ts:67`).

### Corrections
- Part A5 — "27 discrete policies across **16 tables**": recount of the CREATE POLICY set = **14** distinct tables (manager, draft, draft_pick, faab_bid, standing, score_manager_period, pool_pick, push_subscription, notification_preference, playoff_entry, match_lineup_entry, group_standing, watchlist, commish_audit). Policy count 27 is correct; table count overstated by 2.
- Part B row `apps/web/app/games/[matchId]/GameDetailClient.tsx:943` — cited as literal `"Group A"`. Line 943 is `<b>{standings.groupName}</b>`, a dynamic binding; no hardcoded "Group A" there. Kind should be data-driven, not `user-copy` literal.
- Part B — `"WC2026-ONLY"` literal is at `schema.prisma:813`, not :810 (trivial line drift; :808 `/group_standings` and :823-824 season 2026 verified).

### Missed sites (WC-format literals absent from Part B)
| file | line(s) | literal(s) | kind | UCL-2 action |
|---|---|---|---|---|
| apps/web/public/site.webmanifest | 2,4 | "XI — The Starting Eleven", "Private World Cup fantasy league." | branding | copy-rewrite |
| apps/web/src/vsfield/knockout.ts | 33-39 | `knockoutRoundName` map (R32→"Round of 32" … Final) — SECOND display-title table parallel to PoolClient ROUND_TITLES | period-label/user-copy | copy-rewrite |
| apps/web/app/layout.tsx | 16 | description: "Private World Cup fantasy league." | branding | copy-rewrite |
| apps/web/app/_auth/AuthChrome.tsx | 16-17 | LEAGUE_NAME="WC Fantasy League", LEAGUE_SEASON="World Cup 2026" | branding | copy-rewrite |
| apps/web/app/commish/CommishConsole.tsx | 211 | `period.kind === "group_md" ? "Group" : "Knockout"` | phase-gate/user-copy | rename-migration + copy |
| apps/web/app/_dashboard/PrimaryBanner.tsx:40,213,228,238; _dashboard/Dashboard.tsx:381,555; app/playoffs/page.tsx:42; app/vsfield/KnockoutUI.tsx:181; app/standings/components.tsx:138 | (as listed) | "Knockouts live/underway", "Matchday · …", "knockout playoffs…group→playoff transition", "Knockout squads run reduced…", "Matchday" col header | user-copy | copy-rewrite |

Checked clean (no WC-format copy, correctly needing no row): `packages/notify/src/*`, `apps/worker/src/notify/*` (trigger copy edition-neutral); `apps/web/src/scoring/scoringData.ts`.

### Recounts (verifier vs claimed)
- Live policies: **27** = 27 ✓ (29 CREATE POLICY − 2 superseded: faab_bid_select_settled, pool_pick_select_league_member — both DROP+replace verified).
- Policy-bearing tables: **14** vs 16 ✗. Prisma `@@map` models: **36** = 36 ✓ (14 policy + 22 default-deny; internally consistent).
- A4 default-deny models: **22** = 22 ✓, list exact (init-era tables covered by the dynamic loop 20260605170000:31-44; later `notification_sent` explicit ENABLE 20260610140000:119; no post-loop no-policy table left RLS-disabled).
- A3 Realtime adds + dashboard-added draft/draft_pick note (20260606170000:92) verified; NOT-published faab_bid/commish_audit confirmed.
- `group_md|knockout_round`: **94** files ✓. `TournamentPhase`: **20** code files ✓ (raw 27 − 7 .md). `derivePeriodLabel` non-test callers: **1** ✓.
