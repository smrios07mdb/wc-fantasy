// availability/badges.jsx — XI availability-badge exploration.
// Pure presentational showcase (no app state). Renders the three availability
// states on a pitch token + a bench row + a legend, across three treatments.
// Availability = "is he in his country's real starting XI for his next match?"
// This is ORTHOGONAL to lock-on-play (kit brightness / score line) — most
// meaningful for movable, pre-kickoff players.

// ---- flag fills (CSS gradients — approximate, recognizable) ----
const FLAG = {
  ARG: 'linear-gradient(180deg,#74ACDF 0 34%,#ffffff 34% 66%,#74ACDF 66%)',
  FRA: 'linear-gradient(90deg,#0055A4 0 34%,#ffffff 34% 66%,#EF4135 66%)',
  USA: 'linear-gradient(#3C3B6E,#3C3B6E) top left/44% 54% no-repeat, repeating-linear-gradient(180deg,#B22234 0 14.28%,#ffffff 14.28% 28.57%)',
  POR: 'linear-gradient(90deg,#006600 0 40%,#D52B1E 40%)',
  BRA: 'radial-gradient(circle at 50% 50%, #002776 0 17%, #FFDF00 17% 31%, #009C3B 31%)',
  NED: 'linear-gradient(180deg,#AE1C28 0 34%,#ffffff 34% 66%,#21468B 66%)',
  ENG: 'linear-gradient(#CF142B,#CF142B) center/100% 26% no-repeat, linear-gradient(#CF142B,#CF142B) center/26% 100% no-repeat, #ffffff',
};

// ---- badge vocabulary, keyed by availability state ----
const BADGE = {
  starting:{ s:'s-starting', word:'Starting',     mini:'Starting', bar:'Starting',     ico:'check' },
  out:     { s:'s-out',      word:'Not starting', mini:'Out',      bar:'Not starting', ico:'x'  },
  tba:     { s:'s-tba',      word:'Lineup TBA',   mini:'TBA',      bar:'TBA',          ico:'clock' },
};

// ---- the three states (the demo trio used in the detail sections) ----
const STATES = [
  { state:'starting', nat:'ARG', name:'L. Martínez',   pos:'FWD', opp:'MEX', ko:'19:00',
    blurb:<span><b>Starting</b> — confirmed in the real XI</span> },
  { state:'out', nat:'FRA', name:'A. Tchouaméni', pos:'MID', opp:'DEN', ko:'21:00',
    blurb:<span><b>Not starting</b> — benched IRL · you may want to swap him</span> },
  { state:'tba', nat:'USA', name:'W. McKennie',  pos:'MID', opp:'ENG', ko:'18:00',
    blurb:<span><b>Lineup TBA</b> — drops ~1h before kickoff · the calm default</span> },
];

// ---- a full squad for the density stress-test (realistic "lineups dropping" moment) ----
const SQUAD = {
  FWD: [
    { nat:'ARG', name:'L. Martínez', pos:'FWD', opp:'MEX', ko:'19:00', state:'starting' },
    { nat:'POR', name:'R. Leão',     pos:'FWD', opp:'GHA', ko:'21:00', state:'tba' },
    { nat:'BRA', name:'Vini Jr.',    pos:'FWD', opp:'SRB', ko:'20:00', state:'out' },
  ],
  MID: [
    { nat:'ARG', name:'E. Fernández', pos:'MID', opp:'MEX', ko:'19:00', state:'starting' },
    { nat:'FRA', name:'A. Tchouaméni', pos:'MID', opp:'DEN', ko:'21:00', state:'tba' },
    { nat:'USA', name:'W. McKennie',  pos:'MID', opp:'ENG', ko:'18:00', state:'starting' },
  ],
  DEF: [
    { nat:'ARG', name:'C. Romero',  pos:'DEF', opp:'MEX', ko:'19:00', state:'starting' },
    { nat:'FRA', name:'W. Saliba',  pos:'DEF', opp:'DEN', ko:'21:00', state:'tba' },
    { nat:'NED', name:'V. van Dijk', pos:'DEF', opp:'ECU', ko:'17:00', state:'tba' },
    { nat:'USA', name:'A. Robinson', pos:'DEF', opp:'ENG', ko:'18:00', state:'starting' },
  ],
  GK: [
    { nat:'ENG', name:'J. Pickford', pos:'GK', opp:'USA', ko:'18:00', state:'tba' },
  ],
};
const BENCH4 = [
  { nat:'BRA', name:'Alisson',      pos:'GK',  opp:'SRB', ko:'20:00', state:'out' },
  { nat:'ENG', name:'K. Walker',    pos:'DEF', opp:'USA', ko:'18:00', state:'tba' },
  { nat:'FRA', name:'A. Griezmann', pos:'FWD', opp:'DEN', ko:'21:00', state:'tba' },
  { nat:'POR', name:'B. Fernandes', pos:'MID', opp:'GHA', ko:'21:00', state:'tba' },
];

