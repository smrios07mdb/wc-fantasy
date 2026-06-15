/**
 * PURE core for the commissioner-override CLI ({@link ./cli}). No Prisma, no clock, no process — every
 * input is injected, so the resolver / gate / kickoff-guard / idempotency / audit logic is exhaustively
 * unit-testable and shared by both sub-commands.
 *
 * The override tool exists to repair "our-fault" roster/lineup moves that the app's (previously missing)
 * free-agency UI blocked. It deliberately BYPASSES the acquisition/lineup WINDOW + lock, but it never
 * bypasses correctness: the engine invariants (active-ownership unique, roster cap, valid-drop, formation
 * legality) are kept by reusing `@app/faab` / `@app/lineup` validation, and these guards stay in front:
 * the commissioner gate, a required reason, the per-player kickoff integrity guard, and a structured
 * audit line per applied action.
 */

/** The league commissioner's email (also flagged `manager.is_commissioner`); the gate's hard fallback. */
export const COMMISSIONER_EMAIL = "smrios07@gmail.com";

/** The acting identity may run the override iff it is the commissioner — by the `is_commissioner` flag
 *  OR the known commissioner email (case-insensitive). Mirrors `canActAsManager({scope:"admin"})`. */
export function isCommissionerActor(actor: {
  email: string | null;
  isCommissioner: boolean;
}): boolean {
  if (actor.isCommissioner) return true;
  return (actor.email ?? "").trim().toLowerCase() === COMMISSIONER_EMAIL;
}

// ── name → id resolution (ambiguity is an ERROR, never a silent guess) ──────────────

export type Resolution<T> =
  | { kind: "ok"; value: T }
  | { kind: "none" }
  | { kind: "ambiguous"; candidates: T[] };

/** 0 matches → none; 1 → ok; >1 → ambiguous (the caller prints the candidates and aborts). */
export function resolveUnique<T>(matches: readonly T[]): Resolution<T> {
  if (matches.length === 0) return { kind: "none" };
  if (matches.length === 1) return { kind: "ok", value: matches[0]! };
  return { kind: "ambiguous", candidates: [...matches] };
}

const norm = (s: string) => s.trim().toLowerCase();

export interface NamedPlayer {
  id: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
}

/** Match precedence: an EXACT name (displayName or "first last") wins outright; only when there is no
 *  exact hit do we fall back to substring matches across the name fields (which may be ambiguous). */
export function matchPlayers(players: readonly NamedPlayer[], query: string): NamedPlayer[] {
  const q = norm(query);
  if (!q) return [];
  const full = (p: NamedPlayer) => norm(`${p.firstName ?? ""} ${p.lastName ?? ""}`);
  const exact = players.filter((p) => norm(p.displayName) === q || full(p) === q);
  if (exact.length > 0) return exact;
  return players.filter(
    (p) =>
      norm(p.displayName).includes(q) ||
      norm(p.firstName ?? "").includes(q) ||
      norm(p.lastName ?? "").includes(q),
  );
}

export function resolvePlayer(
  players: readonly NamedPlayer[],
  query: string,
): Resolution<NamedPlayer> {
  return resolveUnique(matchPlayers(players, query));
}

export interface NamedTeam {
  managerId: string;
  displayName: string;
}

/** Team label = `manager.display_name` (case-insensitively unique per league); exact first, else partial. */
export function matchTeams(teams: readonly NamedTeam[], label: string): NamedTeam[] {
  const q = norm(label);
  if (!q) return [];
  const exact = teams.filter((t) => norm(t.displayName) === q);
  if (exact.length > 0) return exact;
  return teams.filter((t) => norm(t.displayName).includes(q));
}

export function resolveTeam(teams: readonly NamedTeam[], label: string): Resolution<NamedTeam> {
  return resolveUnique(matchTeams(teams, label));
}

// ── per-player kickoff integrity guard ─────────────────────────────────────────────

/** The add target's match has kicked off ⇒ points are (becoming) known ⇒ a retroactive move is an
 *  integrity hazard. Default-block; honor the move only with an explicit `--allow-post-kickoff`. */
export function kickoffGuard(args: {
  addMatchKickoffAt: Date | null;
  now: Date;
  allowPostKickoff: boolean;
}): { alreadyPlayed: boolean; blocked: boolean } {
  const alreadyPlayed =
    args.addMatchKickoffAt !== null && args.addMatchKickoffAt.getTime() <= args.now.getTime();
  return { alreadyPlayed, blocked: alreadyPlayed && !args.allowPostKickoff };
}

// ── idempotency (skip if the end state already holds) ───────────────────────────────

/** The roster move is already in place: the add is actively owned and the drop (if any) is already gone. */
export function rosterEndStateHolds(args: {
  ownedByManager: ReadonlySet<string>;
  addId: string;
  dropId: string | null;
}): boolean {
  const addHeld = args.ownedByManager.has(args.addId);
  const dropGone = args.dropId === null || !args.ownedByManager.has(args.dropId);
  return addHeld && dropGone;
}

/** The lineup is already set: the same set of starters (order-independent). */
export function lineupEndStateHolds(args: {
  currentStarterIds: readonly string[];
  desiredStarterIds: readonly string[];
}): boolean {
  if (args.currentStarterIds.length !== args.desiredStarterIds.length) return false;
  const cur = new Set(args.currentStarterIds);
  return args.desiredStarterIds.every((id) => cur.has(id));
}

// ── window-lock bypass (the ONLY thing relaxed for the lineup override) ──────────────

/** Neutralize ONLY the edit-window lock so `validateLineup` skips its phase-1 window check while keeping
 *  ownership / XI-size / lock-on-play / formation bounds. Everything else about the period is preserved. */
export function relaxPeriodLock<T extends { status: string; closesAt: Date | null }>(period: T): T {
  // `status: "open"` + `closesAt: null` make `validateLineup`'s phase-1 window check a no-op; the cast
  // keeps the caller's period type (the runtime override is the deliberate, commissioner-only bypass).
  return { ...period, status: "open", closesAt: null } as T;
}

// ── structured audit (stdout, not a table — the STOP-SEAM "no migration" rule) ──────

export interface AuditRecord {
  command: "roster" | "lineup" | "trim";
  commissioner: string;
  team: string;
  managerId: string;
  action: string;
  add?: string | null;
  drop?: string | null;
  /** The commissioner `--period` pin recorded for the integrity trail (roster), or null when unpinned. */
  period?: string | null;
  starters?: readonly string[];
  /** The players released this run (commish:trim) — the integrity trail for the drop-only force-trim. */
  released?: readonly string[];
  reason: string;
  kickoffBypassed: boolean;
  /** The commissioner `--allow-locked-slot` carve-out recorded for the integrity trail (lineup / trim). */
  lockOverride?: boolean;
  timestamp: string;
}

/** One machine-parseable line per applied action (greppable prefix + a JSON payload). */
export function formatAudit(r: AuditRecord): string {
  return `commish-override ${JSON.stringify(r)}`;
}
