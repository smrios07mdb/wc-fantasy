// vsfield2/app.jsx — store + simulation + the production stage:
// desktop (Direction A) + mobile (Direction A) side by side, driven by ONE shared live sim.
const { useState, useEffect, useRef, useMemo, useCallback } = React;

function computeSeason(field){
  const liveById = {}; field.snaps.forEach(s => liveById[s.id] = s.total);
  const periodsPts = [{}, {}, liveById];
  MANAGERS.forEach(m => { periodsPts[0][m.id] = SEASON_PTS[m.id][0]; periodsPts[1][m.id] = SEASON_PTS[m.id][1]; });
  const recs = periodsPts.map(recordForPeriod);
  const rows = MANAGERS.map(m => {
    const periods = periodsPts.map((pp,i)=>({ pts:pp[m.id], rec:recs[i][m.id] }));
    const W = periods.reduce((s,p)=>s+p.rec.W,0), L = periods.reduce((s,p)=>s+p.rec.L,0);
    const D = periods.reduce((s,p)=>s+p.rec.D,0), pts = periods.reduce((s,p)=>s+p.pts,0);
    return { id:m.id, W,L,D, pts, periods };
  });
  rows.sort((a,b)=> b.W-a.W || b.pts-a.pts);
  return rows;
}

function useFitScale(contentW, contentH){
  const ref = useRef(null);
  const [scale, setScale] = useState(1);
  useEffect(()=>{
    const el = ref.current; if(!el) return;
    const fit = () => { const w = el.clientWidth-8, h = el.clientHeight-8; if(w<=0||h<=0) return; setScale(Math.min(1, w/contentW, h/contentH)); };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    window.addEventListener('resize', fit);
    return ()=>{ ro.disconnect(); window.removeEventListener('resize', fit); };
  }, [contentW, contentH]);
  return [ref, scale];
}

// ---- desktop match strip ----
function V2MatchCard({ m, t, active, onPick }){
  const sc = matchScore(m, t);
  const live = sc.st.phase==='live';
  const clock = sc.st.phase==='ytp' ? 'KO soon' : sc.st.phase==='final' ? 'FT' : sc.st.min+"'";
  return (
    <button className={'v2-match'+(active?' is-active':'')} onClick={()=>onPick&&onPick(m.id)}>
      <div className={'v2-match-clock '+(live?'is-live':sc.st.phase==='final'?'is-final':'is-ytp')}>{live&&<span className="v2-livedot"></span>}{clock}</div>
      <div className="v2-match-teams">
        <span className="v2-mt"><Flag nat={m.home}/><b>{m.home}</b></span>
        <span className="mono v2-match-score">{sc.st.phase==='ytp'?'–':sc.h+'–'+sc.a}</span>
        <span className="v2-mt"><Flag nat={m.away}/><b>{m.away}</b></span>
      </div>
    </button>
  );
}
function V2MatchStrip({ t, activeMatch, onPick }){
  return (
    <div className="v2-matchstrip">
      <span className="t-label" style={{alignSelf:'center',whiteSpace:'nowrap'}}>Today</span>
      <div className="v2-matchstrip-scroll">{MATCHES.map(m => <V2MatchCard key={m.id} m={m} t={t} active={activeMatch===m.id} onPick={onPick} />)}</div>
    </div>
  );
}

// ---- desktop app chrome wrapping Direction A ----
function DesktopApp({ field, season, feed, freshIds, t, conn, view, setView, selected, setSelected, activeMatch, setActiveMatch }){
  const lastUpd = conn==='stale' ? '1:34 ago' : 'just now';
  const ranked = field.ranked;
  const myIdx = ranked.findIndex(s=>s.id===ME_ID);
  const defRival = (ranked[myIdx-1] || ranked[myIdx+1] || ranked.find(s=>s.id!==ME_ID));
  const effSel = selected || (defRival && defRival.id);
  return (
    <div className="v2-app">
      <div className="v2-top">
        <div className="v2-top-brand">
          <div className="vf-logo">W</div>
          <div>
            <b className="display">Vs the Field</b>
            <div className="t-micro text-tertiary">{PERIOD.label.toUpperCase()} · {PERIOD.sub.toUpperCase()}</div>
          </div>
        </div>
        <div className="tabs v2-viewtabs">
          {[['period','This period'],['season','Season']].map(([k,l])=>(
            <button key={k} className={'tab'+(view===k?' is-active':'')} onClick={()=>{setView(k); setSelected(null);}}>{l}</button>
          ))}
        </div>
        <div style={{flex:1}}></div>
        <div className="v2-top-right">
          <span className="t-micro text-tertiary">Updated {lastUpd}</span>
          <ConnPill state={conn} />
        </div>
      </div>
      {conn==='reconnecting' && <div className="v2-banner v2-banner-recon"><span className="spinner" style={{width:13,height:13}}></span>Reconnecting to live scoring — showing last known points.</div>}
      {conn==='stale' && <div className="v2-banner v2-banner-stale">Scores may be delayed — last confirmed update {lastUpd}. Live indicators paused.</div>}
      {view==='season'
        ? <div style={{flex:1,minHeight:0,overflowY:'auto',padding:'18px'}}><SeasonTable season={season} /></div>
        : <>
            <V2MatchStrip t={t} activeMatch={activeMatch} onPick={setActiveMatch} />
            <DirectionA field={field} t={t} conn={conn} effSel={effSel} setSelected={setSelected} />
            <FeedTicker feed={feed} freshIds={freshIds} />
          </>}
    </div>
  );
}

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "cobalt",
  "theme": "dark",
  "density": "compact"
}/*EDITMODE-END*/;

