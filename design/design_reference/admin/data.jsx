// admin/data.jsx — Commissioner / admin model.
// Reuses globals (loaded earlier):
//   MANAGERS, mgr, ME_ID, MATCHES, matchState, PERIOD_END, DEFAULT_MIN, PERIOD
//   SQUAD, SQUAD_BY, player, statusOf, evalSquadPlayer, JERSEY_BG, NATIONS
//   buildStandings, cutContext  ·  cutSchedule, poSeeds, PO_PRESET_LABEL
//
// This is the COMMISSIONER surface: is_commissioner-gated, elevated privileges.
// Every consequential action is auditable; destructive ones are type-to-confirm.
// Scoring VALUES here are illustrative (SCORING.md still not provided) — flagged in-UI.

const IS_COMMISSIONER = true;
const COMMISH_ID = ME_ID;                       // the commissioner is "You" (Cesar)
const commish = mgr(COMMISH_ID);

// short "F. Surname" used across the surface
const admShort = p => `${p.first[0]}. ${p.last}`;

// ----------------------------------------------------------------- league config snapshot ---
// What the commissioner controls. Most are pre-set; the playoff field is the OPEN GAP that gets
// locked at the group→playoff transition (everything provisional until then).
const LEAGUE = {
  name: 'WC Fantasy League',
  managers: MANAGERS.length,                    // variable N
  period: PERIOD,                               // current scoring period
  groupPeriods: 5,                              // # of all-play-all periods feeding seeding (provisional)
};

// ----------------------------------------------------------------- system / ops state ---
// Live data poller. When it goes silent during matches, lock-on-play can't be derived from a feed,
// so the commissioner falls back to SCHEDULED locks (lock at each fixture's kickoff time).
const POLLER = {
  source: 'Opta live feed',
  intervalSec: 30,                              // expected heartbeat
  silentThresholdSec: 120,                      // alert if no beat for this long
};

// operations defaults (the live editing surface mutates copies of these)
const OPS_DEFAULTS = {
  lockFallback: 'auto',     // 'auto' (use live feed) | 'scheduled' (lock at KO time, poller-independent)
  pollerMode:   'live',     // 'live' | 'manual' (commissioner enters stats by hand)
  freeze: {},               // periodId -> true  (a frozen period: lineups locked, scoring paused)
};

// ----------------------------------------------------------------- draft configuration ---
const DRAFT_CFG_DEFAULT = {
  date: '2026-06-08',
  time: '19:00',
  tz: 'CST (league-local)',
  clockSec: 60,             // per-pick clock
  order: 'snake',           // 'snake' | 'linear'
  autopick: true,           // autopick from queue on expiry
  rounds: 15,               // 2 GK / 5 DEF / 5 MID / 3 FWD
  randomizeAt: '24h before',
};

// ----------------------------------------------------------------- stat-correction model ---
// Illustrative scoring (SCORING.md TBD). Position-weighted goals & clean sheets, mirroring the
// values used elsewhere in the app. Each category contributes points via catPts().
const STAT_CATS = [
  { key:'minutes', label:'Minutes',        group:'Appearance',  kind:'minutes', max:120, hint:'≥1′ locks the player' },
  { key:'goals',   label:'Goals',          group:'Attacking',   kind:'count',   max:9 },
  { key:'assists', label:'Assists',        group:'Attacking',   kind:'count',   max:9 },
  { key:'penMiss', label:'Penalty missed', group:'Attacking',   kind:'count',   max:5 },
  { key:'cs',      label:'Clean sheet',    group:'Defending',   kind:'toggle',  posOnly:['GK','DEF','MID'] },
  { key:'saves',   label:'Saves',          group:'Goalkeeping', kind:'count',   max:20, posOnly:['GK'] },
  { key:'penSave', label:'Penalty saved',  group:'Goalkeeping', kind:'count',   max:5,  posOnly:['GK'] },
  { key:'yellow',  label:'Yellow card',    group:'Discipline',  kind:'count',   max:2 },
  { key:'red',     label:'Red card',       group:'Discipline',  kind:'toggle' },
  { key:'og',      label:'Own goal',       group:'Discipline',  kind:'count',   max:3 },
];
const STAT_GROUPS = ['Appearance','Attacking','Defending','Goalkeeping','Discipline'];

