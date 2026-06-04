// playoffs/desktop.jsx — desktop Guillotine playoffs: hero + round-board / ladder + your survival rail.
function poMyMargin(round){
  if (!round.ranked) return null;
  const survN = round.survives;
  const lastSafe = round.ranked[survN-1], firstCut = round.ranked[survN];
  const me = round.ranked.find(r => r.id === ME_ID);
  if (!me || !firstCut || !lastSafe) return null;
  if (me.safe) return { safe:true, gap: me.pts - firstCut.pts, rival: firstCut };
  return { safe:false, gap: lastSafe.pts - me.pts, rival: lastSafe };
}

function PoRoundNav({ model, view, onView }){
  return (
    <div className="po-roundnav">
      {model.rounds.map((rd,i)=>(
        <button key={i} className={'po-rn-item'+(i===view?' is-active':'')+(' st-'+rd.status)}
          onClick={()=>onView(i)} title={`Round ${i+1} · ${rd.status}`}>
          <span className="po-rn-num">R{i+1}</span>
          <span className="po-rn-tag">{rd.status==='past'?'done':rd.status==='live'?'live':'next'}</span>
        </button>
      ))}
    </div>
  );
}

function SurvivorBoard({ round, detail, pulse, locked }){
  const survN = round.survives;
  const out = [];
  out.push(
    <div className="po-thead" key="head">
      <span className="po-th">Seed</span><span className="po-th">Manager</span>
      <span className="po-th">Playoff roster</span><span className="po-th po-th-c">Round rank</span>
      <span className="po-th po-th-c">Pts</span><span className="po-th po-th-c">Status</span>
    </div>
  );
  round.ranked.forEach((r,i)=>{
    if (i===survN) out.push(<GuillotineCutLine key="guillo" cut={round.cut} dropped={round.status==='past' || (round.live && locked)} victims={round.ranked.slice(survN)}/>);
    out.push(<SurvivorRow key={r.id} r={r} detail={detail} pulse={pulse} locked={locked}/>);
  });
  return <div className="po-board">{out}</div>;
}

