// matchdetail/events.jsx — Events timeline, Ratings board, and Standings (group table) tabs.
// Fantasy stays woven in: goals carry the scorer's owner + points; ratings rows show fpts.

// ----------------------------------------------------------------- Events timeline ---
function pl(team, num){ return team.xi.find(x=>x.num===num) || team.bench.find(x=>x.num===num); }

function GoalEvent({ e, team }){
  const scorer = pl(team, e.scorer[0]);
  const assist = e.assist ? pl(team, e.assist[0]) : null;
  const f = scorer ? mdFantasy(scorer, 999) : null; // value of this goal to fantasy (full credit shown)
  return (
    <div className="md-tev-body">
      <div className="md-tev-line"><span className="md-ball">⚽</span><b>{scorer?scorer.first+' '+scorer.last:'#'+e.scorer[0]}</b></div>
      {assist && <div className="md-tev-sub">assist · {assist.first} {assist.last}</div>}
      {scorer && scorer.owner && <div className="md-tev-fan"><OwnerChip ownerId={scorer.owner} benchedBy={scorer.benchedBy} tiny/><span className="md-tev-fpt">+{window.PTS.goal[scorer.pos]} fpts</span></div>}
    </div>
  );
}
function SubEvent({ e, team }){
  const off = pl(team, e.off[0]); const on = pl(team, e.on[0]);
  return (
    <div className="md-tev-body">
      <div className="md-tev-line md-sub-on"><span className="md-sub-ar is-on">▲</span><b>{on?on.last:'#'+e.on[0]}</b></div>
      <div className="md-tev-sub md-sub-off"><span className="md-sub-ar is-off">▼</span>{off?off.last:'#'+e.off[0]}</div>
    </div>
  );
}
function CardEvent({ e, team }){
  const p = pl(team, e.player[0]);
  return <div className="md-tev-body"><div className="md-tev-line"><span className="md-ev-ic is-yel"></span><b>{p?p.first+' '+p.last:'#'+e.player[0]}</b></div><div className="md-tev-sub">{e.reason}</div></div>;
}

