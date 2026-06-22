// matchdetail/lineups.jsx — Lineups tab: formation pitch (both teams, flag-kit jerseys),
// enriched XI lists, substitutes and coaches. Rating + fantasy woven onto every player.

function mdLines(team){
  const by = { GK:[], DEF:[], MID:[], FWD:[] };
  team.xi.forEach(p=> by[p.pos].push(p));
  return by;
}
// a column of tokens for one position line
function PitchCol({ players, team, t, onOpen, mob }){
  return (
    <div className="md-pcol">
      {players.map(p=> <KitToken key={p.id} p={p} team={team} t={t} onOpen={onOpen} mob={mob}/>)}
    </div>
  );
}
function PitchHalf({ team, t, onOpen, side, mob, orient }){
  const by = mdLines(team);
  // GK sits at the team's own goal-line; lines run out toward the halfway line.
  let order;
  if (orient==='v') order = side==='home' ? ['FWD','MID','DEF','GK'] : ['GK','DEF','MID','FWD'];
  else               order = side==='home' ? ['GK','DEF','MID','FWD'] : ['FWD','MID','DEF','GK'];
  return (
    <div className={'md-phalf md-phalf-'+side}>
      {order.map(pos=> <PitchCol key={pos} players={by[pos]} team={team} t={t} onOpen={onOpen} mob={mob}/>)}
    </div>
  );
}
function PitchBoth({ t, onOpen, mob }){
  const orient = mob ? 'v' : 'h';
  return (
    <div className={'md-pitch md-pitch-'+orient+(mob?' is-mob':'')}>
      <div className="md-pitch-lines" aria-hidden="true">
        <span className="md-pl-mid"></span><span className="md-pl-circle"></span>
        <span className="md-pl-box md-pl-box-l"></span><span className="md-pl-box md-pl-box-r"></span>
        <span className="md-pl-arc md-pl-arc-l"></span><span className="md-pl-arc md-pl-arc-r"></span>
      </div>
      {/* formation tags */}
      <div className="md-pitch-forms">
        <span className="md-form-tag"><Flag nat={MD_MATCH.home.code}/>{MD_MATCH.home.formation}</span>
        <span className="md-form-tag"><Flag nat={MD_MATCH.away.code}/>{MD_MATCH.away.formation}</span>
      </div>
      <div className="md-pitch-grid">
        {orient==='v'
          ? <><PitchHalf team={MD_MATCH.away} side="away" t={t} onOpen={onOpen} mob={mob} orient={orient}/>
              <PitchHalf team={MD_MATCH.home} side="home" t={t} onOpen={onOpen} mob={mob} orient={orient}/></>
          : <><PitchHalf team={MD_MATCH.home} side="home" t={t} onOpen={onOpen} mob={mob} orient={orient}/>
              <PitchHalf team={MD_MATCH.away} side="away" t={t} onOpen={onOpen} mob={mob} orient={orient}/></>}
      </div>
    </div>
  );
}

// event glyphs that sit on a lineup row
function RowEvents({ p, side }){
  const evs = MD_MATCH.events.filter(e=>{
    if (e.type==='goal' && e.side===side) return e.scorer[0]===p.num || (e.assist&&e.assist[0]===p.num);
    if (e.type==='yellow' && e.side===side) return e.player[0]===p.num;
    return false;
  });
  const glyphs = [];
  evs.forEach((e,i)=>{
    if (e.type==='goal' && e.scorer[0]===p.num) glyphs.push(<span key={'g'+i} className="md-rev is-goal" title={"Goal "+e.min+"'"}>⚽</span>);
    if (e.type==='goal' && e.assist&&e.assist[0]===p.num) glyphs.push(<span key={'a'+i} className="md-rev is-ast" title={"Assist "+e.min+"'"}>A</span>);
    if (e.type==='yellow') glyphs.push(<span key={'y'+i} className="md-rev is-yel" title={"Booked "+e.min+"'"}></span>);
  });
  if (p.subOff) glyphs.push(<span key="so" className="md-rev is-off" title={"Subbed off "+p.subOff+"'"}>▾{p.subOff}'</span>);
  if (p.subOn)  glyphs.push(<span key="on" className="md-rev is-on" title={"Subbed on "+p.subOn+"'"}>▴{p.subOn}'</span>);
  return glyphs.length ? <span className="md-revs">{glyphs}</span> : null;
}

function LineupRow({ p, team, t, onOpen }){
  const r = mdRating(p, t);
  const f = mdFantasy(p, t);
  const me = p.owner===ME_ID;
  return (
    <button className={'md-lr'+(me?' is-me':'')} onClick={()=>onOpen&&onOpen(p, team)}>
      <span className="md-lr-num mono">{p.num}</span>
      <span className="md-lr-main">
        <span className="md-lr-name">{p.cap&&<i className="md-cap">C</i>}{p.first} {p.last}</span>
        <span className="md-lr-sub"><Pos p={p.pos}/><OwnerChip ownerId={p.owner} benchedBy={p.benchedBy} tiny/><RowEvents p={p} side={team.side}/></span>
      </span>
      <FantasyPts f={f} size="sm" mine={me}/>
      <RatingBadge r={r}/>
    </button>
  );
}

function TeamLineup({ team, t, onOpen }){
  const starters = team.xi;
  const subbedOn = team.bench.filter(b=>b.subOn!=null);
  const rest = team.bench.filter(b=>b.subOn==null);
  const avg = mdTeamRating(team, t);
  return (
    <div className="md-tl">
      <div className="md-tl-head">
        <span className="md-crest sm" style={{ background:(window.JERSEY_BG||{})[team.code] }}></span>
        <b>{team.name}</b><span className="md-tl-form">{team.formation}</span>
        {avg!=null && <span className="md-tl-avg"><RatingBadge r={avg} size="sm"/>team avg</span>}
      </div>
      <div className="md-tl-sec">Starting XI</div>
      <div className="md-tl-rows">{starters.map(p=> <LineupRow key={p.id} p={p} team={team} t={t} onOpen={onOpen}/>)}</div>
      <div className="md-tl-sec">Substitutes</div>
      <div className="md-tl-rows">
        {subbedOn.map(p=> <LineupRow key={p.id} p={p} team={team} t={t} onOpen={onOpen}/>)}
        {rest.map(p=> <LineupRow key={p.id} p={p} team={team} t={t} onOpen={onOpen}/>)}
      </div>
      <div className="md-tl-coach"><span className="md-coach-ic">▦</span>Coach · <b>{team.coach}</b></div>
    </div>
  );
}

function LineupsTab({ t, onOpen, mob }){
  return (
    <div className={'md-lineups'+(mob?' is-mob':'')}>
      <PitchBoth t={t} onOpen={onOpen} mob={mob}/>
      <div className="md-legend">
        <span className="md-lg"><span className="md-lg-rate" style={{ background:'#46A05A' }}>7.4</span>Match rating</span>
        <span className="md-lg"><span className="md-lg-fpt">+8</span>Fantasy points</span>
        <span className="md-lg"><span className="md-lg-own is-me">YOU</span>Owned by you</span>
        <span className="md-lg"><span className="md-lg-own">MA</span>Owned in league</span>
      </div>
      <div className="md-tl-grid">
        <TeamLineup team={MD_MATCH.home} t={t} onOpen={onOpen}/>
        <TeamLineup team={MD_MATCH.away} t={t} onOpen={onOpen}/>
      </div>
    </div>
  );
}

Object.assign(window, { PitchBoth, LineupRow, TeamLineup, LineupsTab });
