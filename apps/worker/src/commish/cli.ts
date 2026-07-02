/**
 * Commissioner-override CLI (Render-Shell runnable) — repairs "our-fault" roster/lineup moves the app's
 * (previously missing) free-agency UI blocked. DRY-RUN by default; pass `--apply` to execute.
 *
 *   pnpm --filter @app/worker commish:roster \
 *     --as smrios07@gmail.com --team "Los Dragones" --add "Mbappé" --drop "Saka" \
 *     --reason "FA UI was down; honoring his pre-kickoff swap" [--period "MD1"] [--allow-post-kickoff] [--apply]
 *
 *   pnpm --filter @app/worker commish:lineup \
 *     --as smrios07@gmail.com --team "Los Dragones" --period "MD1" \
 *     --starters "Donnarumma,Hakimi,Saliba,Hernandez,Rice,Bellingham,Pedri,Olmo,Mbappé,Kane,Yamal" \
 *     --reason "lineup lock hit before they could save" [--allow-locked-slot] [--apply]
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
import { createPrismaFaGrantStore, createPrismaFaabReleaseStore } from "@app/faab/prisma";
import { DEFAULT_FAAB_BATCH_LEAD_MIN } from "@app/faab";
import { createPrismaLineupStore } from "@app/lineup/prisma";
import {
  isCommissionerActor,
  resolvePlayer,
  resolveTeam,
  type NamedPlayer,
  type NamedTeam,
  type Resolution,
  runRosterOverride,
  type RosterResult,
  runLineupOverride,
  type LineupResult,
  runTrimOverride,
  runTrimReport,
  type TrimResult,
  type TrimReportResult,
} from "@app/commish-core";
import { runPlayoffTransition, type TransitionResult } from "./transition";
import { createPrismaPlayoffTransitionStore } from "./transitionStore";
import { runRoundAdvance, type AdvanceResult } from "./advance";
import { createPrismaPlayoffAdvanceStore } from "./advanceStore";

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

/** A manager's ACTIVE roster players (id + names) — the scoped pool `commish:trim` resolves --drop/--keep
 *  names against, so a cut never matches a player the manager doesn't own. */
