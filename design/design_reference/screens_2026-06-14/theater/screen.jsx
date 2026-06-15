// playoffs2/directionB.jsx — DIRECTION B · "Full theater" (user-picked direction).
// The parrot is a performer. Center stage it hoists the machete; the bottom managers sweat on
// chopping blocks; on the drop the blade swings, a red CHOP slash fires, sparks burst, the doomed
// get an "OUT!" stamp. A prominent LEADERBOARD sits alongside so the facts (rank, points, the cut
// line, your status) are always easy to read. Functional colors only — red is the blade, cobalt = you.

function TbNav(){
  return (
    <div className="s2-nav s2-nav-tb">
      <div className="s2-brand"><span className="s2-logo">XI</span><b>WC Fantasy League</b></div>
      <nav className="s2-links">
        {['Home','My Team','Standings','Playoffs','Waivers'].map(x =>
          <a key={x} className={'s2-link'+(x==='Playoffs'?' is-active':'')} href="#">{x}</a>)}
      </nav>
      <span className="s2-live"><span className="s2-live-dot"></span>LIVE</span>
    </div>
  );
}

function TbVictim({ r, locked }){
  const me = r.id === ME_ID;
  return (
    <div className={'tb-victim' + (me ? ' is-me' : '') + (locked ? ' is-out' : '')}>
      <div className="tb-victim-fig">
        <span className="tb-blood"></span>
        <span className="tb-sweat tb-sweat-1"></span>
        <span className="tb-sweat tb-sweat-2"></span>
        <Avatar m={r.m} size="lg"/>
        <div className="tb-stamp">Eliminated!</div>
      </div>
      <span className="tb-victim-name">{meName(r.m)}{me && <span className="st-you">YOU</span>}</span>
      <span className="tb-victim-pts mono">{r.pts}<small>pts</small></span>
      <div className="tb-block-wood"></div>
    </div>
  );
}

// ---- the leaderboard (always easy to read) ----
function TbLeaderRow({ r, locked, pulse }){
  const me = r.id === ME_ID;
  const gone = r.eliminated || (r.inZone && locked);
  const cls = ['tbl-row', me ? 'is-me' : '', r.inZone ? 'is-zone' : '', gone ? 'is-gone' : ''].join(' ');
  return (
    <div className={cls}>
      <span className="tbl-rank mono">{r.rank}</span>
      <Avatar m={r.m} size="sm"/>
      <span className="tbl-name">{meName(r.m)}{me && <span className="st-you">YOU</span>}</span>
      <span className={'tbl-stat ' + (r.inZone ? 'is-zone' : 'is-safe')}>{r.inZone ? (gone ? 'Chopped' : 'On the block') : 'Safe'}</span>
      <span className={'tbl-pts mono' + (pulse && me ? ' score-pulse' : '')}>{r.pts}</span>
    </div>
  );
}
function TbLeaderboard({ ranked, survN, cut, locked, pulse }){
  const rows = [];
  ranked.forEach((r, i) => {
    if (i === survN) rows.push(<BloodCut cut={cut} key="cut"/>);
    rows.push(<TbLeaderRow key={r.id} r={r} locked={locked} pulse={pulse}/>);
  });
  return (
    <div className="tbl">
      <div className="tbl-head">
        <span className="t-label">Round leaderboard</span>
        <span className="tbl-head-live"><span className="tbl-live-dot"></span>live · by points</span>
      </div>
      <div className="tbl-body">{rows}</div>
    </div>
  );
}

// a bloody gash dividing survivors from the chopped — drips and all
function BloodCut({ cut }){
  return (
    <div className="tbl-cut">
      <div className="tbl-cut-bar">
        <span className="tbl-cut-lab"><IcoBlade/>{` cut line · lowest ${cut}`}</span>
      </div>
      <span className="tbl-drip d1"></span>
      <span className="tbl-drip d2"></span>
      <span className="tbl-drip d3"></span>
      <span className="tbl-drip d4"></span>
      <span className="tbl-drop dd1"></span>
    </div>
  );
}

