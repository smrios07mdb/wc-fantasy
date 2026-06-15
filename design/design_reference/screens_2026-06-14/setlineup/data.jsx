// setlineup/data.jsx — MY squad + lineup model for the "Set Lineup" surface.
// Reuses the live match timeline + nations from vsfield/data.jsx (loaded first):
//   MATCHES, matchState, MATCH_LEN, SLOTS, NATIONS, ME_ID, mgr
//
// LOCK-ON-PLAY MODEL (the heart of this screen)
//   Every player I own is tied to ONE of today's real matches. His lock state is
//   derived from that match's clock — so "what can I still move right now" is always live:
//     • match NOT kicked off  → MOVABLE  (free to swap in/out — even a benched 0-min starter)
//     • match IN PROGRESS     → LOCKED · playing  (he's on the pitch; frozen)
//     • match FINISHED        → LOCKED · played    (banked; frozen)
//   No auto-subs: a movable starter who never plays simply scores 0 — nothing promotes for you.
//   You can't move a player (in OR out, starter OR bench) once HIS match has kicked off.

// ----------------------------------------------------------------- my 15-man squad ---
// 2 GK / 5 DEF / 5 MID / 3 FWD. nat matches the team he plays for in today's fixtures,
// so lock states spread naturally across the staggered kickoffs.
//   m0 ARG·MEX (KO 0)   m1 FRA·CRO (KO 45)   m2 ENG·USA (KO 95)   m3 BRA·POR (KO 140)
const SQUAD = [
  // GK
  { id:'p1',  first:'Jordan',    last:'Pickford',  pos:'GK',  nat:'ENG', matchId:'mt2', side:'home' },
  { id:'p2',  first:'Alisson',   last:'Becker',    pos:'GK',  nat:'BRA', matchId:'mt3', side:'home' },
  // DEF
  { id:'p3',  first:'Cristian',  last:'Romero',    pos:'DEF', nat:'ARG', matchId:'mt0', side:'home' },
  { id:'p4',  first:'William',   last:'Saliba',    pos:'DEF', nat:'FRA', matchId:'mt1', side:'home' },
  { id:'p5',  first:'Joško',     last:'Gvardiol',  pos:'DEF', nat:'CRO', matchId:'mt1', side:'away' },
  { id:'p6',  first:'Antonee',   last:'Robinson',  pos:'DEF', nat:'USA', matchId:'mt2', side:'away' },
  { id:'p7',  first:'Tyrick',    last:'Mitchell',  pos:'DEF', nat:'ENG', matchId:'mt2', side:'home' },
  // MID
  { id:'p8',  first:'Enzo',      last:'Fernández', pos:'MID', nat:'ARG', matchId:'mt0', side:'home' },
  { id:'p9',  first:'Aurélien',  last:'Tchouaméni',pos:'MID', nat:'FRA', matchId:'mt1', side:'home' },
  { id:'p10', first:'Weston',    last:'McKennie',  pos:'MID', nat:'USA', matchId:'mt2', side:'away' },
  { id:'p11', first:'Tyler',     last:'Adams',     pos:'MID', nat:'USA', matchId:'mt2', side:'away' },
  { id:'p12', first:'Luka',      last:'Modrić',    pos:'MID', nat:'CRO', matchId:'mt1', side:'away' },
  // FWD
  { id:'p13', first:'Lautaro',   last:'Martínez',  pos:'FWD', nat:'ARG', matchId:'mt0', side:'home' },
  { id:'p14', first:'Rafael',    last:'Leão',      pos:'FWD', nat:'POR', matchId:'mt3', side:'away' },
  { id:'p15', first:'Vinícius',  last:'Júnior',    pos:'FWD', nat:'BRA', matchId:'mt3', side:'home' },
];
const SQUAD_BY = Object.fromEntries(SQUAD.map(p => [p.id, p]));
const player = id => SQUAD_BY[id];

// reduced PLAYOFF squad (guillotine survivors): 9 men = 1 GK + 3 DEF + 3 MID + 2 FWD
const SQUAD_PO_IDS = ['p1','p3','p6','p5','p8','p10','p12','p13','p15'];
const SQUAD_PO = SQUAD_PO_IDS.map(id => SQUAD_BY[id]);

