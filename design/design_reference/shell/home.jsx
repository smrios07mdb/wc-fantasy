// shell/home.jsx — the Home content pane that lives INSIDE the shell chrome.
// Reuses the canonical dashboard vocabulary (PrimaryBanner + the status modules) so the
// home is the same component set as the standalone Dashboard stage — one vocabulary, not two.
// Reuses globals: PrimaryBanner + *Module components, N.

function shModulesFor(phase){
  switch(phase){
    case 'predraft': return ['info','ready'];
    case 'draft':    return ['forming','picks','ready'];
    case 'group':    return ['record','lock','waiver','standings','fixtures','activity'];
    case 'playoff':  return ['bracket','lock','waiver','fixtures','activity'];
    case 'complete': return ['recap','myrecap','standings','activity'];
    default: return [];
  }
}
function shRenderModule(key, t){
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

function HomeDesktop({ phase, t, conn }){
  const loading = conn==='loading';
  const keys = shModulesFor(phase);
  if (loading){
    return (
      <div className="sh-home">
        <div className="skeleton" style={{height:170,borderRadius:16}}></div>
        <div className="sh-home-grid" style={{marginTop:14}}>{Array.from({length:6}).map((_,i)=><div key={i} className="skeleton" style={{height:150,borderRadius:14}}></div>)}</div>
      </div>
    );
  }
  return (
    <div className="sh-home">
      <PrimaryBanner phase={phase} t={t}/>
      <div className="sh-home-grid">
        {keys.map(k => <div className="sh-home-cell" key={k}>{shRenderModule(k, t)}</div>)}
      </div>
    </div>
  );
}

function HomeMobile({ phase, t, conn }){
  const loading = conn==='loading';
  const keys = shModulesFor(phase);
  return (
    <div className="sh-mhome">
      {loading
        ? Array.from({length:5}).map((_,i)=><div key={i} className="skeleton" style={{height:i===0?150:120,borderRadius:14}}></div>)
        : <>
            <PrimaryBanner phase={phase} t={t}/>
            {keys.map(k => <div key={k}>{shRenderModule(k, t)}</div>)}
          </>}
    </div>
  );
}

Object.assign(window, { HomeDesktop, HomeMobile, shModulesFor, shRenderModule });
