# LANE P3 — RLS collapse + auth (per-league fork)
_Per-league-DB spec pass, 2026-07-06. Lane model: Fable (design lane, read-only + this file). Inputs: L2_rls_wc_literal_catalog.md (ground truth, Part A re-pointed not re-derived), DESIGN_NOTES.md §1 pt 2/6, DEC0_DEPENDENCY_MAP.md D-DB row, packages/db/prisma/schema.prisma, render.yaml, packages/auth/src/allowlist.ts, apps/worker/src/provision/plan.ts, 2 Supabase doc checks (cited, retrieved 2026-07-06). Verifier verdict appended at bottom after the independent re-check._

Branch-spec only: everything below is "under per-league → X". No fork recommendation. Variants per pinned taxonomy: **V-a** project-per-league, **V-b** schema-per-league; deployment axis **R-1** shared instances / **R-2** deployment-per-league where relevant. **V-c** (extra CREATE DATABASE in one project) is out of this lane — P1 owns its verify/dismiss; the only P3-relevant note: if it existed, its RLS story would be V-a-per-database **with shared project Auth**, so LM predicates would stay load-bearing exactly as in V-b. Do not design against V-c.

Platform facts pinned (parameterized where tier-dependent):
- **PF-1** Each Supabase project deploys its own Auth instance and its own `auth` schema/`auth.users`, issuing its own JWTs (supabase.com/docs/guides/auth/architecture, retrieved 2026-07-06). ⇒ under V-a, identity is per-project by construction.
- **PF-2** One project can expose N custom schemas through the Data API; the client selects schema per request (`db:{schema}` / `.schema()` / `Accept-Profile` header) after dashboard exposure + role grants to `anon`/`authenticated` (supabase.com/docs/guides/api/using-custom-schemas, retrieved 2026-07-06; no documented cap — treat max-exposed-schemas as parameter `S_max`, unbounded per current doc). ⇒ under V-b every authenticated JWT can *address* every league's schema; **RLS is the only cross-league read barrier**.

## 1. Policy-fate table (all 27 L2-A1 policies + 4 A2 helpers)

Fate vocabulary: **SURVIVES** (unchanged) · **SIMPLIFIES** (predicate collapses, policy stays) · **EVAPORATES** (deletable). Scope-classes are L2's legend. Anchors are the defining migration:line, re-pointed from L2-A1.

