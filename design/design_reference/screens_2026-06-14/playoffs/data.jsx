// playoffs/data.jsx — the GUILLOTINE playoff model.
// Reuses globals (loaded earlier):
//   MANAGERS, mgr, ME_ID, PERIOD_END, DEFAULT_MIN, evalManager
//   buildStandings, cutContext (standings/data.jsx) — seeding feeds this screen
//   modeConf, buildLineup, lineupSummary, statusOf, evalSquadPlayer, SQUAD_PO (setlineup/data.jsx)
//
// MECHANIC — guillotine knockout. After the group stage, the top N seeds enter the playoffs.
// Each knockout ROUND everyone alive is scored on a REDUCED roster; the lowest scorer(s) are
// guillotined. Per-round cut count is ≈2 early, tapering to 1 (the exact schedule is an OPEN
// gap — set by the commissioner — so everything here is flagged provisional). Survivors persist
// round to round until one champion remains. Survivors reinforce via FAAB that RESET to a fresh
// $100 at the group→playoff transition. Field size (8 or 10) is flexible, fixed at the transition.

const PO_N = MANAGERS.length;                 // variable — never hardcode
const PO_FIELD_DEFAULT = 10;                  // provisional default field (8 or 10)
const PO_CURRENT_ROUND = 1;                   // index → Round 2 is live; Round 1 already settled

// ----------------------------------------------------------------- cut schedule (PROVISIONAL) ---
// Returns the per-round cut counts until a single champion remains. The product spec says
// "≈2 early, tapering to 1" but the EXACT counts are unspecified — these are illustrative
// presets a commissioner would set, exposed as a Tweak so the provisionality is explicit.
function cutSchedule(field, preset){
  let cuts = [], n = field;
  if (preset === 'gentle'){                   // one cut per round — the long march
    while (n > 1){ cuts.push(1); n -= 1; }
  } else if (preset === 'steep'){             // two per round as long as possible — fast & brutal
    while (n > 1){ const c = Math.min(2, n - 1); cuts.push(c); n -= c; }
  } else {                                    // default — two early, taper to one by the final four
    while (n > 1){ let c = n >= 6 ? 2 : 1; c = Math.min(c, n - 1); cuts.push(c); n -= c; }
  }
  return cuts;
}
const PO_PRESET_LABEL = { default:'Taper · 2→1', steep:'Steep · 2,2,2…', gentle:'Gentle · 1,1,1…' };

// ----------------------------------------------------------------- seeding (from standings) ---
// Seeds are the qualified rows of the group-stage power-record table at full time.
function poSeeds(field){
  const rows = cutContext(buildStandings(PERIOD_END), field);
  return rows.filter(r => r.qualified).map((r, i) => ({
    id: r.m.id, seed: i + 1, gW: r.W, gL: r.L, gPts: r.total,
  }));
}

// ----------------------------------------------------------------- round-1 (settled) points ---
// Illustrative single-round totals for every manager. Only entrants are used. Authored so the
// two lowest-scoring entrants (m5, m11) fall in Round 1, leaving the eight scripted survivors.
const PO_R1_PTS = {
  m8:77, m1:72, me:68, m3:64, m2:61, m7:59, m10:55, m12:52,
  m11:49, m9:46, m5:44, m6:40,
};

// ----------------------------------------------------------------- round-2 (LIVE) timelines ---
// Each survivor scores across the round; the sim clock t (0…PERIOD_END) drives it, tied to the
// four staggered kickoffs so lock-on-play reads. Authored so that AT the default minute (~110)
// YOU sit 6th of 8 — one place above the cut — with m10 breathing down your neck (m10 actually
// leads you earlier in the round, then you pull clear with a late surge). Point VALUES are
// illustrative pending SCORING.md.
const PO_R2_STEPS = {
  m8: [{min:1,d:2},{min:23,d:8},{min:50,d:8},{min:64,d:6},{min:100,d:6},{min:150,d:8},{min:210,d:6}],   // 44 — round leader
  m1: [{min:1,d:3},{min:45,d:8},{min:64,d:8},{min:96,d:8},{min:150,d:7},{min:205,d:6}],                  // 40
  m3: [{min:1,d:2},{min:30,d:8},{min:70,d:8},{min:96,d:6},{min:150,d:6},{min:205,d:6}],                  // 36
  m2: [{min:1,d:4},{min:45,d:9},{min:96,d:9},{min:150,d:5},{min:205,d:6}],                               // 33
  m7: [{min:1,d:2},{min:40,d:9},{min:100,d:9},{min:150,d:5},{min:200,d:4}],                              // 29
  me: [{min:1,d:2},{min:30,d:4},{min:64,d:6},{min:96,d:7},{min:150,d:6},{min:207,d:6}],                  // 31 — climbs to 6th by ~110, late surge clears the line
  m10:[{min:1,d:2},{min:23,d:6},{min:45,d:6},{min:64,d:4},{min:150,d:4},{min:205,d:2}],                  // 24 — front-loaded, fades
  m12:[{min:1,d:2},{min:45,d:5},{min:96,d:5},{min:150,d:4},{min:205,d:3}],                               // 19 — doomed
};
function poFallbackFinal(id){ return 22; }     // any unexpected survivor ramps smoothly to ~22
function roundLivePts(id, t){
  const tl = PO_R2_STEPS[id];
  if (tl){ let s = 0; tl.forEach(e => { if (e.min <= t) s += e.d; }); return s; }
  const frac = Math.max(0, Math.min(1, t / (PERIOD_END * 0.9)));
  return Math.round(poFallbackFinal(id) * frac);
}

