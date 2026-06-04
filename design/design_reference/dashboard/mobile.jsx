// dashboard/mobile.jsx — phone home inside iOS frame. Exports MobileDash.
function MobileDash(props){
  const { phase, model, t, conn, theme } = props;
  const dark = theme!=='light';
  const loading = conn==='loading';
  const keys = modulesFor(phase);

  return (
    <IOSDevice dark={dark} width={402} height={860}>
      <div className="mdb" data-theme={theme}>
        <div className="mdb-head">
          <div className="mdb-headrow">
            <div className="db-brand"><div className="vf-logo">W</div><b className="display" style={{fontSize:16}}>WC Fantasy League</b></div>
            <ConnPill state={conn}/>
          </div>
        </div>

        {conn==='reconnecting' && <div className="vf-banner vf-banner-recon mvf-banner"><span className="spinner" style={{width:12,height:12}}></span>Reconnecting…</div>}
        {conn==='stale' && <div className="vf-banner vf-banner-stale mvf-banner">Delayed feed · figures may be behind</div>}

        <div className="mdb-scroll">
          {loading
            ? Array.from({length:5}).map((_,i)=><div key={i} className="skeleton" style={{height:i===0?150:120,borderRadius:14,marginBottom:12}}></div>)
            : <>
                <PrimaryBanner phase={phase} t={t} router={model==='router'}/>
                {(model==='router' ? (PRIMARY_MOD[phase]?[PRIMARY_MOD[phase]]:[]) : keys).map(k=>(
                  <div key={k}>{renderModule(k, t)}</div>
                ))}
                <div className="mdb-nav">
                  {NAV.filter(n=>!n.active).map(n=>(<a key={n.label} className="btn btn-ghost btn-sm" href={n.href}>{n.label}</a>))}
                </div>
              </>}
        </div>
      </div>
    </IOSDevice>
  );
}
window.MobileDash = MobileDash;
