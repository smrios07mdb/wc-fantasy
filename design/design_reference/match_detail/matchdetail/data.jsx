// matchdetail/data.jsx — the rich MATCH DETAIL model for one fixture: Spain 3–0 Saudi Arabia
// (the live Group-H match the user clicks from the dashboard). Self-contained but reuses the
// loaded foundations: NATIONS / JERSEY_BG / FLAG_NAMES (kits + flags), MANAGERS / mgr / ME_ID
// (the league, for the FANTASY ownership lens woven through every player), and PTS (illustrative
// fantasy scoring). Everything derives from ONE match clock `t` (match-minutes 0..FT) so the
// whole screen animates live → final from the presenter sim bar.
//
// TWO LENSES, ALWAYS LABELLED:
//   • RATING  — the 0–10 performance score (real-match), shown in a coloured square.   "Rating"
//   • FANTASY — league points this player earns + which manager owns him.               accent / "Fantasy"
//   These are different numbers and the UI never blurs them.

const MD_FT = 96;                 // full-time minute (90 + stoppage)
const MD_HT = 48;                 // half-time minute (45 + stoppage)
const MD_DEFAULT_MIN = 32;        // start mid-first-half: 3–0, all goals in, match live
const MD_TEAM_COLOR = { home:'#3FA6B5', away:'#A98BD8' }; // two neutral data hues (not accent, not functional)

// ----------------------------------------------------------------- fantasy scoring ---
// reuse the position-weighted illustrative PTS scale from vsfield/data.jsx
function mdEvPts(type, pos){
  const P = window.PTS;
  if (type==='appearance') return P.appearance;
  if (type==='hour')       return P.hour;
  if (type==='goal')       return P.goal[pos];
  if (type==='assist')     return P.assist;
  if (type==='cs')         return P.cleanSheet[pos];
  if (type==='yellow')     return P.yellow;
  return 0;
}
const MD_EVLABEL = { appearance:'Played', hour:'60+ minutes', goal:'Goal', assist:'Assist', cs:'Clean sheet', yellow:'Yellow card' };

// ----------------------------------------------------------------- the two squads ---
// p() builds a player. fe = fantasy events [{min,type}] (appearance/hour added automatically
// unless subbed early). owner = league managerId (fantasy ownership) | null (free agent).
// benchedBy = owned but sitting on that manager's bench → scores 0 to his XI (lock-on-play nuance).
function mdPlayer(num, first, last, pos, rating, st, opts={}){
  return {
    id:'md_'+(opts.code||'')+num, num, first, last, pos, rating,
    cap:!!opts.cap, owner:opts.owner||null, benchedBy:opts.benchedBy||null,
    subOff:opts.subOff||null, subOn:opts.subOn||null,   // minute a sub leaves / enters
    fe:opts.fe||[], st:st,                               // st = final match statline
  };
}

// statline shorthand: [goals, assists, shots, sot, keyPass, passes, passAcc, touches, duelsWon, duels, tackles, drib, fouls, fouled, off, recov, saves]
function S(a){ const k=['goals','assists','shots','sot','keyPass','passes','passAcc','touches','duelsWon','duels','tackles','drib','fouls','fouled','off','recov','saves']; const o={}; k.forEach((kk,i)=>o[kk]=a[i]==null?0:a[i]); return o; }