const _goalPts = { GK:10, DEF:8, MID:6, FWD:5 };
const _csPts   = { GK:5,  DEF:4, MID:1, FWD:0 };
function catPts(key, v, pos){
  switch(key){
    case 'minutes': return (v>0?2:0) + (v>=60?1:0);
    case 'goals':   return v * (_goalPts[pos]||5);
    case 'assists': return v * 3;
    case 'penMiss': return v * -2;
    case 'cs':      return v ? (_csPts[pos]||0) : 0;
    case 'saves':   return Math.floor(v/3) * 1;      // +1 per 3 saves
    case 'penSave': return v * 5;
    case 'yellow':  return v * -1;
    case 'red':     return v ? -3 : 0;
    case 'og':      return v * -2;
    default: return 0;
  }
}
function linePts(line, pos){
  return STAT_CATS.reduce((s,c)=> s + catPts(c.key, line[c.key]||0, pos), 0);
}
// is a category relevant to this position?
const catApplies = (c, pos) => !c.posOnly || c.posOnly.includes(pos);

// recorded ("as polled") stat line per squad player this period. One authored discrepancy:
// Lautaro (p13) was credited 1 goal but actually scored twice — the demo correction.
const STAT_LINE = {
  p1:{ minutes:90, goals:0, assists:0, cs:0, saves:3, penSave:0, yellow:0, red:0, og:0, penMiss:0 },
  p2:{ minutes:90, goals:0, assists:0, cs:1, saves:5, penSave:1, yellow:0, red:0, og:0, penMiss:0 },
  p3:{ minutes:90, goals:0, assists:0, cs:0, saves:0, penSave:0, yellow:1, red:0, og:0, penMiss:0 },
  p4:{ minutes:90, goals:0, assists:1, cs:1, saves:0, penSave:0, yellow:0, red:0, og:0, penMiss:0 },
  p5:{ minutes:78, goals:0, assists:0, cs:1, saves:0, penSave:0, yellow:0, red:0, og:0, penMiss:0 },
  p6:{ minutes:90, goals:0, assists:0, cs:0, saves:0, penSave:0, yellow:0, red:0, og:0, penMiss:0 },
  p7:{ minutes:64, goals:0, assists:0, cs:0, saves:0, penSave:0, yellow:1, red:0, og:0, penMiss:0 },
  p8:{ minutes:90, goals:1, assists:1, cs:0, saves:0, penSave:0, yellow:0, red:0, og:0, penMiss:0 },
  p9:{ minutes:90, goals:0, assists:1, cs:1, saves:0, penSave:0, yellow:0, red:0, og:0, penMiss:0 },
  p10:{minutes:90, goals:0, assists:0, cs:0, saves:0, penSave:0, yellow:0, red:0, og:0, penMiss:0 },
  p11:{minutes:71, goals:0, assists:0, cs:0, saves:0, penSave:0, yellow:1, red:0, og:0, penMiss:0 },
  p12:{minutes:90, goals:0, assists:1, cs:0, saves:0, penSave:0, yellow:0, red:0, og:0, penMiss:0 },
  p13:{minutes:90, goals:1, assists:0, cs:0, saves:0, penSave:0, yellow:0, red:0, og:0, penMiss:0 }, // ← recorded 1, scored 2
  p14:{minutes:46, goals:0, assists:0, cs:0, saves:0, penSave:0, yellow:0, red:0, og:0, penMiss:0 },
  p15:{minutes:90, goals:1, assists:1, cs:0, saves:0, penSave:0, yellow:0, red:0, og:0, penMiss:0 },
};
const statLine = id => ({ ...(STAT_LINE[id] || { minutes:0, goals:0, assists:0, cs:0, saves:0, penSave:0, yellow:0, red:0, og:0, penMiss:0 }) });

// players the commissioner can correct: the league's owned players. We surface MY squad as the
// editable set (every player league-wide is owned by exactly one manager; the model is identical).
function correctablePlayers(){
  return SQUAD.map(p => ({ ...p, owner: COMMISH_ID }));
}

// the match a squad player belongs to, with its live phase at t (context for a correction)
function playerMatchCtx(id, t){
  const p = SQUAD_BY[id];
  const m = MATCHES.find(x=>x.id===p.matchId);
  const st = matchState(m, t);
  return { m, st, opp: p.side==='home'? m.away : m.home, home: p.side==='home' };
}

