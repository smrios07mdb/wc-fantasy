// admin/mobile.jsx — phone-condensed commissioner console inside the iOS frame.
// Reuses the SAME panel + audit components as desktop; CSS under .madm reflows them to one column.
function MobileAdmin(props){
  const { look, ctx, theme } = props;
  const dark = theme!=='light';
  const TABS_M = [
    { id:'field', label:'Field' },
    { id:'stats', label:'Stats' },
    { id:'ops',   label:'Ops' },
    { id:'draft', label:'Draft' },
  ];
  const panel = (
    ctx.tab==='field'  ? <FieldConfigPanel field={ctx.field} preset={ctx.preset} fieldLocked={ctx.fieldLocked}
                           setField={ctx.setField} setPreset={ctx.setPreset} onLock={ctx.requestLockField}/> :
    ctx.tab==='stats'  ? <StatCorrectionPanel t={ctx.t} sel={ctx.sel} setSel={ctx.setSel} edits={ctx.edits}
                           onApply={ctx.requestApplyCorrection} search={ctx.search} setSearch={ctx.setSearch}/> :
    ctx.tab==='ops'    ? <OpsPanel ops={ctx.ops} setOps={ctx.setOps} pollerSilent={ctx.pollerSilent} agoSec={ctx.agoSec} onToggleFreeze={ctx.requestToggleFreeze}/> :
                         <DraftPanel draft={ctx.draft} setDraft={ctx.setDraft}/>
  );

  return (
    <IOSDevice dark={dark} width={402} height={860}>
      <div className={'mpo madm adm-look-'+look} data-theme={theme}>
        <div className="madm-head">
          <div className="madm-headrow">
            <div className="madm-title-wrap">
              <span className="adm-badge adm-badge-sm"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M13 2L4.5 13H11l-1 9 9-12h-6.5L13 2z"/></svg>Commissioner</span>
              <div className="display madm-title">Admin console</div>
            </div>
            <ViewAsSwitcher value={ctx.viewAs} onChange={ctx.setViewAs}/>
          </div>
          <div className={'madm-ribbon adm-ribbon-'+look}>
            {look==='warning'
              ? 'Powerful controls — affects every manager'
              : 'Elevated privileges — every action is logged'}
          </div>
        </div>

        {ctx.viewAs
          ? <div className="madm-scroll"><ManagerView value={ctx.viewAs} field={ctx.field} onClear={()=>ctx.setViewAs(null)}/></div>
          : <>
              <div className="madm-tabs">
                {TABS_M.map(tb=>(
                  <button key={tb.id} className={'madm-tab'+(ctx.tab===tb.id?' is-active':'')} onClick={()=>ctx.setTab(tb.id)}>
                    {tb.label}
                    {tb.id==='stats' && ctx.editCount>0 && <span className="adm-tab-badge">{ctx.editCount}</span>}
                    {tb.id==='ops' && ctx.pollerSilent && ctx.ops.pollerMode!=='manual' && <span className="adm-tab-dot"></span>}
                  </button>
                ))}
              </div>
              <div className="madm-scroll">
                {panel}
                <div className="madm-auditsec">
                  <div className="madm-audit-head">
                    <span className="t-label">Audit log</span>
                    <span className="adm-audit-allflag">all actions recorded</span>
                  </div>
                  <AuditLog entries={ctx.audit} onReverse={ctx.requestReverse} compact max={5}/>
                </div>
              </div>
            </>}
      </div>
    </IOSDevice>
  );
}

Object.assign(window, { MobileAdmin });
