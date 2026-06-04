// roster/app.jsx — store + sim + stage + tweaks for My Team / Roster (side-by-side).
const { useState, useEffect, useRef, useMemo } = React;

function useFitScaleRt(contentW){
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

const RT_TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "layout": "grouped"
}/*EDITMODE-END*/;

function App(){
  const [tw, setTweak] = useTweaks(RT_TWEAK_DEFAULTS);
  useEffect(()=>{
    const el = document.documentElement;
    el.setAttribute('data-accent', 'cobalt');
    el.setAttribute('data-theme', tw.theme);
    el.setAttribute('data-density', 'comfortable');
  }, [tw.theme]);

  // ---- sim ----
  const [t, setT] = useState(SL_DEFAULT_MIN);
  const [playing, setPlaying] = useState(false);
  const [conn, setConn] = useState('live');

  // ---- squad (drop removes a player → demonstrates legality) ----
  const [squad, setSquad] = useState(SQUAD);
  const resetSquad = ()=> setSquad(SQUAD);

  // starters from my default lineup (roster reflects, doesn't edit, the XI)
  const startSet = useMemo(()=>{
    const lu = buildLineup('group','4-3-3');
    const ids = LANES.flatMap(pos => lu.slots[pos]).filter(Boolean);
    return new Set(ids);
  }, []);

  // ---- overlays ----
  const [menu, setMenu] = useState(null);        // desktop dropdown { id, rect }
  const [mobileMenuId, setMobileMenuId] = useState(null);
  const [scoreId, setScoreId] = useState(null);  // points breakdown
  const [dropId, setDropId] = useState(null);    // drop confirm
  const [sort, setSort] = useState({ key:'pos', dir:'asc' });

  // play loop
  useEffect(()=>{ if(!playing) return;
    const id = setInterval(()=> setT(x => x>=SL_DEADLINE+8 ? x : x+1), 850);
    return ()=>clearInterval(id);
  }, [playing]);
  useEffect(()=>{ if(playing && t>=SL_DEADLINE+8) setPlaying(false); }, [t, playing]);

  const periodTotal = useMemo(()=>{
    let total = 0;
    squad.forEach(p => { if (startSet.has(p.id)) total += evalSquadPlayer(p.id, t).pts; });
    return total;
  }, [squad, startSet, t]);

  const onScore = (id)=> setScoreId(id);
  const onMenu = (id, el)=> setMenu({ id, rect: el.getBoundingClientRect() });
  const onMobileMenu = (id)=> setMobileMenuId(id);
  const onDrop = (id)=> setDropId(id);
  const onLineup = ()=>{ window.location.href = 'Set Lineup.html'; };
  const onBox = (id)=>{ window.location.href = 'Player Box Score.html?p='+id; };
  const confirmDrop = (id)=> setSquad(prev => prev.filter(p=>p.id!==id));

  const shared = { squad, t, startSet, layout:tw.layout, onScore, onMenu, menuId: menu&&menu.id,
    onMobileMenu, conn, periodTotal, sort, setSort, theme: tw.theme };

  const CONTENT_W = 1180 + 28 + 402;
  const CONTENT_H = 1000;
  const [fitRef, scale] = useFitScaleRt(CONTENT_W);
  const mm = String(t).padStart(2,'0');
  const dropped = ROSTER_TOTAL - squad.length;

  return (
    <div className="vf-stage">
      {/* presenter control bar */}
      <div className="vf-stagebar">
        <div className="vf-sb-title">
          <div className="vf-logo">W</div>
          <div><b className="display" style={{fontSize:15, lineHeight:1, whiteSpace:'nowrap'}}>My Team</b>
          <div className="t-micro text-tertiary" style={{whiteSpace:'nowrap'}}>Roster · lock-on-play</div></div>
        </div>

        <div className="vf-sb-sim">
          <button className="btn btn-primary btn-sm" onClick={()=>setPlaying(p=>!p)}>{playing?'❚❚ Pause':'▶ Play'}</button>
          <div className="vf-sb-clock mono">{mm}'<span className="text-tertiary" style={{fontSize:11}}> / {SL_DEADLINE}'</span></div>
          <input className="vf-sb-range" type="range" min="0" max={SL_DEADLINE+8} value={t} onChange={e=>{setPlaying(false); setT(+e.target.value);}}/>
          <div className="vf-sb-jumps">
            <button className="btn btn-ghost btn-sm" onClick={()=>{setPlaying(false); setT(0);}} title="Pre-kickoff — whole squad movable">Kickoff</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>{setPlaying(false); setT(SL_DEFAULT_MIN);}}>Now</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>{setPlaying(false); setT(SL_DEADLINE);}} title="All matches kicked off — squad frozen">Deadline</button>
          </div>
        </div>

        <div className="vf-sb-conn">
          {dropped>0 && <button className="vf-connbtn" onClick={resetSquad} title="Restore dropped players">↺ Restore squad</button>}
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
              <div className="vf-bw-url"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>worldcupfantasy.app/league/team</div>
              <span className="vf-bw-badge t-micro">Desktop · 1180×768</span>
            </div>
            <div className="vf-bw-body"><DesktopRoster {...shared}/></div>
          </div>
          <div className="vf-phone">
            <MobileRoster {...shared}/>
            <div className="vf-phone-badge t-micro">Mobile · iPhone</div>
          </div>
        </div>
      </div>

      {/* overlays (rendered at stage level so they sit above the scaled frames) */}
      {menu && <RowMenu id={menu.id} t={t} rect={menu.rect} onClose={()=>setMenu(null)} onScore={onScore} onBox={onBox} onDrop={onDrop} onLineup={onLineup}/>}
      {mobileMenuId && <MobileActionSheet id={mobileMenuId} t={t} onClose={()=>setMobileMenuId(null)} onScore={onScore} onBox={onBox} onDrop={onDrop} onLineup={onLineup}/>}
      <PlayerScoreSheet id={scoreId} t={t} onClose={()=>setScoreId(null)}/>
      <DropConfirm id={dropId} t={t} onClose={()=>setDropId(null)} onConfirm={confirmDrop}/>

      {/* Tweaks */}
      <TweaksPanel>
        <TweakSection label="Variations" />
        <TweakRadio label="Roster layout" value={tw.layout} options={['grouped','table']} onChange={v=>setTweak('layout', v)} />
        <TweakSection label="Appearance" />
        <TweakRadio label="Theme" value={tw.theme} options={['dark','light']} onChange={v=>setTweak('theme', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
