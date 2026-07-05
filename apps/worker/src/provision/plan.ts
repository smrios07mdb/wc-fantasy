/**
 * PURE provisioning plan (Prompt 09 deploy/provisioning track, runbook A4–A5). Turns a commissioner's
 * config into the exact rows the idempotent runner upserts: the `league`, the `period` seeds (group
 * matchdays + knockout placeholders, §4), the `manager` rows (with `waiver_order_position` seeded by
 * REVERSE draft order, §4), and the `allowlist_email` set. No IO, no clock, no env — the runner
 * (cli.ts) applies this against the real DB. Defaults come from `LEAGUE_SEED_DEFAULTS` (single source).
 */
import {
  KNOCKOUT_ROUNDS,
  LEAGUE_SEED_DEFAULTS,
  looksLikeEmail,
  type PeriodKind,
} from "@app/shared";

export interface ProvisionLeague {
  name: string;
  timezone: string;
  draftPickSeconds: number;
  /** Default true; set false to start the draft with no clock (commissioner can also toggle mid-draft via the UI). */
  timerEnabled?: boolean;
  seasonYear?: number;
  resultFreezeHours?: number;
  faabBatchLocalTime?: string;
}
export interface ProvisionManager {
  email: string;
  displayName: string;
  isCommissioner?: boolean;
  draftSlot: number;
}
export interface ProvisionKnockout {
  label: string;
  cutCount?: number | null;
}
export interface ProvisionConfig {
  league: ProvisionLeague;
  groupMatchdays: string[];
  knockoutRounds: ProvisionKnockout[];
  managers: ProvisionManager[];
  extraAllowlist?: string[];
}

export interface PlannedLeague {
  name: string;
  timezone: string;
  draftPickSeconds: number;
  seasonYear: number;
  resultFreezeHours: number;
  faabBatchLocalTime: string;
  status: "draft";
}
export interface PlannedPeriod {
  kind: PeriodKind;
  label: string;
  cutCount: number | null;
}
export interface PlannedManager {
  email: string;
  displayName: string;
  isCommissioner: boolean;
  draftSlot: number;
  faabBudget: number;
  waiverOrderPosition: number;
}
export interface ProvisionPlan {
  league: PlannedLeague;
  periods: PlannedPeriod[];
  managers: PlannedManager[];
  allowlist: string[];
}

/** Canonical email key: trim + lowercase (mirrors @app/auth's normalizeEmail; inlined to avoid a dep). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Validate a config; returns a list of human-readable errors (empty = valid). The runner aborts if any. */
export function validateConfig(config: ProvisionConfig): string[] {
  const errors: string[] = [];
  const { league, managers } = config;

  if (!league.name.trim()) errors.push("league.name must not be empty");
  if (!league.timezone.trim()) errors.push("league.timezone must not be empty");
  if (!Number.isInteger(league.draftPickSeconds) || league.draftPickSeconds <= 0) {
    errors.push("league.draftPickSeconds must be a positive integer");
  }

  if (managers.length === 0) {
    errors.push("at least one manager is required");
  }
  if (managers.length > 0 && !managers.some((m) => m.isCommissioner)) {
    errors.push("at least one manager must be the commissioner (isCommissioner: true)");
  }

  // Draft slots must be exactly 1..N (contiguous + unique — the snake engine reads slots 1..N).
  const slots = managers.map((m) => m.draftSlot);
  const uniqueSlots = new Set(slots);
  if (uniqueSlots.size !== slots.length) {
    errors.push("draft slots must be unique (a slot is duplicated)");
  }
  const expected = managers.map((_, i) => i + 1);
  if ([...uniqueSlots].sort((a, b) => a - b).join(",") !== expected.join(",")) {
    errors.push(`draft slots must be exactly 1..${managers.length} (contiguous)`);
  }

  // Emails unique case-insensitively + non-empty display names.
  const emails = managers.map((m) => normalizeEmail(m.email));
  if (new Set(emails).size !== emails.length) {
    errors.push("manager emails must be unique (case-insensitive)");
  }
  for (const m of managers) {
    if (!m.email.includes("@")) errors.push(`manager email looks invalid: ${m.email}`);
    if (!m.displayName.trim()) errors.push(`manager ${m.email} has an empty displayName`);
    // Reject an email-SHAPED displayName — this config is the sole creator of manager rows, and
    // an email here persists PII into a display-only column (T15-14R §3b). A name that merely
    // CONTAINS "@" stays legal; only a full-string address is rejected.
    else if (looksLikeEmail(m.displayName)) {
      errors.push(
        `manager ${m.email} has an email-shaped displayName (${m.displayName.trim()}) — use a real name or "Manager ${m.draftSlot}"`,
      );
    }
  }

  // Period labels distinct across group + knockout.
  const labels = [...config.groupMatchdays, ...config.knockoutRounds.map((k) => k.label)];
  if (new Set(labels).size !== labels.length) {
    errors.push("period labels (matchdays + knockout rounds) must be unique");
  }

  // Knockout labels must be EXACTLY the 5 canonical WC rounds (@app/shared KNOCKOUT_ROUNDS). The
  // group→playoff transition writes the derived cut_counts by upserting on these labels, so any drift
  // here would silently CREATE parallel knockout periods instead of updating the provisioned ones —
  // fail loud at provision time rather than misfire at the (irreversible) transition.
  const knockoutLabels = config.knockoutRounds.map((k) => k.label);
  const canonical = new Set<string>(KNOCKOUT_ROUNDS);
  const distinctKnockout = new Set(knockoutLabels);
  if (
    distinctKnockout.size !== KNOCKOUT_ROUNDS.length ||
    [...distinctKnockout].some((l) => !canonical.has(l))
  ) {
    errors.push(
      `knockout round labels must be exactly the ${KNOCKOUT_ROUNDS.length} WC rounds ${[...KNOCKOUT_ROUNDS].join(", ")} (got: ${knockoutLabels.join(", ") || "none"})`,
    );
  }

  return errors;
}

