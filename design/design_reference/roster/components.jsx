// roster/components.jsx — presentational pieces for My Team / Roster.
// Reuses globals: Flag, Pos, ScorePill, PlayerScoreSheet, LockTag, evalSquadPlayer,
//   statusOf, matchState, matchScore, JERSEY_BG, player.
const { useState:useStateRt, useRef:useRefRt, useEffect:useEffectRt } = React;

const rtShort = p => `${p.first[0]}. ${p.last}`;

// ---- kit chip: the player's national flag on a shirt silhouette (reuses the kit-outline idea) ----
function KitChip({ nat, sm }){
  return <span className={'rt-kit'+(sm?' rt-kit-sm':'')}
    style={{ background: JERSEY_BG[nat] || (NATIONS[nat]||{}).f || 'var(--surface-4)' }}
    title={(NATIONS[nat]||{}).n}></span>;
}

// ---- starter / bench tag ----
function RoleTag({ inXI, mini }){
  const m = mini ? ' rt-role-mini' : '';
  return inXI
    ? <span className={'rt-role rt-role-xi'+m}>Starting</span>
    : <span className={'rt-role rt-role-bench'+m}>Bench</span>;
}

// ---- next-match cell: who he plays + live clock/score ----
function NextMatch({ id, t, mini }){
  const fx = playerFixture(id);
  const sc = matchScore(fx.m, t);
  const ph = sc.st.phase;
  return (
    <span className={'rt-nm'+(mini?' rt-nm-mini':'')}>
      <span className="rt-nm-vs">{fx.home?'vs':'@'}</span>
      <Flag nat={fx.opp}/>
      <b className="rt-nm-opp">{fx.opp}</b>
      {ph==='ytp'   && <span className="rt-nm-clock is-ytp mono">{koClock(id)}</span>}
      {ph==='live'  && <span className="rt-nm-clock is-live mono"><span className="rt-livedot"></span>{sc.st.min}'</span>}
      {ph==='final' && <span className="rt-nm-clock is-final mono">FT {sc.h}–{sc.a}</span>}
    </span>
  );
}

// ---- points block: this-period (clickable → breakdown) + season-to-date ----
function PtsBlock({ id, t, onScore, align='right' }){
  const e = evalSquadPlayer(id, t);
  const season = seasonPts(id);
  return (
    <span className={'rt-ptsblock rt-ptsblock-'+align}>
      {e.status==='movable'
        ? <span className="rt-pts-dash" title="Yet to play">—</span>
        : <ScorePill id={id} t={t} onOpen={onScore}/>}
      <span className="rt-season mono" title="Season to date"><b>{season}</b><span className="rt-season-lab">SZN</span></span>
    </span>
  );
}

// ---- legality strip: 2 GK / 5 DEF / 5 MID / 3 FWD ----
function LegalityStrip({ squad, compact }){
  const c = rosterCounts(squad);
  const legal = rosterLegal(squad);
  return (
    <div className={'rt-legal'+(compact?' rt-legal-compact':'')}>
      <div className="rt-legal-cells">
        {POS_ORDER.map(pos=>{
          const ok = c[pos]===ROSTER_REQ[pos];
          return (
            <div key={pos} className={'rt-legal-cell'+(ok?' is-ok':' is-bad')}>
              <Pos p={pos}/>
              <span className="rt-legal-count mono"><b>{c[pos]}</b><span className="rt-legal-req">/{ROSTER_REQ[pos]}</span></span>
            </div>
          );
        })}
      </div>
      <div className={'rt-legal-verdict'+(legal?' is-ok':' is-bad')}>
        {legal ? <><IcoCheckRt/> {squad.length}/{ROSTER_TOTAL} · squad legal</>
               : <><IcoAlertRt/> {squad.length}/{ROSTER_TOTAL} · fix shape</>}
      </div>
    </div>
  );
}

const IcoCheckRt = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M20 6 9 17l-5-5"/></svg>;
const IcoAlertRt = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 8v5M12 16.5v.5"/><circle cx="12" cy="12" r="9"/></svg>;
const IcoKebab = () => <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>;
const IcoBox = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/></svg>;
const IcoPitch = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18M12 3v18"/><circle cx="12" cy="12" r="3"/></svg>;
const IcoDrop = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 7h14M10 7V5h4v2M6 7l1 13h10l1-13"/></svg>;

// ============================================================ desktop row ===
function RosterRow({ id, t, inXI, onScore, onMenu, menuId }){
  const p = player(id);
  const status = statusOf(id, t);
  return (
    <div className={'rt-row s-'+status+(inXI?'':' is-bench')}>
      <KitChip nat={p.nat}/>
      <div className="rt-namecol">
        <div className="rt-nameline">
          <b className="rt-name">{rtShort(p)}</b>
        </div>
        <div className="rt-metaline t-micro text-tertiary">
          <span>{(NATIONS[p.nat]||{}).n || p.nat}</span>
          <span className="rt-dot">·</span>
          <span>{acqLabel(id)}</span>
        </div>
      </div>
      <div className="rt-statuscol">
        <LockTag status={status} mini/>
        <RoleTag inXI={inXI} mini/>
      </div>
      <NextMatch id={id} t={t}/>
      <PtsBlock id={id} t={t} onScore={onScore}/>
      <button className={'rt-kebab'+(menuId===id?' is-open':'')} onClick={(e)=>{ e.stopPropagation(); onMenu(id, e.currentTarget); }} title="Manage">
        <IcoKebab/>
      </button>
    </div>
  );
}

// ============================================================ position group ===
function PosGroup({ pos, ids, t, startSet, onScore, onMenu, menuId }){
  const ok = ids.length===ROSTER_REQ[pos];
  return (
    <section className="rt-group">
      <header className="rt-group-head">
        <div className="rt-group-title">
          <Pos p={pos}/>
          <h3 className="t-h3">{POS_FULL[pos]}</h3>
        </div>
        <span className={'rt-group-count'+(ok?' is-ok':' is-bad')}>
          {ok ? <IcoCheckRt/> : <IcoAlertRt/>}
          <span className="mono"><b>{ids.length}</b>/{ROSTER_REQ[pos]}</span>
        </span>
      </header>
      <div className="rt-rows">
        {ids.map(id => (
          <RosterRow key={id} id={id} t={t} inXI={startSet.has(id)} onScore={onScore} onMenu={onMenu} menuId={menuId}/>
        ))}
      </div>
    </section>
  );
}

// ============================================================ table variant ===
function RosterTable({ squad, t, startSet, onScore, onMenu, menuId, sort, setSort }){
  const dir = sort.dir;
  const sorted = [...squad].sort((a,b)=>{
    let av, bv;
    if (sort.key==='pos'){ av=POS_ORDER.indexOf(a.pos); bv=POS_ORDER.indexOf(b.pos); }
    else if (sort.key==='pts'){ av=evalSquadPlayer(a.id,t).pts; bv=evalSquadPlayer(b.id,t).pts; }
    else if (sort.key==='season'){ av=seasonPts(a.id); bv=seasonPts(b.id); }
    else if (sort.key==='status'){ const o={live:0,played:1,movable:2}; av=o[statusOf(a.id,t)]; bv=o[statusOf(b.id,t)]; }
    else { av=a.last; bv=b.last; }
    if (av<bv) return dir==='asc'?-1:1;
    if (av>bv) return dir==='asc'?1:-1;
    return POS_ORDER.indexOf(a.pos)-POS_ORDER.indexOf(b.pos);
  });
  const Th = ({k, children, num}) => (
    <th className={(num?'num ':'')+'rt-th-sort'+(sort.key===k?' is-active':'')} onClick={()=>setSort(s=>({key:k, dir: s.key===k && s.dir==='desc'?'asc':'desc'}))}>
      {children}{sort.key===k && <span className="rt-sort-arrow">{dir==='desc'?'▾':'▴'}</span>}
    </th>
  );
  return (
    <table className="dtable rt-table">
      <thead><tr>
        <Th k="name">Player</Th>
        <Th k="pos">Pos</Th>
        <Th k="status">Status</Th>
        <th>Next</th>
        <Th k="pts" num>Period</Th>
        <Th k="season" num>Season</Th>
        <th></th>
      </tr></thead>
      <tbody>
        {sorted.map(p=>{
          const status = statusOf(p.id, t);
          return (
            <tr key={p.id} className={'s-'+status}>
              <td>
                <div className="rt-tname"><KitChip nat={p.nat} sm/><div><b className="rt-name">{rtShort(p)}</b>
                  <div className="t-micro text-tertiary">{(NATIONS[p.nat]||{}).n} · {acqShort(p.id)}</div></div></div>
              </td>
              <td><Pos p={p.pos}/></td>
              <td><div className="rt-statuscol"><LockTag status={status} mini/><RoleTag inXI={startSet.has(p.id)} mini/></div></td>
              <td><NextMatch id={p.id} t={t} mini/></td>
              <td className="num">{evalSquadPlayer(p.id,t).status==='movable'
                ? <span className="rt-pts-dash">—</span>
                : <ScorePill id={p.id} t={t} onOpen={onScore}/>}</td>
              <td className="num mono rt-season-td">{seasonPts(p.id)}</td>
              <td className="num"><button className={'rt-kebab'+(menuId===p.id?' is-open':'')} onClick={(e)=>{e.stopPropagation(); onMenu(p.id, e.currentTarget);}}><IcoKebab/></button></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ============================================================ row action menu ===
function RowMenu({ id, t, rect, onClose, onScore, onBox, onDrop, onLineup }){
  useEffectRt(()=>{
    const h = ()=>onClose();
    window.addEventListener('click', h);
    window.addEventListener('resize', h);
    return ()=>{ window.removeEventListener('click', h); window.removeEventListener('resize', h); };
  }, []);
  if (!rect) return null;
  const dropOk = canDrop(id, t);
  const style = { position:'fixed', top: Math.min(rect.bottom+6, window.innerHeight-180), left: Math.max(12, rect.right-208), width:208, zIndex:80 };
  return (
    <div className="rt-menu" style={style} onClick={e=>e.stopPropagation()}>
      <button className="rt-menu-item" onClick={()=>{ onBox(id); onClose(); }}><IcoBox/>View box-score</button>
      <button className="rt-menu-item" onClick={()=>{ onLineup(); onClose(); }}><IcoPitch/>Open in Set Lineup</button>
      <div className="rt-menu-div"></div>
      <button className={'rt-menu-item rt-menu-danger'+(dropOk?'':' is-disabled')} disabled={!dropOk}
        onClick={()=>{ if(dropOk){ onDrop(id); onClose(); } }}>
        <IcoDrop/>Drop player {!dropOk && <span className="rt-menu-lock">locked</span>}
      </button>
    </div>
  );
}

// ============================================================ drop confirm ===
function DropConfirm({ id, t, onClose, onConfirm }){
  if (!id) return null;
  const p = player(id);
  const ok = canDrop(id, t);
  return (
    <div className="rt-scrim" onClick={onClose}>
      <div className="modal rt-dropmodal" onClick={e=>e.stopPropagation()}>
        <div className="rt-drop-head">
          <KitChip nat={p.nat}/>
          <div><div className="t-label">Drop player</div><b className="rt-name" style={{fontSize:16}}>{rtShort(p)}</b></div>
        </div>
        {ok ? (
          <p className="t-sm text-secondary rt-drop-body">
            {rtShort(p)} returns to the free-agent pool and your squad drops to <b>{ROSTER_TOTAL-1}/{ROSTER_TOTAL}</b> —
            below the required <b>{ROSTER_REQ[p.pos]}</b> {POS_FULL[p.pos].toLowerCase()}. You'll need to claim a replacement
            before your next lineup locks.
          </p>
        ) : (
          <div className="alert alert-warn rt-drop-body" style={{borderRadius:'var(--r-md)'}}>
            <IcoAlertRt/><span>{rtShort(p)}'s match has kicked off — he's <b>locked on play</b> and can't be dropped until the matchday ends.</span>
          </div>
        )}
        <div className="rt-drop-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" disabled={!ok} onClick={()=>{ onConfirm(id); onClose(); }}>Drop to free agents</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  rtShort, KitChip, RoleTag, NextMatch, PtsBlock, LegalityStrip,
  RosterRow, PosGroup, RosterTable, RowMenu, DropConfirm,
  IcoCheckRt, IcoAlertRt, IcoKebab, IcoBox, IcoPitch, IcoDrop,
});