function App(){
  const [tw, setTweak] = useTweaks(TWEAK_DEFAULTS);
  useEffect(()=>{
    const el = document.documentElement;
    el.setAttribute('data-accent', tw.accent);
    el.setAttribute('data-theme', tw.theme);
    el.setAttribute('data-density', tw.density);
  }, [tw.accent, tw.theme, tw.density]);

  const [t, setT] = useState(DEFAULT_MIN);
  const [playing, setPlaying] = useState(false);
  const [conn, setConn] = useState('live');
  const [view, setView] = useState('period');
  const [selected, setSelected] = useState(null);
  const [activeMatch, setActiveMatch] = useState(null);
  const [freshIds, setFreshIds] = useState(()=>new Set());
  const prevT = useRef(t);

  useEffect(()=>{
    if(!playing) return;
    const id = setInterval(()=> setT(x => x>=PERIOD_END ? x : x+1), 850);
    return ()=>clearInterval(id);
  }, [playing]);
  useEffect(()=>{ if(playing && t>=PERIOD_END) setPlaying(false); }, [t, playing]);

  const field = useMemo(()=> evalField(t), [t]);
  const feed  = useMemo(()=> feedUpTo(t), [t]);
  const season = useMemo(()=> computeSeason(field), [field]);

  useEffect(()=>{
    const lo = prevT.current, hi = t;
    if (hi > lo){
      const set = new Set();
      feed.forEach(it => { const abs = it.match.ko+it.min; if (abs>lo && abs<=hi) set.add(it.player.id+'-'+it.min+'-'+it.type); });
      if (set.size){ setFreshIds(set); const id=setTimeout(()=>setFreshIds(new Set()),900); prevT.current=hi; return ()=>clearTimeout(id); }
    }
    prevT.current = hi;
  }, [t]); // eslint-disable-line

  const scrub = (v)=>{ setPlaying(false); setT(+v); };
  const shared = { field, season, feed, freshIds, t, conn, view, setView, selected, setSelected, activeMatch, setActiveMatch };

  const CONTENT_W = 1180 + 26 + 402;
  const CONTENT_H = 868;
  const [fitRef, scale] = useFitScale(CONTENT_W, CONTENT_H);
  const mm = String(t).padStart(2,'0');

  return (
    <div className="vf-stage">
      <div className="vf-stagebar">
        <div className="vf-sb-title">
          <div className="vf-logo">W</div>
          <div><b className="display" style={{fontSize:15,lineHeight:1}}>Vs the Field — live surface</b>
          <div className="t-micro text-tertiary">Desktop + mobile · same state, two form factors</div></div>
        </div>
        <div className="vf-sb-sim">
          <button className="btn btn-primary btn-sm" onClick={()=>setPlaying(p=>!p)}>{playing?'❚❚ Pause':'▶ Play'}</button>
          <div className="vf-sb-clock mono">{mm}'<span className="text-tertiary" style={{fontSize:11}}> / {PERIOD_END}'</span></div>
          <input className="vf-sb-range" type="range" min="0" max={PERIOD_END} value={t} onChange={e=>scrub(e.target.value)} />
          <div className="vf-sb-jumps">
            <button className="btn btn-ghost btn-sm" onClick={()=>scrub(0)} title="Pre-kickoff (empty state)">Kickoff</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>scrub(DEFAULT_MIN)}>Now</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>scrub(PERIOD_END)}>Full time</button>
          </div>
        </div>
        <div className="vf-sb-conn">
          <span className="t-label" style={{marginRight:2}}>Feed</span>
          {['live','reconnecting','stale','loading'].map(c=>(
            <button key={c} className={'vf-connbtn'+(conn===c?' is-active':'')} onClick={()=>setConn(c)}>{c==='reconnecting'?'recon':c}</button>
          ))}
        </div>
      </div>

      <div className="vf-legendbar">
        <span className="vf-leg vf-leg-live"><i></i><b>Playing</b> — on the pitch now, locked</span>
        <span className="vf-leg vf-leg-final"><i></i><b>Played</b> — banked &amp; locked</span>
        <span className="vf-leg vf-leg-ytp"><i></i><b>To play</b> — pending, still swappable</span>
        <span className="t-caption text-tertiary" style={{marginLeft:'auto'}}>Pick a manager on the left to compare · point values illustrative pending SCORING.md</span>
      </div>

      <div className="vf-fit" ref={fitRef}>
        <div className="vf-frames" style={{ width:CONTENT_W, height:CONTENT_H, transform:`scale(${scale})` }}>
          <div className="vf-browser" style={{ width:1180, height:812 }}>
            <div className="vf-bw-bar">
              <span className="vf-bw-dot"></span><span className="vf-bw-dot"></span><span className="vf-bw-dot"></span>
              <div className="vf-bw-url">worldcupfantasy.app/league/vs-the-field</div>
              <span className="vf-bw-tag">Desktop · 1180×812</span>
            </div>
            <div className="vf-bw-body">
              <DesktopApp {...shared} />
            </div>
          </div>
          <div className="vf-phone">
            <MobileVsFieldA {...shared} />
            <div className="vf-phone-badge t-micro">Mobile · iPhone</div>
          </div>
        </div>
      </div>

      <TweaksPanel>
        <TweakSection label="Accent — marks YOU + primary actions only" />
        <TweakRadio label="Accent" value={tw.accent} options={['cobalt','green','violet']} onChange={v=>setTweak('accent', v)} />
        <TweakSection label="Appearance" />
        <TweakRadio label="Theme" value={tw.theme} options={['dark','light']} onChange={v=>setTweak('theme', v)} />
        <TweakRadio label="Density" value={tw.density} options={['compact','comfortable']} onChange={v=>setTweak('density', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