| # | object (policy) | scope | V-a fate | V-b fate | note |
|---|---|---|---|---|---|
| 1 | manager.manager_select_own (20260605170000:55) | OWN | SURVIVES | SURVIVES | `user_id=auth.uid()` is intra-league member-vs-member isolation; a single-league DB changes nothing about it |
| 2 | draft.draft_select_league_member (20260605170000:61) | LM | SIMPLIFIES* | SURVIVES† | V-a: league_id join tautological (one league row); residual = member-EXISTS. V-b: the EXISTS is the cross-league barrier (PF-2) |
| 3 | draft_pick.draft_pick_select_league_member (20260605170000:72) | LM (JOIN draft) | SIMPLIFIES* | SURVIVES† | join-through-draft collapses to member-EXISTS under V-a |
| 4 | faab_bid.faab_bid_select_own_pending (20260603223500:95) | OWN+pending | SURVIVES | SURVIVES | pending-status gate is league-orthogonal (blind-bid secrecy between co-members) |
| 5 | faab_bid.faab_bid_select_settled (20260620120000:63) | LM | SIMPLIFIES* | SURVIVES† | the policy that FIXED a cross-league leak (L2 supersede history) — under V-b it is doing that exact job again |
| 6 | faab_bid.insert_own_pending (20260603223500:109) | OWN+pending | SURVIVES | SURVIVES | |
| 7 | faab_bid.update_own_pending (20260603223500:121) | OWN+pending | SURVIVES | SURVIVES | |
| 8 | faab_bid.delete_own_pending (20260603223500:138) | OWN+pending | SURVIVES | SURVIVES | |
| 9 | standing.standing_select_league_member (20260606170000:50) | LM | SIMPLIFIES* | SURVIVES† | |
| 10 | score_manager_period.…_select_league_member (20260606170000:87) | SECDEF | SIMPLIFIES* | SURVIVES† | fate rides on helper row H1 below |
| 11 | pool_pick.pool_pick_select_league_member (20260621120000:87) | LM+CLOCK | SIMPLIFIES* | SURVIVES† | LM half collapses under V-a; CLOCK half (H2) survives BOTH — pre-kickoff pick-hiding is intra-league anti-copy |
| 12 | pool_pick.insert_own (20260610130000:107) | OWN | SURVIVES | SURVIVES | |
| 13 | pool_pick.update_own (20260610130000:120) | OWN | SURVIVES | SURVIVES | no DELETE policy → deny, unchanged both variants |
| 14 | push_subscription.select_own (20260610140000:123) | OWN | SURVIVES | SURVIVES | see §4 F-A08 |
| 15 | push_subscription.insert_own (20260610140000:133) | OWN | SURVIVES | SURVIVES | |
| 16 | push_subscription.delete_own (20260610140000:143) | OWN | SURVIVES | SURVIVES | |
| 17 | notification_preference.select_own (20260610140000:154) | OWN | SURVIVES | SURVIVES | |
| 18 | notification_preference.insert_own (20260610140000:164) | OWN | SURVIVES | SURVIVES | |
| 19 | notification_preference.update_own (20260610140000:174) | OWN | SURVIVES | SURVIVES | |
| 20 | playoff_entry.…_select_league_member (20260614130000:88) | LM | SIMPLIFIES* | SURVIVES† | |
| 21 | match_lineup_entry.…_select_all (20260614120000:69) | GLOBAL | SURVIVES | SURVIVES | USING(true) on shared real-match ref; under V-a the *data* duplicates ×N projects (P1/P2 cost); under V-b duplication is S4-conditional — S4(A) policy+data ×N schemas, S4(B) both live once in `public`. The policy text is variant-invariant |
| 22 | group_standing.…_select_all (20260626120000:80) | GLOBAL | SURVIVES | SURVIVES | same (S4-conditional under V-b) |
| 23 | watchlist.select_own (20260630120000:111) | OWN | SURVIVES | SURVIVES | |
| 24 | watchlist.insert_own (20260630120000:123) | OWN | SURVIVES | SURVIVES | |
| 25 | watchlist.update_own (20260630120000:136) | OWN | SURVIVES | SURVIVES | |
| 26 | watchlist.delete_own (20260630120000:155) | OWN | SURVIVES | SURVIVES | |
| 27 | commish_audit.…_select_commish (20260701120000:115) | LM+C | SIMPLIFIES* | SURVIVES† | league join collapses under V-a; `is_commissioner` half SURVIVES both — commissioner-vs-member separation is intra-league |
| H1 | vsfield_caller_shares_league_with_manager(text) (20260606170000:68) | SECDEF | SIMPLIFIES* | SURVIVES† + **hazard** | V-a: "shares league with" collapses to "caller has a manager row". V-b: body is load-bearing AND its `SET search_path=public` hardening is **wrong per schema** — a per-schema copy pinned to `public` would read the wrong (or no) manager table. Every per-schema copy must pin its own schema |
| H2 | pool_pick_match_kicked_off(text) (20260621120000:62) | SECDEF/CLOCK | SURVIVES | SURVIVES — S4-conditional | league-orthogonal clock gate. V-a: reads that project's fifa_match. V-b: fate of the existing `SET search_path = public` pin depends on S4 — under S4(A) (per-schema fifa_match replica) the pin is a hazard and must be re-pinned per schema; under S4(B) (shared `public` reference tables) the pin is CORRECT as-is |
| H3 | mirror_auth_user_to_app_user() (20260606010000:16) | SECDEF trigger | SURVIVES (per-DB) | **FORKS** — see §3/S3 | runs per database: under V-a each project mirrors its own auth.users (PF-1), byte-identical. Under V-b ONE auth.users must feed N schemas' app_user (or one shared) — trigger rewrite either way |
| H4 | enforce_lineup_lock() (20260606180000:48) | trigger | SURVIVES | SURVIVES | body verified schema-free (only NEW/OLD/TG_OP + pg_catalog — 20260606180000:11-13); the function itself is copy-paste-safe and could even be shared once across schemas under V-b; the per-schema work is only the CREATE TRIGGER wiring on each schema's lineup_slot |

\* **SIMPLIFIES under V-a is OPTIONAL.** The tautological league_id join is correct, free, and behavior-identical at one-league-per-DB — the zero-diff stance (keep all 27 byte-identical) preserves ONE migration history across all N projects **and across the D-DB fork itself** (the same SQL is valid under one-DB and V-a). See SUB-DECISION S1.
† **SURVIVES-load-bearing:** under V-b the member-EXISTS half of the predicate is promoted from belt-and-braces to the *sole* cross-league read barrier (PF-2).

## 2. Net delta (vs the one-DB baseline)

