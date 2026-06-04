// dashboard/app.jsx — store + sim + phase switcher + stage + tweaks for the home.
const { useState, useEffect, useRef, useMemo } = React;

function useFitScaleDb(contentW){
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

const DB_TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "model": "hub",
  "layout": "grid"
}/*EDITMODE-END*/;

function App(){
  const [tw, setTweak] = useTweaks(DB_TWEAK_DEFAULTS);
  useEffect(()=>{
    const el = document.documentElement;
    el.setAttribute('data-accent', 'cobalt');
    el.setAttribute('data-theme', tw.theme);
    el.setAttribute('data-density', 'comfortable');
  }, [tw.theme]);

  const [t, setT] = useState(SL_DEFAULT_MIN);
  const [playing, setPlaying] = useState(false);
  const [conn, setConn] = useState('live');
  const [phase, setPhase] = useState('group');

  useEffect(()=>{ if(!playing) return;
    const id = setInterval(()=> setT(x => x>=SL_DEADLINE+8 ? x : x+1), 850);
    return ()=>clearInterval(id);
  }, [playing]);
  useEffect(()=>{ if(playing && t>=SL_DEADLINE+8) setPlaying(false); }, [t, playing]);

  const livePhase = phase==='group' || phase==='playoff';
  const shared = { phase, model:tw.model, layout:tw.layout, t, conn, theme:tw.theme };

  const CONTENT_W = 1180 + 28 + 402;
  const CONTENT_H = 1000;
  const [fitRef, scale] = useFitScaleDb(CONTENT_W);
  const mm = String(t).padStart(2,'0');

  return (
    <div className="vf-stage">
      <div className="vf-stagebar">
        <div className="vf-sb-title">
          <div className="vf-logo">W</div>
          <div><b className="display" style={{fontSize:15, lineHeight:1, whiteSpace:'nowrap'}}>Dashboard</b>
          <div className="t-micro text-tertiary" style={{whiteSpace:'nowrap'}}>Status-aware home</div></div>
        </div>

        {/* phase switcher — the 5 league states */}
        <div className="db-phasebar">
          <span className="t-label" style={{whiteSpace:'nowrap'}}>League phase</span>
          <div className="db-phaseseg">
            {PHASES.map(p=>(
              <button key={p.id} className={'db-phasebtn'+(phase===p.id?' is-active':'')} onClick={()=>setPhase(p.id)}>{p.tab}</button>
            ))}
          </div>
        </div>

        <div className="vf-sb-sim" style={{flex:'none', minWidth:0, opacity:livePhase?1:0.45, pointerEvents:livePhase?'auto':'none'}}>
          <button className="btn btn-primary btn-sm" onClick={()=>setPlaying(p=>!p)}>{playing?'❚❚':'▶'}</button>
          <div className="vf-sb-clock mono">{mm}'</div>
          <input className="vf-sb-range" type="range" min="0" max={SL_DEADLINE+8} value={t} onChange={e=>{setPlaying(false); setT(+e.target.value);}} style={{width:120}}/>
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
              <div className="vf-bw-url"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>worldcupfantasy.app/league</div>
              <span className="vf-bw-badge t-micro">Desktop · 1180×768</span>
            </div>
            <div className="vf-bw-body"><DesktopDash {...shared}/></div>
          </div>
          <div className="vf-phone">
            <MobileDash {...shared}/>
            <div className="vf-phone-badge t-micro">Mobile · iPhone</div>
          </div>
        </div>
      </div>

      <TweaksPanel>
        <TweakSection label="Variations" />
        <TweakRadio label="Home model" value={tw.model} options={['hub','router']} onChange={v=>setTweak('model', v)} />
        <TweakRadio label="Hub layout" value={tw.layout} options={['grid','spotlight']} onChange={v=>setTweak('layout', v)} />
        <TweakSection label="Appearance" />
        <TweakRadio label="Theme" value={tw.theme} options={['dark','light']} onChange={v=>setTweak('theme', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
