// vsfield/mobile.jsx — phone-condensed "Vs the Field", rendered inside the iOS frame.
// Same props as the desktop view; exports MobileVsField to window.

function MobYou({ field }) {
  const me = field.snaps.find(s=>s.id===ME_ID);
  const N = field.snaps.length;
  const pulse = useScorePulse(me.total);
  return (
    <div className="mvf-hero">
      <div className="mvf-hero-row">
        <div>
          <div className={'mvf-score'+(pulse?' score-pulse':'')}><span className="mono">{me.total}</span><span className="mvf-score-lab">pts</span></div>
          <div className="t-caption text-tertiary">points this period</div>
        </div>
        <div className="mvf-rankchip"><span className="display mvf-rank-num">{me.rank}</span><span className="mvf-rank-sub">rank · of {N}</span></div>
      </div>
      <div className="mvf-recline">
        <RecordBadge rec={me.rec} total={me.total} size="sm" />
        <span className="t-caption text-secondary">scored vs all {N-1} managers</span>
      </div>
      <div className="mvf-pitchrow">
        <PitchMini snap={me} orient="v" className="vf-pitch-mob" />
        <div className="mvf-pitch-side">
          <div><b>{me.ytp}</b> to come</div>
          <div><b className="is-live">{me.live}</b> playing</div>
          <div><b>{me.final}</b> played</div>
        </div>
      </div>
      <XILegend snap={me} />
    </div>
  );
}

function MobRow({ snap, myTotal, onTap, dimLive }) {
  const m = mgr(snap.id);
  const pulse = useScorePulse(snap.total);
  return (
    <button className={'mvf-row'+(m.isMe?' is-me':'')} onClick={()=>!m.isMe&&onTap(snap.id)}>
      <span className="mvf-rk mono">{snap.rank}</span>
      <Avatar m={m} size="sm" />
      <div className="mvf-rname">
        <b>{m.isMe?'You':m.short}</b>
        <span className="mvf-rsub">
          {snap.live>0 && <span className={'mvf-livetag'+(dimLive?' is-dim':'')}><IcoLive/>{snap.live}</span>}
          <span className="mvf-ytptag"><IcoYtp/>{snap.ytp} to play</span>
        </span>
      </div>
      <span className={'mvf-rscore mono'+(pulse?' score-pulse':'')}>{snap.total}</span>
      {m.isMe ? <span className="mvf-rh2h text-tertiary">—</span>
        : <span className="mvf-rh2h"><H2HResult mine={myTotal} theirs={snap.total} /></span>}
    </button>
  );
}

function MobH2H({ field, oppId, onBack }) {
  const me = field.snaps.find(s=>s.id===ME_ID);
  const opp = field.snaps.find(s=>s.id===oppId);
  const m = mgr(oppId);
  const diff = me.total - opp.total;
  const order = { live:0, ytp:1, final:2 };
  const list = (snap) => [...snap.rows].sort((a,b)=>(order[a.status]-order[b.status])||(b.pts-a.pts)).map((r,i)=>(
    <div className={'mvf-plrow vf-statusrow-'+r.status} key={i}>
      <Pos p={r.p.pos} /><Flag nat={r.p.nat} />
      <b className="t-caption mvf-plname">{r.p.last}</b>
      <StatusTag status={r.status} mini />
      <span className="mono mvf-plpts">{r.pts}</span>
    </div>
  ));
  return (
    <div className="mvf-h2h">
      <button className="mvf-back" onClick={onBack}>‹ Field</button>
      <div className="mvf-h2h-score">
        <span className="mvf-h2h-side"><Avatar m={mgr(ME_ID)} size="sm" ring /><b>You</b><span className="mono">{me.total}</span></span>
        <span className={'mvf-h2h-verdict '+(diff>0?'is-win':diff<0?'is-loss':'is-draw')}>{diff>0?'+':''}{diff}</span>
        <span className="mvf-h2h-side"><Avatar m={m} size="sm" /><b>{m.short}</b><span className="mono">{opp.total}</span></span>
      </div>
      <div className="mvf-h2h-upside t-caption text-tertiary">
        <span><b style={{color:'var(--text-primary)'}}>{me.ytp}</b> yours to play</span>
        <span><b style={{color:'var(--text-primary)'}}>{opp.ytp}</b> theirs to play</span>
      </div>
      <div className="mvf-h2h-grp"><div className="t-label">Your XI</div>{list(me)}</div>
      <div className="mvf-h2h-grp"><div className="t-label">{m.short}’s XI</div>{list(opp)}</div>
    </div>
  );
}

