# T15-6-DIAGNOSE — Time-truth scope map (read-only)

**Thread:** T15-6-DIAGNOSE · 2026-07-05 · read-only, zero code edits
**origin/main at read time:** `e63e389` (one docs commit past the expected `6ede89a` — the T15 Window-A ordering-conflict resolution; no code drift, all reads current)
**Scope:** F-P1-TZ1 · F-P2-TZ1 · F-P2-TZ2 · F-P2-TZ3 · F-P2-G4 · F-P3-TZ1
**Disposition:** map only. Every fix below is a SEPARATE clearance-gated thread after Sergio reviews this doc.

---

## 1. Canon confirmed

`packages/shared/src/time.ts:14` — `formatInLeagueTz(d: Date, timezone: string): string`

```ts
new Intl.DateTimeFormat("en-US", {
  weekday: "short", month: "short", day: "numeric",
  hour: "numeric", minute: "2-digit",
  timeZoneName: "short",           // ← surfaces EDT/EST
  timeZone: timezone,              // ← the DYNAMIC league tz, never hardcoded
}).format(d)
```

**Target output shape:** `"Thu, Jun 11, 1:00 PM EDT"` — league-local wall clock + zone
abbreviation. Deterministic given (instant, tz) ⇒ identical SSR + hydration output (the
module doc pins this explicitly). This is the shape every offender converges to.

### Correct exemplars (leave byte-untouched; they are the target pattern)

| Surface | Formatter | tz source |
|---|---|---|
| /lineup | `KickoffTag` at `apps/web/app/lineup/components.tsx:51-66` → `formatInLeagueTz(new Date(kickoffAt), timezone)` | `timezone` prop threaded from the lineup view |
| /waivers | `buildBatchWindowView` at `apps/web/src/waivers/waiversLogic.ts:137` → `formatInLeagueTz(d, timezone)` | `view.timezone` from `apps/web/app/waivers/loadWaivers.ts:91` (`select: { timezone: true }`) → `:196` / `:368` (`league?.timezone ?? "UTC"`) |

Nuance recorded for completeness: `WaiversClient.tsx:159-166` (`formatRunAt`, batch-result
rows) uses a raw `Intl.DateTimeFormat` with `dateStyle:"medium"/timeStyle:"short"` on
`view.timezone` — dynamic-tz-correct but **no zone suffix**. It is not a bug (audit counts
it correct), but the F-P3-TZ1 consolidation should decide whether it also converges on canon.

**The exemplar pattern in one sentence:** loader selects `league.timezone`, view carries
`timezone: league?.timezone ?? "UTC"`, client/pure code formats via `formatInLeagueTz`.
No offender fix should invent anything beyond this.

---

## 2. Per-offender map

