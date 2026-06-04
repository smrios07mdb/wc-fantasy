// admin/components2.jsx — the working surfaces: playoff-field lock, stat correction, ops cards.
// Reuses globals: Avatar, Flag, Pos, mgr, ME_ID, cmPlayer, cmShort, CM_OWNER,
//   CM_STAT_CATS, cmStatLine, cmPointsFor, cmLockOf, CmLock, CM_PRESET label helpers,
//   cmSeedRows, cmBracketRounds, cutSchedule, PO_PRESET_LABEL, pollerHealth, cmRating,
//   CM_DRAFT_CFG, CM_ICONS, IcoShield, IcoKey, IcoCmCheck, IcoCmAlert.
const { useState:useStateC2, useMemo:useMemoC2, useRef:useRefC2, useEffect:useEffectC2 } = React;

// ----------------------------------------------------------------- small controls ---
function Stepper({ value, min=0, max=99, onChange, disabled }){
  const set = v => onChange(Math.max(min, Math.min(max, v)));
  return (
    <div className={'cm-step'+(disabled?' is-disabled':'')}>
      <button className="cm-step-btn" disabled={disabled||value<=min} onClick={()=>set(value-1)}>–</button>
      <span className="cm-step-val mono">{value}</span>
      <button className="cm-step-btn" disabled={disabled||value>=max} onClick={()=>set(value+1)}>+</button>
    </div>
  );
}
function Toggle({ on, onChange, disabled }){
  return <button className={'cm-toggle'+(on?' is-on':'')+(disabled?' is-disabled':'')} disabled={disabled}
    role="switch" aria-checked={on} onClick={()=>onChange(!on)}><i></i></button>;
}

// ============================================================ module shell ===
function CmCard({ icon, title, sub, badge, danger, children, className }){
  return (
    <section className={'cm-card'+(danger?' is-danger':'')+(className?' '+className:'')}>
      <header className="cm-card-head">
        <span className={'cm-card-ic'+(danger?' is-danger':'')}>{CM_ICONS[icon]}</span>
        <div className="cm-card-titles">
          <h3 className="cm-card-title">{title}</h3>
          {sub && <span className="cm-card-sub t-micro text-tertiary">{sub}</span>}
        </div>
        {badge && <span className="cm-card-badge">{badge}</span>}
      </header>
      <div className="cm-card-body">{children}</div>
    </section>
  );
}

