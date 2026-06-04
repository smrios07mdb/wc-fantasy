// playoffs/app.jsx — store + sim + fit-scaled desktop+mobile stage + tweaks for Guillotine playoffs.
const { useState, useEffect, useRef, useMemo } = React;

function useFitScalePo(contentW, contentH){
  const ref = useRef(null);
  const [scale, setScale] = useState(1);
  useEffect(()=>{
    const el = ref.current; if(!el) return;
    const fit = () => {
      const w = el.clientWidth - 8, h = el.clientHeight - 8;
      if (w <= 0) return;                        // guard: clientWidth can read 0 mid-layout → negative scale
      setScale(Math.max(0.05, Math.min(1, w/contentW, h>0 ? h/contentH : 1)));
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    window.addEventListener('resize', fit);
    return ()=>{ ro.disconnect(); window.removeEventListener('resize', fit); };
  }, [contentW, contentH]);
  return [ref, scale];
}

const PO_TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "field": "10",
  "layout": "board",
  "detail": "on",
  "cuts": "default"
}/*EDITMODE-END*/;

function App(){
  const [tw, setTweak] = useTweaks(PO_TWEAK_DEFAULTS);
  useEffect(()=>{
    const el = document.documentElement;
    el.setAttribute('data-accent', 'cobalt');       // accent LOCKED — marks only YOU + primary actions
    el.setAttribute('data-theme', tw.theme);
    el.setAttribute('data-density', 'comfortable');  // density LOCKED
  }, [tw.theme]);

  // sim — scrubbing the live round (Round 2) moves points → the cut line reforms live
  const [t, setT] = useState(DEFAULT_MIN);
  const [playing, setPlaying] = useState(false);
  const [conn, setConn] = useState('live');

  useEffect(()=>{ if(!playing) return;
    const id = setInterval(()=> setT(x => x>=PERIOD_END ? x : x+1), 90);
    return ()=>clearInterval(id);
  }, [playing]);
  useEffect(()=>{ if(playing && t>=PERIOD_END) setPlaying(false); }, [t, playing]);

  const field  = parseInt(tw.field, 10) || PO_FIELD_DEFAULT;
  const preset = tw.cuts || 'default';
  const layout = tw.layout || 'board';
  const detail = (tw.detail||'on') === 'on';

  const model  = useMemo(()=> buildGuillotine(field, preset, t), [field, preset, t]);
  const lineup = useMemo(()=> myReducedLineup(), []);
  const pulse  = useScorePulse(model.me ? model.me.pts : 0);

  // which round the board inspects — default to the live round; reset when field/preset change
  const [view, setView] = useState(model.currentRoundIdx);
  useEffect(()=>{ setView(model.currentRoundIdx); }, [field, preset]);
  const safeView = Math.min(view, model.totalRounds - 1);

  const shared = { model, view:safeView, onView:setView, layout, detail, lineup, t, conn, theme:tw.theme, pulse };

  const CONTENT_W = 1180 + 28 + 402;
  const CONTENT_H = 1130;
  const [fitRef, scale] = useFitScalePo(CONTENT_W, CONTENT_H);
  const mm = String(t).padStart(2,'0');

  return (
    <div className="vf-stage">
      <div className="vf-stagebar">
        <div className="vf-sb-title">
          <div className="vf-logo">W</div>
          <div><b className="display" style={{fontSize:15, lineHeight:1, whiteSpace:'nowrap'}}>Guillotine playoffs</b>
          <div className="t-micro text-tertiary" style={{whiteSpace:'nowrap'}}>Round {model.currentRoundIdx+1} · live</div></div>
        </div>

        <div className="vf-sb-sim">
          <button className="btn btn-primary btn-sm" onClick={()=>setPlaying(p=>!p)}>{playing?'❚❚ Pause':'▶ Play'}</button>
          <div className="vf-sb-clock mono">R{model.currentRoundIdx+1} {mm}'</div>
          <input className="vf-sb-range" type="range" min="0" max={PERIOD_END} value={t} onChange={e=>{setPlaying(false); setT(+e.target.value);}} style={{width:130}}/>
          <div className="vf-sb-jumps">
            <button className="btn btn-ghost btn-sm" onClick={()=>{setPlaying(false); setT(0);}} title="Before the round — all level, ranked by seed">Pre-round</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>{setPlaying(false); setT(DEFAULT_MIN);}}>Now</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>{setPlaying(false); setT(PERIOD_END);}} title="Round final — the blade drops">Blade drops</button>
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
              <div className="vf-bw-url"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>worldcupfantasy.app/league/playoffs</div>
              <span className="vf-bw-badge t-micro">Desktop · 1180×768</span>
            </div>
            <div className="vf-bw-body"><DesktopPlayoffs {...shared}/></div>
          </div>
          <div className="vf-phone">
            <MobilePlayoffs {...shared}/>
            <div className="vf-phone-badge t-micro">Mobile · iPhone</div>
          </div>
        </div>
      </div>

      <TweaksPanel>
        <TweakSection label="Playoff field" />
        <TweakRadio label="Field size · top N qualify" value={tw.field} options={['8','10']} onChange={v=>setTweak('field', v)} />
        <TweakSelect label="Cut-count schedule (provisional)" value={tw.cuts}
          options={[{value:'default',label:'Taper · 2 → 1'},{value:'steep',label:'Steep · 2,2,2…'},{value:'gentle',label:'Gentle · 1,1,1…'}]}
          onChange={v=>setTweak('cuts', v)} />
        <TweakSection label="Layout" />
        <TweakRadio label="View" value={tw.layout} options={[{value:'board',label:'Round-board'},{value:'ladder',label:'Survival ladder'}]} onChange={v=>setTweak('layout', v)} />
        <TweakRadio label="Reduced-roster shape" value={tw.detail} options={[{value:'on',label:'Show'},{value:'off',label:'Hide'}]} onChange={v=>setTweak('detail', v)} />
        <TweakSection label="Appearance" />
        <TweakRadio label="Theme" value={tw.theme} options={['dark','light']} onChange={v=>setTweak('theme', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
