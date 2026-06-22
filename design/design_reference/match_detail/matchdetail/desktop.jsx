// matchdetail/desktop.jsx — desktop Match Detail: back bar, scoreboard, tab bar, tab content.
const MD_TABS = [['lineups','Lineups'],['stats','Statistics'],['events','Events'],['ratings','Ratings'],['standings','Standings']];

function TabBar({ tab, setTab, mob }){
  return (
    <div className={'md-tabbar'+(mob?' is-mob':'')}>
      {MD_TABS.map(([k,l])=>(
        <button key={k} className={'md-tabbtn'+(tab===k?' is-active':'')} onClick={()=>setTab(k)}>{l}</button>
      ))}
    </div>
  );
}

function TabContent({ tab, t, statMode, half, setHalf, onOpen, mob }){
  if (tab==='lineups')   return <LineupsTab t={t} onOpen={onOpen} mob={mob}/>;
  if (tab==='stats')     return <StatsTab t={t} mode={statMode} half={half} setHalf={setHalf} mob={mob}/>;
  if (tab==='events')    return <EventsTab t={t} mob={mob}/>;
  if (tab==='ratings')   return <RatingsTab t={t} onOpen={onOpen} mob={mob}/>;
  if (tab==='standings') return <StandingsTab mob={mob}/>;
  return null;
}

function DesktopMatch({ t, tab, setTab, statMode, half, setHalf, onOpen, conn }){
  return (
    <div className="md-app">
      <div className="md-app-top">
        <button className="md-back">‹ Back</button>
        <span className="md-crumb">Standings <span className="md-crumb-sep">›</span> Matchday 2 <span className="md-crumb-sep">›</span> <b>{MD_MATCH.home.name} v {MD_MATCH.away.name}</b></span>
        <span className="md-app-conn"><ConnPill state={conn}/></span>
      </div>
      <div className="md-scroll">
        <Scoreboard t={t} conn={conn}/>
        <MyStakeStrip t={t} onOpen={onOpen}/>
        <TabBar tab={tab} setTab={setTab}/>
        <div className="md-tabwrap">
          <TabContent tab={tab} t={t} statMode={statMode} half={half} setHalf={setHalf} onOpen={onOpen}/>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { MD_TABS, TabBar, TabContent, DesktopMatch });
