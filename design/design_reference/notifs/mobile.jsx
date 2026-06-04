// notifs/mobile.jsx — phone-condensed notifications inside the iOS frame. Reuses the same items.
function MobileNotifs(props){
  const { feed, filter, setFilter, counts, group, onRead, onReadAll, unread,
          prefsOpen, setPrefsOpen, prefRows, onPrefToggle, quiet, setQuiet, theme } = props;
  const dark = theme!=='light';
  const groups = groupFeed(feed, group);

  return (
    <IOSDevice dark={dark} width={402} height={860}>
      <div className="nt mnt" data-theme={theme}>
        <div className="mnt-head">
          <div className="mnt-headrow">
            <div className="mnt-title-wrap">
              <div className="display mnt-title">Notifications</div>
              {unread>0 && <span className="mnt-unread">{unread} unread</span>}
            </div>
            <button className={'mnt-gear'+(prefsOpen?' is-active':'')} onClick={()=>setPrefsOpen(o=>!o)} aria-label="Preferences">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 13a1.7 1.7 0 0 0 .3 1.9 2 2 0 1 1-2.8 2.8 1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 0 1-4 0 1.7 1.7 0 0 0-2.4-1.6 2 2 0 1 1-2.8-2.8A1.7 1.7 0 0 0 2 13a2 2 0 0 1 0-4 1.7 1.7 0 0 0 1.6-2.4 2 2 0 1 1 2.8-2.8A1.7 1.7 0 0 0 11 2a2 2 0 0 1 4 0 1.7 1.7 0 0 0 2.9 1.2 2 2 0 1 1 2.8 2.8A1.7 1.7 0 0 0 22 11a2 2 0 0 1 0 4z"/></svg>
            </button>
          </div>
          <div className="mnt-filters">
            {NOTIF_FILTERS.map(f=>(
              <button key={f} className={'nt-chip'+(filter===f?' is-active':'')} onClick={()=>setFilter(f)}>
                {f==='all'?'All':(NOTIF_CATS[f]||{}).short}{counts[f]>0 && <span className="nt-chip-n">{counts[f]}</span>}
              </button>
            ))}
          </div>
        </div>

        {prefsOpen
          ? <div className="mnt-scroll">
              <PreferencesPanel rows={prefRows} onToggle={onPrefToggle} quiet={quiet} onQuiet={()=>setQuiet(q=>!q)} compact/>
            </div>
          : <div className="mnt-scroll">
              {unread>0 && <button className="mnt-readall" onClick={onReadAll}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12l5 5L20 6"/></svg>Mark all read</button>}
              {groups.length===0
                ? <div className="nt-empty"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/></svg><b>All caught up</b></div>
                : groups.map(g=>(
                    <section className="nt-group" key={g.id}>
                      <GroupHead label={g.label} count={g.items.filter(n=>!n.read).length}/>
                      <div className="nt-list">
                        {g.items.map(n => <NotifItem key={n.id} n={n} onRead={onRead}/>)}
                      </div>
                    </section>
                  ))}
            </div>}
      </div>
    </IOSDevice>
  );
}

Object.assign(window, { MobileNotifs });
