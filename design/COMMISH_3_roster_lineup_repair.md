# Commissioner console — Thread 3: roster / lineup repair (DESIGN-LOCK PENDING)

**Class:** `SOURCE-ONLY` (3a) — see A1. · **Status:** design proposal, **HELD for Chat clearance** (no web
mutation code written this thread). · **Branch:** `feat/commish-roster-repair` off `main @ db2a2bc` (includes
Thread 2 + 2b). · **DoD guard (this thread):** zero edits to `@app/faab`, `@app/lineup`,
`packages/recompute`, `packages/scoring`, or any route — reading only. Output = this doc + the BACKLOG delta.

Thread 3 **surfaces the already-merged worker `commish:roster` / `commish:lineup` / `commish:trim` repairs**
into the `/commish` console. It reuses those mutation primitives verbatim and never re-derives validation. It
is the most dangerous console thread (roster/lineup mutations, live tournament, no live smoke backstop), so
this doc resolves the unknowns and the split is HELD for clearance before any part-2 implementation.

The evidence below was gathered by six parallel source readers + two adversarial verifiers (opus, against
source). Every claim carries a `file:line` citation.

---

## PART A — DISCOVERY

### A1 — MERGE + MIGRATION TRUTH → **SOURCE-ONLY** (the class Chat clears on)