One-DB baseline (L2 verdict, DESIGN_NOTES §1 pt 6): all 27 policies N-league-safe **as-is**, zero policy work; MT-2 residual = Realtime channel-NAME scoping only.

| variant | EVAPORATES | SIMPLIFIES | SURVIVES | new authz work the baseline doesn't have |
|---|---|---|---|---|
| V-a | **0 of 27** (0 of 4 helpers) | 8 policies + H1 (all optional — S1) | 19 policies + H2/H3/H4 | none in-database; the deleted work is *Realtime channel-NAME scoping* (§5), which is MT-2's item, not an RLS policy |
| V-b | **0 of 27** (0 of 4 helpers) | 0 required | all 27 + 4 (8 promoted to sole barrier) | policy-set **replication ×N schemas** (P2's migration problem; scope of #21/#22 + reference data conditional on S4), per-schema `search_path` re-pinning on H1 (H2 only under S4(A); H4 needs no body edits, only per-schema CREATE TRIGGER wiring), H3 mirror-trigger fork (S3), per-schema PostgREST role grants (PF-2) |

**Headline asymmetry (feeds the D-DB brief):** any "per-league ⇒ RLS collapses" framing (a natural but wrong extrapolation of DESIGN_NOTES §1 pt 2, which covers junction evaporation only — pt 6 is the RLS point, and it runs the opposite direction) is **V-a-only, and even there nothing must be deleted — the safe dividend is zero-diff, not deletion**. Under V-b the RLS surface is 100% retained *and grows machinery* (replication, search_path, grants, trigger fork): V-b is strictly more RLS/authz work than one shared DB. Nothing EVAPORATES under either variant; claims that per-league "deletes the RLS layer" should not appear in the brief.

Why OWN survives everywhere: RLS in this app does two jobs — cross-league isolation (LM) and **intra-league member-vs-member isolation** (OWN: blind FAAB bids #4, 6-8; hidden pool picks #12-13, plus the CLOCK half of #11; private push/notify/watchlist rows #14-19/23-26; own manager row #1). Per-league hosting only ever addresses the first job. 17 of 27 policies are OWN-class and variant-invariant.

## 3. The auth.uid()→manager→league idiom

- **V-a:** the `→league` hop is tautological; the idiom degrades to `auth.uid()→manager` (membership). It must NOT degrade further to a bare `authenticated` grant: Supabase Auth mints sessions at magic-link completion, and the app-layer allowlist gate (packages/auth/src/allowlist.ts:13 `isEmailAllowed`) runs *after* auth — `auth.users` can hold signed-in non-members, so `USING(auth.uid() IS NOT NULL)` would leak to them via direct PostgREST/Realtime. Safe floor = member-EXISTS (see S2 for the Auth-population variable).
- **V-b:** idiom unchanged and load-bearing (each schema's `manager` table is the membership registry for that league; `auth.uid()` resolves identically in every schema because `auth` is shared).
- **H1 vs H2 contrast:** H1 (league-join helper) is the only SECDEF whose *purpose* is the league hop — it tracks the LM fate column. H2 is a clock gate, league-orthogonal, untouched by the fork. Keep the distinction in the brief: "SECDEF" is not one fate class.
- **H3 mirror:** per-database by construction. V-a: N projects × (own auth.users → own app_user) — the *global identity* premise in L2-A2 ("global identity is correct for N leagues") **inverts**: a multi-league human becomes N unrelated app_user rows with different UUIDs (P4 owns any cross-league identity join). V-b: one auth.users, one trigger — but the target `app_user` must be chosen: SUB-DECISION S3.

## 4. Auth fragmentation under V-a (the biggest new constraint of this lane)

- **N identities per human (PF-1):** a multi-league user = N `auth.users` rows, N sessions, N magic-link emails, N JWTs; no cross-project SSO. Session cookies are per-project-ref so they *coexist*, but each league visit needs its own sign-in.
- **Chicken-and-egg under R-1:** the app must know the league to pick the project URL + anon key, but knows the user only after authing against some project. Resolution mechanics are **P4's lane**; P3 flags the shape: hostname/edge-level league→keys binding, or a shared directory store (which quietly reintroduces a shared DB — flag for the brief).
- **R-1 is code-hostile today:** `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` are **build-time inlined into the client bundle** (render.yaml:64-66; service_role at :68 is runtime). One R-1 build cannot carry N projects' keys without a runtime-config rework. **V-a couples strongly to R-2** (each per-league service set inlines its own keys via its own env group) — cross-ref P4/P1.
- **allowlist_email is already league-scoped** (`leagueId` + `@@unique([leagueId,email])`, schema.prisma:233-249) and is seeded by the idempotent provisioning plan (apps/worker/src/provision/plan.ts:69,192-199; CLI at apps/worker/package.json:9). Under V-a it lives per project — no schema change; the *seeder must run per project* (P1). Under V-b: per schema, same story. The `leagueId` column goes tautological under both — keep it (S1 logic).
- **JWT-based Realtime reuse** (browser reuses the Supabase JWT for Realtime) is per-project under V-a: a league-A session cannot subscribe to league-B channels — correct isolation, but it forecloses any future cross-league live surface without N parallel clients.
- **F-A08 push_subscription (endpoint `@unique` global — schema.prisma:1055-1060):** under one shared DB the unique row binds a device to ONE manager ⇒ one-device-one-league. Under V-a (and V-b) each league DB/schema has its own table, so the same endpoint can exist once per league ⇒ the **DB-level limitation dissolves**; the residual **relocates to Web-Push mechanics**: a browser holds one PushSubscription per service-worker registration per origin. R-2 (per-league origins) ⇒ N independent subscriptions, fully fixed. R-1 (one origin) ⇒ one subscription object shared into N DBs, which works only if all leagues push with **one shared VAPID keypair** (subscription is bound to the applicationServerKey used at subscribe time). Verdict: **fixes at R-2, relocates-to-VAPID at R-1**. Fairness note for the brief: the one-DB fix was always a one-line `@@unique([managerId, endpoint])` change — this is a minor per-league dividend, not a driver.

## 5. Realtime publications (L2-A3) per variant

- **V-a:** each project has its own `supabase_realtime` publication; migration-added members (pool_pick 20260610130000:149, score_manager_period 20260606170000:103, standing :110, playoff_entry 20260614130000:111) replay per project via the shared migration set. Channel-NAME scoping **EVAPORATES** — different projects, different sockets, collisions impossible (this deletes MT-2's C3 item, the baseline's only residual). **But** the dashboard-applied `draft`/`draft_pick` publication rows (comment-only record at 20260606170000:92; L2-A3 reproducibility gap) become a **×N manual gap**: every new project needs them re-applied by hand. Per-league provisioning must convert them to a migration/provision step — cross-ref P1; this closes the L2 gap as a side effect.
- **V-b:** one Realtime, one database; the publication is database-wide and must enumerate **each schema's copies** of the 4-6 published tables (×N publication memberships — P2 migration machinery again). Channel-NAME scoping **SURVIVES verbatim** as the one-DB MT-2 C3 item (shared socket, shared names). postgres_changes rows remain RLS-filtered per schema, which works precisely because §1's V-b column keeps every policy.

## SUB-DECISIONS (for the D-DB brief)

- **SUB-DECISION S1 — V-a policy stance:** (A) zero-diff: keep all 27 policies + H1 byte-identical, league joins run as tautologies — one migration history shared across N projects and across the D-DB fork; reversible; no perf cost at league-size cardinalities. (B) simplify the 8 LM predicates to member-EXISTS — marginally clearer SQL, but forks the migration set from the one-DB world and creates a re-diverge cost if D-DB is ever revisited. Trade-off: A is strictly safer; B buys only readability.
- **SUB-DECISION S2 — V-a Auth population:** (A) invite-only per-project Auth (disable self-serve signup; only that league's members exist in auth.users) — LM collapse to member-EXISTS is belt-and-braces, and even an `authenticated`-grant would *almost* be safe (still unsafe: pre-provision invited users). (B) keep today's open-magic-link + app-layer allowlist model per project — auth.users can hold non-members, member-EXISTS is mandatory. Trade-off: A tightens the perimeter but adds per-project Auth config drift; B is zero-config-change. Under both, §1's V-a fates hold.
- **SUB-DECISION S3 — V-b identity home:** (A) shared `public.app_user` + per-schema tenant tables — H3 unchanged, but every schema's manager→app_user FK crosses schemas (Prisma multiSchema supports it; RLS on public.app_user unchanged). (B) replicate app_user per schema — H3 must fan out to N schemas (dynamic trigger, new failure mode: partial mirror on schema add). Trade-off: A minimizes trigger risk and keeps one identity row per human; B maximizes schema self-containment. Either way H3 is edited — V-b cannot ship it byte-identical.
- **SUB-DECISION S4 — V-b reference-table placement:** (A) full per-schema replica of the global reference tables (fifa_match, match_lineup_entry, group_standing, plus default-deny player/fifa_team) — H2's `search_path = public` pin must be re-pinned per schema, #21/#22 policies and their data replicate ×N. (B) shared-`public` reference tables + per-schema tenant tables (the S3(A) cross-schema-FK precedent) — H2's existing pin stays CORRECT as-is, #21/#22 and their data live once, §5's V-b publication enumeration shrinks to tenant tables. The H2/#21/#22 rows and the §2 V-b work-item list are conditioned on this choice. Trade-off: A maximizes schema self-containment; B eliminates reference-data replication and the H2 hazard. The headline asymmetry (V-b ≥ one-DB work) survives either way — replication and grants still apply to all tenant tables under B.

---
## V-P3 verifier verdict (independent re-check)

_Independent verifier, 2026-07-06 (Fable, read-only). Scope: full anchor audit of the §1 fate table (all 27 policy anchors + H1-H4 read in the migration SQL), completeness count vs L2-A1/A2, §4 code anchors (allowlist.ts, schema.prisma ×2, render.yaml, provision/plan.ts, worker package.json), DESIGN_NOTES §1 pt 2/6 + DEC0 D-DB row cross-refs, both platform facts re-fetched from Supabase docs, discipline scan._

- **Completeness — CONFIRMED.** All 27 L2-A1 policies + 4 A2 helpers present exactly once, correct 1:1 mapping, no missing row. V-b EVAPORATES = 0 everywhere — consistent with V-b's shared Auth + shared Realtime (the † member-EXISTS promotion lands on exactly the 8 LM rows).
- **Anchors — CONFIRMED.** Every policy migration:line anchor exact; H1 `SET search_path = public` + unqualified `manager` reads verified (V-b hazard claim accurate); H2 same pin; H4 20260606180000:48 exact. Two harmless ±3-line drifts inherited from L2 (H3 fn defined at 20260606010000:13, :16 is its SECURITY DEFINER line; dashboard-publication comment at 20260606170000:93, :92 is the section header).
- **Platform facts — CONFIRMED.** PF-1 (per-project Auth/JWTs) and PF-2 (custom schemas via `db:{schema}`/`.schema()`/`Accept-Profile` + dashboard exposure + role grants; no documented cap, `S_max` parameterization correct) both match the cited docs as fetched 2026-07-06.
- **CORRECTION 1 (H4 premise).** `enforce_lineup_lock` has NO schema-object references — the 20260606180000 migration's own comment says the body "references ZERO schema objects" and qualifies "vacuously (it references none)". The lane's "per-schema copies need those qualifications rewritten" is wrong; the fn is copy-paste-safe (could even be shared once under V-b) and only the per-schema CREATE TRIGGER wiring is new work. Fate (SURVIVES) unchanged.
- **CORRECTION 2 (missing SUB-DECISION S4 — V-b reference-table placement).** H2's "that schema's fifa_match replica" and rows #21/#22's data-×N notes silently presuppose full per-schema replication of global reference tables, in tension with the lane's own S3(A) shared-`public.app_user` pattern. Under a shared-reference hybrid, H2's existing `search_path = public` pin is CORRECT (hazard inverts) and #21/#22 live once. Add S4 and condition those three rows + the §2 V-b work list on it. Headline asymmetry (V-b ≥ one-DB work) survives either way.
- **CORRECTION 3 (line 60 attribution).** No "per-league ⇒ RLS collapses" line exists in DESIGN_NOTES; §1 pt 2 covers junction evaporation only (pt 6 is the RLS point, opposite direction). Rephrase the rebutted claim as hypothetical.
- **CORRECTION 4 (§2 OWN examples).** "17 of 27 OWN-class" recounts correct, but the example ranges wrongly include #5 (LM — settled bids are league-visible, not blind) and #11 (LM+CLOCK), and omit #1. Correct to #1, #4, #6-8, #12-13 (+#11's clock half), #14-19, #23-26.
- **Row 5 history — CONFIRMED** (20260603223500:105 global settled-read → 20260620120000:63 league-scoped; V-b re-load-bearing claim exact). **§2 counts — CONFIRMED** (8+19=27 internally consistent). **§4 code anchors — all CONFIRMED**, including render.yaml:64-66 build-time inlining vs :68 runtime service_role. **Discipline — CONFIRMED**: no fork advocacy, S_max parameterized, S1-S3 marked (the one unmarked sub-choice is Correction 2).

**Overall: CORRECTIONS** — the fate table, counts, anchors, and platform facts hold; fold in the four corrections above (S4 and the H4 rewrite are the substantive ones) before the D-DB brief consumes §2's work-item lists.

Folded: 4 corrections applied in place.
