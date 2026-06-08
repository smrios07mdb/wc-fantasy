# Claude Code — Prompt 25: FAAB batch engine (pure core + bid submission + cron body)

> Paste into Claude Code with the four brain files in the repo root (PROJECT.md, ARCHITECTURE.md,
> DECISIONS.md, SCORING.md) current. This is the **first of two Waivers prompts** — the **engine**
> (this prompt), then the **`/waivers` UI** (Prompt 26, separate). It mirrors the draft split:
> `packages/draft` engine first (Prompt 06), draft-room UI later. **No UI in this prompt.**

---

## Context (read first — the rules are already LOCKED; invent nothing)
DECISIONS.md §D ("FAAB & Waivers") is **fully locked**. Your job is to implement that spec faithfully,
not to re-derive or "improve" any rule. The guiding constraint is non-negotiable: **"boring and
reliable" over clever** — this is the standard blind-FAAB → free-agency pattern on a daily tournament
cadence; no novel machinery.

**What already exists (consume; do NOT rebuild or migrate):**
- **Schema** is in place in `packages/db/prisma/schema.prisma`: `FaabBatch` (`runAt`, `status:
  FaabBatchStatus`), `FaabBid` (`leagueId`, `managerId`, `playerAddId`, `playerDropId?`, `amount`,
  `batchId?`, `status: BidStatus` default `pending`, `note?`), `Manager.faabBudget` (default 100, CHECK
  ≥ 0 in raw SQL), `Manager.waiverOrderPosition` (`@@unique([leagueId, waiverOrderPosition])`),
  `League.faabBatchLocalTime` (default "06:00"). CHECK constraints already present: `amount >= 0`,
  `player_add_id != player_drop_id`.
- **Waiver order + budget are SEEDED at provisioning.** `apps/worker/src/provision/plan.ts`
  `buildWaiverOrder()` seeds `waiverOrderPosition` by **reverse draft order** (last drafter = priority
  1), and `faabBudget = 100`, both written per manager. **Do NOT re-seed** — you read these.
- **The cron is scheduled and live-but-inert.** `apps/worker/src/jobs/faabBatch.ts` is a placeholder
  that boots, logs `job.faab.placeholder`, exits 0. Render's `wc-fantasy-faab-batch` cron runs it daily
  ~06:00 league-local. **Replace its body** with the real batch run; don't touch the schedule/IaC.
- **The acquisition-cutoff clock already exists** (lock-on-play / Free Agents): a player can't be
  acquired once **his match kicks off**. The kickoff time is on the fixture (`fifa_match` schedule). Reuse
  the existing cutoff seam — do not invent a second clock.
- **Roster legality** (2 GK / 5 DEF / 5 MID / 3 FWD, squad = 15, unique ownership league-wide) lives in
  `@app/shared` and is enforced by the draft controller. **Reuse it** — do not re-implement caps.
- **The auth primitives** `requireManager` / `getSessionManager` / `assertCanActAsManager` (scope
  `"self"`) and the `POST /api/draft/pick` route's **401-no-session / 403-not-your-manager-BEFORE-logic**
  pattern are the template for the bid route.

---

## The LOCKED batch-clearing algorithm (DECISIONS §D — implement EXACTLY)
Process a single batch over all `pending` bids for the league at run time `now`:

1. **Void + refund first.** Any bid whose **add target's match has kicked off** at `now` (cutoff passed)
   is **voided and refunded** (status → `void`, no budget change — the budget was never debited
   pre-clear; debit happens only on a win). It does not compete.
2. **Primary order: highest bid wins.** Process **player-by-player, highest-bid-first** across the whole
   batch.
3. **Tie → rolling waiver order.** Equal bid amounts on the same player break on `waiverOrderPosition`
   (lower = higher priority).
