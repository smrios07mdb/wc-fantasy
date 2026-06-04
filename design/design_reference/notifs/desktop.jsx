// notifs/desktop.jsx — desktop notifications inbox (feed + filters + preferences rail).
// Reuses: NotifItem, FilterChips, GroupHead, PreferencesPanel, Bell, Avatar, NOTIF_CATS, mgr, ME_ID.

const NT_TIME_GROUPS = [
  { id:'new',   label:'New',       test:(n)=> n.live },
  { id:'today', label:'Today',     test:(n)=> !n.live && n.ageMin < 1440 },
  { id:'week',  label:'This week',  test:(n)=> !n.live && n.ageMin >= 1440 && n.ageMin < 10080 },
  { id:'older', label:'Earlier',    test:(n)=> !n.live && n.ageMin >= 10080 },
];
const NT_CAT_ORDER = ['lock','waiver','score','standing','playoff','league','draft'];

function groupFeed(feed, group){
  if (group==='category'){
    return NT_CAT_ORDER.map(c => ({ id:c, label:(NOTIF_CATS[c]||{}).label, items:feed.filter(n=>n.cat===c) }))
      .filter(g => g.items.length);
  }
  return NT_TIME_GROUPS.map(g => ({ id:g.id, label:g.label, items:feed.filter(g.test) }))
    .filter(g => g.items.length);
}

function NavLinkN({ href, children }){ return <a className="nt-nav-item" href={href}>{children}</a>; }

function DesktopNotifs(props){
  const { feed, filter, setFilter, counts, group, onRead, onReadAll, unread,
          prefsOpen, setPrefsOpen, prefRows, onPrefToggle, quiet, setQuiet } = props;
  const me = mgr(ME_ID);
  const groups = groupFeed(feed, group);

  return (
    <div className="nt-app">
      <div className="nt-top">
        <div className="nt-brand">
          <div className="nt-logo">W</div>
          <span className="nt-brand-title">WC Fantasy League</span>
        </div>
        <nav className="nt-nav">
          <NavLinkN href="Dashboard.html">Dashboard</NavLinkN>
          <NavLinkN href="My Team.html">My Team</NavLinkN>
          <NavLinkN href="Standings.html">Standings</NavLinkN>
          <NavLinkN href="Waivers.html">Waivers</NavLinkN>
        </nav>
        <div className="nt-top-r">
          <Bell count={unread} active/>
          <Avatar m={me} size="md"/>
        </div>
      </div>

      <div className={'nt-body'+(prefsOpen?' has-prefs':'')}>
        <main className="nt-main">
          <div className="nt-head">
            <div className="nt-head-l">
              <h1 className="nt-h1">Notifications</h1>
              {unread>0 && <span className="nt-unreadpill">{unread} unread</span>}
            </div>
            <div className="nt-head-actions">
              <button className="nt-act" onClick={onReadAll} disabled={unread===0}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12l5 5L20 6"/></svg>Mark all read
              </button>
              <button className={'nt-act'+(prefsOpen?' is-active':'')} onClick={()=>setPrefsOpen(o=>!o)}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 13a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 0 1-4 0v-.2A1.7 1.7 0 0 0 6 19.4a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 2 13H2a2 2 0 0 1 0-4h.2A1.7 1.7 0 0 0 4.6 6a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 11 2V2a2 2 0 0 1 4 0v.2a1.7 1.7 0 0 0 2.9 1.2 2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 22 11h0a2 2 0 0 1 0 4h-.2a1.7 1.7 0 0 0-1.4 1z"/></svg>Preferences
              </button>
            </div>
          </div>

          <FilterChips value={filter} onChange={setFilter} counts={counts}/>

          <div className="nt-feed">
            {groups.length===0
              ? <div className="nt-empty">
                  <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/></svg>
                  <b>You’re all caught up</b><span>No {filter==='all'?'':(NOTIF_CATS[filter]||{}).short.toLowerCase()+' '}notifications here.</span>
                </div>
              : groups.map(g=>(
                  <section className="nt-group" key={g.id}>
                    <GroupHead label={g.label} count={g.items.filter(n=>!n.read).length}/>
                    <div className="nt-list">
                      {g.items.map(n => <NotifItem key={n.id} n={n} onRead={onRead}/>)}
                    </div>
                  </section>
                ))}
          </div>
        </main>

        {prefsOpen &&
          <aside className="nt-rail">
            <PreferencesPanel rows={prefRows} onToggle={onPrefToggle} quiet={quiet} onQuiet={()=>setQuiet(q=>!q)}/>
          </aside>}
      </div>
    </div>
  );
}

Object.assign(window, { DesktopNotifs, groupFeed });