// ============================================================ playoff field lock (OPEN GAP) ===
function PlayoffConfig({ field, preset, locked, onField, onPreset, onLock, onUnlock, compact }){
  const rounds = useMemoC2(()=> cmBracketRounds(field, preset), [field, preset]);
  const seeds = useMemoC2(()=> cmSeedRows(field).filter(r=>r.qualified), [field]);
  const firstOut = useMemoC2(()=> cmSeedRows(field).find(r=>!r.qualified), [field]);
  return (
    <CmCard icon="field" title="Playoff field & cut schedule" sub="Fixed at the group→playoff transition"
      badge={locked ? <span className="cm-lockflag is-locked"><IcoShield s={11}/>Locked</span>
                    : <span className="cm-lockflag is-prov">Provisional</span>}>
      <div className="cm-openrow alert alert-warn">
        <IcoCmAlert/><span><b>Open decision.</b> Exact field size (8 vs 10) and per-round cut counts are unset league-wide — locking here fixes them for the playoffs. Until then every playoff view reads provisional.</span>
      </div>

      <div className="cm-field-controls">
        <div className="cm-fc">
          <span className="field-label">Field size · top N qualify</span>
          <div className="cm-seg">
            {[8,10].map(n=>(
              <button key={n} className={'cm-seg-btn'+(field===n?' is-active':'')} disabled={locked} onClick={()=>onField(n)}>{n}</button>
            ))}
          </div>
        </div>
        <div className="cm-fc">
          <span className="field-label">Cut-count schedule</span>
          <div className="cm-seg cm-seg-3">
            {[['default','Taper 2→1'],['steep','Steep 2,2'],['gentle','Gentle 1,1']].map(([k,l])=>(
              <button key={k} className={'cm-seg-btn'+(preset===k?' is-active':'')} disabled={locked} onClick={()=>onPreset(k)}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="cm-bracket">
        <span className="t-label">Resulting rounds · {field} → champion</span>
        <div className="cm-bracket-rounds">
          {rounds.map(r=>(
            <div className={'cm-br'+(r.champion?' is-final':'')} key={r.round}>
              <span className="cm-br-rnum">R{r.round}</span>
              <span className="cm-br-cut mono">{r.before}<span className="cm-br-arrow">→</span>{r.after}</span>
              <span className="cm-br-cutn">{r.champion ? '🏆 champion' : `cut ${r.cut}`}</span>
            </div>
          ))}
        </div>
        <div className="cm-bracket-note t-micro text-tertiary">Cut counts are provisional presets, not yet ratified — surfaced here so the gap is explicit.</div>
      </div>

      {!compact && (
        <div className="cm-seeds">
          <span className="t-label">Qualifiers at the cut line <span className="text-tertiary" style={{fontWeight:600, textTransform:'none', letterSpacing:0}}>· group-stage power record</span></span>
          <div className="cm-seeds-list">
            {seeds.slice(-3).map(r=>(
              <div className={'cm-seedrow'+(r.m.id===ME_ID?' is-me':'')} key={r.m.id}>
                <span className="cm-seed-n mono">#{r.rank}</span><Avatar m={r.m} size="sm"/>
                <span className="cm-seed-name">{r.m.id===ME_ID?'You':r.m.name}</span>
                <span className="cm-seed-rec mono">{r.W}–{r.L}</span><span className="cm-seed-pts mono">{r.total}</span>
              </div>
            ))}
            <div className="cm-cutline"><span className="cm-cutline-lab">cut line · {field} qualify</span></div>
            {firstOut && (
              <div className="cm-seedrow is-out">
                <span className="cm-seed-n mono">#{firstOut.rank}</span><Avatar m={firstOut.m} size="sm"/>
                <span className="cm-seed-name">{firstOut.m.id===ME_ID?'You':firstOut.m.name}</span>
                <span className="cm-seed-rec mono">{firstOut.W}–{firstOut.L}</span><span className="cm-seed-pts mono">{firstOut.total}</span>
                <span className="cm-firstout">first out</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="cm-card-foot">
        {locked
          ? <><span className="cm-foot-status"><IcoCmCheck/> Field locked at <b>{field}</b> · {cutSchedule(field,preset).length} rounds</span>
              <button className="btn btn-ghost btn-sm" onClick={onUnlock}>Reopen</button></>
          : <><span className="cm-foot-status text-tertiary">Locking notifies all {cmSeedRows(field).length} managers and freezes the field.</span>
              <button className="btn btn-primary btn-sm" onClick={onLock}><IcoShield s={13}/>Lock the playoff field</button></>}
      </div>
    </CmCard>
  );
}

// ============================================================ manual stat correction ===
function PlayerPicker({ pid, onPick }){
  const [q, setQ] = useStateC2('');
  const [open, setOpen] = useStateC2(false);
  const ref = useRefC2(null);
  useEffectC2(()=>{ if(!open) return; const h=e=>{ if(ref.current && !ref.current.contains(e.target)) setOpen(false); };
    window.addEventListener('mousedown', h); return ()=>window.removeEventListener('mousedown', h); }, [open]);
  const res = useMemoC2(()=>{
    const s = q.trim().toLowerCase();
    return (s ? CM_PLAYERS.filter(p => (p.first+' '+p.last).toLowerCase().includes(s)) : CM_PLAYERS).slice(0, 30);
  }, [q]);
  const cur = pid ? cmPlayer(pid) : null;
  return (
    <div className="cm-picker" ref={ref}>
      <button className="cm-picker-btn" onClick={()=>setOpen(o=>!o)}>
        {cur ? <><Flag nat={cur.nat}/><Pos p={cur.pos}/><b>{cmShort(cur)}</b><span className="cm-picker-owner text-tertiary">{ownerName(cur.id)}</span></>
             : <span className="text-tertiary">Search any player in today’s matches…</span>}
        <span className="cm-picker-chev"><IcoChev/></span>
      </button>
      {open && (
        <div className="cm-picker-menu">
          <input className="input cm-picker-search" autoFocus placeholder="Type a name…" value={q} onChange={e=>setQ(e.target.value)}/>
          <div className="cm-picker-list">
            {res.map(p=>(
              <button key={p.id} className={'cm-picker-row'+(pid===p.id?' is-active':'')} onClick={()=>{ onPick(p.id); setOpen(false); setQ(''); }}>
                <Flag nat={p.nat}/><Pos p={p.pos}/><b>{cmShort(p)}</b>
                <span className="cm-picker-owner text-tertiary">{ownerName(p.id)}</span>
              </button>
            ))}
            {res.length===0 && <div className="t-sm text-tertiary" style={{padding:'8px 10px'}}>No player found.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
const ownerName = pid => { const o = CM_OWNER[pid]; if(!o) return 'free agent'; return o===ME_ID?'your squad':mgr(o).name; };

function StatCorrection({ pid, line, official, reason, onPick, onEdit, onReason, onReset, onApply, t, dirty }){
  const p = pid ? cmPlayer(p_id(pid)) : null;
  const status = pid ? cmLockOf(pid, t) : 'movable';
  const cats = CM_STAT_CATS.filter(c => !c.gkOnly || (p && p.pos==='GK'));
  const ptsOff = p ? cmPointsFor(official, p.pos) : 0;
  const ptsNew = p ? cmPointsFor(line, p.pos) : 0;
  const delta = ptsNew - ptsOff;
  const groups = ['General','Attacking','Defending','Goalkeeping','Discipline'];
  return (
    <CmCard icon="stat" title="Manual stat correction" sub="Override the official feed · recomputes points">
      <PlayerPicker pid={pid} onPick={onPick}/>
      {!p ? (
        <div className="cm-empty">Pick a player to correct his match stat line.</div>
      ) : (
        <>
          <div className="cm-corr-ctx">
            <span className="cm-corr-who"><Flag nat={p.nat}/><b>{cmShort(p)}</b><span className="text-tertiary">· {(NATIONS[p.nat]||{}).n}</span></span>
            <CmLock status={status} mini/>
            <span className="cm-corr-owner text-tertiary">{ownerName(pid)}</span>
          </div>
          {status==='movable' && (
            <div className="cm-corr-warn alert alert-warn"><IcoCmAlert/><span>His match hasn’t kicked off — there’s no official line yet. A pre-match correction is unusual; it’ll be logged.</span></div>
          )}
          {status==='live' && (
            <div className="cm-corr-warn alert alert-info"><IcoCmAlert/><span>Match is <b>live</b> — the feed is still updating. Corrections to a live line are provisional and may be overwritten by the next poll.</span></div>
          )}

          <div className="cm-corr-grid">
            {groups.map(g=>{
              const rows = cats.filter(c=>c.group===g);
              if (!rows.length) return null;
              return (
                <div className="cm-corr-group" key={g}>
                  <span className="cm-corr-gname t-label">{g}</span>
                  {rows.map(c=>{
                    const changed = line[c.key] !== official[c.key];
                    return (
                      <div className={'cm-corr-row'+(changed?' is-changed':'')} key={c.key}>
                        <span className="cm-corr-label">{c.label}{!c.scores && <span className="cm-corr-nopts" title="Not in the illustrative scoring model yet">stat only</span>}</span>
                        <span className="cm-corr-old mono">{fmtVal(official[c.key])}</span>
                        <span className="cm-corr-arrow">→</span>
                        {c.type==='bool'
                          ? <Toggle on={!!line[c.key]} onChange={v=>onEdit(c.key, v)}/>
                          : <Stepper value={line[c.key]||0} max={c.max} onChange={v=>onEdit(c.key, v)}/>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <div className="cm-corr-pts">
            <div className="cm-cp"><span className="t-micro text-tertiary">Official</span><b className="mono">{ptsOff}</b></div>
            <span className="cm-cp-arrow">→</span>
            <div className="cm-cp"><span className="t-micro text-tertiary">Corrected</span><b className="mono">{ptsNew}</b></div>
            <div className={'cm-cp-delta'+(delta>0?' is-up':delta<0?' is-down':'')}>{delta>0?'+':''}{delta} pts</div>
            <span className="cm-cp-note t-micro text-tertiary">illustrative · SCORING.md TBD</span>
          </div>

          <div className="cm-corr-reason">
            <input className="input" placeholder="Reason (required) — e.g. goal awarded after VAR review" value={reason} onChange={e=>onReason(e.target.value)}/>
          </div>
          <div className="cm-card-foot">
            <button className="btn btn-ghost btn-sm" disabled={!dirty} onClick={onReset}>Reset to feed</button>
            <button className="btn btn-primary btn-sm" disabled={!dirty || !reason.trim()} onClick={onApply}>Apply correction</button>
          </div>
        </>
      )}
    </CmCard>
  );
}
const p_id = pid => pid;                        // identity (kept for clarity at call sites)
const fmtVal = v => v===true ? 'Yes' : v===false ? 'No' : v;

// ============================================================ ops: poller / fallback ===
function PollerCard({ conn, fallbackLock, onFallback }){
  const h = pollerHealth(conn);
  const silent = h.state==='silent';
  const degraded = h.state==='degraded';
  return (
    <CmCard icon="poller" title="Stats poller & lock fallback" sub="Lock-on-play depends on a live feed"
      badge={<span className={'cm-poll-badge cm-poll-'+h.state}><span className="cm-poll-dot"></span>{h.label}</span>} danger={silent}>
      {(silent||degraded) && (
        <div className={'alert '+(silent?'alert-danger':'alert-warn')+' cm-poll-alert'}>
          <IcoCmAlert/><span>{silent
            ? <>Poller has returned <b>no data for {h.silentFor}s</b>. Live lock-on-play can’t be trusted — enable the manual fallback to freeze players by scheduled kickoff instead.</>
            : <>Feed is <b>reconnecting</b>. Locks may lag by a few seconds.</>}</span>
        </div>
      )}
      <div className="cm-op-toggle">
        <div className="cm-op-toggle-txt">
          <b>Manual lock fallback</b>
          <span className="t-micro text-tertiary">Freeze each player at his scheduled KO time instead of first-touch. Use only when the feed is down.</span>
        </div>
        <Toggle on={fallbackLock} onChange={onFallback}/>
      </div>
      {fallbackLock && <div className="cm-op-on t-micro"><IcoCmCheck/> Fallback active — locks now driven by the fixture clock, not live minutes.</div>}
    </CmCard>
  );
}

// ============================================================ ops: period freeze ===
function FreezeCard({ frozen, onFreeze, onUnfreeze }){
  return (
    <CmCard icon="freeze" title="Period-freeze override" sub={'Current period · '+PERIOD.label} danger={frozen}
      badge={frozen ? <span className="cm-lockflag is-frozen"><IcoLkSm/>Frozen</span> : <span className="cm-lockflag is-prov">Open</span>}>
      <p className="t-sm text-secondary" style={{margin:'0 0 4px', lineHeight:1.5}}>
        {frozen
          ? <>All lineups for {PERIOD.label} are <b>force-frozen</b> — no swaps, claims or drops until you reopen. Used for postponed or abandoned fixtures.</>
          : <>Force-freeze every manager’s lineup for this period immediately, ahead of the normal lock-on-play. Reversible, but it overrides managers mid-decision.</>}
      </p>
      <div className="cm-card-foot">
        {frozen
          ? <button className="btn btn-ghost btn-sm" onClick={onUnfreeze}>Reopen period</button>
          : <button className="btn btn-danger btn-sm" onClick={onFreeze}><IcoLkSm/>Force-freeze {PERIOD.label}</button>}
      </div>
    </CmCard>
  );
}

// ============================================================ ops: rating override ===
function RatingCard({ pid, value, onPick, onChange, onApply, base }){
  const p = pid ? cmPlayer(pid) : null;
  const changed = p && value!==base;
  return (
    <CmCard icon="rating" title="Rating override" sub="Projection used by autopick & best-available">
      <PlayerPicker pid={pid} onPick={onPick}/>
      {p && (
        <>
          <div className="cm-rate">
            <div className="cm-rate-fig"><span className="t-micro text-tertiary">Current</span><b className="mono">{base}</b></div>
            <input className="cm-rate-slider" type="range" min="40" max="99" value={value} onChange={e=>onChange(+e.target.value)}/>
            <div className="cm-rate-fig"><span className="t-micro text-tertiary">Override</span><b className={'mono'+(changed?' cm-i-up':'')}>{value}</b></div>
          </div>
          <div className="cm-card-foot">
            <span className="t-micro text-tertiary">Affects draft autopick & waiver suggestions only — never live scoring.</span>
            <button className="btn btn-primary btn-sm" disabled={!changed} onClick={onApply}>Apply override</button>
          </div>
        </>
      )}
    </CmCard>
  );
}

// ============================================================ ops: draft config ===
function DraftConfigCard(){
  const d = CM_DRAFT_CFG;
  const rows = [
    ['Format', `${d.type} · ${d.rounds} rounds · ${d.totalPicks} picks`],
    ['Pick clock', `${d.perPickSec}s · server-synced · autopick ${d.autopick?'on':'off'}`],
    ['Draft order', d.orderLocked ? 'Locked' : 'Open'],
    ['FAAB start', `$${d.faabStart} · resets at playoffs`],
    ['Scheduled', d.date],
  ];
  return (
    <CmCard icon="draft" title="Draft configuration" sub="Locked after the draft completes"
      badge={<span className="cm-lockflag is-locked"><IcoShield s={11}/>Drafted</span>}>
      <div className="cm-cfg">
        {rows.map(([l,v])=>(<div className="cm-cfg-row" key={l}><span className="text-tertiary">{l}</span><b>{v}</b></div>))}
      </div>
      <div className="cm-card-foot">
        <span className="t-micro text-tertiary">The draft is complete — config is read-only. Reopening requires a league reset.</span>
        <button className="btn btn-ghost btn-sm is-disabled" disabled>Reopen draft</button>
      </div>
    </CmCard>
  );
}

Object.assign(window, {
  Stepper, Toggle, CmCard, PlayoffConfig, PlayerPicker, ownerName, StatCorrection,
  PollerCard, FreezeCard, RatingCard, DraftConfigCard, fmtVal,
});
