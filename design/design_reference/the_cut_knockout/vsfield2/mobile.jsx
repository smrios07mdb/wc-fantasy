// vsfield2/mobile.jsx — phone-condensed Direction A, rendered in the iOS frame.
// Leaderboard-first (the prominent standings), tap a manager → H2H: condensed compare band +
// a You/Opponent pitch toggle showing the Set-Lineup-style flag-kit XI. Tap a player → breakdown.
// Shares sim state with desktop (same `selected`). Exports MobileVsFieldA to window.
const { useState:useSMob } = React;

// ---- mobile match strip ----
function MaMatchCard({ m, t, active, onPick }){
  const sc = matchScore(m, t);
  const live = sc.st.phase==='live';
  const clock = sc.st.phase==='ytp' ? 'KO soon' : sc.st.phase==='final' ? 'FT' : sc.st.min+"'";
  return (
    <button className={'v2-match'+(active?' is-active':'')} onClick={()=>onPick(m.id)}>
      <div className={'v2-match-clock '+(live?'is-live':sc.st.phase==='final'?'is-final':'is-ytp')}>{live&&<span className="v2-livedot"></span>}{clock}</div>
      <div className="v2-match-teams">
        <span className="v2-mt"><Flag nat={m.home}/><b>{m.home}</b></span>
        <span className="mono v2-match-score">{sc.st.phase==='ytp'?'–':sc.h+'–'+sc.a}</span>
        <span className="v2-mt"><Flag nat={m.away}/><b>{m.away}</b></span>
      </div>
    </button>
  );
}

// ---- you hero ----
function MaYou({ field }){
  const me = field.snaps.find(s=>s.id===ME_ID);
  const N = field.snaps.length;
  const pulse = useScorePulse(me.total);
  return (
    <div className="ma-you">
      <div className="ma-you-row">
        <div>
          <div className={'ma-you-score'+(pulse?' score-pulse':'')}><span className="mono">{me.total}</span><span className="ma-you-lab">pts this period</span></div>
        </div>
        <div className="ma-you-rank"><b className="mono">{me.rank}</b><span>rank · of {N}</span></div>
      </div>
      <div className="ma-you-rec">
        <RecordBadge rec={me.rec} total={me.total} size="sm" />
        <span className="t-caption text-secondary">scored vs all {N-1} · <b style={{color:'var(--text-primary)'}}>{me.ytp}</b> still to come</span>
      </div>
    </div>
  );
}

// ---- leaderboard row ----
function MaRow({ snap, myTotal, onTap, dimLive, block }){
  const m = mgr(snap.id);
  const d = myTotal - snap.total;
  const k = d>0?'W':d<0?'L':'D';
  const pulse = useScorePulse(snap.total);
  return (
    <button className={'ma-row'+(m.isMe?' is-me':'')+(block?' is-block':'')} onClick={()=>onTap(snap.id)}>
      <span className="ma-row-rk mono">{snap.rank}</span>
      <Avatar m={m} size="sm" ring={m.isMe} />
      <span className="ma-row-name">
        <b>{m.isMe?'You':m.short}</b>
        <span className="ma-row-sub">
          {block
            ? <span className="ko-blocksub"><MacheteMini/> on the block · {snap.ytp} to play</span>
            : <>
                {snap.live>0 && <span className={'ma-livetag'+(dimLive?' is-dim':'')}><IcoLive/>{snap.live} live</span>}
                <span className="ma-ytptag">{snap.ytp} to play</span>
              </>}
        </span>
      </span>
      <span className="ma-row-right">
        <span className={'ma-row-pts mono'+(pulse?' score-pulse':'')}>{snap.total}</span>
        {m.isMe ? <span className="da-lb-wld-self">you</span> : <span className={'ma-row-wld '+k}>{k}{d>0?' +'+d:d<0?' '+d:''}</span>}
      </span>
    </button>
  );
}

