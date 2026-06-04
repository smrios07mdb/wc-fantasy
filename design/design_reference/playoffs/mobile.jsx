// playoffs/mobile.jsx — phone-condensed Guillotine playoffs inside the iOS frame.
function MPoRow({ r, detail, locked }){
  const me = r.id===ME_ID;
  const gone = r.eliminated || (r.inZone && locked);
  const cls = ['mpo-row', me?'is-me':'', gone?'is-elim':'', r.inZone?'is-zone':''].join(' ');
  return (
    <div className={cls}>
      <span className="mpo-seed mono">{r.rank}</span>
      <Avatar m={r.m} size="sm"/>
      <div className="mpo-mgr">
        <b className="mpo-name">{meName(r.m)}{me && <span className="st-you">YOU</span>}</b>
        <span className="mpo-sub t-micro text-tertiary">seed #{r.seed}{detail && <> · <span className="mpo-shape">{['FWD','MID','DEF','GK'].map(p=><span key={p} className="mpo-shape-x"></span>)}7+2</span></>}</span>
      </div>
      <div className="mpo-right">
        <b className="mpo-pts mono">{r.pts}</b>
        {gone ? <span className="mpo-tag is-elim"><IcoSkull/></span>
          : r.inZone ? <span className="mpo-tag is-zone"><IcoBlade/></span>
          : <span className="mpo-tag is-safe"><IcoCheck/></span>}
      </div>
    </div>
  );
}

function MPoBoard({ round, detail, locked }){
  const survN = round.survives;
  const out = [];
  round.ranked.forEach((r,i)=>{
    if (i===survN) out.push(
      <div className={'mpo-guillo'+((round.status==='past'||(round.live&&locked))?' is-dropped':'')} key="g">
        <div className="mpo-guillo-top">
          <GuillotineIcon dropped={round.status==='past' || (round.live && locked)}/>
          <span className="mpo-guillo-lab">Lowest <b>{round.cut}</b> cut{(round.status==='past'||(round.live&&locked))?' — blade dropped':''}</span>
        </div>
        <div className="mpo-victims">
          {round.ranked.slice(survN).map(v => <span className="po-victim" key={v.id} title={meName(v.m)}><Avatar m={v.m} size="sm"/></span>)}
        </div>
      </div>
    );
    out.push(<MPoRow key={r.id} r={r} detail={detail} locked={locked}/>);
  });
  return <div className="mpo-list">{out}</div>;
}

function MobilePlayoffs(props){
  const { model, view, onView, layout, detail, lineup, t, conn, theme } = props;
  const dark = theme!=='light';
  const loading = conn==='loading';
  const locked = t>=PERIOD_END;
  const cur = model.rounds[model.currentRoundIdx];
  const viewRound = model.rounds[view];
  const margin = poMyMargin(cur);
  const me = model.me;

  return (
    <IOSDevice dark={dark} width={402} height={860}>
      <div className="mpo" data-theme={theme}>
        <div className="mpo-head">
          <div className="mpo-headrow">
            <div>
              <div className="display mpo-title">Guillotine</div>
              <div className="t-micro text-tertiary">Round {model.currentRoundIdx+1} of {model.totalRounds} <span className="rt-livedot"></span></div>
            </div>
            <ConnPill state={conn}/>
          </div>
          <div className={'mpo-myband'+(margin&&!margin.safe?' is-zone':'')}>
            <div className="mpo-my-rank">
              <span className="t-label">You</span>
              <b className={margin&&!margin.safe?'is-zone':'is-safe'}>{me?me.rank:'–'}<small>/{model.aliveNow}</small></b>
            </div>
            <div className="mpo-my-mid">
              {me && margin && (margin.safe
                ? <span className="mpo-my-status is-safe"><IcoCheck/>Surviving</span>
                : <span className="mpo-my-status is-zone"><IcoBlade/>Facing the cut</span>)}
              {me && margin && <span className="t-micro text-tertiary">{margin.safe?`+${margin.gap} clear of the blade`:`${margin.gap} inside the zone`}</span>}
            </div>
            <div className="mpo-my-pts"><b className="mono">{me?me.pts:'–'}</b><span className="t-micro text-tertiary">pts</span></div>
          </div>
        </div>

        {conn==='reconnecting' && <div className="vf-banner vf-banner-recon mvf-banner"><span className="spinner" style={{width:12,height:12}}></span>Reconnecting…</div>}
        {conn==='stale' && <div className="vf-banner vf-banner-stale mvf-banner">Delayed feed · points may be behind</div>}

        <div className="mpo-scroll">
          {layout==='ladder' ? (
            <div className="mpo-ladder">
              {model.rounds.map((rd,i)=>(
                <div className={'mpo-lround st-'+rd.status} key={i}>
                  <div className="mpo-lround-head">
                    <b>Round {i+1}</b>
                    <span className={'mpo-lround-tag po-col-'+rd.status}>{rd.status==='past'?'Settled':rd.status==='live'?'Live':'Next'}</span>
                    <span className="t-micro text-tertiary">cut {rd.cut} · {rd.fieldCount}→{rd.survives}</span>
                  </div>
                  {rd.ranked
                    ? <MPoBoard round={rd} detail={detail} locked={locked}/>
                    : <div className="mpo-future"><b className="mono">{rd.fieldCount}</b> enter · lowest <b>{rd.cut}</b> cut · {rd.survives} survive</div>}
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="mpo-roundnav">
                {model.rounds.map((rd,i)=>(
                  <button key={i} className={'mpo-rn'+(i===view?' is-active':'')+(' st-'+rd.status)} onClick={()=>onView(i)}>R{i+1}</button>
                ))}
              </div>
              <div className="mpo-roundsum t-caption text-secondary">Round {view+1} · {viewRound.fieldCount} entered · lowest <b>{viewRound.cut}</b> cut · {viewRound.survives} advance</div>
              {loading
                ? Array.from({length:7}).map((_,i)=><div key={i} className="skeleton" style={{height:50,borderRadius:12,marginBottom:7}}></div>)
                : (viewRound.ranked
                    ? <MPoBoard round={viewRound} detail={detail} locked={locked}/>
                    : <div className="mpo-future-board"><b className="mono">{viewRound.fieldCount}</b><span>survivors enter</span><span className="t-caption text-tertiary">lowest {viewRound.cut} cut · set once the prior round locks</span></div>)}
            </>
          )}

          <div className="mpo-reinforce">
            <div className="mpo-rein-head"><span className="t-label">Reinforce</span><span className="po-reset-tag"><IcoReset/>FAAB ${PO_FAAB.budget}</span></div>
            <div className="po-faab"><b className="display mono">${PO_FAAB.left}</b><div className="meter" style={{flex:1}}><span style={{width:Math.round(PO_FAAB.left/PO_FAAB.budget*100)+'%'}}></span></div></div>
            <a className="btn btn-primary btn-block" href="Waivers.html">Open waivers<IcoArrowR/></a>
          </div>
        </div>
      </div>
    </IOSDevice>
  );
}

Object.assign(window, { MobilePlayoffs, MPoRow, MPoBoard });