// ----------------------------------------------------------------- formations ---
// Each maps the outfield lane counts (GK is always 1). All listed shapes are legal:
//   group  bounds: min 3 DEF / 2 MID / 1 FWD   → 10 outfield
//   playoff bounds: min 2 DEF / 2 MID / 1 FWD  →  6 outfield
const FORMATIONS = {
  '3-4-3':{DEF:3,MID:4,FWD:3}, '3-5-2':{DEF:3,MID:5,FWD:2},
  '4-3-3':{DEF:4,MID:3,FWD:3}, '4-4-2':{DEF:4,MID:4,FWD:2},
  '4-5-1':{DEF:4,MID:5,FWD:1}, '5-3-2':{DEF:5,MID:3,FWD:2}, '5-4-1':{DEF:5,MID:4,FWD:1},
};
const FORMATIONS_PO = {
  '2-3-1':{DEF:2,MID:3,FWD:1}, '3-2-1':{DEF:3,MID:2,FWD:1}, '2-2-2':{DEF:2,MID:2,FWD:2},
};
const LANES = ['GK','DEF','MID','FWD']; // pitch order bottom→top

function modeConf(mode){
  return mode==='playoff'
    ? { squad:SQUAD_PO, forms:FORMATIONS_PO, benchCap:2, starters:7, def:'2-3-1', label:'Playoff XI', sub:'7 starters · 2 bench' }
    : { squad:SQUAD,    forms:FORMATIONS,    benchCap:4, starters:11,def:'4-3-3', label:'Starting XI', sub:'11 starters · 4 bench' };
}

// ----------------------------------------------------------------- lock state ---
// status: 'movable' (match not started) | 'live' (playing, locked) | 'played' (final, locked)
function statusOf(id, t){
  const p = SQUAD_BY[id]; if(!p) return 'movable';
  const m = MATCHES.find(x=>x.id===p.matchId);
  const st = matchState(m, t).phase;          // 'ytp' | 'live' | 'final'
  return st==='ytp' ? 'movable' : st==='live' ? 'live' : 'played';
}
const isLocked = (id, t) => statusOf(id, t) !== 'movable';
function koMinuteOf(id){
  const p = SQUAD_BY[id]; const m = MATCHES.find(x=>x.id===p.matchId); return m.ko;
}

// ----------------------------------------------------------------- build a lineup ---
// lineup = { formation, slots:{GK:[ids],DEF:[ids|null],MID:[...],FWD:[...]}, bench:[ids] }
function buildLineup(mode, formation){
  const conf = modeConf(mode);
  const f = conf.forms[formation];
  const counts = { GK:1, DEF:f.DEF, MID:f.MID, FWD:f.FWD };
  const byPos = { GK:[], DEF:[], MID:[], FWD:[] };
  conf.squad.forEach(p => byPos[p.pos].push(p.id));
  const slots = { GK:[], DEF:[], MID:[], FWD:[] };
  const bench = [];
  LANES.forEach(pos => {
    const pool = [...byPos[pos]];
    for (let i=0;i<counts[pos];i++) slots[pos].push(pool[i]||null);
    pool.slice(counts[pos]).forEach(id => bench.push(id));
  });
  return { formation, slots, bench };
}

// re-shape an existing lineup to a new formation.
//  • locked starters are kept (you can't move a playing/played man)
//  • remaining slots filled by previously-filled unlocked starters of that lane
//  • leftover starters → bench;  shortage → empty (null) slots to fill
function reshape(lineup, mode, newFormation, t){
  const conf = modeConf(mode);
  const f = conf.forms[newFormation];
  const counts = { GK:1, DEF:f.DEF, MID:f.MID, FWD:f.FWD };
  const slots = { GK:[], DEF:[], MID:[], FWD:[] };
  const placed = new Set();
  LANES.forEach(pos => {
    const filled = (lineup.slots[pos]||[]).filter(Boolean);
    const locked = filled.filter(id => isLocked(id, t));
    const free   = filled.filter(id => !isLocked(id, t));
    const keep = [...locked, ...free].slice(0, counts[pos]);
    keep.forEach(id => placed.add(id));
    for (let i=0;i<counts[pos];i++) slots[pos].push(keep[i]||null);
  });
  // bench = everyone in squad not placed, locked-first preserved order
  const bench = conf.squad.map(p=>p.id).filter(id => !placed.has(id));
  return { formation:newFormation, slots, bench };
}

