// vsfield2/shared.jsx — shared vocabulary for BOTH redesign directions.
// Rich player row (inline expand) · team pitch · team panel · 3-fact compare band ·
// You-vs-field aggregate · feed ticker · season table · compare helpers.
// Reuses atoms from vsfield/components.jsx (Flag, Pos, Avatar, ScoreBreakdown, useScorePulse,
// RecordBadge, ConnPill, StatusTag) + data from vsfield/data.jsx. Exports to window.
const { useState:useS2, useMemo:useM2 } = React;

// ----------------------------------------------------------------- compare helpers ---
// All three facts the user ranked: live margin, upside-left, player-by-player lineup edge.
function compareFacts(me, opp){
  const diff = me.total - opp.total;
  const k = diff>0?'win':diff<0?'loss':'draw';
  const word = diff>0?'WINNING':diff<0?'LOSING':'LEVEL';
  // lineup: rank each XI by pts, pair by rank, count slots I'm ahead + biggest single edge
  const mine = [...me.rows].sort((a,b)=>b.pts-a.pts);
  const theirs = [...opp.rows].sort((a,b)=>b.pts-a.pts);
  const n = Math.min(mine.length, theirs.length);
  let ahead=0, best={diff:-99,row:null};
  for(let i=0;i<n;i++){
    const d = mine[i].pts - theirs[i].pts;
    if(d>0) ahead++;
    if(d>best.diff) best = { diff:d, row:mine[i] };
  }
  return {
    margin:{ diff, k, word },
    upside:{ mine:me.ytp, theirs:opp.ytp, edge:me.ytp-opp.ytp },
    lineup:{ ahead, total:n, best }
  };
}
function playerCtx(r, t){
  const sc = matchScore(r.match, t);
  const score = sc.st.phase==='ytp' ? '–' : sc.h+'–'+sc.a;
  if(r.status==='live')  return { live:true,  text:`${r.match.home} ${score} ${r.match.away}`, clock:r.matchMin+"'" };
  if(r.status==='final') return { live:false, text:`${r.match.home} ${score} ${r.match.away}`, clock:'FT' };
  return { live:false, ytp:true, text:`${r.match.home} v ${r.match.away}`, clock:'KO soon' };
}

