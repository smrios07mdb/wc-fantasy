// matchdetail/components.jsx — shared atoms for the Match Detail surface.
// Reuses vsfield atoms (Flag, Pos, Avatar, ScoreBreakdown, mgr) + setlineup JERSEY_BG.
// Two clearly-separated lenses: RATING (coloured square, real-match) and FANTASY (accent, league).
const { useState:mdUseState, useRef:mdUseRef, useEffect:mdUseEffect } = React;

// ----------------------------------------------------------------- rating ---
function mdRatingColor(r){
  if (r==null) return 'var(--surface-4)';
  if (r>=8.0) return '#1F9E63';
  if (r>=7.0) return '#46A05A';
  if (r>=6.5) return '#7C9B3E';
  if (r>=6.0) return '#C7913A';
  return '#D2544F';
}
function RatingBadge({ r, size='md' }){
  if (r==null) return <span className={'md-rate md-rate-na md-rate-'+size}>–</span>;
  return <span className={'md-rate md-rate-'+size} style={{ background:mdRatingColor(r) }}>{r.toFixed(1)}</span>;
}

// ----------------------------------------------------------------- fantasy lens ---
// the league points a player earns (accent = the fantasy/you lens). Baseline (appearance only)
// reads MUTED so the eye lands on real returns (goals/assists/CS) and on the players YOU own.
function FantasyPts({ f, size='md', showZero=true, mine=false }){
  if (!f || (!f.pts && !showZero)) return null;
  const v = f.pts||0;
  const notable = (f.done||[]).some(e=> e.type==='goal'||e.type==='assist'||e.type==='cs');
  const tone = notable ? 'is-pop' : (mine ? '' : 'is-muted');
  return (
    <span className={'md-fpts md-fpts-'+size+' '+tone+(f.live?' is-live':'')+(v<0?' is-neg':'')}>
      {f.live && notable && <span className="md-fdot"></span>}
      <b>{v>=0?'+':''}{v}</b><small>fpt{Math.abs(v)===1?'':'s'}</small>
    </span>
  );
}
// who owns this player in the league (fantasy ownership). me → accent. benched → muted note.
function OwnerChip({ ownerId, benchedBy, tiny }){
  if (!ownerId) return <span className={'md-owner md-owner-fa'+(tiny?' is-tiny':'')}>Free agent</span>;
  const m = mgr(ownerId);
  const me = ownerId===ME_ID;
  return (
    <span className={'md-owner'+(me?' is-me':'')+(tiny?' is-tiny':'')} title={(benchedBy?'Benched by ':'Owned by ')+m.name}>
      <span className="md-owner-av" style={{ background:m.color }}>{m.init}</span>
      <span className="md-owner-nm">{me?'You':m.short}</span>
      {benchedBy && <span className="md-owner-bench">bench</span>}
    </span>
  );
}

// ----------------------------------------------------------------- pitch jersey token ---
// flag-kit shirt + number, name + rating + fantasy beneath. Clicking opens the player sheet.
function KitToken({ p, team, t, onOpen, mob }){
  const r = mdRating(p, t);
  const f = mdFantasy(p, t);
  const me = p.owner===ME_ID;
  const kit = (window.JERSEY_BG||{})[team.code];
  return (
    <button className={'md-tok'+(mob?' is-mob':'')+(me?' is-me':'')} onClick={()=>onOpen&&onOpen(p, team)}>
      <span className="md-tok-shirt-wrap">
        <span className="md-tok-shirt" style={{ background:kit||'var(--surface-4)' }}></span>
        <span className="md-tok-num">{p.num}</span>
        {r!=null && <span className="md-tok-rate" style={{ background:mdRatingColor(r) }}>{r.toFixed(1)}</span>}
        {p.owner && (me
          ? <span className="md-tok-own is-me">YOU</span>
          : <span className="md-tok-own is-rival" style={{ background:mgr(p.owner).color }} title={'Owned by '+mgr(p.owner).name}></span>)}
      </span>
      <span className="md-tok-name">{p.cap&&<i className="md-cap">C</i>}{p.first?p.first[0]+'. ':''}{p.last||p.first}</span>
      <span className="md-tok-foot">
        {f.pts!==0 || f.live ? <FantasyPts f={f} size="sm" mine={me}/> : <span className="md-tok-flat">{p.owner?'0':''}</span>}
      </span>
    </button>
  );
}

