// boxscore/data.jsx — Player detail / box-score model (~25 categories).
// Reuses globals: SQUAD, player, evalSquadPlayer, statusOf, MATCHES, matchScore,
//   matchState, NATIONS, JERSEY_BG, playerFixture, seasonPts, acqLabel.
//
// HONESTY CONTRACT (SCORING.md not provided):
//  • The hero PERIOD total = evalSquadPlayer().pts  → identical to the ScorePill everywhere else.
//  • The hero SEASON total  = seasonPts()           → identical to the roster's season figure.
//  • The breakdown's "Pts" column carries period points ONLY for the categories we can score
//    from the canonical live events (minutes / goals / assists / clean sheet / cards) — so the
//    column SUMS to the hero total. Every other category is shown as a tracked STAT (period +
//    season counts) with "—" points, flagged: final per-category values live in SCORING.md.

// ----------------------------------------------------------------- category catalog ---
const BOX_GROUPS = ['Attacking','Defending','Discipline','Goalkeeping','Bonus'];
// pos: 'all' or array of positions the stat is shown for. scoring: contributes to the canonical total.
const CATS = [
  // Attacking
  { k:'goals',        g:'Attacking',   label:'Goals',                 pos:'all',                 scoring:true },
  { k:'assists',      g:'Attacking',   label:'Assists',               pos:'all',                 scoring:true },
  { k:'shots_ot',     g:'Attacking',   label:'Shots on target',       pos:'all' },
  { k:'big_chances',  g:'Attacking',   label:'Big chances created',   pos:'all' },
  { k:'key_passes',   g:'Attacking',   label:'Key passes',            pos:'all' },
  { k:'dribbles',     g:'Attacking',   label:'Successful dribbles',   pos:'all' },
  { k:'pens_won',     g:'Attacking',   label:'Penalties won',         pos:'all' },
  // Defending
  { k:'clean_sheet',  g:'Defending',   label:'Clean sheet',           pos:['GK','DEF','MID'],    scoring:true },
  { k:'tackles',      g:'Defending',   label:'Tackles won',           pos:'all' },
  { k:'interceptions',g:'Defending',   label:'Interceptions',         pos:'all' },
  { k:'clearances',   g:'Defending',   label:'Clearances',            pos:['GK','DEF','MID'] },
  { k:'blocks',       g:'Defending',   label:'Blocks',                pos:['DEF','MID'] },
  { k:'recoveries',   g:'Defending',   label:'Ball recoveries',       pos:'all' },
  { k:'aerials',      g:'Defending',   label:'Aerial duels won',      pos:'all' },
  { k:'goals_conceded',g:'Defending',  label:'Goals conceded',        pos:['GK','DEF'], neg:true },
  // Discipline
  { k:'yellow',       g:'Discipline',  label:'Yellow card',           pos:'all', neg:true,       scoring:true },
  { k:'red',          g:'Discipline',  label:'Red card',              pos:'all', neg:true },
  { k:'fouls',        g:'Discipline',  label:'Fouls conceded',        pos:'all', neg:true },
  { k:'own_goals',    g:'Discipline',  label:'Own goals',             pos:'all', neg:true },
  // Goalkeeping
  { k:'saves',        g:'Goalkeeping', label:'Saves',                 pos:['GK'] },
  { k:'pen_saved',    g:'Goalkeeping', label:'Penalties saved',       pos:['GK'] },
  { k:'high_claims',  g:'Goalkeeping', label:'High claims',           pos:['GK'] },
  { k:'sweeper',      g:'Goalkeeping', label:'Sweeper clearances',    pos:['GK'] },
  // Bonus
  { k:'minutes',      g:'Bonus',       label:'Minutes played',        pos:'all', scoring:true, unit:"'" },
  { k:'rating',       g:'Bonus',       label:'Match rating',          pos:'all', deci:true },
  { k:'motm',         g:'Bonus',       label:'Star man',              pos:'all' },
];
const catApplies = (cat, pos) => cat.pos==='all' || cat.pos.includes(pos);

// ----------------------------------------------------------------- deterministic noise ---
function bxHash(s){ let h=2166136261; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619);} return h>>>0; }
function bxRng(seed){ return function(){ seed|=0; seed=seed+0x6D2B79F5|0; let x=Math.imul(seed^seed>>>15,1|seed); x=x+Math.imul(x^x>>>7,61|x)^x; return ((x^x>>>14)>>>0)/4294967296; }; }
const ri = (r,a,b)=> a + Math.floor(r()*(b-a+1));

