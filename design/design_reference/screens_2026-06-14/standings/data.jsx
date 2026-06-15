// standings/data.jsx — dedicated all-play-all POWER RECORD standings (group stage).
// Reuses globals (loaded earlier): MANAGERS, mgr, ME_ID, SEASON_PTS, recordForPeriod, evalField.
//
// MODEL — "power record." Each scoring PERIOD (a matchday) you are scored against EVERY
// rival, not one opponent: outscore a rival → a Win, get outscored → a Loss, tie → a Draw.
// Your SEASON standing is the SUM of those W/L/D across all periods. Standings RANK BY
// TOTAL WINS; ties break on TOTAL POINTS — so a manager with more wins but fewer points
// still ranks above one with fewer wins and more points. This screen is the canonical,
// drill-in version of what Vs the Field and the Dashboard only snapshot.

const ST_N = MANAGERS.length;                 // variable manager count — never hardcode

// the scoring periods feeding seeding: 2 completed (from SEASON_PTS) + the current live one.
const ST_PERIODS = [
  { id:'md1', label:'MD1', name:'Matchday 1', live:false },
  { id:'md2', label:'MD2', name:'Matchday 2', live:false },
  { id:'md3', label:'MD3', name:'Matchday 3', live:true  },
];

// Playoff field size is FLEXIBLE (likely 8 or 10) and is fixed only at the group→playoff
// transition. So during the group stage the cut line below is PROVISIONAL. Default 8 of N.
const ST_FIELD_DEFAULT = 8;

// per-period point maps: [{id:pts}, …] — completed from SEASON_PTS, live from the sim.
function periodPoints(t){
  const live = {}; evalField(t).snaps.forEach(s => { live[s.id] = s.total; });
  const p1 = {}, p2 = {};
  Object.keys(SEASON_PTS).forEach(id => { p1[id]=SEASON_PTS[id][0]; p2[id]=SEASON_PTS[id][1]; });
  return [p1, p2, live];
}

// the canonical sort: total wins desc, then total points desc.
const stCmp = (a,b)=> b.W - a.W || b.total - a.total;

// build each manager's cumulative record + per-period detail at time t.
function buildStandings(t){
  const maps = periodPoints(t);
  const recs = maps.map(recordForPeriod);     // per-period all-play-all W/L/D for everyone
  const rows = MANAGERS.map(m => {
    let W=0,L=0,D=0,total=0;
    const perPeriod = ST_PERIODS.map((per,i) => {
      const r = recs[i][m.id] || {W:0,L:0,D:0};
      const pts = maps[i][m.id] || 0;
      W+=r.W; L+=r.L; D+=r.D; total+=pts;
      return { ...per, pts, W:r.W, L:r.L, D:r.D };
    });
    return { m, W, L, D, total, perPeriod, games:W+L+D };
  });
  rows.sort(stCmp);
  rows.forEach((r,i)=> { r.rank=i+1; });

  // movement: rank using only the COMPLETED periods (exclude the live md3) → delta vs current.
  const prev = MANAGERS.map(m => {
    let W=0,total=0;
    [0,1].forEach(i => { const r=recs[i][m.id]||{W:0}; W+=r.W; total+=(maps[i][m.id]||0); });
    return { id:m.id, W, total };
  });
  prev.sort(stCmp);
  const prevRank = {}; prev.forEach((r,i)=> { prevRank[r.id]=i+1; });
  rows.forEach(r => { r.prevRank = prevRank[r.m.id]; r.move = r.prevRank - r.rank; });

  // tie flag: is this row level on WINS with a neighbour (so total-pts is the tiebreaker)?
  rows.forEach((r,i)=>{
    const a = rows[i-1], b = rows[i+1];
    r.tiedWins = !!((a && a.W===r.W) || (b && b.W===r.W));
  });
  return rows;
}

// attach cut context for a given field size.
function cutContext(rows, field){
  const cutRow   = rows[field-1];   // worst qualifier (the team on the line)
  const firstOut = rows[field];     // best non-qualifier
  return rows.map(r => {
    const qualified = r.rank <= field;
    let edge = 0;                    // wins clear of (or behind) the cut line
    if (qualified && firstOut)      edge = r.W - firstOut.W;
    else if (!qualified && cutRow)  edge = r.W - cutRow.W;
    return { ...r, qualified, edge };
  });
}

const myStandingRow = (rows) => rows.find(r => r.m.id===ME_ID);

// win% as a clean integer string
function winPct(r){ return r.games ? Math.round((r.W/r.games)*100) : 0; }

Object.assign(window, {
  ST_N, ST_PERIODS, ST_FIELD_DEFAULT, periodPoints, stCmp,
  buildStandings, cutContext, myStandingRow, winPct,
});