async function loadRosterPlayers(managerId: string): Promise<NamedPlayer[]> {
  const rows = await prisma.rosterPlayer.findMany({
    where: { managerId, droppedAt: null },
    select: {
      player: { select: { id: true, displayName: true, firstName: true, lastName: true } },
    },
  });
  return rows.map((r) => r.player);
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
  const label = (m: {
    homeTeam: { name: string } | null;
    awayTeam: { name: string } | null;
  }): string => `${m.homeTeam?.name ?? "?"} v ${m.awayTeam?.name ?? "?"}`;
  return async (
    playerId: string,
    pinnedPeriodId: string | null,
  ): Promise<{ label: string; kickoffAt: Date } | null> => {
    const p = await prisma.player.findUnique({ where: { id: playerId }, select: { teamId: true } });
    if (!p?.teamId) return null;
    const where = { OR: [{ homeTeamId: p.teamId }, { awayTeamId: p.teamId }] };
    // With --period, the kickoff guard keys off the add's fixture IN THAT period (an already-played
    // player's MD match — already kicked off), NOT his next upcoming one (a later MD that would falsely
    // read "not yet kicked off").
    if (pinnedPeriodId !== null) {
      const pm = await prisma.fifaMatch.findFirst({
        where: { ...where, periodId: pinnedPeriodId },
        orderBy: { kickoffAt: "asc" },
        select: sel,
      });
      return pm ? { label: label(pm), kickoffAt: pm.kickoffAt } : null;
    }
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
    return { label: label(m), kickoffAt: m.kickoffAt };
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
  const periodLabel = flags["period"]?.trim() ?? null;
  const now = new Date();

  const actor = await resolveActor(asEmail);
  if (!isCommissionerActor(actor)) die(`${asEmail} is not the commissioner — override refused`);

  const leagueId = await leagueIdForActor(asEmail);
  const team = pick(resolveTeam(await loadTeams(leagueId), teamLabel), "team", teamLabel);
  const players = await loadPlayers();
  const add = pick(resolvePlayer(players, addQ), "add player", addQ);
  const drop = dropQ ? pick(resolvePlayer(players, dropQ), "drop player", dropQ) : null;

  // Optional --period pin: scope the FA snapshot + kickoff guard to THIS period (resolve label→id like
  // lineupCmd, but optional). Repairs an already-played add whose next-fixture-inferred period is a
  // still-sealed later MD. null ⇒ the existing next-fixture behavior.
  let pinnedPeriodId: string | null = null;
  let pinnedPeriodLabel: string | null = null;
  if (periodLabel) {
    const period = await prisma.period.findFirst({
      where: { leagueId, label: { equals: periodLabel, mode: "insensitive" } },
      select: { id: true, label: true },
    });
    if (!period) die(`no period labelled "${periodLabel}"`);
    pinnedPeriodId = period.id;
    pinnedPeriodLabel = period.label;
  }

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
      pinnedPeriodId,
      pinnedPeriodLabel,
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
    if (p.pinnedPeriod)
      console.log(
        `  period: ${p.pinnedPeriod} (pinned — snapshot + kickoff guard key off this period)`,
      );
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
  const reason = reqFlag(flags, "reason"); // --reason is required for ALL overrides, incl. --allow-locked-slot
  const apply = bools.has("apply");
  const allowLockedSlot = bools.has("allow-locked-slot");
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
      allowLockedSlot,
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

// ── group→playoff transition (Theme C/D) ─────────────────────────────────────────────
//   pnpm --filter @app/worker commish:transition \
//     --as smrios07@gmail.com --field 8 \
//     --reason "group stage complete; collapsing into the guillotine ladder" \
//     [--allow-incomplete-standings] [--apply]
// DRY-RUN by default: prints the standings-finality status + seeded field + per-round cut schedule +
// release/trim plan. --apply runs the IRREVERSIBLE transition in one transaction (idempotent — a second
// --apply is a no-op). Refuses over unfrozen group periods unless --allow-incomplete-standings.
async function transitionCmd(argv: string[]): Promise<void> {
  const { flags, bools } = parseFlags(argv);
  const asEmail = reqFlag(flags, "as");
  const fieldRaw = reqFlag(flags, "field");
  const reason = reqFlag(flags, "reason");
  const apply = bools.has("apply");
  const allowIncompleteStandings = bools.has("allow-incomplete-standings");
  const now = new Date();

  const fieldSize = Number(fieldRaw);
  if (!Number.isInteger(fieldSize) || fieldSize <= 0) {
    die(
      `--field must be a positive integer (the playoff field size, e.g. 8 or 10), got "${fieldRaw}"`,
    );
  }

  const actor = await resolveActor(asEmail);
  if (!isCommissionerActor(actor)) die(`${asEmail} is not the commissioner — transition refused`);

  const leagueId = await leagueIdForActor(asEmail);
  const nameOf = new Map((await loadTeams(leagueId)).map((t) => [t.managerId, t.displayName]));
  // The FAAB batch lead (same as the worker config) feeds the trim-deadline derivation. Read here (after
  // dotenv has loaded) rather than importing the worker config module (which evaluates env at import).
  const leadMs = (Number(process.env.FAAB_BATCH_LEAD_MIN) || DEFAULT_FAAB_BATCH_LEAD_MIN) * 60_000;

  const res = await runPlayoffTransition(
    {
      now,
      leadMs,
      store: createPrismaPlayoffTransitionStore(prisma),
      log: (l) => console.log(l),
    },
    { actor, leagueId, fieldSize, reason, allowIncompleteStandings, apply },
  );
  reportTransition(res, apply, nameOf);
}

function reportTransition(
  res: TransitionResult,
  apply: boolean,
  nameOf: Map<string, string>,
): void {
  const name = (id: string): string => nameOf.get(id) ?? id;
  if ("plan" in res && res.plan) {
    const p = res.plan;
    console.log("── commish:transition plan ─────────────────────────");
    console.log(`  league:       ${p.leagueId}`);
    console.log(
      `  standings:    ${
        p.unfinalizedGroupPeriods.length === 0
          ? "FINAL ✓ (all group periods frozen)"
          : `⚠ NOT FINAL — ${p.unfinalizedGroupPeriods.join(", ")} unfrozen (seeding via --allow-incomplete-standings)`
      }`,
    );
    console.log(`  field size:   ${p.fieldSize}  (${p.released.length} non-advancer(s) released)`);
    console.log(`  status flip:  group → playoff`);
    console.log("  field (seed → manager):");
    for (const f of p.field)
      console.log(`     ${String(f.seed).padStart(2)}  ${name(f.managerId)}`);
    console.log("  cut schedule (round → cut_count):");
    for (const c of p.cutSchedule) console.log(`     ${c.round.padEnd(5)} ${c.cutCount}`);
    console.log(`  released to FAAB pool (${p.released.length}):`);
    for (const r of p.released) console.log(`     ${r.displayName}  (${r.releasedCount} players)`);
    console.log("  budget:       carried forward (one-time tournament allowance — not reset)");
    console.log("  waiver order (carried forward, eliminated removed, no re-seed):");
    for (const w of p.waiverOrder) {
      console.log(`     ${String(w.position).padStart(2)}  ${name(w.managerId)}`);
    }
    console.log(
      `  trim:         15 → ${p.trimCap} by ${
        p.trimDeadlineAt
          ? `${p.trimDeadlineAt.toISOString()} (first playoff batch)`
          : "the first playoff batch (R32 fixtures not yet synced — deadline derived then)"
      }`,
    );
    console.log("────────────────────────────────────────────────────");
  }
  switch (res.status) {
    case "planned":
      console.log(
        apply
          ? "(nothing applied)"
          : "DRY-RUN — re-run with --apply to execute the IRREVERSIBLE transition.",
      );
      break;
    case "applied":
      console.log("✓ transition applied.");
      break;
    case "skipped":
      console.log(`↷ skipped — ${res.reason}`);
      break;
    default:
      die(res.reason);
  }
}

// ── playoff per-round cut application (Theme C — the guillotine ladder) ───────────────
//   pnpm --filter @app/worker commish:advance \
//     --as smrios07@gmail.com --round R32 \
//     --reason "R32 frozen; applying the guillotine cut" [--break-tie "Team A,Team B"] \
//     [--allow-incomplete] [--apply]
// DRY-RUN by default: prints the round, FROZEN status, the alive field with each round score +
// cumulative total, and the computed cut (or a boundary tie awaiting --break-tie). --apply runs the
// IRREVERSIBLE cut in one transaction (idempotent — a re-run is a no-op). A residual tie is NEVER
// auto-cut; the commissioner names exactly `cutsRemaining` managers via --break-tie (team labels).
async function advanceCmd(argv: string[]): Promise<void> {
  const { flags, bools } = parseFlags(argv);
  const asEmail = reqFlag(flags, "as");
  const roundLabel = reqFlag(flags, "round");
  const reason = reqFlag(flags, "reason");
  const apply = bools.has("apply");
  const allowIncomplete = bools.has("allow-incomplete");
  const breakTieRaw = flags["break-tie"]?.trim() ?? null;
  const now = new Date();

  const actor = await resolveActor(asEmail);
  if (!isCommissionerActor(actor)) die(`${asEmail} is not the commissioner — advance refused`);

  const leagueId = await leagueIdForActor(asEmail);
  const teams = await loadTeams(leagueId);
  const nameOf: Record<string, string> = {};
  for (const t of teams) nameOf[t.managerId] = t.displayName;

  // --break-tie names team labels; resolve each to a managerId (ambiguity aborts, never guesses).
  let breakTie: string[] | null = null;
  if (breakTieRaw) {
    breakTie = breakTieRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((label) => pick(resolveTeam(teams, label), "team", label).managerId);
  }

  const res = await runRoundAdvance(
    { now, store: createPrismaPlayoffAdvanceStore(prisma), log: (l) => console.log(l) },
    {
      actor,
      leagueId,
      roundLabel,
      reason,
      breakTie,
      allowIncomplete,
      apply,
      nameOf,
      timestamp: now.toISOString(),
    },
  );
  reportAdvance(res, apply);
}

function reportAdvance(res: AdvanceResult, apply: boolean): void {
  if ("plan" in res && res.plan) {
    const p = res.plan;
    const nm = new Map(p.field.map((f) => [f.managerId, f.name] as const));
    const label = (id: string): string => nm.get(id) ?? id;
    console.log("── commish:advance plan ────────────────────────────");
    console.log(
      `  round:    ${p.round}${p.isFinalRound ? " (FINAL)" : ""}  — cut ${p.cutCount ?? "?"}`,
    );
    console.log(
      `  period:   ${p.frozen ? "FROZEN ✓" : "⚠ NOT FROZEN"}${p.alreadyCut ? "  (already cut)" : ""}`,
    );
    console.log("  alive field (round / cumulative):");
    for (const f of p.field) {
      console.log(
        `     ${String(f.roundPoints).padStart(4)}  ${String(f.cumulativeTotal).padStart(5)}  ${f.name}`,
      );
    }
    const r = p.resolution;
    if (r?.kind === "determined") {
      console.log(`  cut:      ${r.eliminated.map(label).join(", ")}`);
      if (r.champion) console.log(`  champion: ${label(r.champion)} 🏆`);
    } else if (r?.kind === "needsCommissioner") {
      console.log(`  ⚠ TIE — cut ${r.cutsRemaining} of: ${r.tied.map(label).join(", ")}`);
      console.log(`     re-run --apply --break-tie "<labels>" naming exactly ${r.cutsRemaining}`);
    } else if (r?.kind === "invalid-tiebreak") {
      console.log(`  ✖ ${r.reason}`);
    }
    console.log("────────────────────────────────────────────────────");
  }
  switch (res.status) {
    case "planned":
      console.log(
        apply
          ? "(nothing applied)"
          : "DRY-RUN — re-run with --apply to execute the IRREVERSIBLE cut.",
      );
      break;
    case "applied":
      console.log("✓ round cut applied.");
      break;
    case "skipped":
      console.log(`↷ skipped — ${res.reason}`);
      break;
    default:
      die(res.reason); // refused / needs-commissioner
  }
}

// ── playoff trim-down force-trim (DECISIONS §D) ───────────────────────────────────────
//   pnpm --filter @app/worker commish:trim \
//     --as smrios07@gmail.com --team "Los Dragones" --keep "Donnarumma,Hakimi,..." \
//     --reason "they never trimmed; cutting to the cap before R32 locks" [--allow-locked-slot] [--apply]
//   pnpm --filter @app/worker commish:trim --as smrios07@gmail.com --report   # survivors over cap (dry)
// DRY-RUN by default. Reuses the @app/faab release primitive (validateRelease + releaseRoster); --report
// (or no --team) lists survivors still over cap and never cuts — the cut choice is the operator's.
async function trimCmd(argv: string[]): Promise<void> {
  const { flags, bools } = parseFlags(argv);
  const asEmail = reqFlag(flags, "as");
  const report = bools.has("report");
  const teamLabel = flags["team"]?.trim() ?? null;
  const now = new Date();

  const actor = await resolveActor(asEmail);
  if (!isCommissionerActor(actor)) die(`${asEmail} is not the commissioner — trim refused`);
  const leagueId = await leagueIdForActor(asEmail);

  // Report mode: --report, or no --team named.
  if (report || !teamLabel) {
    const res = await runTrimReport(
      { store: createPrismaFaabReleaseStore(prisma) },
      { actor, leagueId },
    );
    const nameOf = new Map((await loadTeams(leagueId)).map((t) => [t.managerId, t.displayName]));
    reportTrimReport(res, nameOf);
    await prisma.$disconnect();
    return;
  }

  const reason = reqFlag(flags, "reason");
  const apply = bools.has("apply");
  const allowLocked = bools.has("allow-locked-slot");
  const dropRaw = flags["drop"]?.trim() ?? null;
  const keepRaw = flags["keep"]?.trim() ?? null;
  if ((dropRaw === null) === (keepRaw === null)) {
    die("pass exactly one of --drop <csv> or --keep <csv>");
  }

  const team = pick(resolveTeam(await loadTeams(leagueId), teamLabel), "team", teamLabel);
  const rosterPlayers = await loadRosterPlayers(team.managerId);
  const nameOf: Record<string, string> = {};
  for (const p of rosterPlayers) nameOf[p.id] = p.displayName;

  // Resolve --drop / --keep names against the manager's OWN roster (ambiguity aborts, never guesses).
  const resolveList = (raw: string): string[] =>
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((n) => pick(resolvePlayer(rosterPlayers, n), "roster player", n).id);

  const selection =
    dropRaw !== null
      ? ({ kind: "drop", ids: resolveList(dropRaw) } as const)
      : ({ kind: "keep", ids: resolveList(keepRaw!) } as const);

  const res = await runTrimOverride(
    { now, store: createPrismaFaabReleaseStore(prisma), log: (l) => console.log(l) },
    {
      actor,
      managerId: team.managerId,
      teamLabel: team.displayName,
      selection,
      nameOf,
      reason,
      apply,
      allowLocked,
      timestamp: now.toISOString(),
    },
  );
  reportTrim(res, apply);
}

function reportTrim(res: TrimResult, apply: boolean): void {
  if ("plan" in res && res.plan) {
    const p = res.plan;
    console.log("── commish:trim plan ──────────────────────────────");
    console.log(`  team:   ${p.team} (${p.managerId})`);
    console.log(`  squad:  ${p.before} → ${p.after}  (cap ${p.rosterCap})`);
    console.log(`  drop:   ${p.dropNames.length ? p.dropNames.join(", ") : "(none)"}`);
    if (p.unfillable) {
      console.log("  ⚠️  WARNING — the remaining squad CANNOT field a legal playoff XI");
    }
    console.log("────────────────────────────────────────────────────");
  }
  switch (res.status) {
    case "planned":
      console.log(apply ? "(nothing applied)" : "DRY-RUN — re-run with --apply to execute.");
      break;
    case "applied":
      console.log("✓ trimmed.");
      break;
    default:
      die(res.reason);
  }
}

function reportTrimReport(res: TrimReportResult, nameOf: Map<string, string>): void {
  if (res.status === "refused") die(res.reason);
  console.log("── commish:trim report — survivors over cap ────────");
  if (res.survivors.length === 0) {
    console.log("  (none — every survivor is within the cap)");
  }
  for (const s of res.survivors) {
    console.log(`  ${nameOf.get(s.managerId) ?? s.managerId}: ${s.rosterCount}/${s.rosterCap}`);
  }
  console.log("────────────────────────────────────────────────────");
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
    case "trim":
      await trimCmd(rest);
      break;
    case "transition":
      await transitionCmd(rest);
      break;
    case "advance":
      await advanceCmd(rest);
      break;
    default:
      console.error(
        "Usage:\n" +
          "  commish roster --as <email> --team <label> --add <player> --reason <text> [--apply]\n" +
          "  commish lineup --as <email> --team <label> --period <label> --starters <csv> --reason <text> [--apply]\n" +
          "  commish trim --as <email> --team <label> (--drop <csv> | --keep <csv>) --reason <text> [--allow-locked-slot] [--apply]\n" +
          "  commish trim --as <email> --report\n" +
          "  commish transition --as <email> --field <n> --reason <text> [--apply]\n" +
          "  commish advance --as <email> --round <R32|R16|QF|SF|Final> --reason <text> [--break-tie <labels>] [--allow-incomplete] [--apply]",
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
