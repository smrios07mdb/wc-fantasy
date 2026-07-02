# Commissioner console — Thread 2b: general stat-line editor (DESIGN-LOCK PENDING)

**Class: SOURCE-ONLY** (no migration). **Status: design proposal — HELD for Chat clearance.**
Branch `feat/commish-stat-editor` off main `b90b5a5` (main includes Thread 2). This thread ships
**this document + a BACKLOG update only** — no adapter/engine code. Implementation is Thread 2b-part-2.

> DoD guard: **no edits to `packages/recompute` or `packages/scoring`** in this thread, and none
> proposed for part-2 beyond the ONE additive overlay merge in `adapter.ts` described in §B4.

---

## PART A — DISCOVERY

### A1 — SCHEMA TRUTH → **SOURCE-ONLY** (the thing Chat clears on)

`manual_stat_player_match` **already has a nullable JSON `extra` column, right now, in prod.** No
migration is needed to store a sparse per-field stat overlay.

`packages/db/prisma/schema.prisma` — the full current `ManualStatPlayerMatch` model, verbatim (857–877):

```prisma
/// PK (match_id, player_id). Feed-gap fields entered by the operator (Cowork): penalty won/committed,
/// plus any other manual values. Read by the scoring function alongside the raw layer.
model ManualStatPlayerMatch {
  matchId          String   @map("match_id")
  playerId         String   @map("player_id")
  penaltyWon       Int      @default(0) @map("penalty_won")
  penaltyCommitted Int      @default(0) @map("penalty_committed")
  /// Other operator-entered values not promoted to columns.
  extra            Json?
  reason           String?
  enteredByUserId  String?  @map("entered_by_user_id")
  dirty            Boolean  @default(true)
  updatedAt        DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  match     FifaMatch @relation(fields: [matchId], references: [id], onDelete: Cascade)
  player    Player    @relation(fields: [playerId], references: [id], onDelete: Cascade)
  enteredBy AppUser?  @relation(fields: [enteredByUserId], references: [id], onDelete: SetNull)

  @@id([matchId, playerId])
  @@index([dirty])
  @@map("manual_stat_player_match")
}
```

**Column set:** `match_id`, `player_id`, `penalty_won` (Int, default 0), `penalty_committed`
(Int, default 0), **`extra` (`Json?` → SQL `jsonb`, nullable)**, `reason` (String?),
`entered_by_user_id` (String?), `dirty` (Boolean, default true), `updated_at` (Timestamptz). PK
`(match_id, player_id)`; index on `dirty`.

**`.extra` is present and already deployed.** Verified against the committed migration, not just the
schema: `packages/db/prisma/migrations/20260603223402_init/migration.sql` — `CREATE TABLE
"manual_stat_player_match"` with `"extra" JSONB,`. So there is no new column, no type change, no
index needed — Prisma `Json?` writes as native `jsonb`, queryable as-is. (A GIN index on `extra`
would be an *optional* future optimization only if key-based JSON querying at volume is ever needed;
it is **not** required to store or read the overlay.)

**⚠️ Naming collision (load-bearing).** `stat_player_match` — the **FEED** stat row — ALSO has its
own `extra Json?` (schema `@@map("stat_player_match")`; migration `"extra" JSONB`). It is a
**different column on a different table**, holds *un-promoted feed* fields (aerials are retained
there per SCORING.md §8; migration `20260613120000_promote_scored_stat_lines` drained five fields
*out* of it into typed columns), and is actively read by ingestion/mapping. **2b touches ONLY
`manual_stat_player_match.extra` (the operator layer). Code and docs must never conflate the two.**

> **A1 verdict: SOURCE-ONLY.** No migration. This is the fact to clear on.

### A2 — ADAPTER SEAM (where a general overlay slots in) + purity

The adapter turns the DB-row bundle into `ScoreInput`. Every raw feed stat is read as
`n(s?.<field>)` where `s = b.stat`; the manual row is consulted **only** for penalties.
`packages/recompute/src/adapter.ts`, `buildScoreInput` (443–511, excerpted):

