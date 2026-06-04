// notifs/data.jsx — notification feed + live arrivals for the Notifications / alerts surface.
// Reuses (loaded earlier): MANAGERS, mgr, ME_ID, MATCHES, matchScore, matchState, PERIOD_END,
//   DEFAULT_MIN, SQUAD_BY, player, JERSEY_BG, NATIONS.
//
// MODEL — notifications are grounded in the league's real mechanics so each one is legible:
//   • lock-on-play windows (a player kicks off → he locks; warn before)
//   • FAAB waiver batch results + void+refund
//   • all-play-all scoring + power-record standings movement
//   • guillotine survival / cut-line / elimination
//   • commissioner/league actions + the draft clock
// Past items are authored with a relative age; LIVE items arrive as the match clock advances and
// pop a toast.

// ----------------------------------------------------------------- categories ---
// functional color + icon + word (never color alone). tone maps to a ds functional token.
const NOTIF_CATS = {
  lock:    { label:'Lineup & locks', tone:'live',   short:'Locks' },
  waiver:  { label:'Waivers · FAAB',  tone:'refund', short:'Waivers' },
  score:   { label:'Scores',          tone:'win',    short:'Scores' },
  standing:{ label:'Standings',        tone:'info',   short:'Standings' },
  playoff: { label:'Playoffs',         tone:'elim',   short:'Playoffs' },
  league:  { label:'League',           tone:'locked', short:'League' },
  draft:   { label:'Draft',            tone:'accent', short:'Draft' },
};
const NOTIF_FILTERS = ['all','lock','waiver','score','playoff','league'];

function agoShort(min){
  if (min<=0) return 'now';
  if (min<60) return min+'m';
  const h=Math.floor(min/60); if (h<24) return h+'h';
  const d=Math.floor(h/24); return d+'d';
}
function agoLong(min){
  if (min<=0) return 'just now';
  if (min<60) return min+' min ago';
  const h=Math.floor(min/60); if (h<24) return h+(h===1?' hour ago':' hours ago');
  const d=Math.floor(h/24); return d+(d===1?' day ago':' days ago');
}

// player-kit ref helper (for "your player" notifications)
const pref = id => { const p = SQUAD_BY[id]; return p ? { id, name:`${p.first[0]}. ${p.last}`, nat:p.nat, pos:p.pos } : null; };

// ----------------------------------------------------------------- authored history ---
// id, cat, title, body, ageMin, read, optional cta {label, href}, optional player ref, optional emphasis
const NOTIF_HISTORY = [
  { id:'h1', cat:'waiver', ageMin:42, read:false, title:'You won J. Sancho for $26',
    body:'Beat 3 rival bids in the Tuesday batch. He’s in your squad — drop processed: T. Mitchell.',
    cta:{label:'View waivers', href:'Waivers.html'} },
  { id:'h2', cat:'waiver', ageMin:42, read:false, title:'Claim voided — refund $40',
    body:'Your bid on K. Mbappé was voided: his match had already kicked off. $40 returned to your FAAB.',
    tone:'refund', cta:{label:'View batch', href:'Waivers.html'} },
  { id:'h3', cat:'standing', ageMin:70, read:false, title:'You moved up to 4th',
    body:'Matchday 2 finished — you went 8–3 on the week and climbed two spots in the power record.',
    cta:{label:'Standings', href:'Standings.html'}, emphasis:'up' },
  { id:'h4', cat:'score', ageMin:73, read:true, title:'Matchday 2 final — you went 8–3 (W)',
    body:'You out-scored 8 of 11 managers with 71 points. Best week: V. Júnior, 14 pts.',
    cta:{label:'Vs the field', href:'Vs the Field.html'} },
  { id:'h5', cat:'league', ageMin:96, read:false, title:'Stat correction — L. Martínez',
    body:'Commissioner Marlon corrected a goal (1 → 2). Your total for Matchday 2 went up by 5 pts.',
    cta:{label:'Box score', href:'Player Box Score.html?p=p13'}, player:'p13' },
  { id:'h6', cat:'playoff', ageMin:150, read:true, title:'You survived Round 1',
    body:'You finished 3rd of 10 in the opening guillotine round. Two managers were cut. Round 2 is next.',
    cta:{label:'Playoffs', href:'Guillotine Playoffs.html'} },
  { id:'h7', cat:'lock', ageMin:155, read:true, title:'Lineup locked for Matchday 2',
    body:'All your starters’ matches kicked off. No more changes until the period ends.' },
  { id:'h8', cat:'league', ageMin:210, read:true, title:'FAAB reset to $100',
    body:'The group → playoff transition reset every manager’s waiver budget to a fresh $100.',
    cta:{label:'Waivers', href:'Waivers.html'} },
  { id:'h9', cat:'standing', ageMin:1440, read:true, title:'Weekly recap is ready',
    body:'Your Matchday 1 summary, power record and the league movers are in.',
    cta:{label:'Dashboard', href:'Dashboard.html'} },
  { id:'h10', cat:'draft', ageMin:7200, read:true, title:'Draft complete — grade: A−',
    body:'You built a balanced 15-man squad. Value pick of the draft: E. Fernández in round 6.',
    cta:{label:'My team', href:'My Team.html'} },
];

