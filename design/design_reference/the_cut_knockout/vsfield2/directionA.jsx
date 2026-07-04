// vsfield2/directionA.jsx — DIRECTION A (chosen): "Split cockpit", refined.
// LEFT: a prominent live LEADERBOARD (rank · manager · points · your H2H margin) — pick who to face.
// MAIN: a 3-fact compare band, then BOTH XIs as Set-Lineup-style vertical formation pitches side by
// side — flag-kit jerseys, names, score lines, lock-on-play via kit brightness. Tap any player for
// the floating points breakdown. The aggregate "You vs field" is the pinned leaderboard header.
// Exports DirectionA to window.
const { useState:useSA } = React;

// ---- flag-kit jerseys for the 8 nations in play (Set Lineup vocabulary, no background-size:cover) ----
const _vtA=(a,b,c)=>`linear-gradient(90deg,${a} 0 33.33%,${b} 33.33% 66.66%,${c} 66.66%)`;
const _htA=(a,b,c)=>`linear-gradient(180deg,${a} 0 33.33%,${b} 33.33% 66.66%,${c} 66.66%)`;
const _vbA=(a,b)=>`linear-gradient(90deg,${a} 0 50%,${b} 50%)`;
const _dotA=(c,x,y,r)=>`radial-gradient(circle at ${x}% ${y}%,${c} 0 ${r}%,transparent ${r+0.6}%)`;
const _crossA=(field,cross,t=20)=>`linear-gradient(${cross},${cross}) 50% 0/${t}% 100% no-repeat,linear-gradient(${cross},${cross}) 0 50%/100% ${t}% no-repeat,${field}`;
const JERSEY_BG_V2 = {
  ARG:`${_dotA('#F4B32E',50,50,7)}, ${_htA('#75AADB','#fff','#75AADB')}`,
  MEX:_vtA('#006847','#fff','#CE1126'),
  FRA:_vtA('#0055A4','#fff','#EF4135'),
  ENG:_crossA('#fff','#CF142B',22),
  CRO:_htA('#FF0000','#fff','#171796'),
  USA:'linear-gradient(#3C3B6E,#3C3B6E) top left/44% 54% no-repeat, repeating-linear-gradient(180deg,#B22234 0 7.7%, #fff 7.7% 15.4%)',
  BRA:`${_dotA('#002776',50,50,12)}, ${_dotA('#FFDF00',50,50,32)}, #009C3B`,
  POR:`${_dotA('#FFE400',50,50,7)}, ${_vbA('#006600','#FF0000')}`,
};
const kitOf = nat => JERSEY_BG_V2[nat] || (NATIONS[nat]||{}).f || 'var(--surface-4)';

// ============================================================ leaderboard ===
function LbRow({ snap, myTotal, selected, onSelect, dimLive, block }){
  const m = mgr(snap.id);
  const d = myTotal - snap.total;
  const k = d>0?'W':d<0?'L':'D';
  const pulse = useScorePulse(snap.total);
  return (
    <button className={'da-lb-row'+(m.isMe?' is-me':'')+(selected?' is-sel':'')+(block?' is-block':'')} onClick={()=>onSelect(snap.id)}>
      <span className="da-lb-rk mono">{snap.rank}</span>
      <Avatar m={m} size="sm" ring={m.isMe} />
      <span className="da-lb-name">
        <b>{m.isMe?'You':m.short}</b>
        <span className="da-lb-sub">
          {block
            ? <em className="ko-blocksub"><MacheteMini/> on the block</em>
            : snap.live>0
            ? <em className={'da-lb-live'+(dimLive?' is-dim':'')}><span className="vf-livedot"></span>{snap.live} live · {snap.ytp} left</em>
            : <>{snap.ytp} to play</>}
        </span>
      </span>
      <span className="da-lb-right">
        <span className={'da-lb-pts mono'+(pulse?' score-pulse':'')}>{snap.total}</span>
        {m.isMe ? <span className="da-lb-wld-self">you</span> : <span className={'da-lb-wld '+k}>{k}{d>0?' +'+d:d<0?' '+d:''}</span>}
      </span>
    </button>
  );
}
function Leaderboard({ field, effSel, onSelect, dimLive, ko }){
  const me = field.snaps.find(s=>s.id===ME_ID);
  const list = ko ? ko.alive : field.ranked;
  return (
    <div className="da-lb">
      {ko && <KOYouBand ko={ko} />}
      {!ko && <button className={'da-lb-fieldbtn'+(effSel==='field'?' is-sel':'')} onClick={()=>onSelect('field')} title="You vs the whole field">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
        <span><b>You vs the field</b><span>record {me.rec.W}–{me.rec.L} · rank {me.rank}</span></span>
      </button>}
      <div className="da-lb-head"><span className="t-label">{ko?'The ladder':'Standings'}</span><span className="t-micro text-tertiary">live · pts</span></div>
      {list.map((s,i) => (
        <React.Fragment key={s.id}>
          {ko && i===ko.cutIndex && <KOCutLine ko={ko} />}
          <LbRow snap={s} myTotal={me.total} selected={effSel===s.id} onSelect={onSelect} dimLive={dimLive} block={!!ko && i>=ko.cutIndex} />
        </React.Fragment>
      ))}
      {ko && <KOFallen ko={ko} onSelect={onSelect} />}
    </div>
  );
}