```ts
export function buildScoreInput(b: ScoreInputBundle): ScoreInput {
  const s = b.stat;                       // L445 — the FEED stat row
  ...
  return {
    role: b.role,
    minutesPlayed: n(s?.minutesPlayed),   // L466  ← raw feed passthrough
    ...
    goals: n(s?.goals),                   // L470
    assists: n(s?.assists),               // L471
    ... /* every §4/§5 count read as n(s?.<field>) */ ...
    highClaims: n(s?.highClaims),         // L497

    teamGoalsAgainst: teamGoalsAgainst(b.team),          // derived (match score)
    goalsConcededWhileOn: goalsConcededWhileOn(b, window),// derived (events + window)

    penaltyWon: n(b.manual?.penaltyWon),         // L502  ← the ONLY manual read
    penaltyCommitted: n(b.manual?.penaltyCommitted), // L503
    penaltyMissed: penaltyMissed(b),             // derived (shots)
    penaltySaved: penaltySaved(b, window),       // derived (shots + window)
    yellowCard: cards.yellowCard, ...            // derived (events)
    ownGoals: ownGoals(b),                       // derived (events)
  };
}
```

`ManualRow` itself carries **only** the two penalty counts — it has no `extra`
(`adapter.ts` 44–47):

```ts
/** `manual_stat_player_match`: the feed-gap fields the operator tags (penalty won/committed). */
export interface ManualRow {
  penaltyWon: number;
  penaltyCommitted: number;
}
```

**`manual.extra` is NOT consumed for any stat today.** The IO wrapper reads it in exactly one place,
to resolve the role-actually-played. `packages/recompute/src/prismaStore.ts`:

```ts
function roleFrom(extra, fallback) {                       // 37–43
  if (extra && typeof extra === "object" && !Array.isArray(extra)) {
    const r = (extra as Record<string, unknown>)["rolePlayed"];
    if (typeof r === "string" && POSITIONS.includes(r)) return r as Position;
  }
  return fallback;
}
...
const manualRow: ManualRow | null = manual                 // 121–123
  ? { penaltyWon: manual.penaltyWon, penaltyCommitted: manual.penaltyCommitted }
  : null;
...
role: roleFrom(manual?.extra, player.position as Position),// 157 — the sole extra reader
```

A repo grep for `.extra` in `packages/recompute/src` returns exactly one hit (`prismaStore.ts:157`).
The stat row (`statRow`, prismaStore 89–119) is built purely from the `stat` table row.

**Purity — confirmed.** `adapter.ts` imports are type-only (`import type … @app/shared`,
`import type … @app/scoring`); no `Date`/`Date.now`/`Math.random`/`prisma`/`fetch`. The sole side
effect is a `console.warn` for the conceded-reconciliation invariant (L456). `buildScoreInput(b:
ScoreInputBundle): ScoreInput` is a **pure function of its argument** and is already exercised by
`packages/recompute/src/adapter.test.ts` — so a per-field overlay is unit-testable from a hand-built
bundle with **no database**. This is the seam a general overlay slots into (see §B4).

### A3 — OVERRIDABLE RAW-FIELD INVENTORY

`StatRow` has **27** fields (`adapter.ts` 13–41) that map **1:1** to the raw counting fields of
`ScoreInput` (`packages/scoring/src/types.ts`). But **only 23 of the 27 actually move points** — the
scoring engine (`packages/scoring/src/index.ts`) never reads four of them. So the *scoring-relevant*
override set is 23, and four are inert-but-carried.

**✅ The 23 scoring-relevant RAW inputs — eligible for override (each moves points):**

