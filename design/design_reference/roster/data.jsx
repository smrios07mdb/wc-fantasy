// roster/data.jsx — My Team / Roster management model.
// Reuses (globals, loaded earlier): SQUAD, player, statusOf, evalSquadPlayer,
//   MATCHES, matchState, NATIONS, JERSEY_BG, mgr, ME_ID.
//
// Roster is the squad-MANAGEMENT home: the full 15-man squad with ownership,
// legality vs 2/5/5/3, live lock-on-play status, this-period points, and entry
// points OUT to the pitch-editing surface (Set Lineup) and the waiver/FAAB flow.
// It deliberately does NOT edit the pitch — that lives in Set Lineup.

// ----------------------------------------------------------------- legality ---
const ROSTER_REQ   = { GK:2, DEF:5, MID:5, FWD:3 };
const ROSTER_TOTAL = 15;
const POS_FULL     = { GK:'Goalkeepers', DEF:'Defenders', MID:'Midfielders', FWD:'Forwards' };
const POS_ORDER    = ['GK','DEF','MID','FWD'];

function rosterCounts(squad){
  const c = { GK:0, DEF:0, MID:0, FWD:0 };
  squad.forEach(p => c[p.pos]++);
  return c;
}
function rosterLegal(squad){
  const c = rosterCounts(squad);
  return POS_ORDER.every(pos => c[pos]===ROSTER_REQ[pos]) && squad.length===ROSTER_TOTAL;
}

// ----------------------------------------------------------------- acquisition ---
// how each player joined my squad (draft round/pick or a won FAAB bid)
const ACQ = {
  p1:{ via:'draft', round:3,  pick:30 },
  p2:{ via:'faab',  cost:18,  when:'after MD1' },
  p3:{ via:'draft', round:1,  pick:4  },
  p4:{ via:'draft', round:3,  pick:28 },
  p5:{ via:'draft', round:5,  pick:52 },
  p6:{ via:'faab',  cost:7,   when:'after MD2' },
  p7:{ via:'draft', round:9,  pick:100 },
  p8:{ via:'draft', round:2,  pick:13 },
  p9:{ via:'draft', round:4,  pick:45 },
  p10:{ via:'faab', cost:24,  when:'after MD2' },
  p11:{ via:'draft', round:7, pick:76 },
  p12:{ via:'draft', round:6, pick:69 },
  p13:{ via:'draft', round:1, pick:9  },
  p14:{ via:'draft', round:8, pick:88 },
  p15:{ via:'draft', round:2, pick:21 },
};
function acqLabel(id){
  const a = ACQ[id]; if(!a) return 'Free agent';
  if (a.via==='draft') return `Drafted · R${a.round} · #${a.pick}`;
  if (a.via==='faab')  return `Claimed · $${a.cost} FAAB`;
  return 'Free agent';
}
function acqShort(id){
  const a = ACQ[id]; if(!a) return 'FA';
  return a.via==='draft' ? `R${a.round}` : `$${a.cost}`;
}

// ----------------------------------------------------------------- season totals ---
// season-to-date fantasy points per player (illustrative — values per SCORING.md, TBD).
const SEASON_PTS_PLAYER = {
  p1:34, p2:29, p3:41, p4:38, p5:26, p6:22, p7:12, p8:47,
  p9:31, p10:19, p11:14, p12:24, p13:58, p14:21, p15:44,
};
const seasonPts = id => SEASON_PTS_PLAYER[id] ?? 0;

// ----------------------------------------------------------------- FAAB budget ---
// $100 budget, resets fresh at the group→playoff transition. Entry point to waivers.
const ROSTER_FAAB = { budget:100, spent:49, pending:1, pendingTotal:14 };
const faabLeft = () => ROSTER_FAAB.budget - ROSTER_FAAB.spent;

// ----------------------------------------------------------------- per-player live ---
// today's fixture for a player + a compact "next match" descriptor at minute t.
function playerFixture(id){
  const p = player(id);
  const m = MATCHES.find(x=>x.id===p.matchId);
  const opp = p.side==='home' ? m.away : m.home;
  return { m, opp, home:p.side==='home' };
}
// KO time label (league-local display is illustrative) keyed off the staggered slots
const SLOT_CLOCK = ['14:00','15:00','17:30','20:00'];
function koClock(id){ const { m } = playerFixture(id); return SLOT_CLOCK[m.slot] || '—'; }

// can I drop this player right now? (lock-on-play: a player whose match kicked off is frozen)
function canDrop(id, t){ return statusOf(id, t)==='movable'; }

Object.assign(window, {
  ROSTER_REQ, ROSTER_TOTAL, POS_FULL, POS_ORDER,
  rosterCounts, rosterLegal,
  ACQ, acqLabel, acqShort,
  SEASON_PTS_PLAYER, seasonPts,
  ROSTER_FAAB, faabLeft,
  playerFixture, koClock, canDrop,
});
