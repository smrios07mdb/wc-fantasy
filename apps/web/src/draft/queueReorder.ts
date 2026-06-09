/** Pure helper: remove item at `from`, insert at `to`. Returns a new array. */
export function reorderQueue(ids: string[], from: number, to: number): string[] {
  const next = [...ids];
  const [removed] = next.splice(from, 1);
  next.splice(to, 0, removed!);
  return next;
}
