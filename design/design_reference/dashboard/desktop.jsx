// dashboard/desktop.jsx — desktop home. Exports DesktopDash.
const NAV = [
  { label:'Home',      href:'#',                 active:true },
  { label:'My Team',   href:'My Team.html' },
  { label:'Set Lineup',href:'Set Lineup.html' },
  { label:'The Field', href:'Vs the Field.html' },
  { label:'Draft',     href:'Draft Room.html' },
];

function renderModule(key, t){
  switch(key){
    case 'record':   return <RecordModule t={t}/>;
    case 'lock':     return <LockModule t={t}/>;
    case 'waiver':   return <WaiverModule/>;
    case 'standings':return <StandingsModule t={t}/>;
    case 'fixtures': return <FixturesModule t={t}/>;
    case 'activity': return <ActivityModule/>;
    case 'forming':  return <DraftFormingModule/>;
    case 'picks':    return <RecentPicksModule/>;
    case 'bracket':  return <BracketModule/>;
    case 'recap':    return <RecapModule/>;
    case 'myrecap':  return <MyRecapModule/>;
    case 'info':     return <LeagueInfoModule/>;
    case 'ready':    return <ReadinessModule/>;
    default: return null;
  }
}
function modulesFor(phase){
  switch(phase){
    case 'predraft': return ['info','ready'];
    case 'draft':    return ['forming','picks','ready'];
    case 'group':    return ['record','lock','waiver','standings','fixtures','activity'];
    case 'playoff':  return ['bracket','lock','waiver','fixtures','activity'];
    case 'complete': return ['recap','myrecap','standings','activity'];
    default: return [];
  }
}
const PRIMARY_MOD = { group:'lock', playoff:'bracket', draft:'forming', complete:'recap', predraft:'info' };

function DashTopNav({ conn }){
  return (
    <div className="db-top">
      <div className="db-brand"><div className="vf-logo">W</div><b className="db-brand-title display">WC Fantasy League</b></div>
      <nav className="db-nav">
        {NAV.map(n=>(<a key={n.label} className={'db-nav-item'+(n.active?' is-active':'')} href={n.href}>{n.label}</a>))}
      </nav>
      <div className="db-top-spacer"></div>
      <ConnPill state={conn}/>
      <Avatar m={mgr(ME_ID)} size="md"/>
    </div>
  );
}

function DesktopDash(props){
  const { phase, model, layout, t, conn } = props;
  const loading = conn==='loading';
  const keys = modulesFor(phase);

  return (
    <div className="db-app">
      <DashTopNav conn={conn}/>

      {conn==='reconnecting' && <div className="vf-banner vf-banner-recon"><span className="spinner" style={{width:12,height:12}}></span>Reconnecting…</div>}
      {conn==='stale' && <div className="vf-banner vf-banner-stale">Delayed feed · live figures may be behind</div>}

      <div className="db-scroll">
        {loading ? (
          <div className="db-page">
            <div className="skeleton" style={{height:170,borderRadius:16,marginBottom:16}}></div>
            <div className="db-grid">{Array.from({length:6}).map((_,i)=><div key={i} className="skeleton" style={{height:150,borderRadius:14}}></div>)}</div>
          </div>
        ) : model==='router' ? (
          <div className="db-page db-router">
            <PrimaryBanner phase={phase} t={t} router/>
            {PRIMARY_MOD[phase] && <div className="db-router-mod">{renderModule(PRIMARY_MOD[phase], t)}</div>}
            <div className="db-router-jump">
              <span className="t-caption text-tertiary">Jump to</span>
              {NAV.filter(n=>!n.active).map(n=>(<a key={n.label} className="chip" href={n.href}>{n.label}</a>))}
            </div>
          </div>
        ) : (
          <div className="db-page">
            <PrimaryBanner phase={phase} t={t}/>
            {layout==='spotlight' ? (
              <div className="db-spotlight">
                <div className="db-spot-main">{keys.slice(0, Math.ceil(keys.length/2)).map(k=><div key={k}>{renderModule(k,t)}</div>)}</div>
                <div className="db-spot-rail">{keys.slice(Math.ceil(keys.length/2)).map(k=><div key={k}>{renderModule(k,t)}</div>)}</div>
              </div>
            ) : (
              <div className="db-grid">{keys.map(k=><div key={k} className="db-grid-cell">{renderModule(k,t)}</div>)}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
Object.assign(window, { DesktopDash, renderModule, modulesFor, PRIMARY_MOD, NAV });