/** Map each manager's draft slot → its `waiver_order_position`, seeded by REVERSE draft order (§4):
 *  the LAST drafter (highest slot) gets waiver priority 1. */
export function buildWaiverOrder(
  managers: readonly { draftSlot: number }[],
): Record<number, number> {
  const n = managers.length;
  const order: Record<number, number> = {};
  for (const m of managers) order[m.draftSlot] = n - m.draftSlot + 1;
  return order;
}

/** Build the full upsert plan from a validated config. */
export function buildProvisionPlan(config: ProvisionConfig): ProvisionPlan {
  const league: PlannedLeague = {
    name: config.league.name.trim(),
    timezone: config.league.timezone.trim(),
    draftPickSeconds: config.league.draftPickSeconds,
    seasonYear: config.league.seasonYear ?? LEAGUE_SEED_DEFAULTS.seasonYear,
    resultFreezeHours: config.league.resultFreezeHours ?? LEAGUE_SEED_DEFAULTS.resultFreezeHours,
    faabBatchLocalTime: config.league.faabBatchLocalTime ?? LEAGUE_SEED_DEFAULTS.faabBatchLocalTime,
    status: "draft",
  };

  const periods: PlannedPeriod[] = [
    ...config.groupMatchdays.map((label) => ({ kind: "group_md" as const, label, cutCount: null })),
    ...config.knockoutRounds.map((k) => ({
      kind: "knockout_round" as const,
      label: k.label,
      cutCount: k.cutCount ?? null,
    })),
  ];

  const sorted = [...config.managers].sort((a, b) => a.draftSlot - b.draftSlot);
  const waiver = buildWaiverOrder(sorted);
  const managers: PlannedManager[] = sorted.map((m) => ({
    email: normalizeEmail(m.email),
    displayName: m.displayName.trim(),
    isCommissioner: Boolean(m.isCommissioner),
    draftSlot: m.draftSlot,
    faabBudget: LEAGUE_SEED_DEFAULTS.faabBudget,
    waiverOrderPosition: waiver[m.draftSlot]!,
  }));

  const allowlist = [
    ...new Set([
      ...managers.map((m) => m.email),
      ...(config.extraAllowlist ?? []).map(normalizeEmail),
    ]),
  ].sort();

  return { league, periods, managers, allowlist };
}

/** Build the `default_rank` updates from a best-first ordered list of player keys (1-based ranks). */
export function buildDefaultRankUpdates<T>(
  orderedKeys: readonly T[],
): { key: T; defaultRank: number }[] {
  return orderedKeys.map((key, i) => ({ key, defaultRank: i + 1 }));
}