// ============================================================ XI pitch (Set Lineup style) ===
function XIToken({ r, onScore, dimLive }){
  const sCls = r.status==='live' ? 's-live' : r.status==='final' ? 's-played' : 's-movable';
  return (
    <button className={'sl-tok sl-tok-jersey '+sCls+(dimLive?' is-dim':'')} onClick={()=>onScore(r.p)}
      title={r.p.first[0]+'. '+r.p.last+' · tap for points'}>
      <span className="sl-jersey" style={{ background:kitOf(r.p.nat) }}></span>
      <span className="sl-tok-name">{r.p.first[0]}. {r.p.last}</span>
      {r.status==='ytp'
        ? <span className="sl-tok-score s-ytp"><span className="sl-pts-dash">–</span><span className="sl-pts-u">to play</span></span>
        : <span className={'sl-tok-score s-'+r.status+(r.pts===0?' is-zero':'')}>
            {r.status==='live' && !dimLive && <span className="sl-score-dot"></span>}<b>{r.pts}</b><span className="sl-pts-u">pts</span>
          </span>}
    </button>
  );
}
function XIPitch({ snap, onScore, dimLive, mob }){
  const byPos = { GK:[], DEF:[], MID:[], FWD:[] };
  snap.rows.forEach(r => byPos[r.p.pos].push(r));
  const order = ['FWD','MID','DEF','GK'];
  return (
    <div className={'da-pitch'+(mob?' da-pitch-mob':'')}>
      <div className="da-pl" aria-hidden="true">
        <span className="da-pl-box da-pl-box-top"></span>
        <span className="da-pl-mid"></span>
        <span className="da-pl-circle"></span>
        <span className="da-pl-box da-pl-box-bot"></span>
      </div>
      <div className="da-pitch-lanes">
        {order.map(pos => byPos[pos].length>0 && (
          <div className={'da-lane da-lane-'+pos} key={pos}>
            {byPos[pos].map(r => <XIToken key={r.p.id} r={r} onScore={onScore} dimLive={dimLive} />)}
          </div>
        ))}
      </div>
    </div>
  );
}
function XIPanel({ snap, isMe, onScore, dimLive }){
  const m = mgr(snap.id);
  const pulse = useScorePulse(snap.total);
  return (
    <div className={'da-xi'+(isMe?' is-me':'')}>
      <div className="da-xi-hd">
        <Avatar m={m} size="sm" ring={isMe} />
        <b>{isMe?'You':m.name}</b>
        <span className="da-team-form">{m.formation}</span>
        <span className={'da-team-tot mono'+(pulse?' score-pulse':'')}>{snap.total}</span>
      </div>
      <XIPitch snap={snap} onScore={(p)=>onScore(p, snap.id)} dimLive={dimLive} />
    </div>
  );
}

// ============================================================ body ===
function DirectionA({ field, t, conn, effSel, setSelected, ko }){
  const me = field.snaps.find(s=>s.id===ME_ID);
  const dimLive = conn!=='live';
  const opp = effSel!=='field' ? field.snaps.find(s=>s.id===effSel) : null;
  const [scored, setScored] = useSA(null);
  const onScore = (p, managerId)=> setScored({ p, managerId });
  return (
    <div className="da-body">
      <Leaderboard field={field} effSel={effSel} onSelect={setSelected} dimLive={dimLive} ko={ko} />
      <div className="da-main">
        <div className="da-scroll">
          {effSel==='field'
            ? <YouVsField field={field} />
            : <>
                <CompareBand me={me} opp={opp} t={t} />
                <div className="da-teams2">
                  <XIPanel snap={me} isMe onScore={onScore} dimLive={dimLive} />
                  <XIPanel snap={opp} onScore={onScore} dimLive={dimLive} />
                </div>
                <p className="t-caption text-tertiary" style={{textAlign:'center',margin:'2px 0 0'}}>Tap any player for the categories &amp; stats behind their points · kit brightness shows lock-on-play · values illustrative pending SCORING.md</p>
              </>}
        </div>
      </div>
      {scored && <PlayerScoreSheet p={scored.p} managerId={scored.managerId} t={t} onClose={()=>setScored(null)} />}
    </div>
  );
}

window.DirectionA = DirectionA;
Object.assign(window, { XIPitch, kitOf, JERSEY_BG_V2 });
