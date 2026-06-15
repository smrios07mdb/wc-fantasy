// theater/app.jsx — Guillotine "Full Theater" stage, FINAL. Desktop + mobile (Surface tweak).
// One sim drives the live round + the drop choreography. (Direction A and the Compare toggle from
// the exploration are removed — this is the chosen design only.)
const { useState, useEffect, useRef, useMemo, useCallback } = React;

function useFitScale2(contentW, contentH){
  const ref = useRef(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const fit = () => {
      const w = el.clientWidth - 8, h = el.clientHeight - 8;
      if (w <= 0) return;
      setScale(Math.max(0.05, Math.min(1, w / contentW, h > 0 ? h / contentH : 1)));
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    window.addEventListener('resize', fit);
    return () => { ro.disconnect(); window.removeEventListener('resize', fit); };
  }, [contentW, contentH]);
  return [ref, scale];
}

// pts edge from YOU to the cut line — positive = clear, negative = in the zone
function meEdge(model, survN, lastSafe, firstCut){
  const me = model.me; if (!me || !lastSafe || !firstCut) return { gap: 0, safe: true };
  if (me.rank <= survN) return { gap: me.pts - firstCut.pts, safe: true };
  return { gap: me.pts - lastSafe.pts, safe: false };
}

const STAGE_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "surface": "desktop"
}/*EDITMODE-END*/;

