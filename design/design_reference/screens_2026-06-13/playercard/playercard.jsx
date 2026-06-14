// playercard/playercard.jsx — SHARED tabbed player card used across every surface.
//
// THE FEATURE: clicking a player opens a card whose first tab is "Points" (this-period
// scoring breakdown — owned by each surface) and whose second tab is "Stats" — the games
// he's played so far and the stats he's accumulated. The Stats tab is SELF-CONTAINED:
// it derives a deterministic season game-log from a plain player object {id?,first,last,pos,nat},
// so it works identically on Vs the Field, Set Lineup, My Team, Free Agents, Waivers, Box Score —
// even on surfaces that don't load the squad/box-score data layer.
//
// Reuses globals: NATIONS, flagStyle, Flag, Pos, PTS (illustrative scoring values).
// Exports: playerSeasonLog, PcTabs, PlayerStatsTab, PlayerCard.
const { useState: usePc } = React;

// ----------------------------------------------------------------- deterministic noise ---
function pcHash(s){ let h=2166136261; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619);} return h>>>0; }
function pcRng(seed){ return function(){ seed|=0; seed=seed+0x6D2B79F5|0; let x=Math.imul(seed^seed>>>15,1|seed); x=x+Math.imul(x^x>>>7,61|x)^x; return ((x^x>>>14)>>>0)/4294967296; }; }
const pcRi = (r,a,b)=> a + Math.floor(r()*(b-a+1));
const pcPick = (r,arr)=> arr[Math.floor(r()*arr.length)];

// illustrative scoring (mirror of vsfield PTS; fall back if PTS isn't loaded)
function pcPts(){ return (typeof PTS!=='undefined' && PTS) ? PTS : {
  appearance:2, hour:1, goal:{GK:10,DEF:8,MID:6,FWD:5}, assist:3, cleanSheet:{GK:5,DEF:4,MID:1,FWD:0}, yellow:-1 }; }

// ----------------------------------------------------------------- the season game-log ---
// Group stage to date. The CURRENT matchday is live and shown in the Points tab, so the Stats
// log covers the player's COMPLETED matchdays (MD1..current-1) — no overlap with the live match.
const PC_CUR_MD = 3;                            // current (live) period — keep in sync w/ PERIOD
function playerSeasonLog(p){
  const pos = p.pos;
  const r = pcRng(pcHash((p.id||'')+p.first+p.last+pos+p.nat));
  const V = pcPts();
  // opponents drawn from the nations we have real flags for (so a flag always renders)
  const oppPool = (typeof NATIONS!=='undefined' ? Object.keys(NATIONS) : ['ARG','MEX','FRA','CRO','ENG','USA','BRA','POR']).filter(c=>c!==p.nat);
  const played = Math.max(0, PC_CUR_MD - 1);   // completed games so far (MD1..MD2)
  const oppsUsed = [];
  const games = [];

  for (let i=0;i<played;i++){
    const md = (PC_CUR_MD - 1) - i;             // most recent completed first: MD2, MD1
    // distinct opponent
    let opp; let g=0; do { opp = pcPick(r, oppPool); g++; } while (oppsUsed.includes(opp) && g<12);
    oppsUsed.push(opp);
    const home = r()<0.5;

    // minutes
    let mins = r()<0.72 ? 90 : (r()<0.7 ? pcRi(r,62,88) : pcRi(r,22,57));
    if (pos==='GK') mins = r()<0.92 ? 90 : pcRi(r,45,89);

    // attacking returns, position-weighted
    let goals=0, assists=0;
    if (pos==='FWD'){ const x=r(); goals = x<0.42?0 : x<0.82?1 : 2; assists = r()<0.32?1:0; }
    else if (pos==='MID'){ const x=r(); goals = x<0.7?0 : x<0.94?1:2; assists = r()<0.4?1:0; }
    else if (pos==='DEF'){ goals = r()<0.12?1:0; assists = r()<0.22?1:0; }
    // GK: none

    // team result — make it consistent with his goals
    const ga = pos==='GK'||pos==='DEF' ? pcPick(r,[0,0,1,1,2,3]) : pcPick(r,[0,1,1,2,2,3]);
    const gf = Math.max(goals, goals + pcPick(r,[0,0,1,1,2]));
    const res = gf>ga ? 'W' : gf<ga ? 'L' : 'D';
    const cs = (pos==='GK'||pos==='DEF'||pos==='MID') && ga===0 && mins>=60 ? 1 : 0;
    const yellow = r()<0.16 ? 1 : 0;

    // position-relevant counting stats
    const line = { mins, goals, assists, cs, yellow };
    if (pos==='GK'){ line.saves = pcRi(r,1,6); line.conceded = ga; }
    else if (pos==='DEF'){ line.tackles = pcRi(r,1,5); line.clearances = pcRi(r,1,7); line.interceptions = pcRi(r,0,4); }
    else if (pos==='MID'){ line.key_passes = pcRi(r,0,4); line.tackles = pcRi(r,0,4); line.dribbles = pcRi(r,0,3); }
    else { line.shots = goals + pcRi(r,0,4); line.dribbles = pcRi(r,0,5); line.key_passes = assists + pcRi(r,0,2); }

    // points earned that game (illustrative, same vocabulary as the live breakdown)
    let pts = (mins>0?V.appearance:0) + (mins>=60?V.hour:0)
      + goals*(V.goal[pos]||0) + assists*V.assist + (cs?(V.cleanSheet[pos]||0):0) + yellow*V.yellow;
    line.pts = pts;
    games.push({ md, opp, home, gf, ga, res, ...line });
  }

  // accumulate season totals
  const totals = { games: games.length, mins:0, goals:0, assists:0, cs:0, yellow:0,
                   saves:0, conceded:0, tackles:0, clearances:0, interceptions:0, key_passes:0, dribbles:0, shots:0, pts:0 };
  games.forEach(g=>{ for (const k in totals){ if (k!=='games' && g[k]!=null) totals[k]+=g[k]; } });
  return { games, totals, pos };
}

