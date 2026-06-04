// notifs/components.jsx — presentational pieces for the Notifications / alerts surface.
// Reuses: Avatar, mgr, NOTIF_CATS, agoShort, agoLong, pref, JERSEY_BG, NATIONS, Pos.
const { useState:useN, useEffect:useNE, useRef:useNR } = React;

// ----------------------------------------------------------------- category icon ---
function CatGlyph({ cat }){
  const s = { width:16, height:16, fill:'none', stroke:'currentColor', strokeWidth:2 };
  if (cat==='lock')     return <svg viewBox="0 0 24 24" {...s}><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>;
  if (cat==='waiver')   return <svg viewBox="0 0 24 24" {...s}><path d="M3 21h18M6 13l5-5M9 11l5 5M13 3l8 8-3 3-8-8z"/></svg>;
  if (cat==='score')    return <svg viewBox="0 0 24 24" {...s}><path d="M4 19V5M4 19h16M8 16l3-4 3 2 4-6"/></svg>;
  if (cat==='standing') return <svg viewBox="0 0 24 24" {...s}><path d="M4 20h16M7 20V9M12 20V4M17 20v-7"/></svg>;
  if (cat==='playoff')  return <svg viewBox="0 0 24 24" {...s}><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.5 8L20 18M8.5 16L20 6"/></svg>;
  if (cat==='league')   return <svg viewBox="0 0 24 24" {...s}><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z"/></svg>;
  if (cat==='draft')    return <svg viewBox="0 0 24 24" {...s}><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>;
  return <svg viewBox="0 0 24 24" {...s}><circle cx="12" cy="12" r="9"/></svg>;
}
function CatIcon({ cat, lg }){
  return <span className={'nt-cico tone-'+(NOTIF_CATS[cat]||{}).tone+(lg?' is-lg':'')}><CatGlyph cat={cat}/></span>;
}

// small flag-kit chip for player refs (established pattern: JERSEY_BG, no background-size:cover)
function NotifKit({ nat }){
  return <span className="nt-kit" style={{ background: JERSEY_BG[nat] || (NATIONS[nat]||{}).f || 'var(--surface-4)' }} title={(NATIONS[nat]||{}).n}></span>;
}

// ----------------------------------------------------------------- notification item ---
function NotifItem({ n, onRead, onOpen }){
  const cat = NOTIF_CATS[n.cat] || {};
  const p = n.player ? pref(n.player) : null;
  return (
    <div className={'nt-item'+(n.read?'':' is-unread')+(n.live?' is-live':'')} onClick={()=>!n.read && onRead && onRead(n.id)}>
      <CatIcon cat={n.cat}/>
      <div className="nt-it-main">
        <div className="nt-it-top">
          <span className="nt-title">{n.title}</span>
          <span className="nt-time" title={agoLong(n.ageMin)}>{agoShort(n.ageMin)}</span>
        </div>
        <div className="nt-it-body">{n.body}</div>
        <div className="nt-foot">
          <span className={'nt-tag tone-'+cat.tone}>{cat.short}</span>
          {p && <span className="nt-playerref"><NotifKit nat={p.nat}/><Pos p={p.pos}/><b>{p.name}</b></span>}
          {n.cta && <a className="nt-cta" href={n.cta.href} onClick={e=>e.stopPropagation()}>{n.cta.label}
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>}
        </div>
      </div>
      {!n.read && <span className="nt-unreaddot" aria-label="unread"></span>}
    </div>
  );
}

// ----------------------------------------------------------------- filter chips ---
function FilterChips({ value, onChange, counts }){
  return (
    <div className="nt-filters">
      {NOTIF_FILTERS.map(f=>{
        const c = counts[f]||0;
        return (
          <button key={f} className={'nt-chip'+(value===f?' is-active':'')} onClick={()=>onChange(f)}>
            {f==='all' ? 'All' : (NOTIF_CATS[f]||{}).short}
            {c>0 && <span className="nt-chip-n">{c}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ----------------------------------------------------------------- group header ---
function GroupHead({ label, count }){
  return <div className="nt-grouphead"><span className="t-label">{label}</span>{count>0 && <span className="nt-grouphead-n">{count} new</span>}</div>;
}

// ----------------------------------------------------------------- live toast ---
function NotifToast({ n, onClose, onOpen }){
  const cat = NOTIF_CATS[n.cat] || {};
  return (
    <div className={'nt-toast tone-'+cat.tone}>
      <CatIcon cat={n.cat}/>
      <div className="nt-toast-main">
        <div className="nt-toast-title">{n.title}</div>
        <div className="nt-toast-body">{n.body}</div>
        {n.cta && <a className="nt-cta" href={n.cta.href}>{n.cta.label}
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>}
      </div>
      <button className="nt-toast-x" onClick={onClose} aria-label="Dismiss">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>
  );
}

// ----------------------------------------------------------------- bell ---
function Bell({ count, active, onClick }){
  return (
    <button className={'nt-bell'+(active?' is-active':'')} onClick={onClick} aria-label="Notifications">
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/></svg>
      {count>0 && <span className="nt-bell-badge">{count>9?'9+':count}</span>}
    </button>
  );
}

// ----------------------------------------------------------------- preferences ---
function ChannelToggle({ on, onToggle, label }){
  return (
    <button className={'nt-chan'+(on?' is-on':'')} onClick={onToggle} title={label}>
      <span className="nt-chan-box">{on && <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 13l4 4L19 7"/></svg>}</span>
      <span className="nt-chan-lbl">{label}</span>
    </button>
  );
}
function PrefRow({ row, onToggle }){
  const cat = NOTIF_CATS[row.cat] || {};
  return (
    <div className="nt-prefrow">
      <div className="nt-prefrow-id"><CatIcon cat={row.cat}/><span className="nt-prefrow-name">{cat.label}</span></div>
      <div className="nt-prefrow-chans">
        <ChannelToggle on={row.push}  label="Push"   onToggle={()=>onToggle(row.cat,'push')}/>
        <ChannelToggle on={row.email} label="Email"  onToggle={()=>onToggle(row.cat,'email')}/>
        <ChannelToggle on={row.inapp} label="In-app" onToggle={()=>onToggle(row.cat,'inapp')}/>
      </div>
    </div>
  );
}
function PreferencesPanel({ rows, onToggle, quiet, onQuiet, compact }){
  return (
    <div className={'nt-prefs'+(compact?' is-compact':'')}>
      <div className="nt-prefs-head"><span className="nt-prefs-title">Notification preferences</span>
        <span className="t-caption text-tertiary">Per category · {NOTIF_CHANNELS.length} channels</span></div>
      <div className="nt-prefs-cols"><span></span><span className="nt-prefs-collbl">Push</span><span className="nt-prefs-collbl">Email</span><span className="nt-prefs-collbl">In-app</span></div>
      <div className="nt-prefs-list">
        {rows.map(r => <PrefRow key={r.cat} row={r} onToggle={onToggle}/>)}
      </div>
      <div className="nt-quiet">
        <div className="nt-quiet-id">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
          <div><div className="nt-quiet-name">Quiet hours</div><div className="nt-quiet-sub">Mute push 11pm–8am league-local</div></div>
        </div>
        <button className={'nt-switch'+(quiet?' is-on':'')} onClick={onQuiet} role="switch" aria-checked={quiet}><i/></button>
      </div>
    </div>
  );
}

Object.assign(window, {
  CatGlyph, CatIcon, NotifKit, NotifItem, FilterChips, GroupHead,
  NotifToast, Bell, ChannelToggle, PrefRow, PreferencesPanel,
});