// is a formation reachable from the current locked picture? (can't bench a locked man)
function formationLegal(lineup, mode, formation, t){
  const conf = modeConf(mode);
  const f = conf.forms[formation];
  const counts = { DEF:f.DEF, MID:f.MID, FWD:f.FWD };
  return ['DEF','MID','FWD'].every(pos => {
    const lockedStarters = (lineup.slots[pos]||[]).filter(id => id && isLocked(id,t)).length;
    return counts[pos] >= lockedStarters;
  });
}

// ----------------------------------------------------------------- swap logic ---
// flatten a lineup to addressable cells
function cellsOf(lineup){
  const cells = [];
  LANES.forEach(pos => (lineup.slots[pos]||[]).forEach((id,idx)=> cells.push({ kind:'slot', pos, idx, id })));
  lineup.bench.forEach((id,idx)=> cells.push({ kind:'bench', pos:player(id).pos, idx, id }));
  return cells;
}
// can `sel` (a chosen cell) legally exchange with `tgt`?
function canSwap(sel, tgt, t){
  if (!sel || !tgt) return false;
  if (sel.kind===tgt.kind && sel.idx===tgt.idx && sel.pos===tgt.pos && sel.id===tgt.id) return false;
  // never move a locked player; never displace into a locked occupant
  if (sel.id && isLocked(sel.id,t)) return false;
  if (tgt.id && isLocked(tgt.id,t)) return false;
  // same kind (slot↔slot in same lane, or bench↔bench) is a reorder — allow within same pos
  if (sel.kind==='slot' && tgt.kind==='slot') return sel.pos===tgt.pos;
  if (sel.kind==='bench' && tgt.kind==='bench') return true;
  // slot ↔ bench: positions must match (slot's lane defines the required position)
  const slot = sel.kind==='slot'? sel : tgt;
  const ben  = sel.kind==='slot'? tgt : sel;
  if (!ben.id) return false;                 // empty bench cell isn't a target
  return player(ben.id).pos === slot.pos;
}
// eligible target cells for a selected cell
function eligibleTargets(lineup, sel, t){
  if (!sel) return [];
  return cellsOf(lineup).filter(c => canSwap(sel, c, t));
}
// perform the exchange, returning a new lineup
function applySwap(lineup, a, b){
  const next = { formation:lineup.formation,
    slots:{ GK:[...lineup.slots.GK], DEF:[...lineup.slots.DEF], MID:[...lineup.slots.MID], FWD:[...lineup.slots.FWD] },
    bench:[...lineup.bench] };
  const get = c => c.kind==='slot' ? next.slots[c.pos][c.idx] : next.bench[c.idx];
  const set = (c,v) => { if (c.kind==='slot') next.slots[c.pos][c.idx]=v; else next.bench[c.idx]=v; };
  const av = get(a), bv = get(b);
  set(a, bv); set(b, av);
  // keep bench compact: drop nulls that may appear, never leave holes on bench
  next.bench = next.bench.filter(x => x!=null);
  return next;
}

