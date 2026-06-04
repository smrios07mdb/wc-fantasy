// roster/mobile.jsx — phone-condensed My Team / Roster inside the iOS frame.
// Exports MobileRoster + MobileActionSheet (sheet rendered at app level).

function MRosterRow({ id, t, inXI, onScore, onMenu }){
  const p = player(id);
  const status = statusOf(id, t);
  const e = evalSquadPlayer(id, t);
  return (
    <button className={'mrt-row s-'+status} onClick={()=>onMenu(id)}>
      <KitChip nat={p.nat} sm/>
      <div className="mrt-namecol">
        <b className="rt-name">{rtShort(p)}</b>
        <div className="mrt-meta"><Pos p={p.pos}/><LockTag status={status} mini/>{!inXI && <RoleTag inXI={false} mini/>}</div>
      </div>
      <div className="mrt-rightcol" onClick={e=>e.stopPropagation()}>
        {e.status==='movable'
          ? <span className="rt-pts-dash" title="Yet to play">—</span>
          : <ScorePill id={id} t={t} onOpen={onScore}/>}
        <NextMatch id={id} t={t} mini/>
      </div>
      <svg className="mrt-chev" viewBox="0 0 8 14" width="8" height="14"><path d="M1 1l6 6-6 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </button>
  );
}

function MPosGroup({ pos, ids, t, startSet, onScore, onMenu }){
  const ok = ids.length===ROSTER_REQ[pos];
  return (
    <section className="mrt-group">
      <header className="mrt-group-head">
        <div className="rt-group-title"><Pos p={pos}/><span className="mrt-group-title-txt">{POS_FULL[pos]}</span></div>
        <span className={'rt-group-count'+(ok?' is-ok':' is-bad')}>{ok?<IcoCheckRt/>:<IcoAlertRt/>}<span className="mono"><b>{ids.length}</b>/{ROSTER_REQ[pos]}</span></span>
      </header>
      <div className="mrt-rows">
        {ids.map(id => <MRosterRow key={id} id={id} t={t} inXI={startSet.has(id)} onScore={onScore} onMenu={onMenu}/>)}
      </div>
    </section>
  );
}

function MobileRoster(props){
  const { squad, t, startSet, onScore, onMobileMenu, conn, periodTotal, theme } = props;
  const dark = theme!=='light';
  const loading = conn==='loading';
  const left = faabLeft();
  const pct = Math.round((left/ROSTER_FAAB.budget)*100);
  const byPos = {}; POS_ORDER.forEach(p=>byPos[p]=[]);
  squad.forEach(p=>byPos[p.pos].push(p.id));

  return (
    <IOSDevice dark={dark} width={402} height={860}>
      <div className="mrt" data-theme={theme}>
        <div className="mrt-head">
          <div className="mrt-headrow">
            <div>
              <div className="display mrt-title">My Team</div>
              <div className="t-micro text-tertiary">Cesar's Squad · Matchday 3 <span className="rt-livedot"></span></div>
            </div>
            <ConnPill state={conn}/>
          </div>
          <div className="mrt-statsrow">
            <div className="mrt-total">
              <span className="t-label">This period</span>
              <b className="display mrt-total-num">{periodTotal}<small>pts</small></b>
            </div>
            <div className="mrt-faab">
              <div className="rt-faab-top"><span className="t-label">FAAB</span><b className="mono">${left}</b></div>
              <div className={'meter'+(pct<=25?' is-low':'')}><span style={{width:pct+'%'}}></span></div>
            </div>
          </div>
          <LegalityStrip squad={squad} compact/>
        </div>

        {conn==='reconnecting' && <div className="vf-banner vf-banner-recon mvf-banner"><span className="spinner" style={{width:12,height:12}}></span>Reconnecting…</div>}
        {conn==='stale' && <div className="vf-banner vf-banner-stale mvf-banner">Delayed feed · points may be behind</div>}

        <div className="mrt-scroll">
          {loading ? (
            Array.from({length:8}).map((_,i)=><div key={i} className="skeleton" style={{height:52,borderRadius:12,marginBottom:8}}></div>)
          ) : (
            <>
              {POS_ORDER.map(pos => <MPosGroup key={pos} pos={pos} ids={byPos[pos]} t={t} startSet={startSet} onScore={onScore} onMenu={onMobileMenu}/>)}
              <div className="mrt-actions">
                <a className="btn btn-primary btn-block" href="Set Lineup.html">Set Lineup</a>
                <a className="btn btn-ghost btn-block" href="#">Find players · waivers</a>
              </div>
            </>
          )}
        </div>
      </div>
    </IOSDevice>
  );
}

// bottom action sheet (mobile) — mirrors the desktop RowMenu options
function MobileActionSheet({ id, t, onClose, onScore, onBox, onDrop, onLineup }){
  if (!id) return null;
  const p = player(id);
  const status = statusOf(id, t);
  const dropOk = canDrop(id, t);
  return (
    <div className="rt-scrim rt-sheet-scrim" onClick={onClose}>
      <div className="rt-sheet" onClick={e=>e.stopPropagation()}>
        <div className="rt-sheet-head">
          <KitChip nat={p.nat}/>
          <div className="rt-sheet-id"><b className="rt-name">{rtShort(p)}</b>
            <div className="rt-sheet-meta"><Pos p={p.pos}/><LockTag status={status} mini/></div></div>
        </div>
        <button className="rt-sheet-item" onClick={()=>{ onBox(id); onClose(); }}><IcoBox/>View box-score</button>
        <button className="rt-sheet-item" onClick={()=>{ onLineup(); onClose(); }}><IcoPitch/>Open in Set Lineup</button>
        <button className={'rt-sheet-item rt-menu-danger'+(dropOk?'':' is-disabled')} disabled={!dropOk}
          onClick={()=>{ if(dropOk){ onDrop(id); onClose(); } }}>
          <IcoDrop/>Drop player {!dropOk && <span className="rt-menu-lock">locked on play</span>}
        </button>
        <button className="btn btn-ghost btn-block" style={{marginTop:8}} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

Object.assign(window, { MobileRoster, MobileActionSheet });