// —— SPAIN (4-3-3) — kept a clean sheet, scored 3 ——
const ESP_XI = [
  mdPlayer(23,'Unai','Simón','GK',6.7, S([0,0,0,0,0,28,86,34,1,1,0,0,0,0,0,2,3]),  {code:'E', owner:'m5', benchedBy:'m5', fe:[{min:90,type:'cs'}]}),
  mdPlayer(12,'Pedro','Porro','DEF',7.0, S([0,0,1,0,2,71,91,89,5,8,2,1,1,0,0,5]),   {code:'E', fe:[{min:90,type:'cs'}]}),
  mdPlayer(14,'Aymeric','Laporte','DEF',7.5, S([0,1,0,0,1,93,96,101,4,5,1,0,0,1,0,7]),{code:'E', owner:'m7', fe:[{min:21,type:'assist'},{min:90,type:'cs'}]}),
  mdPlayer(22,'Pau','Cubarsí','DEF',6.6, S([0,0,0,0,0,88,95,96,3,4,2,0,1,0,0,6]),    {code:'E', owner:'me', fe:[{min:90,type:'cs'}]}),
  mdPlayer(2,'Marc','Cucurella','DEF',8.6, S([0,0,2,1,3,79,93,98,9,12,3,2,0,2,0,6]), {code:'E', owner:'m2', fe:[{min:90,type:'cs'}]}),
  mdPlayer(16,'Rodri','','MID',6.9, S([0,0,1,0,1,96,94,108,6,9,3,1,2,1,0,7]),        {code:'E', cap:true, owner:'m8', fe:[]}),
  mdPlayer(20,'Pedri','','MID',6.8, S([0,0,1,1,2,84,92,97,5,7,1,3,1,2,0,4]),         {code:'E', owner:'m7', benchedBy:'m7', fe:[]}),
  mdPlayer(15,'Alex','Baena','MID',6.8, S([0,0,2,0,3,61,89,74,3,6,1,2,1,1,1,3], ),   {code:'E', subOff:68, fe:[]}),
  mdPlayer(19,'Lamine','Yamal','FWD',7.6, S([1,0,4,2,3,46,84,71,6,11,0,4,2,4,1,2]),  {code:'E', owner:'me', fe:[{min:11,type:'goal'}]}),
  mdPlayer(21,'Mikel','Oyarzabal','FWD',9.6, S([2,1,5,4,2,38,88,64,7,10,1,2,0,3,1,2]),{code:'E', owner:'m3', fe:[{min:11,type:'assist'},{min:21,type:'goal'},{min:24,type:'goal'}]}),
  mdPlayer(10,'Dani','Olmo','FWD',7.4, S([0,1,3,1,4,52,86,73,4,8,0,3,1,2,0,3]),      {code:'E', owner:'m11', fe:[{min:24,type:'assist'}]}),
];
const ESP_BENCH = [
  mdPlayer(1,'David','Raya','GK',null, S([]),     {code:'E', owner:'m7', benchedBy:'m7'}),
  mdPlayer(7,'Ferran','Torres','FWD',6.9, S([0,0,1,1,1,18,90,24,2,3,0,1,0,1,0,1]), {code:'E', subOn:68}),
  mdPlayer(8,'Fabián','Ruiz','MID',null, S([])),
  mdPlayer(5,'Eric','García','DEF',null, S([])),
  mdPlayer(9,'Álvaro','Morata','FWD',null, S([]), {code:'E', owner:'m12', benchedBy:'m12'}),
];
const ESP = { code:'ESP', name:'Spain', formation:'4-3-3', coach:'Luis de la Fuente', side:'home', xi:ESP_XI, bench:ESP_BENCH };

// —— SAUDI ARABIA (5-4-1) — conceded 3 ——
const KSA_XI = [
  mdPlayer(21,'Mohammed','Al-Owais','GK',5.9, S([0,0,0,0,0,22,71,30,1,2,0,0,0,0,0,1,5]), {code:'S', owner:'m12', benchedBy:'m12'}),
  mdPlayer(12,'Saud','Abdulhamid','DEF',5.8, S([0,0,0,0,1,41,82,58,4,9,1,1,2,0,0,4]),    {code:'S'}),
  mdPlayer(4,'Abdulelah','Al-Amri','DEF',5.8, S([0,0,0,0,0,48,84,63,3,8,2,0,1,0,0,6]),   {code:'S'}),
  mdPlayer(3,'Ali','Lajami','DEF',6.1, S([0,0,0,0,0,45,80,60,5,10,3,0,2,0,0,7]),         {code:'S'}),
  mdPlayer(5,'Hassan','Altambakti','DEF',6.2, S([0,0,1,0,0,44,83,61,6,11,2,0,1,1,0,8]),  {code:'S'}),
  mdPlayer(24,'Moteb','Al-Harbi','DEF',5.7, S([0,0,0,0,0,38,79,52,3,9,1,0,2,0,0,5]),     {code:'S', subOff:74}),
  mdPlayer(7,'Musab','Al-Juwayr','MID',5.1, S([0,0,0,0,1,36,77,49,2,7,1,1,1,0,0,3]),     {code:'S', subOff:62}),
  mdPlayer(15,'Abdullah','Al-Khaibari','MID',6.2, S([0,0,1,0,2,52,85,66,5,8,2,1,1,1,0,5]),{code:'S', owner:'me'}),
  mdPlayer(6,'Nasser','Al-Dawsari','MID',6.2, S([0,0,1,1,1,49,83,63,4,7,1,2,0,1,0,4]),   {code:'S'}),
  mdPlayer(10,'Salem','Al-Dawsari','MID',6.2, S([0,0,2,1,2,44,81,61,3,9,0,3,2,2,1,3]),   {code:'S', cap:true, owner:'m6', fe:[{min:30,type:'yellow'}]}),
  mdPlayer(9,'Firas','Al-Buraikan','FWD',6.0, S([0,0,2,0,1,21,74,38,5,12,0,1,1,2,2,2]),  {code:'S', subOff:80}),
];
const KSA_BENCH = [
  mdPlayer(1,'Nawaf','Al-Aqidi','GK',null, S([]),     {code:'S'}),
  mdPlayer(8,'Abdullah','Otayf','MID',5.9, S([0,0,0,0,0,28,86,37,2,4,1,0,1,0,0,3]),  {code:'S', subOn:62}),
  mdPlayer(18,'Nawaf','Al-Abed','MID',6.0, S([0,0,1,0,1,16,82,22,1,3,0,1,0,1,0,2]), {code:'S', subOn:74}),
  mdPlayer(11,'Saleh','Al-Shehri','FWD',5.8, S([0,0,1,0,0,9,78,15,1,4,0,0,0,1,1,1]),{code:'S', subOn:80}),
  mdPlayer(20,'Firas','Al-Ghannam','FWD',null, S([])),
];
const KSA = { code:'KSA', name:'Saudi Arabia', formation:'5-4-1', coach:'Hervé Renard', side:'away', xi:KSA_XI, bench:KSA_BENCH };