// summary of a lineup at time t
function lineupSummary(lineup, mode, t){
  const conf = modeConf(mode);
  const startIds = LANES.flatMap(pos => lineup.slots[pos]).filter(Boolean);
  const empties  = LANES.reduce((n,pos)=> n + lineup.slots[pos].filter(x=>x==null).length, 0);
  const movable = startIds.filter(id => statusOf(id,t)==='movable').length;
  const live    = startIds.filter(id => statusOf(id,t)==='live').length;
  const played  = startIds.filter(id => statusOf(id,t)==='played').length;
  const benchMovable = lineup.bench.filter(id => statusOf(id,t)==='movable').length;
  const complete = empties===0 && startIds.length===conf.starters;
  // next kickoff among my still-movable players (starters or bench) > t
  const upcoming = [...startIds, ...lineup.bench]
    .filter(id => statusOf(id,t)==='movable')
    .map(id => ({ id, ko:koMinuteOf(id) }))
    .filter(x => x.ko > t)
    .sort((a,b)=> a.ko-b.ko);
  const nextKO = upcoming.length ? upcoming[0] : null;
  return { startIds, empties, movable, live, played, benchMovable, complete, nextKO,
           total:startIds.length, cap:conf.starters };
}

// the upcoming-matchday periods (current + next). Keep it tight per spec.
const PERIODS = [
  { id:'md3', tab:'Matchday 3', title:'Matchday 3', sub:'Group Stage · Period 3 of 5', kind:'group', live:true },
  { id:'md4', tab:'Matchday 4', title:'Matchday 4', sub:'Group Stage · Period 4 of 5', kind:'group', live:false },
];
const PLAYOFF_PERIOD = { id:'r1', tab:'Playoff R1', title:'Guillotine · Round 1', sub:'Reduced roster · lowest scorer eliminated', kind:'playoff', live:true };

// default sim minute: m0+m1 live (locked), m2+m3 not started (movable) → ~half the XI still in play
const SL_DEFAULT_MIN = 70;
const SL_DEADLINE = SLOTS[SLOTS.length-1]; // 140 — once the last match starts, everything is locked

// ----------------------------------------------------------------- per-player scoring ---
// Illustrative events per squad player (point VALUES per SCORING.md, TBD — reuse vsfield PTS).
// Points only count once the player's match clock passes each event minute, so scores grow live.
const EVENTS = {
  p13:[{min:1,t:'appearance'},{min:60,t:'hour'},{min:23,t:'goal'},{min:61,t:'goal'}], // Lautaro — brace
  p8: [{min:1,t:'appearance'},{min:60,t:'hour'},{min:22,t:'assist'}],                 // Enzo — assist
  p3: [{min:1,t:'appearance'},{min:60,t:'hour'}],                                     // Romero
  p4: [{min:1,t:'appearance'},{min:60,t:'hour'}],                                     // Saliba
  p9: [{min:1,t:'appearance'},{min:60,t:'hour'},{min:50,t:'goal'}],                   // Tchouaméni — goal
  p5: [{min:1,t:'appearance'},{min:60,t:'hour'},{min:8,t:'assist'}],                  // Gvardiol — assist
  p12:[{min:1,t:'appearance'},{min:60,t:'hour'},{min:9,t:'goal'}],                    // Modrić (bench) — goal
  p1: [{min:1,t:'appearance'},{min:60,t:'hour'},{min:90,t:'cs'}],                     // Pickford — CS
  p7: [{min:1,t:'appearance'},{min:60,t:'hour'},{min:90,t:'cs'}],                     // Mitchell (bench) — CS
  p6: [{min:1,t:'appearance'},{min:60,t:'hour'}],                                     // Robinson
  p10:[{min:1,t:'appearance'},{min:60,t:'hour'}],                                     // McKennie
  p11:[{min:1,t:'appearance'},{min:60,t:'hour'}],                                     // Adams (bench)
  p15:[{min:1,t:'appearance'},{min:60,t:'hour'}],                                     // Vinícius
  p14:[{min:1,t:'appearance'},{min:60,t:'hour'}],                                     // Leão
  p2: [{min:1,t:'appearance'},{min:60,t:'hour'},{min:90,t:'cs'}],                     // Alisson (bench) — CS
};
const EV_LABEL = { appearance:'Played', hour:'60+ minutes', goal:'Goal', assist:'Assist', cs:'Clean sheet', yellow:'Yellow card' };
function evPts(type, pos){
  const P = window.PTS;
  if (type==='appearance') return P.appearance;
  if (type==='hour') return P.hour;
  if (type==='goal') return P.goal[pos];
  if (type==='assist') return P.assist;
  if (type==='cs') return P.cleanSheet[pos];
  if (type==='yellow') return P.yellow;
  return 0;
}
// live points snapshot for one of MY players at time t
function evalSquadPlayer(id, t){
  const p = SQUAD_BY[id];
  const m = MATCHES.find(x=>x.id===p.matchId);
  const st = matchState(m, t);
  if (st.phase==='ytp') return { pts:0, status:'movable', done:[], match:m, min:0, phase:'ytp' };
  let pts = 0; const done = [];
  (EVENTS[id]||[]).forEach(e => { if (e.min <= st.min){ const v = evPts(e.t, p.pos); pts += v; done.push({ min:e.min, type:e.t, label:EV_LABEL[e.t], pts:v }); } });
  done.sort((a,b)=> a.min-b.min);
  return { pts, status: st.phase==='live'?'live':'played', done, match:m, min:st.min, phase:st.phase };
}

