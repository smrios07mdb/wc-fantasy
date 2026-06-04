// draft/app.jsx — live snake draft room (interactive prototype)
const { useState, useEffect, useRef, useMemo, useCallback } = React;
const N = MANAGERS.length;
const TOTAL = N * ROUNDS;
const mgr = id => MANAGERS.find(m => m.id === id);

// ---------- small presentational atoms ----------
function Flag({ nat, lg }) {
  return <span className={'flag' + (lg ? ' flag-lg' : '')} style={flagStyle(nat)} title={(NATIONS[nat]||{}).n}></span>;
}
function Pos({ p }) { return <span className={'pos pos-' + p}>{p}</span>; }
function Avatar({ m, size = 'md', ring }) {
  return <span className={`avatar avatar-${size}${ring ? ' presence-ring' : ''}`} style={{ background: m.color, color: '#fff' }}>{m.init}
    {!ring && <span className={'presence-dot' + (m.online ? ' is-online' : '')}></span>}
  </span>;
}
const LockIco = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>;
const ClockIco = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;

// snake helpers
function managerAt(overall) { const r = Math.floor(overall / N); const c = overall % N; const col = r % 2 === 0 ? c : (N - 1 - c); return MANAGERS[col].id; }
function overallAt(round, col) { return round % 2 === 0 ? round * N + col : round * N + (N - 1 - col); }

// roster need: which positions a manager still needs (under max)
function rosterCounts(picks, id) {
  const c = { GK:0, DEF:0, MID:0, FWD:0 };
  picks.forEach(p => { if (p.managerId === id) c[p.player.pos]++; });
  return c;
}
function pickForManager(id, picks, available, queue) {
  // 1) from queue (user only meaningfully), first still-available that fits need
  const counts = rosterCounts(picks, id);
  const needs = pos => counts[pos] < POS_REQ[pos];
  if (id === ME_ID) {
    for (const pid of queue) { const pl = available.find(a => a.id === pid); if (pl && needs(pl.pos)) return pl; }
    for (const pid of queue) { const pl = available.find(a => a.id === pid); if (pl) return pl; }
  }
  // 2) best available that fills a still-needed position
  const fit = available.find(a => needs(a.pos));
  return fit || available[0];
}

