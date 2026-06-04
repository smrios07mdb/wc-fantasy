// waivers/components.jsx — presentational pieces for the FAAB waivers screen.
// Reuses globals: FaKit, faShort, CutoffTag, Pos, Flag, Avatar, mgr, player, seasonPts,
//   FA_POOL, faOpp, faClock, claimStatus, rivalBids, faabState, claimableFAs, droppableSquad.
const { useState:useStateWv } = React;

const WvSealed = () => <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>;
const WvArrow  = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
const WvUp     = () => <svg viewBox="0 0 12 12" width="11" height="11" fill="currentColor"><path d="M6 2l4 6H2z"/></svg>;
const WvDown   = () => <svg viewBox="0 0 12 12" width="11" height="11" fill="currentColor"><path d="M6 10 2 4h8z"/></svg>;
const WvX      = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M6 6l12 12M18 6 6 18"/></svg>;
const WvEdit   = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"/></svg>;
const WvRefund = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4"/></svg>;

// ---------- FAAB budget bar (left · pending committed · after) ----------
function FaabBar({ st, compact }){
  const pendPct = Math.min(100, (st.pending/st.budget)*100);
  const leftPct = Math.min(100, (st.left/st.budget)*100);
  const low = st.after <= st.budget*0.2;
  return (
    <div className={'wv-faab'+(compact?' is-compact':'')}>
      <div className="wv-faab-top">
        <div className="wv-faab-stat"><span className="t-label">FAAB available</span><b className="wv-faab-big mono">${st.left}</b></div>
        <div className="wv-faab-stat is-right"><span className="t-label">After pending</span><b className={'wv-faab-big mono'+(low?' is-low':'')}>${st.after}</b></div>
      </div>
      <div className="wv-faab-track">
        <span className="wv-faab-fill" style={{ width:leftPct+'%' }}></span>
        <span className="wv-faab-pend" style={{ width:pendPct+'%' }} title={`$${st.pending} committed in pending bids`}></span>
      </div>
      <div className="wv-faab-legend">
        <span><span className="wv-dot wv-dot-left"></span>${st.left} budget</span>
        <span><span className="wv-dot wv-dot-pend"></span>${st.pending} in pending</span>
      </div>
    </div>
  );
}

// ---------- rolling waiver order ----------
function WaiverOrderRail({ priority }){
  return (
    <div className="wv-order">
      <div className="wv-order-head">
        <span className="t-label">Rolling waiver order</span>
        <span className="wv-order-mine">You're #{priority}</span>
      </div>
      <div className="wv-order-list">
        {WAIVER_ORDER.map((id,i)=>{
          const me = id===ME_ID; const m = mgr(id);
          return (
            <div key={id} className={'wv-order-item'+(me?' is-me':'')}>
              <span className="wv-order-n">{i+1}</span>
              <Avatar m={m} size="sm"/>
              <span className="wv-order-name">{me?'You':m.name}</span>
            </div>
          );
        })}
      </div>
      <div className="wv-order-note t-micro">Order rotates as claims are won · <b>equal bids break on this order</b></div>
    </div>
  );
}

