// notifs/app.jsx — store + sim (clock drives live arrivals + toasts) + stage + tweaks.
const { useState, useEffect, useRef, useMemo } = React;

function useFitScaleNt(contentW, contentH){
  const ref = useRef(null);
  const [scale, setScale] = useState(1);
  useEffect(()=>{
    const el = ref.current; if(!el) return;
    const fit = () => {
      const w = el.clientWidth - 8, h = el.clientHeight - 8;
      if (w <= 0) return;
      setScale(Math.max(0.05, Math.min(1, w/contentW, h>0 ? h/contentH : 1)));
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    window.addEventListener('resize', fit);
    return ()=>{ ro.disconnect(); window.removeEventListener('resize', fit); };
  }, [contentW, contentH]);
  return [ref, scale];
}

const NT_TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "group": "time",
  "toasts": "on"
}/*EDITMODE-END*/;

function App(){
  const [tw, setTweak] = useTweaks(NT_TWEAK_DEFAULTS);
  useEffect(()=>{
    const el = document.documentElement;
    el.setAttribute('data-accent', 'cobalt');
    el.setAttribute('data-theme', tw.theme);
    el.setAttribute('data-density', 'comfortable');
  }, [tw.theme]);

  const [t, setT] = useState(DEFAULT_MIN);
  const [playing, setPlaying] = useState(false);
  useEffect(()=>{ if(!playing) return;
    const id = setInterval(()=> setT(x => x>=PERIOD_END ? x : x+1), 80);
    return ()=>clearInterval(id);
  }, [playing]);
  useEffect(()=>{ if(playing && t>=PERIOD_END) setPlaying(false); }, [t, playing]);

  // read state + ui
  const initRead = () => new Set(NOTIF_HISTORY.filter(n=>n.read).map(n=>n.id));
  const [readIds, setReadIds] = useState(initRead);
  const [filter, setFilter] = useState('all');
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [quiet, setQuiet] = useState(false);
  const [prefRows, setPrefRows] = useState(NOTIF_PREF_ROWS);
  const [toasts, setToasts] = useState([]);

  // live arrivals → toast. seed "already arrived" with everything up to the initial minute so we
  // don't spam toasts on load; only NEW crossings (while playing/scrubbing forward) pop.
  const seenRef = useRef(new Set(NOTIF_LIVE.filter(e=>e.min<=DEFAULT_MIN).map(e=>e.id)));
  const toastTimers = useRef({});
  const showToasts = tw.toasts !== 'off';
  useEffect(()=>{
    NOTIF_LIVE.forEach(e=>{
      if (e.min<=t && !seenRef.current.has(e.id)){
        seenRef.current.add(e.id);
        if (!showToasts) return;
        setToasts(list => [{ ...e, ageMin:0, live:true, _k:e.id+'_'+Date.now() }, ...list].slice(0,3));
        const k = e.id;
        toastTimers.current[k] = setTimeout(()=> setToasts(list => list.filter(x=>x.id!==k)), 6000);
      }
    });
  }, [t, showToasts]);
  useEffect(()=>()=>{ Object.values(toastTimers.current).forEach(clearTimeout); }, []);
  const dismissToast = (id)=> setToasts(list => list.filter(x=>x.id!==id));
  const pingToast = ()=>{
    const k = 'ping_'+Date.now();
    const sample = { id:k, _k:k, cat:'score', tone:'win', live:true, ageMin:0,
      title:'GOAL — V. Júnior +5', body:'Brazil lead Portugal 1–0. Your forward extends your lead.',
      cta:{ label:'Vs the field', href:'Vs the Field.html' } };
    setToasts(list => [sample, ...list].slice(0,3));
    toastTimers.current[k] = setTimeout(()=> setToasts(list => list.filter(x=>x.id!==k)), 6000);
  };

  // feed
  const rawFeed = useMemo(()=> buildFeed(t), [t]);
  const feed = useMemo(()=> rawFeed.map(n=>({ ...n, read: readIds.has(n.id) })), [rawFeed, readIds]);
  const filtered = filter==='all' ? feed : feed.filter(n=>n.cat===filter);
  const counts = useMemo(()=>{ const c={}; NOTIF_FILTERS.forEach(f=>{ c[f] = feed.filter(n=>(f==='all'||n.cat===f) && !n.read).length; }); return c; }, [feed]);
  const unread = counts.all;

  const onRead = (id)=> setReadIds(s => { const n=new Set(s); n.add(id); return n; });
  const onReadAll = ()=> setReadIds(s => { const n=new Set(s); feed.forEach(x=>n.add(x.id)); return n; });
  const onPrefToggle = (cat,chan)=> setPrefRows(rows => rows.map(r=> r.cat===cat ? { ...r, [chan]:!r[chan] } : r));

  const reset = ()=>{ setPlaying(false); setT(DEFAULT_MIN); setReadIds(initRead());
    seenRef.current = new Set(NOTIF_LIVE.filter(e=>e.min<=DEFAULT_MIN).map(e=>e.id)); setToasts([]); setFilter('all'); };

  const shared = { feed:filtered, filter, setFilter, counts, group:tw.group, onRead, onReadAll, unread,
    prefsOpen, setPrefsOpen, prefRows, onPrefToggle, quiet, setQuiet, theme:tw.theme };

  const CONTENT_W = 1180 + 28 + 402;
  const CONTENT_H = 920;
  const [fitRef, scale] = useFitScaleNt(CONTENT_W, CONTENT_H);
  const mm = String(t).padStart(2,'0');

  return (
    <div className="vf-stage">
      <div className="vf-stagebar">
        <div className="vf-sb-title">
          <div className="vf-logo">W</div>
          <div><b className="display" style={{fontSize:15, lineHeight:1, whiteSpace:'nowrap'}}>Notifications</b>
          <div className="t-micro text-tertiary" style={{whiteSpace:'nowrap'}}>Live alerts · {unread} unread</div></div>
        </div>

        <div className="vf-sb-sim">
          <button className="btn btn-primary btn-sm" onClick={()=>setPlaying(p=>!p)}>{playing?'❚❚ Pause':'▶ Play'}</button>
          <div className="vf-sb-clock mono">MD3 {mm}'</div>
          <input className="vf-sb-range" type="range" min="0" max={PERIOD_END} value={t} onChange={e=>{setPlaying(false); setT(+e.target.value);}} style={{width:120}}/>
          <div className="vf-sb-jumps">
            <button className="btn btn-ghost btn-sm" onClick={()=>{setPlaying(false); setT(0);}} title="Before kickoff">Pre-KO</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>{setPlaying(false); setT(DEFAULT_MIN);}}>Now</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>{setPlaying(false); setT(PERIOD_END);}} title="Full-time — all alerts in">Full-time</button>
          </div>
        </div>

        <div className="vf-sb-conn">
          <button className="vf-connbtn" onClick={pingToast}>🔔 Test alert</button>
          <button className="vf-connbtn" onClick={reset}>↺ Reset</button>
          <span className="t-micro text-tertiary" style={{whiteSpace:'nowrap'}}>Play past 130′ for live arrivals</span>
        </div>
      </div>

      <div className="vf-fit" ref={fitRef}>
        <div className="vf-frames" style={{ width:CONTENT_W, height:CONTENT_H, transform:`scale(${scale})` }}>
          <div className="vf-browser">
            <div className="vf-bw-bar">
              <span className="vf-bw-dot" style={{background:'var(--surface-4)'}}></span>
              <span className="vf-bw-dot" style={{background:'var(--surface-4)'}}></span>
              <span className="vf-bw-dot" style={{background:'var(--surface-4)'}}></span>
              <div className="vf-bw-url"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>worldcupfantasy.app/notifications</div>
              <span className="vf-bw-badge t-micro">Desktop · 1180×768</span>
            </div>
            <div className="vf-bw-body nt-bw-body">
              <DesktopNotifs {...shared}/>
              {toasts.length>0 && <div className="nt-toastwrap">{toasts.map(tt => <NotifToast key={tt._k} n={tt} onClose={()=>dismissToast(tt.id)}/>)}</div>}
            </div>
          </div>
          <div className="vf-phone">
            <MobileNotifs {...shared}/>
            {toasts.length>0 && <div className="mnt-toastwrap">{toasts.slice(0,1).map(tt => <NotifToast key={tt._k} n={tt} onClose={()=>dismissToast(tt.id)}/>)}</div>}
            <div className="vf-phone-badge t-micro">Mobile · iPhone</div>
          </div>
        </div>
      </div>

      <TweaksPanel>
        <TweakSection label="Feed" />
        <TweakRadio label="Group by" value={tw.group} options={[{value:'time',label:'Time'},{value:'category',label:'Category'}]} onChange={v=>setTweak('group', v)} />
        <TweakRadio label="In-app toasts" value={tw.toasts} options={[{value:'on',label:'On'},{value:'off',label:'Off'}]} onChange={v=>setTweak('toasts', v)} />
        <TweakSection label="Appearance" />
        <TweakRadio label="Theme" value={tw.theme} options={['dark','light']} onChange={v=>setTweak('theme', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
