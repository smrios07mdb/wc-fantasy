/**
 * Shared `round_advance` / `auto_advance` COMMISH-AUDIT row builder (feat/autofire-round-cut FIX 2).
 *
 * The durable audit for an APPLIED playoff round cut was, on the web surface, built by
 * `apps/web/src/commish/handleAdvance.buildAdvanceAudit` (the summary/detail/target_ref) → `recordCommishAudit`
 * (the field mapping) → a tx-bound `commish_audit.create` inside the store's `applyRoundCut` transaction. The
 * worker auto-fire needs the SAME durable row (same tx as the cut+release), but those web helpers live in
 * `apps/web/src/` and are NOT worker-importable. So this is the MINIMAL extraction to a SHARED spot: the exact
 * same row shape, parameterized on `actionType` + `actorUserId` so the worker writes a NULL-actor `auto_advance`
 * row and the web (unchanged) writes an actor'd `round_advance` row.
 *
 * BYTE-IDENTICAL to the web path (pinned by advanceAudit.test.ts): the summary/detail/delta strings and the
 * target_ref shape match `buildAdvanceAudit` + `recordCommishAudit` exactly. The web copies are left UNTOUCHED
 * (fence); de-duplicating them onto this shared builder is a follow-up, out of scope for this thread.
 *
 * Lives behind the `@app/commish-core/advanceAudit` subpath (like `./advanceStore`) so the package's `.` root
 * stays free of the `@app/db` import graph.
 */
import { type Prisma } from "@app/db";
import type { CommishActionType } from "@app/shared";

export interface AdvanceAuditParams {
  leagueId: string;
  /** The acting AppUser id; NULL for the system/automated `auto_advance` row (the nullable-by-design case). */
  actorUserId: string | null;
  /** `round_advance` (operator) or `auto_advance` (unattended) — the only two this builder emits. */
  actionType: Extract<CommishActionType, "round_advance" | "auto_advance">;
  roundLabel: string;
  eliminated: readonly string[];
  champion: string | null;
  /** managerId → released playerId[] (the roster shed to the wire) — recorded in target_ref. */
  released: Readonly<Record<string, string[]>>;
  reason: string;
  /** True when a boundary tie was adjudicated (always false for auto-fire, which never cuts a tie). */
  tieAdjudicated: boolean;
  nameOf: Readonly<Record<string, string>>;
}

/**
 * Build the `commish_audit` row for an applied cut — the SAME field mapping the web path produces (via
 * `buildAdvanceAudit` → `recordCommishAudit`). Pure; no IO. `target_ref` is omitted-when-null the same way
 * (Prisma's `Json?` rejects a JS `null`; here it is always present, but the shape mirrors the web helper).
 */
export function buildAdvanceAuditRow(
  p: AdvanceAuditParams,
): Prisma.CommishAuditUncheckedCreateInput {
  const name = (id: string): string => p.nameOf[id] ?? id;
  const names = p.eliminated.map(name);
  const champion = p.champion ? name(p.champion) : null;
  const releasedCount = Object.values(p.released).reduce((n, ids) => n + ids.length, 0);
  return {
    leagueId: p.leagueId,
    actorUserId: p.actorUserId,
    actionType: p.actionType,
    summary: `Round cut applied: ${p.roundLabel} — eliminated ${names.length} (${names.join(", ")}), released ${releasedCount} to the wire`,
    detail:
      `Irreversible — playoff_entry flipped alive → eliminated for ${names.join(", ")}.` +
      ` ${releasedCount} roster player${releasedCount === 1 ? "" : "s"} released to the free-agent wire.` +
      (champion ? ` ${champion} is the champion.` : "") +
      (p.tieAdjudicated ? " Boundary tie adjudicated by the commissioner." : ""),
    reason: p.reason,
    delta: `−${names.length} alive, −${releasedCount} owned`,
    reversible: false,
    targetRef: {
      roundLabel: p.roundLabel,
      eliminated: [...p.eliminated],
      champion: p.champion,
      released: p.released,
      releasedCount,
    } as unknown as Prisma.InputJsonValue,
  };
}

/**
 * Insert the advance audit row through a transaction client and return its id. Call it INSIDE the
 * cut+release `$transaction` so the audit row and the effect commit ATOMICALLY — a rolled-back cut takes its
 * audit row with it, and a committed cut never lacks its ledger row (the web freeze-store atomicity precedent).
 */
export async function recordAdvanceAuditTx(
  tx: Prisma.TransactionClient,
  p: AdvanceAuditParams,
): Promise<{ id: string }> {
  return tx.commishAudit.create({ data: buildAdvanceAuditRow(p), select: { id: true } });
}