// ----------------------------------------------------------------- the match ---
// timeline events (min, type, side, ...). Goal events name scorer/assist by player num+side.
const MD_EVENTS = [
  { min:0,  type:'ko',   label:'Kick-off' },
  { min:11, type:'goal', side:'home', scorer:[19], assist:[21] },
  { min:21, type:'goal', side:'home', scorer:[21], assist:[14] },
  { min:24, type:'var',  side:'home', label:'VAR — goal checked & confirmed', note:'Offside review' },
  { min:24, type:'goal', side:'home', scorer:[21], assist:[10] },
  { min:30, type:'yellow', side:'away', player:[10], reason:'Foul' },
  { min:MD_HT, type:'ht', label:'Half-time', hs:3, as:0 },
  { min:46, type:'ko2', label:'Second half' },
  { min:62, type:'sub', side:'away', off:[7], on:[8] },
  { min:68, type:'sub', side:'home', off:[15], on:[7] },
  { min:74, type:'sub', side:'away', off:[24], on:[18] },
  { min:80, type:'sub', side:'away', off:[9], on:[11] },
  { min:MD_FT, type:'ft', label:'Full-time', hs:3, as:0 },
];

// match-stats: counting totals for FULL match + 1st half. ratios (poss / accuracy) are %s.
// [poss, xg, bigCh, shots, sot, blocked, woodwork, saves, corners, fouls, offsides, throwins,
//  freekicks, yellow, passes, accPasses, accPct, tackles, dribbles, duelsWonPct]
const MD_STAT_KEYS = ['poss','xg','bigCh','shots','sot','blocked','woodwork','saves','corners','fouls','offsides','passes','accPct','tackles','interc','clear','duelPct','yellow'];
const MD_STATS = {
  all: {
    home: [74, 2.64, 4, 18, 8, 3, 1, 0, 7, 6, 2, 612, 91, 14, 9, 12, 58, 0],
    away: [26, 0.18, 0, 5, 1, 1, 0, 6, 1, 11, 1, 214, 79, 21, 6, 28, 42, 1],
  },
  first: {
    home: [76, 1.64, 3, 12, 6, 2, 0, 0, 4, 3, 1, 318, 92, 7, 5, 6, 61, 0],
    away: [24, 0.04, 0, 3, 1, 0, 0, 4, 1, 6, 1, 104, 80, 12, 3, 15, 39, 1],
  },
};
const MD_STAT_META = {
  poss:{label:'Ball possession', pct:true}, xg:{label:'Expected goals (xG)', dec:true, info:true},
  bigCh:{label:'Big chances'}, shots:{label:'Total shots'}, sot:{label:'Shots on target'},
  blocked:{label:'Blocked shots'}, woodwork:{label:'Hit woodwork'}, saves:{label:'Goalkeeper saves'},
  corners:{label:'Corner kicks'}, fouls:{label:'Fouls'}, offsides:{label:'Offsides'},
  passes:{label:'Passes'}, accPct:{label:'Accurate passes', pct:true}, tackles:{label:'Tackles'},
  interc:{label:'Interceptions'}, clear:{label:'Clearances'}, duelPct:{label:'Duels won', pct:true},
  yellow:{label:'Yellow cards'},
};
// which stats are "higher is better" for the leading-side highlight (most are; some are neutral)
const MD_STAT_NEUTRAL = new Set(['fouls','offsides','yellow','saves']);