| Finding | File:line | Current (wrong) render | Correct render via canon | (a) `league.timezone` in loader snapshot? | (b) Pure display or contract-widening? | Phase gate |
|---|---|---|---|---|---|---|
| **F-P1-TZ1** | `apps/web/app/_dashboard/Dashboard.tsx:451` call, `:463-467` def (`formatKickoffTime`, `getUTCHours/Minutes`) | `"19:00"` — bare UTC HH:mm, no zone label, ~4h off league-local | `"3:00 PM EDT"` (time part of canon; see §5 on a shared short variant) | **NO.** `loadDashboard` never reads `league`; `DashboardData` has no tz field | Display-only render fix + snapshot field: widen `loadDraftRoom`'s existing league select (`apps/web/app/draft/loadDraftRoom.ts:54`, currently `{ draftPickSeconds: true }`) with `timezone: true`, add `DashboardData.timezone`, thread as prop | **GATED** — `"matchday"` module key exists only in the group-phase list (`Dashboard.tsx:664,680`); playoff phase never mounts `MatchdayModule` |
| **F-P2-TZ1** | `apps/web/src/games/buildGameDetail.ts:254-263` (`kickoffLabelUtc`), stamped into the view at `:636`, rendered at `apps/web/app/games/[matchId]/GameDetailClient.tsx:1071` (`header.kickoffLabel`) | `"Sat 11 Jul · 19:00"` — bare UTC, no zone label (builder comment self-declares "deterministic UTC") | `"Sat, Jul 11, 3:00 PM EDT"` | **NO.** `loadGameDetail.ts:29-31` selects only `manager.leagueId`; no league-row read anywhere | **Contract-widening (the big one):** `buildGameDetail` is a PURE builder — fix adds a `timezone` input to its contract + `loadGameDetail` widens the viewer select to `league: { select: { timezone: true } }`. Label stays server-computed (preserves the no-client-reformat / no-hydration-mismatch posture in `types.ts:7`) | **LIVE-NOW** — /games renders playoff matches today |
| **F-P2-TZ2** | `apps/web/app/_dashboard/PrimaryBanner.tsx:316-339` (`formatKickoffDate` — docstring at :316 promises `"… 17:00 UTC"`, return at :338 never appends any zone token) + `:341-362` (`formatKickoffShort`, same); call sites `:154`, `:168` | `"Thu 12 Jun · 17:00"` / `"12 Jun 17:00"` — bare UTC, and even the claimed "UTC" suffix is missing | `"Thu, Jun 12, 1:00 PM EDT"` (+ short variant) | **NO** — same `DashboardData` snapshot as F-P1-TZ1; one threading serves both | Display-only once F-P1-TZ1's threading lands (both formatters live in the same snapshot's render tree; `earliestGroupKickoff` already threaded) | **GATED** — both call sites are inside `phase === "pre-kickoff"` (`PrimaryBanner.tsx:149`); that phase is behind us this tournament (historical/re-provision only) |
| **F-P2-TZ3** | `apps/web/src/pool/PoolClient.tsx:136-145` (`fmtKickoff`: `timeZone: "America/New_York"` hardcoded + literal `" ET"` string), used at `:179` | `"Jul 5, 3:00 PM ET"` — wall clock coincidentally right today ONLY because hardcoded tz == presumed league tz; label is a frozen literal | `"Sat, Jul 5, 3:00 PM EDT"` via `view.timezone` | **NO.** `loadPool.ts:57-59` selects `manager.{id,leagueId}`; `PoolView` has no tz field | Snapshot field + display: widen `loadPool`'s manager select to `league: { select: { timezone: true } }` (or one extra league read), add `PoolView.timezone`, switch `fmtKickoff` → canon | **LIVE-NOW** — /pool KO archive + upcoming bracket fixtures render today |
| **F-P2-G4** | `apps/web/src/commish/commishView.ts:356` (`createdAt.toISOString()` → `createdAtIso`) + `apps/web/app/commish/CommishConsole.tsx:2186-2188` (exact time ONLY via `title={entry.createdAtIso}` — hover-only, invisible on touch; visible text is `whenLabel` = relative `formatAgo`) + `:209` (`frozenSince = frozenAtIso.slice(0, 10)` — UTC date slice) | Visible: `"3h ago"` (fine, tz-independent) but the exact instant is a hover-only raw UTC ISO; `frozen since 2026-07-01` can be a day off league-local for evening-ET events | Tap-visible `"Sat, Jul 5, 3:00 PM EDT"` (tap/expand or inline), `frozenSince` via canon date part | **NO.** `loadCommish.ts:93` selects `league.{ name }` only | See §4 — display render off an ALREADY-PRESENT ISO, but needs one field (`timezone: true`) added to the existing `loadCommish.ts:93` select + the status view. No builder-input change, no new query | **LIVE-NOW** — commish console is in active use |

---

## 3. The contract-touching surface: snapshots that must thread `league.timezone`

The audit said "two". **Confirmed count is FOUR** — the audit undercounted (it likely
counted only the loaders needing structural work, dashboard + games; pool and commish
also lack the field). Ranked by intrusiveness:

