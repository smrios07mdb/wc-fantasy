// vsfield2/knockout.jsx — knockout ("The Cut") mode folded into Vs the Field.
// Adds the guillotine framing to the live surface per the unified-direction spec:
// theater marquee (trophy + looming machete), YOU band with margin-to-the-blade,
// cut line + ON THE BLOCK zone in the ladder, and "the fallen" collapsible section.
// Blade discipline: exactly ONE machete per screen — the marquee loom yields to the
// Damocles blade on the YOU band when you are on the block.
// Exports: knockoutContext, KO_ROUND, Machete, MacheteMini, KOMarquee, KOYouBand,
// KOCutLine, KOFallen — all to window.
const { useState: useKO } = React;

const KO_ROUND = { label: 'Round of 16', short: 'R16' };
// Fallen in the previous round (demo authoring: cut in R32; excluded from the live field)
const KO_FALLEN = [ { id: 'm9', round: 'R32' }, { id: 'm12', round: 'R32' } ];

function knockoutContext(field, t, cut){
  cut = cut || 2;
  const fallenIds = new Set(KO_FALLEN.map(f => f.id));
  const alive = field.ranked.filter(s => !fallenIds.has(s.id)).map((s,i) => ({ ...s, rank: i+1 }));
  const n = alive.length;
  const cutIndex = Math.max(1, n - cut);
  const meIdx = alive.findIndex(s => s.id === ME_ID);
  const me = alive[meIdx];
  const onBlock = meIdx >= cutIndex;
  const margin = onBlock ? me.total - alive[cutIndex-1].total : me.total - alive[cutIndex].total;
  const pend = t >= PERIOD_END; // round locked, awaiting official results
  const fallen = KO_FALLEN.map(f => ({ ...f, m: mgr(f.id) }));
  return { round: KO_ROUND, cut, alive, n, cutIndex, me, meIdx, onBlock, margin, pend, fallen };
}

const ordKO = n => { const s = ['th','st','nd','rd'], v = n % 100; return n + (s[(v-20)%10] || s[v] || s[0]); };

// ---- the machete (steel + elim red edge + wooden grip; no gold) ----
function Machete({ cls }){
  return (
    <svg className={'ko-mach ' + (cls || '')} viewBox="0 0 120 44" aria-hidden="true">
      <rect x="1" y="25" width="26" height="12" rx="5" fill="#6B4A2E"></rect>
      <rect x="9" y="25" width="3" height="12" fill="#57391F"></rect>
      <rect x="16" y="25" width="3" height="12" fill="#57391F"></rect>
      <path d="M26 26 C48 21 84 15 116 5 C119 11 117 23 100 32 C82 41 52 41 26 40 Z" fill="#C4525F"></path>
      <path d="M26 23 C48 18 84 12 116 2 C119 8 117 20 100 29 C82 38 52 38 26 37 Z" fill="#93A2BC"></path>
      <path d="M32 26 C52 22 82 17 106 9" stroke="rgba(255,255,255,.4)" strokeWidth="2.5" fill="none" strokeLinecap="round"></path>
    </svg>
  );
}
function MacheteMini(){
  return (
    <svg className="ko-blade" viewBox="0 0 120 44" aria-hidden="true">
      <rect x="1" y="25" width="26" height="12" rx="5" fill="#6B4A2E"></rect>
      <path d="M26 26 C48 21 84 15 116 5 C119 11 117 23 100 32 C82 41 52 41 26 40 Z" fill="var(--elim)"></path>
      <path d="M26 23 C48 18 84 12 116 2 C119 8 117 20 100 29 C82 38 52 38 26 37 Z" fill="#93A2BC"></path>
    </svg>
  );
}

// ---- compact theater marquee (trophy bursts out; machete looms unless Damocles is out) ----
function KOMarquee({ ko, mob }){
  const title = ko.pend ? 'THE BLADE DROPS SOON' : `LOWEST ${ko.cut} GET THE CHOP`;
  const sub = ko.pend
    ? 'Full time · official after stat corrections'
    : `${ko.n} standing · ${ko.n - ko.cut} advance · cut at full time`;
  return (
    <div className={'ko-marq' + (mob ? ' ko-marq-mob' : '')}>
      {!ko.onBlock && <Machete cls="loom" />}
      <img className="ko-trophy" src="logo/trophy.png" alt="" />
      <div className="ko-marq-tx"><div className="t">{title}</div><div className="s">{sub}</div></div>
      <a className="ko-theater" href="Guillotine Theater.html">Theater ›</a>
    </div>
  );
}

