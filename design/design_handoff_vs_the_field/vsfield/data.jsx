// vsfield/data.jsx — mock data + live-period simulation for the "Vs the Field" surface.
// Exports to window. Deterministic (seeded PRNG) so totals are stable across reloads.
//
// MODEL
//  • One scoring PERIOD (a Matchday). Today's 4 real matches kick off in staggered slots.
//  • Each manager fields an XI (1 GK + 10 outfield). Every starter belongs to one of today's
//    matches, so his state derives from that match's clock — this is what makes lock-on-play legible:
//      - match not kicked off  → YET-TO-PLAY  (points pending AND still swappable / not locked)
//      - match in progress     → LIVE         (locked-on-play, points still moving)
//      - match finished        → FINAL        (locked, banked)
//  • Points come from scripted match events (goals/assists/clean sheets) so the live feed and the
//    scoreboard always agree. Point VALUES are illustrative — real values live in SCORING.md (TBD).
//  • All-play-all: each manager is scored vs EVERY other. Provisional record = W per opponent below
//    you, L per opponent above, D on a tie. Standings break ties on total points.

// ----------------------------------------------------------------- nations / flags ---
const NATIONS = {
  ARG:{n:'Argentina', f:'linear-gradient(180deg,#75AADB 0 33%,#fff 33% 66%,#75AADB 66%)'},
  MEX:{n:'Mexico', f:'linear-gradient(90deg,#006847 0 33%,#fff 33% 66%,#CE1126 66%)'},
  FRA:{n:'France', f:'linear-gradient(90deg,#0055A4 0 33%,#fff 33% 66%,#EF4135 66%)'},
  CRO:{n:'Croatia', f:'linear-gradient(180deg,#FF0000 0 33%,#fff 33% 66%,#171796 66%)'},
  ENG:{n:'England', f:'linear-gradient(180deg,#fff 0 45%,#CF142B 45% 55%,#fff 55%)'},
  USA:{n:'USA', f:'linear-gradient(180deg,#B22234 0 50%,#fff 50%),#3C3B6E'},
  BRA:{n:'Brazil', f:'linear-gradient(135deg,#009C3B 0 50%,#FFDF00 50%)'},
  POR:{n:'Portugal', f:'linear-gradient(90deg,#006600 0 40%,#FF0000 40%)'},
};
function flagStyle(code){ return { background:(NATIONS[code]||{}).f||'var(--surface-3)', backgroundSize:'cover' }; }

// ----------------------------------------------------------------- managers (N variable) ---
const MANAGERS = [
  {id:'m1', name:'Chocoyo', short:'Chocoyo', init:'CH', color:'#2E8B8B', online:true},
  {id:'m2', name:'Armando', short:'Armando', init:'AR', color:'#B0823A', online:true},
  {id:'m3', name:'Marlon', short:'Marlon', init:'MA', color:'#5C7CFF', online:true},
  {id:'me', name:'Cesar', short:'You', init:'CE', color:'#7C5CFF', online:true, isMe:true},
  {id:'m5', name:'Alvaro', short:'Alvaro', init:'AL', color:'#C0568A', online:true},
  {id:'m6', name:'Denis', short:'Denis', init:'DE', color:'#3FA66A', online:false},
  {id:'m7', name:'Wilmer', short:'Wilmer', init:'WI', color:'#D08A3E', online:true},
  {id:'m8', name:'Sebastian', short:'Sebastian', init:'SE', color:'#4C9BC0', online:true},
  {id:'m9', name:'Norlan', short:'Norlan', init:'NO', color:'#B5524E', online:false},
  {id:'m10', name:'Fran', short:'Fran', init:'FR', color:'#6E8A2E', online:true},
  {id:'m11', name:'Yader', short:'Yader', init:'YA', color:'#8A5CC0', online:true},
  {id:'m12', name:'Bismarck', short:'Bismarck', init:'BI', color:'#3E8FD0', online:true},
];
const ME_ID = 'me';
const mgr = id => MANAGERS.find(m => m.id === id);

// ----------------------------------------------------------------- period timeline ---
// 4 matches in staggered kickoff slots (period-minutes). matchLen incl. stoppage.
const MATCH_LEN = 96;
const SLOTS = [0, 45, 95, 140];          // KO offset for each match, in period-minutes
const PERIOD_END = SLOTS[SLOTS.length-1] + MATCH_LEN; // 236
const DEFAULT_MIN = 110;                 // start mid-action: 1 FT, 2 live, 1 yet-to-play

