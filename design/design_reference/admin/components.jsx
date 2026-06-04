// admin/components.jsx — presentational pieces for the Commissioner surface.
// Reuses globals: Pos, Flag, Avatar, ConnPill, mgr, MANAGERS, JERSEY_BG, NATIONS,
//   STAT_CATS, STAT_GROUPS, catPts, linePts, catApplies, statLine, admShort,
//   AUDIT_TYPE, agoLabel, fieldPlan, PO_PRESET_LABEL, playerMatchCtx, matchScore.
const { useState:useS, useEffect:useE, useRef:useR, useMemo:useM } = React;

// ----------------------------------------------------------------- atoms ---
// kit chip — national flag on a shirt (established pattern: JERSEY_BG, never background-size:cover)
function AdmKit({ nat, sm }){
  return <span className={'adm-kit'+(sm?' adm-kit-sm':'')}
    style={{ background: JERSEY_BG[nat] || (NATIONS[nat]||{}).f || 'var(--surface-4)' }}
    title={(NATIONS[nat]||{}).n}></span>;
}

// elevated-privileges badge — slate "system" treatment, NOT the cobalt action accent
function CommishBadge({ sm }){
  return (
    <span className={'adm-badge'+(sm?' adm-badge-sm':'')}>
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M13 2L4.5 13H11l-1 9 9-12h-6.5L13 2z"/></svg>
      Commissioner
    </span>
  );
}

// audit type glyph
function AuditGlyph({ type }){
  const s = { width:13, height:13, fill:'none', stroke:'currentColor', strokeWidth:2 };
  const ic = (AUDIT_TYPE[type]||{}).icon;
  if (ic==='edit')   return <svg viewBox="0 0 24 24" {...s}><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M13.5 6.5l3 3"/></svg>;
  if (ic==='snow')   return <svg viewBox="0 0 24 24" {...s}><path d="M12 2v20M4 7l16 10M20 7L4 17"/></svg>;
  if (ic==='thaw')   return <svg viewBox="0 0 24 24" {...s}><path d="M12 3v18"/><path d="M7 8l5 4 5-4"/></svg>;
  if (ic==='cut')    return <svg viewBox="0 0 24 24" {...s}><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.5 8L20 18M8.5 16L20 6"/></svg>;
  if (ic==='lock')   return <svg viewBox="0 0 24 24" {...s}><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>;
  if (ic==='shield') return <svg viewBox="0 0 24 24" {...s}><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z"/></svg>;
  if (ic==='pulse')  return <svg viewBox="0 0 24 24" {...s}><path d="M3 12h4l2-6 4 12 2-6h6"/></svg>;
  if (ic==='gear')   return <svg viewBox="0 0 24 24" {...s}><circle cx="12" cy="12" r="3.2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg>;
  return <svg viewBox="0 0 24 24" {...s}><circle cx="12" cy="12" r="9"/></svg>;
}

// generic admin card (header + body)
function AdmCard({ title, sub, right, children, danger, className }){
  return (
    <section className={'adm-card'+(danger?' is-danger':'')+(className?' '+className:'')}>
      {(title||right) &&
        <header className="adm-card-h">
          <div className="adm-card-ht">
            <h3 className="adm-card-title">{title}</h3>
            {sub && <span className="adm-card-sub">{sub}</span>}
          </div>
          {right}
        </header>}
      <div className="adm-card-b">{children}</div>
    </section>
  );
}

// illustrative-values flag
function IllusTag({ note='Illustrative · pending SCORING.md' }){
  return <span className="adm-illus" title="Point values are placeholders until SCORING.md is provided">
    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>{note}</span>;
}

// ----------------------------------------------------------------- admin ribbon (distinct chrome) ---
// The "elevated privileges" treatment. Default = minimal ribbon; other looks via the look Tweak.
function AdminRibbon({ look, viewAs, onClearViewAs }){
  const copy = {
    ribbon:  'Elevated privileges — every action is logged',
    banner:  'You have elevated privileges. Changes here affect all managers and are recorded in the audit log.',
    steel:   'Elevated privileges — every action is logged',
    warning: 'Powerful controls — changes affect every manager in the league. Proceed with care.',
  }[look] || 'Elevated privileges — every action is logged';
  return (
    <div className={'adm-ribbon adm-ribbon-'+look}>
      <span className="adm-ribbon-badge">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M13 2L4.5 13H11l-1 9 9-12h-6.5L13 2z"/></svg>
        Commissioner mode
      </span>
      <span className="adm-ribbon-copy">{copy}</span>
      {look==='warning' && <span className="adm-ribbon-stripes" aria-hidden="true"></span>}
    </div>
  );
}

