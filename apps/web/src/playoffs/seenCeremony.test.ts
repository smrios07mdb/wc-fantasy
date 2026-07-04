// @vitest-environment jsdom
/**
 * Unit spec for the shared per-device "seen cut ceremonies" latch (feat/cut-ceremony-first-open).
 *
 * Covers the pure decision (unseen diff, most-recent selection, record-all-on-fresh, seed-silent) and
 * the storage helpers (exact key scheme — pinned so the Playwright render proof's hardcoded scheme
 * can't drift; round-trip; graceful degradation when localStorage throws).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  decideCeremonyLatch,
  hasSeenCut,
  recordCutSeen,
  seenCutKey,
  type CutRoundRef,
} from "./seenCeremony";

const R = (roundLabel: string, roundIdx: number): CutRoundRef => ({ roundLabel, roundIdx });
/** A `isSeen` predicate over an explicit set of already-witnessed labels. */
const seenSet = (...labels: string[]) => {
  const s = new Set(labels);
  return (label: string) => s.has(label);
};

// jsdom's built-in localStorage is awkward to spy on (methods live on Storage.prototype and restore
// unreliably), so install a fully-controllable in-memory stand-in and restore the real one after.
const realLocalStorage = Object.getOwnPropertyDescriptor(window, "localStorage");
function installStorage(store: Pick<Storage, "getItem" | "setItem">): void {
  Object.defineProperty(window, "localStorage", { value: store, configurable: true });
}
function memStorage(): Storage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

beforeEach(() => installStorage(memStorage()));
afterEach(() => {
  if (realLocalStorage) Object.defineProperty(window, "localStorage", realLocalStorage);
});

describe("seenCutKey — the pinned key scheme (Playwright harness mirrors this string)", () => {
  it("is xi:seenCut:<leagueId>:<roundLabel>", () => {
    expect(seenCutKey("lg1", "R32")).toBe("xi:seenCut:lg1:R32");
    expect(seenCutKey("league-abc", "Final")).toBe("xi:seenCut:league-abc:Final");
  });
  it("is league-scoped AND per-round (distinct leagues / rounds never collide)", () => {
    expect(seenCutKey("lgA", "R16")).not.toBe(seenCutKey("lgB", "R16"));
    expect(seenCutKey("lg1", "R16")).not.toBe(seenCutKey("lg1", "QF"));
  });
});

describe("hasSeenCut / recordCutSeen — storage round-trip + graceful degradation", () => {
  it("round-trips: unseen before record, seen after", () => {
    expect(hasSeenCut("lg1", "R32")).toBe(false);
    recordCutSeen("lg1", "R32");
    expect(hasSeenCut("lg1", "R32")).toBe(true);
    // Scoping holds: a different round / league is still unseen.
    expect(hasSeenCut("lg1", "R16")).toBe(false);
    expect(hasSeenCut("lg2", "R32")).toBe(false);
  });

  it("writes the EXACT pinned key (so both surfaces + the harness agree)", () => {
    recordCutSeen("lg1", "QF");
    expect(window.localStorage.getItem("xi:seenCut:lg1:QF")).toBe("1");
  });

  it("fails toward SEEN (no-spam) when getItem throws — a blocked store never replays a takeover", () => {
    installStorage({
      getItem: () => {
        throw new Error("SecurityError: storage disabled");
      },
      setItem: () => undefined,
    });
    expect(hasSeenCut("lg1", "R32")).toBe(true);
  });

  it("recordCutSeen swallows a throwing setItem (best-effort, never crashes the mount)", () => {
    installStorage({
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    });
    expect(() => recordCutSeen("lg1", "R32")).not.toThrow();
  });
});

describe("decideCeremonyLatch — the pure fire/record decision", () => {
  it("no past cuts → fires nothing, records nothing", () => {
    expect(decideCeremonyLatch([], seenSet())).toEqual({ fire: null, record: [] });
  });

  it("fresh device (all unseen) → fires the MOST-RECENT past cut, records ALL past", () => {
    const cuts = [R("R32", 0), R("R16", 1), R("QF", 2)]; // QF is the latest past round
    const d = decideCeremonyLatch(cuts, seenSet());
    expect(d.fire).toEqual(R("QF", 2));
    expect(d.record.sort()).toEqual(["QF", "R16", "R32"]);
  });

  it("selects most-recent by idx regardless of input order", () => {
    const cuts = [R("QF", 2), R("R32", 0), R("R16", 1)];
    expect(decideCeremonyLatch(cuts, seenSet()).fire).toEqual(R("QF", 2));
  });

  it("most-recent already seen → fires NOTHING (older cuts never replay), still records all", () => {
    const cuts = [R("R32", 0), R("R16", 1)];
    const d = decideCeremonyLatch(cuts, seenSet("R16")); // latest (R16) already witnessed
    expect(d.fire).toBeNull();
    expect(d.record.sort()).toEqual(["R16", "R32"]);
  });

  it("away-during-a-round case: older seen, a NEW latest lands → fires only the new latest", () => {
    // Watched R32 live (recorded). While away, R16 completed. On open the latest (R16) is unseen.
    const cuts = [R("R32", 0), R("R16", 1)];
    expect(decideCeremonyLatch(cuts, seenSet("R32")).fire).toEqual(R("R16", 1));
  });

  it("all seen → fires nothing (settled aftermath on every later open)", () => {
    const cuts = [R("R32", 0), R("R16", 1)];
    expect(decideCeremonyLatch(cuts, seenSet("R32", "R16")).fire).toBeNull();
  });

  it("seed-silent (cold start) → fires nothing but records all; default (fire-latest) still fires", () => {
    const cuts = [R("R32", 0), R("R16", 1)];
    const silent = decideCeremonyLatch(cuts, seenSet(), { seedSilent: true });
    expect(silent.fire).toBeNull();
    expect(silent.record.sort()).toEqual(["R16", "R32"]);
    // Default keeps firing the latest on a cold device.
    expect(decideCeremonyLatch(cuts, seenSet()).fire).toEqual(R("R16", 1));
  });

  it("seed-silent only silences a COLD device — a NEW latest cut after some are seen still fires", () => {
    const cuts = [R("R32", 0), R("R16", 1)];
    // R32 already seen (not cold) → seed-silent does NOT suppress the genuinely-new R16.
    expect(decideCeremonyLatch(cuts, seenSet("R32"), { seedSilent: true }).fire).toEqual(
      R("R16", 1),
    );
  });
});