1. **`GameDetailView` / `buildGameDetail`** — the only PURE-BUILDER input widening.
   `loadGameDetail.ts:29-31` (`select: { leagueId: true }` → add `league: { select: { timezone: true } }`)
   and `buildGameDetail` gains a `timezone` input. This is the genuinely contract-touching
   delta; everything else is a one-field select + view-field addition.
2. **`DashboardData`** (serves BOTH F-P1-TZ1 and F-P2-TZ2) — no league read exists in
   `loadDashboard.ts` at all, but `loadDraftRoom.ts:54` already selects
   `league: { select: { draftPickSeconds: true } }` → widen with `timezone: true` and
   surface it on `DashboardData`. No new query.
3. **`PoolView`** — `loadPool.ts:57-59` manager select gains `league: { select: { timezone: true } }`;
   `PoolView.timezone` added; `fmtKickoff` reads it.
4. **Commish status view** — `loadCommish.ts:93` `select: { name: true }` → `{ name: true, timezone: true }`;
   one field on the status/view shape.

All four are **display-only reads — nothing mutates.** No migration, no RLS change, no
Realtime change, no engine/scoring touch. The `?? "UTC"` fallback from the waivers
exemplar (`loadWaivers.ts:196`) should be reused verbatim.

---

## 4. F-P2-G4 verdict: display-only, with a one-field select widening

- `createdAtIso` is **already in the client view** — the tap-visible timestamp is a pure
  client render change (replace/augment the `title=` attr with a tap-revealed or inline
  canon-formatted string). The ISO needs no new plumbing.
- **BUT** the client has no tz value today, so `timezone` must ride the commish view:
  `loadCommish.ts:93` select widening + one view field. No change to `commishView.ts`
  builder logic is strictly required if formatting happens client-side off
  `createdAtIso` + `view.timezone` (mirrors the WaiversClient pattern).
- `whenLabel` (`formatAgo`, `commishView.ts:327-338`) is relative and tz-independent —
  correct as-is, keep.
- Bonus defect confirmed while reading: `frozenSince` (`CommishConsole.tsx:209`) slices
  the UTC date out of the ISO — a period frozen 9 PM ET shows the NEXT day's date. Same
  one-field fix covers it via canon.

**Verdict: display-only fix + one-field select widening. No builder-input change.**

---

## 5. F-P3-TZ1: consolidation recommendation (recommend only — NOT built)

Duplicated ad-hoc formatters found (complete list):

| Formatter | Location | Shape | Fate under consolidation |
|---|---|---|---|
| `formatKickoffTime` | `Dashboard.tsx:463-467` | `"19:00"` bare UTC | retire → canon (needs a time-only/short variant, see below) |
| `kickoffLabelUtc` | `buildGameDetail.ts:254-263` | `"Sat 11 Jul · 19:00"` bare UTC | retire → canon (server-side, tz as builder input) |
| `formatKickoffDate` | `PrimaryBanner.tsx:316-339` | `"Thu 12 Jun · 17:00"` bare UTC | retire → canon |
| `formatKickoffShort` | `PrimaryBanner.tsx:341-362` | `"12 Jun 17:00"` bare UTC | retire → canon short variant |
| `fmtKickoff` | `PoolClient.tsx:136-145` | hardcoded `America/New_York` + literal `" ET"` | retire → canon on `view.timezone` |
| (`formatRunAt`) | `WaiversClient.tsx:159-166` | dynamic tz, no zone suffix | not a bug; optional convergence |

**Recommendation: YES — consolidate all onto `packages/shared/src/time.ts`.** Two notes:

1. Some surfaces legitimately want a **shorter shape** than the full canon string (the
   dashboard match row shows time-only; the banner secondary stat is deliberately compact).
   The right move is to add sibling variants IN THE SAME shared module (e.g. a
   time-only `formatInLeagueTzTime` and/or a compact date form), all taking
   `(instant, timezone)` — never another local formatter. One module = one tz discipline.
