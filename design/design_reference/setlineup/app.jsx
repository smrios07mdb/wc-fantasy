// setlineup/app.jsx — store + sim + interaction wiring + side-by-side stage for Set Lineup.
const { useState, useEffect, useRef, useMemo, useCallback } = React;

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

function relTime(ts){
  const s = Math.max(0, Math.floor((Date.now()-ts)/1000));
  if (s<25) return 'just now';
  if (s<90) return '1 min ago';
  return Math.floor(s/60)+' min ago';
}

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "cobalt",
  "theme": "dark",
  "density": "comfortable",
  "swapMode": "drag",
  "tokenStyle": "jersey",
  "heroVariant": "summary"
}/*EDITMODE-END*/;

function App(){
  const [tw, setTweak] = useTweaks(TWEAK_DEFAULTS);
  useEffect(()=>{
    const el = document.documentElement;
    el.setAttribute('data-accent', tw.accent);
    el.setAttribute('data-theme', tw.theme);
    el.setAttribute('data-density', tw.density);
  }, [tw.accent, tw.theme, tw.density]);

  // ---- sim ----
  const [t, setT] = useState(SL_DEFAULT_MIN);
  const [playing, setPlaying] = useState(false);
  const [conn, setConn] = useState('live');
  const [poDemo, setPoDemo] = useState(false);

  // ---- periods + per-period lineups (set lineups in advance) ----
  const periods = useMemo(()=> poDemo ? [...PERIODS, PLAYOFF_PERIOD] : PERIODS, [poDemo]);
  const [periodId, setPeriodId] = useState('md3');
  const period = periods.find(p=>p.id===periodId) || PERIODS[0];
  const mode = period.kind; // 'group' | 'playoff'

  const [lineups, setLineups] = useState(()=>({
    md3: buildLineup('group','4-3-3'),
    md4: buildLineup('group','3-5-2'),
    r1:  buildLineup('playoff','2-3-1'),
  }));
  const lineup = lineups[periodId];

  // ---- selection / drag (shared across both frames) ----
  const [sel, setSel] = useState(null);
  const [drag, setDragState] = useState(null);   // { from }
  const [scoreId, setScoreId] = useState(null);  // open points breakdown
  const [savedAt, setSavedAt] = useState(Date.now());
  const [, force] = useState(0);

  // play loop
  useEffect(()=>{ if(!playing) return;
    const id = setInterval(()=> setT(x => x>=SL_DEADLINE+8 ? x : x+1), 850);
    return ()=>clearInterval(id);
  }, [playing]);
  useEffect(()=>{ if(playing && t>=SL_DEADLINE+8) setPlaying(false); }, [t, playing]);
  // ticking "last saved"
  useEffect(()=>{ const id=setInterval(()=>force(n=>n+1), 12000); return ()=>clearInterval(id); }, []);

  // clear selection when context shifts or a selected player freezes
  useEffect(()=>{ setSel(null); }, [periodId, mode, lineup.formation]);
  useEffect(()=>{ if (sel && sel.id && isLocked(sel.id, t)) setSel(null); }, [t, sel]);

  // toggling playoff demo jumps you to / away from the playoff round
  const togglePo = () => setPoDemo(v=>{ const nv=!v; setPeriodId(nv?'r1':'md3'); return nv; });

  const markSaved = ()=> setSavedAt(Date.now());
  const setLineup = (next)=>{ setLineups(prev=>({ ...prev, [periodId]: next })); markSaved(); };

  // ---- interaction ----
  const selectable = (cell)=> cell.id==null ? true : !isLocked(cell.id, t);
  const commit = (a,b)=>{ setLineup(applySwap(lineup, a, b)); setSel(null); setDragState(null); };
  const clear = ()=> setSel(null);

  const onCellTap = (cell)=>{
    if (tw.swapMode==='sheet'){
      if (!sel){ if (selectable(cell)) setSel(cell); }
      return; // targets chosen inside the sheet
    }
    // tap (and drag-fallback) logic
    if (!sel){ if (selectable(cell)) setSel(cell); return; }
    if (cellKey(cell)===cellKey(sel)){ setSel(null); return; }
    if (canSwap(sel, cell, t)){ commit(sel, cell); return; }
    if (selectable(cell)){ setSel(cell); return; }
    setSel(null);
  };

  const dragApi = tw.swapMode==='drag' ? {
    from: drag && drag.from,
    onDragStart:(cell)=> setDragState({ from:cell }),
    onDragEnd:()=> setDragState(null),
    onDrop:(cell)=>{ if (drag && drag.from && canSwap(drag.from, cell, t)) commit(drag.from, cell); setDragState(null); },
  } : null;

  const activeSel = sel || (drag && drag.from) || null;
  const eligibleKeys = useMemo(()=>{
    if (!activeSel) return new Set();
    return new Set(eligibleTargets(lineup, activeSel, t).map(cellKey));
  }, [activeSel, lineup, t]);

  const ix = { sel, eligibleKeys, onCellTap, clear, commit, drag: dragApi, swapMode: tw.swapMode, openScore: setScoreId };
  window.__lineup = lineup; // for SwapSheet

  const summary = useMemo(()=> lineupSummary(lineup, mode, t), [lineup, mode, t]);
  const onPickFormation = (f)=>{ setLineup(reshape(lineup, mode, f, t)); };

  const lastSaved = relTime(savedAt);
  const shared = { lineup, t, mode, period, tokenStyle:tw.tokenStyle, heroVariant:tw.heroVariant,
    swapMode:tw.swapMode, ix, conn, lastSaved, summary, onPickFormation, periods, periodId, setPeriodId };

  const CONTENT_W = 1180 + 28 + 402;
  const CONTENT_H = 1000;
  const [fitRef, scale] = useFitScale(CONTENT_W);
  const mm = String(t).padStart(2,'0');

  return (
    <div className="vf-stage">
      {/* presenter control bar */}
      <div className="vf-stagebar">
        <div className="vf-sb-title">
          <div className="vf-logo">W</div>
          <div><b className="display" style={{fontSize:15, lineHeight:1, whiteSpace:'nowrap'}}>Set Lineup</b>
          <div className="t-micro text-tertiary" style={{whiteSpace:'nowrap'}}>Lock-on-play surface</div></div>
        </div>

        <div className="vf-sb-sim">
          <button className="btn btn-primary btn-sm" onClick={()=>setPlaying(p=>!p)}>{playing?'❚❚ Pause':'▶ Play'}</button>
          <div className="vf-sb-clock mono">{mm}'<span className="text-tertiary" style={{fontSize:11}}> / {SL_DEADLINE}'</span></div>
          <input className="vf-sb-range" type="range" min="0" max={SL_DEADLINE+8} value={t} onChange={e=>{setPlaying(false); setT(+e.target.value);}}/>
          <div className="vf-sb-jumps">
            <button className="btn btn-ghost btn-sm" onClick={()=>{setPlaying(false); setT(0);}} title="Pre-kickoff — full XI swappable">Kickoff</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>{setPlaying(false); setT(SL_DEFAULT_MIN);}}>Now</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>{setPlaying(false); setT(SL_DEADLINE);}} title="All matches kicked off — lineup frozen">Deadline</button>
          </div>
        </div>

        <div className="vf-sb-conn">
          <button className={'vf-connbtn'+(poDemo?' is-active':'')} onClick={togglePo} title="Switch surface to the reduced playoff roster">⚔ Playoff</button>
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
              <div className="vf-bw-url"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>worldcupfantasy.app/league/lineup</div>
              <span className="vf-bw-badge t-micro">Desktop · 1180×768</span>
            </div>
            <div className="vf-bw-body"><DesktopSetLineup {...shared}/></div>
          </div>
          <div className="vf-phone">
            <MobileSetLineup {...shared}/>
            <div className="vf-phone-badge t-micro">Mobile · iPhone</div>
          </div>
        </div>
      </div>

      {/* action-sheet swap mode overlay */}
      {tw.swapMode==='sheet' && sel && <SwapSheet ix={ix} t={t} onClose={clear}/>}

      {/* player points breakdown */}
      <PlayerScoreSheet id={scoreId} t={t} onClose={()=>setScoreId(null)}/>

      {/* Tweaks */}
      <TweaksPanel>
        <TweakSection label="Variations" />
        <TweakRadio label="Swap interaction" value={tw.swapMode} options={['drag','tap','sheet']} onChange={v=>{setSel(null); setDragState(null); setTweak('swapMode', v);}} />
        <TweakRadio label="Pitch tokens" value={tw.tokenStyle} options={['jersey','named','disc']} onChange={v=>setTweak('tokenStyle', v)} />
        <TweakRadio label="Lock hero" value={tw.heroVariant} options={['summary','deadline','pitch']} onChange={v=>setTweak('heroVariant', v)} />
        <TweakSection label="Appearance" />
        <TweakRadio label="Theme" value={tw.theme} options={['dark','light']} onChange={v=>setTweak('theme', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
