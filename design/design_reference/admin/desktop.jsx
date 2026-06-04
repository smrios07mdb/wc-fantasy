// admin/desktop.jsx — desktop commissioner console. Two layouts (live-editing · audit-spine).
// Reuses: AdminRibbon, ViewAsSwitcher, ViewAsBanner, CommishBadge, AuditLog, PollerStatus,
//   AdmCard, FieldConfigPanel, StatCorrectionPanel, OpsPanel, DraftPanel, Avatar, mgr, LEAGUE.
const TABS = [
  { id:'field',  label:'Playoff field',   glyph:'cut'  },
  { id:'stats',  label:'Stat corrections',glyph:'edit' },
  { id:'ops',    label:'Game operations',  glyph:'pulse'},
  { id:'draft',  label:'Draft setup',     glyph:'gear' },
];

function NavLink({ href, children }){ return <a className="adm-nav-item" href={href}>{children}</a>; }

function DesktopAdmin(props){
  const { look, layout, ctx } = props;
  const spine = layout==='spine';

  const panel = (
    ctx.tab==='field'  ? <FieldConfigPanel field={ctx.field} preset={ctx.preset} fieldLocked={ctx.fieldLocked}
                           setField={ctx.setField} setPreset={ctx.setPreset} onLock={ctx.requestLockField}/> :
    ctx.tab==='stats'  ? <StatCorrectionPanel t={ctx.t} sel={ctx.sel} setSel={ctx.setSel} edits={ctx.edits}
                           onApply={ctx.requestApplyCorrection} search={ctx.search} setSearch={ctx.setSearch}/> :
    ctx.tab==='ops'    ? <OpsPanel ops={ctx.ops} setOps={ctx.setOps} pollerSilent={ctx.pollerSilent} agoSec={ctx.agoSec} onToggleFreeze={ctx.requestToggleFreeze}/> :
                         <DraftPanel draft={ctx.draft} setDraft={ctx.setDraft}/>
  );

  const statusCard = (
    <AdmCard title="System status" className="adm-status">
      <div className="adm-status-grid">
        <div className="adm-stat">
          <span className="t-label">Feed</span>
          <PollerStatus silent={ctx.pollerSilent} agoSec={ctx.agoSec} mode={ctx.ops.pollerMode}/>
        </div>
        <div className="adm-stat-row">
          <div className="adm-stat-mini"><span className="t-label">Lock fallback</span>
            <b className={ctx.ops.lockFallback==='scheduled'?'is-warn':''}>{ctx.ops.lockFallback==='scheduled'?'Scheduled':'Auto · feed'}</b></div>
          <div className="adm-stat-mini"><span className="t-label">Frozen periods</span>
            <b className={ctx.frozenCount?'is-warn':''}>{ctx.frozenCount||'None'}</b></div>
        </div>
        <div className="adm-stat-row">
          <div className="adm-stat-mini"><span className="t-label">Managers</span><b className="num">{LEAGUE.managers}</b></div>
          <div className="adm-stat-mini"><span className="t-label">Playoff field</span>
            <b>{ctx.fieldLocked? <span className="is-lock">{ctx.field} · locked</span> : `${ctx.field} · provisional`}</b></div>
        </div>
      </div>
    </AdmCard>
  );

  const auditCard = (
    <AdmCard title="Audit log" sub={`${ctx.audit.length} entries`} className="adm-auditcard"
      right={<span className="adm-audit-allflag">all actions recorded</span>}>
      <AuditLog entries={ctx.audit} onReverse={ctx.requestReverse} compact={!spine} max={spine?undefined:7}/>
    </AdmCard>
  );

  return (
    <div className={'adm-app adm-look-'+look}>
      {/* top bar */}
      <div className="adm-top">
        <div className="adm-brand">
          <div className="adm-logo">W</div>
          <div className="adm-brand-id">
            <span className="adm-brand-title">{LEAGUE.name}</span>
            <span className="adm-brand-sub">Commissioner console</span>
          </div>
          <CommishBadge sm/>
        </div>
        <nav className="adm-nav">
          <NavLink href="Dashboard.html">Dashboard</NavLink>
          <NavLink href="Standings.html">Standings</NavLink>
          <NavLink href="Guillotine Playoffs.html">Playoffs</NavLink>
          <NavLink href="Waivers.html">Waivers</NavLink>
          <span className="adm-nav-item is-active">Admin</span>
        </nav>
        <div className="adm-top-r">
          <ViewAsSwitcher value={ctx.viewAs} onChange={ctx.setViewAs}/>
        </div>
      </div>

      <AdminRibbon look={look} viewAs={ctx.viewAs}/>

      {ctx.viewAs
        ? <ManagerView value={ctx.viewAs} field={ctx.field} onClear={()=>ctx.setViewAs(null)}/>
        : <>
            {/* tabs */}
            <div className="adm-tabs">
              {TABS.map(tb=>(
                <button key={tb.id} className={'adm-tab'+(ctx.tab===tb.id?' is-active':'')} onClick={()=>ctx.setTab(tb.id)}>
                  {tb.label}
                  {tb.id==='stats' && ctx.editCount>0 && <span className="adm-tab-badge">{ctx.editCount}</span>}
                  {tb.id==='ops' && ctx.pollerSilent && ctx.ops.pollerMode!=='manual' && <span className="adm-tab-dot"></span>}
                </button>
              ))}
            </div>

            <div className={'adm-body'+(spine?' is-spine':'')}>
              {spine
                ? <>
                    <aside className="adm-spine">
                      {statusCard}
                      {auditCard}
                    </aside>
                    <main className="adm-main">{panel}</main>
                  </>
                : <>
                    <main className="adm-main">{panel}</main>
                    <aside className="adm-rail">
                      {statusCard}
                      {auditCard}
                    </aside>
                  </>}
            </div>
          </>}
    </div>
  );
}

// ---- impersonation: a read-only peek at a manager's seat ----
function ManagerView({ value, field, onClear }){
  const m = mgr(value);
  const list = cutContext(buildStandings(PERIOD_END), parseInt(field,10));
  const row = list.find(r => r.m && r.m.id===value);
  const seed = row ? row.rank : '—';
  return (
    <div className="adm-mgrview">
      <ViewAsBanner value={value} onClear={onClear}/>
      <div className="adm-mgrview-body">
        <div className="adm-mgrview-card">
          <div className="adm-mgrview-head">
            <Avatar m={m} size="lg"/>
            <div>
              <div className="adm-mgrview-name">{m.name}</div>
              <div className="adm-mgrview-sub">{m.online?'Online now':'Offline'} · manager seat</div>
            </div>
          </div>
          <div className="adm-mgrview-tiles">
            <div className="adm-mvtile"><span className="t-label">Seed</span><b className="num">{seed}</b></div>
            <div className="adm-mvtile"><span className="t-label">Record</span><b className="mono">{row?`${row.W}–${row.L}`:'—'}</b></div>
            <div className="adm-mvtile"><span className="t-label">Points for</span><b className="num">{row?row.total:'—'}</b></div>
            <div className="adm-mvtile"><span className="t-label">Status</span><b>{row? (row.qualified?'In playoffs':'Out') :'—'}</b></div>
          </div>
          <div className="adm-mgrview-note">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>
            You’re viewing the league exactly as <b>{m.name}</b> sees it. Commissioner controls and other managers’ sealed bids stay hidden. Nothing you do here is recorded against them.
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { DesktopAdmin, ManagerView });