2. **Does it kill the drift class the way §9 fixtures killed scoring drift?** Mostly but
   not identically. The §9 kill was structural: the page renders FROM the engine, so drift
   *cannot* compile. Consolidation here removes every duplicated formatter, but nothing
   *prevents* the next screen from hand-rolling `getUTCHours()` again. To get the same
   guarantee-shaped fence, pair consolidation with a cheap deterministic guard: a
   lint/grep CI check that `apps/web` contains no `getUTC(Hours|Minutes|Day|Date|Month)`
   and no `timeZone:` literal outside `packages/shared/src/time.ts` (allowlist the shared
   module + tests). That grep is this class's analog of the §9 probe. Recommended as part
   of the fix thread, not this one.

---

## 6. Prod `league.timezone`: not directly confirmable this thread → Sergio-confirm item

- Schema default: `timezone String @default("UTC")` — `packages/db/prisma/schema.prisma:135`. Confirmed.
- Provisioning: **`provision.config.json` (the real committed config, not just the example)
  sets `"timezone": "America/New_York"`**, and `apps/worker/src/provision/cli.ts:73` writes
  `plan.league.timezone` on create. So prod is expected to be `America/New_York` — the
  schema `'UTC'` default only bites a league created outside the provisioning CLI.
- Direct prod read: attempted read-only `SELECT id, name, timezone FROM league` against
  the `.env` DATABASE_URL (Supabase pooler) — **blocked by the session's production-read
  permission policy**, so it stays unconfirmed by Code. **Sergio-confirm one-liner:**
  `psql "$DATABASE_URL" -tAc 'SELECT id, name, timezone FROM league;'`
- **This does NOT block the fix.** The correct fix threads the DYNAMIC column with the
  `?? "UTC"` fallback — it is right regardless of what the row says.
- **Predicted VISIBLE change at prod = `America/New_York`** (for the on-device gate):
  - /games board meta: `"Sat 11 Jul · 19:00"` → `"Sat, Jul 11, 3:00 PM EDT"` (−4h shift + zone label — the headline visible fix)
  - dashboard MatchdayModule (when group-gated module next renders): `"19:00"` → `"3:00 PM EDT"`-shaped
  - PrimaryBanner (pre-kickoff only): `"Thu 12 Jun · 17:00"` → `"Thu, Jun 12, 1:00 PM EDT"`-shaped
  - /pool: **wall clock UNCHANGED** (hardcoded tz is coincidentally right today); only the
    literal `" ET"` becomes a real `"EDT"` and the value becomes dynamic — the on-device
    gate should expect a near-no-op here, which is CORRECT, not a missed fix
  - /commish: exact timestamps become tap-visible league-local (new visible element);
    `frozen since` date can shift −1 day for evening-ET freeze events
  - If prod were actually `'UTC'` (schema default), every surface would render UTC wall
    clock **with an explicit `UTC` label** — still an improvement over unlabeled bare UTC.

---

## 7. Phase-gating → suggested fix order (by live impact)

| Order | Finding | Surface | Gate status |
|---|---|---|---|
| 1 | F-P2-TZ1 | /games kickoff label | **LIVE-NOW** (playoff matches rendering today; the walkthrough-step-58 live-confirmed FAIL) |
| 2 | F-P2-TZ3 | /pool fixture times | **LIVE-NOW** (KO fixtures + archive live) |
| 3 | F-P2-G4 | /commish ledger + frozenSince | **LIVE-NOW** (console in active use; lower traffic than 1–2) |
| 4 | F-P1-TZ1 | dashboard MatchdayModule | **GATED** — group-phase module list only (`Dashboard.tsx:680`); dead in playoff phase |
| 5 | F-P2-TZ2 | dashboard PrimaryBanner | **GATED** — `pre-kickoff` phase only; historical this tournament |
| — | F-P3-TZ1 | shared-formatter consolidation + grep fence | natural vehicle for 4–5; can ship with or after 1–3 |

**STOP point honored:** no code touched. Fix thread(s) proceed only after Sergio clears this map.
