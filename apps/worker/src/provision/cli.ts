/**
 * Provisioning CLI (runbook A4–A5) — the IO runner for the pure plan (plan.ts). Idempotent upserts that
 * stand up a league from a config the commissioner edits. Like @app/draft's prismaStore this is a thin
 * DB edge with no unit test (it needs a live DB); the pure plan is fully unit-tested. SECRETS NEVER live
 * here — the config holds only names/emails/timer; the DB URL comes from the env (Render/Supabase).
 *
 *   pnpm --filter @app/worker provision provision      # league + periods + managers + allowlist + pending draft
 *   pnpm --filter @app/worker provision bind            # link each manager to the app_user created at sign-in
 *   pnpm --filter @app/worker provision rank:generate   # build ranking-draft.csv from GOAT props + futures odds
 *   pnpm --filter @app/worker provision rank <file>     # populate player.default_rank (CSV from rank:generate, or JSON ids)
 *   pnpm --filter @app/worker provision draft            # START the draft via the controller's startDraft
 *   pnpm --filter @app/worker provision status          # print current provisioning state
 *
 * Config path: $PROVISION_CONFIG, else <repo-root>/provision.config.json (see provision.config.example.json).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { prisma } from "@app/db";
import { startDraft, DraftNotReadyError } from "@app/draft";
import { createPrismaDraftStore } from "@app/draft/prisma";
import { mapPosition } from "@app/ingest";
import type { FIFAPlayerProp } from "@app/feed";
import { feed } from "../wiring";
import {
  buildDefaultRankUpdates,
  buildProvisionPlan,
  normalizeEmail,
  validateConfig,
  type ProvisionConfig,
} from "./plan";
import {
  americanOddsToProb,
  computeRanking,
  toRankingCsv,
  parseRankingCsvIds,
  type MatchProps,
  type RankingCsvRow,
  type SquadPlayer,
} from "./rankGenerate";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
loadEnv({ path: resolve(repoRoot, ".env") });

function loadConfig(): ProvisionConfig {
  const path = process.env.PROVISION_CONFIG ?? resolve(repoRoot, "provision.config.json");
  const config = JSON.parse(readFileSync(path, "utf8")) as ProvisionConfig;
  const errors = validateConfig(config);
  if (errors.length > 0) {
    console.error(`Invalid config (${path}):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`Config OK: ${path}`);
  return config;
}

/** Single private league (ARCHITECTURE §4): find the one league, or null. */
async function findLeague() {
  return prisma.league.findFirst();
}