const PERIOD = { id:'md3', label:'Matchday 3', sub:'Group Stage · Period 3 of 5' };

// Today's matches. goals[] drive both the scoreline and (assigned below) player point events.
const MATCHES = [
  { slot:0, home:'ARG', away:'MEX', goals:[ {min:23,side:'home'},{min:61,side:'home'},{min:78,side:'away'} ] },
  { slot:1, home:'FRA', away:'CRO', goals:[ {min:9,side:'away'},{min:50,side:'home'},{min:64,side:'home'} ] },
  { slot:2, home:'ENG', away:'USA', goals:[ {min:31,side:'home'} ] },
  { slot:3, home:'BRA', away:'POR', goals:[] },
];
MATCHES.forEach((m,i)=>{ m.id='mt'+i; m.ko=SLOTS[m.slot]; });

// match clock helpers given the global period minute `t`
function matchState(m, t){
  const mm = t - m.ko;
  if (mm < 0)            return { phase:'ytp',   min:0,            ko:m.ko };
  if (mm >= MATCH_LEN)   return { phase:'final', min:90,           ko:m.ko };
  return                        { phase:'live',  min:Math.min(90+5, mm), ko:m.ko };
}
function matchScore(m, t){
  const st = matchState(m, t);
  let h=0, a=0;
  m.goals.forEach(g => { if (g.min <= st.min) (g.side==='home'?h++:a++); });
  return { h, a, st };
}

// ----------------------------------------------------------------- name pools ---
const FIRST = ['Lucas','Marco','Diego','Andrés','Mateo','Luka','Iván','Samuel','Noah','Théo','Adam','Sadio','Youssef','Felix','Karim','Bruno','João','Sergio','Carlos','Niklas','Joel','Leon','Pau','Nico','Enzo','Dani','Raphaël','Ousmane','Emil','Mason'];
const LAST  = ['Silva','Fernández','Costa','Moreno','Kovačić','Hansen','Diallo','Romero','López','Schmidt','Rossi','Sánchez','Becker','Vargas','Novak','Persson','Olsen','Mendes','Acosta','Bauer','Lindqvist','Moreau','Greaves','Castillo','Holt','Vidal','Marchand','Nyström','Bauça','Ferri'];
// a few marquee names to seed realism, by nation
const STARS = {
  ARG:[['Lionel','Messi','FWD'],['Lautaro','Martínez','FWD'],['Enzo','Fernández','MID'],['Cristian','Romero','DEF'],['Emiliano','Martínez','GK']],
  MEX:[['Hirving','Lozano','FWD'],['Edson','Álvarez','MID'],['César','Montes','DEF']],
  FRA:[['Kylian','Mbappé','FWD'],['Antoine','Griezmann','MID'],['William','Saliba','DEF'],['Mike','Maignan','GK'],['Aurélien','Tchouaméni','MID']],
  CRO:[['Luka','Modrić','MID'],['Joško','Gvardiol','DEF'],['Andrej','Kramarić','FWD']],
  ENG:[['Harry','Kane','FWD'],['Jude','Bellingham','MID'],['Bukayo','Saka','MID'],['John','Stones','DEF'],['Jordan','Pickford','GK']],
  USA:[['Christian','Pulisic','FWD'],['Weston','McKennie','MID'],['Antonee','Robinson','DEF']],
  BRA:[['Vinícius','Júnior','FWD'],['Rodrygo','Silva','FWD'],['Marquinhos','Aguilar','DEF'],['Alisson','Becker','GK']],
  POR:[['Bruno','Fernandes','MID'],['Rafael','Leão','FWD'],['Rúben','Dias','DEF'],['Diogo','Costa','GK']],
};

// ----------------------------------------------------------------- PRNG ---
function rng(seed){ return function(){ seed|=0; seed=seed+0x6D2B79F5|0; let x=Math.imul(seed^seed>>>15,1|seed); x=x+Math.imul(x^x>>>7,61|x)^x; return ((x^x>>>14)>>>0)/4294967296; }; }

// illustrative point values (SCORING.md TBD) — position-weighted for goals & clean sheets
const PTS = {
  appearance: 2, hour: 1,
  goal: { GK:10, DEF:8, MID:6, FWD:5 },
  assist: 3,
  cleanSheet: { GK:5, DEF:4, MID:1, FWD:0 },
  yellow: -1,
};

