// vsfield/desktop.jsx — desktop "Vs the Field" surface (lives inside a browser-window chrome).
// Driven entirely by props from app.jsx. Exports DesktopVsField to window.
const { useState:useStateD, useMemo:useMemoD } = React;

// ---- one manager row in the field standings ----
function FieldRow({ snap, myTotal, onSelect, selected, dimLive }) {
  const m = mgr(snap.id);
  const pulse = useScorePulse(snap.total);
  return (
    <div className={'vf-row'+(m.isMe?' is-me':'')+(selected?' is-selected':'')} onClick={()=> onSelect(snap.id)}>
      <div className="vf-c-rank mono">{snap.rank}</div>
      <div className="vf-c-mgr">
        <Avatar m={m} size="sm" />
        <div className="vf-mgr-name">
          <b>{m.isMe?'You':m.name}</b>
          <span className="t-micro text-tertiary">vs field {snap.rec.W}-{snap.rec.L}{snap.rec.D?'-'+snap.rec.D:''}</span>
        </div>
      </div>
      <div className={'vf-c-score mono'+(pulse?' score-pulse':'')}>{snap.total}</div>
      <div className="vf-c-xi"><PitchMini snap={snap} orient="h" className="vf-pitch-table" /></div>
      <div className="vf-c-ytp">
        <span className="vf-ytp-num mono">{snap.ytp}</span>
        <span className="vf-ytp-lab">to play</span>
      </div>
      <div className="vf-c-h2h">{m.isMe ? <span className="text-tertiary t-caption">—</span> : <H2HResult mine={myTotal} theirs={snap.total} />}</div>
    </div>
  );
}

function FieldTable({ field, dimLive, onSelect, selected }) {
  const me = field.snaps.find(s=>s.id===ME_ID);
  return (
    <div className="vf-table">
      <div className="vf-thead">
        <div className="vf-c-rank">#</div>
        <div className="vf-c-mgr">Manager</div>
        <div className="vf-c-score">Points</div>
        <div className="vf-c-xi">Lineup</div>
        <div className="vf-c-ytp">Players left</div>
        <div className="vf-c-h2h">vs You</div>
      </div>
      <div className="vf-tbody">
        {field.ranked.map(s => <FieldRow key={s.id} snap={s} myTotal={me.total} dimLive={dimLive}
          onSelect={onSelect} selected={selected===s.id} />)}
      </div>
    </div>
  );
}

// ---- skeleton loading ----
function FieldSkeleton(){
  return <div className="vf-table"><div className="vf-tbody">
    {Array.from({length:12}).map((_,i)=>(
      <div className="vf-row" key={i} style={{ pointerEvents:'none' }}>
        <div className="vf-c-rank"><span className="skeleton" style={{width:14,height:14,display:'block'}}></span></div>
        <div className="vf-c-mgr"><span className="skeleton" style={{width:28,height:28,borderRadius:'50%'}}></span><span className="skeleton" style={{width:120,height:14}}></span></div>
        <div className="vf-c-score"><span className="skeleton" style={{width:34,height:20,marginLeft:'auto'}}></span></div>
        <div className="vf-c-xi"><span className="skeleton" style={{width:'100%',height:10}}></span></div>
        <div className="vf-c-ytp"><span className="skeleton" style={{width:30,height:24}}></span></div>
        <div className="vf-c-h2h"><span className="skeleton" style={{width:40,height:18}}></span></div>
      </div>
    ))}
  </div></div>;
}