4. **Move-to-bottom ONLY when the tiebreak is actually USED.** A manager moves to the bottom of the
   waiver order **only if they won a player *because* the order broke a tie** — i.e. there was an equal
   competing bid and order decided it. **Winning on bid amount alone does NOT move them.** When the
   tiebreak *is* used, the winner drops to the bottom **immediately**, for the **rest of this same
   batch** (so they can't sweep all the tied players).
5. **A manager's own multiple winning bids resolve highest-first**, applying each that is **still legal**
   (remaining budget ≥ amount, roster stays legal, the named drop is still owned & valid) and
   **skipping** any that no longer fit. No conditional/grouped-bid machinery — minimal and boring.
6. **$0 bids are legal** — lowest in the batch; they win only uncontested players, tie-broken by waiver
   order like any other amount.
7. **Every won claim is add-X / drop-Y** (rosters are capped at 15) — apply the add and the drop
   atomically; debit `amount` from the winner's `faabBudget`. Losing bids → status `lost`.
8. **Waiver-order contiguity (1..N, no gaps) is the single-writer invariant** — after all move-to-bottom
   shifts, the order must remain a contiguous 1..N permutation. The batch is the only writer of
   `waiverOrderPosition` post-provisioning; the DB `@@unique` guards dupes, but **contiguity is yours to
   preserve in the transaction**.

**Out of this prompt's algorithm (flag, don't build):** the **playoff FAAB reset + waiver-order
carry-forward** ($100 reset, remove eliminated managers, preserve relative order, no re-seed) belongs to
the **group→playoff transition** (a separate deferred prompt). The engine reads current budget/order; it
does not perform the reset.

---

## Scope of THIS prompt

### 1. Pure core — `packages/faab` (`@app/faab`), IO-free, mirroring `packages/draft`
A pure resolver: **(bids + managers w/ budget & waiver position + current roster state + add-target
kickoff times + `now`) → { wins, losses, voids, budget deltas, waiver-order mutations }**. No Prisma, no
clock, no Supabase — `now` and kickoff times are passed in. Unit-testable with literals. Encode the
8-step algorithm above. Typed outcomes (mirror the `DraftError` / typed-outcome style). Keep roster
legality delegated to the existing `@app/shared` caps (import; don't fork).

### 2. Bid submission route(s) — gated, validated at submission time
A gated `POST /api/faab/bid` route handler (the `/api/draft/pick` template): `requireManager` →
`assertCanActAsManager({ scope: "self" })` → **401/403 BEFORE any DB write**, then validate and persist a
`pending` `FaabBid`. **Submission-time validation (reject, don't defer to the batch):**
- `amount >= 0` **and** `amount <= manager.faabBudget` *minus the sum of the manager's other pending
  bids' amounts* (no over-commit across pending claims — the design's "after pending" budget line is the
  visible form of this rule).
- `playerAddId` is **unowned league-wide** and its **match has not kicked off** (cutoff open) at submit.
- `playerDropId` (required once the roster is full) is **owned by this manager** and `!= playerAddId`.
- add + drop keep the roster legal (2/5/5/3) — reuse `@app/shared`.

Include the edit / cancel paths the design needs (the Waivers UI has edit + cancel + reorder of pending
claims). **Reorder semantics need a confirm (see below)** — wire cancel + edit-amount/drop now;
gate reorder on the confirm. All bid mutations are self-scoped (a manager touches only their own bids;
RLS intent: a manager reads only their own `pending` bids, everyone reads outcomes post-batch — honor it
at the query layer, and leave the raw-SQL RLS policy as-is if already present, else flag).

### 3. Worker cron body — replace the placeholder
Replace `apps/worker/src/jobs/faabBatch.ts`'s placeholder with the real run: open a `FaabBatch` row
(`status pending → ... → done`), read the league's `pending` bids + managers + roster state + add-target
kickoffs, call the pure resolver, then **write all outcomes in ONE atomic transaction** — assign
winners (add/drop + budget debit), refund voids, mark losers, apply the move-to-bottom reorder
preserving contiguity, stamp each bid's `batchId` + terminal `status`, and write the batch as `done`. The
transaction is the no-double-spend / valid-drop guard (schema comment `TODO(prompt-NN)` — that's this
prompt). Structured logs, idempotent re-run safety (a `done` batch is not re-processed).

---

## Explicitly OUT of scope (leave seams intact)
- **The `/waivers` UI** — Prompt 26. No screen, no components, no design port here.
- **Free-agency $0 instant claims** (first-come between batches) and the **Free Agents `Acquire`
  route** — if not already built, that's a **sibling concern**; this prompt is the **blind-bid batch**.
  Flag whether an FA acquire route exists; do not build it under this prompt.
- **The playoff FAAB reset + waiver carry-forward** (group→playoff transition prompt).
- **Schema migrations** — the models + constraints exist; if you find a genuine gap (e.g. a missing
  index for the batch query), flag it as a follow-up rather than silently migrating.
- Scoring / recompute / standings / draft / ingestion internals — done; **consume, no signature churn.**

## Key contracts
- **Pure core is DB/Supabase/clock-free** (mirror `packages/scoring` / `packages/draft`); the cron body
  + the route are the thin IO. Grep-clean that `packages/faab` imports no Prisma/Supabase.
- **The route reuses the auth primitives unchanged** (401/403-before-logic); it adds only FAAB
  validation. `requireManager` / `assertCanActAsManager` / `submitPick` are **not** modified.
- **The batch is the single writer of `waiverOrderPosition`** post-provisioning; contiguity is a
  transaction invariant.

## Dependency / confirm (leave a `// TODO(confirm):` where unresolved)
- **Pending-claim "priority" vs. the locked "highest-first" rule.** The design (`waivers/*`) shows
  reorderable pending-claim **priority**, but DECISIONS §D locks *a manager's own winning bids resolve
  **highest-first (by amount)***. Reconcile: the engine orders a manager's own wins by **amount**; treat
  the design's `priority` as the **intra-manager tiebreak for equal-amount own bids** (and the UI's
  apply-order hint). Confirm this reading before enabling reorder; until confirmed, persist `priority`
  but don't let it override amount.
