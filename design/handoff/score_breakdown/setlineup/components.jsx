// setlineup/components.jsx — presentational pieces for the Set Lineup surface.
// Reuses vsfield atoms (Flag, Pos, Avatar, ConnPill, IcoLive/Lock, useScorePulse) from globals.
// State language mirrors Vs the Field's pitch:  movable = hollow/accent · playing = lit red ·
// played = steel — here those same three ALSO mean "swap freely / frozen-playing / frozen-done".
const { useState:useStateC, useRef:useRefC, useEffect:useEffectC } = React;

const cellKey = c => `${c.kind}:${c.pos}:${c.idx}`;

// short "F. Surname"
const shortName = p => `${p.first[0]}. ${p.last}`;

// ---- lock chip: the always-on "why frozen vs movable" tell (color + icon + word) ----
function LockTag({ status, mini }) {
  const m = mini ? ' sl-lt-mini' : '';
  if (status==='movable') return <span className={'sl-lt sl-lt-move'+m}><IcoOpen/>Movable</span>;
  if (status==='live')    return <span className={'sl-lt sl-lt-live'+m}><IcoLive/>Locked · playing</span>;
  return <span className={'sl-lt sl-lt-played'+m}><IcoLock/>Locked · played</span>;
}
const IcoOpen = () => (
  <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.4">
    <rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/></svg>
);
const IcoSwap = () => (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2">
    <path d="M7 4 3 8l4 4M3 8h13M17 20l4-4-4-4M21 16H8"/></svg>
);

// ============================================================ pitch token ===
// state: 'idle' | 'selected' | 'eligible' | 'dim'
function PitchToken({ cell, t, tokenStyle, state, onTap, drag, onScore }) {
  const empty = cell.id == null;
  const p = empty ? null : player(cell.id);
  const status = empty ? 'empty' : statusOf(cell.id, t);
  const cls = ['sl-tok', 'sl-tok-'+tokenStyle, 's-'+status, 'st-'+state, empty?'is-empty':''].join(' ');
  // a locked player (playing/played) can't be swapped — tapping him opens his points breakdown
  const locked = !empty && status!=='movable';
  const tap = locked ? ()=>onScore && onScore(cell.id) : ()=>onTap(cell);
  const dragProps = (drag && !empty && status==='movable') ? {
    draggable:true,
    onDragStart:(e)=>{ e.dataTransfer.effectAllowed='move'; drag.onDragStart(cell); },
    onDragEnd:()=>drag.onDragEnd&&drag.onDragEnd(),
  } : {};
  const dropProps = drag ? {
    onDragOver:(e)=>{ if (state==='eligible'){ e.preventDefault(); } },
    onDrop:(e)=>{ if (state==='eligible'){ e.preventDefault(); drag.onDrop(cell); } },
  } : {};

  if (empty) {
    return (
      <button className={cls} onClick={()=>onTap(cell)} {...dropProps} title={cell.pos+' — empty'}>
        <span className="sl-empty-ring"><span className="sl-empty-plus">+</span></span>
        <span className="sl-tok-name sl-empty-lab">{cell.pos}</span>
      </button>
    );
  }

  const lockBadge = null; // replaced by kit-brightness + score line below

  // score / "to play" line shown under every token
  const ScoreLine = () => {
    const e = evalSquadPlayer(cell.id, t);
    if (e.status==='movable') return <span className="sl-tok-toplay">to play</span>;
    return (
      <span className={'sl-tok-score s-'+e.status} role="button" tabIndex={0}
        title="Tap for points breakdown"
        onClick={(ev)=>{ ev.stopPropagation(); onScore && onScore(cell.id); }}>
        {e.status==='live' && <span className="sl-score-dot"></span>}<b>{e.pts}</b> pts
      </span>
    );
  };

  if (tokenStyle==='named') {
    return (
      <button className={cls} onClick={tap} {...dragProps} {...dropProps}>
        <span className="sl-named-disc" style={{'--pc':`var(--pos-${p.pos.toLowerCase()})`}}>
          <Flag nat={p.nat}/>
        </span>
        <span className="sl-named-txt">
          <b className="sl-tok-name">{shortName(p)}</b>
          <span className="sl-named-meta"><Pos p={p.pos}/><ScoreLine/></span>
        </span>
      </button>
    );
  }
  if (tokenStyle==='disc') {
    return (
      <button className={cls} onClick={tap} {...dragProps} {...dropProps} title={shortName(p)}>
        <span className="sl-disc" style={{'--pc':`var(--pos-${p.pos.toLowerCase()})`}}>
          <span className="sl-disc-pos">{p.pos[0]}</span>
        </span>
        <span className="sl-tok-name sl-disc-name">{p.last}</span>
        <ScoreLine/>
      </button>
    );
  }
  // jersey (default) — the shirt is filled with the player's national flag
  return (
    <button className={cls} onClick={tap} {...dragProps} {...dropProps}>
      <span className="sl-jersey" style={{ background:(JERSEY_BG[p.nat] || (NATIONS[p.nat]||{}).f) }}></span>
      <span className="sl-tok-name">{shortName(p)}</span>
      <ScoreLine/>
    </button>
  );
}