// ---------- a single pending claim ----------
function ClaimRow({ bid, t, idx, count, onEdit, onCancel, onReorder }){
  const add = FA_POOL.find(p=>p.id===bid.addId);
  const drop = player(bid.dropId);
  const voided = claimStatus(bid, t)==='void';
  return (
    <div className={'wv-claim'+(voided?' is-void':'')}>
      <div className="wv-claim-pri">
        <button className="wv-pri-btn" disabled={idx===0} onClick={()=>onReorder(bid.id,-1)} title="Higher priority"><WvUp/></button>
        <span className="wv-pri-n">{idx+1}</span>
        <button className="wv-pri-btn" disabled={idx===count-1} onClick={()=>onReorder(bid.id,1)} title="Lower priority"><WvDown/></button>
      </div>

      <div className="wv-claim-body">
        <div className="wv-claim-line">
          <span className="wv-claim-tag wv-tag-add">ADD</span>
          <FaKit nat={add.nat} sm/>
          <b className="wv-name">{faShort(add)}</b>
          <Pos p={add.pos}/>
          <CutoffTag p={add} t={t}/>
        </div>
        <div className="wv-claim-line is-drop">
          <span className="wv-claim-tag wv-tag-drop">DROP</span>
          <FaKit nat={drop.nat} sm/>
          <b className="wv-name wv-name-drop">{drop.first[0]}. {drop.last}</b>
          <Pos p={drop.pos}/>
        </div>
      </div>

      <div className="wv-claim-bid">
        <span className="wv-bid-amt mono">${bid.amount}</span>
        <span className="wv-bid-sealed"><WvSealed/>sealed bid</span>
      </div>

      <div className="wv-claim-act">
        {voided ? (
          <span className="wv-void-tag"><WvRefund/>Void · refund ${bid.amount}</span>
        ) : (
          <>
            <button className="wv-icon-btn" onClick={()=>onEdit(bid)} title="Edit bid"><WvEdit/></button>
            <button className="wv-icon-btn is-danger" onClick={()=>onCancel(bid.id)} title="Cancel claim"><WvX/></button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- bid composer (place / edit a sealed claim) ----------
function BidComposer({ open, editBid, t, bids, st, onClose, onSubmit }){
  const [sel, setSel] = useStateWv(editBid ? FA_POOL.find(p=>p.id===editBid.addId) : null);
  const [amount, setAmount] = useStateWv(editBid ? editBid.amount : 1);
  const [dropId, setDropId] = useStateWv(editBid ? editBid.dropId : null);
  const [q, setQ] = useStateWv('');
  const [pos, setPos] = useStateWv('ALL');
  if (!open) return null;

  const fas = claimableFAs(t, bids.filter(b=>!editBid||b.id!==editBid.id), { q, pos });
  const drops = droppableSquad(t);
  const maxBid = st.left + (editBid?editBid.amount:0);
  const valid = sel && dropId && amount>=1 && amount<=maxBid;

  return (
    <div className="wv-scrim" onClick={onClose}>
      <div className="wv-composer" onClick={e=>e.stopPropagation()}>
        <div className="wv-comp-head">
          <b className="wv-comp-title">{editBid?'Edit claim':'New waiver claim'}</b>
          <button className="wv-icon-btn" onClick={onClose}><WvX/></button>
        </div>
        <div className="wv-comp-body">
          {/* left: pick a free agent */}
          <div className="wv-comp-pick">
            <div className="wv-comp-search">
              <input className="wv-comp-input" placeholder="Search free agents…" value={q} onChange={e=>setQ(e.target.value)}/>
            </div>
            <div className="wv-comp-seg">
              {WV_POS.map(f=> <button key={f} className={'wv-seg-btn'+(pos===f?' is-active':'')} onClick={()=>setPos(f)}>{f==='ALL'?'All':f}</button>)}
            </div>
            <div className="wv-comp-list">
              {fas.length===0 && <div className="wv-comp-empty t-sm text-tertiary">No claimable free agents match.</div>}
              {fas.slice(0,40).map(p=>(
                <button key={p.id} className={'wv-comp-fa'+(sel&&sel.id===p.id?' is-sel':'')} onClick={()=>setSel(p)}>
                  <FaKit nat={p.nat} sm/>
                  <div className="wv-comp-fa-id"><b className="wv-name">{faShort(p)}</b>
                    <span className="t-micro text-tertiary">{(NATIONS[p.nat]||{}).n} · {p.szn} SZN</span></div>
                  <Pos p={p.pos}/>
                </button>
              ))}
            </div>
          </div>

          {/* right: configure the bid */}
          <div className="wv-comp-config">
            {!sel ? (
              <div className="wv-comp-placeholder t-sm text-tertiary">Pick a free agent to configure your sealed bid.</div>
            ) : (
              <>
                <div className="wv-comp-selplayer">
                  <FaKit nat={sel.nat}/>
                  <div><b className="wv-name" style={{fontSize:15}}>{faShort(sel)}</b>
                    <div className="wv-comp-selmeta"><Pos p={sel.pos}/><CutoffTag p={sel} t={t}/></div></div>
                </div>

                <label className="wv-comp-field">
                  <span className="t-label">Sealed bid <span className="text-tertiary">· max ${maxBid}</span></span>
                  <div className="wv-bid-stepper">
                    <button className="btn btn-ghost btn-sm" onClick={()=>setAmount(a=>Math.max(0,a-1))}>–</button>
                    <input className="wv-bid-input mono" type="number" min="0" max={maxBid} value={amount}
                      onChange={e=>setAmount(Math.max(0,Math.min(maxBid, +e.target.value||0)))}/>
                    <button className="btn btn-ghost btn-sm" onClick={()=>setAmount(a=>Math.min(maxBid,a+1))}>+</button>
                  </div>
                </label>

                <label className="wv-comp-field">
                  <span className="t-label">Drop to make room <span className="text-tertiary">· squad full 15/15</span></span>
                  <div className="wv-drop-pick">
                    {drops.map(p=>(
                      <button key={p.id} className={'wv-drop-opt'+(dropId===p.id?' is-sel':'')} onClick={()=>setDropId(p.id)}>
                        <FaKit nat={p.nat} sm/><Pos p={p.pos}/><span className="wv-drop-optname">{p.first[0]}. {p.last}</span><span className="t-micro text-tertiary">{seasonPts(p.id)} SZN</span>
                      </button>
                    ))}
                  </div>
                </label>

                <div className="wv-comp-rules">
                  <div className="wv-comp-rule"><WvSealed/>Sealed — rivals never see your bid amount</div>
                  <div className="wv-comp-rule"><WvRefund/>Voided + refunded if his {faClock(sel)} match kicks off first</div>
                </div>

                <div className="wv-comp-actions">
                  <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
                  <button className="btn btn-primary" disabled={!valid}
                    onClick={()=>onSubmit({ id:editBid?editBid.id:('bid'+Date.now()), addId:sel.id, dropId, amount })}>
                    {editBid?'Save claim':'Queue sealed bid'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- results history ----------
function ResultItem({ r, layout }){
  const w = mgr(r.winnerId);
  const oc = r.outcome; // won | lost | void
  return (
    <div className={'wv-res'+(r.mine?' is-mine':'')+(layout==='table'?' is-table':'')}>
      <div className="wv-res-add">
        <FaKit nat={r.add.nat} sm/>
        <div className="wv-res-id"><b className="wv-name">{r.add.first[0]}. {r.add.last}</b>
          <span className="t-micro text-tertiary"><Pos p={r.add.pos}/> {(NATIONS[r.add.nat]||{}).n||r.add.nat}</span></div>
      </div>
      <div className="wv-res-mid">
        {oc==='void' ? (
          <span className="wv-res-out wv-out-void"><WvRefund/>Voided · refund ${r.refund}</span>
        ) : (
          <span className="wv-res-winner">
            <Avatar m={w} size="sm"/>
            <span className="wv-res-wname">{r.mine?'You':w.name}</span>
            <span className={'wv-res-out '+(oc==='won'?'wv-out-won':'wv-out-lost')}>{oc==='won'?'won':'lost'}</span>
          </span>
        )}
      </div>
      <div className="wv-res-bid">
        {oc!=='void' && <span className="wv-res-amt mono">${r.amount}</span>}
        {oc==='won' && r.beat>0 && <span className="t-micro text-tertiary">beat {r.beat} bid{r.beat>1?'s':''}</span>}
        {oc==='won' && r.drop && r.drop!=='—' && <span className="t-micro text-tertiary">dropped {r.drop}</span>}
        {r.note && <span className="wv-res-note t-micro">{r.note}</span>}
      </div>
    </div>
  );
}

function ResultsBatch({ batch, layout }){
  return (
    <section className="wv-batch">
      <header className="wv-batch-head">
        <b className="wv-batch-when">{batch.when}</b>
        <span className="t-micro text-tertiary">{batch.date} · {batch.results.length} claims</span>
      </header>
      <div className={'wv-batch-list'+(layout==='table'?' is-table':'')}>
        {batch.results.map((r,i)=><ResultItem key={i} r={r} layout={layout}/>)}
      </div>
    </section>
  );
}

Object.assign(window, {
  FaabBar, WaiverOrderRail, ClaimRow, BidComposer, ResultItem, ResultsBatch,
  WvSealed, WvRefund, WvUp, WvDown, WvX, WvEdit,
});
