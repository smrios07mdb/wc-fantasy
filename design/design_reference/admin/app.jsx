// admin/app.jsx — store + sim + fit-scaled desktop+mobile stage + tweaks for the Commissioner console.
const { useState, useEffect, useRef, useMemo } = React;

function useFitScaleAdm(contentW, contentH){
  const ref = useRef(null);
  const [scale, setScale] = useState(1);
  useEffect(()=>{
    const el = ref.current; if(!el) return;
    const fit = () => {
      const w = el.clientWidth - 8, h = el.clientHeight - 8;
      if (w <= 0) return;                       // guard: clientWidth reads 0 mid-layout → negative scale
      setScale(Math.max(0.05, Math.min(1, w/contentW, h>0 ? h/contentH : 1)));
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    window.addEventListener('resize', fit);
    return ()=>{ ro.disconnect(); window.removeEventListener('resize', fit); };
  }, [contentW, contentH]);
  return [ref, scale];
}

const ADM_TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "layout": "live",
  "adminlook": "ribbon"
}/*EDITMODE-END*/;

function App(){
  const [tw, setTweak] = useTweaks(ADM_TWEAK_DEFAULTS);
  useEffect(()=>{
    const el = document.documentElement;
    el.setAttribute('data-accent', 'cobalt');        // accent LOCKED — marks only actions, never elevated state
    el.setAttribute('data-theme', tw.theme);
    el.setAttribute('data-density', 'comfortable');  // density LOCKED
  }, [tw.theme]);

  // ---- sim: the period clock drives match phases (stat-correction context, live flags) ----
  const [t, setT] = useState(DEFAULT_MIN);
  const [playing, setPlaying] = useState(false);
  const [poller, setPoller] = useState('live');       // live | silent
  useEffect(()=>{ if(!playing) return;
    const id = setInterval(()=> setT(x => x>=PERIOD_END ? x : x+1), 110);
    return ()=>clearInterval(id);
  }, [playing]);
  useEffect(()=>{ if(playing && t>=PERIOD_END) setPlaying(false); }, [t, playing]);
  const pollerSilent = poller==='silent';
  const agoSec = pollerSilent ? 196 : 9;

  // ---- commissioner state ----
  const [tab, setTab] = useState('field');
  const [field, setField] = useState(String(PO_FIELD_DEFAULT));
  const [preset, setPreset] = useState('default');
  const [fieldLocked, setFieldLocked] = useState(false);
  const [ops, setOps] = useState(OPS_DEFAULTS);
  const [draft, setDraft] = useState(DRAFT_CFG_DEFAULT);
  const [edits, setEdits] = useState({});             // playerId -> { line, reason, delta }
  const [sel, setSel] = useState('p13');              // the authored discrepancy, pre-selected
  const [search, setSearch] = useState('');
  const [viewAs, setViewAs] = useState(null);
  const [audit, setAudit] = useState(AUDIT_SEED);
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState(null);

  const flash = (msg, tone='success') => { setToast({ msg, tone }); setTimeout(()=>setToast(null), 2600); };
  const seqRef = useRef(0);
  const pushAudit = (entry) => setAudit(a => [{ id:'log-'+(++seqRef.current), actor:COMMISH_ID, ageMin:0, ...entry }, ...a]);

  // ---- actions (request* opens a confirm; the modal commits) ----
  const requestLockField = () => setConfirm({
    kind:'lock', danger:true, title:'Lock the playoff field', tone:'danger',
    intro:'Field size and cut schedule freeze for the entire playoffs. The bracket seeds from this and can’t be changed afterward.',
    rows:[ {k:'Field size', v:field+' seeds', accent:true}, {k:'Cut schedule', v:PO_PRESET_LABEL[preset]}, {k:'Affects', v:LEAGUE.managers+' managers'} ],
    confirmWord:'LOCK', confirmLabel:'Lock field',
    onConfirm:()=>{ setFieldLocked(true); pushAudit({ type:'lock', reversible:true,
      title:`Playoff field locked — ${field} seeds`, detail:`Cut schedule: ${PO_PRESET_LABEL[preset]}`, reason:'Group → playoff transition' });
      setConfirm(null); flash('Playoff field locked'); },
  });

  const requestToggleFreeze = (period, freeze) => {
    if (freeze) setConfirm({
      kind:'freeze', danger:true, title:`Freeze ${period.label}`, tone:'warn',
      intro:'Freezing locks every manager’s lineup and pauses scoring for this period until you unfreeze it.',
      rows:[ {k:'Period', v:period.label, accent:true}, {k:'Effect', v:'Lineups locked · scoring paused'}, {k:'Affects', v:LEAGUE.managers+' managers'} ],
      confirmWord:'FREEZE', confirmLabel:'Freeze period',
      onConfirm:()=>{ setOps(o=>({...o, freeze:{...o.freeze, [period.id]:true}}));
        pushAudit({ type:'freeze', reversible:true, title:`${period.label} frozen`, detail:'Lineups locked · scoring paused', reason:'Commissioner freeze' });
        setConfirm(null); flash(`${period.label} frozen`, 'warn'); },
    });
    else setConfirm({
      kind:'unfreeze', title:`Unfreeze ${period.label}`, tone:'accent',
      intro:'Re-opens lineups and resumes scoring for this period.',
      rows:[ {k:'Period', v:period.label, accent:true} ], confirmLabel:'Unfreeze',
      onConfirm:()=>{ setOps(o=>{ const f={...o.freeze}; delete f[period.id]; return {...o, freeze:f}; });
        pushAudit({ type:'unfreeze', reversible:true, title:`${period.label} unfrozen`, detail:'Lineups re-opened · scoring resumed', reason:null });
        setConfirm(null); flash(`${period.label} unfrozen`); },
    });
  };

  const requestApplyCorrection = (payload) => setConfirm({
    kind:'correct', title:'Apply stat correction', tone:'accent',
    intro:`Re-scores ${payload.name} for this period across every manager’s totals. Logged with your reason.`,
    rows:[ {k:'Player', v:payload.name, accent:true},
           {k:'Recorded → corrected', v:`${payload.recPts} → ${payload.newPts} pts`},
           {k:'Net change', v:`${payload.delta>0?'+':''}${payload.delta} pts`, accent:true},
           {k:'Reason', v:payload.reason} ],
    confirmLabel:'Apply correction',
    onConfirm:()=>{ setEdits(e=>({...e, [payload.id]:{ line:payload.line, reason:payload.reason, delta:payload.delta }}));
      pushAudit({ type:'stat', reversible:true, title:`Corrected ${payload.name}`, detail:payload.reason,
        reason:payload.reason, delta:`${payload.delta>0?'+':''}${payload.delta} pts` });
      setConfirm(null); flash('Correction applied & logged'); },
  });

  const requestReverse = (entry) => setConfirm({
    kind:'reverse', title:'Reverse this change', tone:'accent',
    intro:'Removes the change and its effect. The reversal itself stays in the log.',
    rows:[ {k:'Change', v:entry.title, accent:true}, {k:'Logged', v:agoLabel(entry.ageMin)} ],
    confirmLabel:'Reverse change',
    onConfirm:()=>{
      if (entry.type==='lock') setFieldLocked(false);
      if (entry.type==='freeze'){ /* leave freeze state; demo */ }
      // undo a session stat edit if this entry created one
      setAudit(a => a.filter(x=>x.id!==entry.id));
      flash('Change reversed'); setConfirm(null);
    },
  });

  const editCount = Object.keys(edits).length;
  const frozenCount = Object.values(ops.freeze).filter(Boolean).length;

  const ctx = {
    t, tab, setTab, field, setField, preset, setPreset, fieldLocked, requestLockField,
    ops, setOps, draft, setDraft, edits, sel, setSel, search, setSearch,
    requestApplyCorrection, requestToggleFreeze, requestReverse,
    viewAs, setViewAs, audit, pollerSilent, agoSec, editCount, frozenCount,
  };
  const shared = { look: tw.adminlook, layout: tw.layout, ctx, theme: tw.theme };

  const CONTENT_W = 1180 + 28 + 402;
  const CONTENT_H = 1010;
  const [fitRef, scale] = useFitScaleAdm(CONTENT_W, CONTENT_H);
  const mm = String(t).padStart(2,'0');

  return (
    <div className="vf-stage">
      <div className="vf-stagebar">
        <div className="vf-sb-title">
          <div className="vf-logo">W</div>
          <div><b className="display" style={{fontSize:15, lineHeight:1, whiteSpace:'nowrap'}}>Commissioner</b>
          <div className="t-micro text-tertiary" style={{whiteSpace:'nowrap'}}>Admin · elevated</div></div>
        </div>

        <div className="vf-sb-sim">
          <button className="btn btn-primary btn-sm" onClick={()=>setPlaying(p=>!p)}>{playing?'❚❚ Pause':'▶ Play'}</button>
          <div className="vf-sb-clock mono">MD3 {mm}'</div>
          <input className="vf-sb-range" type="range" min="0" max={PERIOD_END} value={t} onChange={e=>{setPlaying(false); setT(+e.target.value);}} style={{width:120}}/>
          <div className="vf-sb-jumps">
            <button className="btn btn-ghost btn-sm" onClick={()=>{setPlaying(false); setT(0);}} title="Before kickoff — all players movable">Pre-KO</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>{setPlaying(false); setT(DEFAULT_MIN);}}>Now</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>{setPlaying(false); setT(PERIOD_END);}} title="All matches final">Full-time</button>
          </div>
        </div>

        <div className="vf-sb-conn">
          <span className="t-label" style={{margin:'0 2px'}}>Poller</span>
          {['live','silent'].map(c=>(
            <button key={c} className={'vf-connbtn'+(poller===c?' is-active':'')} onClick={()=>setPoller(c)} title={c==='silent'?'Simulate the live feed going dark':'Feed healthy'}>{c}</button>
          ))}
          {viewAs && <button className="vf-connbtn" onClick={()=>setViewAs(null)} title="Exit impersonation">↩ Exit view-as</button>}
        </div>
      </div>

      <div className="vf-fit" ref={fitRef}>
        <div className="vf-frames" style={{ width:CONTENT_W, height:CONTENT_H, transform:`scale(${scale})` }}>
          <div className="vf-browser">
            <div className="vf-bw-bar">
              <span className="vf-bw-dot" style={{background:'var(--surface-4)'}}></span>
              <span className="vf-bw-dot" style={{background:'var(--surface-4)'}}></span>
              <span className="vf-bw-dot" style={{background:'var(--surface-4)'}}></span>
              <div className="vf-bw-url"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>worldcupfantasy.app/league/admin</div>
              <span className="vf-bw-badge t-micro">Desktop · 1180×768</span>
            </div>
            <div className="vf-bw-body"><DesktopAdmin {...shared}/></div>
          </div>
          <div className="vf-phone">
            <MobileAdmin {...shared}/>
            <div className="vf-phone-badge t-micro">Mobile · iPhone</div>
          </div>
        </div>
      </div>

      {confirm && <ConfirmModal open={true} {...confirm} onClose={()=>setConfirm(null)}/>}
      {toast && <div className={'adm-toast toast toast-'+(toast.tone==='warn'?'warn':toast.tone)}>
        <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>
        <span>{toast.msg}</span></div>}

      <TweaksPanel>
        <TweakSection label="Admin look" />
        <TweakSelect label="Elevated-privileges treatment" value={tw.adminlook}
          options={[{value:'ribbon',label:'Minimal ribbon'},{value:'banner',label:'Commissioner banner'},{value:'steel',label:'Steel panels'},{value:'warning',label:'Warning tone'}]}
          onChange={v=>setTweak('adminlook', v)} />
        <TweakSection label="Layout" />
        <TweakRadio label="Console layout" value={tw.layout}
          options={[{value:'live',label:'Live editing'},{value:'spine',label:'Audit spine'}]}
          onChange={v=>setTweak('layout', v)} />
        <TweakSection label="Appearance" />
        <TweakRadio label="Theme" value={tw.theme} options={['dark','light']} onChange={v=>setTweak('theme', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