function DesktopPlayoffs(props){
  const { model, view, onView, layout, detail, lineup, t, conn, pulse } = props;
  const loading = conn==='loading';
  const locked = t>=PERIOD_END;
  const cur = model.rounds[model.currentRoundIdx];
  const viewRound = model.rounds[view];
  const margin = poMyMargin(cur);
  const me = model.me;
  const meGone = me && !me.safe && locked;
  const sum = myReducedSummary(lineup, t);

  return (
    <div className="st-app po-app">
      <div className="st-top">
        <div className="st-brand">
          <div className="vf-logo">W</div>
          <div>
            <div className="st-brand-title display">Guillotine</div>
            <div className="t-micro text-tertiary">Knockout playoffs · lowest scorer falls</div>
          </div>
        </div>
        <nav className="st-nav">
          <a className="st-nav-item" href="Dashboard.html">Home</a>
          <a className="st-nav-item" href="My Team.html">My Team</a>
          <a className="st-nav-item" href="Set Lineup.html">Lineup</a>
          <a className="st-nav-item" href="Standings.html">Standings</a>
          <span className="st-nav-item is-active">Playoffs</span>
          <a className="st-nav-item" href="Waivers.html">Waivers</a>
        </nav>
        <div className="st-top-spacer"></div>
        <ConnPill state={conn}/>
      </div>

      <div className="st-scroll">
        <div className="st-page po-page">

          {/* hero */}
          <div className="po-hero">
            <div className="po-hero-lead">
              <span className="po-eyebrow"><span className="po-eyebrow-dot"></span>Guillotine · Round {model.currentRoundIdx+1} of {model.totalRounds}</span>
              <h2 className="po-hero-title display">{model.aliveNow} alive · lowest {model.cutThisRound} fall this round</h2>
              <p className="po-hero-sub t-body text-secondary">Everyone left is scored on a reduced roster. The lowest {model.cutThisRound} {model.cutThisRound===1?'scorer is':'scorers are'} guillotined; {model.survivesNow} advance. No second chances.</p>
            </div>
            <div className="po-hero-me">
              <span className="t-label">Your survival</span>
              {me ? (
                <>
                  <div className="po-hero-rankrow">
                    <b className={'po-hero-rank'+(margin&&!margin.safe?' is-zone':' is-safe')}>{me.rank}<small>of {model.aliveNow}</small></b>
                    {margin && (margin.safe
                      ? <span className="po-hero-status is-safe"><IcoCheck/>Surviving</span>
                      : <span className="po-hero-status is-zone">{meGone?<><IcoSkull/>Eliminated</>:<><IcoBlade/>Facing the cut</>}</span>)}
                  </div>
                  {margin && <div className={'po-hero-margin'+(margin.safe?' is-safe':' is-zone')}>
                    {margin.safe
                      ? <><b>+{margin.gap}</b> pts clear of the blade — {meName(margin.rival.m)} is first out</>
                      : (meGone
                          ? <>Caught <b>{margin.gap}</b> pts short of {meName(margin.rival.m)} — guillotined this round</>
                          : <><b>{margin.gap}</b> pts inside the kill zone — must pass {meName(margin.rival.m)}</>)}
                  </div>}
                  <div className="po-hero-figs">
                    <span className="t-micro text-tertiary">{me.pts} pts this round · group seed #{me.seed}</span>
                  </div>
                </>
              ) : <div className="t-caption text-tertiary">Eliminated earlier</div>}
            </div>
          </div>

          {/* explainer */}
          <div className="st-explain po-explain">
            <span className="st-explain-ic"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/></svg></span>
            <span>Playoff lineups shrink to <b>7 starters (1 GK + 6 outfield) + 2 bench</b>. Lock-on-play still applies. FAAB <b>reset to $100</b> at the transition so survivors can reinforce. Field size (8 / 10) and exact cut counts are fixed by the commissioner — values here are <b>provisional</b>.</span>
          </div>

          {layout==='ladder' ? (
            <div className="po-ladder-wrap">
              <div className="po-ladder">
                {model.rounds.map((rd,i)=><RoundColumn key={i} round={rd} idx={i} detail={detail} locked={locked}/>)}
              </div>
              <div className="po-ladder-rail">
                <div className="po-rail-card">
                  <div className="po-rail-head"><span className="t-label">Your reduced lineup</span><a className="po-rail-link" href="Set Lineup.html">Set lineup<IcoArrowR/></a></div>
                  <MyReducedPitch lineup={lineup} t={t}/>
                  <PoLockStrip sum={sum}/>
                </div>
                <ReinforceModule/>
              </div>
            </div>
          ) : (
            <div className="po-board-wrap">
              <div className="po-board-main">
                <div className="po-board-bar">
                  <div className="po-board-title">
                    <b className="display">Round {view+1}</b>
                    <span className="t-caption text-tertiary">{viewRound.fieldCount} entered · lowest {viewRound.cut} cut · {viewRound.survives} advance</span>
                  </div>
                  <PoRoundNav model={model} view={view} onView={onView}/>
                </div>
                {loading
                  ? <div className="po-board">{Array.from({length:8}).map((_,i)=><div key={i} className="skeleton" style={{height:52,borderRadius:10,margin:'6px 0'}}></div>)}</div>
                  : (viewRound.ranked
                      ? <SurvivorBoard round={viewRound} detail={detail} pulse={pulse} locked={locked}/>
                      : <div className="po-future-board"><div className="po-future-big mono">{viewRound.fieldCount}</div><span className="t-body text-secondary">survivors enter · lowest <b>{viewRound.cut}</b> guillotined · {viewRound.survives} advance</span><span className="t-caption text-tertiary">participants set once the previous round locks</span></div>)}
              </div>
              <div className="po-board-rail">
                <div className="po-rail-card">
                  <div className="po-rail-head"><span className="t-label">Your reduced lineup</span><a className="po-rail-link" href="Set Lineup.html">Set lineup<IcoArrowR/></a></div>
                  <MyReducedPitch lineup={lineup} t={t}/>
                  <PoLockStrip sum={sum}/>
                </div>
                <ReinforceModule/>
              </div>
            </div>
          )}

          <div className="st-foot t-micro text-tertiary">
            Scoring values illustrative pending SCORING.md · per-round cut counts and final field size (8 or 10) are provisional, fixed at the group→playoff transition.
          </div>
        </div>
      </div>
    </div>
  );
}

function PoLockStrip({ sum }){
  return (
    <div className="po-lockstrip">
      <span className="po-ls-stat"><b className="mono">{sum.movable}</b><span className="t-micro text-tertiary">movable</span></span>
      <span className="po-ls-stat"><b className="mono" style={{color:'var(--live)'}}>{sum.live}</b><span className="t-micro text-tertiary">playing</span></span>
      <span className="po-ls-stat"><b className="mono" style={{color:'var(--node-played,#6E86B4)'}}>{sum.played}</b><span className="t-micro text-tertiary">played</span></span>
      <span className="po-ls-cap t-micro text-tertiary">{sum.total}/{sum.cap} · 2 bench</span>
    </div>
  );
}

Object.assign(window, { DesktopPlayoffs, PoRoundNav, SurvivorBoard, PoLockStrip, poMyMargin });
