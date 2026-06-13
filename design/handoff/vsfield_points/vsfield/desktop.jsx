// vsfield/desktop.jsx — desktop "Vs the Field" surface (lives inside a browser-window chrome).
// REDESIGN: the standings are a SLIM left navigator; the head-to-head comparison is the
// dominant center stage — two full team cards side by side (each manager's actual XI, live
// status + scores). Driven entirely by props from app.jsx. Exports DesktopVsField to window.
const { useState:useStateD, useMemo:useMemoD } = React;

// ============================================================ LEFT: field navigator ===

// compact "you vs the field" summary — clickable to open the whole-field aggregate
function MeCard({ field, active, onClick }) {
  const me = field.snaps.find(s=>s.id===ME_ID);
  const N = field.snaps.length;
  const pulse = useScorePulse(me.total);
  return (
    <button className={'vf-mecard'+(active?' is-active':'')} onClick={onClick}>
      <div className="vf-me-top">
        <div>
          <div className={'vf-me-score mono'+(pulse?' score-pulse':'')}>{me.total}<small>pts</small></div>
          <span className="vf-me-sublab">this period</span>
        </div>
        <div className="vf-me-rank"><b className="display">{me.rank}</b><span>of {N}</span></div>
      </div>
      <div className="vf-me-recrow">
        <RecordBadge rec={me.rec} total={me.total} size="sm" />
        <span className="t-caption text-secondary">scored vs all {N-1}<br/><b style={{color:'var(--text-primary)'}}>{me.ytp}</b> still to come</span>
      </div>
    </button>
  );
}

// one slim row in the ranked field list
function NavRow({ snap, myTotal, selected, onSelect, dimLive }) {
  const m = mgr(snap.id);
  const pulse = useScorePulse(snap.total);
  return (
    <button className={'vf-navrow'+(m.isMe?' is-me':'')+(selected?' is-selected':'')} onClick={()=>onSelect(snap.id)}>
      <span className="vf-navrow-rk mono">{snap.rank}</span>
      <Avatar m={m} size="sm" />
      <span className="vf-navrow-name">
        <b>{m.isMe?'You':m.short}</b>
        <span className="text-tertiary">
          {snap.live>0
            ? <em className={'vf-navrow-live'+(dimLive?' is-dim':'')}><IcoLive/>{snap.live} live · {snap.ytp} left</em>
            : <>{snap.ytp} to play</>}
        </span>
      </span>
      <span className={'vf-navrow-pts mono'+(pulse?' score-pulse':'')}>{snap.total}</span>
      <span className="vf-navrow-h2h">{m.isMe ? <span className="text-tertiary t-caption">—</span> : <H2HResult mine={myTotal} theirs={snap.total} />}</span>
    </button>
  );
}

function FieldNav({ field, effSel, onSelect, feed, freshIds, dimLive }) {
  const me = field.snaps.find(s=>s.id===ME_ID);
  return (
    <div className="vf-nav">
      <div className={'vf-nav-me'+(effSel==='field'?' is-active':'')}>
        <MeCard field={field} active={effSel==='field'} onClick={()=>onSelect('field')} />
        <div className="vf-nav-mehint t-micro">{effSel==='field'?'Showing you vs the whole field':'See you vs the whole field ›'}</div>
      </div>
      <div className="vf-navlist">
        <div className="vf-navlist-lab"><span className="t-label">The field</span><span className="t-micro text-tertiary">tap to compare</span></div>
        {field.ranked.map(s => <NavRow key={s.id} snap={s} myTotal={me.total} selected={effSel===s.id} onSelect={onSelect} dimLive={dimLive} />)}
      </div>
      <div className="vf-nav-feed">
        <div className="vf-feed-head"><div className="t-label">Scoring feed</div><span className="t-micro text-tertiary">{feed.length} events</span></div>
        <div className="vf-feed-list">
          {feed.length===0 && <div className="t-sm text-tertiary" style={{padding:'4px 2px'}}>No scoring yet — matches getting underway.</div>}
          {feed.slice(0,6).map(it=> <FeedItem key={it.player.id+'-'+it.min+'-'+it.type} it={it} fresh={freshIds&&freshIds.has(it.player.id+'-'+it.min+'-'+it.type)} />)}
        </div>
      </div>
    </div>
  );
}

// ============================================================ CENTER: H2H stage ===

