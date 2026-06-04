// playoffs/components.jsx — presentational pieces for the Guillotine playoffs surface.
// Reuses globals: Avatar, Pos, Flag, mgr, ME_ID, statusOf, evalSquadPlayer, player,
//   LANES, KitChip-style flag kits via JERSEY_BG, modeConf, myReducedSummary.
const { useState:usePo, useEffect:usePoFx } = React;

const meName = m => (m.id === ME_ID ? 'You' : m.name);

// ============================================================ the guillotine ===
// A graphic red blade line with a little guillotine sitting on top of it — the visual
// signature of the cut. `armed` = blade hovers (round live); `dropped` = round locked.
function GuillotineIcon({ dropped }){
  return (
    <svg className={'po-guillo-svg'+(dropped?' is-dropped':'')} viewBox="0 0 60 54" width="50" height="45" aria-hidden="true">
      {/* posts + base */}
      <rect x="9"  y="6" width="5" height="46" rx="1.5" fill="var(--po-frame)"/>
      <rect x="46" y="6" width="5" height="46" rx="1.5" fill="var(--po-frame)"/>
      <rect x="4"  y="49" width="52" height="5" rx="2" fill="var(--po-frame)"/>
      {/* top crossbar */}
      <rect x="6" y="2" width="48" height="6" rx="2" fill="var(--po-frame)"/>
      {/* the blade — slides down the rails */}
      <g className="po-blade">
        <path d="M14 10 h32 v10 l-32 8 z" fill="var(--elim)"/>
        <path d="M14 10 h32 v3 H14 z" fill="#fff" opacity="0.55"/>
        <rect x="14" y="10" width="32" height="2.5" fill="var(--elim)"/>
      </g>
    </svg>
  );
}

