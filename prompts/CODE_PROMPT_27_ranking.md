# Claude Code — Prompt 27: Draft ranking generation

> Paste into Claude Code with the four brain files in the repo root (`PROJECT.md`, `ARCHITECTURE.md`,
> `DECISIONS.md`, `SCORING.md`) current. This prompt lives entirely in `apps/worker/src/provision/`
> and `packages/feed/`. No UI, no schema changes, no new packages. Branch `feat/rank-generate` off
> latest `main`.
>
> **⚠️ Parallel session:** A separate Claude Code session is concurrently executing the **Waivers UI
> (Prompt 26)** on branch `feat/waivers-ui`. The two branches are strictly non-overlapping:
> - **This prompt (27):** `apps/worker/src/provision/`, `packages/feed/src/client.ts` + types only
> - **Prompt 26:** `apps/web/app/waivers/`, `apps/web/src/waivers/`, route-scoped CSS
>
> **Do NOT touch** any files outside the paths listed above. No shared-file edits (AppShell, globals,
> brain files). Brain-file updates are deferred to a single combined post-merge docs commit per the
> established parallel discipline.

---

## Context

`player.default_rank` exists in the DB (1-based, lower = better, NULL = unranked). The provisioning
CLI (`apps/worker/src/provision/cli.ts`) already has a `rank` command that accepts an ordered list of
`balldontlieId`s and writes `default_rank` to the DB. Right now `default_rank` is NULL for all players
— the draft pool sorts alphabetically, which is useless.

This prompt adds `rank:generate` — a CLI command that hits the BALLDONTLIE GOAT API, computes a
projected fantasy-point ranking for every player in the 2026 WC squad, and writes `ranking-draft.csv`
for Sergio to review and optionally edit before committing to the DB with the existing `rank` command.

The tournament starts June 11. The draft happens before then. This is pre-launch critical path.

