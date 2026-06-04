// fa/mobile.jsx — phone-condensed Free Agents browser inside the iOS frame.
function MFaRow({ p, t, onBid }){
  const c = faCutoff(p, t);
  const owned = p.owner!=null;
  const cls = ['mfa-row', owned?'is-owned':'', (!c.open&&!owned)?'is-closed':''].join(' ');
  return (
    <button className={cls} onClick={()=> !owned && onBid(p)}>
      <FaKit nat={p.nat} sm/>
      <div className="mfa-namecol">
        <b className="fa-name">{faShort(p)}</b>
        <div className="mfa-meta"><Pos p={p.pos}/><FaFixture p={p} t={t} mini/></div>
      </div>
      <div className="mfa-right">
        <CutoffTag p={p} t={t}/>
        {owned
          ? <span className="mfa-owner"><Avatar m={mgr(p.owner)} size="sm"/></span>
          : <span className="mfa-szn mono"><b>{p.szn}</b><small>SZN</small></span>}
      </div>
    </button>
  );
}

function MobileFA(props){
  const { rows, counts, t, q, setQ, pos, setPos, sort, setSort, includeOwned, setIncludeOwned,
          onBid, conn, theme } = props;
  const dark = theme!=='light';
  const loading = conn==='loading';
  const left = faabLeft();
  const pct = Math.round((left/ROSTER_FAAB.budget)*100);

  return (
    <IOSDevice dark={dark} width={402} height={860}>
      <div className="mfa" data-theme={theme}>
        <div className="mfa-head">
          <div className="mfa-headrow">
            <div>
              <div className="display mfa-title">Free Agents</div>
              <div className="t-micro text-tertiary"><b style={{color:'var(--text-secondary)'}}>{counts.open}</b> available · {counts.closed} past cutoff</div>
            </div>
            <ConnPill state={conn}/>
          </div>
          <div className="mfa-faab">
            <div className="mfa-faab-top"><span className="t-label">FAAB</span><b className="mono">${left}<span className="text-tertiary"> / ${ROSTER_FAAB.budget}</span></b></div>
            <div className={'meter'+(pct<=25?' is-low':'')}><span style={{width:pct+'%'}}></span></div>
          </div>
          <div className="mfa-search">
            <FaSearch/>
            <input className="mfa-search-input" placeholder="Search players…" value={q} onChange={e=>setQ(e.target.value)}/>
            {q && <button className="fa-search-clear" onClick={()=>setQ('')}>×</button>}
          </div>
          <div className="mfa-filters">
            {FA_POS_FILTERS.map(f => (
              <button key={f} className={'mfa-chip'+(pos===f?' is-active':'')} onClick={()=>setPos(f)}>
                {f==='ALL' ? 'All' : f}
              </button>
            ))}
            <span className="mfa-filt-div"></span>
            <select className="mfa-sort" value={sort} onChange={e=>setSort(e.target.value)}>
              {FA_SORTS.map(s => <option key={s.k} value={s.k}>{s.label}</option>)}
            </select>
          </div>
          <button className={'mfa-owntoggle'+(includeOwned?' is-on':'')} onClick={()=>setIncludeOwned(v=>!v)}>
            <span className="fa-owntoggle-track"><span className="fa-owntoggle-knob"></span></span>
            Include rostered players
          </button>
        </div>

        {conn==='reconnecting' && <div className="vf-banner vf-banner-recon mvf-banner"><span className="spinner" style={{width:12,height:12}}></span>Reconnecting…</div>}
        {conn==='stale' && <div className="vf-banner vf-banner-stale mvf-banner">Delayed feed · points may be behind</div>}

        <div className="mfa-scroll">
          {loading
            ? Array.from({length:9}).map((_,i)=><div key={i} className="skeleton" style={{height:52,borderRadius:12,marginBottom:8}}></div>)
            : rows.length===0
              ? <div className="fa-empty">No players match.</div>
              : rows.map(p => <MFaRow key={p.id} p={p} t={t} onBid={onBid}/>)}
        </div>
      </div>
    </IOSDevice>
  );
}
Object.assign(window, { MFaRow, MobileFA });
