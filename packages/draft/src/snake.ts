/**
 * Snake (serpentine) draft order — PURE. Given the 1-based global pick number and the managers in
 * their seeded slot order (`manager.draft_slot` ascending, 1..N), return whose turn it is. Round 1
 * runs forward through the slots; every subsequent round reverses, so the manager who picks last in
 * one round picks first in the next (DECISIONS.md → Theme C: "snake"). No clock / IO / env.
 */
export function managerForPick(pickNo: number, orderedManagerIds: readonly string[]): string {
  const n = orderedManagerIds.length;
  if (n === 0) throw new RangeError("managerForPick: no managers in the draft order");
  if (!Number.isInteger(pickNo) || pickNo < 1) {
    throw new RangeError(`managerForPick: pickNo must be a positive integer, got ${pickNo}`);
  }

  const round = Math.floor((pickNo - 1) / n); // 0-based round
  const indexInRound = (pickNo - 1) % n;
  // Even rounds (0, 2, …) read slots forward; odd rounds read them reversed — the snake turn.
  const slot = round % 2 === 0 ? indexInRound : n - 1 - indexInRound;

  const managerId = orderedManagerIds[slot];
  if (managerId === undefined) {
    // Unreachable (0 <= slot < n), but noUncheckedIndexedAccess requires the guard.
    throw new RangeError(`managerForPick: computed slot ${slot} out of range`);
  }
  return managerId;
}
