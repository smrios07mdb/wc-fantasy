// playoffs2/parrot.jsx — the brand's parrot mascot ("Chocoyo") wielding a MACHETE: the blade.
// Two atoms — <Machete> (a broad single-edged machete silhouette, no cross-guard) and
// <ParrotMascot> (the brand roundel, zoomable so the bird fills the frame). The cutting edge
// (the belly) carries the functional --elim red; the metal is neutral steel. No gold leaks.
const { useId: usePoId2 } = React;

// A machete / bolo blade: wooden grip, no guard, broad belly that's widest toward the front,
// rounded tip. The lower curve (belly) is the single cutting edge → painted --elim red.
function Machete({ h = 46, glow = false, className = '' }){
  const raw = usePoId2();
  const g = 'mch' + raw.replace(/[:]/g, '');
  return (
    <svg className={'po2-machete' + (glow ? ' is-glow' : '') + (className ? ' ' + className : '')}
         viewBox="0 0 152 58" height={h} aria-hidden="true">
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#EEF1F6"/>
          <stop offset="0.4" stopColor="#B6BFCC"/>
          <stop offset="0.56" stopColor="#8C97A8"/>
          <stop offset="1" stopColor="#566073"/>
        </linearGradient>
      </defs>
      {/* wooden grip (no cross-guard — that's what made it read as a sword) */}
      <path d="M6 22 L34 23 Q40 23 40 28 L40 33 Q40 38 34 38 L6 36 Q3 35 3 31 L3 27 Q3 23 6 22 Z" fill="#4A3C2E"/>
      <rect x="6" y="24.2" width="29" height="3.2" rx="1.6" fill="#5E4B39"/>
      <circle cx="12" cy="31" r="1.5" fill="#2C241D"/>
      <circle cx="22" cy="31" r="1.5" fill="#2C241D"/>
      <circle cx="32" cy="31" r="1.5" fill="#2C241D"/>
      {/* broad machete blade */}
      <path d="M40 23 L116 16.5 Q143.5 18 147 33 Q139 44.5 109 47.5 Q71 50.5 40 37 Z"
            fill={`url(#${g})`} stroke="#474F5C" strokeWidth="1"/>
      {/* spine sheen (top edge) */}
      <path d="M46 24 Q100 20 134 26.5" stroke="#FFFFFF" strokeWidth="2" opacity="0.5" fill="none" strokeLinecap="round"/>
      {/* the belly — single cutting edge, functional elim red */}
      <path className="po2-edge" d="M40 37 Q71 50.5 109 47.5 Q139 44.5 147 33" stroke="var(--elim)" strokeWidth="3" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

// The mascot roundel. `zoom` scales the image inside its frame so the parrot fills it (less of
// the gold trophy nest shows). `tone="steel"` desaturates for the restrained direction.
function ParrotMascot({ size = 56, tone = 'vivid', squawk = false, zoom = 1.18, className = '' }){
  return (
    <span className={'po2-parrot po2-parrot-' + tone + (squawk ? ' is-squawk' : '') + (className ? ' ' + className : '')}
          style={{ width: size, height: size }}>
      <img src="logo/parrot-round.png" alt="" draggable="false"
           style={{ width: (zoom * 100) + '%', height: (zoom * 100) + '%' }}/>
    </span>
  );
}

// The FULL brand mark — the pixel-art World Cup trophy with Chocoyo peeking out, shown whole
// (transparent PNG, NOT masked into a circle). `size` = rendered height; width follows the
// image aspect. This is the trophy mark, so its gold is on-brand (gold only ever lives here).
function TrophyMark({ size = 220, squawk = false, className = '' }){
  return (
    <span className={'po2-trophy' + (squawk ? ' is-squawk' : '') + (className ? ' ' + className : '')}
          style={{ height: size }}>
      <img src="logo/trophy.png" alt="" draggable="false"/>
    </span>
  );
}

Object.assign(window, { Machete, ParrotMascot, TrophyMark });