// ----------------------------------------------------------------- audit log ---
// Append-only history. Every consequential change lands here with actor + timestamp + reversibility.
// Authored entries are minutes/hours ago; live actions taken in-session prepend with ageMin:0.
const AUDIT_TYPE = {
  stat:     { label:'Stat correction', icon:'edit',   tone:'info'   },
  freeze:   { label:'Period freeze',   icon:'snow',   tone:'warn'   },
  unfreeze: { label:'Period unfrozen', icon:'thaw',   tone:'info'   },
  config:   { label:'Playoff config',  icon:'cut',    tone:'info'   },
  lock:     { label:'Field locked',    icon:'lock',   tone:'danger' },
  fallback: { label:'Lock fallback',   icon:'shield', tone:'warn'   },
  poller:   { label:'Poller',          icon:'pulse',  tone:'warn'   },
  draft:    { label:'Draft config',    icon:'gear',   tone:'info'   },
  override: { label:'Score override',  icon:'edit',   tone:'info'   },
};
const AUDIT_SEED = [
  { id:'a1', type:'stat',     actor:COMMISH_ID, ageMin:7,    title:'Corrected L. Martínez — Goals 1 → 2',
    detail:'Argentina 3–1 Mexico · VAR-awarded 2nd goal not in feed', reason:'Goal credited after VAR review', reversible:true, delta:'+5 pts' },
  { id:'a2', type:'fallback', actor:COMMISH_ID, ageMin:24,   title:'Lock-on-play set to Scheduled',
    detail:'Opta feed latency spike — locks now follow kickoff time', reason:'Feed degraded', reversible:true },
  { id:'a3', type:'poller',   actor:'system',   ageMin:26,   title:'Poller silent for 3m 10s',
    detail:'No heartbeat from Opta live feed during ENG–USA', reason:null, reversible:false },
  { id:'a4', type:'config',   actor:COMMISH_ID, ageMin:140,  title:'Cut schedule set to Taper · 2 → 1',
    detail:'Provisional — field not yet locked', reason:'League vote', reversible:true },
  { id:'a5', type:'unfreeze', actor:COMMISH_ID, ageMin:190,  title:'Matchday 2 unfrozen',
    detail:'Re-opened after correcting a clean-sheet error', reason:'Correction applied', reversible:true },
  { id:'a6', type:'override', actor:COMMISH_ID, ageMin:1450, title:'Adjusted W. Saliba — Clean sheet 0 → 1',
    detail:'France 2–0 Croatia · CS missed by feed', reason:'Manual review', reversible:true, delta:'+4 pts' },
  { id:'a7', type:'draft',    actor:COMMISH_ID, ageMin:4320, title:'Draft clock set to 60s · Snake order',
    detail:'Pre-draft configuration', reason:null, reversible:true },
];

// turn an ageMin into a friendly "x ago"
function agoLabel(min){
  if (min <= 0) return 'just now';
  if (min < 60) return min + 'm ago';
  const h = Math.floor(min/60);
  if (h < 24) return h + 'h ago';
  const d = Math.floor(h/24);
  return d + 'd ago';
}

// ----------------------------------------------------------------- playoff field model ---
// Reuse the SAME model the playoffs screen uses, so the commissioner's lock here is authoritative.
function fieldPlan(field, preset){
  const cuts = cutSchedule(field, preset);
  const seeds = poSeeds(field);
  // simulate the field shrinking round by round to render the bracket shape
  const rounds = [];
  let alive = field;
  cuts.forEach((c, i) => {
    rounds.push({ idx:i, enters:alive, cut:c, survives:Math.max(1, alive - c) });
    alive = Math.max(1, alive - c);
  });
  return { cuts, seeds, rounds, totalRounds:cuts.length };
}

Object.assign(window, {
  IS_COMMISSIONER, COMMISH_ID, commish, admShort,
  LEAGUE, POLLER, OPS_DEFAULTS, DRAFT_CFG_DEFAULT,
  STAT_CATS, STAT_GROUPS, catPts, linePts, catApplies, STAT_LINE, statLine,
  correctablePlayers, playerMatchCtx,
  AUDIT_TYPE, AUDIT_SEED, agoLabel,
  fieldPlan,
});