function TheaterScreen(props){
  const { model, cur, survivors, block, ranked, survN, t, phase, dropped, locked, edge, lineup, pulse } = props;
  const me = model.me;
  const headline = dropped ? 'CHOP!' : `LOWEST ${model.cutThisRound} GET THE CHOP`;
  return (
    <div className={'tb phase-' + phase + (dropped ? ' is-dropped' : '')}>
      <TbNav/>
      <div className="tb-shake">
        <div className="tb-scroll">
          <div className="tb-marquee">
            <span className="tb-eyebrow"><span className="da-eyebrow-dot"></span>Guillotine playoffs · Round {model.currentRoundIdx + 1} of {model.totalRounds}</span>
            <h1 className={'tb-headline' + (dropped ? ' is-chop' : '')}>{headline}</h1>
            <p className="tb-subcopy">The Chocoyo doesn't miss.</p>
            <p className="tb-substats">{model.aliveNow} still standing · {model.cutThisRound} get chopped · {model.survivesNow} advance</p>
          </div>

          <div className="tb-main">
            <div className="tb-stage">
              <div className="tb-spot tb-spot-l"></div>
              <div className="tb-spot tb-spot-r"></div>
              <div className="tb-floor"></div>
              <div className="tb-slash" aria-hidden="true"></div>
              <div className="tb-sparks" aria-hidden="true">
                {Array.from({ length: 9 }).map((_, i) => <span key={i} className={'tb-spark s' + i}></span>)}
              </div>

              <div className="tb-act">
                <div className="tb-act-glow"></div>
                <div className="tb-mech">
                  <Machete className="tb-act-blade" h={96} glow={true}/>
                  <TrophyMark className="tb-act-fig" size={320} squawk={dropped}/>
                </div>
                <div className="tb-act-cap">Chocoyo · your executioner</div>
              </div>

              <div className="tb-blockstage">
                <span className="tb-blockstage-lab"><IcoBlade/> On the block</span>
                <div className="tb-victims">
                  {block.map(r => <TbVictim key={r.id} r={r} locked={locked}/>)}
                </div>
              </div>
            </div>

            <TbLeaderboard ranked={ranked} survN={survN} cut={cur.cut} locked={locked} pulse={pulse}/>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- mobile ----
function TheaterMobile(props){
  const { model, cur, ranked, survN, block, phase, dropped, locked, edge } = props;
  const me = model.me;
  return (
    <div className={'mtb phase-' + phase + (dropped ? ' is-dropped' : '')}>
      <div className="mtb-shake">
        <div className="mtb-marquee">
          <span className="tb-eyebrow"><span className="da-eyebrow-dot"></span>Guillotine · R{model.currentRoundIdx + 1}</span>
          <h1 className={'mtb-headline' + (dropped ? ' is-chop' : '')}>{dropped ? 'CHOP!' : `LOWEST ${model.cutThisRound} GET THE CHOP`}</h1>
        </div>
        <div className="mtb-stage">
          <div className="tb-spot tb-spot-l"></div>
          <div className="tb-slash" aria-hidden="true"></div>
          <div className="mtb-act">
            <div className="tb-mech"><Machete className="tb-act-blade" h={48} glow={true}/><TrophyMark className="tb-act-fig" size={150} squawk={dropped}/></div>
          </div>
          <div className="mtb-victims">
            {block.map(r => <TbVictim key={r.id} r={r} locked={locked}/>)}
          </div>
        </div>
        <div className="mtb-scroll">
          <div className={'mtb-youband ' + (edge.safe ? 'is-safe' : 'is-zone')}>
            <div className="mda-you-rank"><b className={edge.safe ? 'is-safe' : 'is-zone'}>{me ? me.rank : '–'}</b><small>of {model.aliveNow}</small></div>
            <span className={'mda-you-pill ' + (edge.safe ? 'is-safe' : 'is-zone')}>{edge.safe ? '✓ Safe' : '⚠ On the block'}</span>
            <div className="mda-you-pts"><b className="mono">{me ? me.pts : '–'}</b><small>pts</small></div>
          </div>
          <div className="mtb-leader">
            <div className="tbl-head"><span className="t-label">Round leaderboard</span><span className="tbl-head-live"><span className="tbl-live-dot"></span>live</span></div>
            <div className="tbl-body">
              {ranked.map((r, i) => (
                <React.Fragment key={r.id}>
                  {i === survN && <BloodCut cut={cur.cut}/>}
                  <TbLeaderRow r={r} locked={locked}/>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { TheaterScreen, TheaterMobile });
