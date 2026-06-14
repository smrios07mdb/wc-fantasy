// fa/desktop.jsx — desktop Free Agents browser: toolbar + cutoff-grounded match strip + list/cards.
function DesktopFA(props){
  const { rows, counts, t, q, setQ, pos, setPos, sort, setSort, includeOwned, setIncludeOwned,
          density, onBid, onOpen, conn, theme } = props;
  const loading = conn==='loading';
  const left = faabLeft();
  const pct = Math.round((left/ROSTER_FAAB.budget)*100);

  return (
    <div className="fa-app">
      {/* top bar */}
      <div className="fa-top">
        <div className="fa-brand">
          <div className="vf-logo">W</div>
          <div>
            <div className="fa-brand-title display">Free Agents</div>
            <div className="t-micro text-tertiary">Waiver wire · unique ownership</div>
          </div>
        </div>
        <nav className="fa-nav">
          <a className="fa-nav-item" href="Dashboard.html">Home</a>
          <a className="fa-nav-item" href="My Team.html">My Team</a>
          <a className="fa-nav-item" href="Set Lineup.html">Lineup</a>
          <a className="fa-nav-item" href="Standings.html">Standings</a>
          <span className="fa-nav-item is-active">Free Agents</span>
        </nav>
        <div className="fa-top-spacer"></div>
        <div className="fa-faab">
          <span className="t-label">FAAB</span>
          <b className="mono fa-faab-num">${left}</b>
          <div className="meter fa-faab-meter" style={{width:80}}><span style={{width:pct+'%'}}></span></div>
        </div>
        <ConnPill state={conn}/>
      </div>

      <div className="fa-scroll">
        <div className="fa-page">
          {/* cutoff-grounded match strip — the staggered KO times that drive the cutoff */}
          <div className="fa-ms">
            <span className="t-label fa-ms-lab">Today</span>
            <div className="fa-ms-row">
              {MATCHES.map(m => {
                const sc = matchScore(m, t); const ph = sc.st.phase;
                return (
                  <div key={m.id} className={'fa-ms-card s-'+ph}>
                    <div className={'fa-ms-clk is-'+ph}>{ph==='live' && <span className="rt-livedot"></span>}{ph==='live'?sc.st.min+"'":ph==='final'?'FT':FA_SLOT_CLOCK[m.slot]}</div>
                    <div className="fa-ms-teams">
                      <span className="fa-ms-t"><Flag nat={m.home}/><b>{m.home}</b></span>
                      <span className="mono fa-ms-score">{ph==='ytp'?'–':`${sc.h}–${sc.a}`}</span>
                      <span className="fa-ms-t"><Flag nat={m.away}/><b>{m.away}</b></span>
                    </div>
                    <div className={'fa-ms-cut'+(ph==='ytp'?'':' is-closed')}>{ph==='ytp'?'claims open':'cutoff passed'}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* count band + acquisition rule */}
          <div className="fa-band">
            <div className="fa-band-counts">
              <span className="fa-bc"><b>{counts.open}</b> available now</span>
              <span className="fa-bc-div"></span>
              <span className="fa-bc is-closed"><FaLock/><b>{counts.closed}</b> past cutoff</span>
              <span className="fa-bc-div"></span>
              <span className="fa-bc text-tertiary">{counts.owned} rostered league-wide</span>
            </div>
            <div className="fa-band-rule t-micro">
              <FaClk/> Can't claim a player once <b>his</b> match kicks off · blind sealed bids, $100 FAAB · squad is full (15/15) so a claim drops a player
            </div>
          </div>

          {/* toolbar */}
          <div className="fa-toolbar">
            <div className="fa-search">
              <FaSearch/>
              <input className="fa-search-input" placeholder="Search players…" value={q} onChange={e=>setQ(e.target.value)}/>
              {q && <button className="fa-search-clear" onClick={()=>setQ('')}>×</button>}
            </div>
            <div className="fa-seg">
              {FA_POS_FILTERS.map(f => (
                <button key={f} className={'fa-seg-btn'+(pos===f?' is-active':'')} onClick={()=>setPos(f)}>
                  {f==='ALL' ? 'All' : <Pos p={f}/>}
                </button>
              ))}
            </div>
            <div className="fa-sortrow">
              <span className="t-label">Sort</span>
              <div className="fa-seg fa-seg-sort">
                {FA_SORTS.map(s => (
                  <button key={s.k} className={'fa-seg-btn'+(sort===s.k?' is-active':'')} onClick={()=>setSort(s.k)}>{s.label}</button>
                ))}
              </div>
            </div>
            <button className={'fa-owntoggle'+(includeOwned?' is-on':'')} onClick={()=>setIncludeOwned(v=>!v)}>
              <span className="fa-owntoggle-track"><span className="fa-owntoggle-knob"></span></span>
              Include rostered
            </button>
          </div>

          {/* results */}
          {loading ? (
            <div className="fa-listcard">{Array.from({length:8}).map((_,i)=><div key={i} className="skeleton" style={{height:54,borderRadius:10,marginBottom:8}}></div>)}</div>
          ) : rows.length===0 ? (
            <div className="fa-empty">No players match — try a different position or clear the search.</div>
          ) : density==='cards' ? (
            <div className="fa-cards">{rows.map(p => <FaCard key={p.id} p={p} t={t} onBid={onBid} onOpen={onOpen}/>)}</div>
          ) : (
            <div className="fa-listcard">
              <div className="fa-list-head">
                <span>Pos</span><span>Player</span><span>Plays today</span><span>Acquisition cutoff</span><span className="fa-lh-stats">Pts</span><span></span>
              </div>
              <div className="fa-list">{rows.map(p => <FaRow key={p.id} p={p} t={t} onBid={onBid} onOpen={onOpen}/>)}</div>
            </div>
          )}

          <div className="fa-foot t-micro text-tertiary">
            Season &amp; projected points illustrative pending SCORING.md · FAAB tie-break (waiver order vs earliest) and void-and-refund handling finalize with the Phase-4 waivers screen.
          </div>
        </div>
      </div>
    </div>
  );
}
Object.assign(window, { DesktopFA });
