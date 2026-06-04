// dashboard/components.jsx — phase-aware banner + status modules for the home.
// Reuses globals: Avatar, Flag, Pos, RecordBadge, mgr, ME_ID, MANAGERS, useScorePulse,
//   matchScore, fmtMatchClock, seasonTable, myPeriod, myLock, waiverState, fixtures,
//   ACTIVITY, DRAFT, PREDRAFT, PLAYOFF, FINAL, fmtH, N, ROSTER_REQ.
const { useState:useStateDb } = React;

const ACCENT_VAR = { info:'var(--info)', live:'var(--live)', elim:'var(--elim)', win:'var(--win)', accent:'var(--accent)' };

// ---- generic module shell ----
function Module({ title, cta, accent, children, className }){
  return (
    <section className={'db-mod'+(className?' '+className:'')}>
      <header className="db-mod-head">
        <span className="db-mod-title t-label">{title}</span>
        {cta && (cta.href
          ? <a className="db-mod-cta" href={cta.href}>{cta.label}<IcoArrow/></a>
          : <button className="db-mod-cta">{cta.label}<IcoArrow/></button>)}
      </header>
      <div className="db-mod-body">{children}</div>
    </section>
  );
}
const IcoArrow = () => <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
const IcoLk = () => <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.4"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>;

// ============================================================ primary banner ===
function bannerFor(phase, t){
  if (phase==='predraft'){ const d=PREDRAFT;
    return { accent:'info', eyebrow:'Draft day', title:'Your draft starts soon', big:fmtH(d.startInMin), mono:true,
      sub:`Snake order locked · ${N} managers · ${d.rounds} rounds · ${d.perPick}s per pick`,
      cta:{label:'Enter draft room', href:'Draft Room.html'},
      secondary:[{l:'Managers ready', v:`${d.ready}/${N}`},{l:'Format', v:'Snake · 15 rounds'}] };
  }
  if (phase==='draft'){ const d=DRAFT; const oc=mgr(d.onClockId);
    return { accent:'live', eyebrow:'Draft is live', title:`${oc.name} is on the clock`, big:`R${d.round} · Pick ${d.pick}`,
      sub:`Your pick in ${d.untilMineProgressPicks} picks · ${d.pick} of ${d.totalPicks} overall`,
      cta:{label:'Go to draft room', href:'Draft Room.html'},
      secondary:[{l:'Your squad', v:'5 / 15'},{l:'On the clock', v:oc.name}] };
  }
  if (phase==='group'){ const l=myLock(t); const p=myPeriod(t); const next=l.nextKO? fmtH(l.nextKO.ko-t):null;
    return { accent:'live', eyebrow:'Matchday 3 · live', title:l.live>0?`${l.live} playing · ${l.movable} still movable`:'Matchday 3 lineup',
      big:`${p.total} pts`,
      sub: next?`Next lineup lock in ${next} — ${l.movable} player${l.movable!==1?'s':''} still swappable. No auto-subs.`:'All matches under way — your lineup is frozen.',
      cta:{label:'Set lineup', href:'Set Lineup.html'}, cta2:{label:'Watch the field', href:'Vs the Field.html'},
      secondary:[{l:'Power record', v:`${p.rec.W}\u2013${p.rec.L}`},{l:'Rank', v:`${p.rank} / ${N}`}] };
  }
  if (phase==='playoff'){ const d=PLAYOFF; const seed=d.field.findIndex(f=>f.id===ME_ID)+1;
    return { accent:'elim', eyebrow:`Guillotine · Round ${d.round} of ${d.totalRounds}`, title:'You\u2019re alive', big:`${d.alive} left`,
      sub:`${d.cutThisRound} eliminated this round · reduced roster · FAAB reset to $100`,
      cta:{label:'Set playoff lineup', href:'Set Lineup.html'},
      secondary:[{l:'Your seed', v:`#${seed} of ${d.alive}`},{l:'Cut line', v:'lowest scorer'}] };
  }
  const f=FINAL; const champ=mgr(f.championId);
  return { accent:'win', eyebrow:'Season complete', title:`Champion · ${champ.name}`, big:f.myRecap.finishOrdinal,
    sub:`You finished ${f.myRecap.finishOrdinal} of ${N} · power record ${f.myRecap.record} · ${f.myRecap.titlePts} total pts`,
    cta:{label:'View final standings'},
    secondary:[{l:'Best week', v:`${f.myRecap.bestWeek} pts`},{l:'Total points', v:f.myRecap.titlePts}] };
}