// ---- YOU band: safe (accent) / block (danger + Damocles) / pend (ytp) ----
function KOYouBand({ ko, mob }){
  const { me, n, margin, onBlock, pend } = ko;
  const pulse = useScorePulse(me.total);
  const v = onBlock ? 'block' : pend ? 'pend' : 'safe';
  const ic = onBlock ? '⚠' : pend ? '⏳' : '✓';
  const a = onBlock ? `ON THE BLOCK · ${ordKO(me.rank)} of ${n}`
    : pend ? `Provisionally safe · ${ordKO(me.rank)} of ${n}`
    : `Surviving · ${ordKO(me.rank)} of ${n}`;
  const b = onBlock ? `Need ${Math.max(1, -margin + 1)} pts — ${me.ytp} to play`
    : pend ? 'Order can move on corrections'
    : 'Tap a row to compare';
  const n2 = margin === 0 ? 'level — tiebreak applies'
    : onBlock ? 'behind the blade'
    : pend ? 'clear at full time'
    : 'clear of the blade';
  return (
    <div className={'ko-you is-' + v + (mob ? ' ko-you-mob' : '')}>
      {onBlock && <Machete cls="damocles" />}
      <span className="ko-you-ic">{ic}</span>
      <div className="ko-you-tx"><b>{a}</b><span>{b}</span></div>
      <div className="ko-you-num">
        <b className={'mono' + (pulse ? ' score-pulse' : '')}>{margin > 0 ? '+' : ''}{margin}</b>
        <span>{n2}</span>
      </div>
      {mob && <div className="ko-you-pts mono">{me.total}<span>pts</span></div>}
    </div>
  );
}

// ---- cut line divider ----
function KOCutLine({ ko, mob }){
  return (
    <div className={'ko-cut' + (mob ? ' ko-cut-mob' : '')}>
      <span className="beam"></span>
      <span className="chip"><MacheteMini />CUT LINE · LOWEST {ko.cut}</span>
      <span className="beam r"></span>
    </div>
  );
}

// ---- the fallen (collapsed by default; rows stay tappable → same H2H drill-in) ----
function KOFallen({ ko, onSelect, mob }){
  const [open, setOpen] = useKO(false);
  return (
    <div className={'ko-fallen' + (mob ? ' ko-fallen-mob' : '')}>
      <button className="ko-fallen-hd" onClick={() => setOpen(o => !o)}>
        <span className="arr">{open ? '▾' : '▸'}</span>
        <span>THE FALLEN ({ko.fallen.length})</span>
        <span className="ln"></span>
      </button>
      {open && ko.fallen.map(f => (
        <button key={f.id} className="ko-dead" onClick={() => onSelect && onSelect(f.id)}>
          <Avatar m={f.m} size="sm" />
          <span className="ko-dead-name">{f.m.short}</span>
          <span className="ko-dead-tag">cut in {f.round}</span>
          <span className="ko-dead-chev">›</span>
        </button>
      ))}
    </div>
  );
}

// ---- the cutting ceremony: full-frame takeover when results go official ----
// Phase machine: armed → wind (machete raises) → drop (swing + slash + shake) → aftermath
// (blood + Eliminated! stamps + verdict). Tap = skip to aftermath; tap again / CTA = dismiss.
// GOTCHA respected: reveal opacity is class-driven (.is-out / .is-drop), only transform animates.
function KOCeremony({ ko, onClose, mob }){
  const [ph, setPh] = useKO('armed');
  React.useEffect(()=>{
    const a = setTimeout(()=>setPh('wind'), 700);
    const b = setTimeout(()=>setPh('drop'), 1900);
    const c = setTimeout(()=>setPh('aftermath'), 2450);
    return ()=>{ clearTimeout(a); clearTimeout(b); clearTimeout(c); };
  }, []);
  const victims = ko.alive.slice(ko.cutIndex);
  const after = ph === 'aftermath';
  return (
    <div className={'koc is-'+ph+(mob?' koc-mob':'')} onClick={()=> after ? onClose() : setPh('aftermath')}>
      <div className="koc-inner" onClick={e=>e.stopPropagation()}>
        <div className="koc-eyebrow">{ko.round.short} · RESULTS OFFICIAL</div>
        <div className="koc-head">{after ? 'THE BLADE HAS FALLEN' : `LOWEST ${ko.cut} GET THE CHOP`}</div>
        <div className="koc-sub">{after ? `${ko.cutIndex} advance to the next round` : 'The Chocoyo doesn\u2019t miss.'}</div>
        <div className="koc-mech">
          <Machete cls="koc-mach" />
          <img className="koc-trophy" src="logo/trophy.png" alt="" />
          <span className="koc-slash" aria-hidden="true"></span>
        </div>
        <div className="koc-victims">
          {victims.map(v => { const m = mgr(v.id); return (
            <div key={v.id} className={'koc-victim'+(after?' is-out':'')}>
              <span className="koc-blood" aria-hidden="true"></span>
              <Avatar m={m} size="lg" />
              <span className="koc-stamp">Eliminated!</span>
              <b className="koc-vname">{m.isMe?'You':m.short}</b>
              <span className="koc-vpts mono">{v.total} pts</span>
            </div>
          ); })}
        </div>
        {after && <div className="koc-verdict">
          {ko.onBlock
            ? <span className="koc-verdict-out">✗ Your run ends here — {ordKO(ko.me.rank)} of {ko.n}</span>
            : <span className="koc-verdict-safe">✓ You survive — {ordKO(ko.me.rank)} of {ko.n} · {ko.margin>0?'+':''}{ko.margin} clear</span>}
          <span className="koc-faab">FAAB resets to $100 — <a href="Waivers.html">reinforce via waivers</a></span>
        </div>}
        <div className="koc-actions">
          {after
            ? <button className="btn btn-primary btn-sm" onClick={onClose}>Back to the ladder</button>
            : <button className="btn btn-ghost btn-sm" onClick={()=>setPh('aftermath')}>Skip</button>}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { knockoutContext, KO_ROUND, Machete, MacheteMini, KOMarquee, KOYouBand, KOCutLine, KOFallen, KOCeremony });
