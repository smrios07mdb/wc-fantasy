// waivers/mobile.jsx — phone-condensed FAAB waivers inside the iOS frame.
function MClaim({ bid, t, idx, count, onEdit, onCancel, onReorder, onPlayer }){
  const add = FA_POOL.find(p=>p.id===bid.addId);
  const drop = player(bid.dropId);
  const voided = claimStatus(bid, t)==='void';
  return (
    <div className={'mwv-claim'+(voided?' is-void':'')}>
      <div className="mwv-claim-top">
        <span className="mwv-pri">#{idx+1}</span>
        <button type="button" className="wv-padd" onClick={()=>onPlayer&&onPlayer(add)} title="View player card">
          <FaKit nat={add.nat} sm/>
          <div className="mwv-claim-id">
            <b className="wv-name">{faShort(add)}</b>
            <div className="mwv-claim-meta"><Pos p={add.pos}/><CutoffTag p={add} t={t}/></div>
          </div>
        </button>
        <span className="mwv-amt mono">${bid.amount}</span>
      </div>
      <div className="mwv-claim-bottom">
        <span className="mwv-drop"><span className="text-tertiary">drop</span> <FaKit nat={drop.nat} sm/> <b>{drop.first[0]}. {drop.last}</b></span>
        {voided
          ? <span className="wv-void-tag"><WvRefund/>refund ${bid.amount}</span>
          : <span className="mwv-claim-act">
              <span className="wv-bid-sealed"><WvSealed/>sealed</span>
              <button className="wv-icon-btn" onClick={()=>onEdit(bid)}><WvEdit/></button>
              <button className="wv-icon-btn is-danger" onClick={()=>onCancel(bid.id)}><WvX/></button>
            </span>}
      </div>
      {!voided && <div className="mwv-pri-row">
        <button className="wv-pri-btn" disabled={idx===0} onClick={()=>onReorder(bid.id,-1)}><WvUp/></button>
        <span className="t-micro text-tertiary">priority {idx+1} of {count}</span>
        <button className="wv-pri-btn" disabled={idx===count-1} onClick={()=>onReorder(bid.id,1)}><WvDown/></button>
      </div>}
    </div>
  );
}

function MobileWaivers(props){
  const { tab, setTab, bids, t, st, priority, phase, onAdd, onEdit, onCancel, onReorder, layout, conn, theme, onPlayer } = props;
  const dark = theme!=='light';
  const loading = conn==='loading';
  const voidCount = bids.filter(b=>claimStatus(b,t)==='void').length;

  return (
    <IOSDevice dark={dark} width={402} height={860}>
      <div className="mwv" data-theme={theme}>
        <div className="mwv-head">
          <div className="mwv-headrow">
            <div><div className="display mwv-title">Waivers</div>
              <div className="t-micro text-tertiary">FAAB blind bids · #{priority} in order</div></div>
            <ConnPill state={conn}/>
          </div>
          <div className="mwv-faab"><FaabBar st={st} compact/></div>
          <div className="mwv-tabs">
            <button className={'mwv-tab'+(tab==='claims'?' is-active':'')} onClick={()=>setTab('claims')}>My claims {bids.length>0&&<span className="wv-tab-badge">{bids.length}</span>}</button>
            <button className={'mwv-tab'+(tab==='results'?' is-active':'')} onClick={()=>setTab('results')}>Results</button>
          </div>
        </div>

        {conn==='reconnecting' && <div className="vf-banner vf-banner-recon mvf-banner"><span className="spinner" style={{width:12,height:12}}></span>Reconnecting…</div>}

        <div className="mwv-scroll">
          {phase==='playoff' && <div className="wv-resetbanner mwv-reset"><WvRefund/><span><b>FAAB reset</b> — fresh $100 for the guillotine.</span></div>}

          {tab==='claims' ? (
            loading ? Array.from({length:3}).map((_,i)=><div key={i} className="skeleton" style={{height:90,borderRadius:12,marginBottom:10}}></div>)
            : <>
              <div className="mwv-batchbar">
                <div><span className="t-label">Next batch</span><b>{BATCH.label} · {BATCH.clock}</b></div>
                <b className="mono mwv-cd">{fmtH(BATCH.inMin)}</b>
              </div>
              {voidCount>0 && <div className="wv-voidnote mwv-voidnote"><WvRefund/><span><b>{voidCount}</b> claim{voidCount>1?'s':''} will void + refund</span></div>}
              <div className="mwv-claims-head"><span className="t-label">Pending · {bids.length}</span><button className="btn btn-primary btn-sm" onClick={onAdd}>+ New</button></div>
              {bids.length===0
                ? <div className="wv-empty"><b>No pending claims.</b><span className="t-sm text-tertiary">Place a sealed bid on a free agent.</span></div>
                : bids.map((b,i)=><MClaim key={b.id} bid={b} t={t} idx={i} count={bids.length} onEdit={onEdit} onCancel={onCancel} onReorder={onReorder} onPlayer={onPlayer}/>)}
            </>
          ) : (
            <div className="mwv-results">{HISTORY.map(b=><ResultsBatch key={b.id} batch={b} layout={layout} onPlayer={onPlayer}/>)}</div>
          )}
        </div>
      </div>
    </IOSDevice>
  );
}
Object.assign(window, { MClaim, MobileWaivers });