// group table (Group H) — Spain & Saudi are in this match; others contextual
const MD_GROUP = {
  name:'Group H',
  rows:[
    { code:'ESP', name:'Spain',        p:2, w:1, d:1, l:0, gf:3, ga:0, last:['D','W'], inMatch:true },
    { code:'URU', name:'Uruguay',      p:1, w:0, d:1, l:0, gf:1, ga:1, last:['D'] },
    { code:'CPV', name:'Cape Verde',   p:1, w:0, d:1, l:0, gf:0, ga:0, last:['D'] },
    { code:'KSA', name:'Saudi Arabia', p:2, w:0, d:1, l:1, gf:1, ga:4, last:['D','L'], inMatch:true },
  ],
};
// Cape Verde isn't in the kit library — give it a flag so the table renders
if (!window.NATIONS) window.NATIONS = {};
if (!NATIONS.CPV) NATIONS.CPV = { n:'Cape Verde', f:'linear-gradient(180deg,#003893 0 28%,#fff 28% 36%,#003893 36% 44%,#fff 44% 60%,#003893 60% 68%,#fff 68% 76%,#003893 76%)' };
if (!NATIONS.URU) NATIONS.URU = NATIONS.URU || { n:'Uruguay', f:(window.JERSEY_BG&&JERSEY_BG.URU)||'#fff' };

const MD_MATCH = {
  comp:'FIFA World Cup', stage:'Group H · Round 2', round:'MD2',
  venue:'Mercedes-Benz Stadium', city:'Atlanta', country:'USA',
  date:'Sun 21 Jun 2026', ko:'16:00', tv:'Fox',
  home:ESP, away:KSA, events:MD_EVENTS, stats:MD_STATS, group:MD_GROUP,
};

// ----------------------------------------------------------------- live derivation ---
// a player is "on the pitch" between his entry (0 or subOn) and exit (subOff or FT)
function mdOnPitch(p, t){
  const inAt = p.subOn!=null ? p.subOn : 0;
  const outAt = p.subOff!=null ? p.subOff : MD_FT;
  return t>=inAt && t<=Math.min(outAt, MD_FT) ? true : (t>inAt);
}
// has the player appeared at all by t?
function mdAppeared(p, t){ const inAt = p.subOn!=null ? p.subOn : 0; return t>=inAt; }

// live rating: eases from 6.7 toward his final rating across his minutes; blank until ~10'
function mdRating(p, t){
  if (p.rating==null) return null;
  const inAt = p.subOn!=null ? p.subOn : 0;
  const since = t - inAt;
  if (since < 8) return null;                       // not enough on-ball data yet
  const span = (p.subOff!=null?p.subOff:MD_FT) - inAt;
  const prog = Math.max(0, Math.min(1, since/Math.max(20, span)));
  const r = 6.7 + (p.rating - 6.7) * (0.45 + 0.55*prog);  // converge to final by end
  return Math.round(r*10)/10;
}
// fantasy points for a player at t (from his fantasy events; appearance@in, hour@60 auto)
function mdFantasy(p, t){
  if (!mdAppeared(p, t)) return { pts:0, done:[], live:false, played:false };
  const inAt = p.subOn!=null ? p.subOn : 0;
  const outAt = p.subOff!=null ? p.subOff : MD_FT;
  const evs = [{min:inAt||1, type:'appearance'}];
  if (outAt - inAt >= 60 || (p.subOff==null && t>=60 && inAt<=1)) {
    if (t>=60 && inAt<=1) evs.push({min:60, type:'hour'});
  }
  (p.fe||[]).forEach(e=>evs.push(e));
  let pts=0; const done=[];
  evs.forEach(e=>{ if (e.min<=t){ const v=mdEvPts(e.type, p.pos); pts+=v; done.push({min:e.min, type:e.type, label:MD_EVLABEL[e.type], pts:v}); } });
  done.sort((a,b)=>a.min-b.min);
  const ended = t >= outAt;
  return { pts, done, live: mdAppeared(p,t) && !ended, played: ended };
}
// score at t
function mdScore(t){
  let h=0,a=0;
  MD_EVENTS.forEach(e=>{ if (e.type==='goal' && e.min<=t){ e.side==='home'?h++:a++; } });
  return { h, a };
}
// match phase at t
function mdPhase(t){
  if (t<=0) return { key:'pre', label:'Kick-off', clock:'KO' };
  if (t>=MD_FT) return { key:'ft', label:'Full-time', clock:'FT' };
  if (t>45 && t<46) return { key:'ht', label:'Half-time', clock:'HT' };
  const disp = t>45 ? Math.min(90, t-1) : Math.min(45, t);
  const stop = (t>45 && t<48) ? "45+"+(t-45) : (t>90 ? "90+"+(t-90) : null);
  return { key:'live', label:'Live', clock:(stop||disp)+"'", min:t };
}
// events up to t (with live flag for the freshest)
function mdEventsUpTo(t){ return MD_EVENTS.filter(e=> e.min<=t); }

