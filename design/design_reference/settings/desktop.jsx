// settings/desktop.jsx — desktop settings (sidebar master-detail ↔ stacked single-page).
// Reuses: SETTINGS_SECTIONS, SIcon, renderSection, Avatar, ME, LEAGUE_INFO.
function NavLinkS({ href, children }){ return <a className="st-nav-item" href={href}>{children}</a>; }

function DesktopSettings(props){
  const { active, setActive, layout, ctx } = props;
  const stacked = layout==='stacked';

  return (
    <div className="st-appwrap">
      <div className="st-top">
        <div className="st-brand"><div className="st-logo">W</div><span className="st-brand-title">{LEAGUE_INFO.name}</span></div>
        <nav className="st-topnav">
          <NavLinkS href="Dashboard.html">Dashboard</NavLinkS>
          <NavLinkS href="My Team.html">My Team</NavLinkS>
          <NavLinkS href="Standings.html">Standings</NavLinkS>
          <NavLinkS href="Notifications.html">Notifications</NavLinkS>
        </nav>
        <div className="st-top-r"><Avatar m={ME} size="md"/></div>
      </div>

      <div className={'st-body'+(stacked?' is-stacked':'')}>
        {!stacked &&
          <aside className="st-sidebar">
            <div className="st-side-prof">
              <span className="avatar avatar-md" style={{ width:38, height:38, background:ME.color, color:'#fff', fontWeight:800 }}>{ME.init}</span>
              <div className="st-side-prof-id"><div className="st-side-name">{ctx.profile.displayName}</div><div className="st-side-team">{ctx.profile.teamName}</div></div>
            </div>
            <nav className="st-sidenav">
              {SETTINGS_SECTIONS.map(s=>(
                <button key={s.id} className={'st-sidenav-item'+(active===s.id?' is-active':'')+(s.id==='danger'?' is-danger':'')} onClick={()=>setActive(s.id)}>
                  <SIcon name={s.icon} s={17}/>{s.label}
                </button>
              ))}
            </nav>
          </aside>}

        <main className="st-content">
          {stacked
            ? SETTINGS_SECTIONS.map(s=>(
                <div className="st-stack-sec" key={s.id} id={'sec-'+s.id}>
                  <div className="st-stack-head"><SIcon name={s.icon} s={18}/><h2 className="st-stack-title">{s.label}</h2></div>
                  {renderSection(s.id, ctx)}
                </div>
              ))
            : <div className="st-detail">
                <div className="st-detail-head"><h1 className="st-h1">{(SETTINGS_SECTIONS.find(s=>s.id===active)||{}).label}</h1></div>
                {renderSection(active, ctx)}
              </div>}
        </main>
      </div>
    </div>
  );
}

Object.assign(window, { DesktopSettings });