// ----------------------------------------------------------------- LIVE arrivals (match clock) ---
// Each fires when the sim minute t passes `min`. They prepend to the feed (ageMin 0) + pop a toast.
// Tied to the 4 staggered kickoffs so lock-on-play + acquisition-cutoff read.
const NOTIF_LIVE = [
  { id:'L1', min:0,   cat:'lock',   title:'ARG–MEX kicked off — 3 starters locked',
    body:'Romero, E. Fernández and L. Martínez are now playing. They’re locked for the rest of Matchday 3.', player:'p13' },
  { id:'L2', min:23,  cat:'score',  title:'GOAL — L. Martínez +5',
    body:'Argentina lead Mexico 1–0. Your forward gets the opener.', player:'p13', tone:'win', emphasis:'up' },
  { id:'L3', min:45,  cat:'lock',   title:'FRA–CRO kicked off — 3 more locked',
    body:'Saliba, Tchouaméni and Gvardiol are now in play and locked.', player:'p4' },
  { id:'L4', min:90,  cat:'waiver', title:'Last chance — claims for ENG–USA close at kickoff',
    body:'You have a pending bid on a USA midfielder. It voids + refunds if you don’t resolve before KO.',
    tone:'refund', cta:{label:'Review bid', href:'Waivers.html'} },
  { id:'L5', min:130, cat:'playoff',title:'Cut line alert — you’re 6th of 8',
    body:'One spot above the blade with the late games still to play. Stay above to survive Round 2.',
    tone:'elim', cta:{label:'Playoffs', href:'Guillotine Playoffs.html'} },
  { id:'L6', min:207, cat:'score',  title:'Matchday 3 nearly final — provisional 8–3 (W)',
    body:'A late surge lifted you clear. You’re beating 8 of 11 with one match left.',
    cta:{label:'Vs the field', href:'Vs the Field.html'}, emphasis:'up' },
];

// build the visible feed at sim minute t
function buildFeed(t, liveSeen){
  const live = NOTIF_LIVE.filter(e => e.min <= t).map(e => ({ ...e, ageMin:0, read:false, live:true }));
  // most-recent live first (highest min first), then history by age
  live.sort((a,b)=> b.min - a.min);
  return [...live, ...NOTIF_HISTORY];
}

// ----------------------------------------------------------------- preferences ---
// per-category channel matrix + quiet hours (settings/profile owns the full version later).
const NOTIF_CHANNELS = ['push','email','inapp'];
const NOTIF_PREF_ROWS = [
  { cat:'lock',    push:true,  email:false, inapp:true  },
  { cat:'waiver',  push:true,  email:true,  inapp:true  },
  { cat:'score',   push:false, email:false, inapp:true  },
  { cat:'standing',push:false, email:true,  inapp:true  },
  { cat:'playoff', push:true,  email:true,  inapp:true  },
  { cat:'league',  push:true,  email:false, inapp:true  },
  { cat:'draft',   push:true,  email:true,  inapp:true  },
];

Object.assign(window, {
  NOTIF_CATS, NOTIF_FILTERS, agoShort, agoLong, pref,
  NOTIF_HISTORY, NOTIF_LIVE, buildFeed,
  NOTIF_CHANNELS, NOTIF_PREF_ROWS,
});