// ---------- main ----------
function DraftRoom() {
  const [phase, setPhase] = useState('lobby');     // lobby | live | complete
  const [picks, setPicks] = useState([]);
  const [clock, setClock] = useState(PICK_SECONDS);
  const [paused, setPaused] = useState(false);
  const [queue, setQueue] = useState(['p0','p8','p18','p26']); // my pre-ranked queue (ids)
  const [tab, setTab] = useState('available');
  const [pos, setPos] = useState('ALL');
  const [q, setQ] = useState('');
  const [toasts, setToasts] = useState([]);
  const [mobilePanel, setMobilePanel] = useState('available');
  const [showBoardMobile, setShowBoardMobile] = useState(false);
  const boardEndRef = useRef(null);

  const draftedIds = useMemo(() => new Set(picks.map(p => p.player.id)), [picks]);
  const available = useMemo(() => POOL.filter(p => !draftedIds.has(p.id)), [draftedIds]);
  const currentOverall = picks.length;
  const currentId = currentOverall < TOTAL ? managerAt(currentOverall) : null;
  const isMyTurn = currentId === ME_ID && phase === 'live';
  const round = Math.floor(currentOverall / N);

  const toast = useCallback((kind, title, sub) => {
    const id = Math.random();
    setToasts(t => [...t, { id, kind, title, sub }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4200);
  }, []);

  // core pick
  const makePick = useCallback((player, viaAuto) => {
    setPicks(prev => {
      if (prev.length >= TOTAL) return prev;
      const id = managerAt(prev.length);
      const r = Math.floor(prev.length / N);
      const np = [...prev, { overall: prev.length, round: r, managerId: id, player, auto: !!viaAuto }];
      if (id === ME_ID) setQueue(qq => qq.filter(x => x !== player.id));
      const m = mgr(id);
      if (id === ME_ID) toast('success', `You drafted ${player.first} ${player.last}`, `${player.pos} · ${(NATIONS[player.nat]||{}).n} · R${r+1}`);
      else if (viaAuto) toast('warn', `Autopick — ${m.name} took ${player.last}`, `Clock expired · R${r+1}.${(prev.length%N)+1}`);
      if (np.length >= TOTAL) setPhase('complete');
      return np;
    });
  }, [toast]);

  // reset clock each new turn
  useEffect(() => { if (phase === 'live') setClock(PICK_SECONDS); }, [currentOverall, phase]);

  // 1s tick
  useEffect(() => {
    if (phase !== 'live' || paused || currentOverall >= TOTAL) return;
    const t = setInterval(() => setClock(c => c - 1), 1000);
    return () => clearInterval(t);
  }, [phase, paused, currentOverall]);

  // clock expiry → autopick current manager
  useEffect(() => {
    if (phase !== 'live' || clock > 0 || currentOverall >= TOTAL) return;
    const pl = pickForManager(currentId, picks, available, queue);
    if (pl) makePick(pl, true);
  }, [clock]);

  // bots pick quickly (keep the room lively)
  useEffect(() => {
    if (phase !== 'live' || paused || currentOverall >= TOTAL) return;
    if (currentId === ME_ID) return; // my turn → wait for me / clock
    const delay = 900 + Math.random() * 1500;
    const t = setTimeout(() => {
      const pl = pickForManager(currentId, picks, available, queue);
      if (pl) makePick(pl, false);
    }, delay);
    return () => clearTimeout(t);
  }, [currentOverall, phase, paused]);

  // autoscroll board to current pick
  useEffect(() => { if (boardEndRef.current) boardEndRef.current.scrollIntoViewIfNeeded?.(); }, [currentOverall]);

  const startDraft = () => { setPhase('live'); toast('info', 'Draft is live', 'Snake order · 60s per pick'); };
  const simToEnd = () => {
    setPicks(prev => {
      let np = [...prev];
      let avail = POOL.filter(p => !new Set(np.map(x => x.player.id)).has(p.id));
      while (np.length < TOTAL) {
        const id = managerAt(np.length);
        const pl = pickForManager(id, np, avail, queue);
        if (!pl) break;
        np.push({ overall: np.length, round: Math.floor(np.length / N), managerId: id, player: pl, auto: true });
        avail = avail.filter(a => a.id !== pl.id);
      }
      return np;
    });
    setPhase('complete');
  };
  const restart = () => { setPicks([]); setPhase('lobby'); setClock(PICK_SECONDS); setQueue(['p0','p8','p18','p26']); };

  const myCounts = rosterCounts(picks, ME_ID);
  const recent = picks.slice(-12).reverse();

  return (
    <div className={'dr' + (showBoardMobile ? ' show-board' : '')}>
      <TopBar phase={phase} round={round} currentOverall={currentOverall}
        paused={paused} setPaused={setPaused} onSim={simToEnd} onRestart={restart} onStart={startDraft} />

      {phase !== 'lobby' && <ClockBar phase={phase} clock={clock} currentId={currentId} isMyTurn={isMyTurn}
        round={round} currentOverall={currentOverall}
        topQueued={queue.map(id => available.find(a => a.id === id)).filter(Boolean)[0]} />}

      {phase === 'live' && <Ticker recent={recent} />}

      {phase === 'lobby' && <Lobby onStart={startDraft} onSim={simToEnd} />}
      {phase === 'complete' && <Summary picks={picks} />}

      {phase === 'live' && <>
        <div className="dr-mtabs">
          {['board','available','queue','roster'].map(t => (
            <button key={t} className={'tab' + ((t==='board'?showBoardMobile:(!showBoardMobile && mobilePanel===t))?' is-active':'')}
              onClick={() => { if(t==='board'){ setShowBoardMobile(true); } else { setShowBoardMobile(false); setMobilePanel(t); setTab(t); } }}>
              {t==='queue'?`Queue (${queue.length})`:t[0].toUpperCase()+t.slice(1)}
            </button>
          ))}
        </div>
        <div className="dr-body">
          <div className="dr-boardwrap">
            <Board picks={picks} currentOverall={currentOverall} currentId={currentId} boardEndRef={boardEndRef} />
          </div>
          <div className="dr-rail">
            <Rail tab={tab} setTab={setTab} mobilePanel={mobilePanel}
              available={available} q={q} setQ={setQ} pos={pos} setPos={setPos}
              queue={queue} setQueue={setQueue} picks={picks} myCounts={myCounts}
              isMyTurn={isMyTurn} draftedIds={draftedIds}
              onDraft={(pl) => makePick(pl, false)} toast={toast} />
          </div>
        </div>
      </>}

      <div style={{ position:'fixed', right:16, bottom:16, display:'flex', flexDirection:'column', gap:8, zIndex:80, maxWidth:380 }}>
        {toasts.map(t => (
          <div key={t.id} className={'toast toast-' + (t.kind==='warn'?'warn':t.kind==='success'?'success':'info')}>
            <span className="ic">{t.kind==='success'?'✓':t.kind==='warn'?'⏱':'•'}</span>
            <div><b className="t-sm">{t.title}</b><div className="t-caption text-tertiary">{t.sub}</div></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- top bar ----------
function TopBar({ phase, round, currentOverall, paused, setPaused, onSim, onRestart, onStart }) {
  return (
    <div className="dr-top">
      <div className="dr-brand">
        <div className="dr-logo">W</div>
        <div>
          <div className="display" style={{ fontWeight:800, fontSize:15, lineHeight:1 }}>Group A — Snake Draft</div>
          <div className="t-micro text-tertiary" style={{ letterSpacing:'.08em' }}>
            {phase==='lobby' ? 'PRE-DRAFT LOBBY' : phase==='complete' ? 'DRAFT COMPLETE' : `ROUND ${round+1} · PICK ${currentOverall+1} OF ${TOTAL}`}
          </div>
        </div>
      </div>
      <span className="pill" style={{ background:'var(--success-soft)', color:'var(--success)' }}><span className="dot"></span>Synced</span>
      <div style={{ flex:1 }}></div>
      <div className="dr-presence" title="Online managers">
        {MANAGERS.filter(m=>m.online).slice(0,8).map(m => <Avatar key={m.id} m={m} size="sm" />)}
        <span className="t-caption text-tertiary" style={{ marginLeft:10 }}>{MANAGERS.filter(m=>m.online).length}/{N} online</span>
      </div>
      <div className="dr-sim">
        {phase==='lobby' && <button className="btn btn-primary btn-sm" onClick={onStart}>Start draft</button>}
        {phase==='live' && <button className="btn btn-sm" onClick={()=>setPaused(p=>!p)}>{paused?'Resume':'Pause'}</button>}
        {phase!=='complete' && <button className="btn btn-ghost btn-sm" onClick={onSim} title="Fast-forward (demo)">Sim to end</button>}
        {(phase==='complete'||phase==='live') && <button className="btn btn-quiet btn-sm" onClick={onRestart}>Restart</button>}
      </div>
    </div>
  );
}

// ---------- clock bar ----------
function ClockBar({ phase, clock, currentId, isMyTurn, round, currentOverall, topQueued }) {
  if (phase === 'complete') return null;
  const m = mgr(currentId);
  const urgent = clock <= 10 && !isMyTurn ? false : clock <= 10;
  const mm = String(Math.max(0,Math.floor(clock/60))).padStart(2,'0');
  const ss = String(Math.max(0,clock%60)).padStart(2,'0');
  return (
    <div className={'dr-clockbar' + (isMyTurn?' is-mine':'') + (clock<=10?' is-urgent':'')}>
      <div className="dr-onclock">
        {isMyTurn ? <Avatar m={m} size="md" ring /> : <Avatar m={m} size="md" />}
        <div>
          <div className="t-h3" style={{ fontWeight:700 }}>{isMyTurn ? "You're on the clock" : `${m.name} is on the clock`}</div>
          <div className="t-caption text-tertiary">Pick {currentOverall+1} · Round {round+1} · {round%2===0?'→ forward':'← snake back'}</div>
        </div>
      </div>
      <div style={{ flex:1 }}></div>
      {isMyTurn && topQueued && <div className="t-caption text-secondary" style={{ textAlign:'right', maxWidth:220 }}>
        Idle &rarr; autopick <b style={{color:'var(--text-primary)'}}>{topQueued.last}</b> (top of queue)</div>}
      <div className={'dr-clk' + (clock<=10?' is-urgent':'') } style={{ color: clock<=10?'var(--live)':(isMyTurn?'var(--accent)':'var(--text-primary)') }}>{mm}:{ss}</div>
      <ServerSync />
    </div>
  );
}
function ServerSync() {
  return <span className="t-micro text-tertiary" style={{ display:'flex', alignItems:'center', gap:5 }} title="Deadline is server-authoritative">
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5"/></svg>server time</span>;
}

// ---------- recent ticker ----------
function Ticker({ recent }) {
  if (!recent.length) return <div className="dr-ticker"><span className="t-caption text-tertiary">No picks yet — waiting for the first selection…</span></div>;
  return (
    <div className="dr-ticker">
      <span className="t-label" style={{ alignSelf:'center', marginRight:4 }}>Recent</span>
      {recent.map(p => { const m = mgr(p.managerId); return (
        <div className="dr-tick" key={p.overall}>
          <span className="mono t-micro text-tertiary">{p.round+1}.{(p.overall%N)+1}</span>
          <Flag nat={p.player.nat} /><Pos p={p.player.pos} />
          <b className="t-sm">{p.player.last}</b>
          <span className="t-caption text-tertiary">→ {m.name}{p.auto && ' (auto)'}</span>
        </div>
      ); })}
    </div>
  );
}

// ---------- board ----------
function Board({ picks, currentOverall, currentId, boardEndRef }) {
  const cols = `60px repeat(${N}, minmax(108px,1fr))`;
  return (
    <div className="dr-board" style={{ gridTemplateColumns: cols, minWidth: 60 + N*110 }}>
      <div></div>
      {MANAGERS.map(m => (
        <div key={m.id} className={'dr-colhead' + (m.id===currentId?' is-current':'') + (m.isMe?' is-me':'')}>
          <Avatar m={m} size="sm" />
          <span className="t-micro" style={{ fontWeight:700, whiteSpace:'nowrap' }}>{m.isMe?'You':m.name}</span>
        </div>
      ))}
      {Array.from({ length: ROUNDS }).map((_, r) => (
        <React.Fragment key={r}>
          <div className="dr-rlabel"><div style={{ textAlign:'right' }}>R{r+1}<div className="dr-snake">{r%2===0?'→':'←'}</div></div></div>
          {MANAGERS.map((m, c) => {
            const ov = overallAt(r, c);
            const pick = picks[ov];
            const isCurrent = ov === currentOverall;
            return (
              <div key={c} ref={isCurrent ? boardEndRef : null}
                className={'dr-cell' + (pick?(' tint-'+pick.player.pos):' is-empty') + (isCurrent?' is-current':'')}>
                {pick ? <>
                  <div className="cell-top"><Pos p={pick.player.pos} /><Flag nat={pick.player.nat} /><span className="pk">{ov+1}</span></div>
                  <b className="cell-name">{pick.player.first[0]}. {pick.player.last}</b>
                </> : <>
                  <div className="cell-top"><span className="pk" style={{ marginLeft:0 }}>{ov+1}</span></div>
                  {isCurrent ? <b className="cell-name" style={{ color:'var(--accent)' }}>On the clock…</b>
                    : <span className="t-caption text-tertiary">—</span>}
                </>}
              </div>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
}

// ---------- rail ----------
function Rail(props) {
  const { tab, setTab, mobilePanel } = props;
  const active = (window.innerWidth <= 960) ? mobilePanel : tab;
  return (
    <>
      <div className="dr-railhead">
        <div className="tabs" style={{ display:'flex', width:'100%' }}>
          {['available','queue','roster'].map(t => (
            <button key={t} className={'tab' + (active===t?' is-active':'')} style={{ flex:1 }}
              onClick={() => setTab(t)}>
              {t==='available'?'Available':t==='queue'?`Queue (${props.queue.length})`:'My roster'}
            </button>
          ))}
        </div>
      </div>
      <div className="dr-railscroll">
        {active==='available' && <AvailableList {...props} />}
        {active==='queue' && <QueueList {...props} />}
        {active==='roster' && <RosterPanel {...props} />}
      </div>
    </>
  );
}

function AvailableList({ available, q, setQ, pos, setPos, queue, setQueue, isMyTurn, onDraft }) {
  const filtered = available.filter(p =>
    (pos==='ALL' || p.pos===pos) &&
    (!q || (p.first+' '+p.last).toLowerCase().includes(q.toLowerCase()) || (NATIONS[p.nat]||{}).n.toLowerCase().includes(q.toLowerCase()))
  ).slice(0, 60);
  const inQ = id => queue.includes(id);
  return (
    <>
      <div className="dr-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3-3"/></svg>
        <input className="input" placeholder="Search players or nations…" value={q} onChange={e=>setQ(e.target.value)} />
      </div>
      <div className="dr-filters">
        {['ALL','GK','DEF','MID','FWD'].map(f => (
          <span key={f} className={'chip' + (pos===f?' is-active':'')} onClick={()=>setPos(f)}>{f==='ALL'?'All':f}</span>
        ))}
      </div>
      <div className="t-micro text-tertiary" style={{ margin:'4px 2px 8px', letterSpacing:'.04em' }}>BEST AVAILABLE · {filtered.length} shown</div>
      {filtered.length===0 && <Empty label={`No players match “${q||pos}”`} />}
      {filtered.map((p, i) => (
        <div className="dr-prow" key={p.id}>
          <span className="mono t-micro text-tertiary" style={{ width:18 }}>{i+1}</span>
          <Flag nat={p.nat} /><Pos p={p.pos} />
          <div className="nm"><b>{p.first} {p.last}</b>
            <span className="t-caption text-tertiary">{(NATIONS[p.nat]||{}).n} · proj {p.proj}</span></div>
          <div style={{ display:'flex', gap:6 }}>
            <button className="btn btn-quiet btn-sm" style={{ minHeight:30, padding:'4px 8px' }} title={inQ(p.id)?'Remove from queue':'Add to queue'}
              onClick={()=> setQueue(qq => inQ(p.id) ? qq.filter(x=>x!==p.id) : [...qq, p.id])}>
              {inQ(p.id) ? '✓' : '＋'}
            </button>
            <button className={'btn btn-sm ' + (isMyTurn?'btn-primary':'is-disabled')} style={{ minHeight:30, padding:'4px 10px' }}
              disabled={!isMyTurn} onClick={()=> onDraft(p)}>Draft</button>
          </div>
        </div>
      ))}
    </>
  );
}

function QueueList({ queue, setQueue, available }) {
  const dragId = useRef(null);
  const items = queue.map(id => available.find(a => a.id === id)).filter(Boolean);
  const taken = queue.filter(id => !available.find(a=>a.id===id));
  const reorder = (from, to) => setQueue(qq => { const a=[...qq]; const [x]=a.splice(from,1); a.splice(to,0,x); return a; });
  return (
    <>
      <div className="alert alert-info" style={{ marginBottom:12 }}>
        <div><b>Autopick source.</b> If your clock expires, we draft the top still-available queued player that fills a need — then fall back to best available.</div>
      </div>
      {items.length===0 && <Empty label="Your queue is empty. Add players from Available." />}
      {items.map((p, i) => (
        <div className="dr-qitem" draggable key={p.id}
          onDragStart={()=>dragId.current=i}
          onDragOver={e=>e.preventDefault()}
          onDrop={()=>{ if(dragId.current!=null){ reorder(dragId.current, i); dragId.current=null; } }}>
          <span className="handle"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg></span>
          <span className="mono t-micro text-tertiary" style={{ width:16 }}>{i+1}</span>
          <Flag nat={p.nat} /><Pos p={p.pos} />
          <div className="nm" style={{ flex:1 }}><b className="t-sm">{p.last}</b> <span className="t-caption text-tertiary">{p.first} · {p.proj}</span></div>
          <button className="btn btn-quiet btn-sm" style={{ minHeight:28, padding:'2px 8px' }} onClick={()=>setQueue(qq=>qq.filter(x=>x!==p.id))}>✕</button>
        </div>
      ))}
      {taken.length>0 && <div className="t-caption text-tertiary" style={{ marginTop:8 }}>{taken.length} queued player(s) already drafted — auto-skipped.</div>}
    </>
  );
}

function RosterPanel({ picks, myCounts }) {
  const mine = picks.filter(p => p.managerId === ME_ID);
  const byPos = pos => mine.filter(p => p.player.pos === pos);
  return (
    <>
      <div className="dr-needbar" style={{ marginBottom:14 }}>
        {['GK','DEF','MID','FWD'].map(pp => {
          const done = myCounts[pp] >= POS_REQ[pp];
          return <div key={pp} className={'dr-need' + (done?' done':'')}>
            <Pos p={pp} /><div className="num" style={{ fontWeight:800, fontSize:18, marginTop:4 }}>{myCounts[pp]}<span className="text-tertiary" style={{ fontSize:12 }}>/{POS_REQ[pp]}</span></div>
          </div>;
        })}
      </div>
      <div className="t-micro text-tertiary" style={{ margin:'2px 2px 8px' }}>{mine.length}/15 ROSTERED</div>
      {mine.length===0 && <Empty label="No picks yet. Your squad builds here as you draft." />}
      {['GK','DEF','MID','FWD'].map(pp => byPos(pp).length>0 && (
        <div key={pp} style={{ marginBottom:10 }}>
          {byPos(pp).map(p => (
            <div className="pcard" key={p.overall} style={{ marginBottom:6 }}>
              <Flag nat={p.player.nat} /><Pos p={p.player.pos} />
              <div className="stack" style={{ flex:1 }}><b className="t-sm">{p.player.first} {p.player.last}</b>
                <span className="t-caption text-tertiary">R{p.round+1} · proj {p.player.proj}</span></div>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

function Empty({ label }) {
  return <div className="card-2" style={{ padding:'22px 16px', textAlign:'center' }}>
    <div className="t-sm" style={{ fontWeight:600 }}>{label}</div>
  </div>;
}

// ---------- lobby ----------
function Lobby({ onStart, onSim }) {
  const [t, setT] = useState(154);
  useEffect(() => { const i = setInterval(()=>setT(x=>Math.max(0,x-1)),1000); return ()=>clearInterval(i); }, []);
  const mm = String(Math.floor(t/60)).padStart(2,'0'), ss = String(t%60).padStart(2,'0');
  return (
    <div className="dr-center">
      <div className="lobby card" style={{ padding:24 }}>
        <div className="between" style={{ marginBottom:6 }}>
          <h2 className="t-h2">Pre-draft lobby</h2>
          <span className="pill" style={{ background:'var(--success-soft)', color:'var(--success)' }}><span className="dot"></span>{MANAGERS.filter(m=>m.online).length}/{N} ready</span>
        </div>
        <p className="text-secondary t-sm" style={{ marginTop:0 }}>Snake order is locked. {ROUNDS} rounds · {TOTAL} picks · 60s per pick · server-authoritative clock.</p>
        <div className="card-2" style={{ padding:16, textAlign:'center', margin:'14px 0' }}>
          <div className="t-label">Draft starts in</div>
          <div className="mono" style={{ fontSize:40, fontWeight:700, lineHeight:1.1, color: t<30?'var(--ytp)':'var(--text-primary)' }}>{mm}:{ss}</div>
        </div>
        <div className="t-label" style={{ marginBottom:8 }}>Draft order</div>
        <div className="lobby-order">
          {MANAGERS.map((m, i) => (
            <div className="lobby-orow" key={m.id} style={ m.isMe ? { borderColor:'var(--accent)', background:'var(--accent-soft)' } : {}}>
              <span className="mono t-sm text-tertiary" style={{ width:20 }}>{i+1}</span>
              <Avatar m={m} size="sm" />
              <b className="t-sm" style={{ flex:1 }}>{m.name}{m.isMe && <span className="t-micro text-tertiary"> (you)</span>}</b>
              <span className={'pill ' + (m.online?'pill-win':'pill-neutral')} style={ m.online?{}:{}}>{m.online?'Ready':'Away'}</span>
            </div>
          ))}
        </div>
        <div className="row gap-2" style={{ marginTop:18 }}>
          <button className="btn btn-primary btn-block" onClick={onStart}>Start draft now</button>
          <button className="btn btn-ghost" onClick={onSim} title="Demo">Sim</button>
        </div>
      </div>
    </div>
  );
}

// ---------- summary ----------
function Summary({ picks }) {
  const mine = picks.filter(p => p.managerId === ME_ID).sort((a,b)=>a.overall-b.overall);
  const total = mine.reduce((s,p)=>s+p.player.proj,0);
  const best = [...mine].sort((a,b)=> (b.player.proj - b.overall*1.2) - (a.player.proj - a.overall*1.2))[0];
  const grade = total > 900 ? 'A' : total > 780 ? 'A-' : total > 680 ? 'B+' : 'B';
  const byPos = pos => mine.filter(p => p.player.pos === pos);
  return (
    <div className="dr-center">
      <div className="summary">
        <div className="between" style={{ marginBottom:16, flexWrap:'wrap', gap:12 }}>
          <div>
            <div className="t-label">Draft complete</div>
            <h2 className="t-display-l">Your squad is set.</h2>
          </div>
          <div className="row gap-4">
            <div className="card-2" style={{ padding:'12px 18px', textAlign:'center' }}><div className="t-micro text-tertiary">PROJECTED</div><div className="display" style={{ fontSize:28, fontWeight:800, lineHeight:1.2 }}>{total.toFixed(0)}</div></div>
            <div className="card-2" style={{ padding:'12px 18px', textAlign:'center' }}><div className="t-micro text-tertiary">DRAFT GRADE</div><div className="display" style={{ fontSize:28, fontWeight:800, lineHeight:1.2, color:'var(--accent)' }}>{grade}</div></div>
          </div>
        </div>
        {best && <div className="alert alert-info" style={{ marginBottom:16 }}><div><b>Value pick:</b> {best.player.first} {best.player.last} at pick {best.overall+1} (proj {best.player.proj}).</div></div>}
        <div className="sum-grid">
          {['GK','DEF','MID','FWD'].map(pp => (
            <div className="sum-col" key={pp}>
              <h4 className="t-h3"><Pos p={pp} /> <span className="text-tertiary t-sm">{byPos(pp).length}/{POS_REQ[pp]}</span></h4>
              {byPos(pp).map(p => (
                <div className="pcard" key={p.overall} style={{ marginBottom:6 }}>
                  <Flag nat={p.player.nat} />
                  <div className="stack" style={{ flex:1, minWidth:0 }}><b className="t-caption" style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{p.player.last}</b><span className="t-micro text-tertiary">R{p.round+1} · {p.player.proj}</span></div>
                </div>
              ))}
            </div>
          ))}
        </div>
        <p className="t-caption text-tertiary" style={{ marginTop:16 }}>Next: set your lineup for Matchday 1 — lock-on-play means a benched 0-minute starter stays swappable until he plays.</p>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<DraftRoom />);
