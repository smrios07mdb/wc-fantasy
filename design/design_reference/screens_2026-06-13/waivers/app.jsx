// waivers/app.jsx — store + sim + stage + tweaks for the FAAB waivers screen.
const { useState, useEffect, useRef, useMemo } = React;

function useFitScaleWv(contentW){
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

const WV_TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "results": "timeline"
}/*EDITMODE-END*/;

function App(){
  const [tw, setTweak] = useTweaks(WV_TWEAK_DEFAULTS);
  useEffect(()=>{
    const el = document.documentElement;
    el.setAttribute('data-accent', 'cobalt');
    el.setAttribute('data-theme', tw.theme);
    el.setAttribute('data-density', 'comfortable');
  }, [tw.theme]);

  const [t, setT] = useState(SL_DEFAULT_MIN);
  const [playing, setPlaying] = useState(false);
  const [conn, setConn] = useState('live');
  const [phase, setPhase] = useState('group');   // group | playoff (FAAB reset demo)
  const [tab, setTab] = useState('claims');
  const [bids, setBids] = useState(INITIAL_BIDS);
  const [composer, setComposer] = useState({ open:false, editBid:null });
  const [openP, setOpenP] = useState(null);

  useEffect(()=>{ if(!playing) return;
    const id = setInterval(()=> setT(x => x>=PERIOD_END ? x : x+1), 700);
    return ()=>clearInterval(id);
  }, [playing]);
  useEffect(()=>{ if(playing && t>=PERIOD_END) setPlaying(false); }, [t, playing]);

  const st = useMemo(()=> faabState(phase, bids, t), [phase, bids, t]);
  const priority = myWaiverPriority();

  const onAdd  = ()=> setComposer({ open:true, editBid:null });
  const onEdit = (bid)=> setComposer({ open:true, editBid:bid });
  const onCancel = (id)=> setBids(prev => prev.filter(b=>b.id!==id).map((b,i)=>({ ...b, priority:i+1 })));
  const onReorder = (id, dir)=> setBids(prev => {
    const arr = [...prev]; const i = arr.findIndex(b=>b.id===id); const j = i+dir;
    if (i<0 || j<0 || j>=arr.length) return prev;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    return arr.map((b,k)=>({ ...b, priority:k+1 }));
  });
  const onSubmit = (bid)=> { setBids(prev => {
    const exists = prev.some(b=>b.id===bid.id);
    const next = exists ? prev.map(b=> b.id===bid.id ? { ...b, ...bid } : b) : [...prev, bid];
    return next.map((b,i)=>({ ...b, priority:i+1 }));
  }); setComposer({ open:false, editBid:null }); };
  const resetBids = ()=> setBids(INITIAL_BIDS);

  const shared = { tab, setTab, bids, t, st, priority, phase, onAdd, onEdit, onCancel, onReorder,
    onPlayer:setOpenP, layout: tw.results, conn, theme: tw.theme };

  const CONTENT_W = 1180 + 28 + 402;
  const CONTENT_H = 1000;
  const [fitRef, scale] = useFitScaleWv(CONTENT_W);
  const mm = String(t).padStart(2,'0');

  return (
    <div className="vf-stage">
      <div className="vf-stagebar">
        <div className="vf-sb-title">
          <div className="vf-logo">W</div>
          <div><b className="display" style={{fontSize:15, lineHeight:1, whiteSpace:'nowrap'}}>Waivers</b>
          <div className="t-micro text-tertiary" style={{whiteSpace:'nowrap'}}>FAAB · blind bid</div></div>
        </div>

        <div className="vf-sb-sim">
          <button className="btn btn-primary btn-sm" onClick={()=>setPlaying(p=>!p)}>{playing?'❚❚ Pause':'▶ Play'}</button>
          <div className="vf-sb-clock mono">MD3 {mm}'</div>
          <input className="vf-sb-range" type="range" min="0" max={PERIOD_END} value={t} onChange={e=>{setPlaying(false); setT(+e.target.value);}} style={{width:120}}/>
          <div className="vf-sb-jumps">
            <button className="btn btn-ghost btn-sm" onClick={()=>{setPlaying(false); setT(0);}} title="Before any kickoff — all claims valid">Pre-KO</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>{setPlaying(false); setT(SL_DEFAULT_MIN);}}>Now</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>{setPlaying(false); setT(PERIOD_END);}} title="All matches started — early claims void+refund">All KO'd</button>
          </div>
        </div>

        <div className="vf-sb-conn">
          <button className={'vf-connbtn'+(phase==='playoff'?' is-active':'')} onClick={()=>setPhase(p=>p==='playoff'?'group':'playoff')} title="Demo the group→playoff FAAB reset">⚔ Playoff reset</button>
          {bids.length!==INITIAL_BIDS.length && <button className="vf-connbtn" onClick={resetBids} title="Restore demo claims">↺ Claims</button>}
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
              <div className="vf-bw-url"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>worldcupfantasy.app/league/waivers</div>
              <span className="vf-bw-badge t-micro">Desktop · 1180×768</span>
            </div>
            <div className="vf-bw-body"><DesktopWaivers {...shared}/></div>
          </div>
          <div className="vf-phone">
            <MobileWaivers {...shared}/>
            <div className="vf-phone-badge t-micro">Mobile · iPhone</div>
          </div>
        </div>
      </div>

      {composer.open && <BidComposer key={composer.editBid?composer.editBid.id:'new'} open={true} editBid={composer.editBid} t={t} bids={bids} st={st}
        onClose={()=>setComposer({ open:false, editBid:null })} onSubmit={onSubmit}/>}

      <FaPlayerCard p={openP} t={t} onBid={()=>{ setOpenP(null); setComposer({ open:true, editBid:null }); }} onClose={()=>setOpenP(null)}/>

      <TweaksPanel>
        <TweakSection label="Variations" />
        <TweakRadio label="Results layout" value={tw.results} options={['timeline','table']} onChange={v=>setTweak('results', v)} />
        <TweakSection label="Appearance" />
        <TweakRadio label="Theme" value={tw.theme} options={['dark','light']} onChange={v=>setTweak('theme', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