// ----------------------------------------------------------------- flag-kit library ---
// CSS flag fills for every participating nation, tuned to read as a real, centered flag
// on the shirt. Helpers keep the common patterns consistent; complex emblem flags are
// simplified to their dominant motif. JERSEY_BG[code] → the kit background string.
const _vt = (a,b,c)=>`linear-gradient(90deg,${a} 0 33.33%,${b} 33.33% 66.66%,${c} 66.66%)`;       // vertical tricolor
const _ht = (a,b,c)=>`linear-gradient(180deg,${a} 0 33.33%,${b} 33.33% 66.66%,${c} 66.66%)`;       // horizontal tricolor
const _vb = (a,b)=>`linear-gradient(90deg,${a} 0 50%,${b} 50%)`;                                    // vertical bicolor
const _hb = (a,b)=>`linear-gradient(180deg,${a} 0 50%,${b} 50%)`;                                   // horizontal bicolor
const _dot = (c,x,y,r)=>`radial-gradient(circle at ${x}% ${y}%,${c} 0 ${r}%,transparent ${r+0.6}%)`;// disc/emblem
const _cross = (field,cross,t=20)=>`linear-gradient(${cross},${cross}) 50% 0/${t}% 100% no-repeat,linear-gradient(${cross},${cross}) 0 50%/100% ${t}% no-repeat,${field}`; // centred cross
const _nordic = (field,cross,t=16)=>`linear-gradient(${cross},${cross}) 34% 0/${t}% 100% no-repeat,linear-gradient(${cross},${cross}) 0 50%/100% ${t*1.9}% no-repeat,${field}`; // off-centre nordic cross

