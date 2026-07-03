/**
 * Thread 6 (Item 3): the ONE orchestrator refusal reason worth rephrasing for the console's blocked
 * banner — `packages/commish-core/src/advance.ts`'s "not frozen" front-guard reads naturally on the
 * CLI (`--allow-incomplete` is a real flag there) but the web surface hardcodes `allowIncomplete: false`
 * (see `handleAdvance.ts`'s module doc — the CLI override never rides the web surface), so pointing the
 * commissioner at a flag they can't pass is a dead end. This maps ONLY that one reason to the actionable
 * web-surface instruction; every other orchestrator reason renders verbatim. The orchestrator string
 * itself stays byte-verbatim — this is a display-layer rewrite, not a change to `advance.ts`.
 *
 * No "Blocked:" prefix here — the console's banner JSX already renders `<b>Blocked:</b> {reason}`.
 */
const NOT_FROZEN_PATTERN =
  /^round (.+) is not frozen — wait for the result freeze, or pass --allow-incomplete$/;

export function mapAdvanceRefusal(reason: string): string {
  const match = reason.match(NOT_FROZEN_PATTERN);
  if (!match) return reason;
  return `round ${match[1]} is not frozen — freeze the round in Game operations first.`;
}
