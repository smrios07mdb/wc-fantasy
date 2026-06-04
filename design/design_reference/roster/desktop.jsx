// roster/desktop.jsx — desktop My Team / Roster. Exports DesktopRoster.
const { useState:useStateRd } = React;

function RosterHeader({ squad, t, periodTotal, conn }){
  const me = mgr(ME_ID);
  const pulse = useScorePulse(periodTotal);
  const left = faabLeft();
  const pct = Math.round((left/ROSTER_FAAB.budget)*100);
  return (
    <div className="rt-top">
      <div className="rt-brand">
        <div className="vf-logo">W</div>
        <div className="rt-brand-txt">
          <div className="rt-brand-title display">My Team</div>
          <div className="t-micro text-tertiary">Cesar's Squad · Matchday 3 <span className="rt-livedot"></span></div>
        </div>
      </div>

      <div className="rt-top-spacer"></div>

      <div className="rt-top-total">
        <div className="t-label">This period</div>
        <div className={'rt-total-num display'+(pulse?' score-pulse':'')}>{periodTotal}<small>pts</small></div>
      </div>

      <button className="rt-faab" title="Manage waivers — $100 FAAB budget">
        <div className="rt-faab-top"><span className="t-label">FAAB</span><b className="mono">${left}</b></div>
        <div className={'meter'+(pct<=25?' is-low':'')} style={{width:96}}><span style={{width:pct+'%'}}></span></div>
        <div className="t-micro text-tertiary">{ROSTER_FAAB.pending} pending · ${ROSTER_FAAB.pendingTotal}</div>
      </button>

      <div className="rt-top-actions">
        <a className="btn btn-ghost btn-sm" href="#" title="Free-agent browser (Phase 4)">Find players</a>
        <a className="btn btn-primary btn-sm" href="Set Lineup.html">Set Lineup</a>
        <ConnPill state={conn}/>
      </div>
    </div>
  );
}

function DesktopRoster(props){
  const { squad, t, startSet, layout, onScore, onMenu, menuId, conn, periodTotal, sort, setSort } = props;
  const loading = conn==='loading';
  const byPos = {}; POS_ORDER.forEach(p=>byPos[p]=[]);
  squad.forEach(p=>byPos[p.pos].push(p.id));

  return (
    <div className="rt-app">
      <RosterHeader squad={squad} t={t} periodTotal={periodTotal} conn={conn}/>

      {conn==='reconnecting' && <div className="vf-banner vf-banner-recon"><span className="spinner" style={{width:12,height:12}}></span>Reconnecting — showing last confirmed squad…</div>}
      {conn==='stale' && <div className="vf-banner vf-banner-stale">Delayed feed · live points may be behind</div>}

      <div className="rt-toolbar">
        <LegalityStrip squad={squad}/>
        <div className="rt-toolbar-note t-caption text-tertiary">
          Lock-on-play · a player freezes the instant his match kicks off — manage moves before then.
        </div>
      </div>

      <div className="rt-body">
        {loading ? (
          <div className="rt-cols">
            {Array.from({length:2}).map((_,c)=>(
              <div key={c} className="rt-col">
                {Array.from({length:2}).map((_,g)=>(
                  <div key={g} className="rt-group">
                    <div className="skeleton" style={{height:28,width:160,borderRadius:8,marginBottom:12}}></div>
                    {Array.from({length:3}).map((_,r)=><div key={r} className="skeleton" style={{height:54,borderRadius:10,marginBottom:8}}></div>)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : layout==='table' ? (
          <div className="rt-tablewrap card">
            <RosterTable squad={squad} t={t} startSet={startSet} onScore={onScore} onMenu={onMenu} menuId={menuId} sort={sort} setSort={setSort}/>
          </div>
        ) : (
          <div className="rt-cols">
            <div className="rt-col">
              <PosGroup pos="GK"  ids={byPos.GK}  t={t} startSet={startSet} onScore={onScore} onMenu={onMenu} menuId={menuId}/>
              <PosGroup pos="DEF" ids={byPos.DEF} t={t} startSet={startSet} onScore={onScore} onMenu={onMenu} menuId={menuId}/>
            </div>
            <div className="rt-col">
              <PosGroup pos="MID" ids={byPos.MID} t={t} startSet={startSet} onScore={onScore} onMenu={onMenu} menuId={menuId}/>
              <PosGroup pos="FWD" ids={byPos.FWD} t={t} startSet={startSet} onScore={onScore} onMenu={onMenu} menuId={menuId}/>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
window.DesktopRoster = DesktopRoster;