// ----------------------------------------------------------------- build the period ---
function buildPeriod(){
  const r = rng(20260603);
  const teamOf = side => MATCHES; // placeholder
  // formations to vary XIs (DEF-MID-FWD), all legal (min 3/2/1)
  const FORMS = [[3,4,3],[4,3,3],[4,4,2],[3,5,2],[4,5,1],[5,3,2]];
  const usedNames = new Set();

  // pools of (match, side) "seats" so every player maps to a real team playing today
  const seats = [];
  MATCHES.forEach(m => { ['home','away'].forEach(side => seats.push({ m, side, nat: side==='home'?m.home:m.away })); });

  // star tracker per nation so we don't reuse a star
  const starIdx = {}; Object.keys(STARS).forEach(k=> starIdx[k]=0);

  function makePlayer(pos, seat){
    // try a star of the right pos for this nation first
    const pool = STARS[seat.nat] || [];
    let first, last;
    for (let k = starIdx[seat.nat]||0; k < pool.length; k++){
      if (pool[k][2] === pos && !usedNames.has(pool[k][0]+pool[k][1])){
        first = pool[k][0]; last = pool[k][1]; starIdx[seat.nat]=k+1; break;
      }
    }
    if (!last){
      let tries=0;
      do { first = FIRST[Math.floor(r()*FIRST.length)]; last = LAST[Math.floor(r()*LAST.length)]; tries++; }
      while (usedNames.has(first+last) && tries<40);
    }
    usedNames.add(first+last);
    return { id:'pl'+(seats.idCounter=(seats.idCounter||0)+1), first, last, pos,
             nat:seat.nat, matchId:seat.m.id, side:seat.side, events:[] };
  }

  // assign each manager an XI; distribute players across slots so everyone has a ytp/live/final mix
  let seatCursor = 0;
  const nextSeatForSlot = (slotPref) => {
    // find a seat in a match of the preferred slot (cycle if needed)
    for (let i=0;i<seats.length;i++){
      const s = seats[(seatCursor+i)%seats.length];
      if (s.m.slot === slotPref){ seatCursor = (seatCursor+i+1)%seats.length; return s; }
    }
    const s = seats[seatCursor%seats.length]; seatCursor++; return s;
  };

  MANAGERS.forEach((m, mi) => {
    const form = FORMS[mi % FORMS.length];
    const need = [['GK',1],['DEF',form[0]],['MID',form[1]],['FWD',form[2]]];
    const xi = [];
    // spread this manager's 11 starters across the 4 slots roughly evenly, offset by manager index
    let slotPick = mi % 4;
    need.forEach(([pos,count]) => {
      for (let c=0;c<count;c++){
        const seat = nextSeatForSlot(slotPick % 4);
        slotPick++;
        xi.push(makePlayer(pos, seat));
      }
    });
    m.xi = xi;
    m.formation = form.join('-');
  });

  // attach baseline appearance + hour events to every starter
  const allPlayers = [];
  MANAGERS.forEach(m => m.xi.forEach(p => allPlayers.push(p)));
  allPlayers.forEach(p => {
    p.events.push({ min:1, type:'appearance', label:'Played', pts:PTS.appearance });
    p.events.push({ min:60, type:'hour', label:'60+ mins', pts:PTS.hour });
  });

  // map each real match goal to a scorer (+assist) among players seated on that side
  MATCHES.forEach(m => {
    m.goals.forEach(g => {
      const cand = allPlayers.filter(p => p.matchId===m.id && p.side===g.side);
      if (!cand.length) return;
      // prefer attackers as scorer
      const att = cand.filter(p=>p.pos==='FWD'||p.pos==='MID');
      const scorer = (att.length?att:cand)[Math.floor(r()*(att.length?att.length:cand.length))];
      scorer.events.push({ min:g.min, type:'goal', label:'Goal', pts:PTS.goal[scorer.pos] });
      g.scorerId = scorer.id;
      // assist from a different teammate (mid/def likelier)
      const rest = cand.filter(p=>p.id!==scorer.id);
      if (rest.length && r()<0.75){
        const a = rest[Math.floor(r()*rest.length)];
        a.events.push({ min:Math.max(1,g.min-1), type:'assist', label:'Assist', pts:PTS.assist });
        g.assistId = a.id;
      }
    });
  });

  // clean sheets: GK/DEF on a side that conceded 0 over the full match → CS event at FT (min 90)
  MATCHES.forEach(m => {
    ['home','away'].forEach(side => {
      const conceded = m.goals.filter(g => g.side !== side).length;
      if (conceded === 0){
        allPlayers.filter(p=>p.matchId===m.id && p.side===side && (p.pos==='GK'||p.pos==='DEF'))
          .forEach(p => p.events.push({ min:90, type:'cs', label:'Clean sheet', pts:PTS.cleanSheet[p.pos] }));
      }
    });
  });

  // a couple of yellow cards for flavor
  const yc = [allPlayers[17], allPlayers[44], allPlayers[91]].filter(Boolean);
  yc.forEach((p,i)=> p.events.push({ min:38+i*7, type:'yellow', label:'Yellow card', pts:PTS.yellow }));

  return MANAGERS;
}