async function provision(): Promise<void> {
  const plan = buildProvisionPlan(loadConfig());

  // 1. League — single-league upsert (find-or-create, then keep config fields fresh).
  const existing = await findLeague();
  const leagueData = {
    name: plan.league.name,
    seasonYear: plan.league.seasonYear,
    timezone: plan.league.timezone,
    faabBatchLocalTime: plan.league.faabBatchLocalTime,
    resultFreezeHours: plan.league.resultFreezeHours,
    draftPickSeconds: plan.league.draftPickSeconds,
  };
  const league = existing
    ? await prisma.league.update({ where: { id: existing.id }, data: leagueData })
    : await prisma.league.create({ data: { ...leagueData, status: plan.league.status } });
  console.log(
    `league: ${existing ? "updated" : "created"} ${league.name} (${league.id}, status=${league.status})`,
  );

  // 2. Periods — upsert by (leagueId, label).
  for (const p of plan.periods) {
    await prisma.period.upsert({
      where: { leagueId_label: { leagueId: league.id, label: p.label } },
      create: { leagueId: league.id, kind: p.kind, label: p.label, cutCount: p.cutCount },
      update: { kind: p.kind, cutCount: p.cutCount },
    });
  }
  console.log(`periods: ${plan.periods.length} upserted`);

  // 3. Allowlist — upsert by (leagueId, email).
  for (const email of plan.allowlist) {
    await prisma.allowlistEmail.upsert({
      where: { leagueId_email: { leagueId: league.id, email } },
      create: { leagueId: league.id, email },
      update: {},
    });
  }
  console.log(`allowlist: ${plan.allowlist.length} upserted`);

  // 4. Managers + waiver order. faabBudget/userId are seeded on CREATE only (never clobber a started
  //    league). The waiver order is reseeded ONLY pre-draft (status 'draft'), via the schema's documented
  //    null-then-assign so the non-deferrable @@unique([leagueId, waiverOrderPosition]) never trips.
  await prisma.$transaction(async (tx) => {
    for (const m of plan.managers) {
      await tx.manager.upsert({
        where: { leagueId_draftSlot: { leagueId: league.id, draftSlot: m.draftSlot } },
        create: {
          leagueId: league.id,
          draftSlot: m.draftSlot,
          displayName: m.displayName,
          isCommissioner: m.isCommissioner,
          faabBudget: m.faabBudget,
        },
        update: { displayName: m.displayName, isCommissioner: m.isCommissioner },
      });
    }
    if (league.status === "draft") {
      await tx.manager.updateMany({
        where: { leagueId: league.id },
        data: { waiverOrderPosition: null },
      });
      for (const m of plan.managers) {
        await tx.manager.update({
          where: { leagueId_draftSlot: { leagueId: league.id, draftSlot: m.draftSlot } },
          data: { waiverOrderPosition: m.waiverOrderPosition },
        });
      }
    }
  });
  console.log(
    `managers: ${plan.managers.length} upserted` +
      (league.status === "draft"
        ? " (waiver order reseeded)"
        : " (waiver order left as-is; league not in draft)"),
  );

  // 5. The PENDING draft row — a benign placeholder, NOT a started server-authoritative draft. It exists
  //    only so the controller's startDraft (via `provision draft`) can ACTIVATE it. `update: {}` never
  //    touches an already-started draft, so re-running provision is safe.
  await prisma.draft.upsert({
    where: { leagueId: league.id },
    create: { leagueId: league.id },
    update: {},
  });
  console.log("draft: pending row ready.");

  console.log(
    "Done. Next: friends sign in via magic-link → `provision bind`, then `provision draft` to start.",
  );
}

/**
 * Start the draft — the commissioner's go-live. Calls the UNCHANGED controller `startDraft` (which
 * activates the pending row server-authoritatively: pick 1 on the clock, pick_deadline_at = now +
 * draft_pick_seconds, the first snake manager). We do NOT hand-insert an active draft row.
 */
async function startDraftCmd(): Promise<void> {
  const league = await findLeague();
  if (!league) {
    console.error("No league — run `provision provision` first.");
    process.exit(1);
  }
  const draft = await prisma.draft.findUnique({ where: { leagueId: league.id } });
  if (!draft) {
    console.error("No draft row — run `provision provision` first.");
    process.exit(1);
  }
  const store = createPrismaDraftStore(prisma);
  try {
    const res = await startDraft(store, draft.id, new Date());
    if (res.started) {
      console.log(
        "Draft STARTED — pick 1 is on the clock (pick_deadline_at = now + draft_pick_seconds).",
      );
      console.log("The worker draft ticker now enforces the deadline (autopick on expiry).");
    } else {
      console.log("Draft was not pending (already started or complete) — no change.");
    }
  } catch (err) {
    if (err instanceof DraftNotReadyError) {
      console.error(`Cannot start: ${err.message}. (Did you provision managers with draft slots?)`);
      process.exit(1);
    }
    throw err;
  }
}

async function bind(): Promise<void> {
  const config = loadConfig();
  const league = await findLeague();
  if (!league) {
    console.error("No league — run `provision provision` first.");
    process.exit(1);
  }
  let bound = 0;
  for (const m of config.managers) {
    const email = normalizeEmail(m.email);
    const user = await prisma.appUser.findUnique({ where: { email } });
    if (!user) {
      console.log(`  pending: ${email} hasn't signed in yet`);
      continue;
    }
    await prisma.manager.update({
      where: { leagueId_draftSlot: { leagueId: league.id, draftSlot: m.draftSlot } },
      data: { userId: user.id },
    });
    await prisma.allowlistEmail.update({
      where: { leagueId_email: { leagueId: league.id, email } },
      data: { claimedByUserId: user.id, claimedAt: new Date() },
    });
    bound += 1;
    console.log(`  bound: ${email} → manager slot ${m.draftSlot}`);
  }
  console.log(`bind: ${bound}/${config.managers.length} managers linked.`);
}

