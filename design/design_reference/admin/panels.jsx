// admin/panels.jsx — the four commissioner task panels.
// Reuses: AdmCard, AdmKit, Pos, Avatar, CommishBadge, SegRow, Stepper, PollerStatus, IllusTag,
//   STAT_CATS, STAT_GROUPS, catPts, linePts, catApplies, statLine, admShort,
//   correctablePlayers, playerMatchCtx, fieldPlan, poSeeds, PO_PRESET_LABEL, matchScore, mgr.
const { useState:useSp, useEffect:useEp, useMemo:useMp } = React;

// ============================================================ 1 · PLAYOFF FIELD ===
// The OPEN GAP: field size (8 vs 10) + per-round cut schedule. Provisional until LOCKED at the
// group→playoff transition. Locking is irreversible → type-to-confirm.
function FieldConfigPanel({ field, preset, fieldLocked, setField, setPreset, onLock }){
  const plan = useMp(()=> fieldPlan(parseInt(field,10), preset), [field, preset]);
  const seeds = plan.seeds;
  return (
    <div className="adm-panel">
      <AdmCard title="Playoff field" sub="Set at the group → playoff transition"
        danger={false}
        right={fieldLocked
          ? <span className="adm-lockpill"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>Locked</span>
          : <span className="adm-provpill">Provisional</span>}>
        <div className="adm-openinfo">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>
          <span>Field size and per-round cuts are an <b>open decision</b> — exact counts aren’t in the spec yet. These presets are commissioner-set and stay provisional until you lock the field.</span>
        </div>

        <SegRow label="Field size" hint="How many group-stage seeds enter the guillotine"
          value={field} options={['8','10']} onChange={fieldLocked?()=>{}:setField}/>
        <SegRow label="Cut schedule" hint="Players guillotined each round — taper to one by the final four"
          value={preset}
          options={[{value:'default',label:'Taper 2→1'},{value:'steep',label:'Steep'},{value:'gentle',label:'Gentle'}]}
          onChange={fieldLocked?()=>{}:setPreset}/>
        {fieldLocked && <div className="adm-lockednote">Field is locked — config is read-only. Reverse the lock entry in the audit log to re-open.</div>}
      </AdmCard>

      <AdmCard title="Bracket shape" sub={`${plan.totalRounds} rounds → 1 champion`}>
        <div className="adm-rounds">
          {plan.rounds.map((r,i)=>(
            <div className="adm-round" key={i}>
              <div className="adm-round-n">R{i+1}</div>
              <div className="adm-round-bar">
                <span className="adm-round-enter">{r.enters}</span>
                <span className="adm-round-cut">−{r.cut} cut</span>
                <span className="adm-round-arrow">→</span>
                <span className="adm-round-surv">{r.survives}{i===plan.rounds.length-1?' champion':' survive'}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="adm-prov-foot">Cut counts provisional · commissioner-set</div>
      </AdmCard>

      <AdmCard title={`Qualified seeds · top ${field}`} sub="From the group-stage power record at full time">
        <div className="adm-seeds">
          {seeds.map(s=>{
            const m = mgr(s.id);
            return (
              <div className={'adm-seed'+(m.isMe?' is-me':'')} key={s.id}>
                <span className="adm-seed-n num">{s.seed}</span>
                <Avatar m={m} size="sm"/>
                <span className="adm-seed-name">{m.name}</span>
                <span className="adm-seed-rec mono">{s.gW}–{s.gL}</span>
                <span className="adm-seed-pts num">{s.gPts}<i>pts</i></span>
              </div>
            );
          })}
        </div>
      </AdmCard>

      {!fieldLocked &&
        <div className="adm-lockbar">
          <div className="adm-lockbar-txt">
            <b>Lock the playoff field</b>
            <span>Freezes field size + cut schedule for the whole playoffs. This can’t be undone once the bracket is seeded.</span>
          </div>
          <button className="btn btn-danger" onClick={onLock}>Lock field…</button>
        </div>}
    </div>
  );
}

// ============================================================ 2 · STAT CORRECTIONS ===
function StatCorrectionPanel({ t, sel, setSel, edits, onApply, search, setSearch }){
  const players = useMp(()=> correctablePlayers(), []);
  const filtered = players.filter(p => !search ||
    (p.first+' '+p.last).toLowerCase().includes(search.toLowerCase()) ||
    p.nat.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="adm-correct">
      <div className="adm-correct-list">
        <div className="adm-correct-search">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
          <input className="adm-search-input" placeholder="Find a player to correct…" value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <div className="adm-correct-scroll">
          {filtered.map(p=>{
            const edited = !!edits[p.id];
            const rec = edits[p.id]?.line || statLine(p.id);
            const pts = linePts(rec, p.pos);
            return (
              <button key={p.id} className={'adm-pl'+(sel===p.id?' is-sel':'')+(edited?' is-edited':'')} onClick={()=>setSel(p.id)}>
                <AdmKit nat={p.nat} sm/>
                <div className="adm-pl-id">
                  <span className="adm-pl-name">{admShort(p)}</span>
                  <span className="adm-pl-meta"><Pos p={p.pos}/><span className="adm-pl-nat">{(NATIONS[p.nat]||{}).n||p.nat}</span></span>
                </div>
                {edited && <span className="adm-pl-edited">edited</span>}
                <span className="adm-pl-pts num">{pts}<i>pts</i></span>
              </button>
            );
          })}
          {filtered.length===0 && <div className="adm-empty">No players match “{search}”.</div>}
        </div>
      </div>
      <div className="adm-correct-form">
        {sel ? <CorrectionForm key={sel} id={sel} t={t} committed={edits[sel]} onApply={onApply}/>
             : <div className="adm-correct-placeholder">
                 <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M13.5 6.5l3 3"/></svg>
                 <b>Select a player</b>
                 <span>Adjust a recorded stat line and apply a logged correction.</span>
               </div>}
      </div>
    </div>
  );
}

function CorrectionForm({ id, t, committed, onApply }){
  const p = SQUAD_BY[id];
  const recorded = useMp(()=> statLine(id), [id]);             // as polled
  const base = committed?.line || recorded;
  const [line, setLine] = useSp({ ...base });
  const [reason, setReason] = useSp(committed?.reason || '');
  useEp(()=>{ setLine({ ...(committed?.line || statLine(id)) }); setReason(committed?.reason || ''); }, [id]);

  const ctx = playerMatchCtx(id, t);
  const sc = matchScore(ctx.m, t);
  const recPts = linePts(recorded, p.pos);
  const newPts = linePts(line, p.pos);
  const delta = newPts - recPts;
  const dirty = STAT_CATS.some(c => (line[c.key]||0) !== (recorded[c.key]||0));
  const set = (k,v)=> setLine(l=>({ ...l, [k]:v }));
  const groups = STAT_GROUPS.filter(g => STAT_CATS.some(c => c.group===g && catApplies(c, p.pos)));

  return (
    <div className="adm-cf">
      <div className="adm-cf-head">
        <AdmKit nat={p.nat}/>
        <div className="adm-cf-id">
          <div className="adm-cf-name">{p.first} {p.last} <Pos p={p.pos}/></div>
          <div className="adm-cf-fix">
            <span className="mono">{ctx.m.home} {sc.st.phase==='ytp'?'–':`${sc.h}–${sc.a}`} {ctx.m.away}</span>
            <span className={'adm-cf-phase s-'+sc.st.phase}>{sc.st.phase==='live'?`${sc.st.min}'`:sc.st.phase==='final'?'FT':'KO soon'}</span>
          </div>
        </div>
        <IllusTag/>
      </div>

      {ctx.st.phase!=='ytp' &&
        <div className="adm-cf-warn">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 3l9 16H3l9-16z"/><path d="M12 10v4M12 17h.01"/></svg>
          {ctx.st.phase==='live' ? 'Match is live — this player is locked-on-play. Corrections re-score immediately.'
                                 : 'Match is final — correcting re-scores the banked total for every manager.'}
        </div>}

      <div className="adm-cf-groups">
        {groups.map(g=>(
          <div className="adm-cf-group" key={g}>
            <div className="adm-cf-glabel">{g}</div>
            {STAT_CATS.filter(c=>c.group===g && catApplies(c,p.pos)).map(c=>{
              const v = line[c.key]||0, was = recorded[c.key]||0, changed = v!==was;
              const ptsNow = catPts(c.key, v, p.pos);
              return (
                <div className={'adm-cf-row'+(changed?' is-changed':'')} key={c.key}>
                  <div className="adm-cf-rowl">
                    <span className="adm-cf-rowlabel">{c.label}</span>
                    {c.hint && <span className="adm-cf-rowhint">{c.hint}</span>}
                  </div>
                  {changed && <span className="adm-cf-was">was {was}</span>}
                  <span className={'adm-cf-rowpts num'+(ptsNow<0?' is-neg':ptsNow>0?' is-pos':'')}>{ptsNow>0?'+':''}{ptsNow}</span>
                  {c.kind==='toggle'
                    ? <button className={'adm-cf-toggle'+(v?' is-on':'')} onClick={()=>set(c.key, v?0:1)}><i/></button>
                    : c.kind==='minutes'
                      ? <Stepper value={v} min={0} max={c.max} onChange={x=>set(c.key,x)}/>
                      : <Stepper value={v} min={0} max={c.max} danger={['yellow','red','og','penMiss'].includes(c.key)} onChange={x=>set(c.key,x)}/>}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="adm-cf-summary">
        <div className="adm-cf-sumcol"><span className="t-label">Recorded</span><b className="num">{recPts}</b></div>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        <div className="adm-cf-sumcol"><span className="t-label">Corrected</span><b className="num">{newPts}</b></div>
        <div className={'adm-cf-delta'+(delta>0?' is-pos':delta<0?' is-neg':'')}>{delta>0?'+':''}{delta} pts</div>
      </div>

      <label className="field-label" style={{marginTop:4}}>Reason <span className="text-tertiary">(logged with the change)</span></label>
      <input className="input" placeholder="e.g. VAR-awarded goal not in feed" value={reason} onChange={e=>setReason(e.target.value)}/>

      <div className="adm-cf-actions">
        {committed && <span className="adm-cf-prev">Previously corrected · {committed.delta>0?'+':''}{committed.delta} pts</span>}
        <button className="btn btn-primary" disabled={!dirty || !reason.trim()}
          onClick={()=>onApply({ id, line:{...line}, recPts, newPts, delta, reason:reason.trim(), pos:p.pos, name:admShort(p) })}>
          Apply correction…
        </button>
      </div>
    </div>
  );
}

// ============================================================ 3 · GAME OPERATIONS ===
function OpsPanel({ ops, setOps, pollerSilent, agoSec, onToggleFreeze }){
  const periods = [
    { id:'md1', label:'Matchday 1', sub:'Group · period 1', state:'settled' },
    { id:'md2', label:'Matchday 2', sub:'Group · period 2', state:'settled' },
    { id:'md3', label:'Matchday 3', sub:'Group · period 3 · live', state:'live' },
  ];
  return (
    <div className="adm-panel">
      {pollerSilent && ops.pollerMode!=='manual' &&
        <div className="adm-alert is-danger">
          <span className="adm-alert-ico"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M3 12h4l2-6 4 12 2-6h6"/></svg></span>
          <div className="adm-alert-body">
            <b>Live feed has gone silent</b>
            <span>No heartbeat from {POLLER.source} for over {Math.floor(POLLER.silentThresholdSec/60)} minutes during a live match. Lock-on-play can’t be derived from the feed.</span>
          </div>
          <div className="adm-alert-acts">
            <button className="btn btn-sm btn-ghost" onClick={()=>setOps(o=>({...o, lockFallback:'scheduled'}))}>Use scheduled locks</button>
            <button className="btn btn-sm btn-primary" onClick={()=>setOps(o=>({...o, pollerMode:'manual'}))}>Switch to manual</button>
          </div>
        </div>}

      <AdmCard title="Live data feed" sub="Poller health"
        right={<PollerStatus silent={pollerSilent} agoSec={agoSec} mode={ops.pollerMode}/>}>
        <SegRow label="Scoring source" hint="Manual entry bypasses the feed — you enter stats by hand"
          value={ops.pollerMode} options={[{value:'live',label:'Live feed'},{value:'manual',label:'Manual entry'}]}
          onChange={v=>setOps(o=>({...o, pollerMode:v}))}/>
      </AdmCard>

      <AdmCard title="Lock-on-play fallback" sub="What freezes a player when the feed can’t confirm he’s playing">
        <SegRow label="Fallback mode"
          hint={ops.lockFallback==='auto' ? 'Auto: lock the instant the feed reports ≥1 minute played' : 'Scheduled: lock every player at his fixture’s kickoff time, feed-independent'}
          value={ops.lockFallback}
          options={[{value:'auto',label:'Auto (feed)'},{value:'scheduled',label:'Scheduled (KO time)'}]}
          onChange={v=>setOps(o=>({...o, lockFallback:v}))}
          tone={ops.lockFallback==='scheduled'?'warn':null}/>
        {ops.lockFallback==='scheduled' &&
          <div className="adm-ops-note tone-warn">Scheduled locks are active — a benched 0-minute starter still locks at kickoff, even if he never plays.</div>}
      </AdmCard>

      <AdmCard title="Period freeze" sub="Freeze locks all lineups + pauses scoring for a period">
        <div className="adm-freezes">
          {periods.map(pd=>{
            const frozen = !!ops.freeze[pd.id];
            return (
              <div className={'adm-freeze'+(frozen?' is-frozen':'')} key={pd.id}>
                <div className="adm-freeze-id">
                  <span className="adm-freeze-label">{pd.label}</span>
                  <span className="adm-freeze-sub">{pd.sub}</span>
                </div>
                {pd.state==='live' && <span className="adm-livedot-pill"><span className="adm-livedot"></span>live</span>}
                {frozen
                  ? <button className="adm-freeze-btn is-frozen" onClick={()=>onToggleFreeze(pd, false)}>
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 3v18"/><path d="M7 8l5 4 5-4"/></svg>Frozen — unfreeze
                    </button>
                  : <button className="adm-freeze-btn" onClick={()=>onToggleFreeze(pd, true)}>
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 2v20M4 7l16 10M20 7L4 17"/></svg>Freeze…
                    </button>}
              </div>
            );
          })}
        </div>
      </AdmCard>
    </div>
  );
}

// ============================================================ 4 · DRAFT SETUP ===
function DraftPanel({ draft, setDraft }){
  const upd = (k,v)=> setDraft(d=>({...d, [k]:v}));
  return (
    <div className="adm-panel">
      <AdmCard title="Draft setup" sub="Snake draft · 15 rounds · 2 GK / 5 DEF / 5 MID / 3 FWD">
        <div className="adm-form-grid">
          <div className="adm-field">
            <label className="field-label">Draft date</label>
            <input className="input" type="date" value={draft.date} onChange={e=>upd('date', e.target.value)}/>
          </div>
          <div className="adm-field">
            <label className="field-label">Start time <span className="text-tertiary">{draft.tz}</span></label>
            <input className="input" type="time" value={draft.time} onChange={e=>upd('time', e.target.value)}/>
          </div>
        </div>

        <SegRow label="Pick order" hint="Snake reverses each round; linear keeps the same order"
          value={draft.order} options={[{value:'snake',label:'Snake'},{value:'linear',label:'Linear'}]} onChange={v=>upd('order', v)}/>

        <div className="adm-seg-row">
          <div className="adm-seg-l"><div className="adm-seg-label">Pick clock</div><div className="adm-seg-hint">Autopick fires from the queue on expiry</div></div>
          <div className="adm-clock-pick">
            {[30,45,60,90,120].map(s=>(
              <button key={s} className={'adm-seg-btn'+(draft.clockSec===s?' is-active':'')} onClick={()=>upd('clockSec', s)}>{s}s</button>
            ))}
          </div>
        </div>

        <div className="adm-toggle-row">
          <div className="adm-seg-l"><div className="adm-seg-label">Autopick on expiry</div><div className="adm-seg-hint">Queue → roster need → best available</div></div>
          <button className={'adm-cf-toggle'+(draft.autopick?' is-on':'')} onClick={()=>upd('autopick', !draft.autopick)}><i/></button>
        </div>
      </AdmCard>

      <AdmCard title="Pick order" sub={draft.order==='snake'?'Snake — reverses each round':'Linear — same each round'}>
        <div className="adm-draftorder">
          {MANAGERS.map((m,i)=>(
            <div className={'adm-do'+(m.isMe?' is-me':'')} key={m.id}>
              <span className="adm-do-n num">{i+1}</span>
              <Avatar m={m} size="sm"/>
              <span className="adm-do-name">{m.name}</span>
            </div>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm" style={{marginTop:12}}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 3h5v5M21 3l-7 7M8 21H3v-5M3 21l7-7"/></svg>
          Randomize order ({draft.randomizeAt})
        </button>
      </AdmCard>
    </div>
  );
}

Object.assign(window, { FieldConfigPanel, StatCorrectionPanel, CorrectionForm, OpsPanel, DraftPanel });