function App(){
  const [tw, setTweak] = useTweaks(STAGE_DEFAULTS);
  useEffect(() => {
    const el = document.documentElement;
    el.setAttribute('data-accent', 'cobalt');
    el.setAttribute('data-theme', tw.theme);
    el.setAttribute('data-density', 'comfortable');
  }, [tw.theme]);

  // ---- sim: scrub the live round; the cut line reforms as points move ----
  const [t, setT] = useState(DEFAULT_MIN);
  const [playing, setPlaying] = useState(false);
  // ---- phase machine: the blade choreography (separate from the clock) ----
  // armed → (wind) → drop → aftermath.  'armed' while scrubbing; the rest is the locking sequence.
  const [phase, setPhase] = useState('armed');
  const seq = useRef([]);
  const clearSeq = () => { seq.current.forEach(clearTimeout); seq.current = []; };

  useEffect(() => () => clearSeq(), []);

  useEffect(() => { if (!playing) return;
    const id = setInterval(() => setT(x => x >= PERIOD_END ? x : x + 1), 90);
    return () => clearInterval(id);
  }, [playing]);
  useEffect(() => { if (playing && t >= PERIOD_END) setPlaying(false); }, [t, playing]);

  const dropBlade = useCallback(() => {
    setPlaying(false); clearSeq();
    setT(PERIOD_END);                 // lock the round's points
    setPhase('wind');                 // anticipation — Chocoyo raises the blade
    seq.current.push(setTimeout(() => setPhase('drop'),     1150));  // the swing
    seq.current.push(setTimeout(() => setPhase('aftermath'), 1850)); // reactions settle
  }, []);
  const rearm = useCallback((min) => {
    clearSeq(); setPlaying(false); setPhase('armed'); setT(min == null ? DEFAULT_MIN : min);
  }, []);

  const field = 10, preset = 'default';
  const model = useMemo(() => buildGuillotine(field, preset, t), [t]);
  const lineup = useMemo(() => myReducedLineup(), []);
  const pulse = useScorePulse(model.me ? model.me.pts : 0);

  const cur = model.rounds[model.currentRoundIdx];
  const ranked = cur.ranked || [];
  const survN = cur.survives;
  const survivors = ranked.slice(0, survN);
  const block = ranked.slice(survN);
  const lastSafe = ranked[survN - 1] || null;
  const firstCut = ranked[survN] || null;
  const dropped = phase === 'drop' || phase === 'aftermath';
  const edge = meEdge(model, survN, lastSafe, firstCut);

  const shared = {
    model, cur, ranked, survN, survivors, block, lastSafe, firstCut,
    t, phase, dropped, locked: dropped, edge, lineup, pulse,
  };

  const surface = tw.surface || 'desktop';
  const isMobile = surface === 'mobile';

  const FRAME_W = isMobile ? 402 : 952;
  const FRAME_H = isMobile ? 858 : 1168;
  const CONTENT_W = FRAME_W;
  const CONTENT_H = FRAME_H + 30;
  const [fitRef, scale] = useFitScale2(CONTENT_W, CONTENT_H);

  const mm = String(t).padStart(2, '0');
  const phaseLabel = { armed: 'Armed · live', wind: 'Wind-up', drop: 'BLADE DROPS', aftermath: 'Aftermath' }[phase];

  return (
    <div className="vf-stage">
      <div className="vf-stagebar">
        <div className="vf-sb-title">
          <div className="vf-logo">XI</div>
          <div>
            <b className="display" style={{ fontSize: 15, lineHeight: 1, whiteSpace: 'nowrap' }}>Guillotine stage</b>
            <div className="t-micro text-tertiary" style={{ whiteSpace: 'nowrap' }}>Round {model.currentRoundIdx + 1} · {model.aliveNow} alive · lowest {model.cutThisRound} fall</div>
          </div>
        </div>

        <div className="vf-sb-sim">
          <button className="btn btn-primary btn-sm" disabled={dropped || phase === 'wind'} onClick={() => setPlaying(p => !p)}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
          <div className="vf-sb-clock mono">R{model.currentRoundIdx + 1} {mm}'</div>
          <input className="vf-sb-range" type="range" min="0" max={PERIOD_END} value={t}
                 disabled={dropped || phase === 'wind'}
                 onChange={e => { setPlaying(false); rearm(+e.target.value); }} style={{ width: 124 }}/>
          <div className="vf-sb-jumps">
            <button className="btn btn-ghost btn-sm" onClick={() => rearm(0)} title="Before the round — all level">Pre-round</button>
            <button className="btn btn-ghost btn-sm" onClick={() => rearm(DEFAULT_MIN)}>Now</button>
            <button className="btn btn-danger btn-sm vf2-dropbtn" onClick={dropBlade} title="Lock the round — Chocoyo swings">🪓 Blade drops</button>
            {dropped && <button className="btn btn-ghost btn-sm" onClick={() => rearm(DEFAULT_MIN)}>↺ Re-arm</button>}
          </div>
        </div>

        <div className="vf-sb-conn">
          <span className={'vf2-phase vf2-phase-' + phase}>{phaseLabel}</span>
        </div>
      </div>

      <div className="vf-fit" ref={fitRef}>
        <div className="vf-frames" style={{ width: CONTENT_W, height: CONTENT_H, transform: `scale(${scale})` }}>
          <div className="vf2-col">
            {isMobile
              ? <div className="vf-phone"><IOSDevice dark={tw.theme==='dark'} width={402} height={858}><TheaterMobile {...shared}/></IOSDevice><div className="vf-phone-badge t-micro">iPhone</div></div>
              : <Browser><TheaterScreen {...shared}/></Browser>}
          </div>
        </div>
      </div>

      <TweaksPanel>
        <TweakSection label="View" />
        <TweakRadio label="Surface" value={surface} options={[{ value: 'desktop', label: 'Desktop' }, { value: 'mobile', label: 'Mobile' }]}
          onChange={v => setTweak('surface', v)} />
        <TweakSection label="Appearance" />
        <TweakRadio label="Theme" value={tw.theme} options={['dark', 'light']} onChange={v => setTweak('theme', v)} />
        <div className="tw-note">Accent locked to cobalt — it only ever marks <b>you</b>. Red is the blade. Hit <b>Blade drops</b> to play the choreography.</div>
      </TweaksPanel>
    </div>
  );
}

function Browser({ children }){
  return (
    <div className="vf-browser" style={{ width: 952, height: 1168 }}>
      <div className="vf-bw-bar">
        <span className="vf-bw-dot" style={{ background: 'var(--surface-4)' }}></span>
        <span className="vf-bw-dot" style={{ background: 'var(--surface-4)' }}></span>
        <span className="vf-bw-dot" style={{ background: 'var(--surface-4)' }}></span>
        <div className="vf-bw-url"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>worldcupfantasy.app/league/playoffs</div>
        <span className="vf-bw-badge t-micro">Desktop</span>
      </div>
      <div className="vf-bw-body">{children}</div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