// ---- icons (distinct silhouettes for colorblind redundancy) ----
function Ico({ k }){
  const p = { fill:'none', stroke:'currentColor', strokeWidth:2.6, strokeLinecap:'round', strokeLinejoin:'round' };
  if (k==='check') return <span className="av-ico"><svg viewBox="0 0 24 24" {...p}><path d="M20 6 9 17l-5-5"/></svg></span>;
  if (k==='chev')  return <span className="av-ico"><svg viewBox="0 0 24 24" {...p} strokeWidth={2.4}><path d="M5 8.5l7 7 7-7"/></svg></span>;
  if (k==='x')     return <span className="av-ico"><svg viewBox="0 0 24 24" {...p} strokeWidth={2.8}><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg></span>;
  // clock
  return <span className="av-ico"><svg viewBox="0 0 24 24" {...p} strokeWidth={2.2}><circle cx="12" cy="12" r="8.4"/><path d="M12 7.6V12l3 1.8"/></svg></span>;
}

// ---- atoms ----
const Jersey = ({ nat, cls }) =>
  <span className={'av-jersey '+(cls||'')} style={{ background:FLAG[nat] }}></span>;
const Flag = ({ nat }) =>
  <span className="flag av-bflag" style={{ background:FLAG[nat] }}></span>;
const Pos = ({ p }) => <span className={'pos pos-'+p}>{p}</span>;
const Meta = ({ st }) => <span className="av-meta">vs {st.opp} <span className="o">·</span> {st.ko}</span>;

// ===========================================================================
// TOKEN — per variant
// ===========================================================================
function Token({ st, variant }){
  const b = BADGE[st.state];
  if (variant==='A') return (
    <div className="av-tok">
      <div className="av-kitwrap"><Jersey nat={st.nat}/></div>
      <div className="av-name">{st.name}</div>
      <Meta st={st}/>
      <span className={'avA-pill '+b.s}><Ico k={b.ico}/>{b.mini}</span>
    </div>
  );
  if (variant==='B') return (
    <div className="av-tok">
      <div className="av-kitwrap">
        <Jersey nat={st.nat} cls={'avB-kit glow-'+st.state}/>
        <span className={'avB-medal '+b.s}><Ico k={b.ico}/></span>
      </div>
      <div className="av-name">{st.name}</div>
      <Meta st={st}/>
      <span className={'avB-word '+b.s}>{b.mini}</span>
    </div>
  );
  // C
  return (
    <div className="av-tok">
      <div className="av-kitwrap"><Jersey nat={st.nat}/></div>
      <div className="av-name">{st.name}</div>
      <Meta st={st}/>
      <div className="avC-wrap">
        <span className={'avC-bar '+b.s}></span>
        <span className={'avC-lab '+b.s}>{b.bar}</span>
      </div>
    </div>
  );
}

