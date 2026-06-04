// standings/desktop.jsx — desktop Standings: context band + power-record table.
function DesktopStandings(props){
  const { rows, field, expanded, onExpand, conn, theme } = props;
  const loading = conn==='loading';
  const me = myStandingRow(rows);
  const leader = rows[0];
  const cutRow = rows[field-1];
  const firstOut = rows[field];

  return (
    <div className="st-app">
      {/* top bar */}
      <div className="st-top">
        <div className="st-brand">
          <div className="vf-logo">W</div>
          <div>
            <div className="st-brand-title display">Standings</div>
            <div className="t-micro text-tertiary">All-play-all power record · Group Stage</div>
          </div>
        </div>
        <nav className="st-nav">
          <a className="st-nav-item" href="Dashboard.html">Home</a>
          <a className="st-nav-item" href="My Team.html">My Team</a>
          <a className="st-nav-item" href="Set Lineup.html">Lineup</a>
          <a className="st-nav-item" href="Vs the Field.html">Vs Field</a>
          <span className="st-nav-item is-active">Standings</span>
          <a className="st-nav-item" href="Free Agents.html">Free Agents</a>
        </nav>
        <div className="st-top-spacer"></div>
        <ConnPill state={conn}/>
      </div>

      <div className="st-scroll">
        <div className="st-page">
          {/* context band */}
          <div className="st-band">
            <div className="st-band-lead">
              <span className="t-label">League leader</span>
              <div className="st-band-mgr"><Avatar m={leader.m} size="md"/>
                <div><b className="st-band-name">{leader.m.name}</b>
                  <div className="t-micro text-tertiary">{leader.W}–{leader.L}{leader.D?'–'+leader.D:''} · {leader.total} pts</div></div>
              </div>
            </div>
            <div className="st-band-div"></div>
            <div className="st-band-me">
              <span className="t-label">Your seed</span>
              <div className="st-band-seedrow">
                <b className={'st-band-seed'+(me.qualified?' is-in':' is-out')}>{me.rank}<small>of {rows.length}</small></b>
                <span className={'st-band-status'+(me.qualified?' is-in':' is-out')}>
                  {me.qualified ? 'inside the cut' : 'below the cut'}
                </span>
              </div>
              <div className="t-micro text-tertiary">{me.W}–{me.L}{me.D?'–'+me.D:''} · {me.total} pts · {winPct(me)}% wins</div>
            </div>
            <div className="st-band-div"></div>
            <div className="st-band-cut">
              <span className="t-label">Playoff cut</span>
              <div className="st-band-cutrow">
                <b className="st-band-cutnum">Top {field}</b>
                <span className="t-micro text-tertiary">advance · {rows.length-field} eliminated</span>
              </div>
              <div className="st-band-cutedge t-micro">
                On the line: <b>{cutRow.m.name}</b> ({cutRow.W}W){firstOut && <> · first out <b>{firstOut.m.name}</b> ({firstOut.W}W)</>}
              </div>
            </div>
          </div>

          {/* model explainer */}
          <div className="st-explain">
            <span className="st-explain-ic"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/></svg></span>
            <span>Each matchday you're scored against <b>all {rows.length-1} rivals</b> — outscore one for a Win. Standings rank by <b>total wins</b>; ties break on <b>total points</b> <span className="text-tertiary">(the PF column)</span>.</span>
          </div>

          {/* table */}
          {loading
            ? <div className="st-card">{Array.from({length:6}).map((_,i)=><div key={i} className="skeleton" style={{height:46,borderRadius:10,marginBottom:8}}></div>)}</div>
            : <div className="st-card"><StandingsTable rows={rows} field={field} expanded={expanded} onExpand={onExpand}/></div>}

          <div className="st-foot t-micro text-tertiary">
            Scoring values illustrative pending SCORING.md · all-play-all draw handling and exact playoff field size (8 or 10) fixed at the group→playoff transition.
          </div>
        </div>
      </div>
    </div>
  );
}
Object.assign(window, { DesktopStandings });