async function rank(): Promise<void> {
  const path = process.argv[3] ?? process.env.PROVISION_RANKING;
  if (!path) {
    console.error(
      "Usage: provision rank <ranking.csv|ranking.json>\n" +
        "  .csv  → a rank:generate CSV (reads the balldontlieId column in row order)\n" +
        "  .json → a best-first JSON array of balldontlie player ids",
    );
    process.exit(1);
  }
  // The DB-write logic below is UNCHANGED; only the source parse differs. A .csv path is a rank:generate
  // export (read the balldontlieId column in row order); anything else is the legacy best-first JSON array.
  const raw = readFileSync(resolve(repoRoot, path), "utf8");
  let ids: number[];
  if (path.toLowerCase().endsWith(".csv")) {
    ids = parseRankingCsvIds(raw);
    if (ids.length === 0) {
      console.error(
        "Ranking CSV had no data rows (expected a rank:generate export with a header).",
      );
      process.exit(1);
    }
  } else {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === "number")) {
      console.error("Ranking JSON must be a best-first array of balldontlie player ids (numbers).");
      process.exit(1);
    }
    ids = parsed as number[];
  }
  const updates = buildDefaultRankUpdates(ids);
  let ranked = 0;
  for (const u of updates) {
    const res = await prisma.player.updateMany({
      where: { balldontlieId: u.key },
      data: { defaultRank: u.defaultRank },
    });
    ranked += res.count;
  }
  console.log(`rank: set default_rank on ${ranked}/${ids.length} players (unmatched ids skipped).`);
}

/** American odds → implied prob for one bookmaker market (the OVER side of an over_under). null = unusable. */
function impliedFromMarket(p: FIFAPlayerProp): { lineValue: number; prob: number } | null {
  const line = Number.parseFloat(p.line_value);
  if (!Number.isFinite(line)) return null;
  const market = p.market;
  if (!market) return null;
  if (market.type === "milestone") {
    return { lineValue: Math.round(line), prob: americanOddsToProb(market.odds) };
  }
  if (market.type === "over_under") {
    // "over 0.5" ⇒ P(≥1), "over 1.5" ⇒ P(≥2): the integer threshold is ceil(line). Use the OVER price.
    return { lineValue: Math.ceil(line), prob: americanOddsToProb(market.over_odds) };
  }
  return null;
}

// The prop types {@link MatchProps} can carry. Only `anytime_goal` + `assists` are read by computeRanking
// today; the rest are in the union for future signal. The API also returns card/saves/tackles/etc. — those
// are dropped here so the ranking only ever sees the modelled types (and the narrow below stays honest, no
// blind cast on a raw vendor string).
const RANKING_PROP_TYPES = new Set<MatchProps["propType"]>([
  "anytime_goal",
  "assists",
  "shots",
  "shots_on_target",
  "first_goal",
]);
function isRankingPropType(t: string): t is MatchProps["propType"] {
  return RANKING_PROP_TYPES.has(t as MatchProps["propType"]);
}

/**
 * Step 5 — de-vig: keep only the ranking-relevant prop types, group DraftKings + FanDuel quotes by
 * (player, match, propType, lineValue), and average their implied probabilities into one {@link MatchProps}
 * row. Only those two vendors are used (the spec's DK+FD average); a single present vendor is used directly.
 * Unusable markets / line values / non-ranking prop types are dropped.
 */