// ===========================================================================
// BENCH ROW — per variant
// ===========================================================================
function Bench({ st, variant }){
  const b = BADGE[st.state];
  if (variant==='A') return (
    <div className="av-bench">
      <Pos p={st.pos}/><Flag nat={st.nat}/>
      <b className="av-bname">{st.name}</b>
      <span className="av-bmeta">vs {st.opp} · {st.ko}</span>
      <span className="av-bspacer"></span>
      <span className={'avA-pill '+b.s}><Ico k={b.ico}/>{b.word}</span>
    </div>
  );
  if (variant==='B') return (
    <div className={'av-bench avB-bench '+b.s}>
      <span className={'avB-chip '+b.s}><Ico k={b.ico}/></span>
      <Flag nat={st.nat}/>
      <b className="av-bname">{st.name}</b>
      <span className="av-bmeta">vs {st.opp} · {st.ko}</span>
      <span className="av-bspacer"></span>
      <span className={'avB-word '+b.s}>{b.mini}</span>
    </div>
  );
  // C
  return (
    <div className="av-bench">
      <span className={'avC-swatch '+b.s}></span>
      <Flag nat={st.nat}/>
      <b className="av-bname">{st.name}</b>
      <span className="av-bmeta">vs {st.opp} · {st.ko}</span>
      <span className="av-bspacer"></span>
      <span className={'avC-lab '+b.s}>{b.bar}</span>
    </div>
  );
}

// ===========================================================================
// BOARDS
// ===========================================================================
function PitchBoard({ variant }){
  return (
    <div className="av-board">
      <div className="av-cap">On the pitch token</div>
      <div className="av-pitch">
        {STATES.map(st => <Token key={st.state} st={st} variant={variant}/>)}
      </div>
    </div>
  );
}
function BenchBoard({ variant }){
  return (
    <div className="av-board">
      <div className="av-cap">Down the bench list</div>
      <div className="av-benchcard">
        {STATES.map(st => <Bench key={st.state} st={st} variant={variant}/>)}
      </div>
    </div>
  );
}
function LegendBoard({ variant }){
  return (
    <div className="av-board">
      <div className="av-cap">Legend</div>
      <div className="av-legend">
        {STATES.map(st => { const b=BADGE[st.state]; return (
          <div className="av-lgrow" key={st.state}>
            {variant==='A' && <span className={'avA-pill '+b.s}><Ico k={b.ico}/>{b.word}</span>}
            {variant==='B' && <span className={'avB-chip '+b.s}><Ico k={b.ico}/></span>}
            {variant==='C' && <span className={'avC-bar '+b.s} style={{flex:'none'}}></span>}
            <span className="av-lgtext">{st.blurb}</span>
          </div>
        );})}
      </div>
      <div className="av-sub" style={{marginTop:'auto'}}>Colour + icon + word on every state. Availability is separate from lock-on-play.</div>
    </div>
  );
}
function LightBoard({ variant }){
  return (
    <div className="av-board is-light" data-theme="light">
      <div className="av-cap">Light theme</div>
      <div className="av-benchcard">
        {STATES.map(st => <Bench key={st.state} st={st} variant={variant}/>)}
      </div>
    </div>
  );
}

// ===========================================================================
// FULL SQUAD — density stress test (full XI on a 4-3-3 + the 4-man bench)
// ===========================================================================
function FullSquad({ variant }){
  const order = ['FWD','MID','DEF','GK'];
  return (
    <div className="av-board">
      <div className="av-cap">Full XI · 4-3-3 — a realistic “lineups dropping” mix</div>
      <div className="av-pitch av-pitch-full">
        {order.map(pos => (
          <div className="av-lane" key={pos}>
            {SQUAD[pos].map((p,i) => <Token key={pos+i} st={p} variant={variant}/>)}
          </div>
        ))}
      </div>
      <div className="av-benchhead"><span className="av-cap">Bench · 4</span></div>
      <div className="av-benchcard">
        {BENCH4.map((p,i) => <Bench key={i} st={p} variant={variant}/>)}
      </div>
    </div>
  );
}

Object.assign(window, { PitchBoard, BenchBoard, LegendBoard, LightBoard, FullSquad });
