// boxscore/desktop.jsx — desktop Player box-score. Exports DesktopBox.
function DesktopBox(props){
  const { data, ids, curId, onPick, lead, breakdown, conn } = props;
  const loading = conn==='loading';
  return (
    <div className="bx-app">
      <div className="bx-top">
        <a className="bx-back" href="My Team.html" title="Back to My Team">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M15 5l-7 7 7 7"/></svg>
        </a>
        <div className="bx-top-title"><span className="t-label">Box score</span><b className="display">Player detail</b></div>
        <PlayerSwitcher ids={ids} curId={curId} onPick={onPick}/>
        <div className="bx-top-spacer"></div>
        <span className="bx-period-chip">Matchday 3 <span className="rt-livedot"></span></span>
        <ConnPill state={conn}/>
      </div>

      {conn==='reconnecting' && <div className="vf-banner vf-banner-recon"><span className="spinner" style={{width:12,height:12}}></span>Reconnecting — showing last confirmed data…</div>}
      {conn==='stale' && <div className="vf-banner vf-banner-stale">Delayed feed · live stats may be behind</div>}

      <div className="bx-scroll">
        {loading
          ? <div className="bx-body">
              <div className="skeleton" style={{height:96,borderRadius:14,marginBottom:14}}></div>
              <div className="skeleton" style={{height:92,borderRadius:14,marginBottom:14}}></div>
              <div className="bx-groups">{Array.from({length:4}).map((_,i)=><div key={i} className="skeleton" style={{height:180,borderRadius:14}}></div>)}</div>
            </div>
          : <BoxScoreBody data={data} lead={lead} breakdown={breakdown}/>}
      </div>
    </div>
  );
}
window.DesktopBox = DesktopBox;
