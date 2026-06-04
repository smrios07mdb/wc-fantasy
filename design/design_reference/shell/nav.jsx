// shell/nav.jsx — the persistent global navigation: desktop sidebar + top-bar, mobile
// tab-bar + sheets, bell, avatar menu, commissioner entry. Every item is a real link.
// Reuses globals: Avatar, ConnPill, mgr, ME_ID, SCREENS, ICO, primaryKeys, moreKeys,
//   avatarMenuKeys, MOBILE_TABS, MARKET_KEYS, mobileMoreKeys, SHELL_BRAND, SHELL_UNREAD.
const { useState:useStateNav, useRef:useRefNav, useEffect:useEffectNav } = React;

// ----------------------------------------------------------------- icon ---
function Ico({ k, size=18, sw=1.9 }){
  const d = ICO[k]; if(!d) return null;
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{d.split('M').filter(Boolean).map((seg,i)=><path key={i} d={'M'+seg}/>)}</svg>;
}

// click-outside + Esc helper for popovers
function useDismiss(open, onClose){
  const ref = useRefNav(null);
  useEffectNav(()=>{
    if(!open) return;
    const h = (e)=>{ if(ref.current && !ref.current.contains(e.target)) onClose(); };
    const k = (e)=>{ if(e.key==='Escape') onClose(); };
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k);
    return ()=>{ document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [open]);
  return ref;
}

// notification preview (illustrative) shown in the bell popover; full feed lives in Notifications.html
const SHELL_NOTIF_PREVIEW = [
  { tone:'win',  ic:'waivers', title:'You won J. Sancho for $26', t:'42m', unread:true },
  { tone:'live', ic:'lineup',  title:'Lautaro locks in 6′ — set your XI', t:'1h', unread:true },
  { tone:'elim', ic:'playoffs',title:'Cut line update — you sit 6th of 8', t:'2h', unread:true },
  { tone:'info', ic:'standings',title:'Matchday 2 settled — you went 8–3', t:'1d', unread:false },
];
const TONE_VAR = { win:'var(--win)', live:'var(--live)', elim:'var(--elim)', info:'var(--info)', refund:'var(--refund)' };

// ----------------------------------------------------------------- desktop sidebar ---
function SideItem({ k, active }){
  const s = SCREENS[k];
  return (
    <a className={'sh-side-item'+(active?' is-active':'')+(s.kit?' is-kit':'')} href={s.href}>
      <span className="sh-side-ico"><Ico k={s.icon}/></span>
      <span className="sh-side-lbl">{s.label}</span>
    </a>
  );
}

function Sidebar({ phase, active, isCommish }){
  const prim = primaryKeys(phase);
  const more = moreKeys(phase);
  return (
    <aside className="sh-side">
      <div className="sh-side-brand">
        <div className="vf-logo">W</div>
        <div className="sh-brandtext">
          <b className="display">{SHELL_BRAND}</b>
          <span className="t-micro text-tertiary">2026 World Cup</span>
        </div>
      </div>

      <nav className="sh-side-nav">
        {prim.map(k => <SideItem key={k} k={k} active={k===active}/>)}
      </nav>

      <div className="sh-side-group">
        <span className="sh-side-grouplbl t-micro">More</span>
        {more.map(k => <SideItem key={k} k={k} active={k===active}/>)}
      </div>

      <div className="sh-side-foot">
        {isCommish && <SideItem k="commissioner" active={active==='commissioner'}/>}
      </div>
    </aside>
  );
}

// content-area top header (sidebar mode): page title + feed + bell + avatar
function ContentHeader({ title, sub, conn, unread, isCommish }){
  return (
    <header className="sh-chead">
      <div className="sh-chead-title">
        <b className="display">{title}</b>
        {sub && <span className="t-caption text-tertiary">{sub}</span>}
      </div>
      <div className="sh-chead-actions">
        <ConnPill state={conn}/>
        <BellMenu count={unread}/>
        <AvatarMenu isCommish={isCommish}/>
      </div>
    </header>
  );
}

// ----------------------------------------------------------------- desktop top-bar ---
function TopItem({ k, active }){
  const s = SCREENS[k];
  return <a className={'sh-top-item'+(active?' is-active':'')} href={s.href}><Ico k={s.icon} size={16}/>{s.label}</a>;
}

function TopBar({ phase, active, isCommish, conn, unread }){
  const prim = primaryKeys(phase);
  const more = moreKeys(phase);
  const [moreOpen, setMoreOpen] = useStateNav(false);
  const ref = useDismiss(moreOpen, ()=>setMoreOpen(false));
  return (
    <header className="sh-top">
      <div className="sh-top-brand">
        <div className="vf-logo">W</div>
        <b className="display sh-top-brandname">{SHELL_BRAND}</b>
      </div>
      <nav className="sh-top-nav">
        {prim.map(k => <TopItem key={k} k={k} active={k===active}/>)}
        <div className="sh-more" ref={ref}>
          <button className={'sh-top-item sh-top-more'+(moreOpen?' is-active':'')} onClick={()=>setMoreOpen(o=>!o)}>
            <Ico k="more" size={16}/>More<Ico k="chevron" size={13} sw={2.2}/>
          </button>
          {moreOpen && (
            <div className="sh-pop sh-pop-more">
              {more.map(k => { const s=SCREENS[k];
                return <a key={k} className="sh-pop-item" href={s.href}><Ico k={s.icon} size={16}/>{s.label}</a>; })}
              {isCommish && <><div className="sh-pop-div"></div>
                <a className="sh-pop-item is-kit" href={SCREENS.commissioner.href}><Ico k="commish" size={16}/>{SCREENS.commissioner.label}</a></>}
            </div>
          )}
        </div>
      </nav>
      <div className="sh-top-spacer"></div>
      <ConnPill state={conn}/>
      <BellMenu count={unread}/>
      <AvatarMenu isCommish={isCommish}/>
    </header>
  );
}

// ----------------------------------------------------------------- bell (self-contained) ---
function BellMenu({ count }){
  const [open, setOpen] = useStateNav(false);
  const ref = useDismiss(open, ()=>setOpen(false));
  return (
    <div className="sh-bellwrap" ref={ref}>
      <button className={'sh-bell'+(open?' is-active':'')} onClick={()=>setOpen(o=>!o)} aria-label="Notifications">
        <Ico k="bell" size={19}/>
        {count>0 && <span className="sh-bell-badge">{count>9?'9+':count}</span>}
      </button>
      {open && (
        <div className="sh-pop sh-pop-bell">
          <div className="sh-pop-head"><b>Notifications</b><span className="t-micro text-tertiary">{count} unread</span></div>
          <div className="sh-pop-div"></div>
          <div className="sh-bell-list">
            {SHELL_NOTIF_PREVIEW.map((n,i)=>(
              <a key={i} className={'sh-bell-item'+(n.unread?' is-unread':'')} href={SCREENS.notifications.href}>
                <span className="sh-bell-ic" style={{color:TONE_VAR[n.tone]}}><Ico k={n.ic} size={15}/></span>
                <span className="sh-bell-txt">{n.title}</span>
                <span className="sh-bell-t t-micro text-tertiary">{n.t}</span>
                {n.unread && <span className="sh-bell-dot"></span>}
              </a>
            ))}
          </div>
          <a className="sh-pop-foot" href={SCREENS.notifications.href}>All notifications<Ico k="chevron" size={13} sw={2.2}/></a>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- avatar menu (self-contained) ---
function AvatarMenu({ isCommish }){
  const [open, setOpen] = useStateNav(false);
  const ref = useDismiss(open, ()=>setOpen(false));
  const me = mgr(ME_ID);
  const items = avatarMenuKeys(isCommish);
  return (
    <div className="sh-avwrap" ref={ref}>
      <button className="sh-avbtn" onClick={()=>setOpen(o=>!o)} aria-label="Account menu">
        <Avatar m={me} size="md"/>
      </button>
      {open && (
        <div className="sh-pop sh-pop-av">
          <div className="sh-av-head">
            <Avatar m={me} size="md"/>
            <div className="sh-av-id"><b>You · {me.name}</b><span className="t-micro text-tertiary">{isCommish?'Commissioner':'Manager'} · {SHELL_BRAND}</span></div>
          </div>
          <div className="sh-pop-div"></div>
          {items.map(k => { const s=SCREENS[k]; const danger = k==='join';
            return <a key={k} className={'sh-pop-item'+(s.kit?' is-kit':'')+(danger?' is-danger':'')} href={s.href}><Ico k={s.icon} size={16}/>{s.label}</a>; })}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- mobile chrome ---
function MobileTopBar({ unread }){
  return (
    <div className="sh-mtop">
      <div className="sh-mtop-brand"><div className="vf-logo">W</div><b className="display">{SHELL_BRAND}</b></div>
      <a className="sh-bell" href={SCREENS.notifications.href} aria-label="Notifications">
        <Ico k="bell" size={19}/>{unread>0 && <span className="sh-bell-badge">{unread>9?'9+':unread}</span>}
      </a>
    </div>
  );
}

function MobileTabBar({ active, onSheet }){
  return (
    <nav className="sh-tabbar">
      {MOBILE_TABS.map(k=>{
        if (k==='market' || k==='more'){
          const lbl = k==='market'?'Market':'More';
          const ic  = k==='market'?'market':'more';
          return <button key={k} className="sh-tab" onClick={()=>onSheet(k)}><Ico k={ic} size={22}/><span>{lbl}</span></button>;
        }
        const s = SCREENS[k];
        return <a key={k} className={'sh-tab'+(k===active?' is-active':'')} href={s.href}><Ico k={s.icon} size={22}/><span>{s.short}</span></a>;
      })}
    </nav>
  );
}

function MobileSheet({ kind, isCommish, onClose }){
  if(!kind) return null;
  const title = kind==='market'?'Market':'More';
  const keys = kind==='market' ? MARKET_KEYS : mobileMoreKeys(isCommish);
  return (
    <div className="sh-sheet-scrim" onClick={onClose}>
      <div className="sh-sheet" onClick={e=>e.stopPropagation()}>
        <div className="sh-sheet-grab"></div>
        <div className="sh-sheet-head"><b className="display">{title}</b>
          <button className="sh-sheet-x" onClick={onClose}><Ico k="close" size={18}/></button></div>
        {kind==='market' && <p className="t-caption text-tertiary sh-sheet-note">Free agents, blind-bid waivers &amp; the draft room.</p>}
        <div className="sh-sheet-list">
          {keys.map(k=>{ const s=SCREENS[k]; const danger=k==='join';
            return <a key={k} className={'sh-sheet-item'+(s.kit?' is-kit':'')+(danger?' is-danger':'')} href={s.href}>
              <span className="sh-sheet-ico"><Ico k={s.icon} size={18}/></span>
              <span className="sh-sheet-lbl">{s.label}</span>
              <Ico k="chevron" size={15} sw={2.2}/>
            </a>; })}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  Ico, Sidebar, ContentHeader, TopBar, BellMenu, AvatarMenu,
  MobileTopBar, MobileTabBar, MobileSheet,
});