// ----------------------------------------------------------------- scoreboard header ---
function Scorers({ team, side }){
  const goals = MD_MATCH.events.filter(e=> e.type==='goal' && e.side===side);
  if (!goals.length) return null;
  const byNum = {};
  goals.forEach(g=>{ const num=g.scorer[0]; (byNum[num]=byNum[num]||[]).push(g.min); });
  return (
    <div className={'md-scorers md-scorers-'+side}>
      {Object.keys(byNum).map(num=>{
        const pl = team.xi.find(x=>x.num==num) || team.bench.find(x=>x.num==num);
        return <div className="md-scorer" key={num}><span className="md-ball">⚽</span>{pl?(pl.last||pl.first):'#'+num} <span className="md-scorer-mins">{byNum[num].map(m=>m+"'").join(', ')}</span></div>;
      })}
    </div>
  );
}
function Scoreboard({ t, conn }){
  const sc = mdScore(t);
  const ph = mdPhase(t);
  const exp = mdLeagueExposure(t);
  const live = ph.key==='live';
  return (
    <div className="md-board">
      <div className="md-board-main">
        <div className="md-team md-team-home">
          <span className="md-team-nm">{MD_MATCH.home.name}</span>
          <span className="md-crest" style={{ background:(window.JERSEY_BG||{})[MD_MATCH.home.code] }}></span>
        </div>
        <div className="md-board-center">
          <div className={'md-score'+(live?' is-live':'')}>
            <span className="md-score-n">{sc.h}</span><span className="md-score-dash">–</span><span className="md-score-n">{sc.a}</span>
          </div>
          <div className={'md-clock '+ph.key}>
            {live && <span className="md-livedot"></span>}
            {ph.key==='ft'?'Full-time': ph.key==='ht'?'Half-time': ph.key==='pre'?'Kick-off '+MD_MATCH.ko : ph.clock}
          </div>
        </div>
        <div className="md-team md-team-away">
          <span className="md-crest" style={{ background:(window.JERSEY_BG||{})[MD_MATCH.away.code] }}></span>
          <span className="md-team-nm">{MD_MATCH.away.name}</span>
        </div>
      </div>
      <div className="md-board-scorers">
        <Scorers team={MD_MATCH.home} side="home"/>
        <Scorers team={MD_MATCH.away} side="away"/>
      </div>
      <div className="md-board-meta">
        <span>{MD_MATCH.date} · {MD_MATCH.ko}</span><span className="md-dot-sep">·</span>
        <span>{MD_MATCH.comp}</span><span className="md-dot-sep">·</span>
        <span>{MD_MATCH.stage}</span><span className="md-dot-sep">·</span>
        <span>{MD_MATCH.venue}, {MD_MATCH.city}</span>
      </div>
      {/* fantasy woven into the header — league-wide exposure */}
      <div className="md-board-fan">
        <span className="md-fan-tag">FANTASY</span>
        <span className="md-fan-txt">Feeds <b>{exp.managers}</b> of the league’s XIs · <b>{exp.started}</b> started, <b>{exp.benched}</b> benched</span>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- stat bar ---
function StatBar({ keyName, home, away, mode }){
  const meta = MD_STAT_META[keyName];
  const fmt = v => meta.pct ? v+'%' : meta.dec ? (Math.round(v*100)/100).toFixed(2) : v;
  const hi = !MD_STAT_NEUTRAL.has(keyName);
  const total = (home+away)||1;
  const hp = meta.pct ? home : (home/total*100);
  const ap = meta.pct ? away : (away/total*100);
  const homeLead = hi ? home>away : home<away;
  const awayLead = hi ? away>home : away<home;
  return (
    <div className="md-stat">
      <div className="md-stat-top">
        <span className={'md-stat-v'+(homeLead?' is-lead':'')}>{fmt(home)}</span>
        <span className="md-stat-lab">{meta.label}{meta.info && <i className="md-info">i</i>}</span>
        <span className={'md-stat-v'+(awayLead?' is-lead':'')}>{fmt(away)}</span>
      </div>
      {mode!=='numbers' && (
        <div className="md-stat-bars">
          <div className="md-stat-track is-h"><span className="md-stat-fill" style={{ width:hp+'%', background:MD_TEAM_COLOR.home }}></span></div>
          <div className="md-stat-track is-a"><span className="md-stat-fill" style={{ width:ap+'%', background:MD_TEAM_COLOR.away }}></span></div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- event row (timeline) ---
function EvIcon({ type }){
  if (type==='goal')   return <span className="md-ev-ic is-goal">⚽</span>;
  if (type==='yellow') return <span className="md-ev-ic is-yel"></span>;
  if (type==='red')    return <span className="md-ev-ic is-red"></span>;
  if (type==='sub')    return <span className="md-ev-ic is-sub"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M7 7h9l-3-3M17 17H8l3 3"/></svg></span>;
  if (type==='var')    return <span className="md-ev-ic is-var">VAR</span>;
  return <span className="md-ev-ic is-whistle">●</span>;
}
function fmtMin(min){ if (min===MD_HT) return "45+2'"; if (min===MD_FT) return "90+"+(MD_FT-90)+"'"; return min+"'"; }

// ----------------------------------------------------------------- player sheet ---
function MiniTabs({ tab, setTab }){
  return (
    <div className="md-mtabs">
      {[['points','Points'],['stats','Stats']].map(([k,l])=>(
        <button key={k} className={'md-mtab'+(tab===k?' is-active':'')} onClick={()=>setTab(k)}>{l}</button>
      ))}
    </div>
  );
}
const MD_STATLINE = [
  ['goals','Goals'],['assists','Assists'],['shots','Shots'],['sot','On target'],['keyPass','Key passes'],
  ['passes','Passes'],['passAcc','Pass %','%'],['touches','Touches'],['duelsWon','Duels won'],['duels','Duels'],
  ['tackles','Tackles'],['drib','Dribbles'],['fouls','Fouls'],['fouled','Fouled'],['recov','Recoveries'],['saves','Saves'],
];
function MatchPlayerSheet({ p, team, t, onClose }){
  const [tab, setTab] = mdUseState('points');
  if (!p) return null;
  const r = mdRating(p, t);
  const f = mdFantasy(p, t);
  const onPitch = mdAppeared(p, t);
  const rows = MD_STATLINE.filter(([k])=> k!=='saves' || p.pos==='GK');
  return (
    <div className="md-sheet-scrim" onClick={onClose}>
      <div className="md-sheet" onClick={e=>e.stopPropagation()}>
        <button className="md-sheet-x" onClick={onClose} aria-label="Close">✕</button>
        <div className="md-sheet-head">
          <span className="md-sheet-shirt" style={{ background:(window.JERSEY_BG||{})[team.code] }}><i>{p.num}</i></span>
          <div className="md-sheet-id">
            <b>{p.cap&&<span className="md-cap">C</span>}{p.first} {p.last}</b>
            <span className="md-sheet-sub"><Pos p={p.pos}/> <Flag nat={team.code}/> {team.name}{p.subOff?' · subbed '+p.subOff+"'":p.subOn?' · on '+p.subOn+"'":''}</span>
          </div>
          <div className="md-sheet-nums">
            <div className="md-sheet-num"><RatingBadge r={r} size="lg"/><span>Rating</span></div>
            <div className="md-sheet-num"><span className="md-sheet-fbig">{f.pts>=0?'+':''}{f.pts}</span><span>Fantasy</span></div>
          </div>
        </div>
        <div className="md-sheet-own"><OwnerChip ownerId={p.owner} benchedBy={p.benchedBy}/>{p.benchedBy && <span className="md-sheet-benchnote">On {mgr(p.benchedBy).short}’s bench — scores 0 to his XI</span>}</div>
        <MiniTabs tab={tab} setTab={setTab}/>
        {tab==='points' ? (
          <div className="md-sheet-body">
            {!onPitch ? <div className="md-sheet-empty">Not yet on the pitch.</div>
              : f.done.length===0 ? <div className="md-sheet-empty">On the pitch — no fantasy actions logged yet.</div>
              : <ScoreBreakdown done={f.done} p={p}/>}
            <div className="md-sheet-note">Fantasy values illustrative · final scoring per SCORING.md</div>
          </div>
        ) : (
          <div className="md-sheet-body">
            <div className="md-statline">
              {rows.map(([k,l,suf])=>(
                <div className="md-sl-row" key={k}><span>{l}</span><b className="mono">{p.st[k]||0}{suf||''}</b></div>
              ))}
            </div>
            <div className="md-sheet-note">This match{p.rating!=null?' · final rating '+p.rating.toFixed(1):''}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- your stake ---
// the manager's OWN players in this match — the first thing you want when you open a live game.
function MyStakeStrip({ t, onOpen }){
  const stake = mdMyStake(t);
  if (!stake.players.length) return null;
  return (
    <div className="md-stake">
      <div className="md-stake-l">
        <span className="md-fan-tag is-you">YOUR XI</span>
        <span className="md-stake-lab"><b>{stake.players.length}</b> in this match</span>
      </div>
      <div className="md-stake-players">
        {stake.players.map(m=>(
          <button key={m.p.id} className="md-stake-chip" onClick={()=>onOpen&&onOpen(m.p, m.team)}>
            <span className="md-stake-kit" style={{ background:(window.JERSEY_BG||{})[m.team.code] }}></span>
            <span className="md-stake-nm">{m.p.last||m.p.first}</span>
            <RatingBadge r={mdRating(m.p, t)} size="sm"/>
            <FantasyPts f={m.f} size="sm" mine/>
          </button>
        ))}
      </div>
      <div className="md-stake-total">
        <span className="md-stake-tnum">{stake.total>=0?'+':''}{stake.total}</span>
        <span className="md-stake-tlab">your fpts</span>
      </div>
    </div>
  );
}

Object.assign(window, {
  mdRatingColor, RatingBadge, FantasyPts, OwnerChip, KitToken, MyStakeStrip,
  Scoreboard, Scorers, StatBar, EvIcon, fmtMin, MiniTabs, MatchPlayerSheet,
});
