// matchdetail/stats.jsx — Statistics tab. Match overview + grouped stats, home vs away.
// ALL / 1ST-half toggle, and a stat-presentation mode (bars | numbers) driven by a Tweak.

const MD_STAT_GROUPS = [
  { title:null,                    keys:['poss','xg','bigCh'] },
  { title:'Shots',                 keys:['shots','sot','blocked','woodwork'] },
  { title:'Attacking',             keys:['corners','offsides'] },
  { title:'Passing',               keys:['passes','accPct'] },
  { title:'Defending',             keys:['tackles','interc','clear','duelPct','saves'] },
  { title:'Discipline',            keys:['fouls','yellow'] },
];

function StatsTab({ t, mode, half, setHalf, mob }){
  const htReached = t>=MD_HT;
  const live = mdLiveStats(t, half==='first'&&htReached ? 'first':'all');
  const homeArr = live.home, awayArr = live.away;
  return (
    <div className={'md-stats'+(mob?' is-mob':'')}>
      <div className="md-stats-toolbar">
        <div className="md-stats-teams">
          <span className="md-st-team"><span className="md-st-swatch" style={{ background:MD_TEAM_COLOR.home }}></span><Flag nat={MD_MATCH.home.code}/>{MD_MATCH.home.name}</span>
          <span className="md-st-team md-st-team-a"><Flag nat={MD_MATCH.away.code}/>{MD_MATCH.away.name}<span className="md-st-swatch" style={{ background:MD_TEAM_COLOR.away }}></span></span>
        </div>
        <div className="md-half-seg">
          <button className={'md-half-btn'+(half!=='first'?' is-active':'')} onClick={()=>setHalf('all')}>All</button>
          <button className={'md-half-btn'+(half==='first'?' is-active':'')+(htReached?'':' is-disabled')} disabled={!htReached} onClick={()=>htReached&&setHalf('first')}>1st half</button>
        </div>
      </div>
      {!htReached && half!=='first' && <div className="md-stats-livenote"><span className="md-livedot"></span>Live totals — updating as the match plays</div>}
      <div className="md-stats-groups">
        {MD_STAT_GROUPS.map((g,gi)=>(
          <div className="md-stats-group" key={gi}>
            {g.title && <div className="md-stats-gtitle">{g.title}</div>}
            {g.keys.map(k=> <StatBar key={k} keyName={k} home={mdStatVal(homeArr,k)} away={mdStatVal(awayArr,k)} mode={mode}/>)}
          </div>
        ))}
      </div>
      <div className="md-stats-foot">Stat values illustrative — Claude Code wires the live feed to the real provider.</div>
    </div>
  );
}

Object.assign(window, { StatsTab, MD_STAT_GROUPS });
