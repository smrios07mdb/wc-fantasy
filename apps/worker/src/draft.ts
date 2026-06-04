/**
 * Worker seam for the draft controller (ARCHITECTURE.md §5; DECISIONS.md → Theme C). For each ACTIVE
 * draft, run one tick so an expired `pick_deadline_at` fires an autopick (queue → best-available).
 * `now` is injected by the scheduler (one Date per tick); no Realtime is wired here. The manual-pick
 * op (`submitPick`) is driven by the deferred auth/UI prompt, not by this timer hook.
 */
import { prisma } from "@app/db";
import { tickDraft, type TickResult } from "@app/draft";
import { createPrismaDraftStore } from "@app/draft/prisma";

const store = createPrismaDraftStore(prisma);

/** Tick every active draft once against the live database; returns each result (for logging). */
export async function tickActiveDrafts(now: Date): Promise<TickResult[]> {
  const draftIds = await store.listActiveDraftIds();
  const results: TickResult[] = [];
  for (const draftId of draftIds) {
    results.push(await tickDraft(store, draftId, now));
  }
  return results;
}
