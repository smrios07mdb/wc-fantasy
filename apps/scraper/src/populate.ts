/**
 * One-time VERIFIED population CLI (Prompt 05b piece 2): PROPOSE Sofascore ids via the pure keyMatch,
 * WRITE only the unambiguous proposals, and EMIT the flagged list for manual `sofascore_player_id`
 * entry. NEVER auto-trusts an ambiguous hit (a wrong stored id would later feed a wrong PRIMARY rating).
 * The operator UI for manual entry is a later prompt — TODO(prompt-NN).
 *
 * TODO(confirm): wire `loadSofaIndex()` to the real Sofascore index (a fetch/scrape of the tournament's
 * matches + lineups). Until then it returns []; the keyMatch wiring + writes below are unit-tested in
 * @app/scrape and run unchanged once the index is supplied.
 */
import { prisma } from "@app/db";
import {
  proposeMatchMappings,
  proposePlayerMappings,
  type SofaMatchKey,
  type SofaPlayerKey,
} from "@app/scrape";
import { log } from "./logger";

async function loadSofaIndex(): Promise<{ matches: SofaMatchKey[]; players: SofaPlayerKey[] }> {
  return { matches: [], players: [] }; // TODO(confirm): real Sofascore index
}

async function main(): Promise<void> {
  const sofa = await loadSofaIndex();

  const feedMatches = (
    await prisma.fifaMatch.findMany({
      select: {
        id: true,
        kickoffAt: true,
        homeTeam: { select: { abbreviation: true } },
        awayTeam: { select: { abbreviation: true } },
      },
    })
  ).map((m) => ({
    fifaMatchId: m.id,
    dateIso: m.kickoffAt.toISOString().slice(0, 10),
    homeCode: m.homeTeam?.abbreviation ?? "",
    awayCode: m.awayTeam?.abbreviation ?? "",
  }));

  const feedPlayers = (
    await prisma.player.findMany({
      select: { id: true, displayName: true, team: { select: { abbreviation: true } } },
    })
  ).map((p) => ({ playerId: p.id, teamCode: p.team?.abbreviation ?? "", name: p.displayName }));

  const m = proposeMatchMappings(feedMatches, sofa.matches);
  const p = proposePlayerMappings(feedPlayers, sofa.players);

  for (const prop of m.proposals) {
    await prisma.fifaMatch.update({
      where: { id: prop.fifaMatchId },
      data: { sofascoreMatchId: prop.sofascoreMatchId },
    });
  }
  for (const prop of p.proposals) {
    await prisma.player.update({
      where: { id: prop.playerId },
      data: { sofascorePlayerId: prop.sofascorePlayerId },
    });
  }

  log.info("populate.done", {
    matchProposals: m.proposals.length,
    matchFlagged: m.flagged.length,
    playerProposals: p.proposals.length,
    playerFlagged: p.flagged.length,
  });
  for (const f of p.flagged) {
    log.warn("populate.player.manual", {
      playerId: f.playerId,
      name: f.name,
      teamCode: f.teamCode,
    });
  }
  await prisma.$disconnect();
}

void main();