// ----------------------------------------------------------------- formation pitch (single team) ---
function V2Pitch({ snap, className='', selId, withNums=false }){
  const byPos = { GK:[], DEF:[], MID:[], FWD:[] };
  snap.rows.forEach(r => byPos[r.p.pos].push(r));
  const lanes = ['FWD','MID','DEF','GK'];
  return (
    <div className={'v2-pitch v2-pitch-v '+className}>
      {lanes.map(pos => byPos[pos].length>0 && (
        <div className="v2-lane" key={pos}>
          {byPos[pos].map((r,i)=>(
            <span key={i} className={'v2-node s-'+r.status+(selId===r.p.id?' is-sel':'')} title={r.p.first[0]+'. '+r.p.last+' · '+r.pts+' pts'}>
              {withNums && <b>{r.pts}</b>}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
function V2Legend({ snap, withCounts }){
  return (
    <div className="v2-legend">
      <span className="v2-l"><span className="v2-node s-live"></span>{withCounts?snap.live+' ':''}Playing</span>
      <span className="v2-l"><span className="v2-node s-final"></span>{withCounts?snap.final+' ':''}Played</span>
      <span className="v2-l"><span className="v2-node s-ytp"></span>{withCounts?snap.ytp+' ':''}To play</span>
    </div>
  );
}
// one lane row used by the dual mirrored pitch (Direction B)
function PitchHalfLanes({ snap, order }){
  const byPos = { GK:[], DEF:[], MID:[], FWD:[] };
  snap.rows.forEach(r => byPos[r.p.pos].push(r));
  return (
    <div className="db-half-lanes">
      {order.map(pos => byPos[pos].length>0 && (
        <div className="db-half-lane" key={pos}>
          {byPos[pos].map((r,i)=> <span key={i} className={'v2-node s-'+r.status} title={r.p.last+' · '+r.pts}></span>)}
        </div>
      ))}
    </div>
  );
}

// ----------------------------------------------------------------- rich player row (inline expand) ---
function RichPlayerRow({ r, t, open, onToggle, dimLive, rtl }){
  const ctx = playerCtx(r, t);
  const pulse = useScorePulse(r.pts);
  return (
    <div className={'v2-pl st-'+r.status+(open?' is-open':'')}>
      <button className="v2-pl-head" onClick={onToggle} title="Tap for the points breakdown">
        <Pos p={r.p.pos} />
        <Flag nat={r.p.nat} />
        <span className="v2-pl-name">
          <b>{r.p.first[0]}. {r.p.last}</b>
          <span className="v2-pl-ctx">
            {ctx.live && !dimLive && <span className="v2-livedot"></span>}
            <span className={ctx.live?'is-live':''}>{ctx.text}</span>
            <span className="text-tertiary">· {ctx.clock}</span>
          </span>
        </span>
        <span className="v2-pl-status"><StatusTag status={r.status} mini /></span>
        <span className={'v2-pl-pts mono'+(r.pts===0?' is-zero':'')+(pulse?' score-pulse':'')}>{r.pts}</span>
        <span className="v2-pl-chev">›</span>
      </button>
      <div className="v2-pl-exp"><div className="v2-pl-exp-in"><div className="v2-pl-exp-pad">
        {open && <PlayerExpand r={r} t={t} />}
      </div></div></div>
    </div>
  );
}
function PlayerExpand({ r, t }){
  const sc = matchScore(r.match, t);
  const minLabel = r.status==='final'?'FT':r.status==='live'?r.matchMin+"'":'KO soon';
  return (
    <>
      <div className="v2-pl-exp-match">
        <StatusTag status={r.status} mini />
        <span><Flag nat={r.match.home}/> {r.match.home} <b className="mono">{sc.st.phase==='ytp'?'–':sc.h+'–'+sc.a}</b> {r.match.away} · <span className="mono">{minLabel}</span></span>
      </div>
      {r.status==='ytp'
        ? <div className="v2-pl-exp-empty">Hasn’t kicked off — no points yet. Still swappable until his match starts.</div>
        : r.doneEvents.length===0
          ? <div className="v2-pl-exp-empty">On the pitch — no scoring actions logged yet.</div>
          : <ScoreBreakdown done={r.doneEvents} p={r.p} />}
    </>
  );
}

// ----------------------------------------------------------------- team panel (Direction A) ---
// pitch on top + counts, rich scrollable player list below
function TeamPanel({ snap, isMe, openId, onToggle, dimLive, t }){
  const m = mgr(snap.id);
  const order = { live:0, ytp:1, final:2 };
  const rows = [...snap.rows].sort((a,b)=> (order[a.status]-order[b.status]) || (b.pts-a.pts));
  const pulse = useScorePulse(snap.total);
  return (
    <div className={'da-team'+(isMe?' is-me':'')}>
      <div className="da-team-hd">
        <Avatar m={m} size="sm" ring={isMe} />
        <b>{isMe?'You':m.name}</b>
        <span className="da-team-form">{m.formation}</span>
        <span className={'da-team-tot mono'+(pulse?' score-pulse':'')}>{snap.total}</span>
      </div>
      <div className="da-team-pitchwrap">
        <V2Pitch snap={snap} className="v2-pitch-team" selId={openId} />
        <div className="da-team-counts">
          <div className="v2-ps"><span className="v2-ps-num mono">{snap.ytp}</span><span className="v2-ps-lab">to come</span></div>
          <div className="v2-ps"><span className={'v2-ps-num mono'+(dimLive?'':' is-live')}>{snap.live}</span><span className="v2-ps-lab">playing</span></div>
          <div className="v2-ps"><span className="v2-ps-num mono">{snap.final}</span><span className="v2-ps-lab">played</span></div>
        </div>
      </div>
      <div className="v2-list">
        {rows.map(r => <RichPlayerRow key={r.p.id} r={r} t={t} open={openId===r.p.id} onToggle={()=>onToggle(r.p.id)} dimLive={dimLive} />)}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- compare band (3 ranked facts) ---
function CompareBand({ me, opp, t }){
  const f = compareFacts(me, opp);
  const mMe = mgr(me.id), mOp = mgr(opp.id);
  const bestName = f.lineup.best.row ? (f.lineup.best.row.p.first[0]+'. '+f.lineup.best.row.p.last) : '—';
  return (
    <div className="v2-band">
      <div className="v2-band-primary">
        <div className="v2-bp-side">
          <Avatar m={mMe} size="lg" ring />
          <div className="v2-bp-id">
            <b>You</b>
            <span className="v2-bp-meta">rank {me.rank} · {me.rec.W}–{me.rec.L} vs field</span>
          </div>
          <span className="v2-bp-score mono">{me.total}</span>
        </div>
        <div className="v2-bp-mid">
          <span className={'v2-bp-verdict is-'+f.margin.k}>{f.margin.word}</span>
          <span className={'v2-bp-margin mono is-'+f.margin.k}>{f.margin.diff>0?'+':''}{f.margin.diff}</span>
          <span className="t-micro">live margin</span>
        </div>
        <div className="v2-bp-side right">
          <Avatar m={mOp} size="lg" />
          <div className="v2-bp-id">
            <b>{mOp.name}</b>
            <span className="v2-bp-meta">rank {opp.rank} · {opp.rec.W}–{opp.rec.L} vs field</span>
          </div>
          <span className="v2-bp-score mono">{opp.total}</span>
        </div>
      </div>
      <div className="v2-band-facts">
        <div className="v2-fact">
          <span className="v2-fact-rank">2</span>
          <div className="v2-fact-body">
            <span className="v2-fact-lab">Upside still to come</span>
            <span className="v2-fact-val">
              <b className="pos">{f.upside.mine}</b> of yours yet to play · they have <b>{f.upside.theirs}</b>
              {f.upside.edge!==0 && <> · <span className={f.upside.edge>0?'up':'down'}>{f.upside.edge>0?'+':''}{f.upside.edge} player edge</span></>}
            </span>
          </div>
        </div>
        <div className="v2-fact">
          <span className="v2-fact-rank">3</span>
          <div className="v2-fact-body">
            <span className="v2-fact-lab">Player-by-player</span>
            <span className="v2-fact-val">
              ahead in <b className="pos">{f.lineup.ahead}</b> of {f.lineup.total} slots · biggest edge <b>{bestName}</b> <span className={f.lineup.best.diff>=0?'up':'down'}>{f.lineup.best.diff>0?'+':''}{f.lineup.best.diff}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- You vs the field (aggregate) ---
function YouVsField({ field }){
  const me = field.snaps.find(s=>s.id===ME_ID);
  const ranked = field.ranked;
  const N = field.snaps.length;
  const myIdx = ranked.findIndex(s=>s.id===ME_ID);
  const above = ranked[myIdx-1], below = ranked[myIdx+1];
  const pulse = useScorePulse(me.total);
  return (
    <div className="v2-agg card">
      <div className="t-label">You vs the field · {PERIOD.label}</div>
      <div className="v2-agg-sec first v2-agg-head">
        <div>
          <div className={'v2-agg-scorenum mono'+(pulse?' score-pulse':'')}>{me.total}<span style={{fontSize:18,fontWeight:700,marginLeft:5}}>pts</span></div>
          <span className="v2-agg-scorelab">points this period</span>
        </div>
        <div className="v2-agg-rank"><b className="mono">{me.rank}</b><span>rank · of {N}</span></div>
      </div>
      <div className="v2-agg-sec v2-agg-recsec">
        <RecordBadge rec={me.rec} total={me.total} />
        <p className="t-caption text-secondary" style={{margin:0}}>Scored against <b>all {N-1}</b> managers at once — this <b>W–L</b> is your record for the period; ties break on points.</p>
      </div>
      <div className="v2-agg-sec">
        <div className="v2-agg-pitchsec">
          <V2Pitch snap={me} className="v2-pitch-hero" />
          <div className="v2-agg-pside">
            <div className="v2-ps"><span className="v2-ps-num mono">{me.ytp}</span><span className="v2-ps-lab">still to come</span></div>
            <div className="v2-ps"><span className="v2-ps-num mono is-live">{me.live}</span><span className="v2-ps-lab">playing now</span></div>
            <div className="v2-ps"><span className="v2-ps-num mono">{me.final}</span><span className="v2-ps-lab">played</span></div>
          </div>
        </div>
        <div style={{marginTop:13}}><V2Legend snap={me} /></div>
      </div>
      <div className="v2-agg-sec last v2-agg-swing">
        {above ? <div className="v2-swing-row">
          <span className="v2-swing-dir">▲ catch</span>
          <Avatar m={mgr(above.id)} size="sm" /><b className="t-sm">{mgr(above.id).short}</b>
          <span className="mono v2-swing-gap">+{above.total-me.total}</span>
        </div> : <div className="v2-swing-row"><span className="t-sm text-secondary">🏆 You lead the field</span></div>}
        {below && <div className="v2-swing-row">
          <span className="v2-swing-dir v2-swing-down">▼ holding off</span>
          <Avatar m={mgr(below.id)} size="sm" /><b className="t-sm">{mgr(below.id).short}</b>
          <span className="mono v2-swing-gap is-down">{below.total-me.total}</span>
        </div>}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- feed ticker ---
function FeedTicker({ feed, freshIds }){
  return (
    <div className="v2-ticker">
      <span className="v2-ticker-lab t-label">Live<span className="v2-livedot" style={{marginLeft:2}}></span></span>
      <div className="v2-ticker-scroll">
        {feed.length===0 && <span className="t-caption text-tertiary">No scoring yet — matches getting underway.</span>}
        {feed.slice(0,10).map(it=>{
          const m = mgr(it.managerId);
          const fresh = freshIds && freshIds.has(it.player.id+'-'+it.min+'-'+it.type);
          return (
            <span key={it.player.id+'-'+it.min+'-'+it.type} className={'v2-tk'+(it.managerId===ME_ID?' is-mine':'')+(fresh?' is-fresh':'')}>
              <span className="v2-tk-type">{it.type==='goal'?'GOAL':it.type==='assist'?'AST':it.type==='cs'?'CS':'YEL'}</span>
              <Flag nat={it.player.nat} /><b>{it.player.last}</b>
              <span className="t-micro" style={{color:m.color,fontWeight:700}}>{m.short}</span>
              <span className={'v2-tk-pts mono '+(it.pts>=0?'is-pos':'is-neg')}>{it.pts>=0?'+':''}{it.pts}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- season table ---
function SeasonTable({ season }){
  return (
    <div className="v2-season">
      <div className="v2-season-note alert alert-info">
        <div><b>Power record.</b> All-play-all every period: your weekly W–L is your result against every other manager that period. Season standings rank by total wins; ties break on total points.</div>
      </div>
      <table className="dtable">
        <thead><tr>
          <th style={{width:36}}>#</th><th>Manager</th>
          <th className="num">Record</th><th className="num">Win%</th><th className="num">Points</th><th>By period</th>
        </tr></thead>
        <tbody>
          {season.map((s,i)=>{
            const m = mgr(s.id); const g = s.W+s.L+s.D;
            return (
              <tr key={s.id} className={m.isMe?'row-me':''}>
                <td className="mono">{i+1}</td>
                <td><div className="v2-st-mgr"><Avatar m={m} size="sm"/><b>{m.isMe?'You':m.name}</b></div></td>
                <td className="num"><b className="mono">{s.W}-{s.L}{s.D?'-'+s.D:''}</b></td>
                <td className="num mono">{g?Math.round(s.W/g*100):0}%</td>
                <td className="num mono">{s.pts}</td>
                <td><div className="v2-st-periods">
                  {s.periods.map((p,pi)=>(
                    <span key={pi} className={'v2-st-chip'+(pi===s.periods.length-1?' is-live':'')}>
                      <span className={'wld wld-'+(p.rec.W>p.rec.L?'W':p.rec.W<p.rec.L?'L':'D')}>{p.rec.W>p.rec.L?'W':p.rec.W<p.rec.L?'L':'D'}</span>
                      <span className="mono t-micro">{p.pts}</span>
                    </span>
                  ))}
                </div></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

Object.assign(window, {
  compareFacts, playerCtx, V2Pitch, V2Legend, PitchHalfLanes,
  RichPlayerRow, TeamPanel, CompareBand, YouVsField, FeedTicker, SeasonTable,
});