function PrimaryBanner({ phase, t, router }){
  const b = bannerFor(phase, t);
  const col = ACCENT_VAR[b.accent];
  return (
    <div className={'db-banner'+(router?' db-banner-router':'')} style={{'--phc':col}}>
      <div className="db-banner-main">
        <span className="db-eyebrow"><span className="db-eyebrow-dot"></span>{b.eyebrow}</span>
        <h2 className="db-banner-title display">{b.title}</h2>
        <p className="db-banner-sub t-body text-secondary">{b.sub}</p>
        <div className="db-banner-cta">
          <a className="btn btn-primary" href={(b.cta&&b.cta.href)||'#'}>{b.cta.label}<IcoArrow/></a>
          {b.cta2 && <a className="btn btn-ghost" href={b.cta2.href}>{b.cta2.label}</a>}
        </div>
      </div>
      <div className="db-banner-side">
        <div className={'db-banner-big'+(b.mono?' mono':' display')}>{b.big}</div>
        <div className="db-banner-secs">
          {b.secondary.map((s,i)=>(<div className="db-bsec" key={i}><span className="t-micro text-tertiary">{s.l}</span><b className="mono">{s.v}</b></div>))}
        </div>
      </div>
    </div>
  );
}

// ============================================================ group modules ===
function RecordModule({ t }){
  const p = myPeriod(t); const tbl = seasonTable(t); const me = tbl.find(r=>r.m.id===ME_ID);
  const pulse = useScorePulse(p.total);
  return (
    <Module title="Your standing" cta={{label:'Standings', href:'Vs the Field.html'}}>
      <div className="db-record">
        <div className="db-rec-season">
          <div className="db-rec-wl mono">{me.W}<span className="db-rec-dash">–</span>{me.L}{me.D>0&&<span className="db-rec-d">–{me.D}</span>}</div>
          <span className="t-micro text-tertiary">Season power record</span>
        </div>
        <div className="db-rec-split">
          <div className="db-rec-stat"><b className={'display'+(pulse?' score-pulse':'')}>{me.total}</b><span className="t-micro text-tertiary">total pts</span></div>
          <div className="db-rec-stat"><b className="display">#{me.rank}</b><span className="t-micro text-tertiary">of {N}</span></div>
        </div>
      </div>
      <div className="db-rec-prov">
        <span className="t-caption text-secondary">This period, provisionally</span>
        <span className="db-rec-provrec"><b style={{color:'var(--win)'}}>{p.rec.W}</b>–<b style={{color:'var(--loss)'}}>{p.rec.L}</b> <span className="text-tertiary">· beating {p.rec.W} of {N-1}</span></span>
      </div>
    </Module>
  );
}

function LockModule({ t }){
  const l = myLock(t); const next = l.nextKO? l.nextKO.ko - t : null; const urgent = next!=null && next<=10;
  const allLocked = l.movable===0 && l.benchMovable===0;
  return (
    <Module title="This matchday · lock-on-play" cta={{label:'Set lineup', href:'Set Lineup.html'}}>
      <div className="db-lock">
        <div className="db-lock-stat"><b className="display">{l.movable}</b><span className="t-micro text-tertiary"><IcoLk/>movable</span></div>
        <div className="db-lock-stat"><b className="display" style={{color:'var(--live)'}}>{l.live}</b><span className="t-micro text-tertiary">playing</span></div>
        <div className="db-lock-stat"><b className="display" style={{color:'var(--node-played,#6E86B4)'}}>{l.played}</b><span className="t-micro text-tertiary">played</span></div>
      </div>
      <div className={'db-lock-dl'+(urgent?' is-urgent':'')}>
        {allLocked ? <span><IcoLk/> All matches under way — frozen</span>
          : <span>Next lock in <b className="mono">{fmtH(next)}</b> · {l.movable} still swappable</span>}
      </div>
    </Module>
  );
}

function WaiverModule(){
  const w = waiverState(); const pct = Math.round(w.left/w.budget*100);
  return (
    <Module title="Waivers · FAAB" cta={{label:'Open waivers'}}>
      <div className="db-faab">
        <div className="db-faab-row"><b className="display mono">${w.left}</b><span className="t-micro text-tertiary">of ${w.budget} left</span></div>
        <div className={'meter'+(pct<=25?' is-low':'')}><span style={{width:pct+'%'}}></span></div>
      </div>
      <div className="db-faab-meta">
        <span><span className="text-tertiary">Pending</span> <b>{w.pending} bid · ${w.pendingTotal}</b></span>
        <span><span className="text-tertiary">Next batch</span> <b className="mono">{fmtH(w.batchInMin)}</b></span>
        <span><span className="text-tertiary">Priority</span> <b>#{w.rolling}</b></span>
      </div>
    </Module>
  );
}