// ----------------------------------------------------------------- view-as switcher ---
function ViewAsSwitcher({ value, onChange }){
  const [open, setOpen] = useS(false);
  const ref = useR(null);
  useE(()=>{ const f = e => { if(ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', f); return ()=>document.removeEventListener('mousedown', f); }, []);
  const cur = value ? mgr(value) : null;
  return (
    <div className="adm-viewas" ref={ref}>
      <button className={'adm-viewas-btn'+(cur?' is-active':'')} onClick={()=>setOpen(o=>!o)}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>
        {cur ? <>Viewing as <b>{cur.name}</b></> : <>View as…</>}
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" style={{opacity:.6}}><path d="M6 9l6 6 6-6"/></svg>
      </button>
      {open &&
        <div className="adm-viewas-menu">
          <div className="adm-viewas-head t-label">Impersonate a manager</div>
          <button className={'adm-viewas-opt'+(!value?' is-sel':'')} onClick={()=>{ onChange(null); setOpen(false); }}>
            <CommishBadge sm/> <span style={{marginLeft:'auto'}} className="t-caption text-tertiary">your seat</span>
          </button>
          <div className="adm-viewas-scroll">
            {MANAGERS.filter(m=>m.id!==COMMISH_ID).map(m=>(
              <button key={m.id} className={'adm-viewas-opt'+(value===m.id?' is-sel':'')} onClick={()=>{ onChange(m.id); setOpen(false); }}>
                <Avatar m={m} size="sm"/><span className="adm-viewas-name">{m.name}</span>
              </button>
            ))}
          </div>
        </div>}
    </div>
  );
}

// banner shown while impersonating
function ViewAsBanner({ value, onClear }){
  if (!value) return null;
  const m = mgr(value);
  return (
    <div className="adm-vab">
      <Avatar m={m} size="sm"/>
      <span className="adm-vab-txt">Viewing the app as <b>{m.name}</b> — read-only. Commissioner controls are hidden in this view.</span>
      <button className="btn btn-sm btn-primary" onClick={onClear}>Return to commissioner</button>
    </div>
  );
}

// ----------------------------------------------------------------- confirm / type-to-confirm modal ---
// confirmWord present → user must type it exactly (high-stakes). Otherwise a plain summary confirm.
function ConfirmModal({ open, kind, title, intro, rows, confirmWord, confirmLabel, tone='accent', danger, onConfirm, onClose }){
  const [typed, setTyped] = useS('');
  useE(()=>{ if(open) setTyped(''); }, [open, title]);
  if (!open) return null;
  const needType = !!confirmWord;
  const ok = !needType || typed.trim().toLowerCase() === confirmWord.toLowerCase();
  return (
    <div className="adm-scrim" onMouseDown={onClose}>
      <div className={'adm-modal'+(danger?' is-danger':'')} onMouseDown={e=>e.stopPropagation()}>
        <div className="adm-modal-h">
          <div className={'adm-modal-icon tone-'+tone}>
            {danger
              ? <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 3l9 16H3l9-16z"/><path d="M12 10v4M12 17h.01"/></svg>
              : <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>}
          </div>
          <div>
            <h3 className="adm-modal-title">{title}</h3>
            {intro && <p className="adm-modal-intro">{intro}</p>}
          </div>
        </div>
        {rows && rows.length>0 &&
          <div className="adm-modal-rows">
            {rows.map((r,i)=>(
              <div className="adm-modal-row" key={i}>
                <span className="adm-modal-row-k">{r.k}</span>
                <span className={'adm-modal-row-v'+(r.accent?' is-accent':'')}>{r.v}</span>
              </div>
            ))}
          </div>}
        {needType &&
          <div className="adm-modal-type">
            <label className="field-label">Type <b className="adm-type-word">{confirmWord}</b> to confirm</label>
            <input className="input" value={typed} onChange={e=>setTyped(e.target.value)} placeholder={confirmWord} autoFocus
              spellCheck={false} autoComplete="off"/>
          </div>}
        <div className="adm-modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className={'btn '+(danger?'btn-danger':'btn-primary')} disabled={!ok} onClick={()=>ok&&onConfirm()}>
            {confirmLabel||'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- settings rows / toggles ---
function SegRow({ label, hint, value, options, onChange, tone }){
  return (
    <div className="adm-seg-row">
      <div className="adm-seg-l"><div className="adm-seg-label">{label}</div>{hint && <div className="adm-seg-hint">{hint}</div>}</div>
      <div className={'adm-seg'+(tone?' tone-'+tone:'')}>
        {options.map(o=>{
          const v = typeof o==='object'?o.value:o, l = typeof o==='object'?o.label:o;
          return <button key={v} className={'adm-seg-btn'+(value===v?' is-active':'')} onClick={()=>onChange(v)}>{l}</button>;
        })}
      </div>
    </div>
  );
}
function Stepper({ value, min=0, max=99, onChange, danger }){
  return (
    <div className={'adm-stepper'+(danger&&value>0?' is-danger':'')}>
      <button className="adm-step-btn" disabled={value<=min} onClick={()=>onChange(Math.max(min,value-1))}>−</button>
      <span className="adm-step-val num">{value}</span>
      <button className="adm-step-btn" disabled={value>=max} onClick={()=>onChange(Math.min(max,value+1))}>+</button>
    </div>
  );
}

// ----------------------------------------------------------------- poller status ---
function PollerStatus({ silent, agoSec, mode }){
  if (mode==='manual')
    return <div className="adm-poller is-manual"><span className="adm-poller-dot"></span>Manual entry — feed bypassed</div>;
  if (silent)
    return <div className="adm-poller is-silent"><span className="adm-poller-dot"></span>Silent · {Math.floor(agoSec/60)}m {agoSec%60}s since last beat</div>;
  return <div className="adm-poller is-live"><span className="adm-poller-dot"></span>Live · {agoSec}s ago</div>;
}

// ----------------------------------------------------------------- audit log ---
function AuditEntry({ e, onReverse, compact }){
  const meta = AUDIT_TYPE[e.type] || {};
  const sys = e.actor==='system';
  const m = sys ? null : mgr(e.actor);
  return (
    <div className={'adm-audit'+(compact?' is-compact':'')+(' tone-'+(meta.tone||'info'))}>
      <span className="adm-audit-ico"><AuditGlyph type={e.type}/></span>
      <div className="adm-audit-main">
        <div className="adm-audit-top">
          <span className="adm-audit-title">{e.title}</span>
          {e.delta && <span className="adm-audit-delta">{e.delta}</span>}
        </div>
        {e.detail && <div className="adm-audit-detail">{e.detail}</div>}
        <div className="adm-audit-foot">
          <span className="adm-audit-type">{meta.label}</span>
          <span className="adm-audit-sep">·</span>
          <span className="adm-audit-actor">{sys ? 'system' : (m?m.name:e.actor)}</span>
          <span className="adm-audit-sep">·</span>
          <span className="adm-audit-when">{agoLabel(e.ageMin)}</span>
          {e.reversible && onReverse &&
            <button className="adm-audit-undo" onClick={()=>onReverse(e)}>
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-1"/></svg>Reverse
            </button>}
          {!e.reversible && <span className="adm-audit-lockflag">permanent</span>}
        </div>
      </div>
    </div>
  );
}
function AuditLog({ entries, onReverse, compact, max }){
  const list = max ? entries.slice(0, max) : entries;
  return (
    <div className="adm-auditlog">
      {list.map(e => <AuditEntry key={e.id} e={e} onReverse={onReverse} compact={compact}/>)}
      {list.length===0 && <div className="adm-empty">No changes recorded yet.</div>}
    </div>
  );
}

Object.assign(window, {
  AdmKit, CommishBadge, AuditGlyph, AdmCard, IllusTag,
  AdminRibbon, ViewAsSwitcher, ViewAsBanner, ConfirmModal,
  SegRow, Stepper, PollerStatus, AuditEntry, AuditLog,
});