| Field | SCORING.md line | Role gate |
|---|---|---|
| `minutesPlayed` | §2 appearance | all |
| `goals` | §3 | all (position-weighted) |
| `assists` | §3 | all (position-weighted) |
| `keyPasses` | §4 (+1/2) | all |
| `dribblesCompleted` | §4 (+1/2) | all |
| `duelsWon` | §4 (+1/3) | all |
| `passesAccurate` | §4 (+1/15) | all |
| `longBallsAccurate` | §4 (+1/2) | all |
| `wasFouled` | §4 (+1/3) | all |
| `bigChancesCreated` | §4 (+1/1) | all |
| `crossesAccurate` | §4 (+1/4) | all |
| `touches` | §4 (+1/25) | all |
| `possessionLost` | §8 (−1/10) | all |
| `clearances` | §4 (+1/5) | **outfield only** |
| `blockedShots` | §4 (+1/2) | **outfield only** |
| `interceptions` | §4 (+1/3) | **outfield only** |
| `tacklesWon` | §4 (+1/3) | **outfield only** |
| `ballRecoveries` | §4 (+1/5) | **outfield only** |
| `saves` | §5 (+1/2 inside, +1/3 outside) | **GK only** |
| `savesInsideBox` | §5 | **GK only** |
| `punches` | §5 (+1/2 punches+high claims) | **GK only** |
| `highClaims` | §5 | **GK only** |
| `shotsOnTarget` | §4 (+1/3) | all |

Role gating (engine `isOutfield` block index.ts 168–186 / `isKeeper` block 188–203) means an override
to an outfield-only field is a **points no-op when role-played = GK**, and a GK-only field is a no-op
for outfield roles. Not a validation error — the raw value is legitimate — just no point movement
unless the role qualifies. The UI should signal this (and the role-played override lives elsewhere,
see §B "rolePlayed co-tenancy").

