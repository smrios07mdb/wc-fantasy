/**
 * `recordCommishAudit` — the WRITE side of the `commish_audit` governance ledger, and the shared seam every
 * later commissioner write slice calls. It inserts ONE audit row through the Prisma owner client (which
 * bypasses RLS as the table owner — `commish_audit` has NO client INSERT policy, so this is the only write
 * path). Later slices call it INSIDE their mutation transaction, so the audit row and the effect it records
 * commit atomically.
 *
 * THREAD 1 WIRES ZERO CALLERS. The table ships empty. This helper exists so the write slices in Threads 2–5
 * import a single, tested writer instead of hand-rolling the insert. The insert itself is injected (defaults
 * to the owner client) so the field mapping is unit-testable without a database — mirroring the injected-store
 * pattern used by the route handlers (handleStartDraft, handleWatchlist).
 */
import { prisma, type Prisma } from "@app/db";
import type { CommishActionType, CommishAuditTargetRef } from "@app/shared";

export interface RecordCommishAuditInput {
  leagueId: string;
  /** The AppUser who took the action; null is allowed for a future 'system'/automated row. */
  actorUserId: string | null;
  actionType: CommishActionType;
  summary: string;
  detail?: string | null;
  reason?: string | null;
  /** Structured pointer to the affected entity; omitted from the row when null/undefined (column stays NULL). */
  targetRef?: CommishAuditTargetRef | null;
  /** Human-readable delta, e.g. "+5 pts". */
  delta?: string | null;
  /** Whether a later slice can undo this action (default false). */
  reversible?: boolean;
}

/** The injected insert seam — defaults to the Prisma owner client; overridden in tests with a spy. */
export type CommishAuditInsert = (
  data: Prisma.CommishAuditUncheckedCreateInput,
) => Promise<{ id: string }>;

const defaultInsert: CommishAuditInsert = (data) =>
  prisma.commishAudit.create({ data, select: { id: true } });

/**
 * Insert one commissioner audit row and return its id. Server-only (owner-bypass). No caller is wired in
 * Thread 1 — see the module doc.
 */
export async function recordCommishAudit(
  input: RecordCommishAuditInput,
  insert: CommishAuditInsert = defaultInsert,
): Promise<{ id: string }> {
  const data: Prisma.CommishAuditUncheckedCreateInput = {
    leagueId: input.leagueId,
    actorUserId: input.actorUserId,
    actionType: input.actionType,
    summary: input.summary,
    detail: input.detail ?? null,
    reason: input.reason ?? null,
    delta: input.delta ?? null,
    reversible: input.reversible ?? false,
    // Prisma's Json? column rejects a JS `null`; OMIT the field when absent so the column stays SQL NULL.
    ...(input.targetRef != null
      ? { targetRef: input.targetRef as unknown as Prisma.InputJsonValue }
      : {}),
  };
  return insert(data);
}