// one team's full card: header (who + total) · formation pitch + status counts · player list
function CmpColumn({ snap, isMe, openScore, dimLive }) {
  const m = mgr(snap.id);
  const order = { live:0, ytp:1, final:2 };
  const rows = [...snap.rows].sort((a,b)=> (order[a.status]-order[b.status]) || (b.pts-a.pts));
  return (
    <div className={'vf-cmp-col'+(isMe?' is-me':'')}>
      <div className="vf-cmp-head">
        <Avatar m={m} size="sm" ring={isMe} />
        <b>{isMe?'You':m.name}</b>
        <span className="vf-cmp-form">{m.formation}</span>
        <span className="vf-cmp-tot mono">{snap.total}</span>
      </div>
      <div className="vf-cmp-pitchwrap">
        <PitchMini snap={snap} orient="v" className="vf-pitch-h2h" />
        <div className="vf-cmp-counts">
          <div className="vf-ps-stat"><span className="vf-ps-num mono">{snap.ytp}</span><span className="vf-ps-lab">to come</span></div>
          <div className="vf-ps-stat"><span className={'vf-ps-num mono'+(dimLive?'':' is-live')}>{snap.live}</span><span className="vf-ps-lab">playing</span></div>
          <div className="vf-ps-stat"><span className="vf-ps-num mono">{snap.final}</span><span className="vf-ps-lab">played</span></div>
        </div>
      </div>
      <div className="vf-cmp-players">
        {rows.map((r,i)=>(
          <button className={'vf-cmp-pl vf-statusrow-'+r.status} key={i} onClick={()=>openScore(r.p, snap.id)} title="View points breakdown">
            <Pos p={r.p.pos} /><Flag nat={r.p.nat} />
            <b className="vf-cmp-plname">{r.p.first[0]}. {r.p.last}</b>
            <StatusTag status={r.status} mini />
            <span className="mono vf-cmp-plpts">{r.pts}</span>
            <span className="vf-h2h-chev">›</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function H2HStage({ field, oppId, openScore, dimLive }) {
  const me = field.snaps.find(s=>s.id===ME_ID);
  const opp = field.snaps.find(s=>s.id===oppId);
  if (!opp) return null;
  const m = mgr(oppId);
  const diff = me.total - opp.total;
  const k = diff>0?'win':diff<0?'loss':'draw';
  const word = diff>0?'WINNING':diff<0?'LOSING':'LEVEL';
  return (
    <div className="vf-h2h-hero">
      <div className="vf-sl">
        <div className="vf-sl-side">
          <Avatar m={mgr(ME_ID)} size="lg" ring />
          <div className="vf-sl-id"><b>You</b><span>rank {me.rank} · {me.rec.W}-{me.rec.L} vs field</span></div>
          <div className="vf-sl-score mono">{me.total}</div>
        </div>
        <div className="vf-sl-mid">
          <span className={'vf-sl-verdict is-'+k}>{word}</span>
          <span className={'vf-sl-margin mono is-'+k}>{diff>0?'+':''}{diff}</span>
          <span className="vf-sl-toplay"><b>{me.ytp}</b> of yours · <b>{opp.ytp}</b> of theirs still to play</span>
        </div>
        <div className="vf-sl-side right">
          <Avatar m={m} size="lg" />
          <div className="vf-sl-id"><b>{m.name}</b><span>rank {opp.rank} · {opp.rec.W}-{opp.rec.L} vs field</span></div>
          <div className="vf-sl-score mono">{opp.total}</div>
        </div>
      </div>
      <div className="vf-cmp">
        <CmpColumn snap={me} isMe openScore={openScore} dimLive={dimLive} />
        <CmpColumn snap={opp} openScore={openScore} dimLive={dimLive} />
      </div>
      <p className="t-caption text-tertiary" style={{textAlign:'center', margin:0}}>Tap any player to see the categories &amp; stats behind their points · point values illustrative pending SCORING.md</p>
    </div>
  );
}

// whole-field aggregate (shown when the "you vs field" card is selected) — the all-play-all story
function YouVsField({ field }) {
  const me = field.snaps.find(s=>s.id===ME_ID);
  const ranked = field.ranked;
  const N = field.snaps.length;
  const myIdx = ranked.findIndex(s=>s.id===ME_ID);
  const above = ranked[myIdx-1];
  const below = ranked[myIdx+1];
  const pulse = useScorePulse(me.total);
  return (
    <div className="vf-hero card" style={{maxWidth:520, margin:'0 auto'}}>
      <div className="t-label">You vs the field · {PERIOD.label}</div>

      <div className="vf-hero-sec first vf-hero-headline">
        <div>
          <div className={'vf-hero-score-num mono'+(pulse?' score-pulse':'')}>{me.total}<span style={{fontSize:18,fontWeight:700,marginLeft:5}}>pts</span></div>
          <span className="vf-hero-score-lab">points this period</span>
        </div>
        <div className="vf-hero-rankchip">
          <span className="vf-hero-rank-num display">{me.rank}</span>
          <span className="vf-hero-rank-sub">rank · of {N}</span>
        </div>
      </div>

      <div className="vf-hero-sec vf-hero-recsec">
        <RecordBadge rec={me.rec} total={me.total} />
        <p className="vf-hero-recnote t-caption text-secondary">Scored against <b>all {N-1}</b> managers at once — this <b>W-L</b> is your record for the period; ties break on points.</p>
      </div>

      <div className="vf-hero-sec">
        <div className="vf-hero-pitchsec">
          <PitchMini snap={me} orient="v" className="vf-pitch-hero" />
          <div className="vf-pitch-side">
            <div className="vf-ps-stat"><span className="vf-ps-num">{me.ytp}</span><span className="vf-ps-lab">still to come</span></div>
            <div className="vf-ps-stat"><span className="vf-ps-num is-live">{me.live}</span><span className="vf-ps-lab">playing now</span></div>
            <div className="vf-ps-stat"><span className="vf-ps-num">{me.final}</span><span className="vf-ps-lab">played</span></div>
          </div>
        </div>
        <XILegend snap={me} />
        <p className="t-caption text-tertiary" style={{margin:'10px 0 0'}}>{me.ytp>0
          ? <>Your <b style={{color:'var(--text-secondary)'}}>{me.ytp}</b> still-to-play are pending points — and stay swappable until each kicks off.</>
          : <>Every starter has played — your period score is locked in.</>}</p>
      </div>

      <div className="vf-hero-sec last vf-swing">
        {above ? <div className="vf-swing-row">
          <span className="vf-swing-dir">▲ catch</span>
          <Avatar m={mgr(above.id)} size="sm" /><b className="t-sm">{mgr(above.id).short}</b>
          <span className="mono vf-swing-gap">+{above.total-me.total}</span>
        </div> : <div className="vf-swing-row vf-swing-top">🏆 You lead the field</div>}
        {below && <div className="vf-swing-row">
          <span className="vf-swing-dir vf-swing-down">▼ holding off</span>
          <Avatar m={mgr(below.id)} size="sm" /><b className="t-sm">{mgr(below.id).short}</b>
          <span className="mono vf-swing-gap is-down">{below.total-me.total}</span>
        </div>}
      </div>
    </div>
  );
}

// ============================================================ season ===
function SeasonTable({ season }) {
  return (
    <div className="vf-season">
      <div className="vf-season-note alert alert-info">
        <div><b>Power record.</b> All-play-all every period: your weekly W-L is your result against every other manager that period. Season standings rank by total wins; ties break on total points.</div>
      </div>
      <table className="dtable vf-seasontable">
        <thead><tr>
          <th style={{width:36}}>#</th><th>Manager</th>
          <th className="num">Record</th><th className="num">Win%</th><th className="num">Points</th>
          <th>By period</th>
        </tr></thead>
        <tbody>
          {season.map((s,i)=>{
            const m = mgr(s.id);
            const g = s.W+s.L+s.D;
            return (
              <tr key={s.id} className={m.isMe?'row-me':''}>
                <td className="mono">{i+1}</td>
                <td><div className="vf-st-mgr"><Avatar m={m} size="sm"/><b>{m.isMe?'You':m.name}</b></div></td>
                <td className="num"><b className="mono">{s.W}-{s.L}{s.D?'-'+s.D:''}</b></td>
                <td className="num mono">{g?Math.round(s.W/g*100):0}%</td>
                <td className="num mono">{s.pts}</td>
                <td><div className="vf-st-periods">
                  {s.periods.map((p,pi)=>(
                    <span key={pi} className={'vf-st-chip'+(pi===s.periods.length-1?' is-live':'')} title={(pi===s.periods.length-1?'Live · ':'')+'Period '+(pi+1)+': '+p.pts+' pts · '+p.rec.W+'-'+p.rec.L}>
                      <span className={'wld wld-'+(p.rec.W>p.rec.L?'W':p.rec.W<p.rec.L?'L':'D')}>{p.rec.W>p.rec.L?'W':p.rec.W<p.rec.L?'L':'D'}</span>
                      <span className="mono t-micro">{p.pts}</span>
                    </span>
                  ))}
                </div></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================ skeleton ===
function NavSkeleton(){
  return (
    <div className="vf-nav">
      <div className="vf-nav-me"><span className="skeleton" style={{width:'100%',height:96,display:'block',borderRadius:10}}></span></div>
      <div className="vf-navlist">
        {Array.from({length:12}).map((_,i)=>(
          <div className="vf-navrow" key={i} style={{pointerEvents:'none'}}>
            <span className="vf-navrow-rk"></span>
            <span className="skeleton" style={{width:26,height:26,borderRadius:'50%'}}></span>
            <span className="skeleton" style={{width:90,height:13}}></span>
            <span className="skeleton" style={{width:24,height:18}}></span>
            <span></span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================ app body ===
function DesktopVsField({ t, conn, view, setView, field, season, feed, freshIds, selected, setSelected, activeMatch, setActiveMatch, scored, openScore, closeScore }) {
  const me = field.snaps.find(s=>s.id===ME_ID);
  const loading = conn==='loading';
  const empty = field.snaps.every(s=>s.total===0);
  const lastUpd = conn==='stale' ? '1:34 ago' : 'just now';
  const dimLive = conn!=='live';

  // always-on selection: default to the nearest rival above me (the one I'm chasing)
  const ranked = field.ranked;
  const myIdx = ranked.findIndex(s=>s.id===ME_ID);
  const defRival = ranked[myIdx-1] || ranked[myIdx+1] || ranked.find(s=>s.id!==ME_ID);
  const effSel = selected || (defRival && defRival.id);

  return (
    <div className="vf-app">
      {/* app top bar */}
      <div className="vf-top">
        <div className="vf-brand"><div className="vf-logo">W</div>
          <div><div className="display vf-brand-title">Vs the Field</div>
          <div className="t-micro text-tertiary" style={{letterSpacing:'.06em'}}>{PERIOD.label.toUpperCase()} · {PERIOD.sub.toUpperCase()}</div></div>
        </div>
        <div className="tabs vf-viewtabs">
          {[['period','This period'],['season','Season']].map(([k,l])=>(
            <button key={k} className={'tab'+(view===k?' is-active':'')} onClick={()=>setView(k)}>{l}</button>
          ))}
        </div>
        <div style={{flex:1}}></div>
        <div className="vf-top-right">
          <span className="t-micro text-tertiary">Updated {lastUpd}</span>
          <ConnPill state={conn} />
        </div>
      </div>

      {/* connection banners */}
      {conn==='reconnecting' && <div className="vf-banner vf-banner-recon"><span className="spinner" style={{width:13,height:13}}></span>Reconnecting to live scoring — showing last known points.</div>}
      {conn==='stale' && <div className="vf-banner vf-banner-stale">Scores may be delayed — last confirmed update {lastUpd}. Live indicators paused.</div>}

      {view==='season' ? (
        <div className="vf-scroll"><SeasonTable season={season} /></div>
      ) : (
        <>
          <MatchStrip t={t} activeMatch={activeMatch} onPick={setActiveMatch} />
          {empty && !loading && <div className="vf-banner vf-banner-empty">Scoring hasn’t started — points begin at kickoff. Every manager’s full XI is still swappable right now.</div>}
          <div className="vf-body">
            {loading ? <NavSkeleton/>
              : <FieldNav field={field} effSel={effSel} onSelect={setSelected} feed={feed} freshIds={freshIds} dimLive={dimLive} />}
            <div className="vf-stage-main">
              {loading ? <div className="vf-h2h-hero"><span className="skeleton" style={{width:'100%',height:96,display:'block',borderRadius:12,marginBottom:16}}></span><div className="vf-cmp"><span className="skeleton" style={{height:420,borderRadius:12}}></span><span className="skeleton" style={{height:420,borderRadius:12}}></span></div></div>
                : effSel==='field'
                  ? <YouVsField field={field} />
                  : <H2HStage field={field} oppId={effSel} openScore={openScore} dimLive={dimLive} />}
            </div>
          </div>
        </>
      )}
      {scored && <PlayerScoreSheet p={scored.p} managerId={scored.managerId} t={t} onClose={closeScore} />}
    </div>
  );
}

window.DesktopVsField = DesktopVsField;
