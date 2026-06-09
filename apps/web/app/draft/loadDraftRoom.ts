/**
 * Server-side data loader for the draft room — the THIN Prisma edge that assembles the authoritative
 * {@link DraftRoomState} the page hydrates (Realtime keeps it fresh thereafter). It reads the league's
 * single draft (ARCHITECTURE §4: one private league), the slot-ordered managers (the board columns),
 * the made picks, the undrafted pool (player minus actively-owned), and the session manager's autopick
 * queue. Like `@app/draft`'s `prismaStore`, this IO edge has no unit test (it needs a live DB); `tsc`
 * plus the pure-logic suites cover the shapes it produces.
 */
import { prisma } from "@app/db";
import { orderDraftPool } from "@app/draft";
import type { Position } from "@app/shared";
import type { DraftPlayer, DraftRoomState } from "../../src/draft/types";

interface PlayerRow {
  id: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  position: Position;
  country: string | null;
}

function toPlayer(p: PlayerRow): DraftPlayer {
  return {
    id: p.id,
    displayName: p.displayName,
    firstName: p.firstName,
    lastName: p.lastName,
    position: p.position,
    country: p.country,
  };
}

const PLAYER_SELECT = {
  id: true,
  displayName: true,
  firstName: true,
  lastName: true,
  position: true,
  country: true,
} as const;

/** Load the authoritative draft-room snapshot for `sessionManagerId`, or null if no draft exists yet. */
export async function loadDraftRoom(
  sessionManagerId: string,
  sessionManagerIsCommissioner: boolean,
): Promise<DraftRoomState | null> {
  const draft = await prisma.draft.findFirst({
    select: {
      id: true,
      leagueId: true,
      status: true,
      currentPickNo: true,
      currentManagerId: true,
      pickDeadlineAt: true,
      timerEnabled: true,
      league: { select: { draftPickSeconds: true } },
    },
  });
  if (!draft) return null;

  const [managers, pickRows, ownedRows, queueRows] = await Promise.all([
    prisma.manager.findMany({
      where: { leagueId: draft.leagueId, draftSlot: { not: null } },
      orderBy: { draftSlot: "asc" },
      select: { id: true, displayName: true, draftSlot: true },
    }),
    prisma.draftPick.findMany({
      where: { draftId: draft.id, playerId: { not: null } },
      orderBy: { pickNo: "asc" },
      select: {
        pickNo: true,
        managerId: true,
        playerId: true,
        isAuto: true,
        player: { select: PLAYER_SELECT },
      },
    }),
    prisma.rosterPlayer.findMany({
      where: { leagueId: draft.leagueId, droppedAt: null },
      select: { playerId: true },
    }),
    prisma.draftQueue.findMany({
      where: { managerId: sessionManagerId },
      orderBy: { position: "asc" },
      select: { playerId: true },
    }),
  ]);

  const ownedIds = ownedRows.map((r) => r.playerId);
  // The undrafted pool in EXACTLY the autopick order: `orderDraftPool` (@app/draft) is the SINGLE
  // source — default_rank ASC, NULLS LAST, then `id` ASC, identical (ranked AND unranked) to what an
  // expired-timer autopick takes. So the displayed "next best" is precisely what autopick would pick.
  // We fetch the rows (incl. default_rank), order their ids via orderDraftPool, then map back to the
  // display players (the DB read order is irrelevant — orderDraftPool imposes the total order).
  const availableRows = await prisma.player.findMany({
    where: ownedIds.length > 0 ? { id: { notIn: ownedIds } } : {},
    select: { ...PLAYER_SELECT, defaultRank: true },
  });
  const availableById = new Map(availableRows.map((p) => [p.id, p]));
  const availablePlayers = orderDraftPool(
    availableRows.map((p) => ({
      playerId: p.id,
      position: p.position,
      defaultRank: p.defaultRank,
    })),
  ).map((r) => toPlayer(availableById.get(r.playerId)!));

  return {
    draftId: draft.id,
    leagueId: draft.leagueId,
    status: draft.status,
    currentPickNo: draft.currentPickNo,
    currentManagerId: draft.currentManagerId,
    pickDeadlineAt: draft.pickDeadlineAt ? draft.pickDeadlineAt.toISOString() : null,
    draftPickSeconds: draft.league.draftPickSeconds,
    timerEnabled: draft.timerEnabled,
    sessionManagerIsCommissioner,
    managers: managers.map((m) => ({
      id: m.id,
      displayName: m.displayName,
      draftSlot: m.draftSlot ?? 0,
      isMe: m.id === sessionManagerId,
    })),
    picks: pickRows.map((p) => ({
      pickNo: p.pickNo,
      managerId: p.managerId,
      playerId: p.playerId,
      player: p.player ? toPlayer(p.player) : null,
      isAuto: p.isAuto,
    })),
    availablePlayers,
    sessionManagerId,
    myQueue: queueRows.map((q) => q.playerId),
  };
}