**⚪ The 4 inert RAW fields — carried into `ScoreInput` but NEVER read by the engine (a points no-op):**
`dribblesAttempted`, `duelsLost`, `passesTotal`, `longBallsTotal`. The engine scores only their
numerators — `dribblesCompleted`, `duelsWon`, `passesAccurate`, `longBallsAccurate` (grep of
`scoring/src/index.ts` returns **zero** references to the four "attempted/lost/total" denominators).
**Recommendation: exclude these 4 from the override allowlist** (the feature is "correct a stat that
affects scoring"). Decision point for Chat in §B (allow-23 vs allow-27-for-fidelity).

**✗ DERIVED OUTPUTS / non-`StatRow` inputs — NOT overridable via `extra` (flagged per the prompt):**

- **`save-outside-box`** — a *derived output*, computed **in the engine** as `Math.max(0, saves −
  savesInsideBox)` (index.ts). Not a stored input; you override the two raw inputs (`saves`,
  `savesInsideBox`) and the engine recomputes it. **Never overridden directly.**
- **`clean sheet`** — derived (`teamGoalsAgainst === 0 && minutesPlayed ≥ 60 && role ∈ {GK,DEF}`).
- **`teamGoalsAgainst`, `goalsConcededWhileOn`** — derived from the match score / event window.
- **`penaltyMissed`, `penaltySaved`** — derived from `shot_match` + on-pitch window.
- **`yellowCard`, `secondYellowMinute`, `redCardMinute`, `ownGoals`** — derived from `event_match`.
- **`penaltyWon`, `penaltyCommitted`** — dedicated `manual_stat_player_match` columns (Thread 2);
  **stay as columns, not overlay keys** — Thread 2 keeps working untouched.
- **`rating` / `ratingSource`** — the Thread 2 `rating_player_match` override path, not this overlay.
- **`role`** — resolved from `extra.rolePlayed` (an existing, separate concern — see §B).

### A4 — REUSE CHECK (Thread 2 write + audit + allowFrozen + restate_pending generalizes)

Yes — Thread 2's shape generalizes to **N fields with exactly ONE audit row per save**, and most of
the path is already field-agnostic.

- **One tx, one audit row.** `commishStatStore.ts` `applyPenalty` (59–87) already writes a **two-field**
  row (`penalty_won` + `penalty_committed`) and **one** `recordCommishAudit` inside a single
  `prisma.$transaction` — a working N-field→1-audit demonstration. A new `applyStatCorrection` mirrors
  it: one `manual_stat_player_match` upsert (`extra` + `dirty:true`) + one audit row, atomically.
- **Rescore is field-agnostic.** `createCommishRescore` (155–181) takes only `(matchId, playerId)`,
  calls `recomputePlayerMatch` → `scorePlayerMatch(buildScoreInput(bundle))` (no field parameter, no
  penalty/rating branching), then restates affected manager-periods + standings with
  `{ allowFrozen: true }`. **It re-scores "whatever the raw rows now say"** — so once the overlay lands
  in `extra` and the adapter merge (§B4) consumes it, the existing rescore restates correctly with
  **zero change**.
- **Frozen override + restate_pending reused verbatim.** `handleStatCorrection.ts` `fireRescore`
  (124–136) already converts a post-commit rescore throw into a **200 `restate_pending`** (not a 500),
  and `outcomeFields` (140–149) surfaces `scored:false → warning:"no_match_participation"`. Both apply
  unchanged.
- **Action type needs no migration.** `commish_audit.action_type` is **free TEXT, deliberately not a
  Prisma enum** (schema 1107, 1119–1120). `stat_correction` is **already a member** of
  `COMMISH_ACTION_TYPES` in `packages/shared/src/commish.ts:43` (`CommishActionType` union) — present,
  currently unused (Thread 2 stamps `penalty_applied`/`rating_override`). No migration, no union edit.

**Proposed audit shape for a stat correction** (mirrors the penalty block `handleStatCorrection.ts`
213–228; `recordCommishAudit` carries free-string `summary`/`detail`/`reason`/`delta` +
`targetRef {matchId, playerId}`):

```
actionType : "stat_correction"
summary    : "Stat correction (N field[s]): goals 1→2, assists 0→1"     // compact human line
detail     : FROZEN_NOTE when period frozen, else the full before→after per-field list
reason     : <required, trimmed>
targetRef  : { matchId, playerId }
delta      : "goals 1→2 · assists 0→1"   // free string; a per-field change list, NOT a pts total
reversible : true
```

> The point delta is intentionally **not** computed in the handler (the engine owns points; the
> handler writes raw values, the rescore restates points). `delta` records the raw field changes.

---

## PART B — DESIGN PROPOSAL (HELD for Chat clearance)

### B1 — Overlay semantics: field-level SPARSE override (COALESCE, manual-wins, feed-passthrough)

Per overridable field: **manual value wins; the feed passes through wherever the overlay is unset.**
The merge is the resolver's own first-non-null idiom, expressed per field:

```
effective(field) = n( overlay[field] ?? stat[field] )
```

- `overlay[field] = 0` **wins** (nullish `??`: `0` is not nullish → the correction "set goals to 0"
  is honored).
- `overlay[field]` **absent** → the feed value passes through (`undefined ?? stat[field]`).

**REJECT row-level wholesale replace.** A partial overlay must **never** zero an unspecified feed
field. The sparse per-field COALESCE guarantees this: an unset key is invisible to scoring — the feed
is authoritative for it. (A "replace the whole stat row" model is explicitly rejected — it would
silently zero every field the operator didn't type.)

### B2 — Storage: sparse `{ statOverrides: { <key>: <int> } }` inside `manual_stat_player_match.extra`

- The overlay lives in the **existing** `manual_stat_player_match.extra` jsonb (A1) — **no migration.**
- **Namespaced under a `statOverrides` sub-key**, NOT flat at the top level. Rationale: `extra` is
  shared with `rolePlayed` (read by `roleFrom`, prismaStore 37–43, 157). Namespacing keeps `roleFrom`
  (which reads top-level `extra.rolePlayed`) **byte-untouched**, and makes clear-all a single-key drop:

  ```jsonc
  // manual_stat_player_match.extra
  { "rolePlayed": "GK",                    // existing §3 concern — untouched by 2b
    "statOverrides": { "goals": 2, "assists": 1, "saves": 4 } }  // 2b sparse overlay
  ```

- **Penalty columns stay AS-IS** (`penalty_won`/`penalty_committed` dedicated Int columns) so Thread 2
  keeps working. Penalties are **not** overlay keys.
- **Reason required** on every write (mirrors Thread 2; trimmed, non-empty → else `reason_required`).
- **Read-modify-write, or write only the `statOverrides` sub-key** — the 2b writer must **preserve
  every other `extra` key** (`rolePlayed` and any future key). Note: `rolePlayed` currently has a
  reader but **no writer anywhere** — the stat overlay is likely the **first** `extra` writer, so it
  must not assume it owns the object.

### B3 — Bounded keys: reject unknown keys at the write boundary

- The write boundary accepts **only** keys in the **23-field allowlist** (§A3); any other key → `400`
  (a typo like `goalz` can never inject a phantom stat into the engine).
- **Value validation is mandatory and per-field** — because the adapter's `n(v) = v ?? 0` does **not**
  clamp, a negative or fractional overlay would flow straight into scoring. Require
  `Number.isInteger(v) && v >= 0` for every value (the same `okCount` discipline Thread 2 uses for
  penalties, `handleStatCorrection.ts:202`). *(Optional refinement: per-field sanity caps, e.g.
  `minutesPlayed ≤ 120`; not required for correctness.)*
- **Decision point for Chat:** allowlist = **23 scoring-relevant** fields (recommended — the feature
  is "correct a stat that changes points"; the 4 inert denominators are excluded and documented) vs
  **27 for fidelity** (accept all raw `StatRow` keys, label the 4 inert as no-op in the UI). Default
  recommendation: **23**.

### B4 — The DECISIVE invariant: the overlay must NOT reach the participant gate

This is the sharpest correctness edge (adversarially confirmed). `playerAppearedInMatch(b)` gates on
`statHasData(b.stat)`, and `statHasData` is **any-non-null** (`adapter.ts:341`
`s != null && Object.values(s).some(v => v != null)`). If the overlay were merged **into** `b.stat`,
then a player with **no feed footprint** (`b.stat === null`) would gain a non-null merged row and
**falsely pass the participant gate** — a behavior change vs Thread 2, where a manual-only write does
**not** count as participation (that is exactly why `handleStatCorrection` returns
`scored:false / no_match_participation` pending; asserted in `handleStatCorrection.test.ts`).

**Mitigation (locked into the design):** keep `b.stat` as the **raw feed row** for the gate, and add a
**separate** bundle field carrying the overlay, merged **only inside `buildScoreInput`**:

```ts
// ScoreInputBundle gains one optional field (IO wrapper parses manual.extra.statOverrides into it):
statOverride?: Readonly<Partial<Record<OverridableStatKey, number>>>;

// buildScoreInput merges per field — gate untouched:
const s = b.stat;                 // participant gate keeps reading THIS (raw feed) — unchanged
const ov = b.statOverride;        // sparse overlay
// ... goals: n(ov?.goals ?? s?.goals),  assists: n(ov?.assists ?? s?.assists),  ...
```

`playerAppearedInMatch(b)` continues to read `b.stat` (raw), so a manual-only stat correction on a
player with no feed footprint stays **`scored:false` pending** — identical to Thread 2's penalty
behavior — and folds in when the feed lands the player (which re-dirties the row). The overlay affects
**only the scored values**, never participation. This is the single most important design constraint
for part-2.

*(The IO parse of `manual.extra.statOverrides` → `b.statOverride` happens in `prismaStore.ts`
`getPlayerMatchInput`, bounded to the allowlist keys — defense in depth behind the write boundary. The
adapter never blindly spreads `extra`.)*

### B5 — Clear semantics (absolute + idempotent, same discipline as Thread 2)

- **Clear one field** = drop that key from `statOverrides` → the adapter falls back to the feed value.
- **Clear all** = remove the `statOverrides` sub-key (or set `{}`) → all fields fall back to the feed;
  **`rolePlayed` and the penalty columns are untouched.**
- Every write/clear sets **`dirty = true`** (an UPDATE to the same manual row, so the sweep's Phase-1
  claim — which unions stat+rating+manual — always re-scores; no separate-table re-dirty backstop
  needed, unlike the rating DELETE path).
- **Absolute + idempotent:** the write is a SET (never accumulate), so re-submitting the identical
  correction is a **no-op on points** — the same idempotent-SET discipline Thread 2 proved (commit
  `16c4d16`), and the property the `restate_pending` remedy ("re-submit identical correction") relies
  on.
- **JSON-null hygiene:** if `extra` becomes fully empty after a clear-all with no `rolePlayed`, set the
  column to SQL `NULL` via `Prisma.DbNull` (not JS `null`, which Prisma's `Json?` rejects — the same
  omit-when-absent care `recordCommishAudit.ts:57–60` already takes for `targetRef`).

### B6 — TEST-FIRST SPINE (name it now; RED-first in part-2, before any UI/store code)

**Pure adapter-overlay test — `packages/recompute/src/adapter.test.ts`** (the module is pure; no DB):

> Given a `ScoreInputBundle` with a `stat` (feed) row **and** a sparse `statOverride`, the
> `ScoreInput` returned by `buildScoreInput` has **manual-wins per overlaid field** and
> **feed-passthrough for every unset field** — and an override value of `0` wins over a non-zero feed
> value (nullish semantics), while an absent overlay key leaves the feed value intact (no wholesale
> zeroing).

A companion RED assertion pins the §B4 invariant:

> A bundle with `stat = null` and a non-empty `statOverride` still has `playerAppearedInMatch(b) ===
> false` (the overlay never fabricates participation) — the overlay changes scored values only.

These two are the RED spine written **before** the write boundary, the `prismaStore` parse, the
`applyStatCorrection` store method, or any `/commish` UI. Downstream (part-2) then adds: bounded-key +
Int≥0 write-boundary tests; a gated-PG integration test in the Thread-2 family
(`commishStatCorrection.integration.test.ts`, sibling of `commishStatWrite.integration.test.ts`)
proving atomic write+audit, idempotent SET, and clear-preserves-rolePlayed.

---

## Part-2 build outline (for reference — not this thread)

1. **RED**: the two pure `adapter.test.ts` assertions above.
2. `adapter.ts`: add `statOverride?` to `ScoreInputBundle`; per-field `n(ov?.f ?? s?.f)` merge in
   `buildScoreInput`. *(The only `packages/recompute` edit — additive, gate-preserving.)*
3. `prismaStore.ts` `getPlayerMatchInput`: parse `manual.extra.statOverrides` (allowlist-bounded) into
   `b.statOverride`. Leave `statRow` and `roleFrom` untouched.
4. Pure `handleStatCorrection` handler `handleCommishStatCorrection` + bounded-key/Int≥0 validation +
   `stat_correction` audit; store `applyStatCorrection` (upsert `extra.statOverrides` + audit, one tx,
   read-modify-write preserving `rolePlayed`, `dirty:true`).
5. `POST /api/commish/stat` route; wire the `// TODO(2b)` marker in the Stat-corrections panel to the
   general editor UI.
6. Gate: typecheck/lint/format/test + `@app/web` build + gated-PG. Merge **HELD** (live-scoring write
   path → Sergio merges).

---

## Adversarial verification (5-lane refute pass, opus, against source)

| Lane | Verdict | Note |
|---|---|---|
| A1 source-only | **holds** | `extra Json?` present + deployed (init migration `"extra" JSONB`); collision with `stat_player_match.extra` confirmed. |
| A2 seam + purity | **holds** | raw via `n(s?.f)`; manual only for penalties; `manual.extra` read only at `prismaStore:157` (`roleFrom`); pure. |
| A3 bounded set | **refuted → corrected** | scoring-relevant = **23, not 27**: `dribblesAttempted`/`duelsLost`/`passesTotal`/`longBallsTotal` are unread by the engine. |
| A4 audit reuse | **holds** | one tx / one audit row; rescore field-agnostic; `stat_correction` a pre-seeded union member. |
| participant-gate + shared-extra landmine | **holds** | overlay must bypass `statHasData(b.stat)`; per-field Int≥0 (n() doesn't clamp); `rolePlayed` co-tenancy (latent — no writer yet). |
