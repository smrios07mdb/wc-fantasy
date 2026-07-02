/**
 * Commissioner force-trim (`commish:trim`) — the playoff trim-down backstop. When a survivor cannot (or
 * will not) trim 15 → ≤9 themselves, the commissioner cuts them down. It reuses the SAME `@app/faab`
 * release primitive the manager route uses (`validateRelease` + `releaseRoster`), so every correctness
 * rule is kept: ownership, the 7-starter floor, the squad cap, and lock-on-play. The only relaxations are
 * deliberate + flag-gated:
 *   • `--allow-locked-slot` → `allowLocked`: release a played player's locked slot (under the GUC);
 *   • the unfillable 7–{cap} confirm is auto-confirmed on `--apply` (the dry-run already surfaced it).
 *
 * In front stay the override guards: the commissioner gate, a required reason, dry-run-by-default, and a
 * structured audit line. NEVER auto-cuts — the cut choice (`--drop`/`--keep`) is the operator's. Injected
 * deps → testable against `MemoryFaabReleaseStore`. The report mode lists survivors still over cap.
 */
import { validateRelease, type FaabReleaseStore, type OverCapSurvivor } from "@app/faab";
import { formatAudit, isCommissionerActor } from "./core";

export interface TrimDeps {
  now: Date;
  /** The release store ports — the override calls the SAME `releaseRoster` the route uses. */
  store: Pick<
    FaabReleaseStore,
    "loadReleaseContext" | "releaseRoster" | "listOverCapPlayoffSurvivors"
  >;
  log: (line: string) => void;
}

/** The cut selection: either the players to DROP, or the players to KEEP (drop = roster − keep). */
export type TrimSelection =
  | { kind: "drop"; ids: readonly string[] }
  | { kind: "keep"; ids: readonly string[] };

export interface TrimInput {
  actor: { email: string | null; isCommissioner: boolean };
  managerId: string;
  teamLabel: string;
  selection: TrimSelection;
  /** Display labels (id → name) for the plan + audit; falls back to the id when unknown. */
  nameOf: Readonly<Record<string, string>>;
  reason: string;
  apply: boolean;
  /** `--allow-locked-slot`: relax lock-on-play so a played player can be force-released (under the GUC). */
  allowLocked: boolean;
  timestamp: string;
}

export interface TrimPlan {
  team: string;
  managerId: string;
  rosterCap: number;
  /** Current squad size and the size after the planned cut. */
  before: number;
  after: number;
  /** The ids that will be dropped, with display labels. */
  dropIds: string[];
  dropNames: string[];
  /** True iff the post-cut 7–{cap} squad cannot field a legal XI (a loud warning; the cut still applies). */
  unfillable: boolean;
}

export type TrimResult =
  | { status: "refused"; reason: string; plan?: TrimPlan }
  | { status: "not-found"; reason: string }
  | { status: "planned"; plan: TrimPlan }
  | { status: "applied"; plan: TrimPlan; audit: string };

export async function runTrimOverride(deps: TrimDeps, input: TrimInput): Promise<TrimResult> {
  if (!isCommissionerActor(input.actor)) {
    return { status: "refused", reason: "not the commissioner — trim refused" };
  }
  if (!input.reason.trim()) {
    return { status: "refused", reason: "a --reason is required for any override" };
  }

  const ctx = await deps.store.loadReleaseContext(input.managerId);
  if (!ctx) return { status: "not-found", reason: `unknown manager ${input.managerId}` };
  if (!ctx.isPlayoffPhase) {
    return { status: "refused", reason: "trim is only available in the playoff phase" };
  }

  const rosterIds = ctx.roster.map((p) => p.playerId);
  const dropIds =
    input.selection.kind === "drop"
      ? [...input.selection.ids]
      : rosterIds.filter((id) => !new Set(input.selection.ids).has(id));

  const label = (id: string) => input.nameOf[id] ?? id;
  const plan: TrimPlan = {
    team: input.teamLabel,
    managerId: input.managerId,
    rosterCap: ctx.rosterCap,
    before: ctx.roster.length,
    after: ctx.roster.length - new Set(dropIds).size,
    dropIds,
    dropNames: dropIds.map(label),
    unfillable: false,
  };

  // Authoritative legality (auto-confirm the unfillable warning — the operator's --apply IS the confirm).
  // Hard rejections (not-owned / locked-without-the-flag / below the 7-floor) still refuse.
  const hard = validateRelease({
    roster: ctx.roster,
    dropIds,
    lockedPlayerIds: ctx.lockedPlayerIds,
    rosterCap: ctx.rosterCap,
    allowLocked: input.allowLocked,
    confirmedUnfillable: true,
  });
  if (hard) return { status: "refused", reason: `${hard.code}: ${hard.message}`, plan };

  // Surface the unfillable 7–{cap} warning in the plan (re-run WITHOUT the auto-confirm).
  const soft = validateRelease({
    roster: ctx.roster,
    dropIds,
    lockedPlayerIds: ctx.lockedPlayerIds,
    rosterCap: ctx.rosterCap,
    allowLocked: input.allowLocked,
    confirmedUnfillable: false,
  });
  plan.unfillable = soft?.code === "release-unfillable";

  if (!input.apply) return { status: "planned", plan };

  await deps.store.releaseRoster(input.managerId, dropIds, {
    now: deps.now,
    periodId: ctx.currentPeriodId,
    allowLocked: input.allowLocked,
  });

  const audit = formatAudit({
    command: "trim",
    commissioner: input.actor.email ?? "(is_commissioner flag)",
    team: input.teamLabel,
    managerId: input.managerId,
    action: `release-${dropIds.length}`,
    released: plan.dropNames,
    reason: input.reason,
    kickoffBypassed: false,
    lockOverride: input.allowLocked,
    timestamp: input.timestamp,
  });
  deps.log(audit);
  return { status: "applied", plan, audit };
}

// ── report mode (no target): survivors still over cap ──────────────────────────────

export type TrimReportResult =
  | { status: "refused"; reason: string }
  | { status: "report"; survivors: OverCapSurvivor[] };

export async function runTrimReport(
  deps: Pick<TrimDeps, "store">,
  input: { actor: { email: string | null; isCommissioner: boolean }; leagueId: string },
): Promise<TrimReportResult> {
  if (!isCommissionerActor(input.actor)) {
    return { status: "refused", reason: "not the commissioner — report refused" };
  }
  const survivors = await deps.store.listOverCapPlayoffSurvivors(input.leagueId);
  return { status: "report", survivors };
}
