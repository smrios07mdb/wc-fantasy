/**
 * Worker draft-tick loop (ARCHITECTURE.md §5; DECISIONS.md → Theme C). The server-authoritative HALF
 * of the per-pick timer: while a draft is `active`, drive the UNCHANGED `tickDraft(draftId, now)` on a
 * SHORT interval so an expired `pick_deadline_at` autopicks (queue → best-available) and advances. The
 * DECISION stays entirely inside `@app/draft`; this file is thin IO — it injects the clock at the edge,
 * lists the active drafts, and ticks each. Idempotent by construction (a tick before the deadline, or
 * after a pick already filled the slot, is a no-op), and a completed draft simply drops out of
 * `listActiveDraftIds` so the loop stops acting on it.
 *
 * This runs on its OWN cadence (`WORKER_DRAFT_TICK_MS`, ~seconds), NOT the coarse ingestion tick (~60s):
 * a draft clock sampled once a minute would let the countdown sit visibly at 0 for up to a minute before
 * the autopick fired. The ingestion scheduler therefore no longer ticks the draft (see scheduler.ts).
 */
import { prisma } from "@app/db";
import { tickDraft, type DraftStore, type TickResult } from "@app/draft";
import { createPrismaDraftStore } from "@app/draft/prisma";

/** The production store (Prisma); tests inject the in-memory double instead. Lazily created. */
let defaultStore: DraftStore | null = null;
function prismaStore(): DraftStore {
  return (defaultStore ??= createPrismaDraftStore(prisma));
}

/**
 * Tick every active draft once against `store` (default: the live Prisma store); returns each healthy
 * result. Each draft is isolated in its own try/catch (mirroring the ingestion scheduler's per-match
 * guard) — `tickDraft` is NOT total (it throws `DraftNotFoundError` for a draft deleted mid-tick, and a
 * transient DB fault can surface from the store), and `listActiveDraftIds` spans all leagues, so ONE
 * failing draft must not starve the others. A per-draft failure is routed to `onError` and skipped.
 */
export async function tickActiveDrafts(
  now: Date,
  store: DraftStore = prismaStore(),
  onError?: (err: unknown, draftId: string) => void,
): Promise<TickResult[]> {
  const draftIds = await store.listActiveDraftIds();
  const results: TickResult[] = [];
  for (const draftId of draftIds) {
    try {
      results.push(await tickDraft(store, draftId, now));
    } catch (err) {
      // One draft's failure (deleted row, transient DB error) is logged and skipped — the loop
      // continues so every other active draft still gets its expired-pick autopick this tick.
      onError?.(err, draftId);
    }
  }
  return results;
}

export interface DraftTickerOptions {
  /** The draft store. Defaults to the live Prisma store; tests inject the memory double. */
  store?: DraftStore;
  /** Tick cadence in ms (short — seconds, not the ingestion minute). */
  intervalMs?: number;
  /** Injected clock — one `Date` per tick. Defaults to `() => new Date()`. */
  now?: () => Date;
  /** Per-tick observer (logging); receives every draft's result. */
  onTick?: (results: TickResult[]) => void;
  /** Per-tick error handler; a tick failure never aborts the loop. */
  onError?: (err: unknown) => void;
  /** Stop + exit after this many ticks (CI/smoke bound, mirroring the ingestion scheduler). */
  maxTicks?: number | null;
  /** Called once when the loop stops itself via `maxTicks`. */
  onStopped?: () => void;
}

export interface DraftTickerHandle {
  stop: () => void;
}

/**
 * Start the dedicated draft-tick loop. Returns a handle to stop it. Re-entrancy-guarded: a slow tick
 * never overlaps the next interval. Errors are isolated per tick (surfaced via `onError`, never thrown
 * out of the timer). `maxTicks` bounds the run for CI/smoke tests.
 */
export function startDraftTicker(opts: DraftTickerOptions = {}): DraftTickerHandle {
  const store = opts.store ?? prismaStore();
  const intervalMs = opts.intervalMs ?? 2000;
  const clock = opts.now ?? (() => new Date());
  const maxTicks = opts.maxTicks ?? null;

  let running = false;
  let stopped = false;
  let ticks = 0;

  async function tick(): Promise<void> {
    if (running) return; // a prior tick is still in flight — skip this interval
    running = true;
    try {
      // Per-draft failures are isolated inside tickActiveDrafts (routed to onError, loop continues);
      // this outer catch only guards the batch-level call (e.g. listActiveDraftIds itself throwing).
      const results = await tickActiveDrafts(clock(), store, (err) => opts.onError?.(err));
      opts.onTick?.(results);
    } catch (err) {
      opts.onError?.(err);
    } finally {
      running = false;
      ticks += 1;
      if (maxTicks !== null && ticks >= maxTicks && !stopped) {
        stopped = true;
        clearInterval(timer);
        opts.onStopped?.();
      }
    }
  }

  const timer: ReturnType<typeof setInterval> = setInterval(() => {
    void tick();
  }, intervalMs);

  return {
    stop: () => {
      if (!stopped) {
        stopped = true;
        clearInterval(timer);
      }
    },
  };
}
