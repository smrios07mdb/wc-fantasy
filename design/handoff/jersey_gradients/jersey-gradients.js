// ============================================================================
// WC2026 Fantasy — National jersey gradients (JS form)
// 22 NEW nations + an ADOPTED Croatia replacement (CRO, decided).
//
// Drops into the project's existing kit library. Per CLAUDE.md / COMPONENT_MAP.md
// the canonical library is `JERSEY_BG` in setlineup/data.jsx; Vs the Field also
// has a local `JERSEY_BG_V2` in vsfield2/directionA.jsx. Merge NEW_KITS into
// whichever the surface reads (long-term: collapse to ONE — point kitOf() at the
// shared JERSEY_BG).
//
//   Object.assign(JERSEY_BG, NEW_KITS);          // app-wide
//   // or, for Vs the Field only:
//   Object.assign(JERSEY_BG_V2, NEW_KITS);
//
// RENDER CONTRACT (do not skip):
//   - Apply as the full `background` shorthand:
//       <span style={{ background: kitOf(player.nat) }} />
//   - NEVER set background-size:cover — each layer carries its own size; cover
//     collapses them to a muddy block (USA -> solid navy -> reads black).
//   - The 1px light inset outline is applied SEPARATELY by the app
//     (box-shadow: inset 0 0 0 1px var(--kit-outline)); NOT baked in here.
//
// ISO codes: AUT BEL CAN COL CIV CZE ECU EGY GER GHA JPN MAR NED NOR SCO SEN
//            KOR ESP SWE SUI TUR URU  (+ CRO2 proposal)
// ============================================================================

const NEW_KITS = {
  // 01 · Sky-blue & sun  (deeper celeste + canton sun => not Argentina)
  URU: 'radial-gradient(circle at 22% 23%,#F4B32E 0 9%,transparent 9.6%), linear-gradient(#fff,#fff) top left/42% 46% no-repeat, repeating-linear-gradient(180deg,#4F86C6 0 12.5%,#fff 12.5% 25%)',

  // 02 · Vertical tricolors  (separated by color set; Senegal star vs Mexico)
  BEL: 'linear-gradient(90deg,#1A1A1A 0 33.33%,#FAE042 33.33% 66.66%,#ED2939 66.66%)',
  CIV: 'linear-gradient(90deg,#F77F00 0 33.33%,#fff 33.33% 66.66%,#009E60 66.66%)',
  SEN: 'radial-gradient(circle at 50% 50%,#00853F 0 7%,transparent 7.6%), linear-gradient(90deg,#00853F 0 33.33%,#FDEF42 33.33% 66.66%,#E31B23 66.66%)',

  // 03 · Horizontal tricolors  (NED clean; Ghana star; Spain 1:2:1)
  GER: 'linear-gradient(180deg,#1A1A1A 0 33.33%,#DD0000 33.33% 66.66%,#FFCE00 66.66%)',
  EGY: 'linear-gradient(180deg,#CE1126 0 33.33%,#fff 33.33% 66.66%,#1A1A1A 66.66%)',
  NED: 'linear-gradient(180deg,#AE1C28 0 33.33%,#fff 33.33% 66.66%,#21468B 66.66%)',
  GHA: 'radial-gradient(circle at 50% 50%,#1A1A1A 0 8%,transparent 8.6%), linear-gradient(180deg,#CE1126 0 33.33%,#FCD116 33.33% 66.66%,#006B3F 66.66%)',
  ESP: 'linear-gradient(180deg,#AA151B 0 25%,#F1BF00 25% 75%,#AA151B 75%)',

  // 04 · Andean yellow/blue/red 2:1:1  (Ecuador emblem dot + cooler blue)
  COL: 'linear-gradient(180deg,#FCD116 0 50%,#003893 50% 75%,#CE1126 75%)',
  ECU: 'radial-gradient(circle at 50% 42%,#7A5C2E 0 9%,transparent 9.6%), linear-gradient(180deg,#FFD100 0 50%,#034EA2 50% 75%,#ED1C24 75%)',

  // 05 · Red & white  (orientation + motif: bands H / bands V+dot / cross / disc)
  AUT: 'linear-gradient(180deg,#C8102E 0 33.33%,#fff 33.33% 66.66%,#C8102E 66.66%)',
  CAN: 'radial-gradient(circle at 50% 50%,#D52B1E 0 11%,transparent 11.6%), linear-gradient(90deg,#D52B1E 0 28%,#fff 28% 72%,#D52B1E 72%)',
  SUI: 'linear-gradient(#fff,#fff) 50% 50%/64% 30% no-repeat, linear-gradient(#fff,#fff) 50% 50%/30% 64% no-repeat, #DA291C',
  JPN: 'radial-gradient(circle at 50% 50%,#BC002D 0 23%,transparent 23.6%), #fff',

  // 06 · Red field + centered emblem
  TUR: 'radial-gradient(circle at 40% 50%,#fff 0 17%,transparent 17.6%), #E30A17',
  MAR: 'radial-gradient(circle at 50% 50%,#006233 0 19%,transparent 19.6%), #C1272D',
  KOR: 'radial-gradient(circle at 50% 50%,#CD2E3A 0 12%,#0047A0 12% 23%,transparent 23.6%), #fff',

  // 07 · Crosses (nordic & saltire)
  SWE: 'linear-gradient(#FECC00,#FECC00) 34% 0/16% 100% no-repeat, linear-gradient(#FECC00,#FECC00) 0 50%/100% 30% no-repeat, #006AA7',
  NOR: 'linear-gradient(#00205B,#00205B) 34% 0/8% 100% no-repeat, linear-gradient(#00205B,#00205B) 0 50%/100% 15% no-repeat, linear-gradient(#fff,#fff) 34% 0/18% 100% no-repeat, linear-gradient(#fff,#fff) 0 50%/100% 34% no-repeat, #BA0C2F',
  SCO: 'linear-gradient(45deg,transparent 43%,#fff 43% 57%,transparent 57%), linear-gradient(135deg,transparent 43%,#fff 43% 57%,transparent 57%), #0065BF',

  // 08 · Distinct / composite
  CZE: 'linear-gradient(135deg,#11457E 0 38%,transparent 38%), linear-gradient(180deg,#fff 0 50%,#D7141A 50%)',

  // CROATIA — ADOPTED replacement (decided). Supersedes the old plain
  // red/white/blue tricolor, which duplicated the new Netherlands. Same
  // tricolor + an abstracted red/white sahovnica checker dot. Assigning CRO
  // here OVERWRITES the existing entry when merged into JERSEY_BG.
  CRO: 'conic-gradient(from 0deg at 50% 50%,#D81E05 0 25%,#fff 0 50%,#D81E05 0 75%,#fff 0) 50% 30%/22% 22% no-repeat, linear-gradient(180deg,#FF0000 0 33.33%,#fff 33.33% 66.66%,#171796 66.66%)',
};

// export (match the project's window-export pattern if pasted into a .jsx file)
if (typeof module !== 'undefined') module.exports = { NEW_KITS };