- **RLS policy presence** for `faab_bid` (own-pending-read / public-outcome-read) — if the raw-SQL
  policy isn't already migrated, flag it (don't add a service-role bypass).

## Tests — TDD-first on the algorithm; root `pnpm test` stays green
Vitest. The high-value suite is the **pure resolver** with literals. Cover at minimum:
- highest-bid wins; **$0 uncontested win**; loser marked `lost`.
- **tie → waiver order** decides; the winner **moves to bottom**; a second tied player in the **same
  batch** then goes to the next-priority manager (no sweep).
- **win on amount alone does NOT move-to-bottom** (the critical asymmetry).
- **own multiple winning bids resolve highest-first**, skipping one that no longer fits (budget
  exhausted / roster full / drop no longer valid).
- **void + refund** when the add target's match kicked off at `now` (no budget change).
- **over-commit rejected at submission** (amount > budget − other pending).
- **contiguity** of `waiverOrderPosition` preserved after reorder.
- route: 401 no-session / 403 not-your-manager **before** any write; invalid add/drop rejected.
- purity grep: `packages/faab` is IO-free.

## Definition of done
- `packages/faab` pure resolver + the gated `POST /api/faab/bid` (+ cancel/edit) + the real cron body in
  `apps/worker/src/jobs/faabBatch.ts`, all per the locked §D algorithm.
- `pnpm db:generate && pnpm -w typecheck && pnpm lint && pnpm format:check && pnpm test` exit 0
  (+ the new FAAB suite green); `pnpm --filter @app/web build` exits 0. No churn to scoring / recompute /
  standings / draft / ingestion / auth signatures; **no UI**.
- Cron remains scheduled exactly as IaC left it; a `done` batch is not re-processed.

## When done
Summarize: the `packages/faab` pure surface (inputs → typed outcomes) and the purity proof; exactly how
each of the 8 locked algorithm steps is implemented (especially **move-to-bottom only on tiebreak use**
and **own-bids highest-first-skip**); the bid route's validation list + its 401/403-before-write
behavior; the cron transaction (what's written atomically, the contiguity guard, idempotent re-run); the
test count + which algorithm edges are pinned; the exact commands you verified; whether an FA `Acquire`
route exists; and every `// TODO(confirm):` left (priority-vs-amount, RLS). Report `git log --oneline -1`
+ `git status`. Branch off latest `main` (suggested **`feat/faab-engine`**), conventional commit, no
force-push, **hold the merge for Chat's clearance.** Flag **Prompt 26 — Waivers UI (`/waivers` to the
`design_reference/` Waivers screen, on this engine)** as the next step. Do **not** start the UI or push
to `main`.