// ---- condensed compare band ----
function MaCompare({ me, opp }){
  const f = compareFacts(me, opp);
  const mMe = mgr(me.id), mOp = mgr(opp.id);
  const bestName = f.lineup.best.row ? (f.lineup.best.row.p.first[0]+'. '+f.lineup.best.row.p.last) : '—';
  return (
    <div className="ma-cmp">
      <div className="ma-cmp-top">
        <div className="ma-cmp-side">
          <Avatar m={mMe} size="sm" ring />
          <div className="ma-cmp-id"><b>You</b><span>{me.rec.W}–{me.rec.L} · rk {me.rank}</span></div>
        </div>
        <div className="ma-cmp-mid">
          <span className={'ma-cmp-verdict is-'+f.margin.k}>{f.margin.word}</span>
          <span className={'ma-cmp-margin mono is-'+f.margin.k}>{f.margin.diff>0?'+':''}{f.margin.diff}</span>
        </div>
        <div className="ma-cmp-side right">
          <Avatar m={mOp} size="sm" />
          <div className="ma-cmp-id"><b>{mOp.short}</b><span>{opp.rec.W}–{opp.rec.L} · rk {opp.rank}</span></div>
        </div>
      </div>
      <div className="ma-cmp-facts">
        <div className="ma-cmp-fact"><span className="ma-fk">2</span><span><b className="pos">{f.upside.mine}</b> of yours still to play · they have <b>{f.upside.theirs}</b>{f.upside.edge!==0 && <> · <span className={f.upside.edge>0?'up':'down'}>{f.upside.edge>0?'+':''}{f.upside.edge}</span></>}</span></div>
        <div className="ma-cmp-fact"><span className="ma-fk">3</span><span>ahead in <b className="pos">{f.lineup.ahead}</b>/{f.lineup.total} slots · edge <b>{bestName}</b> <span className={f.lineup.best.diff>=0?'up':'down'}>{f.lineup.best.diff>0?'+':''}{f.lineup.best.diff}</span></span></div>
      </div>
    </div>
  );
}

// ---- H2H ----
function MaH2H({ field, oppId, onBack, t, dimLive, openScore }){
  const me = field.snaps.find(s=>s.id===ME_ID);
  const opp = field.snaps.find(s=>s.id===oppId);
  const mOp = mgr(oppId);
  const [side, setSide] = useSMob('me');
  if(!opp) return null;
  const shown = side==='me' ? me : opp;
  return (
    <div className="ma-h2h">
      <button className="ma-back" onClick={onBack}>‹ Standings</button>
      <MaCompare me={me} opp={opp} />
      <div className="ma-sideseg">
        <button className={side==='me'?'is-on':''} onClick={()=>setSide('me')}>You <span className="ma-seg-pts">{me.total}</span></button>
        <button className={side==='opp'?'is-on':''} onClick={()=>setSide('opp')}>{mOp.short} <span className="ma-seg-pts">{opp.total}</span></button>
      </div>
      <div className="ma-pitchwrap">
        <XIPitch snap={shown} onScore={(p)=>openScore(p, shown.id)} dimLive={dimLive} mob />
      </div>
      <p className="t-micro text-tertiary" style={{textAlign:'center',margin:'2px 0 0'}}>Tap a player for the points breakdown · kit brightness = lock-on-play</p>
    </div>
  );
}

// ---- season ----
function MaSeason({ season }){
  return (
    <div className="ma-season">
      <div className="alert alert-info" style={{marginBottom:10,fontSize:12}}><div><b>Power record.</b> Scored vs every manager each period. Ranked by wins; ties on points.</div></div>
      {season.map((s,i)=>{
        const m = mgr(s.id);
        return (
          <div className={'ma-strow'+(m.isMe?' is-me':'')} key={s.id}>
            <span className="ma-row-rk mono">{i+1}</span>
            <Avatar m={m} size="sm" />
            <span className="ma-stname">{m.isMe?'You':m.short}</span>
            <span className="mono ma-strec">{s.W}-{s.L}{s.D?'-'+s.D:''}</span>
            <span className="ma-stpts">{s.pts}<span className="text-tertiary" style={{fontSize:10}}>pt</span></span>
          </div>
        );
      })}
    </div>
  );
}