function TimelineRow({ e }){
  // full-width markers
  if (e.type==='ko' || e.type==='ko2')
    return <div className="md-tl-marker"><span className="md-tlm-line"></span><span className="md-tlm-pill">{e.label}</span><span className="md-tlm-line"></span></div>;
  if (e.type==='ht' || e.type==='ft')
    return <div className="md-tl-marker is-major"><span className="md-tlm-line"></span><span className="md-tlm-pill is-major">{e.label} · {e.hs}–{e.as}</span><span className="md-tlm-line"></span></div>;
  const side = e.side;
  const team = side==='home' ? MD_MATCH.home : MD_MATCH.away;
  let body;
  if (e.type==='goal') body = <GoalEvent e={e} team={team}/>;
  else if (e.type==='sub') body = <SubEvent e={e} team={team}/>;
  else if (e.type==='yellow') body = <CardEvent e={e} team={team}/>;
  else if (e.type==='var') body = <div className="md-tev-body"><div className="md-tev-line"><span className="md-ev-ic is-var">VAR</span><b>{e.label}</b></div>{e.note&&<div className="md-tev-sub">{e.note}</div>}</div>;
  else body = <div className="md-tev-body"><div className="md-tev-line">{e.label}</div></div>;
  return (
    <div className={'md-tev md-tev-'+side+(e.type==='goal'?' is-goal':'')}>
      <div className="md-tev-half md-tev-l">{side==='home' && body}</div>
      <div className="md-tev-spine"><span className="md-tev-min">{fmtMin(e.min)}</span></div>
      <div className="md-tev-half md-tev-r">{side==='away' && body}</div>
    </div>
  );
}
function EventsTab({ t, mob }){
  const evs = mdEventsUpTo(t).slice().reverse();
  return (
    <div className={'md-events'+(mob?' is-mob':'')}>
      <div className="md-events-head">
        <span className="md-eh-team"><Flag nat={MD_MATCH.home.code}/>{MD_MATCH.home.name}</span>
        <span className="md-eh-mid">Match events</span>
        <span className="md-eh-team md-eh-a">{MD_MATCH.away.name}<Flag nat={MD_MATCH.away.code}/></span>
      </div>
      <div className="md-timeline">
        {evs.length<=1 && <div className="md-tl-empty">No events yet — the match is about to begin.</div>}
        {evs.map((e,i)=> <TimelineRow key={i} e={e}/>)}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- Ratings board ---
function RatingsTab({ t, onOpen, mob }){
  const board = mdRatingsBoard(t);
  if (!board.length) return <div className="md-rb-empty"><span className="md-livedot"></span>Ratings appear once players have enough on-ball data.</div>;
  const top = board.slice(0,3);
  const mvp = board.reduce((a,b)=> (b.fantasy.pts>a.fantasy.pts?b:a), board[0]);
  return (
    <div className={'md-ratings'+(mob?' is-mob':'')}>
      <div className="md-rb-top">
        <div className="md-rb-title">Highest-rated players</div>
        <div className="md-rb-podium">
          {top.map((row,i)=>(
            <button className={'md-rb-pod p'+i} key={row.p.id} onClick={()=>onOpen&&onOpen(row.p, row.team)}>
              <span className="md-rb-rank">{i+1}</span>
              <span className="md-rb-shirt" style={{ background:(window.JERSEY_BG||{})[row.team.code] }}><i>{row.p.num}</i></span>
              <RatingBadge r={row.rating} size="lg"/>
              <span className="md-rb-nm">{row.p.last||row.p.first}</span>
              <span className="md-rb-team"><Flag nat={row.team.code}/>{row.team.code}</span>
              <FantasyPts f={row.fantasy} size="sm" mine={row.p.owner===ME_ID}/>
            </button>
          ))}
        </div>
      </div>
      <div className="md-rb-mvp">
        <span className="md-fan-tag">FANTASY MVP</span>
        <b>{mvp.p.first} {mvp.p.last}</b>
        <span className="md-rb-mvp-pts">{mvp.fantasy.pts>=0?'+':''}{mvp.fantasy.pts} fpts</span>
        <OwnerChip ownerId={mvp.p.owner} benchedBy={mvp.p.benchedBy} tiny/>
      </div>
      <div className="md-rb-list">
        {board.map((row,i)=>(
          <button className={'md-rb-row'+(row.p.owner===ME_ID?' is-me':'')} key={row.p.id} onClick={()=>onOpen&&onOpen(row.p, row.team)}>
            <span className="md-rb-i mono">{i+1}</span>
            <RatingBadge r={row.rating}/>
            <span className="md-rb-rowmain">
              <span className="md-rb-rowname">{row.p.cap&&<i className="md-cap">C</i>}{row.p.first} {row.p.last}</span>
              <span className="md-rb-rowsub"><Pos p={row.p.pos}/><Flag nat={row.team.code}/>{row.team.name}</span>
            </span>
            <OwnerChip ownerId={row.p.owner} benchedBy={row.p.benchedBy} tiny/>
            <FantasyPts f={row.fantasy} size="sm" mine={row.p.owner===ME_ID}/>
          </button>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- Standings (group) ---
function StandingsTab({ mob }){
  const g = MD_MATCH.group;
  return (
    <div className={'md-standings'+(mob?' is-mob':'')}>
      <div className="md-gr-head"><span className="md-gr-trophy">🏆</span><b>{g.name}</b><span className="md-gr-note">Top 2 advance</span></div>
      <table className="md-gr-table">
        <thead><tr><th>#</th><th className="md-gr-team">Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>GF</th><th className="md-gr-last">Last</th><th>Pts</th></tr></thead>
        <tbody>
          {g.rows.map((r,i)=>{
            const pts = r.w*3 + r.d;
            return (
              <tr key={r.code} className={(i<2?'is-qual':'')+(r.inMatch?' is-inmatch':'')}>
                <td><span className={'md-gr-pos'+(i<2?' is-qual':'')}>{i+1}</span></td>
                <td className="md-gr-team"><span className="md-crest xs" style={{ background:(window.JERSEY_BG||{})[r.code] || (NATIONS[r.code]||{}).f || 'var(--surface-4)' }}></span>{r.name}{r.inMatch && <span className="md-gr-dot"></span>}</td>
                <td>{r.p}</td><td>{r.w}</td><td>{r.d}</td><td>{r.l}</td>
                <td>{r.gf-r.ga>0?'+':''}{r.gf-r.ga}</td><td>{r.gf}:{r.ga}</td>
                <td className="md-gr-last"><span className="md-gr-form">{r.last.map((x,j)=><span key={j} className={'md-gr-fc wld-'+x}>{x}</span>)}</span></td>
                <td><b>{pts}</b></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="md-gr-rules">
        <b>Tie-breakers</b> — head-to-head points · goal difference · goals scored · disciplinary · FIFA ranking.
      </div>
    </div>
  );
}

Object.assign(window, { EventsTab, RatingsTab, StandingsTab });
