// standings/app.jsx — store + sim + stage + tweaks for Standings (desktop + mobile, one sim).
const { useState, useEffect, useRef, useMemo } = React;

function useFitScaleStTop(contentW){
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

const ST_TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "field": "8"
}/*EDITMODE-END*/;

function App(){
  const [tw, setTweak] = useTweaks(ST_TWEAK_DEFAULTS);
  useEffect(()=>{
    const el = document.documentElement;
    el.setAttribute('data-accent', 'cobalt');
    el.setAttribute('data-theme', tw.theme);
    el.setAttribute('data-density', 'comfortable');
  }, [tw.theme]);

  // sim — scrubbing the live matchday (md3) moves points → standings reorder live
  const [t, setT] = useState(SL_DEFAULT_MIN);
  const [playing, setPlaying] = useState(false);
  const [conn, setConn] = useState('live');
  const [expanded, setExpanded] = useState(ME_ID);

  useEffect(()=>{ if(!playing) return;
    const id = setInterval(()=> setT(x => x>=PERIOD_END ? x : x+1), 700);
    return ()=>clearInterval(id);
  }, [playing]);
  useEffect(()=>{ if(playing && t>=PERIOD_END) setPlaying(false); }, [t, playing]);

  const field = parseInt(tw.field, 10) || ST_FIELD_DEFAULT;
  const rows = useMemo(()=> cutContext(buildStandings(t), field), [t, field]);

  const shared = { rows, field, expanded, onExpand:setExpanded, conn, theme:tw.theme };

  const CONTENT_W = 1180 + 28 + 402;
  const CONTENT_H = 1000;
  const [fitRef, scale] = useFitScaleStTop(CONTENT_W);
  const mm = String(t).padStart(2,'0');

  return (
    <div className="vf-stage">
      <div className="vf-stagebar">
        <div className="vf-sb-title">
          <div className="vf-logo">W</div>
          <div><b className="display" style={{fontSize:15, lineHeight:1, whiteSpace:'nowrap'}}>Standings</b>
          <div className="t-micro text-tertiary" style={{whiteSpace:'nowrap'}}>Power record · live</div></div>
        </div>

        <div className="vf-sb-sim">
          <button className="btn btn-primary btn-sm" onClick={()=>setPlaying(p=>!p)}>{playing?'❚❚ Pause':'▶ Play'}</button>
          <div className="vf-sb-clock mono">MD3 {mm}'</div>
          <input className="vf-sb-range" type="range" min="0" max={PERIOD_END} value={t} onChange={e=>{setPlaying(false); setT(+e.target.value);}} style={{width:130}}/>
          <div className="vf-sb-jumps">
            <button className="btn btn-ghost btn-sm" onClick={()=>{setPlaying(false); setT(0);}} title="Before kickoff — md3 contributes 0">Pre-MD3</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>{setPlaying(false); setT(SL_DEFAULT_MIN);}}>Now</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>{setPlaying(false); setT(PERIOD_END);}} title="All matches final">Full-time</button>
          </div>
        </div>

        <div className="vf-sb-conn">
          <span className="t-label" style={{margin:'0 2px'}}>Feed</span>
          {['live','reconnecting','stale','loading'].map(c=>(
            <button key={c} className={'vf-connbtn'+(conn===c?' is-active':'')} onClick={()=>setConn(c)}>{c==='reconnecting'?'recon':c}</button>
          ))}
        </div>
      </div>

      <div className="vf-fit" ref={fitRef}>
        <div className="vf-frames" style={{ width:CONTENT_W, height:CONTENT_H, transform:`scale(${scale})` }}>
          <div className="vf-browser">
            <div className="vf-bw-bar">
              <span className="vf-bw-dot" style={{background:'var(--surface-4)'}}></span>
              <span className="vf-bw-dot" style={{background:'var(--surface-4)'}}></span>
              <span className="vf-bw-dot" style={{background:'var(--surface-4)'}}></span>
              <div className="vf-bw-url"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>worldcupfantasy.app/league/standings</div>
              <span className="vf-bw-badge t-micro">Desktop · 1180×768</span>
            </div>
            <div className="vf-bw-body"><DesktopStandings {...shared}/></div>
          </div>
          <div className="vf-phone">
            <MobileStandings {...shared}/>
            <div className="vf-phone-badge t-micro">Mobile · iPhone</div>
          </div>
        </div>
      </div>

      <TweaksPanel>
        <TweakSection label="Playoff field" />
        <TweakRadio label="Cut line · top N advance" value={tw.field} options={['8','10']} onChange={v=>setTweak('field', v)} />
        <TweakSection label="Appearance" />
        <TweakRadio label="Theme" value={tw.theme} options={['dark','light']} onChange={v=>setTweak('theme', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
