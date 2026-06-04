// shell/components.jsx — the canonical GlobalNav vocabulary (Phase 5).
// Desktop: GlobalSidebar OR GlobalTopbar (a Tweak). Mobile: MobileTabBar + sheets.
// Reuses Avatar + ConnPill (vsfield). Bell re-implemented inline (no notifs/components
// dependency) so the shell bundle stays small and collision-free.
const { useState: useStateS } = React;

// ----------------------------------------------------------------- icons ---
function NavIcon({ name, size=18 }){
  const p = { width:size, height:size, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:1.85, strokeLinecap:'round', strokeLinejoin:'round' };
  switch(name){
    case 'home':      return <svg {...p}><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9h5v-5h4v5h5v-9"/></svg>;
    case 'team':      return <svg {...p}><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 19a5.5 5.5 0 0 0-3-4.9"/></svg>;
    case 'lineup':    return <svg {...p}><rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M3.5 12h17M12 3.5v17"/><circle cx="12" cy="12" r="2.4"/></svg>;
    case 'field':     return <svg {...p}><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17M3.6 9.5h3.4v5H3.6M20.4 9.5H17v5h3.4"/></svg>;
    case 'standings': return <svg {...p}><path d="M5 20V10M12 20V4M19 20v-7"/></svg>;
    case 'market':    return <svg {...p}><path d="M4 7h16l-1.3 11.2a2 2 0 0 1-2 1.8H7.3a2 2 0 0 1-2-1.8L4 7Z"/><path d="M8.5 7a3.5 3.5 0 0 1 7 0"/></svg>;
    case 'waivers':   return <svg {...p}><path d="M12 3v5l3-2M12 3 9 5"/><circle cx="12" cy="14" r="6.5"/><path d="M12 11v3l2 1.5"/></svg>;
    case 'draft':     return <svg {...p}><path d="M14 4 20 10 9.5 20.5 4 21l.5-5.5L14 4Z"/><path d="M12.5 5.5 18.5 11.5"/></svg>;
    case 'playoffs':  return <svg {...p}><path d="M6 4h12v3a6 6 0 0 1-12 0V4Z"/><path d="M4 5h2M18 5h2M9 14.5v3M15 14.5v3M7.5 20h9"/></svg>;
    case 'box':       return <svg {...p}><rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>;
    case 'bell':      return <svg {...p}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>;
    case 'settings':  return <svg {...p}><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v2.6M12 18.9v2.6M21.5 12h-2.6M5.1 12H2.5M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8M18.7 18.7l-1.8-1.8M7.1 7.1 5.3 5.3"/></svg>;
    case 'shield':    return <svg {...p}><path d="M12 3 19 6v5c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6l7-3Z"/><path d="M9.2 12l2 2 3.6-3.8"/></svg>;
    case 'more':      return <svg {...p}><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>;
    case 'signout':   return <svg {...p}><path d="M14 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8"/><path d="M16 8l4 4-4 4M9 12h11"/></svg>;
    default:          return <svg {...p}><circle cx="12" cy="12" r="8"/></svg>;
  }
}

// ----------------------------------------------------------------- bell ---
function ShellBell({ count, href='Notifications.html' }){
  return (
    <a className="sh-bell" href={href} aria-label={`Notifications${count?` — ${count} unread`:''}`}>
      <NavIcon name="bell" size={19}/>
      {count>0 && <span className="sh-bell-badge">{count>9?'9+':count}</span>}
    </a>
  );
}

// ----------------------------------------------------------------- avatar menu ---
function AvatarMenu({ isCommish }){
  const [open, setOpen] = useStateS(false);
  const me = mgr(ME_ID);
  const items = shellAvatarMenu(isCommish);
  return (
    <div className="sh-amenu">
      <button className={'sh-amenu-trig'+(open?' is-open':'')} onClick={()=>setOpen(o=>!o)}>
        <Avatar m={me} size="sm"/>
        <span className="sh-amenu-name">{me.name}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{opacity:.6}}><path d="M6 9l6 6 6-6"/></svg>
      </button>
      {open && <>
        <div className="sh-pop-scrim" onClick={()=>setOpen(false)}></div>
        <div className="sh-amenu-pop" role="menu">
          <div className="sh-amenu-id">
            <Avatar m={me} size="md"/>
            <div className="sh-amenu-idtxt"><b>{me.name}</b><span className="t-micro text-tertiary">You · {SHELL_LEAGUE_NAME}</span></div>
          </div>
          <div className="sh-amenu-sep"></div>
          {items.map(it=>(
            <a key={it.id} className={'sh-amenu-item'+(it.danger?' is-danger':'')+(it.commish?' is-commish':'')} href={it.href}>
              <NavIcon name={it.icon} size={16}/>{it.label}
            </a>
          ))}
        </div>
      </>}
    </div>
  );
}

// ----------------------------------------------------------------- desktop: More dropdown (topbar mode) ---
function MoreDropdown({ active, isCommish }){
  const [open, setOpen] = useStateS(false);
  const items = isCommish ? [...SHELL_NAV_MORE, SHELL_NAV_COMMISH] : SHELL_NAV_MORE;
  const activeHere = items.some(i=>i.id===active);
  return (
    <div className="sh-more">
      <button className={'sh-nav-item sh-more-trig'+(open||activeHere?' is-active':'')} onClick={()=>setOpen(o=>!o)}>
        <NavIcon name="more" size={18}/><span>More</span>
      </button>
      {open && <>
        <div className="sh-pop-scrim" onClick={()=>setOpen(false)}></div>
        <div className="sh-more-pop" role="menu">
          {items.map(it=>(
            <a key={it.id} className={'sh-more-item'+(it.id==='admin'?' is-commish':'')+(it.id===active?' is-active':'')} href={it.href}>
              <NavIcon name={it.icon} size={17}/><span>{it.label}</span>
              {it.id==='admin' && <span className="sh-commish-tag">Commissioner</span>}
            </a>
          ))}
        </div>
      </>}
    </div>
  );
}