function StandingsModule({ t }){
  const tbl = seasonTable(t);
  const meRank = tbl.find(r=>r.m.id===ME_ID).rank;
  const show = tbl.slice(0,4);
  const meIn = show.some(r=>r.m.id===ME_ID);
  const rows = meIn ? show : [...tbl.slice(0,3), tbl.find(r=>r.m.id===ME_ID)];
  return (
    <Module title="League standings" cta={{label:'Full table', href:'Vs the Field.html'}}>
      <div className="db-stand">
        {rows.map(r=>(
          <div className={'db-stand-row'+(r.m.id===ME_ID?' is-me':'')} key={r.m.id}>
            <span className="db-stand-rank mono">{r.rank}</span>
            <Avatar m={r.m} size="sm"/>
            <span className="db-stand-name">{r.m.id===ME_ID?'You':r.m.name}</span>
            <span className="db-stand-wl mono">{r.W}–{r.L}</span>
            <span className="db-stand-pts mono">{r.total}</span>
          </div>
        ))}
      </div>
    </Module>
  );
}

function FixturesModule({ t }){
  const fx = fixtures(t);
  return (
    <Module title="Today's matches" cta={{label:'Live', href:'Vs the Field.html'}}>
      <div className="db-fix">
        {fx.map(({m,sc,phase,min})=>(
          <div className="db-fix-row" key={m.id}>
            <span className="db-fix-team"><Flag nat={m.home}/><b>{m.home}</b></span>
            <span className="db-fix-score mono">{phase==='ytp'?'vs':`${sc.h}\u2013${sc.a}`}</span>
            <span className="db-fix-team"><b>{m.away}</b><Flag nat={m.away}/></span>
            <span className={'db-fix-clk mono '+(phase==='live'?'is-live':phase==='final'?'is-final':'is-ytp')}>{phase==='live'&&<span className="db-livedot"></span>}{phase==='ytp'?'KO':phase==='final'?'FT':min+"\u2032"}</span>
          </div>
        ))}
      </div>
    </Module>
  );
}

const ACT_IC = { score:'⚽', waiver:'$', lineup:'▦', trade:'⇄' };
function ActivityModule(){
  return (
    <Module title="Recent activity">
      <div className="db-act">
        {ACTIVITY.map((a,i)=>{ const m=mgr(a.who);
          return (
            <div className={'db-act-row'+(a.who===ME_ID?' is-me':'')} key={i}>
              <span className="db-act-ic" style={{color:a.who===ME_ID?'var(--accent)':'var(--text-tertiary)'}}>{ACT_IC[a.kind]}</span>
              <span className="db-act-txt">{a.txt}<span className="db-act-meta text-tertiary"> · {a.meta}</span></span>
              <span className="db-act-t mono text-tertiary">{a.t}</span>
            </div>
          );
        })}
      </div>
    </Module>
  );
}

// ============================================================ draft modules ===
function DraftFormingModule(){
  const c = DRAFT.myCounts; const req = window.ROSTER_REQ || {GK:2,DEF:5,MID:5,FWD:3};
  return (
    <Module title="Your squad forming" cta={{label:'Draft room', href:'Draft Room.html'}}>
      <div className="db-forming">
        {['GK','DEF','MID','FWD'].map(pos=>(
          <div className="db-forming-cell" key={pos}>
            <Pos p={pos}/>
            <span className="mono"><b>{c[pos]||0}</b><span className="text-tertiary">/{req[pos]}</span></span>
          </div>
        ))}
      </div>
      <div className="db-forming-note t-caption text-tertiary">5 of 15 drafted · need 2 GK / 5 DEF / 5 MID / 3 FWD</div>
    </Module>
  );
}
function RecentPicksModule(){
  return (
    <Module title="Recent picks">
      <div className="db-picks">
        {DRAFT.recent.map(p=>(
          <div className={'db-pick-row'+(p.mid===ME_ID?' is-me':'')} key={p.pickNo}>
            <span className="db-pick-no mono">#{p.pickNo}</span>
            <Flag nat={p.nat}/><Pos p={p.pos}/>
            <span className="db-pick-player">{p.player}</span>
            <span className="db-pick-by t-caption" style={{color:mgr(p.mid).color}}>{p.mid===ME_ID?'You':mgr(p.mid).name}</span>
          </div>
        ))}
      </div>
    </Module>
  );
}

