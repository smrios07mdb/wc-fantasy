// settings/app.jsx — store (profile/appearance→root) + fit-scaled stage + tweaks for Settings.
const { useState, useEffect, useRef, useMemo } = React;

function useFitScaleSt(contentW, contentH){
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

const ST_TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "layout": "sidebar",
  "header": "banner"
}/*EDITMODE-END*/;

function resolveTheme(t){
  if (t!=='system') return t;
  return (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
}

function App(){
  const [tw, setTweak] = useTweaks(ST_TWEAK_DEFAULTS);

  const [profile, setProfile] = useState(PROFILE_INIT);
  const [appearance, setAppearance] = useState(APPEARANCE_INIT);
  const [prefRows, setPrefRows] = useState(NOTIF_PREF_ROWS);
  const [quiet, setQuiet] = useState(false);
  const [tz, setTz] = useState(TIMEZONES[0]);
  const [active, setActive] = useState('profile');
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState(null);

  const theme = resolveTheme(appearance.theme);
  // Appearance is a REAL product setting — drive the document root so both frames re-theme live.
  useEffect(()=>{
    const el = document.documentElement;
    el.setAttribute('data-theme', theme);
    el.setAttribute('data-accent', appearance.accent);
    el.setAttribute('data-density', appearance.density);
    el.toggleAttribute('data-reduce-motion', !!appearance.reduceMotion);
  }, [theme, appearance.accent, appearance.density, appearance.reduceMotion]);

  // light "saved" affirmation when profile/appearance/prefs change
  const firstRun = useRef(true);
  useEffect(()=>{ if (firstRun.current){ firstRun.current=false; return; }
    setToast('Changes saved'); const id=setTimeout(()=>setToast(null), 1600); return ()=>clearTimeout(id);
  }, [profile, appearance, prefRows, quiet, tz]);

  const onPrefToggle = (cat,chan)=> setPrefRows(rows => rows.map(r=> r.cat===cat ? { ...r, [chan]:!r[chan] } : r));
  const onConfirm = (kind)=> setConfirm(kind);

  const ctx = { profile, setProfile, appearance, setAppearance, prefRows, onPrefToggle, quiet, setQuiet, tz, setTz,
    header: tw.header, onConfirm };
  const shared = { active, setActive, layout: tw.layout, ctx, theme };

  const CONTENT_W = 1180 + 28 + 402;
  const CONTENT_H = 920;
  const [fitRef, scale] = useFitScaleSt(CONTENT_W, CONTENT_H);

  return (
    <div className="vf-stage">
      <div className="vf-stagebar">
        <div className="vf-sb-title">
          <div className="vf-logo">W</div>
          <div><b className="display" style={{fontSize:15, lineHeight:1, whiteSpace:'nowrap'}}>Settings</b>
          <div className="t-micro text-tertiary" style={{whiteSpace:'nowrap'}}>Profile &amp; preferences</div></div>
        </div>
        <div className="vf-sb-sim">
          <span className="t-label" style={{margin:'0 2px'}}>Section</span>
          {SETTINGS_SECTIONS.map(s=>(
            <button key={s.id} className={'vf-connbtn'+(active===s.id?' is-active':'')} onClick={()=>setActive(s.id)}>{s.label.split(' ')[0]}</button>
          ))}
        </div>
        <div className="vf-sb-conn">
          <button className="vf-connbtn" onClick={()=>{ setProfile(PROFILE_INIT); setAppearance(APPEARANCE_INIT); setPrefRows(NOTIF_PREF_ROWS); setTz(TIMEZONES[0]); setActive('profile'); }}>↺ Reset</button>
        </div>
      </div>

      <div className="vf-fit" ref={fitRef}>
        <div className="vf-frames" style={{ width:CONTENT_W, height:CONTENT_H, transform:`scale(${scale})` }}>
          <div className="vf-browser">
            <div className="vf-bw-bar">
              <span className="vf-bw-dot" style={{background:'var(--surface-4)'}}></span>
              <span className="vf-bw-dot" style={{background:'var(--surface-4)'}}></span>
              <span className="vf-bw-dot" style={{background:'var(--surface-4)'}}></span>
              <div className="vf-bw-url"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>worldcupfantasy.app/settings</div>
              <span className="vf-bw-badge t-micro">Desktop · 1180×768</span>
            </div>
            <div className="vf-bw-body st-bw-body"><DesktopSettings {...shared}/></div>
          </div>
          <div className="vf-phone">
            <MobileSettings {...shared}/>
            <div className="vf-phone-badge t-micro">Mobile · iPhone</div>
          </div>
        </div>
      </div>

      {confirm && <div className="st-scrim" onMouseDown={()=>setConfirm(null)}>
        <div className="st-modal" onMouseDown={e=>e.stopPropagation()}>
          <div className="st-modal-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 3l9 16H3l9-16z"/><path d="M12 10v4M12 17h.01"/></svg></div>
          <h3 className="st-modal-title">{confirm==='leave'?'Leave the league?':'Delete your account?'}</h3>
          <p className="st-modal-body">{confirm==='leave'
            ? 'Your 15-man squad is released to free agency and your seed is forfeited. This can’t be undone.'
            : 'This permanently removes your profile, squad and history across every league. This can’t be undone.'}</p>
          <div className="st-modal-foot">
            <button className="btn btn-ghost" onClick={()=>setConfirm(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={()=>{ setConfirm(null); setToast(confirm==='leave'?'Left the league (demo)':'Account deleted (demo)'); setTimeout(()=>setToast(null),1800); }}>{confirm==='leave'?'Leave league':'Delete account'}</button>
          </div>
        </div>
      </div>}

      {toast && <div className="st-toast"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 13l4 4L19 7"/></svg>{toast}</div>}

      <TweaksPanel>
        <TweakSection label="Layout" />
        <TweakRadio label="Desktop layout" value={tw.layout} options={[{value:'sidebar',label:'Sidebar'},{value:'stacked',label:'Single page'}]} onChange={v=>setTweak('layout', v)} />
        <TweakRadio label="Profile header" value={tw.header} options={[{value:'banner',label:'Banner'},{value:'plain',label:'Plain'}]} onChange={v=>setTweak('header', v)} />
        <TweakSection label="Note" />
        <div style={{ font:'11px/1.5 var(--font-sans)', color:'rgba(41,38,27,.6)' }}>Theme, accent &amp; density live in the in-product <b>Appearance</b> section — they re-theme both frames live.</div>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
