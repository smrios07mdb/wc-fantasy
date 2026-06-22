// matchdetail/app.jsx — store + match-clock sim + side-by-side stage for Match Detail.
const { useState, useEffect, useRef, useMemo } = React;

function useFitScale(contentW){
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
  "density": "comfortable",
  "statStyle": "bars"
}/*EDITMODE-END*/;

function App(){
  const [tw, setTweak] = useTweaks(TWEAK_DEFAULTS);
  useEffect(()=>{
    const el = document.documentElement;
    el.setAttribute('data-accent', tw.accent);
    el.setAttribute('data-theme', tw.theme);
    el.setAttribute('data-density', tw.density);
  }, [tw.accent, tw.theme, tw.density]);

  // ---- match clock sim ----
  const [t, setT] = useState(MD_DEFAULT_MIN);
  const [playing, setPlaying] = useState(false);
  const [conn, setConn] = useState('live');

  // ---- view state (shared across both frames) ----
  const [tab, setTab] = useState('lineups');
  const [half, setHalf] = useState('all');
  const [sheet, setSheet] = useState(null);   // { p, team }

  useEffect(()=>{ if(!playing) return;
    const id = setInterval(()=> setT(x => x>=MD_FT ? x : x+1), 700);
    return ()=>clearInterval(id);
  }, [playing]);
  useEffect(()=>{ if(playing && t>=MD_FT) setPlaying(false); }, [t, playing]);
  // 1st-half stat view only valid once half-time reached
  useEffect(()=>{ if(half==='first' && t<MD_HT) setHalf('all'); }, [t, half]);

  const onOpen = (p, team)=> setSheet({ p, team });

  const shared = { t, tab, setTab, statMode:tw.statStyle, half, setHalf, onOpen, conn };

  const CONTENT_W = 1180 + 28 + 402;
  const CONTENT_H = 980;
  const [fitRef, scale] = useFitScale(CONTENT_W);
  const ph = mdPhase(t);

  return (
    <div className="vf-stage">
      {/* presenter control bar */}
      <div className="vf-stagebar">
        <div className="vf-sb-title">
          <div className="vf-logo">W</div>
          <div><b className="display" style={{fontSize:15, lineHeight:1, whiteSpace:'nowrap'}}>Match Detail</b>
          <div className="t-micro text-tertiary" style={{whiteSpace:'nowrap'}}>Spain v Saudi Arabia · live</div></div>
        </div>

        <div className="vf-sb-sim">
          <button className="btn btn-primary btn-sm" onClick={()=>setPlaying(p=>!p)}>{playing?'❚❚ Pause':'▶ Play'}</button>
          <div className="vf-sb-clock mono">{ph.clock}<span className="text-tertiary" style={{fontSize:11}}> / {MD_FT}'</span></div>
          <input className="vf-sb-range" type="range" min="0" max={MD_FT} value={t} onChange={e=>{setPlaying(false); setT(+e.target.value);}}/>
          <div className="vf-sb-jumps">
            <button className="btn btn-ghost btn-sm" onClick={()=>{setPlaying(false); setT(0);}} title="Pre-kickoff">Kick-off</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>{setPlaying(false); setT(MD_DEFAULT_MIN);}}>Now</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>{setPlaying(false); setT(MD_HT);}} title="Half-time">HT</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>{setPlaying(false); setT(MD_FT);}} title="Full-time">FT</button>
          </div>
        </div>

        <div className="vf-sb-conn">
          <span className="t-label" style={{margin:'0 2px'}}>Feed</span>
          {['live','reconnecting','stale','loading'].map(c=>(
            <button key={c} className={'vf-connbtn'+(conn===c?' is-active':'')} onClick={()=>setConn(c)}>{c==='reconnecting'?'recon':c}</button>
          ))}
        </div>
      </div>

      {/* fit-scaled side-by-side frames */}
      <div className="vf-fit" ref={fitRef}>
        <div className="vf-frames" style={{ width:CONTENT_W, height:CONTENT_H, transform:`scale(${scale})` }}>
          <div className="vf-browser">
            <div className="vf-bw-bar">
              <span className="vf-bw-dot" style={{background:'var(--surface-4)'}}></span>
              <span className="vf-bw-dot" style={{background:'var(--surface-4)'}}></span>
              <span className="vf-bw-dot" style={{background:'var(--surface-4)'}}></span>
              <div className="vf-bw-url"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>worldcupfantasy.app/match/esp-ksa</div>
              <span className="vf-bw-badge t-micro">Desktop · 1180×980</span>
            </div>
            <div className="vf-bw-body"><DesktopMatch {...shared}/></div>
          </div>
          <div className="vf-phone">
            <MobileMatch {...shared}/>
            <div className="vf-phone-badge t-micro">Mobile · iPhone</div>
          </div>
        </div>
      </div>

      {/* player sheet — rendered once, overlays both frames */}
      {sheet && <MatchPlayerSheet p={sheet.p} team={sheet.team} t={t} onClose={()=>setSheet(null)}/>}

      {/* Tweaks */}
      <TweaksPanel>
        <TweakSection label="Statistics" />
        <TweakRadio label="Stat presentation" value={tw.statStyle} options={['bars','numbers']} onChange={v=>setTweak('statStyle', v)} />
        <TweakSection label="Appearance" />
        <TweakRadio label="Theme" value={tw.theme} options={['dark','light']} onChange={v=>setTweak('theme', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
