/**
 * Commissioner-override CLI (Render-Shell runnable) — repairs "our-fault" roster/lineup moves the app's
 * (previously missing) free-agency UI blocked. DRY-RUN by default; pass `--apply` to execute.
 *
 *   pnpm --filter @app/worker commish:roster \
 *     --as smrios07@gmail.com --team "Los Dragones" --add "Mbappé" --drop "Saka" \
 *     --reason "FA UI was down; honoring his pre-kickoff swap" [--allow-post-kickoff] [--apply]
 *
 *   pnpm --filter @app/worker commish:lineup \
 *     --as smrios07@gmail.com --team "Los Dragones" --period "MD1" \
 *     --starters "Donnarumma,Hakimi,Saliba,Hernandez,Rice,Bellingham,Pedri,Olmo,Mbappé,Kane,Yamal" \
 *     --reason "lineup lock hit before they could save" [--apply]
 *
 * IO ONLY: it resolves names→ids, builds the real Prisma stores, and delegates EVERY decision to the
 * pure/injected-deps orchestrators ({@link ./roster}, {@link ./lineup}) — which keep the engine invariants
 * (cap / active-ownership unique / valid-drop / formation legality) and the override guards (commissioner
 * gate / reason / kickoff guard / idempotency / audit). The audit is structured stdout (no new table).
 */
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { prisma } from "@app/db";
import { createPrismaFaGrantStore } from "@app/faab/prisma";
import { createPrismaLineupStore } from "@app/lineup/prisma";
import {
  isCommissionerActor,
  resolvePlayer,
  resolveTeam,
  type NamedPlayer,
  type NamedTeam,
  type Resolution,
} from "./core";
import { runRosterOverride, type RosterResult } from "./roster";
import { runLineupOverride, type LineupResult } from "./lineup";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolvePath(here, "../../../..");
loadEnv({ path: resolvePath(repoRoot, ".env") });

// ── tiny argv parser (hand-rolled, mirrors provision/cli.ts conventions) ────────────
function parseFlags(argv: string[]): { flags: Record<string, string>; bools: Set<string> } {
  const flags: Record<string, string> = {};
  const bools = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a || !a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) bools.add(key);
    else {
      flags[key] = next;
      i++;
    }
  }
  return { flags, bools };
}

