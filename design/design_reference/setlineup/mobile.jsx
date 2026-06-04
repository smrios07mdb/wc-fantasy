// setlineup/mobile.jsx — phone-condensed Set Lineup, inside the iOS frame. Exports MobileSetLineup.

function MobileSetLineup(props){
  const { lineup, t, mode, period, tokenStyle, heroVariant, ix, conn, lastSaved,
          summary, onPickFormation, periods, periodId, setPeriodId } = props;
  const conf = modeConf(mode);
  const loading = conn==='loading';

  return (
    <IOSDevice dark width={402} height={860}>
      <div className="msl" data-theme="dark">
        <div className="msl-head">
          <div className="msl-headrow">
            <div>
              <div className="display msl-title">Set Lineup</div>
              <div className="t-micro text-tertiary">{conf.label} · {conf.sub}</div>
            </div>
            <ConnPill state={conn}/>
          </div>
          <div className="tabs msl-tabs">
            {periods.map(p=>(
              <button key={p.id} className={'tab'+(periodId===p.id?' is-active':'')} style={{flex:1}} onClick={()=>setPeriodId(p.id)}>
                {p.tab}{p.live && <span className="sl-livedot-tab"></span>}
              </button>
            ))}
          </div>
        </div>

        {conn==='reconnecting' && <div className="vf-banner vf-banner-recon mvf-banner"><span className="spinner" style={{width:12,height:12}}></span>Reconnecting…</div>}
        {conn==='stale' && <div className="vf-banner vf-banner-stale mvf-banner">Delayed · last confirmed {lastSaved}</div>}

        <div className="msl-scroll">
          {loading ? (
            <>
              <div className="skeleton" style={{height:96,borderRadius:12,marginBottom:12}}></div>
              <div className="skeleton" style={{height:360,borderRadius:14,marginBottom:12}}></div>
              {Array.from({length:4}).map((_,i)=><div key={i} className="skeleton" style={{height:42,borderRadius:8,marginBottom:8}}></div>)}
            </>
          ) : (
            <>
              <LockHero summary={summary} variant={heroVariant==='pitch'?'summary':heroVariant} t={t} period={period} mode={mode} lastSaved={lastSaved} conn={conn}/>
              <div className="msl-forms"><FormationPicker lineup={lineup} mode={mode} t={t} onPick={onPickFormation}/></div>
              <Pitch lineup={lineup} t={t} tokenStyle={tokenStyle} ix={ix} size="mob"/>
              <PitchLegend/>
              <div className="msl-hint"><SelectionHint ix={ix} t={t}/></div>
              {tokenStyle==='disc' && <XIList lineup={lineup} t={t} ix={ix}/>}
              <Bench lineup={lineup} t={t} ix={ix} cap={conf.benchCap}/>
            </>
          )}
        </div>
      </div>
    </IOSDevice>
  );
}
window.MobileSetLineup = MobileSetLineup;