function MobSeason({ season }) {
  return (
    <div className="mvf-season">
      <div className="alert alert-info" style={{marginBottom:10, fontSize:12}}><div><b>Power record.</b> Scored vs every manager each period. Ranked by wins; ties on points.</div></div>
      {season.map((s,i)=>{
        const m = mgr(s.id); const g=s.W+s.L+s.D;
        return (
          <div className={'mvf-strow'+(m.isMe?' is-me':'')} key={s.id}>
            <span className="mvf-rk mono">{i+1}</span>
            <Avatar m={m} size="sm" />
            <b className="mvf-stname">{m.isMe?'You':m.short}</b>
            <span className="mono mvf-strec">{s.W}-{s.L}{s.D?'-'+s.D:''}</span>
            <span className="mono mvf-stpts">{s.pts}<span className="text-tertiary" style={{fontSize:10}}>pt</span></span>
          </div>
        );
      })}
    </div>
  );
}

function MobileVsField({ t, conn, view, setView, field, season, feed, freshIds, selected, setSelected, activeMatch, setActiveMatch }) {
  const me = field.snaps.find(s=>s.id===ME_ID);
  const loading = conn==='loading';
  const empty = field.snaps.every(s=>s.total===0);
  return (
    <IOSDevice dark width={402} height={860}>
      <div className="mvf" data-theme="dark">
        <div className="mvf-head">
          <div className="mvf-headrow">
            <div><div className="display mvf-title">Vs the Field</div>
            <div className="t-micro text-tertiary">{PERIOD.label} · all-play-all</div></div>
            <ConnPill state={conn} />
          </div>
          <div className="tabs mvf-tabs">
            {[['period','This period'],['season','Season']].map(([k,l])=>(
              <button key={k} className={'tab'+(view===k?' is-active':'')} style={{flex:1}} onClick={()=>{setView(k); setSelected(null);}}>{l}</button>
            ))}
          </div>
        </div>

        {conn==='reconnecting' && <div className="vf-banner vf-banner-recon mvf-banner"><span className="spinner" style={{width:12,height:12}}></span>Reconnecting…</div>}
        {conn==='stale' && <div className="vf-banner vf-banner-stale mvf-banner">Scores delayed · updated 1:34 ago</div>}

        <div className="mvf-scroll">
          {view==='season' ? <MobSeason season={season} />
            : selected ? <MobH2H field={field} oppId={selected} onBack={()=>setSelected(null)} />
            : loading ? <div style={{padding:12}}>{Array.from({length:7}).map((_,i)=><div key={i} className="skeleton" style={{height:54,marginBottom:8,borderRadius:10}}></div>)}</div>
            : <>
                <MobYou field={field} />
                <div className="mvf-matchstrip">{MATCHES.map(m=><MatchCard key={m.id} m={m} t={t} active={activeMatch===m.id} onClick={()=>setActiveMatch(activeMatch===m.id?null:m.id)} />)}</div>
                {empty && <div className="vf-banner vf-banner-empty mvf-banner">Scoring hasn’t started — full XI still swappable.</div>}
                <div className="t-label mvf-listlab">The field · ranked by points</div>
                <div className="mvf-list">
                  {field.ranked.map(s => <MobRow key={s.id} snap={s} myTotal={me.total} dimLive={conn!=='live'} onTap={setSelected} />)}
                </div>
                <div className="mvf-feed">
                  <div className="t-label mvf-listlab">Scoring feed</div>
                  {feed.slice(0,8).map(it=> <FeedItem key={it.player.id+'-'+it.min+'-'+it.type} it={it} fresh={freshIds&&freshIds.has(it.player.id+'-'+it.min+'-'+it.type)} />)}
                  {feed.length===0 && <div className="t-sm text-tertiary" style={{padding:'8px 12px'}}>No scoring yet.</div>}
                </div>
              </>}
        </div>
      </div>
    </IOSDevice>
  );
}

window.MobileVsField = MobileVsField;