// ----------------------------------------------------------------- brand ---
function ShellBrand({ compact }){
  return (
    <a className="sh-brand" href="App Shell.html">
      <div className="vf-logo">W</div>
      {!compact && <div className="sh-brand-txt"><b className="display">{SHELL_LEAGUE_NAME}</b><span className="t-micro text-tertiary">2026 · World Cup fantasy</span></div>}
    </a>
  );
}

// ----------------------------------------------------------------- DESKTOP: TOP BAR ---
function GlobalTopbar({ active, isCommish, unread, conn }){
  return (
    <header className="sh-topbar">
      <ShellBrand/>
      <nav className="sh-topnav">
        {SHELL_NAV_PRIMARY.map(n=>(
          <a key={n.id} className={'sh-nav-item'+(n.id===active?' is-active':'')} href={n.href||'App Shell.html'}>
            <NavIcon name={n.icon} size={18}/><span>{n.label}</span>
          </a>
        ))}
        <MoreDropdown active={active} isCommish={isCommish}/>
      </nav>
      <div className="sh-top-r">
        <ConnPill state={conn}/>
        <ShellBell count={unread}/>
        <AvatarMenu isCommish={isCommish}/>
      </div>
    </header>
  );
}

// ----------------------------------------------------------------- DESKTOP: SIDEBAR ---
function SideItem({ n, active }){
  return (
    <a className={'sh-side-item'+(n.id===active?' is-active':'')+(n.commish?' is-commish':'')} href={n.href||'App Shell.html'}>
      <NavIcon name={n.icon} size={19}/><span>{n.label}</span>
      {n.commish && <span className="sh-commish-dot" title="Elevated privileges"></span>}
    </a>
  );
}
function GlobalSidebar({ active, isCommish }){
  return (
    <aside className="sh-side">
      <ShellBrand/>
      <div className="sh-side-scroll">
        <div className="sh-side-group">
          {SHELL_NAV_PRIMARY.map(n=><SideItem key={n.id} n={n} active={active}/>)}
        </div>
        <div className="sh-side-label t-micro text-tertiary">More</div>
        <div className="sh-side-group">
          {SHELL_NAV_MORE.map(n=><SideItem key={n.id} n={n} active={active}/>)}
        </div>
      </div>
      {isCommish && (
        <div className="sh-side-foot">
          <SideItem n={{...SHELL_NAV_COMMISH, commish:true}} active={active}/>
        </div>
      )}
    </aside>
  );
}

// content header used in SIDEBAR mode (the bar that carries page title + bell + avatar)
function ShellContentHeader({ title, sub, conn, unread, isCommish }){
  return (
    <header className="sh-chead">
      <div className="sh-chead-l"><b className="display sh-chead-title">{title}</b>{sub && <span className="t-micro text-tertiary">{sub}</span>}</div>
      <div className="sh-top-r">
        <ConnPill state={conn}/>
        <ShellBell count={unread}/>
        <AvatarMenu isCommish={isCommish}/>
      </div>
    </header>
  );
}

// ----------------------------------------------------------------- MOBILE: tab bar + sheets ---
function MobileTabBar({ active, sheet, onSheet }){
  return (
    <nav className="sh-tabbar">
      {SHELL_MOBILE_TABS.map(t=>{
        const on = t.sheet ? sheet===t.sheet : t.id===active;
        if(t.sheet) return (
          <button key={t.id} className={'sh-tab'+(on?' is-active':'')} onClick={()=>onSheet(sheet===t.sheet?null:t.sheet)}>
            <NavIcon name={t.icon} size={22}/><span>{t.label}</span>
          </button>
        );
        return (
          <a key={t.id} className={'sh-tab'+(on?' is-active':'')} href={t.href||'App Shell.html'}>
            <NavIcon name={t.icon} size={22}/><span>{t.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
function MobileSheet({ title, items, onClose }){
  return (
    <div className="sh-sheet-wrap" onClick={onClose}>
      <div className="sh-sheet" onClick={e=>e.stopPropagation()}>
        <div className="sh-sheet-grab"></div>
        <div className="sh-sheet-head"><b className="display">{title}</b><button className="sh-sheet-x" onClick={onClose}>✕</button></div>
        <div className="sh-sheet-list">
          {items.map(it=>(
            <a key={it.id} className={'sh-sheet-item'+(it.commish?' is-commish':'')} href={it.href}>
              <span className="sh-sheet-ic"><NavIcon name={it.icon} size={20}/></span>
              <span className="sh-sheet-txt"><b>{it.label}</b><span className="t-micro text-tertiary">{it.hint}</span></span>
              {it.commish && <span className="sh-commish-tag">Commissioner</span>}
              <svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" strokeWidth="2" style={{opacity:.4}}><path d="M1 1l6 6-6 6"/></svg>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  NavIcon, ShellBell, AvatarMenu, MoreDropdown, ShellBrand,
  GlobalTopbar, GlobalSidebar, SideItem, ShellContentHeader,
  MobileTabBar, MobileSheet,
});