const JERSEY_BG = {
  // —— Hosts ——
  USA:'linear-gradient(#3C3B6E,#3C3B6E) top left/44% 54% no-repeat, repeating-linear-gradient(180deg,#B22234 0 7.7%, #fff 7.7% 15.4%)',
  CAN:`${_dot('#D80621',50,50,15)}, linear-gradient(90deg,#D80621 0 25%,#fff 25% 75%,#D80621 75%)`,
  MEX:_vt('#006847','#fff','#CE1126'),
  // —— UEFA ——
  FRA:_vt('#0055A4','#fff','#EF4135'),
  ENG:_cross('#fff','#CF142B',22),
  ESP:'linear-gradient(180deg,#AA151B 0 25%,#F1BF00 25% 75%,#AA151B 75%)',
  POR:`${_dot('#FFE400',50,50,7)}, ${_vb('#006600','#FF0000')}`,
  NED:_ht('#AE1C28','#fff','#21468B'),
  GER:_ht('#000','#DD0000','#FFCE00'),
  ITA:_vt('#008C45','#fff','#CD212A'),
  BEL:_vt('#000','#FAE042','#ED2939'),
  CRO:_ht('#FF0000','#fff','#171796'),
  SUI:_cross('#D52B1E','#fff',16),
  DEN:_nordic('#C8102E','#fff'),
  AUT:_ht('#ED2939','#fff','#ED2939'),
  POL:_hb('#fff','#DC143C'),
  SRB:_ht('#C6363C','#0C4076','#fff'),
  UKR:_hb('#0057B7','#FFD700'),
  TUR:`${_dot('#E30A17',62,50,13)}, ${_dot('#fff',52,50,17)}, #E30A17`,
  NOR:`linear-gradient(#00205B,#00205B) 34% 0/9% 100% no-repeat,linear-gradient(#00205B,#00205B) 0 50%/100% 17% no-repeat,${_nordic('#BA0C2F','#fff',22)}`,
  SWE:_nordic('#006AA7','#FECB00'),
  SCO:'linear-gradient(45deg, transparent 42%, #fff 42% 58%, transparent 58%), linear-gradient(-45deg, transparent 42%, #fff 42% 58%, transparent 58%), #0065BF',
  // —— CONMEBOL ——
  BRA:'radial-gradient(circle at 50% 50%, #002776 0 13%, transparent 13.5%), linear-gradient(to bottom right,#009C3B 0 50%, transparent 50%) top left/50% 50% no-repeat, linear-gradient(to bottom left,#009C3B 0 50%, transparent 50%) top right/50% 50% no-repeat, linear-gradient(to top right,#009C3B 0 50%, transparent 50%) bottom left/50% 50% no-repeat, linear-gradient(to top left,#009C3B 0 50%, transparent 50%) bottom right/50% 50% no-repeat, #FFDF00',
  ARG:`${_dot('#F6B40E',50,50,8)}, linear-gradient(180deg,#75AADB 0 33%,#fff 33% 67%,#75AADB 67%)`,
  URU:`linear-gradient(#fff,#fff) 0 0/50% 56% no-repeat, ${_dot('#F6B40E',25,28,11)}, repeating-linear-gradient(180deg,#fff 0 11.1%,#0038A8 11.1% 22.2%)`,
  COL:'linear-gradient(180deg,#FCD116 0 50%,#003893 50% 75%,#CE1126 75%)',
  ECU:`${_dot('#7b5a2a',50,50,8)}, linear-gradient(180deg,#FFDD00 0 50%,#034EA2 50% 75%,#ED1C24 75%)`,
  PAR:_ht('#D52B1E','#fff','#0038A8'),
  PER:_vt('#D91023','#fff','#D91023'),
  CHI:`linear-gradient(#0039A6,#0039A6) top left/33% 50% no-repeat, ${_dot('#fff',16,25,9)}, ${_hb('#fff','#D52B1E')}`,
  // —— CAF ——
  MAR:`${_dot('#006233',50,50,14)}, #C1272D`,
  SEN:`${_dot('#00853F',50,50,12)}, ${_vt('#00853F','#FDEF42','#E31B23')}`,
  NGA:_vt('#008751','#fff','#008751'),
  EGY:`${_dot('#C09300',50,50,9)}, ${_ht('#CE1126','#fff','#000')}`,
  CMR:`${_dot('#FCD116',50,50,9)}, ${_vt('#007A5E','#CE1126','#FCD116')}`,
  GHA:`${_dot('#000',50,50,9)}, ${_ht('#CE1126','#FCD116','#006B3F')}`,
  ALG:`${_dot('#D21034',50,50,9)}, ${_vb('#006233','#fff')}`,
  TUN:`${_dot('#E70013',53,50,11)}, ${_dot('#fff',50,50,18)}, #E70013`,
  CIV:_vt('#F77F00','#fff','#009E60'),
  RSA:`linear-gradient(#007749,#007749) 0 50%/100% 22% no-repeat, linear-gradient(90deg,#000 0 20%, transparent 20%), linear-gradient(180deg,#E03C31 0 50%,#001489 50%)`,
  // —— AFC ——
  JPN:`${_dot('#BC002D',50,50,22)}, #fff`,
  KOR:`conic-gradient(from 90deg at 50% 50%, #CD2E3A 0 180deg, #0047A0 180deg) center/24% 24% no-repeat, ${_dot('#fff',50,50,13)}, #fff`,
  IRN:`${_dot('#DA0000',50,50,8)}, ${_ht('#239F40','#fff','#DA0000')}`,
  KSA:'linear-gradient(#fff,#fff) center/60% 8% no-repeat, #006C35',
  AUS:`${_dot('#fff',72,66,5)}, ${_dot('#fff',62,40,4)}, ${_dot('#fff',82,42,4)}, ${_dot('#fff',74,82,4)}, ${_dot('#fff',24,30,8)}, #00008B`,
  QAT:_vb('#fff','#8A1538'),
  IRQ:`${_dot('#007A3D',50,50,7)}, ${_ht('#CE1126','#fff','#000')}`,
  UZB:_ht('#0099B5','#fff','#1EB53A'),
  JOR:`${_dot('#fff',15,50,5)}, linear-gradient(90deg,#CE1126 0 30%, transparent 30%), ${_ht('#000','#fff','#007A3D')}`,
  // —— CONCACAF ——
  CRC:'linear-gradient(180deg,#002B7F 0 17%,#fff 17% 33%,#CE1126 33% 67%,#fff 67% 83%,#002B7F 83%)',
  PAN:'linear-gradient(to right,#fff 50%,#DA121A 50%) top/100% 50% no-repeat, linear-gradient(to right,#072357 50%,#fff 50%) bottom/100% 50% no-repeat',
  JAM:'linear-gradient(45deg, transparent 44%, #FED100 44% 56%, transparent 56%), linear-gradient(-45deg, transparent 44%, #FED100 44% 56%, transparent 56%), conic-gradient(from 0deg at 50% 50%, #009B3A 0 45deg, #000 45deg 135deg, #009B3A 135deg 225deg, #000 225deg 315deg, #009B3A 315deg)',
  HON:`${_dot('#0073CF',50,50,6)}, ${_ht('#0073CF','#fff','#0073CF')}`,
  // —— OFC ——
  NZL:`${_dot('#CE1124',74,40,4)}, ${_dot('#CE1124',82,62,4)}, ${_dot('#CE1124',66,68,4)}, ${_dot('#CE1124',24,30,7)}, #00247D`,
};
const FLAG_NAMES = {
  USA:'USA', CAN:'Canada', MEX:'Mexico', FRA:'France', ENG:'England', ESP:'Spain', POR:'Portugal',
  NED:'Netherlands', GER:'Germany', ITA:'Italy', BEL:'Belgium', CRO:'Croatia', SUI:'Switzerland',
  DEN:'Denmark', AUT:'Austria', POL:'Poland', SRB:'Serbia', UKR:'Ukraine', TUR:'Türkiye', NOR:'Norway',
  SWE:'Sweden', SCO:'Scotland', BRA:'Brazil', ARG:'Argentina', URU:'Uruguay', COL:'Colombia', ECU:'Ecuador',
  PAR:'Paraguay', PER:'Peru', CHI:'Chile', MAR:'Morocco', SEN:'Senegal', NGA:'Nigeria', EGY:'Egypt',
  CMR:'Cameroon', GHA:'Ghana', ALG:'Algeria', TUN:'Tunisia', CIV:'Ivory Coast', RSA:'South Africa',
  JPN:'Japan', KOR:'South Korea', IRN:'Iran', KSA:'Saudi Arabia', AUS:'Australia', QAT:'Qatar', IRQ:'Iraq',
  UZB:'Uzbekistan', JOR:'Jordan', CRC:'Costa Rica', PAN:'Panama', JAM:'Jamaica', HON:'Honduras', NZL:'New Zealand',
};
// extend NATIONS so the small <Flag> chips render for every nation too
Object.keys(JERSEY_BG).forEach(code => { if (!NATIONS[code]) NATIONS[code] = { n:FLAG_NAMES[code]||code, f:JERSEY_BG[code] }; });

Object.assign(window, {
  FORMATIONS, FORMATIONS_PO, LANES, modeConf,
  statusOf, isLocked, koMinuteOf,
  buildLineup, reshape, formationLegal,
  cellsOf, canSwap, eligibleTargets, applySwap, lineupSummary,
  evalSquadPlayer, EVENTS, JERSEY_BG, FLAG_NAMES,
  PERIODS, PLAYOFF_PERIOD, SL_DEFAULT_MIN, SL_DEADLINE,
});