**Merge truth (git-verified ancestry):** the worker `commish` CLI is **already fully merged into
`origin/main`**. Thread 3 is a *new web surface over existing on-main worker logic* — not new CLI logic.
- `roster.ts` / `lineup.ts` / `cli.ts` added by `308a29b` ("commissioner-override CLI for blocked
  roster/lineup repairs") → `git merge-base --is-ancestor 308a29b origin/main` = **ON-MAIN**.
- `trim.ts` added by `17484a1` ("commish:trim playoff force-trim backstop") → **ON-MAIN**.
- `commish_audit` table added by `e29e0eb` (Thread 1) → **ON-MAIN**.

**Migration dependencies (all already in the repo):**

| DB object the primitives touch | Creating migration directory |
|---|---|
| `roster_player_active_ownership_uq` (first-come ownership) | `20260603223500_invariants` |
| `enforce_lineup_lock()` fn + `trg_lineup_slot_lock` (lock-on-play latch) | `20260603223500_invariants` |
| `app.commish_override` GUC trigger exemption (the `--allow-locked-slot` carve-out) | `20260611120000_lock_on_play_commish_override` |
| `lineup_slot` table | `20260603223402_init` |
| `playoff_entry` table | `20260614130000_playoff_entry` |
| `commish_audit` table + commissioner-only SELECT RLS | `20260701120000_commish_audit` |

**Action-type union (code-only, no migration):** `commish_audit.action_type` is a free `TEXT` column (NOT a
pg enum); the closed set lives in the `as const` union `COMMISH_ACTION_TYPES` (`packages/shared/src/commish.ts:41`).
It **already contains `"roster_repair"` and `"lineup_repair"`** — so Thread 3's audit action strings need
**no migration and no union edit**. (Only a distinct `"roster_trim"` string would need a one-line union add,
still no migration — see A3 for why we recommend reusing `roster_repair` and skipping even that.)

> **A1 verdict — SOURCE-ONLY.** Given the SAFE-repairs-only 3a slice (window-bypass add, edit-window-bypass
> lineup, unlocked-player drops/trim — and **explicitly NO `--allow-post-kickoff`, NO `--allow-locked-slot`
> GUC**), Thread 3a is **source-only (no migration)**: it adds only a web route + handler + store-adapter +
> UI writing into the pre-existing `commish_audit` ledger. The one migration-class dependency in the CLI
> surface — the `app.commish_override` GUC exemption (`20260611120000`) — is invoked **only** on the
> `--allow-locked-slot` path, which 3a excludes. There is **no `prisma migrate diff` output, no
> `migrate deploy` step** for 3a. (Repo-state only: whether these migrations are *live-applied* to prod is
> Sergio's `_prisma_migrations` check — not verifiable from source.) **3b, if ever surfaced, remains
> source-only too** (the GUC migration already exists), but it is deferred on integrity grounds, not
> migration grounds — see A4/B1.

---

### A2 — PRIMITIVE SURFACE (reused verbatim; ALWAYS-enforced vs bypass)

Every signature below is quoted from source; each primitive is called **as-is** — no body edit is required
(verifier V1 sub-claim (d): CONFIRMED).

#### `claimFreeAgent` — the $0 first-come FA claim (roster add)
`packages/faab/src/store.ts:178-187`:
```ts
claimFreeAgent(input: {
  leagueId: string; managerId: string; playerAddId: string; playerDropId: string | null;
  runAt: Date; periodId?: string | null; allowEliminated?: boolean;
}): Promise<"granted" | "conflict">;
```
Real impl `packages/faab/src/prismaStore.ts:604-671` (one `$transaction`).
- **ALWAYS enforces (no param relaxes these):** cleared-batch window (`T = window?.batchClearedAt ?? null;
  if (T === null) throw FaConflict` `:626-627`), live-unowned (`:643-646`), `roster_player_active_ownership_uq`
  first-come (`create` `:662-664` → P2002 ⇒ conflict), valid-drop (`dropped.count !== 1 ⇒ conflict`
  `:649-653`), slot-release on drop (`releaseDroppedPlayerSlots` `:656` — **unlocked slots only**).
- **Bypass params:** `allowEliminated` (default false) relaxes ONLY the add-side eliminated-team belt
  (`:635-637`) — SAFE (A4); `periodId` re-scopes how the window instant `T` is resolved (`:625`), does NOT
  relax the cleared-batch gate (verifier: a pin whose batch is still sealed → `T===null` → `"conflict"`).
- **Returns** `"granted"` / `"conflict"`; whole tx rolls back on any guard violation. **No GUC anywhere in
  the body** (V1: CONFIRMED GUC-free).

#### `validateFaGrant` — PURE cap/valid-drop validator (reused verbatim)
`packages/faab/src/validate.ts:172-187` → `checkDropAndRoster` `:192-227`.
- **Neutralizable gates** (a single IO input flips each off — the deliberate commissioner bypass): `windowState`
  (→ `"free-agency"`), `faEligible` (→ `true`), `dropLocked` (→ `false`), `isPlayoffParticipant`.
- **ALWAYS enforced (structural, only satisfiable by a genuinely legal move):** `rosterCap` (`total > cap ⇒
  rosterIllegal` `:224`), `ownedByManager` drop-ownership (`:210`), `counts`/`squadSize`, `drop ≠ add`.
  This is the same `checkDropAndRoster` the live bid path calls (`:129`).

#### `releaseRoster` — drop-only trim / force-drop
`packages/faab/src/store.ts:228-232`:
```ts
releaseRoster(managerId: string, dropIds: readonly string[],
  opts: { now: Date; periodId: string | null; allowLocked: boolean }): Promise<{ releasedSlots: number }>;
```
Real impl `packages/faab/src/prismaStore.ts:830-882`.
- **ALWAYS:** active-only drop (`droppedAt: null` `:847-850`, idempotent), unlocked-slot release for every drop
  (`releaseDroppedPlayerSlots` `:854-856`).
- **`allowLocked: false` (the 3a path):** GUC-free; releases only UNLOCKED slots; **fail-loud coverage guard**
  aborts if a drop is still locked (`if (!allowLocked) { const stillLocked = findLockedSlotPlayerIds(...); if
  (stillLocked.size > 0) throw ReleaseStaleLockError }` `:875-878`).
- **`allowLocked: true` (3b DANGEROUS):** (1) `SET LOCAL app.commish_override = 'on'` (`:837`); (2) an ADDITIONAL
  hard `deleteMany({ where: { managerId, playerId, lockedAt: { not: null }, period } })` of the locked slot
  (`:857-869`); (3) skips the fail-loud guard. See A4/A5.

#### `validateLineup` / `saveLineup` — lineup edit
`packages/lineup/src/validate.ts:185` `validateLineup(squad, proposedXI, slotStates, period, now,
forfeitConfirmed?)` → `LineupValidation`. The **edit-window** is the pure app-level step (1) over
`period.status` / `period.closesAt` (`:197-201`); the rest (playoff cap, ownership, XI size, play-state/forfeit,
formation) is pure. There is **no DB trigger on the period table**.
`saveLineup(commit: LineupCommit)` `packages/lineup/src/prismaStore.ts:88`:
- **`allowLockedSlot: false` (the 3a path):** GUC line `if (override) SET LOCAL app.commish_override = 'on'`
  (`:94`, `override = commit.allowLockedSlot === true` `:89`) **never runs**; the store's own latch re-check runs
  (`:106`); CREATE is of an unlocked slot; an `is_starter` UPDATE is guarded `lockedAt: null` (`:161`) so a
  locked row matches zero rows. The DB latch stays fully armed.
- **`allowLockedSlot: true` (3b DANGEROUS):** empties phase-4 `slotStates`, skips the re-check, sets the GUC,
  force-moves a played player's `is_starter`.

**Worker orchestrators (candidate for verbatim reuse):** `runRosterOverride(deps, input)` (`roster.ts:76`,
`RosterDeps` `:18-33`), `runLineupOverride` (`lineup.ts`), `runTrimOverride` (`trim.ts`) — all
dependency-injected (`{ now, store, getAddMatch, log }` etc.), so a web handler can drive them with a
web-runtime store. See B2 for the reuse-architecture decision (they currently live under `apps/worker/`).

---

### A3 — AUDIT BRIDGE (CLI stdout → persisted `commish_audit`)

**The CLI's audit is stdout-only.** `formatAudit(r) = `commish-override ${JSON.stringify(r)}`` (`core.ts:168-170`)
over an `AuditRecord` (`core.ts:143-165`: `command / commissioner / team / managerId / action / add? / drop? /
period? / starters? / released? / reason / kickoffBypassed / lockOverride? / timestamp`), printed via
`deps.log` (`cli.ts` wires `console.log`). **No `commish_audit` DB write exists in roster/lineup/trim/cli** —
the STOP-SEAM "no new table" rule (`core.ts:141`). **The web surface is what persists the ledger row**, via
Thread 1's `recordCommishAudit`.

**`recordCommishAudit` mapping** (`apps/web/src/commish/recordCommishAudit.ts`):
```ts
recordCommishAudit({
  leagueId, actorUserId, actionType, summary, detail?, reason?, targetRef?, delta?, reversible?
}, insert = defaultInsert)
```
- `targetRef` is **conditionally spread** — the field is OMITTED when null/undefined (Prisma `Json?` rejects a
  JS `null`). Thread 3 passes a real object or omits; **never `null`-with-intent**.
- `reversible` defaults `false`; the Thread-2 handlers pass `reversible: true`.
- The `insert` seam is injected so the audit row folds into the caller's `$transaction` (see the atomicity
  note in B4 — the reused mutation primitives own their own tx, so 3a's audit is a *post-mutation* write).

**Proposed action strings** (as `@app/shared` union members — already present, **no migration, no union edit**):

| 3a repair | `action_type` | `target_ref` | `detail` (bypass flags used) | `delta` (human move) |
|---|---|---|---|---|
| Roster add / add-drop | `roster_repair` ✔ exists | `{ managerId }` | `"window+eligibility bypass"` (+ frozen-note if applic.) | `"+Haaland / −Kane"` |
| Roster trim / multi-drop (unlocked) | `roster_repair` ✔ (reuse) | `{ managerId }` | `"drop-lock bypass · 3 released"` | `"trim: −A, −B, −C"` |
| Lineup edit | `lineup_repair` ✔ exists | `{ managerId, periodId }` | `"edit-window bypass"` (+ frozen-note) | `"XI: +P −Q"` |

> Recommendation: **reuse `roster_repair` for the trim/multi-drop** (a trim *is* a roster repair) to keep 3a a
> pure web-only slice with zero shared-package edits. A distinct `roster_trim` string is optional (one-line
> union add, no migration) if the audit log wants the finer label — flag for Chat.

**Honest `reversible`** (this is the part the stat writes did NOT have to reason about — a stat overlay is an
absolute idempotent SET, always trivially reversible; a roster/lineup move is contingent):
- **Add** → `reversible: true`. Undo = drop the added player, itself a SAFE 3a op — *contingent* on that slot
  not having locked-on-play by reversal time; if it has, the undo is a 3b op and the reversal **fails cleanly**
  (never a second history rewrite).
- **Drop** → `reversible: true` **contingent**. Undo = re-add via `claimFreeAgent`, which `"conflict"`s if the
  player was re-claimed or the window re-sealed. The reversal re-validates live and fails cleanly — it does not
  silently corrupt. (We mark `true` so the `reversed_at` path stays open, but the reason line notes the
  re-add is contingent on the player still being live-unowned.)
- **Lineup edit** → `reversible: true` if no slot has since locked; the undo re-saves the prior XI via the same
  SAFE path. A slot that locked in the interim makes the undo a 3b op → fails cleanly.
- **Any 3b DANGEROUS op** → `reversible: false` **always** (it rewrote known/frozen history; undo would be a
  second rewrite). The `reversed_at`/`reversed_by_user_id` columns + the `action_reversed` union member remain
  the future undo-slice path — 3a sets `reversible: true` on repairs to keep it open.

---

### A4 — DANGEROUS-BYPASS INVENTORY → **THREE capabilities, not two** (the inventory Chat clears on)

Verifier V2 REFUTED "exactly two dangerous bypasses": `--allow-locked-slot` is **one flag string but two
structurally distinct GUC-gated DB writes** against the same lock-on-play trigger (a lineup UPDATE and a trim
DELETE). Counted by capability / DB write-path (the correct unit for a UI-safety inventory), the DANGEROUS set
is **three**:

| # | Capability | Path | GUC? | Invariant broken | What a web UI needs to make it safe |
|---|---|---|---|---|---|
| **D1** | `--allow-post-kickoff` roster add | `roster.ts` → `kickoffGuard` default-BLOCK, honored only with the flag (`core.ts:98-106`) | No (app-level) | **Matchday roster frozen at kickoff** — a retroactive add/drop imports already-KNOWN points, rewriting history (`roster.ts:5`: "his points are already known") | type-to-confirm player+fixture, `reversible:false`, loud persisted audit banner. **Recommend CLI-only for now.** |
| **D2** | `--allow-locked-slot` lineup **force-MOVE** | `lineup.ts` empties phase-4 + `saveLineup` GUC `SET LOCAL app.commish_override='on'` (`prismaStore.ts:94`), UPDATE a played player's `is_starter` | **Yes** | **Lock-on-play latch (UPDATE side)** — changes which XI scored | type-to-confirm, `reversible:false`, loud persisted audit |
| **D3** | `--allow-locked-slot` trim **force-DROP** | `trim.ts` → `releaseRoster{allowLocked}` GUC (`faab/prismaStore.ts:837`) + hard DELETE of the locked slot (`:857-869`) | **Yes** | **Lock-on-play latch (DELETE side)** — removes a played starter from the scored XI | type-to-confirm, `reversible:false`, loud persisted audit; **block/extra-confirm a pinned CLOSED period** (amplifier below) |

The DB latch that D2/D3 relax (`enforce_lineup_lock()`, migration `20260611120000`): the DELETE branch RAISEs on
`OLD.locked_at IS NOT NULL` (`:37-42`) unless the GUC exemption (`:24-27`) is set — the migration's own embedded
self-test proves "blocked WITHOUT the GUC, allowed WITH it" (`:99-123`).

**D3 amplifier (flag for 3b):** the auto path scopes the locked-slot DELETE with `status: { not: "closed" }` to
deliberately spare historical closed-period slots "scoring still reads"; a **pinned** period uses `{ id: periodId }`
with NO closed-exclusion (`faab/prismaStore.ts:861-867`) — so `--allow-locked-slot` + a pinned CLOSED period
widens the blast radius to a locked slot in an already-scored period. It rides on `allowLocked` (never bites
alone), but a web UI must treat a closed-period pin under lock-override as extra-loud / extra-confirmed.

**Two candidate "dangers" that are actually SAFE** (verifier-cleared):
- `allowEliminated: true` — a **soft roster-composition rule**, not a scoring-integrity invariant. An eliminated
  team plays no further matches → the added player scores 0 going forward (`PROJECT.md:842`: pre-gate behavior
  merely let a player "field a 0-point slot"). It rewrites NO known result and relaxes ONLY the add-side belt
  (`:635-637`); every hard invariant (window / live-unowned / ownership-unique / valid-drop / cap) stays
  enforced. → **SAFE (3a).**
- `--period` / `pinnedPeriodId` — re-scopes only how the window instant `T` is *read* (`:625`); it CANNOT write
  into a sealed period (cleared-batch gate is unconditional, `T===null ⇒ "conflict"`). → **SAFE (3a)** as an
  independent axis. (Only as a *pinned* period under `allowLocked` does it become the D3 amplifier.)

---

### A5 — RUNTIME SAFETY: the SAFE slice needs **no worker context and no GUC**

**Confirmed (V1 sub-claims (b)/GUC hunt).** The GUC is set from `@app/web` request runtime in **zero places
today** — the only two `SET LOCAL app.commish_override` call sites are `packages/faab/src/prismaStore.ts:837`
(gated `if (allowLocked)`) and `packages/lineup/src/prismaStore.ts:94` (gated `if (override)`), and the web
lineup route never sets `allowLockedSlot` (`controller.ts:76` builds the commit without the key → `undefined` →
`override=false`). The 3a slice keeps both gates false:
- `claimFreeAgent` — no `$executeRawUnsafe` / `SET LOCAL` anywhere in its body (`prismaStore.ts:604-671`).
- `releaseRoster{allowLocked:false}` — GUC line skipped; releases only unlocked slots.
- `saveLineup{allowLockedSlot:false}` — GUC line skipped; the edit-window bypass is carried entirely by
  `relaxPeriodLock` (a pure in-memory `{ status:"open", closesAt:null }` rewrite, `core.ts:135-139`).

All three primitives run on the `@app/web` prisma singleton (`packages/db/src/index.ts:12`) — the **same
runtime clearance Thread 2 relied on for `allowFrozen`** (`@app/recompute/prisma` is already imported in web
request runtime). **No SAFE 3a repair needs the GUC** → the dangerous machinery stays out of 3a. (Had any SAFE
repair required the GUC, this thread would STOP and report — it does not.)

---

### A6 — RECOMPUTE: restate via `recomputeManagerPeriod`, **not** `createCommishRescore`

A roster/lineup repair changes **which players' slots the manager owns in a period** — it does NOT change any
player's `score_player_match`. So the Thread-2 `createCommishRescore` (`commishStatStore.ts:211`) is the WRONG
entrypoint: its first step is `recomputePlayerMatch(matchId, playerId)`, a per-`(match,player)` stat re-score.

The correct restate is the **tail** that `createCommishRescore` itself runs (its lines `218-233`), called
directly as public `@app/recompute` orchestration:
```ts
recomputeManagerPeriod(store, managerId, periodId, { allowFrozen: true })   // recompute.ts (allowFrozen at :99)
  then store.markManagerPeriodProcessed(ref)                                 // drain the frozen-period marker
  then recomputeStanding(store, leagueId)                                    // recompute.ts:121
```
`recomputeManagerPeriod` re-reads the CURRENT slot set (`getManagerPeriodSlots` `prismaStore.ts:242`) and
re-sums the starter slots against their `score_player_match` rows (`recompute.ts:103-108`) — so a repair's
changed membership is picked up. `recomputeStanding` re-derives the league's all-play-all `standing`.
- **`allowFrozen: true`** (commissioner override) + `markManagerPeriodProcessed` are both required — a frozen
  period would otherwise leave a marker the worker sweep (run without `allowFrozen`) re-skips forever (the exact
  reasoning at `commishStatStore.ts:206-209`).
- Web-runtime-safe: same prisma singleton + `createPrismaStore(prisma)` that `createCommishRescore` already uses.

**Open design point (B3):** the *affected `(manager, period)` set*. Lineup repair = the one edited period.
Roster add/drop = the period(s) whose `lineup_slot` membership changed by the drop's slot-release (at minimum the
pinned/current period), then standing. There is no `matchId` to key `getAffectedManagerPeriods` off, so the
handler derives the set from the managerId + the touched slots (proposal in B3).

---

## PART B — DESIGN PROPOSAL (HELD for Chat clearance)

### B1 — SLICE SPLIT (confirm 3a/3b structure; **correct one item of the prior**)

**CONFIRMED:** 3a = SAFE repairs only → source-only, no GUC, no migration; 3b = the DANGEROUS bypasses,
DEFERRED, each getting **type-to-confirm + loud persisted audit + `reversible:false`** if ever surfaced (a
Thread-5-class UX, not a casual button). **Recommend keeping `--allow-post-kickoff` (D1) CLI-only for now.**

**CORRECTION (the crux Chat clears on):** the prior lumped **"force-trim" into 3a SAFE — that is wrong for a
*played* player.** Force-dropping a locked-on-play player is **inseparable from the GUC** (`allowLocked:true`
sets `app.commish_override` AND hard-DELETEs the locked slot; the trigger blocks the DELETE without it —
A4/D3). `allowLocked:false` cannot substitute: it releases only unlocked slots and throws
`ReleaseStaleLockError` on a played drop (`faab/prismaStore.ts:875-878`). So:

| Slice | Repairs | Bypass surface | GUC | Class |
|---|---|---|---|---|
| **3a (now)** | **A.** Roster add (window+eligibility+drop-lock bypass) · **B.** add/drop where the drop is an UNLOCKED player · **C.** Lineup edit (edit-window bypass, `allowLockedSlot:false`) · **D.** Trim / multi-drop of UNLOCKED over-cap players (`allowLocked:false`) | window / eligibility / drop-lock / edit-window (all app-level or in-memory) | **none** | SAFE, source-only |
| **3b (deferred)** | **D1** post-kickoff add · **D2** lineup force-move played player · **D3** trim/force-drop played player (+ closed-period-pin amplifier) | `--allow-post-kickoff` · `--allow-locked-slot` (×2 writes) | D2/D3 set the GUC | DANGEROUS, Thread-5-class |

3a's drop/trim capability is thus **"release unlocked (not-yet-played) roster players"**; the played-player cut
is 3b. 3a REFUSES a locked drop cleanly (`ReleaseStaleLockError` for trim; `lockedPlayerMoved` conflict for a
lineup move; kickoff-guard BLOCK for a post-kickoff add) and **sets no GUC / writes no mutation** on refusal —
proving 3a can never accidentally perform a 3b op. That "3a can't reach 3b" property is a RED test (B5).

### B2 — REUSE-ONLY discipline + the one structural seam

Validation is **never re-derived**: `validateFaGrant` / `checkDropAndRoster` / `validateLineup` (the cap,
valid-drop, ownership, formation, XI, lock-on-play logic) are pure functions already in `@app/faab` / `@app/lineup`,
reused verbatim; the mutation primitives `claimFreeAgent` / `releaseRoster` / `saveLineup` are called as-is
(V1(d): no primitive edit needed).

**The seam to clear:** the thin *orchestration* (gate → reason → idempotency `rosterEndStateHolds` → `kickoffGuard`
→ `relaxPeriodLock` → `validateFaGrant`-neutralization → primitive call) currently lives under
`apps/worker/src/commish/{roster,lineup,trim,core}.ts`, and the runners are fully dependency-injected.

- **Recommended — Option 1 (extract-and-share):** relocate the pure, DI orchestrators (`runRosterOverride` /
  `runLineupOverride` / `runTrimOverride`) + `core.ts` helpers into a shared package both the worker CLI and the
  web handler import (e.g. `@app/commish-core`). Web then provides a web-runtime store (the existing
  `@app/faab` / `@app/lineup` prisma stores are already runtime-agnostic) + `getAddMatch` + `now` + a captured
  `log`, and calls the runner with `allowPostKickoff:false` / `allowLockedSlot:false`. **Zero re-derivation.**
  This is a *mechanical relocation* (no logic change) touching `apps/worker` (allowed) + a new package (allowed) —
  it does NOT edit the DoD-frozen `@app/faab` / `@app/lineup` / `packages/recompute` / `packages/scoring` /
  routes. **Flag for clearance:** it moves worker files, so it needs Sergio's nod that "reuse verbatim" may mean
  "relocate the runner," not "duplicate it."
- **Fallback — Option 2 (web re-orchestrates, imports the pure helpers):** the web handler mirrors the
  `handleStatCorrection` skeleton and imports the pure `core.ts` helpers (`relaxPeriodLock`, `kickoffGuard`,
  `rosterEndStateHolds`) rather than rewriting them, calling the primitives directly. Slightly more web glue;
  same no-re-derivation guarantee **only if** the helpers are importable (which again implies extraction). If
  extraction is judged to violate "additive," STOP and report — but relocation of the worker's own commish
  module is additive by construction.

### B3 — Affected-period restate (the A6 open point)

- **Lineup repair** → restate exactly the edited `(managerId, periodId)`.
- **Roster add/drop/trim** → restate the `(managerId, period)` pairs whose `lineup_slot` membership changed by
  the drop's slot-release. Proposal: derive from the released-slot period ids (the store already knows which
  slots it released), union the pinned/current period, dedup, restate each with `{ allowFrozen: true }` +
  `markManagerPeriodProcessed`, then `recomputeStanding` once per league. A pure roster add with no lineup
  change touches no scored membership → the restate is a cheap no-op (re-sum returns the same total), which is
  correct and safe. Keep this a **named sub-decision** (don't over-derive the set — a bounded "all of the
  manager's not-closed periods" is an acceptable conservative alternative).

### B4 — Audit atomicity tension (surface, don't hide)

Thread 2 folds the effect row + the `commish_audit` row into ONE store-owned `$transaction` (atomic). The
reused 3a primitives (`claimFreeAgent` / `releaseRoster` / `saveLineup`) **each own their own `$transaction` and
accept no injected audit insert** — so folding the audit in would require *editing the primitive* (forbidden by
the reuse discipline + DoD). Therefore **3a writes the audit row in a SEPARATE transaction after the mutation
commits.** Proposal (mirrors Thread 2's post-commit `fireRescore` → `restate_pending`): on a committed mutation,
write `recordCommishAudit`; a failed audit write is surfaced loudly as `applied; audit-pending` (the mutation is
the source of truth, the ledger catches up / is retriable) — never a bare 500, never a silent unlogged
mutation. Full mutation+audit atomicity is a possible future refinement requiring a primitive signature change
(out of 3a scope). **Flag for clearance:** accept post-mutation audit for 3a, or hold 3a for an atomicity
refactor first? (Recommend accept — the alternative re-derives or edits the primitives.)

### B5 — TEST-FIRST SPINE (name it now; RED-first in part-2, before any UI/store code)

**Pure planner unit tests** (hand-built inputs, no DB) — the enforced-invariants-KEPT-under-bypass assertions:
- `roster`: the 15/9 squad **cap is KEPT** under window-bypass (a 16th add still `rosterIllegal`); a
  **post-kickoff add BLOCKS by default** (kickoff guard); **idempotent skip** when `rosterEndStateHolds`; **reason
  required** refusal; **gate** refusal for a non-commissioner actor.
- `lineup`: **formation / 11-distinct-XI / ownership KEPT** under edit-window bypass; a locked-on-play move on the
  3a path → `lockedPlayerMoved` conflict (**the latch is NOT relaxed in 3a**).
- `trim`: a **locked player in the drop set → `ReleaseStaleLockError`** surfaced (not a silent GUC bypass);
  cap / 7-starter floor still refuse.

**Gate tests:** `401` (no session) strictly **before** `403` (not commissioner) before controller
(`handleStatCorrection.ts:179` pattern); API gate uses the `is_commissioner` flag.

**Gated-PG integration tests** (own `*_PG_TEST_URL`, `*.integration.test.ts`) — atomic behavior on real Postgres:
- roster add: writes `roster_player` + **ONE** `commish_audit` row (`roster_repair`) + restate; **idempotent
  re-run** skips (no duplicate audit row).
- roster/trim drop (unlocked): releases the unlocked slot, ONE audit row.
- lineup edit (`allowLockedSlot:false`): saves the XI in a `closed`/past-window period via `relaxPeriodLock`,
  the restate re-sums membership, ONE audit row.
- **THE DECISIVE 3a invariant — GUC-free:** across every 3a path, `app.commish_override` is **NEVER set** — assert
  via a **bystander locked slot in the same manager that must remain immovable** during the 3a operation (a real
  DELETE/UPDATE of it would only succeed under the GUC). This is the "3a can't reach 3b" guarantee, RED-first.
- **Negative guard:** a locked-player drop/move on the 3a path REFUSES, sets NO GUC, writes NO mutation.

---

## Part-2 build outline (for reference — NOT this thread)

1. **RED tests first** — the B5 pure planner + gate + gated-PG spine (esp. the GUC-free bystander test).
2. **Reuse seam** — Option 1: extract `@app/commish-core` from `apps/worker/src/commish/{roster,lineup,trim,core}.ts`
   (mechanical; re-point the worker `cli.ts` imports). Clear with Sergio first.
3. **Web store-adapter** — a web-runtime store over the prisma singleton wrapping the `@app/faab` / `@app/lineup`
   primitives; the post-mutation `recordCommishAudit` + the A6 restate helper (`recomputeManagerPeriod`
   `{allowFrozen:true}` + `markManagerPeriodProcessed` + `recomputeStanding`).
4. **Pure handlers** — `handleRosterRepair` / `handleLineupRepair` / `handleRosterTrim` mirroring
   `handleStatCorrection`: gate → validate body (reason non-empty) before any DB → resolve+validate target →
   run the reused override → post-commit audit + restate → `restate_pending` / `audit_pending` outcome fields.
5. **Routes** — `POST /api/commish/roster` · `/api/commish/lineup` · `/api/commish/trim`, `dynamic="force-dynamic"`,
   shape-only `parseX` → 400, `deps()` wiring the store + gate + restate.
6. **UI** — replace the Roster-/Lineup-repair inert tab placeholders with the forms (manager picker → add/drop
   pickers, or period → XI editor, or over-cap trim selector with the report-mode survivor list); dry-run
   preview (the runner's `planned` status) before apply; the SAFE-only affordances (no `--allow-post-kickoff` /
   `--allow-locked-slot` controls — those are 3b).

**Merge authority:** roster/lineup mutations on a live tournament → **Sergio holds the merge** (source-only for
3a; the live-scoring/roster write path is his call). Docs commit `[skip render]`.

---

## Adversarial verification (2-lane refute pass, opus, against source)

| Lane | Question | Verdict | Note |
|---|---|---|---|
| V1 | Is 3a source-only + GUC-free + no-primitive-edit as the prior stated it? | **REFUTED as literally stated** | (a) no-migration + (d) no-primitive-edit hold cleanly; **(b) never-set-GUC / (c) no-`--allow-locked-slot` FAIL for "force-drop of a *played* player"** — it is inseparable from the GUC. A coherent SAFE slice exists ONLY if drop/trim is narrowed to UNLOCKED players (→ B1 correction). |
| V2 | Is the dangerous inventory exactly two bypasses? | **REFUTED → THREE** | `--allow-locked-slot` drives two distinct GUC-gated writes (lineup UPDATE, trim DELETE) + `--allow-post-kickoff` = 3 capabilities. `allowEliminated` and `--period` are SAFE (soft rule / read-scope). Closed-period-pin AMPLIFIES D3. |

Both verifiers read source directly (not the reader summaries). The design above reflects their corrections:
3a = SAFE/GUC-free/source-only with drop-trim restricted to **unlocked** players; the three dangerous
capabilities are deferred to 3b behind type-to-confirm + `reversible:false` + loud persisted audit.