// position → which counting stats to surface (tiles + per-game statline)
const PC_TILEKEYS = {
  GK:  [['saves','Saves'],['cs','Clean sheets'],['conceded','Conceded']],
  DEF: [['goals','Goals'],['assists','Assists'],['cs','Clean sheets']],
  MID: [['goals','Goals'],['assists','Assists'],['key_passes','Key passes']],
  FWD: [['goals','Goals'],['assists','Assists'],['shots','Shots']],
};
const PC_LINEKEYS = {
  GK:  [['saves','SV'],['conceded','GA'],['cs','CS']],
  DEF: [['goals','G'],['assists','A'],['tackles','TKL'],['cs','CS']],
  MID: [['goals','G'],['assists','A'],['key_passes','KP'],['tackles','TKL']],
  FWD: [['goals','G'],['assists','A'],['shots','SH'],['dribbles','DRB']],
};

// ----------------------------------------------------------------- the tab strip ---
function PcTabs({ tab, setTab, pointsLabel='Points' }){
  return (
    <div className="pc-seg" role="tablist">
      <button role="tab" className={'pc-seg-btn'+(tab==='points'?' is-active':'')} onClick={()=>setTab('points')}>{pointsLabel}</button>
      <button role="tab" className={'pc-seg-btn'+(tab==='stats'?' is-active':'')} onClick={()=>setTab('stats')}>Stats</button>
    </div>
  );
}

// ----------------------------------------------------------------- the Stats tab body ---
function PlayerStatsTab({ p }){
  const { games, totals, pos } = React.useMemo(()=>playerSeasonLog(p), [p.id, p.first, p.last, p.nat, p.pos]);
  const tiles = [['games','Matches'], ...PC_TILEKEYS[pos], ['pts','Points']];
  const lineKeys = PC_LINEKEYS[pos];

  return (
    <div className="pc-stats">
      <div className="pc-tiles">
        {tiles.map(([k,label])=>(
          <div className={'pc-tile'+(k==='pts'?' pc-tile-pts':'')} key={k}>
            <b className="mono">{totals[k]}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>

      <div className="pc-loghead t-label">Completed matches · this matchday is live in Points</div>
      <div className="pc-log">
        {games.length===0
          ? <div className="pc-foot" style={{margin:'2px 0 0'}}>No completed matches yet — his first game is under way.</div>
          : games.map((g,i)=>(
          <div className="pc-lrow" key={i}>
            <div className="pc-lrow-top">
              <span className="pc-md mono">MD{g.md}</span>
              <span className="pc-opp">
                <span className="pc-vs">{g.home?'vs':'@'}</span>
                <Flag nat={g.opp}/><b>{g.opp}</b>
              </span>
              <span className={'wld wld-'+g.res}>{g.res}</span>
              <span className="pc-score mono">{g.gf}–{g.ga}</span>
              <span className={'pc-lpts mono'+(g.pts<0?' is-neg':'')}>{g.pts>=0?'+':''}{g.pts}</span>
            </div>
            <div className="pc-statline">
              <span className="pc-min mono">{g.mins}'</span>
              {lineKeys.map(([k,abbr])=> (g[k]!=null && g[k]!==0) && (
                <span className="pc-stat" key={k}><b className="mono">{g[k]}</b>{abbr}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="pc-foot">Group stage to date · points illustrative pending SCORING.md</div>
    </div>
  );
}

// ----------------------------------------------------------------- generic standalone card ---
// Used by surfaces that have no existing score-sheet (Free Agents, Waivers). Self-contained
// chrome (.pc-scrim/.pc-sheet) so it works without the vf-psheet styles.
function PlayerCard({ p, sub, total, totalLabel='pts', statusNode, matchLine, pointsBody, note, onClose, defaultTab='points', pointsLabel='Points' }){
  const [tab, setTab] = usePc(defaultTab);
  if (!p) return null;
  return (
    <div className="pc-scrim" onClick={onClose}>
      <div className="pc-sheet" onClick={e=>e.stopPropagation()}>
        <button className="pc-x" onClick={onClose} aria-label="Close">✕</button>
        <div className="pc-head">
          <Pos p={p.pos}/><Flag nat={p.nat}/>
          <div className="pc-headid">
            <b>{p.first[0]}. {p.last}</b>
            <span className="t-micro text-tertiary">{(NATIONS[p.nat]||{}).n||p.nat}{sub?' · '+sub:''}</span>
          </div>
          {total!=null && <span className="pc-headtotal mono">{total}<small>{totalLabel}</small></span>}
        </div>
        {matchLine && <div className="pc-headmatch">{statusNode}{matchLine}</div>}
        <PcTabs tab={tab} setTab={setTab} pointsLabel={pointsLabel}/>
        <div className="pc-body">
          {tab==='points' ? pointsBody : <PlayerStatsTab p={p}/>}
        </div>
        {note && tab==='points' && <div className="pc-foot">{note}</div>}
      </div>
    </div>
  );
}

Object.assign(window, { playerSeasonLog, PcTabs, PlayerStatsTab, PlayerCard });
