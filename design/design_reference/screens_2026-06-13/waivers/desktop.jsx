// waivers/desktop.jsx — desktop FAAB waivers: My Claims / Results tabs.
function DesktopWaivers(props){
  const { tab, setTab, bids, t, st, priority, phase, onAdd, onEdit, onCancel, onReorder,
          layout, conn, theme, onPlayer } = props;
  const loading = conn==='loading';
  const voidCount = bids.filter(b=>claimStatus(b,t)==='void').length;

  return (
    <div className="wv-app">
      <div className="wv-top">
        <div className="wv-brand">
          <div className="vf-logo">W</div>
          <div><div className="wv-brand-title display">Waivers</div>
            <div className="t-micro text-tertiary">FAAB blind bids · sealed</div></div>
        </div>
        <nav className="wv-nav">
          <a className="wv-nav-item" href="Dashboard.html">Home</a>
          <a className="wv-nav-item" href="My Team.html">My Team</a>
          <a className="wv-nav-item" href="Standings.html">Standings</a>
          <a className="wv-nav-item" href="Free Agents.html">Free Agents</a>
          <span className="wv-nav-item is-active">Waivers</span>
        </nav>
        <div className="wv-top-spacer"></div>
        <ConnPill state={conn}/>
      </div>

      {/* tabs */}
      <div className="wv-tabs">
        <button className={'wv-tab'+(tab==='claims'?' is-active':'')} onClick={()=>setTab('claims')}>
          My claims {bids.length>0 && <span className="wv-tab-badge">{bids.length}</span>}
        </button>
        <button className={'wv-tab'+(tab==='results'?' is-active':'')} onClick={()=>setTab('results')}>Batch results</button>
      </div>

      <div className="wv-scroll">
        {phase==='playoff' && (
          <div className="wv-resetbanner">
            <WvRefund/><span><b>FAAB reset.</b> Budgets returned to a fresh <b>$100</b> for the guillotine — group-stage spend is wiped.</span>
          </div>
        )}

        {tab==='claims' ? (
          <div className="wv-claims-page">
            <div className="wv-claims-main">
              {/* batch countdown */}
              <div className="wv-batchbar">
                <div className="wv-batchbar-l">
                  <span className="t-label">Next waiver batch</span>
                  <b className="wv-batchbar-when">{BATCH.label} · {BATCH.clock}</b>
                  <span className="t-micro text-tertiary">{BATCH.tz} · illustrative cadence</span>
                </div>
                <div className="wv-batchbar-r">
                  <span className="t-label">Processes in</span>
                  <b className="wv-batchbar-cd mono">{fmtH(BATCH.inMin)}</b>
                </div>
              </div>

              {voidCount>0 && (
                <div className="wv-voidnote"><WvRefund/><span><b>{voidCount}</b> of your claims target a player whose match already kicked off — they'll be <b>voided and refunded</b> at the batch.</span></div>
              )}

              <div className="wv-claims-head">
                <span className="t-label">Pending claims · {bids.length}</span>
                <button className="btn btn-primary btn-sm" onClick={onAdd}>+ New claim</button>
              </div>

              {loading ? (
                <div className="wv-claims-list">{Array.from({length:3}).map((_,i)=><div key={i} className="skeleton" style={{height:74,borderRadius:12,marginBottom:10}}></div>)}</div>
              ) : bids.length===0 ? (
                <div className="wv-empty">
                  <b>No pending claims.</b>
                  <span className="t-sm text-tertiary">Place a sealed FAAB bid on a free agent — it processes at the next batch.</span>
                  <button className="btn btn-primary btn-sm" onClick={onAdd}>+ New claim</button>
                </div>
              ) : (
                <div className="wv-claims-list">
                  {bids.map((b,i)=>(
                    <ClaimRow key={b.id} bid={b} t={t} idx={i} count={bids.length}
                      onEdit={onEdit} onCancel={onCancel} onReorder={onReorder} onPlayer={onPlayer}/>
                  ))}
                </div>
              )}

              <div className="wv-claims-foot t-micro text-tertiary">
                Higher claims process first — once a claim wins, its FAAB is spent before the next is evaluated. Amounts illustrative pending SCORING.md.
              </div>
            </div>

            <aside className="wv-rail">
              <div className="wv-card"><FaabBar st={st}/></div>
              <div className="wv-card"><WaiverOrderRail priority={priority}/></div>
            </aside>
          </div>
        ) : (
          <div className="wv-results-page">
            <div className="wv-results-main">
              <div className="wv-results-head">
                <span className="t-label">Processed batches</span>
                <span className="t-micro text-tertiary">Sealed amounts revealed after processing</span>
              </div>
              {HISTORY.map(b => <ResultsBatch key={b.id} batch={b} layout={layout} onPlayer={onPlayer}/>)}
              <div className="wv-claims-foot t-micro text-tertiary">
                Void + refund returns the full bid when a claim's player kicks off before the batch. Equal bids break on the rolling waiver order.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
Object.assign(window, { DesktopWaivers });
