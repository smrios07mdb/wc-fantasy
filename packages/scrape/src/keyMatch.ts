/**
 * PURE population proposers for the one-time verified Sofascore-id pass. PROPOSES mappings; the CLI
 * writes only the unambiguous proposals and emits `flagged` for manual `sofascore_player_id` entry.
 * NEVER auto-trusts an ambiguous hit — a wrong stored id would later feed a wrong PRIMARY rating.
 * TODO(confirm): that Sofascore's team codes + dates line up with the feed's, on real data.
 */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining accents
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

export interface FeedMatchKey {
  fifaMatchId: string;
  dateIso: string;
  homeCode: string;
  awayCode: string;
}
export interface SofaMatchKey {
  sofascoreMatchId: number;
  dateIso: string;
  homeCode: string;
  awayCode: string;
}
export interface MatchProposal {
  fifaMatchId: string;
  sofascoreMatchId: number;
}
export interface MatchMappingResult {
  proposals: MatchProposal[];
  flagged: FeedMatchKey[];
}

const sameMatch = (f: FeedMatchKey, s: SofaMatchKey): boolean =>
  f.dateIso === s.dateIso && f.homeCode === s.homeCode && f.awayCode === s.awayCode;

export function proposeMatchMappings(
  feed: readonly FeedMatchKey[],
  sofa: readonly SofaMatchKey[],
): MatchMappingResult {
  const proposals: MatchProposal[] = [];
  const flagged: FeedMatchKey[] = [];
  for (const f of feed) {
    const hits = sofa.filter((s) => sameMatch(f, s));
    if (hits.length === 1) {
      proposals.push({ fifaMatchId: f.fifaMatchId, sofascoreMatchId: hits[0]!.sofascoreMatchId });
    } else {
      flagged.push(f); // 0 (no candidate) or 2+ (ambiguous) → never auto-trust
    }
  }
  return { proposals, flagged };
}

export interface FeedPlayerKey {
  playerId: string;
  teamCode: string;
  name: string;
}
export interface SofaPlayerKey {
  sofascorePlayerId: number;
  teamCode: string;
  name: string;
}
export interface PlayerProposal {
  playerId: string;
  sofascorePlayerId: number;
}
export interface PlayerMappingResult {
  proposals: PlayerProposal[];
  flagged: FeedPlayerKey[];
}

export function proposePlayerMappings(
  feed: readonly FeedPlayerKey[],
  sofa: readonly SofaPlayerKey[],
): PlayerMappingResult {
  const proposals: PlayerProposal[] = [];
  const flagged: FeedPlayerKey[] = [];
  for (const f of feed) {
    const target = normalizeName(f.name);
    const hits = sofa.filter((s) => s.teamCode === f.teamCode && normalizeName(s.name) === target);
    if (hits.length === 1) {
      proposals.push({ playerId: f.playerId, sofascorePlayerId: hits[0]!.sofascorePlayerId });
    } else {
      flagged.push(f); // no exact hit, or same-surname/dup → manual entry
    }
  }
  return { proposals, flagged };
}