function devigProps(raw: FIFAPlayerProp[]): MatchProps[] {
  const VENDORS = new Set(["draftkings", "fanduel"]);
  const groups = new Map<
    string,
    {
      matchId: number;
      playerId: number;
      propType: MatchProps["propType"];
      lineValue: number;
      probs: number[];
    }
  >();
  for (const p of raw) {
    if (!VENDORS.has(p.vendor)) continue;
    if (!isRankingPropType(p.prop_type)) continue;
    const m = impliedFromMarket(p);
    if (!m) continue;
    const key = `${p.player_id}|${p.match_id}|${p.prop_type}|${m.lineValue}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        matchId: p.match_id,
        playerId: p.player_id,
        propType: p.prop_type,
        lineValue: m.lineValue,
        probs: [],
      };
      groups.set(key, g);
    }
    g.probs.push(m.prob);
  }
  return [...groups.values()].map((g) => ({
    matchId: g.matchId,
    playerId: g.playerId,
    propType: g.propType,
    lineValue: g.lineValue,
    impliedProb: g.probs.reduce((a, b) => a + b, 0) / g.probs.length,
  }));
}

/** Average the American tournament-winner odds per team (one quote per vendor) into a single number. */
function teamWinOddsFromFutures(
  winners: { subject?: { id: number } | null; american_odds?: number | null }[],
): Record<number, number> {
  const acc = new Map<number, number[]>();
  for (const f of winners) {
    const id = f.subject?.id;
    if (id == null || f.american_odds == null) continue;
    let odds = acc.get(id);
    if (!odds) acc.set(id, (odds = []));
    odds.push(f.american_odds);
  }
  const out: Record<number, number> = {};
  for (const [id, odds] of acc) out[id] = Math.round(odds.reduce((a, b) => a + b, 0) / odds.length);
  return out;
}

/**
 * `rank:generate` — fetch GOAT props + futures + rosters, compute a projected-points ranking, and write
 * apps/worker/ranking-draft.csv for review. IO edge only; the ranking math is the unit-tested pure core.
 * Needs BALLDONTLIE_API_KEY (and ideally BALLDONTLIE_RPM=600 for the paid GOAT rate) in the env.
 */
async function generate(): Promise<void> {
  // 1. Group-stage matches (the prop universe). `feed.matches` exhausts the cursor.
  const matchesRes = await feed.matches({ seasons: [2026] });
  const groupMatches = matchesRes.data.filter((m) => m.stage?.name === "Group Stage");
  console.log(`matches: ${matchesRes.data.length} fetched, ${groupMatches.length} group-stage`);

  // Build a teamId → name map from the match team refs (used for the CSV `team` column).
  const teamNames: Record<number, string> = {};
  for (const m of matchesRes.data) {
    for (const t of [m.home_team, m.away_team]) {
      if (t?.id != null && t.name && !teamNames[t.id]) teamNames[t.id] = t.name;
    }
  }

  // 2. Player props per match — tolerate a per-match failure (log + continue), don't abort the run.
  const rawProps: FIFAPlayerProp[] = [];
  for (const m of groupMatches) {
    try {
      const res = await feed.playerProps({ matchId: m.id });
      rawProps.push(...res.data);
    } catch (err) {
      console.warn(`  WARN props fetch failed for match ${m.id}: ${(err as Error).message}`);
    }
  }
  console.log(`props: ${rawProps.length} bookmaker rows fetched`);

  // 3. Team tournament-winner futures → expectedMatches multiplier. Missing data ⇒ all teams at 3.0.
  let teamWinOdds: Record<number, number> = {};
  try {
    const fut = await feed.futures({ seasons: [2026] });
    const winners = fut.data.filter((f) => f.market_type === "tournament_winner");
    for (const f of winners) {
      if (f.subject?.id != null && f.subject.name && !teamNames[f.subject.id]) {
        teamNames[f.subject.id] = f.subject.name;
      }
    }
    teamWinOdds = teamWinOddsFromFutures(winners);
    if (winners.length === 0) {
      console.warn(
        "  WARN no tournament_winner futures — all teams default to 3.0 expected matches.",
      );
    } else {
      for (const [id, odds] of Object.entries(teamWinOdds)) {
        console.log(
          `  futures: ${teamNames[Number(id)] ?? `team ${id}`} @ ${odds > 0 ? "+" : ""}${odds}`,
        );
      }
    }
  } catch (err) {
    console.warn(
      `  WARN futures fetch failed (${(err as Error).message}); all teams default to 3.0.`,
    );
  }

  // 4. Rosters — the squad universe. Zero players ⇒ abort (a ranking with no players is meaningless).
  const rostersRes = await feed.rosters({ seasons: [2026] });
  if (rostersRes.data.length === 0) {
    console.error("ABORT: rosters returned zero players — cannot rank an empty squad.");
    process.exit(1);
  }
  const players: SquadPlayer[] = [];
  const playerTeam: Record<number, number> = {};
  for (const r of rostersRes.data) {
    const id = r.player.id;
    players.push({
      balldontlieId: id,
      name: r.player.name,
      position: mapPosition(r.position ?? r.player.position),
      teamId: r.team_id,
    });
    playerTeam[id] = r.team_id;
    if (r.team_id != null && !teamNames[r.team_id] && r.player.country_name) {
      teamNames[r.team_id] = r.player.country_name;
    }
  }
  console.log(
    `rosters: ${players.length} players across ${new Set(Object.values(playerTeam)).size} teams`,
  );

  // 5. De-vig the bookmaker quotes into per-line implied probabilities.
  const props = devigProps(rawProps);
  console.log(`props (de-vigged DK+FD): ${props.length} player×match×type×line rows`);

  // 6. Pure ranking.
  const ranked = computeRanking({ players, props, teamWinOdds, playerTeam });

  // 7. Write the review CSV (gitignored). The row ORDER is the ranking the `rank` command will apply.
  const rows: RankingCsvRow[] = ranked.map((r, i) => ({
    rank: i + 1,
    balldontlieId: r.balldontlieId,
    name: r.name,
    position: r.position,
    team: teamNames[playerTeam[r.balldontlieId] ?? -1] ?? String(playerTeam[r.balldontlieId] ?? ""),
    projectedPts: r.projectedPts,
    expectedMatches: r.expectedMatches,
    hasProps: r.hasProps,
  }));
  const outPath = resolve(here, "../../ranking-draft.csv"); // apps/worker/ranking-draft.csv
  writeFileSync(outPath, toRankingCsv(rows), "utf8");
  console.log(`Wrote ${rows.length} players to ranking-draft.csv`);

  // 8. Next-step instructions.
  console.log("\nReview ranking-draft.csv, adjust any rows, then run:");
  console.log("  pnpm provision rank ranking-draft.csv");
  console.log("to write default_rank to the database.");
}

async function status(): Promise<void> {
  const league = await findLeague();
  if (!league) {
    console.log("No league provisioned yet.");
    return;
  }
  const [managers, bound, periods, allowlist, ranked, players] = await Promise.all([
    prisma.manager.count({ where: { leagueId: league.id } }),
    prisma.manager.count({ where: { leagueId: league.id, userId: { not: null } } }),
    prisma.period.count({ where: { leagueId: league.id } }),
    prisma.allowlistEmail.count({ where: { leagueId: league.id } }),
    prisma.player.count({ where: { defaultRank: { not: null } } }),
    prisma.player.count(),
  ]);
  console.log(
    `League: ${league.name} (status=${league.status}, draftPickSeconds=${league.draftPickSeconds})`,
  );
  console.log(
    `Managers: ${managers} (${bound} bound to a signed-in user, ${managers - bound} pending)`,
  );
  console.log(`Periods: ${periods}   Allowlist: ${allowlist}`);
  console.log(`Players ranked: ${ranked}/${players} (default_rank populated)`);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  switch (command) {
    case "provision":
      await provision();
      break;
    case "bind":
      await bind();
      break;
    case "rank:generate":
      await generate();
      break;
    case "rank":
      await rank();
      break;
    case "draft":
      await startDraftCmd();
      break;
    case "status":
      await status();
      break;
    default:
      console.error("Usage: provision <provision|bind|rank:generate|rank|draft|status>");
      process.exit(1);
  }
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