function GuillotineCutLine({ cut, dropped, victims=[], provisional=true }){
  return (
    <div className={'po-guillo'+(dropped?' is-dropped':'')} role="separator">
      <div className="po-guillo-top">
        <GuillotineIcon dropped={dropped}/>
        <div className="po-guillo-blade"></div>
        <div className="po-guillo-meta">
          <span className="po-guillo-lab">{dropped ? 'Blade dropped' : 'Guillotine'} · lowest <b>{cut}</b> cut</span>
          {provisional && <span className="po-guillo-note t-micro">cut count provisional · set by the commissioner</span>}
        </div>
      </div>
      {victims.length>0 && (
        <div className="po-guillo-victims">
          <span className="po-victim-lab">{dropped ? 'Guillotined' : 'On the block'}</span>
          <div className="po-victims-row">
            {victims.map(v => (
              <span className="po-victim" key={v.id} title={meName(v.m)+(dropped?' — eliminated':' — facing the cut')}>
                <Avatar m={v.m} size="sm"/>
                <span className="po-victim-name">{meName(v.m)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================ reduced-roster shape ===
// Every playoff lineup shrinks to 7 starters (1 GK + 6 outfield) + 2 bench. A small node
// diagram of that shape, shown per survivor when the "shape detail" Tweak is on.
function ReducedShape({ formation='2-3-1' }){
  const conf = (window.FORMATIONS_PO && window.FORMATIONS_PO[formation]) || {DEF:2,MID:3,FWD:1};
  const lanes = [['FWD',conf.FWD],['MID',conf.MID],['DEF',conf.DEF],['GK',1]];
  return (
    <span className="po-shape" title={`Reduced roster · 7 starters (1 GK + 6 outfield) · ${formation}`}>
      {lanes.map(([pos,n]) => (
        <span className="po-shape-lane" key={pos}>
          {Array.from({length:n}).map((_,i)=><span className={'po-shape-node n-'+pos} key={i}></span>)}
        </span>
      ))}
    </span>
  );
}
function ShapeChip({ detail }){
  return (
    <span className="po-shapechip">
      {detail && <ReducedShape/>}
      <span className="po-shapechip-txt"><b>7</b><span className="po-sc-plus">+2</span><span className="po-sc-sub">1 GK · 6 out</span></span>
    </span>
  );
}

// ============================================================ survivor row (round-board) ===
function statusPill(r, locked){
  if (r.eliminated || (r.inZone && locked)) return <span className="pill pill-elim po-sp"><IcoSkull/>Eliminated</span>;
  if (r.inZone)     return <span className="po-sp po-sp-zone"><IcoBlade/>Facing the cut</span>;
  return <span className="po-sp po-sp-safe"><IcoCheck/>Surviving</span>;
}
const IcoSkull = () => <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="9" cy="11" r="1"/><circle cx="15" cy="11" r="1"/><path d="M12 3a8 8 0 0 0-8 8c0 3 2 4 2 6h12c0-2 2-3 2-6a8 8 0 0 0-8-8zM10 19v2M14 19v2"/></svg>;
const IcoBlade = () => <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M5 4h14v5l-14 6zM5 15l7 5"/></svg>;
const IcoCheck = () => <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M20 6 9 17l-5-5"/></svg>;
const IcoArrowR = () => <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 12h14M13 6l6 6-6 6"/></svg>;

function SurvivorRow({ r, detail, pulse, locked }){
  const me = r.id === ME_ID;
  const gone = r.eliminated || (r.inZone && locked);
  const cls = ['po-row', me?'is-me':'', gone?'is-elim':'', r.inZone?'is-zone':'', r.safe?'is-safe':''].join(' ');
  return (
    <div className={cls}>
      <span className="po-c-seed"><span className="po-seedbadge">{r.seed}</span></span>
      <span className="po-c-mgr">
        <Avatar m={r.m} size="sm"/>
        <span className="po-mgr-name">{meName(r.m)}</span>
        {me && <span className="st-you">YOU</span>}
        <span className="po-mgr-seed t-micro text-tertiary">group seed #{r.seed}</span>
      </span>
      <span className="po-c-shape"><ShapeChip detail={detail}/></span>
      <span className="po-c-rank mono">{r.rank}</span>
      <span className={'po-c-pts mono'+(pulse&&me?' score-pulse':'')}>{r.pts}<small>pts</small></span>
      <span className="po-c-status">{statusPill(r, locked)}</span>
    </div>
  );
}

// ============================================================ MY reduced pitch (hero) ===
// Reuses the Set-Lineup playoff lineup exactly (1 GK + 6 outfield + 2 bench), with live
// lock-on-play states and live points per player — so the reduced-roster constraint is
// concrete for YOU, not just an abstraction.
function poToken(id, t){
  const p = player(id);
  const st = statusOf(id, t);                    // movable | live | played
  const ev = evalSquadPlayer(id, t);
  return { p, st, pts:ev.pts };
}
function PoNode({ id, t }){
  const { p, st, pts } = poToken(id, t);
  return (
    <div className={'po-node st-'+st} title={`${p.first} ${p.last} · ${st}`}>
      <span className="po-node-kit" style={{ background: JERSEY_BG[p.nat] || 'var(--surface-4)' }}></span>
      <span className="po-node-name">{p.first[0]}. {p.last}</span>
      <span className={'po-node-pts mono'+(st==='live'?' is-live':'')}>{st==='movable'?'—':pts}{st==='live'&&<span className="po-livedot"></span>}</span>
    </div>
  );
}
function MyReducedPitch({ lineup, t }){
  const lanes = ['FWD','MID','DEF','GK'];
  return (
    <div className="po-pitch">
      {lanes.map(pos => (lineup.slots[pos]||[]).filter(Boolean).length>0 && (
        <div className="po-pitch-lane" key={pos}>
          {(lineup.slots[pos]||[]).filter(Boolean).map(id => <PoNode key={id} id={id} t={t}/>)}
        </div>
      ))}
      <div className="po-pitch-bench">
        <span className="t-micro text-tertiary po-bench-lab">Bench · 2</span>
        {lineup.bench.map(id => {
          const { p, st } = poToken(id, t);
          return <span className={'po-bench-chip st-'+st} key={id}><span className="po-bench-kit" style={{background:JERSEY_BG[p.nat]||'var(--surface-4)'}}></span>{p.last}</span>;
        })}
      </div>
    </div>
  );
}

// ============================================================ reinforce (FAAB) module ===
function ReinforceModule({ compact }){
  const f = PO_FAAB; const pct = Math.round(f.left/f.budget*100);
  return (
    <div className={'po-reinforce'+(compact?' is-compact':'')}>
      <div className="po-reinforce-head">
        <span className="t-label">Reinforce your survivors</span>
        <span className="po-reset-tag"><IcoReset/>FAAB reset to ${f.budget}</span>
      </div>
      <div className="po-faab">
        <div className="po-faab-fig"><b className="display mono">${f.left}</b><span className="t-micro text-tertiary">of ${f.budget} left</span></div>
        <div className={'meter'+(pct<=25?' is-low':'')} style={{flex:1}}><span style={{width:pct+'%'}}></span></div>
      </div>
      <p className="po-reinforce-copy t-caption text-secondary">Each surviving manager gets a clean <b>${f.budget}</b> at the group→playoff transition. Blind sealed bids; ties break on rolling waiver order.</p>
      <a className="btn btn-primary btn-block" href="Waivers.html">Open waivers<IcoArrowR/></a>
    </div>
  );
}
const IcoReset = () => <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 4v4h4"/></svg>;

// ============================================================ ladder round column ===
function LadderRow({ r, detail, locked }){
  const me = r.id === ME_ID;
  const gone = r.eliminated || (r.inZone && locked);
  const cls = ['po-lr', me?'is-me':'', gone?'is-elim':'', r.inZone?'is-zone':''].join(' ');
  return (
    <div className={cls}>
      <span className="po-lr-rank mono">{r.rank}</span>
      <Avatar m={r.m} size="sm"/>
      <span className="po-lr-name">{meName(r.m)}</span>
      <span className="po-lr-pts mono">{r.pts}</span>
      {gone && <IcoSkull/>}
    </div>
  );
}
function RoundColumn({ round, idx, detail, locked }){
  const head = (
    <div className={'po-col-head st-'+round.status}>
      <div className="po-col-rnum">R{idx+1}</div>
      <div className="po-col-meta">
        <span className={'po-col-tag po-col-'+round.status}>
          {round.status==='past'?'Settled':round.status==='live'?'Live now':'Upcoming'}
        </span>
        <span className="t-micro text-tertiary">cut {round.cut} · {round.fieldCount}→{round.survives}</span>
      </div>
    </div>
  );
  if (round.status==='future' || !round.ranked){
    return (
      <div className="po-col is-future">
        {head}
        <div className="po-col-future">
          <div className="po-future-big mono">{round.fieldCount}</div>
          <span className="t-caption text-tertiary">enter · lowest <b>{round.cut}</b> cut</span>
          <div className="po-future-survive">{round.survives} survive</div>
        </div>
      </div>
    );
  }
  const survN = round.survives;
  const rows = [];
  round.ranked.forEach((r,i)=>{
    if (round.status==='live' && i===survN) rows.push(<div className="po-col-cut" key="cut"><span className="po-col-cut-line"></span><span className="po-col-cut-lab">cut {round.cut}</span></div>);
    rows.push(<LadderRow key={r.id} r={r} detail={detail} locked={locked}/>);
  });
  return <div className={'po-col st-'+round.status}>{head}<div className="po-col-body">{rows}</div></div>;
}

Object.assign(window, {
  GuillotineIcon, GuillotineCutLine, ReducedShape, ShapeChip,
  SurvivorRow, statusPill, MyReducedPitch, PoNode, ReinforceModule,
  LadderRow, RoundColumn, meName,
  IcoSkull, IcoBlade, IcoCheck, IcoArrowR,
});