// live match-stats at t. ratios stay ~constant; counts scale by progress (illustrative).
function mdLiveStats(t, half){
  const src = half==='first' ? MD_STATS.first : MD_STATS.all;
  if (half==='first') return src; // fixed once HT reached (gated in UI)
  const prog = Math.max(0.04, Math.min(1, t/ (MD_FT-2)));
  const scale = (key, v)=> (MD_STAT_META[key]&&(MD_STAT_META[key].pct||MD_STAT_META[key].dec)) ? v : Math.round(v*prog);
  const map = arr => arr.map((v,i)=> scale(MD_STAT_KEYS[i], v));
  // xG should still grow; scale it too
  const homeArr = src.home.map((v,i)=> MD_STAT_KEYS[i]==='xg' ? Math.round(v*prog*100)/100 : scale(MD_STAT_KEYS[i], v));
  const awayArr = src.away.map((v,i)=> MD_STAT_KEYS[i]==='xg' ? Math.round(v*prog*100)/100 : scale(MD_STAT_KEYS[i], v));
  return { home:homeArr, away:awayArr };
}
function mdStatVal(arr, key){ return arr[MD_STAT_KEYS.indexOf(key)]; }

// ratings board: every player who has a rating at t, both teams, ranked desc
function mdRatingsBoard(t){
  const all = [];
  [MD_MATCH.home, MD_MATCH.away].forEach(team=>{
    [...team.xi, ...team.bench].forEach(p=>{
      const r = mdRating(p, t);
      if (r!=null) all.push({ p, team, rating:r, fantasy:mdFantasy(p,t) });
    });
  });
  all.sort((a,b)=> b.rating-a.rating);
  return all;
}
// team average rating at t
function mdTeamRating(team, t){
  const rs = team.xi.map(p=>mdRating(p,t)).filter(r=>r!=null);
  if (!rs.length) return null;
  return Math.round(rs.reduce((s,r)=>s+r,0)/rs.length*100)/100;
}
// how many of the league's XIs this match feeds (woven fantasy header stat)
function mdLeagueExposure(t){
  const owners = new Set();
  let started=0, benched=0, mine=null;
  [MD_MATCH.home, MD_MATCH.away].forEach(team=> team.xi.concat(team.bench).forEach(p=>{
    if (!p.owner) return;
    owners.add(p.owner);
    if (p.benchedBy) benched++; else started++;
    if (p.owner===ME_ID){ const f=mdFantasy(p,t); mine = { p, f }; }
  }));
  return { managers:owners.size, started, benched, mine };
}

// the manager's OWN players in this match — the personal stake (sorted by points)
function mdMyStake(t){
  const mine = [];
  [MD_MATCH.home, MD_MATCH.away].forEach(team=> team.xi.concat(team.bench).forEach(p=>{
    if (p.owner!==ME_ID) return;
    mine.push({ p, team, f:mdFantasy(p,t), benched:!!p.benchedBy, onPitch:mdAppeared(p,t) });
  }));
  mine.sort((a,b)=> b.f.pts-a.f.pts);
  return { players:mine, total:mine.reduce((s,m)=>s+m.f.pts,0) };
}

Object.assign(window, {
  MD_FT, MD_HT, MD_DEFAULT_MIN, MD_TEAM_COLOR, MD_MATCH, MD_EVENTS,
  MD_STAT_KEYS, MD_STAT_META, MD_STAT_NEUTRAL, MD_GROUP,
  mdOnPitch, mdAppeared, mdRating, mdFantasy, mdScore, mdPhase, mdEventsUpTo,
  mdLiveStats, mdStatVal, mdRatingsBoard, mdTeamRating, mdLeagueExposure, mdMyStake, mdEvPts, MD_EVLABEL,
});
