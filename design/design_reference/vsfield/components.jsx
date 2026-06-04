// vsfield/components.jsx — shared presentational atoms + widgets for Vs the Field.
// Exports to window. No state ownership here; everything is driven by props from app.jsx.
const { useState, useEffect, useRef, useMemo } = React;

// ----------------------------------------------------------------- atoms ---
function Flag({ nat, lg, style }) {
  return <span className={'flag'+(lg?' flag-lg':'')} style={{ ...flagStyle(nat), ...style }} title={(NATIONS[nat]||{}).n}></span>;
}
function Pos({ p }) { return <span className={'pos pos-'+p}>{p}</span>; }
function Avatar({ m, size='md', ring }) {
  return <span className={`avatar avatar-${size}${ring?' presence-ring':''}`} style={{ background:m.color, color:'#fff' }}>{m.init}
    {!ring && <span className={'presence-dot'+(m.online?' is-online':'')}></span>}
  </span>;
}

// status iconography (color + icon + word — never color alone)
const IcoLive = () => <span className="vf-livedot" aria-hidden="true"></span>;
const IcoLock = () => <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.4"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>;
const IcoYtp  = () => <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M6 3h12M6 21h12M7 3c0 5 10 6 10 9s-10 4-10 9M17 3c0 5-10 6-10 9"/></svg>;

function StatusTag({ status, mini }) {
  const m = mini?' vf-pill-mini':'';
  if (status==='live')  return <span className={'pill pill-live'+m}><IcoLive/>Playing</span>;
  if (status==='ytp')   return <span className={'pill vf-pill-toplay'+m}><span className="vf-node s-ytp"></span>To play</span>;
  return <span className={'pill vf-pill-played'+m}>Played</span>;
}

// ----------------------------------------------------------------- XI formation pitch ---
// The XI status, shown as the lineup's actual shape on a pitch. Each position is a node,
// styled by its live state per the legend: PLAYING (lit red) · PLAYED (solid steel) ·
// TO PLAY (unfilled outline). No gold, no decorative ticks — the shape *is* the data.
function PitchMini({ snap, orient='v', className='' }) {
  const byPos = { GK:[], DEF:[], MID:[], FWD:[] };
  snap.rows.forEach(r => byPos[r.p.pos].push(r.status));
  const lanes = orient==='v' ? ['FWD','MID','DEF','GK'] : ['GK','DEF','MID','FWD'];
  return (
    <div className={'vf-pitch vf-pitch-'+orient+(className?' '+className:'')}>
      {lanes.map(pos => byPos[pos].length>0 && (
        <div className="vf-lane" key={pos}>
          {byPos[pos].map((st,i)=> <span key={i} className={'vf-node s-'+st}></span>)}
        </div>
      ))}
    </div>
  );
}

// shared legend for the pitch state language
function XILegend({ snap, withCounts=false }) {
  return (
    <div className="vf-legend2">
      <span className="vf-l2 is-live"><span className="vf-node s-live"></span>{withCounts?snap.live+' ':''}Playing</span>
      <span className="vf-l2"><span className="vf-node s-final"></span>{withCounts?snap.final+' ':''}Played</span>
      <span className="vf-l2"><span className="vf-node s-ytp"></span>{withCounts?snap.ytp+' ':''}To play</span>
    </div>
  );
}
// kept as alias so older call-sites stay valid
function XIBar({ snap }) { return <PitchMini snap={snap} orient="h" className="vf-pitch-inline" />; }

// big provisional all-play-all record  e.g.  7–4
function RecordBadge({ rec, total, size='lg' }) {
  const games = rec.W + rec.L + rec.D;
  const lead = rec.W > rec.L ? 'win' : rec.W < rec.L ? 'loss' : 'draw';
  return (
    <div className={'vf-recbadge vf-recbadge-'+size}>
      <div className="vf-rec-nums">
        <span className="vf-rec-w">{rec.W}</span>
        <span className="vf-rec-dash">–</span>
        <span className="vf-rec-l">{rec.L}</span>
        {rec.D>0 && <span className="vf-rec-d">–{rec.D}</span>}
      </div>
      <div className={'vf-rec-cap vf-rec-'+lead}>
        {lead==='win'?'beating':lead==='loss'?'behind':'level with'} {rec.W} of {games}
      </div>
    </div>
  );
}

