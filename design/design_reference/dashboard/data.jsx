// dashboard/data.jsx — status-aware home model. Ties the flagships together.
// Reuses globals: MANAGERS, mgr, ME_ID, MATCHES, matchScore, SEASON_PTS, recordForPeriod,
//   evalField, buildLineup, lineupSummary, LANES, ROSTER_FAAB, faabLeft, SL_DEADLINE.
//
// The league moves through five phases; the dashboard routes you to whatever matters now.
const PHASES = [
  { id:'predraft', tab:'Pre-draft', name:'Pre-draft',   accent:'info'  },
  { id:'draft',    tab:'Draft',     name:'Draft live',  accent:'live'  },
  { id:'group',    tab:'Group',     name:'Group stage', accent:'live'  },
  { id:'playoff',  tab:'Playoff',   name:'Guillotine',  accent:'elim'  },
  { id:'complete', tab:'Complete',  name:'Complete',    accent:'win'   },
];

const N = MANAGERS.length;             // variable manager count
const fmtH = (m)=>{ if(m<=0) return 'now'; const h=Math.floor(m/60), mm=m%60; return h>0?`${h}h ${mm}m`:`${mm}m`; };

// ----------------------------------------------------------------- season power record ---
// all-play-all record accumulated over completed periods + the current (live) one.
function seasonTable(t){
  const field = evalField(t);
  const curPts = {}; field.snaps.forEach(s=> curPts[s.id]=s.total);
  // period point maps: two completed (from SEASON_PTS) + current live
  const p1={}, p2={}; Object.keys(SEASON_PTS).forEach(id=>{ p1[id]=SEASON_PTS[id][0]; p2[id]=SEASON_PTS[id][1]; });
  const recs = [recordForPeriod(p1), recordForPeriod(p2), recordForPeriod(curPts)];
  const rows = MANAGERS.map(m=>{
    let W=0,L=0,D=0;
    recs.forEach(r=>{ if(r[m.id]){ W+=r[m.id].W; L+=r[m.id].L; D+=r[m.id].D; } });
    const total = SEASON_PTS[m.id][0]+SEASON_PTS[m.id][1]+curPts[m.id];
    return { m, W, L, D, total };
  });
  rows.sort((a,b)=> b.W - a.W || b.total - a.total);
  rows.forEach((r,i)=> r.rank=i+1);
  return rows;
}

// my live snapshot for the current scoring period (provisional all-play-all)
function myPeriod(t){
  const field = evalField(t);
  const me = field.snaps.find(s=>s.id===ME_ID);
  const ranked = field.ranked.find(s=>s.id===ME_ID);
  return { rec: me.rec, total: me.total, rank: ranked.rank, live: me.live, ytp: me.ytp, final: me.final, field };
}

// my lock-on-play status this matchday
function myLock(t){
  const lu = buildLineup('group','4-3-3');
  return lineupSummary(lu, 'group', t);
}

// ----------------------------------------------------------------- waivers ---
function waiverState(){
  return { left: faabLeft(), budget: ROSTER_FAAB.budget, pending: ROSTER_FAAB.pending,
    pendingTotal: ROSTER_FAAB.pendingTotal, batchInMin: 9*60+20, // next batch ~9h20m
    rolling: 4 }; // my rolling waiver priority
}

// ----------------------------------------------------------------- fixtures today ---
function fixtures(t){
  return MATCHES.map(m=>{ const sc=matchScore(m,t); return { m, sc, phase:sc.st.phase, min:sc.st.min }; });
}

// ----------------------------------------------------------------- activity feed ---
const ACTIVITY = [
  { kind:'score',  who:'me',  txt:'Lautaro Martínez scored',        meta:'+5 · 61\u2032', t:'2m' },
  { kind:'waiver', who:'m7',  txt:'Wilmer won Niklas Süle',         meta:'$22 FAAB',    t:'1h' },
  { kind:'lineup', who:'me',  txt:'You set your Matchday 3 lineup',  meta:'4-3-3',       t:'3h' },
  { kind:'score',  who:'m3',  txt:'Modrić scored',                  meta:'+6 · 9\u2032', t:'4h' },
  { kind:'trade',  who:'m5',  txt:'Alvaro dropped Kepa',            meta:'free agent',  t:'6h' },
];

// ----------------------------------------------------------------- draft (live) mock ---
const DRAFT = {
  round:3, pick:28, totalPicks:180, onClockId:'m8', untilMineProgressPicks:4,
  myCounts:{ GK:1, DEF:2, MID:1, FWD:1 }, // squad forming vs 2/5/5/3
  recent:[
    { pickNo:27, mid:'m3', player:'Rúben Dias',   pos:'DEF', nat:'POR' },
    { pickNo:26, mid:'me', player:'Enzo Fernández',pos:'MID', nat:'ARG' },
    { pickNo:25, mid:'m5', player:'Mike Maignan',  pos:'GK',  nat:'FRA' },
    { pickNo:24, mid:'m9', player:'John Stones',   pos:'DEF', nat:'ENG' },
  ],
};
const PREDRAFT = { startInMin:2*60+32, rounds:15, perPick:60, ready:10 };

// ----------------------------------------------------------------- playoff (guillotine) ---
const PLAYOFF = {
  round:2, totalRounds:4, alive:5, cutThisRound:1, faabReset:true,
  field: [ // current playoff seeding by live pts, lowest at risk
    { id:'m3',  pts:74, safe:true  },
    { id:'me',  pts:61, safe:true  },
    { id:'m7',  pts:58, safe:true  },
    { id:'m1',  pts:52, safe:true  },
    { id:'m10', pts:39, safe:false }, // on the chopping block
  ],
  eliminated:[ {id:'m2'},{id:'m6'},{id:'m9'},{id:'m12'} ],
};

// ----------------------------------------------------------------- complete (champion) ---
const FINAL = {
  championId:'m3', myFinish:3,
  podium:[ {id:'m3', pts:892}, {id:'m7', pts:864}, {id:'me', pts:851} ],
  myRecap:{ record:'24-9', titlePts:851, bestWeek:91, finishOrdinal:'3rd' },
};

Object.assign(window, {
  PHASES, N, fmtH,
  seasonTable, myPeriod, myLock, waiverState, fixtures, ACTIVITY,
  DRAFT, PREDRAFT, PLAYOFF, FINAL,
});