// ============================================================ the pitch ===
function Pitch({ lineup, t, tokenStyle, ix, size='lg' }) {
  const order = ['FWD','MID','DEF','GK']; // attack at top
  const elig = ix.eligibleKeys;
  const selK = ix.sel ? cellKey(ix.sel) : null;
  const dragK = ix.drag && ix.drag.from ? cellKey(ix.drag.from) : null;
  const active = !!(selK || dragK);
  const stateFor = (cell) => {
    const k = cellKey(cell);
    if (k===selK || k===dragK) return 'selected';
    if (active) return elig.has(k) ? 'eligible' : 'dim';
    return 'idle';
  };
  return (
    <div className={'sl-pitch sl-pitch-'+size+' sl-tokens-'+tokenStyle}>
      <div className="sl-pitch-lines" aria-hidden="true">
        <span className="sl-pl-box sl-pl-box-top"></span>
        <span className="sl-pl-goal sl-pl-goal-top"></span>
        <span className="sl-pl-mid"></span>
        <span className="sl-pl-circle"></span>
        <span className="sl-pl-box sl-pl-box-bot"></span>
        <span className="sl-pl-goal sl-pl-goal-bot"></span>
      </div>
      <div className="sl-pitch-lanes">
        {order.map(pos => (lineup.slots[pos]||[]).length>0 && (
          <div className={'sl-lane sl-lane-'+pos} key={pos}>
            {lineup.slots[pos].map((id,idx)=>{
              const cell = { kind:'slot', pos, idx, id };
              return <PitchToken key={pos+idx} cell={cell} t={t} tokenStyle={tokenStyle}
                       state={stateFor(cell)} onTap={ix.onCellTap} drag={ix.drag} onScore={ix.openScore} />;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================ bench rail ===
function BenchRow({ cell, t, ix }) {
  const p = player(cell.id);
  const status = statusOf(cell.id, t);
  const k = cellKey(cell);
  const selK = ix.sel ? cellKey(ix.sel) : null;
  const dragK = ix.drag && ix.drag.from ? cellKey(ix.drag.from) : null;
  const active = !!(selK || dragK);
  const state = (k===selK||k===dragK) ? 'selected' : active ? (ix.eligibleKeys.has(k)?'eligible':'dim') : 'idle';
  const dragProps = (ix.drag && status==='movable') ? {
    draggable:true,
    onDragStart:(e)=>{ e.dataTransfer.effectAllowed='move'; ix.drag.onDragStart(cell); },
    onDragEnd:()=>ix.drag.onDragEnd&&ix.drag.onDragEnd(),
  } : {};
  const dropProps = ix.drag ? {
    onDragOver:(e)=>{ if(state==='eligible') e.preventDefault(); },
    onDrop:(e)=>{ if(state==='eligible'){ e.preventDefault(); ix.drag.onDrop(cell); } },
  } : {};
  const locked = status!=='movable';
  return (
    <button className={'sl-bench-row s-'+status+' st-'+state} onClick={locked ? ()=>ix.openScore(cell.id) : ()=>ix.onCellTap(cell)} {...dragProps} {...dropProps}>
      <Pos p={p.pos}/>
      <Flag nat={p.nat}/>
      <b className="sl-bench-name">{shortName(p)}</b>
      <LockTag status={status} mini/>
      {status!=='movable' && <ScorePill id={cell.id} t={t} onOpen={ix.openScore}/>}
    </button>
  );
}

// compact clickable score (bench + XI list)
function ScorePill({ id, t, onOpen }){
  const e = evalSquadPlayer(id, t);
  return (
    <span className={'sl-scorepill s-'+e.status} role="button" tabIndex={0}
      title="Tap for points breakdown"
      onClick={(ev)=>{ ev.stopPropagation(); onOpen && onOpen(id); }}>
      {e.status==='live' && <span className="sl-score-dot"></span>}<b>{e.pts}</b>
    </span>
  );
}
function Bench({ lineup, t, ix, cap }) {
  return (
    <div className="sl-bench">
      <div className="sl-rail-head">
        <span className="t-label">Bench</span>
        <span className="t-micro text-tertiary">{lineup.bench.length} / {cap}</span>
      </div>
      <div className="sl-bench-list">
        {lineup.bench.map((id,idx)=>(
          <BenchRow key={id} cell={{kind:'bench', pos:player(id).pos, idx, id}} t={t} ix={ix}/>
        ))}
        {lineup.bench.length===0 && <div className="t-sm text-tertiary" style={{padding:'8px 2px'}}>No bench players.</div>}
      </div>
    </div>
  );
}

// ---- synced XI list (used in disc+list token mode) ----
function XIList({ lineup, t, ix }) {
  const selK = ix.sel ? cellKey(ix.sel) : null;
  const rows = [];
  LANES.forEach(pos => (lineup.slots[pos]||[]).forEach((id,idx)=>{
    const cell = { kind:'slot', pos, idx, id };
    const k = cellKey(cell);
    const active = !!selK || !!(ix.drag&&ix.drag.from);
    const state = k===selK ? 'selected' : active ? (ix.eligibleKeys.has(k)?'eligible':'dim') : 'idle';
    const status = id==null ? 'empty' : statusOf(id, t);
    const locked = id!=null && status!=='movable';
    rows.push(
      <button key={pos+idx} className={'sl-xi-row s-'+status+' st-'+state} onClick={locked ? ()=>ix.openScore(id) : ()=>ix.onCellTap(cell)}>
        <Pos p={pos}/>
        {id==null ? <span className="sl-xi-empty">Empty — tap to fill</span>
          : <><Flag nat={player(id).nat}/><b className="sl-bench-name">{shortName(player(id))}</b><LockTag status={status} mini/>{status!=='movable' && <ScorePill id={id} t={t} onOpen={ix.openScore}/>}</>}
      </button>
    );
  }));
  return (
    <div className="sl-xilist">
      <div className="sl-rail-head"><span className="t-label">Starting XI</span></div>
      <div className="sl-xi-rows">{rows}</div>
    </div>
  );
}

// ============================================================ formation picker ===
function FormationPicker({ lineup, mode, t, onPick }) {
  const conf = modeConf(mode);
  return (
    <div className="sl-forms">
      <span className="t-label">Formation</span>
      <div className="sl-forms-seg">
        {Object.keys(conf.forms).map(f=>{
          const legal = formationLegal(lineup, mode, f, t);
          const active = lineup.formation===f;
          return (
            <button key={f} className={'sl-form-btn mono'+(active?' is-active':'')+(legal?'':' is-locked')}
              disabled={!legal && !active} onClick={()=>legal&&onPick(f)}
              title={legal?('Switch to '+f):'Can’t switch — would move a locked player'}>
              {f}{!legal && !active && <span className="sl-form-lk"><IcoLock/></span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================ legend ===
function PitchLegend(){
  return (
    <div className="sl-legend">
      <span className="sl-lg"><span className="sl-lg-dot d-move"></span><b>Movable</b> — match not kicked off, swap freely</span>
      <span className="sl-lg"><span className="sl-lg-dot d-live"></span><b>Locked · playing</b> — on the pitch now</span>
      <span className="sl-lg"><span className="sl-lg-dot d-played"></span><b>Locked · played</b> — banked</span>
    </div>
  );
}

// ============================================================ lock hero (3 variants) ===
function fmtMins(m){ if(m<=0) return 'now'; const h=Math.floor(m/60), mm=m%60; return h>0?`${h}h ${mm}m`:`${mm}m`; }

function LockHero({ summary, variant, t, period, mode, lastSaved, conn }) {
  const s = summary;
  const next = s.nextKO ? MATCHES.find(m=>m.id===player(s.nextKO.id).matchId) : null;
  const nextMins = s.nextKO ? s.nextKO.ko - t : null;
  const urgent = nextMins!=null && nextMins<=10;
  const deadMins = SL_DEADLINE - t;
  const allLocked = s.movable===0 && s.benchMovable===0;

  const StatGroup = (
    <div className="sl-statline">
      <div className="sl-stat"><span className="sl-stat-num">{s.movable}</span><span className="sl-stat-lab"><IcoOpen/>movable now</span></div>
      <div className="sl-stat"><span className="sl-stat-num is-live">{s.live}</span><span className="sl-stat-lab"><IcoLive/>playing</span></div>
      <div className="sl-stat"><span className="sl-stat-num is-steel">{s.played}</span><span className="sl-stat-lab"><IcoLock/>played</span></div>
    </div>
  );

  const completeChip = s.complete
    ? <span className="sl-chip sl-chip-ok"><IcoCheck/>Lineup set</span>
    : <span className="sl-chip sl-chip-warn"><IcoAlert/>{s.empties} spot{s.empties!==1?'s':''} to fill</span>;

  const saveChip = <span className="sl-save"><IcoCheck/>Autosaved · {lastSaved}</span>;

  if (variant==='deadline') {
    return (
      <div className="sl-hero sl-hero-deadline">
        <div className="sl-hero-dl">
          <span className="t-label">{allLocked?'Lineup locked':'Next lock'}</span>
          {allLocked
            ? <div className="sl-dl-big">All matches under way</div>
            : <div className={'sl-dl-big mono'+(urgent?' is-urgent':'')}>{nextMins!=null?fmtMins(nextMins):'—'}</div>}
          {next && !allLocked && <div className="sl-dl-sub"><Flag nat={next.home}/>{next.home}–{next.away}<span className="text-tertiary"> kicks off · those players freeze</span></div>}
          {allLocked && <div className="sl-dl-sub text-tertiary">No more moves this matchday</div>}
        </div>
        <div className="sl-hero-right">{StatGroup}<div className="sl-hero-foot">{completeChip}{saveChip}</div></div>
      </div>
    );
  }
  if (variant==='pitch') {
    return (
      <div className="sl-hero sl-hero-strip">
        <span className="sl-strip-form mono">{lineup_label(mode, period)}</span>
        <span className="sl-strip-sep"></span>
        <span className="sl-strip-stat"><b>{s.movable}</b> movable</span>
        <span className="sl-strip-stat is-live"><b>{s.live}</b> playing</span>
        <span className="sl-strip-stat is-steel"><b>{s.played}</b> played</span>
        <span className="sl-strip-sep"></span>
        {allLocked ? <span className="sl-strip-dl">All locked</span>
          : <span className={'sl-strip-dl'+(urgent?' is-urgent':'')}>Next lock in <b className="mono">{nextMins!=null?fmtMins(nextMins):'—'}</b></span>}
        <span style={{flex:1}}></span>
        {completeChip}{saveChip}
      </div>
    );
  }
  // 'summary' (default)
  return (
    <div className="sl-hero sl-hero-summary">
      <div className="sl-hero-l">
        <div className="sl-hero-title"><span className="t-label">{period.title} · lock status</span></div>
        {StatGroup}
        <p className="sl-hero-note t-caption text-secondary">
          {allLocked
            ? <>Every match is under way — your lineup is <b>frozen</b> for this matchday.</>
            : <>Your movable players stay swappable until each one’s match kicks off — even a benched 0-minute starter. No auto-subs.</>}
        </p>
      </div>
      <div className="sl-hero-r">
        <div className="sl-hero-dlbox">
          <span className="t-label">{allLocked?'Fully locked':'Next lock'}</span>
          {allLocked
            ? <div className="sl-dl-mid">—</div>
            : <div className={'sl-dl-mid mono'+(urgent?' is-urgent':'')}>{nextMins!=null?fmtMins(nextMins):'—'}</div>}
          {next && !allLocked && <div className="sl-dl-sub2"><Flag nat={next.home}/> {next.home}–{next.away}</div>}
        </div>
        <div className="sl-hero-foot">{completeChip}{saveChip}</div>
      </div>
    </div>
  );
}
function lineup_label(mode, period){ return period.kind==='playoff' ? 'Playoff' : 'Group'; }

const IcoCheck = () => <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M20 6 9 17l-5-5"/></svg>;
const IcoAlert = () => <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 8v5M12 16.5v.5"/><circle cx="12" cy="12" r="9"/></svg>;

// ---- selection helper line (what tapping does / why nothing eligible) ----
function SelectionHint({ ix, t }) {
  const sel = ix.sel;
  const mode = ix.swapMode || 'tap';
  if (!sel) {
    const verb = mode==='drag' ? <span>Drag a <b>movable</b> player onto a highlighted slot to swap. Frozen players can’t be moved.</span>
      : mode==='sheet' ? <span>Tap a <b>movable</b> player to pick a swap. Frozen players can’t be moved.</span>
      : <span>Tap a <b>movable</b> player to start a swap. Frozen players can’t be moved.</span>;
    return <div className="sl-hint"><IcoSwap/>{verb}</div>;
  }
  const elig = ix.eligibleKeys.size;
  const p = sel.id ? player(sel.id) : null;
  const who = sel.id ? shortName(p) : `${sel.pos} slot`;
  return (
    <div className={'sl-hint is-active'+(elig===0?' is-empty':'')}>
      <IcoSwap/>
      {elig>0
        ? <span>Swapping <b>{who}</b> — tap a highlighted {sel.id?player(sel.id).pos:sel.pos} to exchange. <button className="sl-hint-x" onClick={()=>ix.clear()}>Cancel</button></span>
        : <span>No legal swap for <b>{who}</b> — your only {sel.id?player(sel.id).pos:sel.pos} cover is frozen or already in. <button className="sl-hint-x" onClick={()=>ix.clear()}>Cancel</button></span>}
    </div>
  );
}

// ---- swap sheet (action-sheet swap mode) ----
function SwapSheet({ ix, t, onClose }) {
  const sel = ix.sel; if(!sel) return null;
  const targets = eligibleTargets(window.__lineup, sel, t); // lineup stashed by app
  const p = sel.id ? player(sel.id) : null;
  return (
    <div className="sl-sheet-scrim" onClick={onClose}>
      <div className="sl-sheet" onClick={e=>e.stopPropagation()}>
        <div className="sl-sheet-head">
          <div><div className="t-label">Swap</div><b>{sel.id?shortName(p):sel.pos+' slot'}</b></div>
          <button className="btn btn-quiet btn-sm" onClick={onClose}>✕</button>
        </div>
        {targets.length===0 && <div className="t-sm text-tertiary" style={{padding:'6px 2px'}}>No eligible players — everyone else of this position is frozen or already starting.</div>}
        <div className="sl-sheet-list">
          {targets.map(tg=>{
            const tp = tg.id ? player(tg.id) : null;
            return (
              <button key={cellKey(tg)} className="sl-sheet-row" onClick={()=>{ ix.commit(sel, tg); onClose(); }}>
                {tg.id ? <><Pos p={tp.pos}/><Flag nat={tp.nat}/><b className="sl-bench-name">{shortName(tp)}</b>
                  <span className="t-micro text-tertiary">{tg.kind==='bench'?'from bench':'starting'}</span></>
                  : <><Pos p={tg.pos}/><span className="sl-bench-name text-tertiary">Empty {tg.pos} slot</span></>}
                <IcoSwap/>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---- player points breakdown (opened by clicking a score) ----
function PlayerScoreSheet({ id, t, onClose }) {
  if (!id) return null;
  const p = player(id); if(!p) return null;
  const e = evalSquadPlayer(id, t);
  const minLabel = e.phase==='final' ? 'FT' : e.min+"'";
  return (
    <div className="sl-sheet-scrim" onClick={onClose}>
      <div className="sl-scoremodal" onClick={ev=>ev.stopPropagation()}>
        <div className="sl-sm-head">
          <Pos p={p.pos}/><Flag nat={p.nat}/>
          <b className="sl-sm-name">{shortName(p)}</b>
          <span className="sl-sm-total mono">{e.pts}<small>pts</small></span>
        </div>
        <div className="sl-sm-match">
          <LockTag status={e.status} mini/>
          <span><Flag nat={e.match.home}/> {e.match.home}–{e.match.away} · <span className="mono">{minLabel}</span></span>
        </div>
        {e.done.length===0
          ? <div className="sl-sm-empty">No points yet — match just under way.</div>
          : <ScoreBreakdown done={e.done} p={p}/>}
        <div className="sl-sm-note">Point values illustrative · final scoring per SCORING.md</div>
      </div>
    </div>
  );
}

Object.assign(window, {
  cellKey, shortName, LockTag, IcoOpen, IcoSwap, IcoCheck, IcoAlert,
  PitchToken, Pitch, Bench, BenchRow, ScorePill, XIList, FormationPicker, PitchLegend,
  LockHero, SelectionHint, SwapSheet, PlayerScoreSheet,
});
