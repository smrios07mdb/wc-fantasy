// boxscore/components.jsx — presentational pieces for Player box-score.
// Reuses globals: Flag, Pos, evalSquadPlayer, JERSEY_BG, NATIONS, player, acqLabel, seasonPts.
const { useState:useStateBx } = React;

const bxShort = p => `${p.first[0]}. ${p.last}`;

// big kit (national flag on a shirt)
function BxKit({ nat, size=56 }){
  return <span className="bx-kit" style={{ width:size, height:size, background: JERSEY_BG[nat] || (NATIONS[nat]||{}).f || 'var(--surface-4)' }}></span>;
}

function bxLock(status){
  if (status==='live')  return <span className="sl-lt sl-lt-live"><span className="vf-livedot"></span>Locked · playing</span>;
  if (status==='played')return <span className="sl-lt sl-lt-played"><IcoLockBx/>Locked · played</span>;
  return <span className="sl-lt sl-lt-move"><IcoOpenBx/>Movable</span>;
}
const IcoLockBx = () => <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.4"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>;
const IcoOpenBx = () => <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.4"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/></svg>;

const ptsCls = v => v>0?'is-pos':v<0?'is-neg':'is-zero';
const ptsTxt = v => v==null?'—':(v>0?'+'+v:''+v);

// ============================================================ hero ===
function BxHero({ data, compact }){
  const { p, status, match, opp, home, sc, minLabel, periodTotal, seasonTotal } = data;
  const live = status==='live';
  return (
    <div className={'bx-hero'+(compact?' bx-hero-c':'')}>
      <div className="bx-hero-id">
        <BxKit nat={p.nat} size={compact?48:60}/>
        <div className="bx-hero-meta">
          <div className="bx-hero-nameline">
            <h2 className="bx-hero-name display">{p.first} {p.last}</h2>
            <Pos p={p.pos}/>
          </div>
          <div className="bx-hero-sub t-sm text-secondary">
            <Flag nat={p.nat}/> {(NATIONS[p.nat]||{}).n||p.nat}
            <span className="bx-dot">·</span>{acqLabel(p.id)}
          </div>
          <div className="bx-hero-status">{bxLock(status)}
            <span className="bx-match">
              <span className="bx-match-vs">{home?'vs':'@'}</span><Flag nat={opp}/>
              <b>{match.home} {sc.st.phase==='ytp'?'–':`${sc.h}–${sc.a}`} {match.away}</b>
              <span className={'bx-clk mono '+(live?'is-live':sc.st.phase==='final'?'is-final':'is-ytp')}>{live&&<span className="vf-livedot"></span>}{minLabel}</span>
            </span>
          </div>
        </div>
      </div>
      <div className="bx-hero-totals">
        <div className="bx-bigtotal">
          <span className="t-label">This period{live&&<span className="vf-livedot" style={{marginLeft:6}}></span>}</span>
          <span className="bx-bigtotal-num display">{periodTotal}<small>pts</small></span>
        </div>
        <div className="bx-szntotal">
          <span className="t-label">Season</span>
          <span className="bx-szntotal-num display mono">{seasonTotal}</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================ headline tiles ===
function HeroTiles({ data, big }){
  const h = data.headline; const gk = data.p.pos==='GK';
  const tiles = [
    { label:'Minutes', v:data.played?h.minutes:'—', suf:data.played?"'":'', szn:h.minutesSzn+"'" },
    { label:'Rating',  v:h.rating||'—', szn:h.ratingSzn },
    { label:'Goals',   v:h.goals, szn:h.goalsSzn },
    { label:'Assists', v:h.assists, szn:h.assistsSzn },
    gk ? { label:'Saves', v:h.saves, szn:h.savesSzn }
       : { label:'Clean sheet', v:h.cs?'Yes':'No', szn:h.csSzn },
  ];
  return (
    <div className={'bx-tiles'+(big?' bx-tiles-big':'')}>
      {tiles.map(tl=>(
        <div className="bx-tile" key={tl.label}>
          <span className="bx-tile-lab t-label">{tl.label}</span>
          <span className="bx-tile-v display">{tl.v}{tl.suf||''}</span>
          <span className="bx-tile-szn mono">{tl.szn} <span className="bx-tile-sznlab">szn</span></span>
        </div>
      ))}
    </div>
  );
}

// ============================================================ points lead (timeline) ===
function PointsLead({ data }){
  const done = [...data.e.done].sort((a,b)=>a.min-b.min);
  return (
    <div className="bx-card bx-points">
      <div className="bx-card-head"><span className="t-label">This period · points contribution</span>
        <span className="bx-points-total mono">{data.periodTotal}<small>pts</small></span></div>
      {done.length===0
        ? <div className="bx-empty">{data.played?'On the pitch — no points logged yet.':'Match not kicked off — yet to play.'}</div>
        : <div className="bx-timeline">
            {done.map((ev,i)=>(
              <div className="bx-tl-row" key={i}>
                <span className="bx-tl-min mono">{ev.min}'</span>
                <span className="bx-tl-dot"></span>
                <span className="bx-tl-label">{ev.label}</span>
                <span className={'bx-tl-pts mono '+ptsCls(ev.pts)}>{ptsTxt(ev.pts)}</span>
              </div>
            ))}
          </div>}
    </div>
  );
}

// ============================================================ match log ===
function MatchLog({ data }){
  return (
    <div className="bx-card">
      <div className="bx-card-head"><span className="t-label">Recent matches</span><span className="t-micro text-tertiary">pts per match</span></div>
      <div className="bx-log">
        {data.log.map((m,i)=>(
          <div className={'bx-log-row'+(m.live?' is-live':'')} key={i}>
            <span className="bx-log-md mono">{m.md}</span>
            <span className={'wld wld-'+m.res}>{m.res}</span>
            <span className="bx-log-opp">{m.home?'vs':'@'} <Flag nat={m.opp}/> <b>{m.opp}</b> <span className="mono text-tertiary">{m.gf}–{m.ga}</span></span>
            {m.live && <span className="bx-log-livetag"><span className="vf-livedot"></span>live</span>}
            <span className="bx-log-pts mono">{m.pts}<small>pts</small></span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================ form lead (chart) ===
function FormLead({ data }){
  const max = Math.max(...data.form.map(f=>f.pts), 10);
  return (
    <div className="bx-card bx-form">
      <div className="bx-card-head"><span className="t-label">Season form · points per matchday</span>
        <span className="t-micro text-tertiary">avg {Math.round(data.form.reduce((s,f)=>s+f.pts,0)/data.form.length)} pts</span></div>
      <div className="bx-bars">
        {data.form.map((f,i)=>(
          <div className="bx-bar-col" key={i}>
            <span className="bx-bar-val mono">{f.pts}</span>
            <div className="bx-bar-track"><div className={'bx-bar'+(f.live?' is-live':'')} style={{height:Math.max(4,Math.round(f.pts/max*100))+'%'}}></div></div>
            <span className={'bx-bar-lab mono'+(f.live?' is-live':'')}>{f.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================ breakdown — grouped ===
function fmtStat(v, c){
  if (v==null) return '—';
  const n = c.deci ? Number(v).toFixed(1) : v;
  return (c.unit!=null) ? (n+c.unit) : n;
}
function CatRow({ row }){
  const c = row.cat;
  return (
    <div className="bx-catrow">
      <span className="bx-cat-label">{c.label}{c.neg && <span className="bx-cat-neg" title="Deducts points">−</span>}</span>
      <span className="bx-cat-period mono">{fmtStat(row.period, c)}</span>
      <span className={'bx-cat-pts mono '+(row.pts==null?'is-na':ptsCls(row.pts))}>{ptsTxt(row.pts)}</span>
      <span className="bx-cat-season mono">{fmtStat(row.season, c)}</span>
    </div>
  );
}
function CategoryGrouped({ data }){
  const byGroup = {};
  data.rows.forEach(r=>{ (byGroup[r.cat.g]=byGroup[r.cat.g]||[]).push(r); });
  const groups = BOX_GROUPS.filter(g=>byGroup[g] && byGroup[g].length);
  return (
    <div className="bx-groups">
      {groups.map(g=>(
        <section className="bx-card bx-group" key={g}>
          <div className="bx-group-head">
            <h3 className="t-h3">{g}</h3>
            <div className="bx-group-cols"><span>Period</span><span>Pts</span><span>Season</span></div>
          </div>
          <div className="bx-group-rows">
            {byGroup[g].map((r,i)=><CatRow row={r} key={i}/>)}
          </div>
        </section>
      ))}
    </div>
  );
}

// ============================================================ breakdown — table ===
function CategoryTable({ data }){
  const byGroup = {};
  data.rows.forEach(r=>{ (byGroup[r.cat.g]=byGroup[r.cat.g]||[]).push(r); });
  const groups = BOX_GROUPS.filter(g=>byGroup[g] && byGroup[g].length);
  return (
    <div className="bx-card">
      <table className="dtable bx-tablefull">
        <thead><tr><th>Category</th><th className="num">This period</th><th className="num">Pts</th><th className="num">Season</th></tr></thead>
        <tbody>
          {groups.map(g=>([
            <tr className="bx-table-grouphead" key={g}><td colSpan="4">{g}</td></tr>,
            ...byGroup[g].map((r,i)=>(
              <tr key={g+i}>
                <td>{r.cat.label}{r.cat.neg&&<span className="bx-cat-neg">−</span>}</td>
                <td className="num mono">{fmtStat(r.period, r.cat)}</td>
                <td className={'num mono '+(r.pts==null?'is-na':ptsCls(r.pts))}>{ptsTxt(r.pts)}</td>
                <td className="num mono text-secondary">{fmtStat(r.season, r.cat)}</td>
              </tr>
            ))
          ]))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================ player switcher ===
function PlayerSwitcher({ ids, curId, onPick, compact }){
  const idx = ids.indexOf(curId);
  const go = (d)=>{ const n=(idx+d+ids.length)%ids.length; onPick(ids[n]); };
  return (
    <div className="bx-switch">
      <button className="bx-switch-btn" onClick={()=>go(-1)} title="Previous player">‹</button>
      <select className="bx-switch-sel" value={curId} onChange={e=>onPick(e.target.value)}>
        {ids.map(id=>{ const p=player(id); return <option key={id} value={id}>{p.pos} · {bxShort(p)}</option>; })}
      </select>
      <button className="bx-switch-btn" onClick={()=>go(1)} title="Next player">›</button>
    </div>
  );
}

// ============================================================ body (shared) ===
function BoxScoreBody({ data, lead, breakdown, compact }){
  return (
    <div className={'bx-body'+(compact?' bx-body-c':'')}>
      <BxHero data={data} compact={compact}/>
      <HeroTiles data={data} big={lead==='tiles'}/>
      {lead==='points' && <div className="bx-leadgrid"><PointsLead data={data}/><MatchLog data={data}/></div>}
      {lead==='form' && <FormLead data={data}/>}
      {breakdown==='table' ? <CategoryTable data={data}/> : <CategoryGrouped data={data}/>}
      <div className="bx-note">Point values illustrative · final per-category scoring per <span className="mono">SCORING.md</span> (pending). The Pts column reflects this period's canonical scoring events; other rows are tracked stats.</div>
    </div>
  );
}

Object.assign(window, {
  bxShort, BxKit, BxHero, HeroTiles, PointsLead, MatchLog, FormLead,
  CategoryGrouped, CategoryTable, PlayerSwitcher, BoxScoreBody,
});
