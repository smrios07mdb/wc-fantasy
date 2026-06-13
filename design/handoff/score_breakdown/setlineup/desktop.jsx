// setlineup/desktop.jsx — desktop Set Lineup (inside browser-window chrome). Exports DesktopSetLineup.

function DesktopSetLineup(props){
  const { lineup, t, mode, period, tokenStyle, heroVariant, ix, conn, lastSaved,
          summary, onPickFormation, periods, periodId, setPeriodId } = props;
  const conf = modeConf(mode);
  const loading = conn==='loading';

  return (
    <div className="sl-app">
      {/* top bar */}
      <div className="sl-top">
        <div className="sl-brand">
          <div className="vf-logo">W</div>
          <div>
            <div className="display sl-brand-title">Set Lineup</div>
            <div className="t-micro text-tertiary" style={{letterSpacing:'.06em'}}>{conf.label.toUpperCase()} · {conf.sub.toUpperCase()}</div>
          </div>
        </div>
        <div className="tabs sl-periodtabs">
          {periods.map(p=>(
            <button key={p.id} className={'tab'+(periodId===p.id?' is-active':'')} onClick={()=>setPeriodId(p.id)}>
              {p.tab}{p.live && <span className="sl-livedot-tab"></span>}
            </button>
          ))}
        </div>
        <div style={{flex:1}}></div>
        <div className="sl-top-right">
          <span className="t-micro text-tertiary">{period.sub}</span>
          <ConnPill state={conn}/>
        </div>
      </div>

      {/* connection banners */}
      {conn==='reconnecting' && <div className="vf-banner vf-banner-recon"><span className="spinner" style={{width:13,height:13}}></span>Reconnecting — your last saved lineup is shown; new changes will sync when reconnected.</div>}
      {conn==='stale' && <div className="vf-banner vf-banner-stale">Connection delayed — lock states may lag. Last confirmed {lastSaved}.</div>}

      {/* lock-status hero */}
      {!loading && <LockHero summary={summary} variant={heroVariant} t={t} period={period} mode={mode} lastSaved={lastSaved} conn={conn}/>}
      {loading && <div className="sl-hero" style={{height:108}}><span className="skeleton" style={{width:'100%',height:'100%',display:'block',borderRadius:12}}></span></div>}

      <div className="sl-body">
        {/* pitch column */}
        <div className="sl-pitchcol">
          <div className="sl-controls">
            <FormationPicker lineup={lineup} mode={mode} t={t} onPick={onPickFormation}/>
          </div>
          {loading
            ? <div className="sl-pitch sl-pitch-lg"><span className="skeleton" style={{width:'100%',height:'100%',borderRadius:14,display:'block'}}></span></div>
            : <Pitch lineup={lineup} t={t} tokenStyle={tokenStyle} ix={ix} size="lg"/>}
          <PitchLegend/>
        </div>

        {/* right rail */}
        <div className="sl-rail">
          <SelectionHint ix={ix} t={t}/>
          {tokenStyle==='disc' && !loading && <XIList lineup={lineup} t={t} ix={ix}/>}
          {!loading && <Bench lineup={lineup} t={t} ix={ix} cap={conf.benchCap}/>}
          {loading && <div className="sl-bench">{Array.from({length:4}).map((_,i)=><div key={i} className="skeleton" style={{height:44,marginBottom:8,borderRadius:8}}></div>)}</div>}
          <div className="sl-rail-foot">
            <span className="t-micro text-tertiary">{period.kind==='playoff'
              ? 'Reduced roster — guillotine survivors only. Bench GK optional.'
              : 'Unique ownership · 15-man squad (2 GK / 5 DEF / 5 MID / 3 FWD).'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
window.DesktopSetLineup = DesktopSetLineup;