// per-opponent head-to-head result chip (am I beating them?)
function H2HResult({ mine, theirs }) {
  const d = mine - theirs;
  const k = d>0?'W':d<0?'L':'D';
  return <span className="vf-h2h">
    <span className={'wld wld-'+k}>{k}</span>
    <span className={'mono vf-h2h-margin '+(d>0?'is-up':d<0?'is-down':'')}>{d>0?'+':''}{d}</span>
  </span>;
}

// ----------------------------------------------------------------- match strip ---
function fmtMatchClock(st){
  if (st.phase==='ytp')   return 'KO '+(st.ko>=0?'soon':'');
  if (st.phase==='final') return 'FT';
  return st.min+"'";
}
function MatchCard({ m, t, onClick, active }) {
  const sc = matchScore(m, t);
  const live = sc.st.phase==='live';
  return (
    <button className={'vf-match'+(active?' is-active':'')} onClick={onClick}>
      <div className={'vf-match-clock '+(live?'is-live':sc.st.phase==='final'?'is-final':'is-ytp')}>
        {live && <IcoLive/>}{fmtMatchClock(sc.st)}
      </div>
      <div className="vf-match-teams">
        <span className="vf-mt"><Flag nat={m.home}/><b>{m.home}</b></span>
        <span className="mono vf-match-score">{sc.st.phase==='ytp'?'–':`${sc.h}–${sc.a}`}</span>
        <span className="vf-mt"><Flag nat={m.away}/><b>{m.away}</b></span>
      </div>
    </button>
  );
}
function MatchStrip({ t, onPick, activeMatch }) {
  return (
    <div className="vf-matchstrip">
      <span className="t-label" style={{ alignSelf:'center', whiteSpace:'nowrap' }}>Today</span>
      <div className="vf-matchstrip-scroll">
        {MATCHES.map(m => <MatchCard key={m.id} m={m} t={t} active={activeMatch===m.id} onClick={()=>onPick&&onPick(m.id)} />)}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- live feed ---
const FEED_ICON = {
  goal:'⚽', assist:'🅰', cs:'🛡', yellow:'🟨',
};
function FeedItem({ it, fresh }) {
  const m = mgr(it.managerId);
  const mine = it.managerId===ME_ID;
  return (
    <div className={'vf-feed-item'+(mine?' is-mine':'')+(fresh?' is-fresh':'')}>
      <span className={'vf-feed-min mono'}>{it.match.home}{matchScore(it.match, 9999) ? '' : ''} {it.min}'</span>
      <span className="vf-feed-type" title={it.label}>{it.type==='goal'?'GOAL':it.type==='assist'?'AST':it.type==='cs'?'CS':'YEL'}</span>
      <div className="vf-feed-main">
        <span className="vf-feed-player"><Flag nat={it.player.nat}/><Pos p={it.player.pos}/><b>{it.player.first[0]}. {it.player.last}</b></span>
        <span className="t-caption text-tertiary">{it.label} · <span style={{ color:m.color, fontWeight:700 }}>{m.short}</span></span>
      </div>
      <span className={'mono vf-feed-pts '+(it.pts>=0?'is-pos':'is-neg')}>{it.pts>=0?'+':''}{it.pts}</span>
    </div>
  );
}

// ----------------------------------------------------------------- score pulse hook ---
// returns a className that flashes when `value` increases
function useScorePulse(value){
  const prev = useRef(value);
  const [pulse, setPulse] = useState(false);
  useEffect(()=>{
    if (value > prev.current){ setPulse(true); const id=setTimeout(()=>setPulse(false), 650); prev.current=value; return ()=>clearTimeout(id); }
    prev.current = value;
  }, [value]);
  return pulse;
}

// connection state banner / pill
function ConnPill({ state }) {
  if (state==='live')        return <span className="pill pill-live vf-conn"><IcoLive/>Live</span>;
  if (state==='reconnecting')return <span className="pill vf-conn vf-conn-recon"><span className="spinner" style={{width:11,height:11}}></span>Reconnecting</span>;
  if (state==='stale')       return <span className="pill vf-conn vf-conn-stale"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>Delayed</span>;
  if (state==='loading')     return <span className="pill pill-neutral vf-conn"><span className="spinner" style={{width:11,height:11}}></span>Loading</span>;
  return <span className="pill pill-neutral vf-conn">Offline</span>;
}

Object.assign(window, {
  Flag, Pos, Avatar, IcoLive, IcoLock, IcoYtp, StatusTag,
  XIBar, PitchMini, XILegend, RecordBadge, H2HResult, MatchCard, MatchStrip, fmtMatchClock,
  FeedItem, useScorePulse, ConnPill,
});