**What already exists (read, don't rebuild):**
- `packages/feed` (`@app/feed`) — the BALLDONTLIE feed client with rate limiter. All API calls go
  through here. Base URL `https://api.balldontlie.io/fifa/worldcup/v1`, `Authorization` header (raw
  key, no Bearer), cursor pagination helper. Confirmed GOAT-tier endpoints:
  - `GET /matches?seasons[]=2026` — all 2026 matches, paginated
  - `GET /odds/player_props?match_id={id}` — pre-match props (confirmed available pre-kickoff)
  - `GET /odds/futures?seasons[]=2026` — team tournament winner odds
  - `GET /rosters?seasons[]=2026` — squad with `balldontlieId` per player
- `apps/worker/src/provision/cli.ts` — existing `rank` command. Reads an ordered list of
  `balldontlieId`s from a newline-delimited file path argument and writes `default_rank`. Extend it to
  accept `rank <filepath>` if it doesn't already; do not change the write logic.
- `apps/worker/src/provision/plan.ts` — `buildDefaultRankUpdates` already exists.

**Guiding constraint:** boring and reliable over clever. The pure function is testable with literals.
IO stays at the edges. No invented product rules. The output is a ranked CSV; Sergio reviews it before
committing anything to the DB.

---

## What this prompt builds

### 1. Pure ranking core — `apps/worker/src/provision/rankGenerate.ts`

A single exported pure function:

```ts
export function computeRanking(input: RankingInput): RankedPlayer[];
```

**`RankingInput`** (all plain data, no IO):
```ts
interface RankingInput {
  /** All 2026 squad players with their BALLDONTLIE id and position. */
  players: SquadPlayer[];
  /** Per-match player props, keyed by match_id. */
  props: MatchProps[];
  /** Team tournament win odds (American), keyed by team_id. */
  teamWinOdds: Record<number, number>;
  /** Which team each player belongs to. */
  playerTeam: Record<number, number>; // playerId → teamId
}

interface SquadPlayer {
  balldontlieId: number;
  name: string;
  position: 'GK' | 'DEF' | 'MID' | 'FWD';
  teamId: number;
}

interface MatchProps {
  matchId: number;
  playerId: number;
  propType: 'anytime_goal' | 'assists' | 'shots' | 'shots_on_target' | 'first_goal';
  lineValue: number;     // 1, 2, 3 …
  impliedProb: number;   // already de-vigged, 0–1
}

interface RankedPlayer {
  balldontlieId: number;
  name: string;
  position: string;
  projectedPts: number;
  expectedMatches: number;
  hasProps: boolean;
}
```

**Algorithm — implement exactly:**

**Step 1 — De-vig American odds.**
The CLI fetcher (below) averages DK and FanDuel before building `MatchProps`. Formula:
- Positive odds (underdog): `p = 100 / (odds + 100)`
- Negative odds (favorite): `p = Math.abs(odds) / (Math.abs(odds) + 100)`
- Average the two vendors' implied probs. If only one vendor present, use it directly.

**Step 2 — Expected games per team from tournament win odds.**
Map each team's tournament win `americanOdds` to an `expectedMatches` multiplier:

| Win odds range | Expected total matches |
|---|---|
| ≤ +600 (Spain, France, England tier) | 6.5 |
| +601 to +1200 (Brazil, Argentina, Portugal tier) | 5.5 |
| +1201 to +2500 (Germany, Netherlands tier) | 4.5 |
| +2501 to +5000 | 3.8 |
| +5001 to +10000 | 3.3 |
| > +10000 | 3.0 |

Teams with no futures data default to 3.0 (group stage only).

**Step 3 — E[pts per match] for players with props.**

For each player × group-stage match where they have `anytime_goal` props:

```
E[goals] = P(≥1 goal) + P(≥2 goals) + P(≥3 goals)
         = sum of impliedProb for lineValues 1, 2, 3
```

Same for assists: `E[assists] = P(≥1 assist) + P(≥2 assists)`

```
E[pts per match] =
  E[goals]   × GOAL_WEIGHT[position]    // same weights as scoring engine
+ E[assists]  × ASSIST_WEIGHT[position]
+ 2.0                                   // appearance (starter assumption for players with props)
```

Scoring weights (from SCORING.md, replicate them — do NOT import the scoring engine):
```ts
const GOAL_WEIGHT   = { GK: 6, DEF: 6, MID: 5, FWD: 4 };
const ASSIST_WEIGHT = { GK: 4, DEF: 4, MID: 3, FWD: 3 };
```

Sum `E[pts per match]` across the player's 3 group-stage matches. That is the group-stage projection.

**Step 4 — Projected total pts.**

```
projectedPts = groupStagePts × (expectedMatches / 3)
```

This scales group-stage output to full tournament depth.

**Step 5 — Players without goal props (most GKs, DEFs, depth players).**

Position baselines per match (conservative — these players are ranked below prop-covered players):

| Position | Pts/match baseline |
|---|---|
| GK | 5.0 |
| DEF | 3.5 |
| MID | 3.0 |
| FWD | 3.5 |

```
projectedPts = baseline × expectedMatches
```

**Step 6 — Sort.**
Sort `RankedPlayer[]` descending by `projectedPts`. Ties broken by position priority:
FWD > MID > DEF > GK (more draft value at top positions when evenly projected).
Second tiebreak: alphabetical name ascending.

**Step 7 — `hasProps` flag.**
`true` if the player had at least one `anytime_goal` prop entry in any group-stage match.
Used in the CSV so Sergio can see which rankings are data-driven vs. baseline.

---

### 2. CLI fetcher — extend `apps/worker/src/provision/cli.ts`

New command `rank:generate`:

```
pnpm provision rank:generate
```

Execution order:

1. **Fetch all 2026 group-stage matches.**
   Call `FeedClient.listMatches({ seasons: [2026] })` (paginate to exhaustion).
   Filter to `stage.name === 'Group Stage'`. Collect match IDs. Log count.

2. **Fetch player props per match.**
   For each group-stage match ID, call `FeedClient.getPlayerProps({ matchId })`.
   Collect all prop rows. Log total props fetched.
   This is ~48 calls — well within GOAT rate limits.

3. **Fetch team futures.**
   Call `FeedClient.getFutures({ seasons: [2026] })`.
   Filter to `market_type === 'tournament_winner'` (or equivalent field — inspect the response).
   Build `teamWinOdds: Record<number, number>` keyed by `team_id`.
   Log each team's odds for audit.

4. **Fetch 2026 rosters.**
   Call `FeedClient.getRosters({ seasons: [2026] })` (paginate to exhaustion).
   Build `players: SquadPlayer[]` and `playerTeam: Record<number, number>`.

5. **De-vig props.**
   Group props by `(playerId, matchId, propType, lineValue)`.
   Average DK + FanDuel implied probs → `MatchProps[]`.

6. **Call `computeRanking(input)`.**

7. **Write `ranking-draft.csv`.**
   Output to `apps/worker/ranking-draft.csv` (gitignored — add to `.gitignore`).
   CSV columns: `rank,balldontlieId,name,position,team,projectedPts,expectedMatches,hasProps`
   Header row included. One row per player, ordered 1 → N.
   Log: "Wrote N players to ranking-draft.csv".

8. **Print instructions:**
   ```
   Review ranking-draft.csv, adjust any rows, then run:
     pnpm provision rank ranking-draft.csv
   to write default_rank to the database.
   ```

**Extend the existing `rank` command** to accept a file path argument:
`rank <filepath>` — reads the CSV, extracts `balldontlieId` column in row order, calls
`buildDefaultRankUpdates`, writes to DB. If the file argument is missing, print usage and exit 1.
Do not change the DB-write logic.

**Error handling:**
- If futures fetch returns no data: log a warning, proceed with all teams at 3.0 default.
- If props fetch fails for a match: log the match ID and continue (don't abort the whole run).
- If rosters fetch returns zero players: abort with a clear error (the ranking is meaningless without squad data).

---

### 3. FeedClient extensions (if missing)

If `@app/feed` doesn't already expose `getPlayerProps` or `getFutures`, add them to
`packages/feed/src/client.ts` following the existing pattern (thin transport, typed response,
rate-limited). The OpenAPI spec is at `https://www.balldontlie.io/openapi/fifa.yml`.

Relevant endpoints:
- `GET /fifa/worldcup/v1/odds/player_props?match_id={id}` — returns `FIFAPlayerProp[]` (no pagination)
- `GET /fifa/worldcup/v1/odds/futures?seasons[]=2026` — returns `FIFAFuturesOdd[]` (no pagination)

Both are already typed in `packages/feed/src/types.ts` (`FIFAPlayerProp`, `FIFAFuturesOdd`).
Add the client methods if absent; do not duplicate types.

---

## Explicitly OUT of scope

- Sofascore season-average ratings — the betting props already aggregate all public information
  including Sofascore ratings. Scraping them separately adds complexity for marginal gain and
  the scraper is built for per-match tournament data, not pre-tournament season averages.
- Individual player Golden Boot odds — the per-match props already encode this signal (a player
  with +600 Golden Boot odds will have very short `anytime_goal` odds across every match).
- Any UI changes — the ranking affects `default_rank` in the DB; the draft room already reads it.
- Schema changes — `player.default_rank` already exists.
- Waiver UI — **Prompt 26, executing concurrently** on `feat/waivers-ui`. Do not touch that branch's
  files. Merge coordination happens after both branches clear Chat review.

---

## Tests — `apps/worker/src/provision/rankGenerate.test.ts`

Vitest. The pure function only; no IO. Tests must pass under `pnpm test`.

```
computeRanking — core cases:
  - player with goals props across 3 matches scores above a player without props on same team
  - E[goals] = P(≥1) + P(≥2) + P(≥3) arithmetic is correct
  - appearance baseline (2.0) is always included for players with props
  - player from strong team (low win odds) outranks equal-output player from weak team
  - player without props uses position baseline × expectedMatches
  - all 1252 input players appear exactly once in output (no drops, no dupes)
  - output is sorted descending by projectedPts
  - ties broken FWD > MID > DEF > GK, then alphabetical

americanOddsToProb — unit tests:
  - positive odds: +600 → 100/700 ≈ 0.1429
  - negative odds: -150 → 150/250 = 0.60
  - +100 → 0.50
  - -100 → 0.50

expectedMatchesFromOdds:
  - +450 → 6.5
  - +800 → 5.5
  - +1400 → 4.5
  - +3500 → 3.8
  - +8000 → 3.3
  - +20000 → 3.0
  - undefined → 3.0
```

---

## Verification checklist (Claude Code reports, Chat verifies)

- [ ] `pnpm -w typecheck && pnpm lint && pnpm test` passes clean
- [ ] `pnpm --filter web build` still passes (no regressions)
- [ ] `pnpm provision rank:generate` runs to completion against live GOAT API (with BALLDONTLIE_API_KEY set)
- [ ] `ranking-draft.csv` written with correct column headers and ~1252 rows
- [ ] Top 10 rows include recognizable elite players (Mbappé, Kane, Haaland, Messi) — not obscure reserves
- [ ] `hasProps=true` rows visibly rank above `hasProps=false` rows for same teams
- [ ] GKs from strong teams (Spain, France) rank above GKs from weak teams
- [ ] `ranking-draft.csv` is listed in `.gitignore`
- [ ] `pnpm provision rank ranking-draft.csv` reads the CSV and updates `default_rank` in DB (no API key needed for this step — pure DB write)
- [ ] `pnpm provision status` shows `Players ranked: ~1252/1252`

---

## Commit

Conventional commit on `feat/rank-generate`:
`feat(provision): rank:generate — player props + advancement odds ranking`

Do not merge. Hold for Chat review. Merge sequence with Prompt 26 (waivers UI) to be coordinated
after both branches clear independently — fast-forward for whichever clears first, cherry-pick or
rebase for the second.
