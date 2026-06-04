// standings/mobile.jsx — phone-condensed Standings inside the iOS frame.
function MStandRow({ r, field, expanded, onExpand }){
  const me = r.m.id===ME_ID;
  const cls = ['mst-row', me?'is-me':'', r.qualified?'is-in':'is-out', expanded?'is-open':''].join(' ');
  return (
    <div className={cls}>
      <button className="mst-row-main" onClick={()=>onExpand(expanded?null:r.m.id)}>
        <span className={'mst-seed'+(r.qualified?'':' is-out')}>{r.rank}</span>
        <Avatar m={r.m} size="sm"/>
        <div className="mst-mgr">
          <b className="mst-name">{r.m.short||r.m.name}{me && <span className="st-you">YOU</span>}</b>
          <div className="mst-sub">
            <span className="mono">{winPct(r)}% wins</span>
            <span className="mst-dot">·</span>
            <Move n={r.move}/>
          </div>
        </div>
        <div className="mst-figs">
          <b className="mst-rec"><span className="st-rec-w">{r.W}</span><span className="st-rec-sep">–</span><span className="st-rec-l">{r.L}</span></b>
          <span className={'mst-pf mono'+(r.tiedWins?' is-tiebreak':'')}>{r.total} pts</span>
        </div>
      </button>
      {expanded && (
        <div className="mst-detail">
          {r.perPeriod.map(p=>{
            const k = p.W>p.L?'win':p.W<p.L?'loss':'draw';
            return (
              <div className="mst-pp" key={p.id}>
                <span className="mst-pp-lab">{p.name}{p.live && <span className="st-fc-dot"></span>}</span>
                <span className={'mst-pp-rec mono st-fc-'+k}>{p.W}–{p.L}</span>
                <span className="mst-pp-pts mono">{p.pts} pts</span>
              </div>
            );
          })}
          <div className={'mst-edge'+(r.qualified?' is-in':' is-out')}>
            {r.qualified ? `Seed ${r.rank} — inside the top ${field}` : `Seed ${r.rank} — below the cut`}
          </div>
        </div>
      )}
    </div>
  );
}

function MobileStandings(props){
  const { rows, field, expanded, onExpand, conn, theme } = props;
  const dark = theme!=='light';
  const loading = conn==='loading';
  const me = myStandingRow(rows);

  const list = [];
  rows.forEach((r,i)=>{
    if (i===field) list.push(
      <div className="mst-cutline" key="cut"><span>Cut line · top {field} advance</span></div>
    );
    list.push(<MStandRow key={r.m.id} r={r} field={field} expanded={expanded===r.m.id} onExpand={onExpand}/>);
  });

  return (
    <IOSDevice dark={dark} width={402} height={860}>
      <div className="mst" data-theme={theme}>
        <div className="mst-head">
          <div className="mst-headrow">
            <div>
              <div className="display mst-title">Standings</div>
              <div className="t-micro text-tertiary">Power record · Group Stage <span className="rt-livedot"></span></div>
            </div>
            <ConnPill state={conn}/>
          </div>
          <div className="mst-myband">
            <div className="mst-my-seed">
              <span className="t-label">Your seed</span>
              <b className={me.qualified?'is-in':'is-out'}>{me.rank}<small>/{rows.length}</small></b>
            </div>
            <div className="mst-my-rec">
              <span className="t-label">Record</span>
              <b>{me.W}–{me.L}{me.D?'–'+me.D:''}</b>
            </div>
            <div className="mst-my-status">
              <span className={'mst-status-pill'+(me.qualified?' is-in':' is-out')}>{me.qualified?'Inside the cut':'Below the cut'}</span>
              <span className="t-micro text-tertiary">{me.total} pts</span>
            </div>
          </div>
        </div>

        {conn==='reconnecting' && <div className="vf-banner vf-banner-recon mvf-banner"><span className="spinner" style={{width:12,height:12}}></span>Reconnecting…</div>}
        {conn==='stale' && <div className="vf-banner vf-banner-stale mvf-banner">Delayed feed · points may be behind</div>}

        <div className="mst-scroll">
          <div className="mst-thead"><span>Rank by wins · ties on points</span></div>
          {loading
            ? Array.from({length:8}).map((_,i)=><div key={i} className="skeleton" style={{height:48,borderRadius:12,marginBottom:8}}></div>)
            : list}
        </div>
      </div>
    </IOSDevice>
  );
}
Object.assign(window, { MStandRow, MobileStandings });