// ============================================================ playoff module ===
function BracketModule(){
  const d = PLAYOFF;
  return (
    <Module title={`Guillotine · round ${d.round} survival`} cta={{label:'Playoff lineup', href:'Set Lineup.html'}}>
      <div className="db-bracket">
        {d.field.map((f,i)=>{ const m=mgr(f.id);
          return (
            <div className={'db-br-row'+(f.id===ME_ID?' is-me':'')+(f.safe?'':' is-risk')} key={f.id}>
              <span className="db-br-seed mono">{i+1}</span>
              <Avatar m={m} size="sm"/>
              <span className="db-br-name">{f.id===ME_ID?'You':m.name}</span>
              <span className="db-br-pts mono">{f.pts}</span>
              {!f.safe && <span className="db-br-tag pill pill-elim">cut line</span>}
            </div>
          );
        })}
        <div className="db-br-foot t-caption text-tertiary">{d.eliminated.length} eliminated · {d.cutThisRound} more cut this round · lowest scorer goes</div>
      </div>
    </Module>
  );
}

// ============================================================ complete modules ===
function RecapModule(){
  const f = FINAL;
  const medal = ['🥇','🥈','🥉'];
  return (
    <Module title="Final podium">
      <div className="db-podium">
        {f.podium.map((p,i)=>{ const m=mgr(p.id);
          return (
            <div className={'db-pod-row'+(p.id===ME_ID?' is-me':'')+(i===0?' is-champ':'')} key={p.id}>
              <span className="db-pod-medal">{medal[i]}</span>
              <Avatar m={m} size="sm"/>
              <span className="db-pod-name">{p.id===ME_ID?'You':m.name}</span>
              <span className="db-pod-pts mono">{p.pts}</span>
            </div>
          );
        })}
      </div>
    </Module>
  );
}
function MyRecapModule(){
  const r = FINAL.myRecap;
  return (
    <Module title="Your season">
      <div className="db-myrecap">
        <div className="db-myrec-stat"><b className="display">{r.finishOrdinal}</b><span className="t-micro text-tertiary">finish</span></div>
        <div className="db-myrec-stat"><b className="display mono">{r.record}</b><span className="t-micro text-tertiary">power record</span></div>
        <div className="db-myrec-stat"><b className="display mono">{r.titlePts}</b><span className="t-micro text-tertiary">total pts</span></div>
        <div className="db-myrec-stat"><b className="display mono">{r.bestWeek}</b><span className="t-micro text-tertiary">best week</span></div>
      </div>
    </Module>
  );
}

// pre-draft info
function LeagueInfoModule(){
  const d = PREDRAFT;
  return (
    <Module title="League & format" cta={{label:'Draft room', href:'Draft Room.html'}}>
      <div className="db-info">
        <div className="db-info-row"><span className="text-tertiary">Managers</span><b>{N}</b></div>
        <div className="db-info-row"><span className="text-tertiary">Draft</span><b>Snake · {d.rounds} rounds · 180 picks</b></div>
        <div className="db-info-row"><span className="text-tertiary">Clock</span><b>{d.perPick}s per pick · server-synced</b></div>
        <div className="db-info-row"><span className="text-tertiary">Squad</span><b>2 GK / 5 DEF / 5 MID / 3 FWD</b></div>
        <div className="db-info-row"><span className="text-tertiary">Scoring</span><b>All-play-all power record</b></div>
      </div>
    </Module>
  );
}
function ReadinessModule(){
  const ready = PREDRAFT.ready;
  return (
    <Module title={`Managers ready · ${ready}/${N}`}>
      <div className="db-ready">
        {MANAGERS.map(m=>{ const isReady = m.id===ME_ID || m.online;
          return (
            <div className="db-ready-chip" key={m.id} title={m.name}>
              <Avatar m={m} size="sm"/>
              <span className="db-ready-name">{m.id===ME_ID?'You':m.name}</span>
              <span className={'db-ready-dot'+(isReady?' is-ready':'')}></span>
            </div>
          );
        })}
      </div>
    </Module>
  );
}

Object.assign(window, {
  Module, PrimaryBanner, bannerFor,
  RecordModule, LockModule, WaiverModule, StandingsModule, FixturesModule, ActivityModule,
  DraftFormingModule, RecentPicksModule, BracketModule, RecapModule, MyRecapModule,
  LeagueInfoModule, ReadinessModule,
});
