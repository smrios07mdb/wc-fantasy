// shell/desktop.jsx — DesktopShell. Two nav patterns (sidebar ↔ top-bar, a Tweak),
// both wrapping the SAME live Home content area. The Home reuses the dashboard's
// renderModule / modulesFor / PrimaryBanner — this shell is the canonical chrome,
// the dashboard surface is the canonical home content.

function ShellHome({ phase, t, conn }){
  const loading = conn==='loading';
  if(loading) return (
    <div className="db-page">
      <div className="skeleton" style={{height:160,borderRadius:16,marginBottom:16}}></div>
      <div className="db-grid">{Array.from({length:6}).map((_,i)=><div key={i} className="skeleton" style={{height:150,borderRadius:14}}></div>)}</div>
    </div>
  );
  const keys = modulesFor(phase);
  return (
    <div className="db-page">
      <PrimaryBanner phase={phase} t={t}/>
      <div className="db-grid">{keys.map(k=><div key={k} className="db-grid-cell">{renderModule(k,t)}</div>)}</div>
    </div>
  );
}

function ShellBanners({ conn }){
  return <>
    {conn==='reconnecting' && <div className="vf-banner vf-banner-recon"><span className="spinner" style={{width:12,height:12}}></span>Reconnecting…</div>}
    {conn==='stale' && <div className="vf-banner vf-banner-stale">Delayed feed · live figures may be behind</div>}
  </>;
}

const PHASE_SUB = {
  predraft:'Pre-draft · league forming',
  draft:'Draft in progress',
  group:'Group stage · all-play-all',
  playoff:'Guillotine playoffs',
  complete:'Season complete',
};

function DesktopShell({ nav, phase, t, conn, isCommish, unread }){
  const active = 'home';
  const sub = PHASE_SUB[phase] || 'Status-aware home';

  if(nav==='sidebar'){
    return (
      <div className="sh-app sh-app-side">
        <GlobalSidebar active={active} isCommish={isCommish}/>
        <div className="sh-main">
          <ShellContentHeader title="Home" sub={sub} conn={conn} unread={unread} isCommish={isCommish}/>
          <ShellBanners conn={conn}/>
          <div className="sh-content"><ShellHome phase={phase} t={t} conn={conn}/></div>
        </div>
      </div>
    );
  }
  // top-bar
  return (
    <div className="sh-app sh-app-top">
      <GlobalTopbar active={active} isCommish={isCommish} unread={unread} conn={conn}/>
      <ShellBanners conn={conn}/>
      <div className="sh-content sh-content-top"><ShellHome phase={phase} t={t} conn={conn}/></div>
    </div>
  );
}

Object.assign(window, { DesktopShell, ShellHome, ShellBanners, PHASE_SUB });