// ----------------------------------------------------------------- build the bracket model ---
function buildGuillotine(field, preset, t){
  const cuts = cutSchedule(field, preset);
  const totalRounds = cuts.length;
  const currentRoundIdx = Math.min(PO_CURRENT_ROUND, totalRounds - 1);
  const seeds = poSeeds(field);
  const seedOf = {}; seeds.forEach(s => { seedOf[s.id] = s.seed; });

  const rounds = [];
  let entrants = seeds.map(s => s.id);          // known ids through the live round
  for (let ri = 0; ri < totalRounds; ri++){
    const cut = cuts[ri];
    const status = ri < currentRoundIdx ? 'past' : ri === currentRoundIdx ? 'live' : 'future';

    if (status === 'future'){
      const enter = entrants.length;
      rounds.push({ idx:ri, cut, status, fieldCount:enter, survives:Math.max(1,enter-cut),
        ranked:null, survivors:null, eliminatedIds:null, live:false });
      entrants = new Array(Math.max(1, enter - cut));   // count placeholder only
      continue;
    }

    const scoreFn = status === 'past' ? (id => PO_R1_PTS[id] ?? 30) : (id => roundLivePts(id, t));
    let ranked = entrants.map(id => ({ id, m:mgr(id), seed:seedOf[id], pts:scoreFn(id) }));
    ranked.sort((a, b) => b.pts - a.pts || a.seed - b.seed);
    const survN = entrants.length - cut;
    ranked.forEach((r, i) => {
      r.rank = i + 1;
      const below = i >= survN;
      r.eliminated = status === 'past' && below;     // past → struck out
      r.inZone     = status === 'live' && below;     // live → facing the blade (provisional)
      r.safe       = !below;
    });
    const survivors     = ranked.filter(r => !(r.rank > survN)).map(r => r.id);
    const eliminatedIds = ranked.filter(r => r.rank > survN).map(r => r.id);
    rounds.push({ idx:ri, cut, status, fieldCount:entrants.length, survives:survN,
      ranked, survivors, eliminatedIds, live:status === 'live' });
    entrants = survivors;
  }

  const cur = rounds[currentRoundIdx];
  const me = cur.ranked ? cur.ranked.find(r => r.id === ME_ID) : null;
  return {
    cuts, totalRounds, currentRoundIdx, rounds, seeds, seedOf,
    field, preset, cutThisRound: cuts[currentRoundIdx],
    aliveNow: cur.fieldCount, survivesNow: cur.survives, me,
  };
}

// margin to the cut line for a given live ranked list (pts above/below the worst survivor)
function cutMargin(ranked, survN){
  const sorted = ranked;                        // already ranked
  const lastSafe = sorted[survN - 1];
  const firstCut = sorted[survN];
  if (!lastSafe || !firstCut) return null;
  return { lastSafe, firstCut, gap: lastSafe.pts - firstCut.pts };
}

// ----------------------------------------------------------------- MY reduced playoff lineup ---
// Reuse the Set-Lineup playoff mode exactly: 9-man squad → 7 starters (1 GK + 6 outfield) + 2 bench.
const PO_FORMATION = '2-3-1';
function myReducedLineup(){ return buildLineup('playoff', PO_FORMATION); }
function myReducedSummary(lineup, t){ return lineupSummary(lineup, 'playoff', t); }

// ----------------------------------------------------------------- FAAB reinforcement ---
// Budget RESETS to a fresh $100 at the group→playoff transition. Illustrative remaining figure.
const PO_FAAB = { budget:100, left:84, pending:1, pendingTotal:16, batchInMin:512 };

Object.assign(window, {
  PO_N, PO_FIELD_DEFAULT, PO_CURRENT_ROUND, PO_PRESET_LABEL,
  cutSchedule, poSeeds, PO_R1_PTS, PO_R2_STEPS, roundLivePts,
  buildGuillotine, cutMargin,
  PO_FORMATION, myReducedLineup, myReducedSummary, PO_FAAB,
});