// ---- You vs the field hero (right rail, always present) ----
function YouVsField({ field }) {
  const me = field.snaps.find(s=>s.id===ME_ID);
  const ranked = field.ranked;
  const N = field.snaps.length;
  const myIdx = ranked.findIndex(s=>s.id===ME_ID);
  const above = ranked[myIdx-1];   // nearest manager I'm chasing
  const below = ranked[myIdx+1];   // nearest manager chasing me
  const pulse = useScorePulse(me.total);
  return (
    <div className="vf-hero card">
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

// ---- H2H detail (right rail, when a manager is selected) ----
function H2HDetail({ field, oppId, onClose }) {
  const me = field.snaps.find(s=>s.id===ME_ID);
  const opp = field.snaps.find(s=>s.id===oppId);
  if (!opp) return null;
  const m = mgr(oppId);
  const diff = me.total - opp.total;
  const col = (snap, isMe) => {
    const order = { live:0, ytp:1, final:2 };
    const rows = [...snap.rows].sort((a,b)=> (order[a.status]-order[b.status]) || (b.pts-a.pts));
    return (
      <div className="vf-h2h-col">
        <div className="vf-h2h-colhead">
          <Avatar m={mgr(snap.id)} size="sm" ring={isMe} />
          <b className="t-sm">{isMe?'You':mgr(snap.id).short}</b>
          <span className="mono vf-h2h-coltot">{snap.total}</span>
        </div>
        <div className="vf-h2h-list">
          {rows.map((r,i)=>(
            <div className={'vf-h2h-pl vf-statusrow-'+r.status} key={i}>
              <Pos p={r.p.pos} /><Flag nat={r.p.nat} />
              <b className="t-caption vf-h2h-name">{r.p.last}</b>
              <StatusTag status={r.status} mini />
              <span className="mono vf-h2h-plpts">{r.pts}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };
  return (
    <div className="vf-h2hwrap card">
      <div className="vf-h2h-head">
        <div className="t-label">Head-to-head</div>
        <button className="btn btn-quiet btn-sm" onClick={onClose} style={{minHeight:28,padding:'2px 8px'}}>✕ feed</button>
      </div>
      <div className="vf-h2h-scoreline">
        <span className="vf-h2h-side"><b>You</b><span className="mono">{me.total}</span></span>
        <span className={'vf-h2h-verdict '+(diff>0?'is-win':diff<0?'is-loss':'is-draw')}>
          {diff>0?'WINNING':diff<0?'LOSING':'LEVEL'} <span className="mono">{diff>0?'+':''}{diff}</span>
        </span>
        <span className="vf-h2h-side"><b>{m.short}</b><span className="mono">{opp.total}</span></span>
      </div>
      <div className="vf-h2h-upside t-caption">
        <span><b style={{color:'var(--text-primary)'}}>{me.ytp}</b> of yours still to play</span>
        <span><b style={{color:'var(--text-primary)'}}>{opp.ytp}</b> of theirs still to play</span>
      </div>
      <div className="vf-h2h-cols">{col(me,true)}{col(opp,false)}</div>
    </div>
  );
}

// ---- live feed (right rail default) ----
function FeedPanel({ feed, freshIds }) {
  return (
    <div className="vf-feedpanel card">
      <div className="vf-feed-head"><div className="t-label">Scoring feed</div><span className="t-micro text-tertiary">{feed.length} events</span></div>
      <div className="vf-feed-list">
        {feed.length===0 && <div className="vf-feed-empty t-sm text-tertiary">No scoring yet — matches just getting underway.</div>}
        {feed.map((it,i)=> <FeedItem key={it.player.id+'-'+it.min+'-'+it.type} it={it} fresh={freshIds&&freshIds.has(it.player.id+'-'+it.min+'-'+it.type)} />)}
      </div>
    </div>
  );
}

// ---- season power-record standings ----
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

// ---- the desktop app body ----
function DesktopVsField({ t, conn, view, setView, field, season, feed, freshIds, selected, setSelected, activeMatch, setActiveMatch }) {
  const me = field.snaps.find(s=>s.id===ME_ID);
  const loading = conn==='loading';
  const empty = field.snaps.every(s=>s.total===0);
  const lastUpd = conn==='stale' ? '1:34 ago' : 'just now';
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
            <div className="vf-main">
              {loading ? <FieldSkeleton/> : <FieldTable field={field} dimLive={conn!=='live'} onSelect={(id)=> setSelected(sel=> sel===id?null:id)} selected={selected} />}
            </div>
            <div className="vf-rail">
              {loading ? <div className="vf-hero card" style={{height:340}}><span className="skeleton" style={{width:'100%',height:'100%',display:'block',borderRadius:12}}></span></div>
                : <YouVsField field={field} />}
              {!loading && (selected
                ? <H2HDetail field={field} oppId={selected} onClose={()=>setSelected(null)} />
                : <FeedPanel feed={feed} freshIds={freshIds} />)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

window.DesktopVsField = DesktopVsField;
