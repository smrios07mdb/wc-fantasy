// settings/mobile.jsx — iOS-style grouped settings (list → section detail) inside the iOS frame.
function MobileSettings(props){
  const { layout, ctx, theme } = props;
  const dark = theme!=='light';
  const [view, setView] = React.useState(null);   // null = root list; else section id
  const sec = SETTINGS_SECTIONS.find(s=>s.id===view);

  return (
    <IOSDevice dark={dark} width={402} height={860}>
      <div className="mst" data-theme={theme}>
        {view
          ? <>
              <div className="mst-subhead">
                <button className="mst-back" onClick={()=>setView(null)}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M15 5l-7 7 7 7"/></svg>Settings
                </button>
                <div className="mst-subtitle">{sec.label}</div>
              </div>
              <div className="mst-scroll">{renderSection(view, ctx)}</div>
            </>
          : <>
              <div className="mst-head"><div className="display mst-title">Settings</div></div>
              <div className="mst-scroll">
                <button className="mst-profcard" onClick={()=>setView('profile')}>
                  <span className="avatar avatar-lg" style={{ width:52, height:52, fontSize:18, background:ME.color, color:'#fff', fontWeight:800 }}>{ME.init}</span>
                  <div className="mst-profcard-id">
                    <div className="mst-profcard-name">{ctx.profile.displayName}</div>
                    <div className="mst-profcard-team">{ctx.profile.teamName} · @{ctx.profile.handle}</div>
                  </div>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" className="mst-chev"><path d="M9 5l7 7-7 7"/></svg>
                </button>

                <div className="mst-group">
                  {SETTINGS_SECTIONS.filter(s=>s.id!=='profile' && s.id!=='danger').map((s,i,arr)=>(
                    <button key={s.id} className={'mst-row'+(i===arr.length-1?' is-last':'')} onClick={()=>setView(s.id)}>
                      <span className={'mst-row-ico ico-'+s.id}><SIcon name={s.icon} s={16}/></span>
                      <span className="mst-row-label">{s.label}</span>
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" className="mst-chev"><path d="M9 5l7 7-7 7"/></svg>
                    </button>
                  ))}
                </div>

                <div className="mst-group">
                  <button className="mst-row is-last is-danger" onClick={()=>setView('danger')}>
                    <span className="mst-row-ico ico-danger"><SIcon name="alert" s={16}/></span>
                    <span className="mst-row-label">Sign out &amp; danger</span>
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" className="mst-chev"><path d="M9 5l7 7-7 7"/></svg>
                  </button>
                </div>
                <div className="mst-foot">{LEAGUE_INFO.name} · {LEAGUE_INFO.season}</div>
              </div>
            </>}
      </div>
    </IOSDevice>
  );
}

Object.assign(window, { MobileSettings });