// ----------------------------------------------------------------- live evaluation ---
// player live snapshot at period-minute t
function evalPlayer(p, t){
  const m = MATCHES.find(x=>x.id===p.matchId);
  const st = matchState(m, t);
  let pts = 0; const done = [];
  if (st.phase !== 'ytp'){
    p.events.forEach(e => { if (e.min <= st.min){ pts += e.pts; done.push(e); } });
  }
  return { pts, status:st.phase, matchMin:st.min, match:m, side:p.side, doneEvents:done, st };
}

// manager live snapshot at t
function evalManager(m, t){
  let total = 0, ytp = 0, live = 0, final = 0;
  const rows = m.xi.map(p => {
    const e = evalPlayer(p, t);
    total += e.pts;
    if (e.status==='ytp') ytp++; else if (e.status==='live') live++; else final++;
    return { p, ...e };
  });
  return { id:m.id, total, ytp, live, final, rows };
}

// full field snapshot at t — ranked, with all-play-all provisional record per manager
function evalField(t){
  const snaps = MANAGERS.map(m => evalManager(m, t));
  // provisional all-play-all record for each manager vs every other (by current total)
  snaps.forEach(s => {
    let W=0,L=0,D=0;
    snaps.forEach(o => { if (o.id===s.id) return; if (s.total>o.total) W++; else if (s.total<o.total) L++; else D++; });
    s.rec = { W, L, D };
  });
  // rank by total (desc), stable
  const ranked = [...snaps].sort((a,b)=> b.total - a.total || a.id.localeCompare(b.id));
  ranked.forEach((s,i)=> s.rank = i+1);
  return { snaps, ranked };
}

// chronological scoring feed up to t (newest first), tagged with owning manager
function feedUpTo(t){
  const items = [];
  MANAGERS.forEach(m => m.xi.forEach(p => {
    const match = MATCHES.find(x=>x.id===p.matchId);
    const st = matchState(match, t);
    if (st.phase==='ytp') return;
    p.events.forEach(e => {
      if (e.type==='appearance' || e.type==='hour') return; // keep feed to notable events
      if (e.min <= st.min){
        items.push({ min:e.min, slot:match.slot, type:e.type, label:e.label, pts:e.pts,
          player:p, managerId:m.id, match });
      }
    });
  }));
  // order by absolute period time = ko + min, newest first
  items.sort((a,b)=> (b.match.ko+b.min) - (a.match.ko+a.min));
  return items;
}

// ----------------------------------------------------------------- season (all-play-all power record) ---
// prior completed periods → each manager's points, with W/L/D derived all-play-all per period.
const SEASON_PTS = {
  // managerId : [period1, period2]   (period3 is live, computed from the sim)
  m1:[58,71], m2:[64,52], m3:[49,80], me:[72,61], m5:[55,66], m6:[41,48],
  m7:[68,57], m8:[60,63], m9:[44,55], m10:[51,74], m11:[63,59], m12:[57,46],
};
function recordForPeriod(ptsById){
  const ids = Object.keys(ptsById);
  const rec = {};
  ids.forEach(id => {
    let W=0,L=0,D=0;
    ids.forEach(o => { if (o===id) return; if (ptsById[id]>ptsById[o]) W++; else if (ptsById[id]<ptsById[o]) L++; else D++; });
    rec[id] = {W,L,D};
  });
  return rec;
}

buildPeriod();

Object.assign(window, {
  NATIONS, flagStyle, MANAGERS, ME_ID, mgr,
  MATCHES, SLOTS, MATCH_LEN, PERIOD_END, DEFAULT_MIN, PERIOD,
  matchState, matchScore, evalPlayer, evalManager, evalField, feedUpTo,
  SEASON_PTS, recordForPeriod, PTS,
});