// per-player FULL-MATCH stat profile (the 90' totals); period counts scale by minutes played
function fullProfile(id){
  const p = player(id); const r = bxRng(bxHash(id));
  const atk = p.pos==='FWD'?1.3 : p.pos==='MID'?1.0 : 0.4;
  const def = p.pos==='DEF'?1.3 : p.pos==='MID'?0.9 : p.pos==='GK'?0.5 : 0.4;
  return {
    shots_ot:   Math.round(ri(r,0,4)*atk),
    big_chances:Math.round(ri(r,0,3)*atk),
    key_passes: Math.round(ri(r,0,4)*Math.max(.5,atk)),
    dribbles:   Math.round(ri(r,0,5)*atk),
    pens_won:   r()<0.12?1:0,
    tackles:    Math.round(ri(r,0,5)*def),
    interceptions:Math.round(ri(r,0,4)*def),
    clearances: Math.round(ri(r,0,6)*def),
    blocks:     Math.round(ri(r,0,2)*def),
    recoveries: Math.round(ri(r,3,9)),
    aerials:    Math.round(ri(r,0,5)*Math.max(.4,def)),
    fouls:      ri(r,0,2),
    saves:      p.pos==='GK'?ri(r,1,6):0,
    high_claims:p.pos==='GK'?ri(r,0,4):0,
    sweeper:    p.pos==='GK'?ri(r,0,3):0,
  };
}

// ----------------------------------------------------------------- season totals ---
function seasonStats(id){
  const p = player(id); const r = bxRng(bxHash(id+'szn')); const f = fullProfile(id);
  const games = ri(r,4,6);
  const scale = (n)=> Math.round(n*games*(0.7+r()*0.6));
  const goals  = p.pos==='FWD'?ri(r,1,6): p.pos==='MID'?ri(r,0,4): p.pos==='GK'?0:ri(r,0,2);
  const assists= p.pos==='GK'?0:ri(r,0,5);
  return {
    games,
    goals, assists,
    shots_ot:scale(f.shots_ot), big_chances:scale(f.big_chances), key_passes:scale(f.key_passes),
    dribbles:scale(f.dribbles), pens_won:r()<0.4?1:0,
    clean_sheet:ri(r,0,games), tackles:scale(f.tackles), interceptions:scale(f.interceptions),
    clearances:scale(f.clearances), blocks:scale(f.blocks), recoveries:scale(f.recoveries),
    aerials:scale(f.aerials), goals_conceded:p.pos==='GK'||p.pos==='DEF'?ri(r,2,8):0,
    yellow:ri(r,0,3), red:r()<0.08?1:0, fouls:scale(f.fouls), own_goals:0,
    saves:scale(f.saves), pen_saved:p.pos==='GK'&&r()<0.4?1:0, high_claims:scale(f.high_claims), sweeper:scale(f.sweeper),
    minutes:games*ri(r,70,90), rating:(6.4+r()*1.0), motm:ri(r,0,2),
  };
}

