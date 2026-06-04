// boxscore/mobile.jsx — phone-condensed Player box-score inside iOS frame. Exports MobileBox.
function MobileBox(props){
  const { data, ids, curId, onPick, lead, breakdown, conn, theme } = props;
  const dark = theme!=='light';
  const loading = conn==='loading';
  return (
    <IOSDevice dark={dark} width={402} height={860}>
      <div className="mbx" data-theme={theme}>
        <div className="mbx-head">
          <div className="mbx-headrow">
            <a className="bx-back" href="My Team.html">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M15 5l-7 7 7 7"/></svg>
            </a>
            <div className="mbx-title display">Box score</div>
            <ConnPill state={conn}/>
          </div>
          <PlayerSwitcher ids={ids} curId={curId} onPick={onPick} compact/>
        </div>

        {conn==='reconnecting' && <div className="vf-banner vf-banner-recon mvf-banner"><span className="spinner" style={{width:12,height:12}}></span>Reconnecting…</div>}
        {conn==='stale' && <div className="vf-banner vf-banner-stale mvf-banner">Delayed feed · stats may be behind</div>}

        <div className="mbx-scroll">
          {loading
            ? <>{Array.from({length:5}).map((_,i)=><div key={i} className="skeleton" style={{height:i<2?90:140,borderRadius:12,marginBottom:10}}></div>)}</>
            : <BoxScoreBody data={data} lead={lead} breakdown={breakdown} compact/>}
        </div>
      </div>
    </IOSDevice>
  );
}
window.MobileBox = MobileBox;
