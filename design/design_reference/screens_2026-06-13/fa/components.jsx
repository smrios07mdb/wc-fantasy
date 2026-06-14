// fa/components.jsx — presentational pieces for the Free Agents browser.
// Reuses globals: Pos, Flag, Avatar, mgr, faMatch, faOpp, faClock, faCutoff, matchScore.
const { useState:useStateFa } = React;

const faShort = p => `${p.first[0]}. ${p.last}`;

const FaClk  = () => <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/></svg>;
const FaLock = () => <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.4"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>;
const FaSearch = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>;
const FaDrop = () => <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 5v9M8 11l4 4 4-4"/></svg>;

// flag-on-shirt kit chip (matches the KitChip pattern used across the app)
function FaKit({ nat, sm }){
  return <span className={'fa-kit'+(sm?' fa-kit-sm':'')}
    style={{ background: JERSEY_BG[nat] || (NATIONS[nat]||{}).f || 'var(--surface-4)' }}
    title={(NATIONS[nat]||{}).n}></span>;
}

// fixture cell — who he plays today + live clock/score
function FaFixture({ p, t, mini }){
  const m = faMatch(p); const sc = matchScore(m, t); const ph = sc.st.phase;
  return (
    <span className={'fa-fx'+(mini?' fa-fx-mini':'')}>
      <span className="fa-fx-vs">{p.side==='home'?'vs':'@'}</span>
      <Flag nat={faOpp(p)}/><b className="fa-fx-opp">{faOpp(p)}</b>
      {ph==='ytp'   && <span className="fa-fx-clk is-ytp mono">{faClock(p)}</span>}
      {ph==='live'  && <span className="fa-fx-clk is-live mono"><span className="rt-livedot"></span>{sc.st.min}'</span>}
      {ph==='final' && <span className="fa-fx-clk is-final mono">FT {sc.h}–{sc.a}</span>}
    </span>
  );
}

// acquisition-cutoff tag — STRONG: per-player countdown to his KO, hard locked state once passed.
function CutoffTag({ p, t, block }){
  const c = faCutoff(p, t);
  if (!c.open){
    return (
      <span className={'fa-cut fa-cut-closed'+(block?' is-block':'')}>
        <FaLock/><span>Cutoff passed</span>
        <span className="fa-cut-sub">{c.phase==='live'? `${c.matchMin}′ live` : 'match over'}</span>
      </span>
    );
  }
  return (
    <span className={'fa-cut '+(c.urgent?'fa-cut-soon':'fa-cut-open')+(block?' is-block':'')}>
      <FaClk/><span>KO {c.clock}</span>
      <span className="fa-cut-sub">{c.urgent? `closes in ${c.toKO}′` : `cutoff in ${c.toKO}′`}</span>
    </span>
  );
}

// season + projection stat pair
function FaStats({ p, stacked }){
  return (
    <span className={'fa-stats'+(stacked?' is-stacked':'')}>
      <span className="fa-stat"><b className="mono">{p.szn}</b><small>SZN</small></span>
      <span className="fa-stat fa-stat-proj"><b className="mono">{p.proj}</b><small>PROJ</small></span>
    </span>
  );
}

// acquire control — owned shows the owner; free agent shows a bid CTA (disabled past cutoff).
function Acquire({ p, t, onBid, sm }){
  if (p.owner!=null){
    const m = mgr(p.owner);
    return <span className="fa-owner" title={`Rostered by ${m.name}`}><Avatar m={m} size="sm"/><span className="fa-owner-lab">Rostered</span></span>;
  }
  const open = faCutoff(p, t).open;
  return (
    <button className={'btn btn-primary'+(sm?' btn-sm':'')+' fa-bid'} disabled={!open}
      onClick={()=>open && onBid && onBid(p)} title={open?'Place a blind FAAB bid':'His match has kicked off — acquisition closed'}>
      {open ? 'Place bid' : 'Locked'}
    </button>
  );
}

// ============================================================ desktop list row ===
function FaRow({ p, t, onBid, onOpen }){
  const c = faCutoff(p, t);
  const cls = ['fa-row', p.owner!=null?'is-owned':'', !c.open&&p.owner==null?'is-closed':''].join(' ');
  return (
    <div className={cls} onClick={()=>onOpen&&onOpen(p)}>
      <span className="fa-c-pos"><Pos p={p.pos}/></span>
      <span className="fa-c-name">
        <FaKit nat={p.nat}/>
        <span className="fa-namecol">
          <b className="fa-name">{faShort(p)}</b>
          <span className="fa-meta t-micro text-tertiary">{(NATIONS[p.nat]||{}).n||p.nat}{p.dropped && <span className="fa-droptag"><FaDrop/>just dropped</span>}</span>
        </span>
      </span>
      <span className="fa-c-fx"><FaFixture p={p} t={t}/></span>
      <span className="fa-c-cut"><CutoffTag p={p} t={t}/></span>
      <span className="fa-c-stats"><FaStats p={p}/></span>
      <span className="fa-c-act" onClick={e=>e.stopPropagation()}><Acquire p={p} t={t} onBid={onBid} sm/></span>
    </div>
  );
}

// ============================================================ card variant ===
function FaCard({ p, t, onBid, onOpen }){
  const c = faCutoff(p, t);
  const cls = ['fa-card', p.owner!=null?'is-owned':'', !c.open&&p.owner==null?'is-closed':''].join(' ');
  return (
    <div className={cls} onClick={()=>onOpen&&onOpen(p)}>
      <div className="fa-card-top">
        <FaKit nat={p.nat}/>
        <div className="fa-card-id">
          <b className="fa-name">{faShort(p)}</b>
          <div className="fa-card-sub"><Pos p={p.pos}/><span className="t-micro text-tertiary">{(NATIONS[p.nat]||{}).n||p.nat}</span></div>
        </div>
        {p.dropped && <span className="fa-droptag fa-droptag-card"><FaDrop/>dropped</span>}
      </div>
      <div className="fa-card-mid">
        <FaFixture p={p} t={t}/>
        <CutoffTag p={p} t={t}/>
      </div>
      <div className="fa-card-foot">
        <FaStats p={p}/>
        <span onClick={e=>e.stopPropagation()}><Acquire p={p} t={t} onBid={onBid}/></span>
      </div>
    </div>
  );
}

// ============================================================ bid preview (defers full flow to Phase 4) ===
// Sealed blind FAAB bid. Here it's a PREVIEW only — the live submission + batch processing
// land in the Phase-4 waivers screen. Past cutoff the bid is blocked (and a placed bid on a
// player whose match later kicks off is VOID + REFUND — flagged here, handled in Phase 4).
function FaBidPreview({ p, t, onClose }){
  if (!p) return null;
  const c = faCutoff(p, t);
  const left = faabLeft();
  const [amt, setAmt] = useStateFa(Math.min(left, Math.max(1, Math.round(p.szn/3))));
  const m = faMatch(p);
  return (
    <div className="fa-scrim" onClick={onClose}>
      <div className="modal fa-bidmodal" onClick={e=>e.stopPropagation()}>
        <div className="fa-bid-head">
          <FaKit nat={p.nat}/>
          <div className="fa-bid-id"><b className="fa-name" style={{fontSize:16}}>{faShort(p)}</b>
            <div className="fa-bid-sub"><Pos p={p.pos}/><span className="t-micro text-tertiary">{(NATIONS[p.nat]||{}).n} · {p.szn} SZN · {p.proj} proj</span></div></div>
          <span className="fa-bid-preview-tag">Preview</span>
        </div>

        {c.open ? (
          <>
            <div className="fa-bid-budget">
              <div className="fa-bid-budrow"><span className="t-label">Your FAAB</span><b className="mono">${left}<span className="fa-bid-budtot"> / ${ROSTER_FAAB.budget}</span></b></div>
              <div className="meter"><span style={{width:(left/ROSTER_FAAB.budget*100)+'%'}}></span></div>
            </div>
            <div className="fa-bid-amt">
              <span className="t-label">Sealed bid</span>
              <div className="fa-bid-stepper">
                <button className="btn btn-ghost btn-sm" onClick={()=>setAmt(a=>Math.max(0,a-1))}>–</button>
                <span className="fa-bid-amtval mono">${amt}</span>
                <button className="btn btn-ghost btn-sm" onClick={()=>setAmt(a=>Math.min(left,a+1))}>+</button>
              </div>
            </div>
            <div className="fa-bid-rules">
              <div className="fa-bid-rule"><FaLock/>Sealed — rivals see only that a bid exists, not the amount</div>
              <div className="fa-bid-rule"><FaClk/>Processes at the next waiver batch · cutoff at his {c.clock} kickoff</div>
              <div className="fa-bid-rule"><FaDrop/>Tie on bid → broken by rolling waiver order <span className="text-tertiary">(rule TBD)</span></div>
            </div>
            <div className="fa-bid-actions">
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={onClose} title="Full submission lands in the Phase-4 waivers screen">Queue bid →</button>
            </div>
            <div className="fa-bid-foot t-micro text-tertiary">Full blind-bid flow (batch results, void + refund) ships with the waivers screen.</div>
          </>
        ) : (
          <div className="fa-bid-closed">
            <div className="alert alert-warn" style={{borderRadius:'var(--r-md)'}}>
              <FaLock/><span>{faShort(p)}'s match has kicked off — acquisition is <b>closed</b> until it ends. A standing bid would be <b>voided and refunded</b>.</span>
            </div>
            <div className="fa-bid-actions"><button className="btn btn-ghost" onClick={onClose}>Close</button></div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================ player card (Points / Stats) ===
// Clicking a free agent opens the shared tabbed PlayerCard: "Points" = his season/projected
// points + today's fixture + acquisition cutoff (+ bid CTA); "Stats" = the shared game-log.
function FaPlayerCard({ p, t, onBid, onClose }){
  if (!p) return null;
  const owned = p.owner!=null;
  const body = (
    <div className="pc-ovr">
      <div className="pc-ovr-row"><span className="t-label">Season points</span><b className="mono" style={{fontSize:15}}>{p.szn}</b></div>
      <div className="pc-ovr-row"><span className="t-label">Projected next</span><b className="mono">{p.proj}</b></div>
      <div className="pc-ovr-row"><span className="t-label">Plays today</span><FaFixture p={p} t={t}/></div>
      <div className="pc-ovr-row"><span className="t-label">Acquisition</span><CutoffTag p={p} t={t}/></div>
      <div style={{marginTop:4}}><Acquire p={p} t={t} onBid={(pl)=>{ onClose(); onBid&&onBid(pl); }}/></div>
    </div>
  );
  return <PlayerCard p={p} total={p.szn} totalLabel="pts"
    sub={owned ? ('Rostered · '+mgr(p.owner).short) : 'Free agent'}
    pointsBody={body} onClose={onClose}
    note="Blind $100 FAAB · sealed bid · can’t claim once his match kicks off" />;
}

Object.assign(window, {
  faShort, FaKit, FaFixture, CutoffTag, FaStats, Acquire, FaRow, FaCard, FaPlayerCard,
  FaSearch, FaClk, FaLock, FaDrop, FaBidPreview,
});