// ----------------------------------------------------------------- this-period box ---
function boxData(id, t){
  const p = player(id);
  const e = evalSquadPlayer(id, t);             // canonical live snapshot
  const played = e.status!=='movable';
  const fx = playerFixture(id);
  const sc = matchScore(fx.m, t);
  const minutes = !played ? 0 : (e.phase==='final' ? 90 : e.min);
  const minFrac = Math.min(1, minutes/90);
  const f = fullProfile(id);
  const r = bxRng(bxHash(id+'period'));

  // canonical period points by category (sums to e.pts)
  const periodPts = { minutes:0, goals:0, assists:0, clean_sheet:0, yellow:0 };
  let goalsC=0, assistC=0, csC=0, ycC=0;
  e.done.forEach(ev=>{
    if (ev.type==='appearance'||ev.type==='hour') periodPts.minutes += ev.pts;
    else if (ev.type==='goal'){ goalsC++; periodPts.goals += ev.pts; }
    else if (ev.type==='assist'){ assistC++; periodPts.assists += ev.pts; }
    else if (ev.type==='cs'){ csC=1; periodPts.clean_sheet += ev.pts; }
    else if (ev.type==='yellow'){ ycC++; periodPts.yellow += ev.pts; }
  });
  const concededNow = played ? (fx.home ? sc.a : sc.h) : 0;
  const sp = (n)=> played ? Math.round(n*minFrac) : 0;

  const period = {
    goals:goalsC, assists:assistC, clean_sheet: (played && e.phase==='final' && concededNow===0)?1:csC,
    shots_ot:sp(f.shots_ot)+ (goalsC), big_chances:sp(f.big_chances), key_passes:sp(f.key_passes)+assistC,
    dribbles:sp(f.dribbles), pens_won:0,
    tackles:sp(f.tackles), interceptions:sp(f.interceptions), clearances:sp(f.clearances),
    blocks:sp(f.blocks), recoveries:sp(f.recoveries), aerials:sp(f.aerials), goals_conceded:concededNow,
    yellow:ycC, red:0, fouls:sp(f.fouls), own_goals:0,
    saves:sp(f.saves), pen_saved:0, high_claims:sp(f.high_claims), sweeper:sp(f.sweeper),
    minutes, rating: played ? Math.min(9.8, 6.2 + goalsC*0.7 + assistC*0.4 + (csC?0.3:0) + minFrac*0.6 + r()*0.5).toFixed(1) : null,
    motm: 0,
  };
  const season = seasonStats(id);

  const rows = CATS.filter(c=>catApplies(c,p.pos)).map(c=>({
    cat:c,
    period: period[c.k],
    pts: (c.k in periodPts) ? periodPts[c.k] : null,
    season: season[c.k],
  }));

  return {
    p, e, status:e.status, played, match:fx.m, opp:fx.opp, home:fx.home, sc,
    minLabel: e.phase==='final'?'FT' : played ? minutes+"'" : 'KO',
    periodTotal: e.pts, seasonTotal: seasonPts(id),
    headline: {
      minutes, minutesSzn: season.minutes,
      rating: period.rating, ratingSzn: season.rating.toFixed(1),
      goals: goalsC, goalsSzn: season.goals,
      assists: assistC, assistsSzn: season.assists,
      cs: period.clean_sheet, csSzn: season.clean_sheet,
      saves: period.saves, savesSzn: season.saves,
    },
    rows,
    form: boxForm(id, e),
    log: boxLog(id, t),
  };
}

// season form: points per scoring period (ends at current live period total)
function boxForm(id, e){
  const r = bxRng(bxHash(id+'form'));
  const base = Math.max(8, Math.round(seasonPts(id)/5));
  const arr = [];
  for (let i=1;i<=4;i++) arr.push({ label:'MD'+i, pts: Math.max(0, base + ri(r,-6,10)) });
  arr.push({ label:'MD5', pts: e.pts, live:true });
  return arr;
}
// recent match log
function boxLog(id, t){
  const p = player(id); const r = bxRng(bxHash(id+'log'));
  const opps = ['MEX','CRO','USA','POR','GHA','JPN','NED','KSA'];
  const cur = boxData_lite(id, t);
  const rows = [];
  for (let i=0;i<4;i++){
    const gf=ri(r,0,3), ga=ri(r,0,2);
    rows.push({ md:'MD'+(4-i), opp:opps[ri(r,0,opps.length-1)], home:r()<0.5, gf, ga,
      res: gf>ga?'W':gf<ga?'L':'D', pts: Math.max(-2, ri(r,1,4)+ (p.pos==='FWD'?ri(r,0,8):ri(r,0,5))) });
  }
  return [{ md:'MD5', opp:cur.opp, home:cur.home, gf:cur.gf, ga:cur.ga, res:cur.res, pts:cur.pts, live:cur.live }, ...rows];
}
function boxData_lite(id, t){
  const e = evalSquadPlayer(id, t); const fx = playerFixture(id); const sc = matchScore(fx.m, t);
  const gf = fx.home?sc.h:sc.a, ga = fx.home?sc.a:sc.h;
  return { opp:fx.opp, home:fx.home, gf, ga, res: gf>ga?'W':gf<ga?'L':'D', pts:e.pts, live:e.status==='live' };
}

Object.assign(window, {
  BOX_GROUPS, CATS, catApplies, boxData, seasonStats, fullProfile,
});