function die(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

function reqFlag(flags: Record<string, string>, key: string): string {
  const v = flags[key]?.trim();
  if (!v) die(`missing required --${key}`);
  return v!;
}

// ── identity + league resolution ────────────────────────────────────────────────────
async function resolveActor(email: string): Promise<{ email: string; isCommissioner: boolean }> {
  const user = await prisma.appUser.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  let isCommissioner = false;
  if (user) {
    const mgr = await prisma.manager.findFirst({
      where: { userId: user.id },
      select: { isCommissioner: true },
    });
    isCommissioner = mgr?.isCommissioner ?? false;
  }
  return { email, isCommissioner };
}

async function leagueIdForActor(email: string): Promise<string> {
  const user = await prisma.appUser.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (user) {
    const mgr = await prisma.manager.findFirst({
      where: { userId: user.id },
      select: { leagueId: true },
    });
    if (mgr) return mgr.leagueId;
  }
  // Single-league deployment (ARCHITECTURE.md §4): fall back to the one league.
  const league = await prisma.league.findFirst({ select: { id: true } });
  if (!league) die("no league found");
  return league!.id;
}

async function loadTeams(leagueId: string): Promise<NamedTeam[]> {
  const rows = await prisma.manager.findMany({
    where: { leagueId },
    select: { id: true, displayName: true },
  });
  return rows.map((m) => ({ managerId: m.id, displayName: m.displayName }));
}

async function loadPlayers(): Promise<NamedPlayer[]> {
  const rows = await prisma.player.findMany({
    select: { id: true, displayName: true, firstName: true, lastName: true },
  });
  return rows;
}

/** Unwrap a resolution or abort with the candidate list (never guess on ambiguity). */
function pick<T extends { displayName: string }>(r: Resolution<T>, what: string, q: string): T {
  if (r.kind === "ok") return r.value;
  if (r.kind === "none") return die(`no ${what} matches "${q}"`);
  return die(
    `"${q}" is ambiguous — ${what} candidates:\n  ${r.candidates.map((c) => c.displayName).join("\n  ")}`,
  );
}

// ── the add target's relevant fixture (per-player kickoff guard + audit) ─────────────
function makeGetAddMatch(now: Date) {
  const sel = {
    kickoffAt: true,
    homeTeam: { select: { name: true } },
    awayTeam: { select: { name: true } },
  } as const;
  return async (playerId: string): Promise<{ label: string; kickoffAt: Date } | null> => {
    const p = await prisma.player.findUnique({ where: { id: playerId }, select: { teamId: true } });
    if (!p?.teamId) return null;
    const where = { OR: [{ homeTeamId: p.teamId }, { awayTeamId: p.teamId }] };
    // The "relevant" fixture = the next upcoming one; if none remain, the most recent played one.
    const next = await prisma.fifaMatch.findFirst({
      where: { ...where, kickoffAt: { gte: now } },
      orderBy: { kickoffAt: "asc" },
      select: sel,
    });
    const m =
      next ??
      (await prisma.fifaMatch.findFirst({ where, orderBy: { kickoffAt: "desc" }, select: sel }));
    if (!m) return null;
    return {
      label: `${m.homeTeam?.name ?? "?"} v ${m.awayTeam?.name ?? "?"}`,
      kickoffAt: m.kickoffAt,
    };
  };
}

// ── sub-commands ─────────────────────────────────────────────────────────────────────
async function rosterCmd(argv: string[]): Promise<void> {
  const { flags, bools } = parseFlags(argv);
  const asEmail = reqFlag(flags, "as");
  const teamLabel = reqFlag(flags, "team");
  const addQ = reqFlag(flags, "add");
  const dropQ = flags["drop"]?.trim() ?? null;
  const reason = reqFlag(flags, "reason");
  const apply = bools.has("apply");
  const allowPostKickoff = bools.has("allow-post-kickoff");
  const now = new Date();

  const actor = await resolveActor(asEmail);
  if (!isCommissionerActor(actor)) die(`${asEmail} is not the commissioner — override refused`);

  const leagueId = await leagueIdForActor(asEmail);
  const team = pick(resolveTeam(await loadTeams(leagueId), teamLabel), "team", teamLabel);
  const players = await loadPlayers();
  const add = pick(resolvePlayer(players, addQ), "add player", addQ);
  const drop = dropQ ? pick(resolvePlayer(players, dropQ), "drop player", dropQ) : null;

  const res = await runRosterOverride(
    {
      now,
      store: createPrismaFaGrantStore(prisma),
      getAddMatch: makeGetAddMatch(now),
      log: (l) => console.log(l),
    },
    {
      actor,
      managerId: team.managerId,
      teamLabel: team.displayName,
      addId: add.id,
      addName: add.displayName,
      dropId: drop?.id ?? null,
      dropName: drop?.displayName ?? null,
      reason,
      apply,
      allowPostKickoff,
      timestamp: now.toISOString(),
    },
  );
  reportRoster(res, apply);
}

function reportRoster(res: RosterResult, apply: boolean): void {
  if ("plan" in res && res.plan) {
    const p = res.plan;
    console.log("── commish:roster plan ─────────────────────────────");
    console.log(`  team:   ${p.team} (${p.managerId})`);
    console.log(`  add:    ${p.add}`);
    console.log(`  drop:   ${p.drop ?? "(none — open slot)"}`);
    console.log(
      `  match:  ${p.addMatch ? `${p.addMatch.label} @ ${p.addMatch.kickoffAt}` : "(no fixture)"}` +
        ` — ${p.alreadyPlayed ? "ALREADY KICKED OFF" : "not yet kicked off"}`,
    );
    console.log("────────────────────────────────────────────────────");
  }
  switch (res.status) {
    case "planned":
      console.log(apply ? "(nothing applied)" : "DRY-RUN — re-run with --apply to execute.");
      break;
    case "applied":
      console.log("✓ applied.");
      break;
    case "skipped":
      console.log(`↷ skipped — ${res.reason}`);
      break;
    default:
      die(res.reason);
  }
}

async function lineupCmd(argv: string[]): Promise<void> {
  const { flags, bools } = parseFlags(argv);
  const asEmail = reqFlag(flags, "as");
  const teamLabel = reqFlag(flags, "team");
  const periodLabel = reqFlag(flags, "period");
  const startersRaw = reqFlag(flags, "starters");
  const reason = reqFlag(flags, "reason");
  const apply = bools.has("apply");
  const now = new Date();

  const actor = await resolveActor(asEmail);
  if (!isCommissionerActor(actor)) die(`${asEmail} is not the commissioner — override refused`);

  const leagueId = await leagueIdForActor(asEmail);
  const team = pick(resolveTeam(await loadTeams(leagueId), teamLabel), "team", teamLabel);
  const period = await prisma.period.findFirst({
    where: { leagueId, label: { equals: periodLabel, mode: "insensitive" } },
    select: { id: true, label: true },
  });
  if (!period) die(`no period labelled "${periodLabel}"`);

  const players = await loadPlayers();
  const names = startersRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const starters = names.map((n) => pick(resolvePlayer(players, n), "starter", n));

  const res = await runLineupOverride(
    { now, store: createPrismaLineupStore(prisma), log: (l) => console.log(l) },
    {
      actor,
      managerId: team.managerId,
      teamLabel: team.displayName,
      periodId: period!.id,
      periodLabel: period!.label,
      starterIds: starters.map((p) => p.id),
      starterNames: starters.map((p) => p.displayName),
      reason,
      apply,
      timestamp: now.toISOString(),
    },
  );
  reportLineup(res, apply);
}

function reportLineup(res: LineupResult, apply: boolean): void {
  if ("plan" in res) {
    const p = res.plan;
    console.log("── commish:lineup plan ─────────────────────────────");
    console.log(`  team:   ${p.team} (${p.managerId})`);
    console.log(`  period: ${p.periodLabel}`);
    console.log(`  before: ${p.before.length ? p.before.join(", ") : "(none set)"}`);
    console.log(`  after:  ${p.after.join(", ")}`);
    console.log("────────────────────────────────────────────────────");
  }
  switch (res.status) {
    case "planned":
      console.log(apply ? "(nothing applied)" : "DRY-RUN — re-run with --apply to execute.");
      break;
    case "applied":
      console.log("✓ applied.");
      break;
    case "skipped":
      console.log(`↷ skipped — ${res.reason}`);
      break;
    default:
      die(res.reason);
  }
}

// ── entry ────────────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const command = process.argv[2];
  const rest = process.argv.slice(3);
  switch (command) {
    case "roster":
      await rosterCmd(rest);
      break;
    case "lineup":
      await lineupCmd(rest);
      break;
    default:
      console.error(
        "Usage: commish <roster|lineup> --as <email> --team <label> --reason <text> [--apply]",
      );
      process.exit(1);
  }
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
