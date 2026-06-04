// shell/mobile.jsx — MobileShell. Persistent bottom tab-bar (5 slots) + Market/More
// bottom sheets, hosting the mobile Home (same dashboard modules, single column).
const { useState: useStateM } = React;

function MobileShell({ phase, t, conn, theme, isCommish, unread }){
  const dark = theme!=='light';
  const [sheet, setSheet] = useStateM(null);
  const loading = conn==='loading';
  const keys = modulesFor(phase);

  return (
    <IOSDevice dark={dark} width={402} height={860}>
      <div className="msh" data-theme={theme}>
        {/* header */}
        <div className="msh-head">
          <a className="sh-brand" href="App Shell.html">
            <div className="vf-logo">W</div>
            <b className="display" style={{fontSize:16}}>{SHELL_LEAGUE_NAME}</b>
          </a>
          <div className="msh-head-r">
            <ConnPill state={conn}/>
            <ShellBell count={unread}/>
          </div>
        </div>

        {conn==='reconnecting' && <div className="vf-banner vf-banner-recon mvf-banner"><span className="spinner" style={{width:12,height:12}}></span>Reconnecting…</div>}
        {conn==='stale' && <div className="vf-banner vf-banner-stale mvf-banner">Delayed feed · figures may be behind</div>}

        {/* content */}
        <div className="msh-scroll">
          {loading
            ? Array.from({length:5}).map((_,i)=><div key={i} className="skeleton" style={{height:i===0?150:120,borderRadius:14,marginBottom:12}}></div>)
            : <>
                <PrimaryBanner phase={phase} t={t}/>
                {keys.map(k=><div key={k}>{renderModule(k, t)}</div>)}
              </>}
        </div>

        {/* bottom sheets */}
        {sheet==='market' && <MobileSheet title="Market" items={SHELL_MARKET_GROUP} onClose={()=>setSheet(null)}/>}
        {sheet==='more'   && <MobileSheet title="More"   items={shellMoreGroup(isCommish)} onClose={()=>setSheet(null)}/>}

        {/* tab bar */}
        <MobileTabBar active="home" sheet={sheet} onSheet={setSheet}/>
      </div>
    </IOSDevice>
  );
}
window.MobileShell = MobileShell;
