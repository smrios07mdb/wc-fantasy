// standings/components.jsx — presentational pieces for the Standings surface.
// Reuses globals: Avatar, mgr, ME_ID, ST_PERIODS, winPct, RecordBadge, H2HResult.
const { useState:useStateSt } = React;

// movement indicator vs last completed period (▲ up / ▼ down / – flat)
function Move({ n }){
  if (!n) return <span className="st-move st-move-flat" title="No change">–</span>;
  const up = n>0;
  return <span className={'st-move '+(up?'st-move-up':'st-move-down')} title={up?`Up ${n}`:`Down ${-n}`}>
    <svg viewBox="0 0 10 10" width="9" height="9" aria-hidden="true">
      {up ? <path d="M5 1l4 6H1z" fill="currentColor"/> : <path d="M5 9 1 3h8z" fill="currentColor"/>}
    </svg>{Math.abs(n)}
  </span>;
}

// one period's all-play-all mini-record (e.g. 8–3), colored by win/loss/level; live = red ring
function FormChip({ per }){
  const k = per.W>per.L ? 'win' : per.W<per.L ? 'loss' : 'draw';
  return (
    <span className={'st-fc st-fc-'+k+(per.live?' is-live':'')} title={`${per.name}: ${per.W}–${per.L}${per.D?'–'+per.D:''} · ${per.pts} pts`}>
      <span className="st-fc-lab">{per.label}{per.live && <span className="st-fc-dot"></span>}</span>
      <span className="st-fc-rec mono">{per.W}<span className="st-fc-sep">–</span>{per.L}</span>
    </span>
  );
}

function FormStrip({ row }){
  return <span className="st-form">{row.perPeriod.map(per => <FormChip key={per.id} per={per}/>)}</span>;
}

// seed pill — qualifier seeds are accentless steel; the number IS the seed
function Seed({ rank, qualified }){
  return <span className={'st-seed'+(qualified?'':' is-out')}>{rank}</span>;
}

// ---- desktop standings table ----
function StandingsTable({ rows, field, expanded, onExpand }){
  const out = [];
  rows.forEach((r, i) => {
    if (i===field){
      out.push(
        <div className="st-cutline" key="cut" role="separator">
          <span className="st-cut-ic"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M3 12h18" strokeDasharray="3 3"/><path d="M14 7l5 5-5 5"/></svg></span>
          <span className="st-cut-lab">Playoff cut line · top {field} advance to the guillotine</span>
          <span className="st-cut-note t-micro">field size locks at the group→playoff transition</span>
        </div>
      );
    }
    out.push(<StandRow key={r.m.id} r={r} expanded={expanded===r.m.id} onExpand={onExpand}/>);
  });
  return (
    <div className="st-table">
      <div className="st-thead">
        <span className="st-th st-th-seed">#</span>
        <span className="st-th st-th-mgr">Manager</span>
        <span className="st-th st-th-rec">W–L–D</span>
        <span className="st-th st-th-pct">Win%</span>
        <span className="st-th st-th-pf" title="Total points — the tiebreaker when wins are level">PF</span>
        <span className="st-th st-th-form">Form · per matchday</span>
        <span className="st-th st-th-move">+/–</span>
        <span className="st-th st-th-chev"></span>
      </div>
      <div className="st-tbody">{out}</div>
    </div>
  );
}

function StandRow({ r, expanded, onExpand }){
  const me = r.m.id===ME_ID;
  const cls = ['st-row', me?'is-me':'', r.qualified?'is-in':'is-out', expanded?'is-open':''].join(' ');
  return (
    <div className={cls}>
      <button className="st-row-main" onClick={()=>onExpand(expanded? null : r.m.id)}>
        <span className="st-c-seed"><Seed rank={r.rank} qualified={r.qualified}/></span>
        <span className="st-c-mgr">
          <Avatar m={r.m} size="sm"/>
          <span className="st-mgr-name">{r.m.name}</span>
          {me && <span className="st-you">YOU</span>}
        </span>
        <span className="st-c-rec">
          <b className="st-rec-w">{r.W}</b><span className="st-rec-sep">–</span><b className="st-rec-l">{r.L}</b>
          {r.D>0 && <><span className="st-rec-sep">–</span><b className="st-rec-d">{r.D}</b></>}
        </span>
        <span className="st-c-pct mono">{winPct(r)}<small>%</small></span>
        <span className={'st-c-pf mono'+(r.tiedWins?' is-tiebreak':'')} title={r.tiedWins?'Level on wins — total points breaks the tie':''}>{r.total}</span>
        <span className="st-c-form"><FormStrip row={r}/></span>
        <span className="st-c-move"><Move n={r.move}/></span>
        <span className="st-c-chev"><svg viewBox="0 0 12 8" width="11" height="8" className="st-chev"><path d="M1 1l5 5 5-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
      </button>
      {expanded && <RowDetail r={r}/>}
    </div>
  );
}

// expansion: per-period breakdown + the cut edge in plain words
function RowDetail({ r }){
  const edgeTxt = r.qualified
    ? (r.edge>0 ? `${r.edge} win${r.edge===1?'':'s'} clear of the cut line`
               : 'level with the cut line — total points keeps the seed')
    : (r.edge<0 ? `${-r.edge} win${r.edge===-1?'':'s'} behind the cut line`
               : 'level on wins with the cut — needs points to climb in');
  return (
    <div className="st-detail">
      <table className="st-detail-tbl">
        <thead><tr><th>Matchday</th><th className="num">Record</th><th className="num">Points</th><th className="num">Result</th></tr></thead>
        <tbody>
          {r.perPeriod.map(p => {
            const k = p.W>p.L?'win':p.W<p.L?'loss':'draw';
            return (
              <tr key={p.id}>
                <td>{p.name}{p.live && <span className="st-live-tag"><span className="st-fc-dot"></span>live</span>}</td>
                <td className="num mono">{p.W}–{p.L}{p.D?'–'+p.D:''}</td>
                <td className="num mono">{p.pts}</td>
                <td className="num"><span className={'st-res st-res-'+k}>{p.W>p.L?'winning week':p.W<p.L?'losing week':'level week'}</span></td>
              </tr>
            );
          })}
          <tr className="st-detail-total">
            <td><b>Season</b></td>
            <td className="num mono"><b>{r.W}–{r.L}{r.D?'–'+r.D:''}</b></td>
            <td className="num mono"><b>{r.total}</b></td>
            <td className="num"></td>
          </tr>
        </tbody>
      </table>
      <div className={'st-detail-edge'+(r.qualified?' is-in':' is-out')}>
        <span className="st-edge-ic">{r.qualified
          ? <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M20 6 9 17l-5-5"/></svg>
          : <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 8v5M12 16.5v.5"/><circle cx="12" cy="12" r="9"/></svg>}</span>
        <span>{r.qualified?'In the playoff field':'Below the cut'} — {edgeTxt}.</span>
      </div>
    </div>
  );
}

Object.assign(window, { Move, FormChip, FormStrip, Seed, StandingsTable, StandRow, RowDetail });