function MobileVsFieldA({ t, conn, view, setView, field, season, feed, freshIds, selected, setSelected, activeMatch, setActiveMatch, ko, ceremony, setCeremony }){
  const me = field.snaps.find(s=>s.id===ME_ID);
  const loading = conn==='loading';
  const empty = field.snaps.every(s=>s.total===0);
  const dimLive = conn!=='live';
  const [scored, setScored] = useSMob(null);
  const openScore = (p, managerId)=> setScored({ p, managerId });
  return (
    <IOSDevice dark width={402} height={860}>
      <div className="ma" data-theme="dark">
        <div className="ma-head">
          <div className="ma-headrow">
            <div><div className="ma-title">{ko?'The Cut':'Vs the Field'}</div>
            <div className="t-micro text-tertiary">{ko ? KO_ROUND.label+' · guillotine' : PERIOD.label+' · all-play-all'}</div></div>
            <ConnPill state={conn} />
          </div>
          <div className="tabs ma-tabs">
            {[['period','This period'],['season','Season']].map(([k,l])=>(
              <button key={k} className={'tab'+(view===k?' is-active':'')} style={{flex:1}} onClick={()=>{setView(k); setSelected(null);}}>{l}</button>
            ))}
          </div>
        </div>

        {conn==='reconnecting' && <div className="v2-banner v2-banner-recon ma-banner"><span className="spinner" style={{width:12,height:12}}></span>Reconnecting…</div>}
        {conn==='stale' && <div className="v2-banner v2-banner-stale ma-banner">Scores delayed · updated 1:34 ago</div>}

        <div className="ma-scroll">
          {view==='season' ? <MaSeason season={season} />
            : (selected && selected!=='field') ? <MaH2H field={field} oppId={selected} onBack={()=>setSelected(null)} t={t} dimLive={dimLive} openScore={openScore} />
            : selected==='field' ? <><button className="ma-back" onClick={()=>setSelected(null)} style={{marginBottom:10}}>‹ Standings</button><YouVsField field={field} /></>
            : loading ? <div>{Array.from({length:7}).map((_,i)=><div key={i} className="skeleton" style={{height:54,marginBottom:8,borderRadius:10}}></div>)}</div>
            : <>
                {ko && <KOMarquee ko={ko} mob />}
                {ko ? <KOYouBand ko={ko} mob /> : <MaYou field={field} />}
                <div className="ma-matchstrip">{MATCHES.map(m=><MaMatchCard key={m.id} m={m} t={t} active={activeMatch===m.id} onPick={(id)=>setActiveMatch(activeMatch===id?null:id)} />)}</div>
                {empty && <div className="v2-banner v2-banner-empty ma-banner">Scoring hasn’t started — full XI still swappable.</div>}
                {!ko && <button className="ma-fieldbtn" onClick={()=>setSelected('field')}>
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
                  <span><b>You vs the whole field</b><span>record {me.rec.W}–{me.rec.L} · rank {me.rank}</span></span>
                  <span className="ma-chev">›</span>
                </button>}
                <div className="ma-listlab"><span className="t-label">{ko?'The ladder · tap to compare':'Standings · tap to compare'}</span><span className="t-micro text-tertiary">live · pts</span></div>
                <div className="ma-list">
                  {(ko?ko.alive:field.ranked).map((s,i) => (
                    <React.Fragment key={s.id}>
                      {ko && i===ko.cutIndex && <KOCutLine ko={ko} mob />}
                      <MaRow snap={s} myTotal={me.total} onTap={setSelected} dimLive={dimLive} block={!!ko && i>=ko.cutIndex} />
                    </React.Fragment>
                  ))}
                </div>
                {ko && <KOFallen ko={ko} onSelect={setSelected} mob />}
                <div className="ma-feed"><FeedTicker feed={feed} freshIds={freshIds} /></div>
              </>}
        </div>
        {scored && <PlayerScoreSheet p={scored.p} managerId={scored.managerId} t={t} onClose={()=>setScored(null)} />}
        {ko && ceremony && <KOCeremony ko={ko} onClose={()=>setCeremony(false)} mob />}
      </div>
    </IOSDevice>
  );
}

window.MobileVsFieldA = MobileVsFieldA;
