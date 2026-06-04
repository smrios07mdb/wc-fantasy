// vsfield/app.jsx — store + simulation + side-by-side stage (desktop browser frame + iOS frame).
const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ---- season power-record: 2 completed periods (SEASON_PTS) + the live period (from sim) ----
function computeSeason(field){
  const liveById = {}; field.snaps.forEach(s => liveById[s.id] = s.total);
  const periodsPts = [{}, {}, liveById];
  MANAGERS.forEach(m => { periodsPts[0][m.id] = SEASON_PTS[m.id][0]; periodsPts[1][m.id] = SEASON_PTS[m.id][1]; });
  const recs = periodsPts.map(recordForPeriod);
  const rows = MANAGERS.map(m => {
    const periods = periodsPts.map((pp,i)=>({ pts:pp[m.id], rec:recs[i][m.id] }));
    const W = periods.reduce((s,p)=>s+p.rec.W,0);
    const L = periods.reduce((s,p)=>s+p.rec.L,0);
    const D = periods.reduce((s,p)=>s+p.rec.D,0);
    const pts = periods.reduce((s,p)=>s+p.pts,0);
    return { id:m.id, W,L,D, pts, periods };
  });
  rows.sort((a,b)=> b.W-a.W || b.pts-a.pts);
  return rows;
}

// fit the (fixed-width) two-frame row into the viewport
function useFitScale(contentW, contentH){
  const ref = useRef(null);
  const [scale, setScale] = useState(1);
  useEffect(()=>{
    const el = ref.current; if(!el) return;
    const fit = () => { const w = el.clientWidth - 8; setScale(Math.min(1, w/contentW)); };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    window.addEventListener('resize', fit);
    return ()=>{ ro.disconnect(); window.removeEventListener('resize', fit); };
  }, [contentW]);
  return [ref, scale];
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

  // shared sim state (both frames render the same state → responsive parity)
  const [t, setT] = useState(DEFAULT_MIN);
  const [playing, setPlaying] = useState(false);
  const [conn, setConn] = useState('live');
  const [view, setView] = useState('period');
  const [selected, setSelected] = useState(null);
  const [activeMatch, setActiveMatch] = useState(null);
  const [freshIds, setFreshIds] = useState(()=>new Set());
  const prevT = useRef(t);

  // play loop
  useEffect(()=>{
    if(!playing) return;
    const id = setInterval(()=> setT(x => { if(x>=PERIOD_END){ return x; } return x+1; }), 850);
    return ()=>clearInterval(id);
  }, [playing]);
  useEffect(()=>{ if(playing && t>=PERIOD_END) setPlaying(false); }, [t, playing]);

  const field = useMemo(()=> evalField(t), [t]);
  const feed  = useMemo(()=> feedUpTo(t), [t]);
  const season = useMemo(()=> computeSeason(field), [field]);

  // freshness: events whose absolute time crossed between prevT and t (forward only)
  useEffect(()=>{
    const lo = prevT.current, hi = t;
    if (hi > lo){
      const set = new Set();
      feed.forEach(it => { const abs = it.match.ko + it.min; if (abs > lo && abs <= hi) set.add(it.player.id+'-'+it.min+'-'+it.type); });
      if (set.size){ setFreshIds(set); const id=setTimeout(()=>setFreshIds(new Set()), 900); prevT.current=hi; return ()=>clearTimeout(id); }
    }
    prevT.current = hi;
  }, [t]); // eslint-disable-line

  const scrub = (v)=>{ setPlaying(false); setT(+v); };

  const sharedProps = { t, conn, view, setView, field, season, feed, freshIds, selected, setSelected, activeMatch, setActiveMatch };

  const CONTENT_W = 1180 + 28 + 402; // desktop + gap + phone
  const CONTENT_H = 868;
  const [fitRef, scale] = useFitScale(CONTENT_W, CONTENT_H);

  const mm = String(Math.floor(t/1)).padStart(2,'0');

  return (
    <div className="vf-stage">
      {/* presenter control bar (demo affordance, outside the product frames) */}
      <div className="vf-stagebar">
        <div className="vf-sb-title">
          <div className="vf-logo">W</div>
          <div><b className="display" style={{fontSize:15, lineHeight:1}}>Vs the Field — live surface</b>
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

      {/* legend — lock-on-play vocabulary */}
      <div className="vf-legendbar">
        <span className="vf-leg vf-leg-live"><i></i><b>Playing</b> — on the pitch now, locked</span>
        <span className="vf-leg vf-leg-final"><i></i><b>Played</b> — banked &amp; locked</span>
        <span className="vf-leg vf-leg-ytp"><i></i><b>To play</b> — pending, still swappable</span>
        <span className="t-caption text-tertiary" style={{marginLeft:'auto'}}>Point values illustrative · final scoring per SCORING.md</span>
      </div>

      {/* fit-scaled side-by-side frames */}
      <div className="vf-fit" ref={fitRef}>
        <div className="vf-frames" style={{ width:CONTENT_W, height:CONTENT_H, transform:`scale(${scale})` }}>
          {/* desktop in a browser window */}
          <div className="vf-browser">
            <div className="vf-bw-bar">
              <span className="vf-bw-dot" style={{background:'var(--surface-4)'}}></span>
              <span className="vf-bw-dot" style={{background:'var(--surface-4)'}}></span>
              <span className="vf-bw-dot" style={{background:'var(--surface-4)'}}></span>
              <div className="vf-bw-url"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>worldcupfantasy.app/league/vs-the-field</div>
              <span className="vf-bw-badge t-micro">Desktop · 1180×768</span>
            </div>
            <div className="vf-bw-body">
              <DesktopVsField {...sharedProps} />
            </div>
          </div>
          {/* mobile in iOS frame */}
          <div className="vf-phone">
            <MobileVsField {...sharedProps} />
            <div className="vf-phone-badge t-micro">Mobile · iPhone</div>
          </div>
        </div>
      </div>

      {/* Tweaks */}
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
