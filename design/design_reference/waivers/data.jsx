// waivers/data.jsx — FAAB blind-bid waivers model.
// Reuses globals (loaded earlier): FA_POOL, faAvailable, faCutoff, faMatch, faClock, faOpp,
//   SQUAD, player, statusOf, seasonPts, MANAGERS, mgr, ME_ID, ROSTER_FAAB, faabLeft, NATIONS.
//
// THE MECHANIC (design FOR it):
//  • $100 FAAB budget. Bids are BLIND + SEALED — you see only your own pending claims; rivals'
//    bids are fully hidden (neither the amount nor that they exist is shown).
//  • Claims process in a BATCH at the waiver deadline. Within the batch, ties on bid amount are
//    broken by ROLLING waiver order (the order rotates as claims are won).
//  • You can't claim a player once HIS match kicks off — a standing bid on a kicked-off player is
//    VOID + REFUND (same acquisition-cutoff clock as lock-on-play / the Free Agents screen).
//  • Squad is always 15, so every claim names a DROP. FAAB resets to a fresh $100 at the
//    group→playoff transition.

// rolling waiver priority (manager order). Lower index = higher priority this cycle.
const WAIVER_ORDER = (() => {
  // deterministic-ish order with me at #4 (rolling — rotates after each won claim)
  const ids = MANAGERS.map(m=>m.id);
  const order = ['m3','m9','m6', ME_ID, 'm2','m11','m5','m8','m1','m12','m7','m10'];
  return order.filter(id => ids.includes(id));
})();
const myWaiverPriority = () => WAIVER_ORDER.indexOf(ME_ID) + 1;

// how many RIVAL managers have a (sealed) pending bid on a given free agent — amounts hidden.
const _rivalSeed = { };
function rivalBids(addId){
  if (addId in _rivalSeed) return _rivalSeed[addId];
  // deterministic from id digits: popular players draw more sealed bids
  const n = parseInt(String(addId).replace(/\D/g,''),10) || 0;
  const v = [0,0,1,0,2,1,0,3,1,0,2][n % 11];
  _rivalSeed[addId] = v; return v;
}

// my initial pending claims — chosen from the live FA pool so they ride the cutoff clock.
// one target sits in an already-kicked-off match (demonstrates VOID+REFUND at the default minute).
function _pickInitialBids(){
  const byMatch = {};
  FA_POOL.filter(faAvailable).forEach(p => { (byMatch[p.matchId]=byMatch[p.matchId]||[]).push(p); });
  Object.values(byMatch).forEach(a => a.sort((x,y)=> y.szn - x.szn));
  // mt1 KO=45 (already started at the default minute → void demo), mt2 KO=95, mt3 KO=140 (valid)
  const targets = ['mt1','mt2','mt3'].map(mid => (byMatch[mid]||[])[0]).filter(Boolean);
  // drops: my weakest movable squad players (distinct), by season points
  const drops = [...SQUAD].sort((a,b)=> seasonPts(a.id) - seasonPts(b.id)).map(p=>p.id);
  const amts = [24, 12, 7];
  return targets.map((p,i) => ({
    id:'bid'+(i+1), addId:p.id, dropId: drops[i], amount: amts[i] ?? 5, priority: i+1,
  }));
}
const INITIAL_BIDS = _pickInitialBids();

// claim validity at minute t — void if the target's match has kicked off (cutoff passed).
function claimStatus(bid, t){
  const p = FA_POOL.find(x=>x.id===bid.addId);
  if (!p) return 'valid';
  return faCutoff(p, t).open ? 'valid' : 'void';
}
const committed = (bids) => bids.filter(b=>true).reduce((s,b)=>s+b.amount, 0);
// only non-void claims actually spend; void ones refund.
const committedActive = (bids, t) => bids.reduce((s,b)=> s + (claimStatus(b,t)==='void'?0:b.amount), 0);

// budget state for the active phase (playoff resets to a fresh $100).
function faabState(phase, bids, t){
  const budget = 100;
  const priorSpent = phase==='playoff' ? 0 : ROSTER_FAAB.spent;     // group: already spent $49
  const left = budget - priorSpent;
  const pend = committedActive(bids, t);
  return { budget, priorSpent, left, pending:pend, after: left - pend };
}

// free agents I can still claim (claimable now, not already in my pending list)
function claimableFAs(t, bids, { q='', pos='ALL' }={}){
  const taken = new Set(bids.map(b=>b.addId));
  return FA_POOL.filter(p => {
    if (!faAvailable(p)) return false;
    if (taken.has(p.id)) return false;
    if (!faCutoff(p, t).open) return false;            // can't claim once his match started
    if (pos!=='ALL' && p.pos!==pos) return false;
    if (q){ const s=(p.first+' '+p.last).toLowerCase(); if(!s.includes(q.toLowerCase())) return false; }
    return true;
  }).sort((a,b)=> b.szn - a.szn);
}

// my droppable squad players (can't drop a player locked on play)
function droppableSquad(t){
  return SQUAD.filter(p => statusOf(p.id, t)==='movable')
             .sort((a,b)=> seasonPts(a.id) - seasonPts(b.id));
}

// ----- next batch + history -----
const BATCH = { label:'Tonight', clock:'03:00', inMin: 9*60+20, tz:'league-local' };  // illustrative cadence

// past batch results (sealed amounts revealed post-processing). Mixed outcomes incl. void+refund.
const HISTORY = [
  { id:'b-md2', when:'After Matchday 2', date:'2 days ago', results:[
    { add:{first:'Niklas',last:'Süle',pos:'DEF',nat:'GER'}, winnerId:'m7', amount:22, beat:2, drop:'K. Mbappé Jr', outcome:'won', mine:false },
    { add:{first:'Brais',last:'Méndez',pos:'MID',nat:'ESP'}, winnerId:ME_ID, amount:14, beat:1, drop:'T. Adams', outcome:'won', mine:true },
    { add:{first:'Cody',last:'Gakpo',pos:'FWD',nat:'NED'}, winnerId:'m3', amount:31, beat:4, drop:'J. Sancho', outcome:'won', mine:false },
    { add:{first:'Yunus',last:'Musah',pos:'MID',nat:'USA'}, winnerId:ME_ID, amount:9, beat:0, drop:'—', outcome:'void', refund:9, mine:true, note:'his match kicked off before the batch' },
  ]},
  { id:'b-md1', when:'After Matchday 1', date:'6 days ago', results:[
    { add:{first:'Manuel',last:'Akanji',pos:'DEF',nat:'SUI'}, winnerId:'m1', amount:17, beat:3, drop:'D. Vlahović', outcome:'won', mine:false },
    { add:{first:'Pervis',last:'Estupiñán',pos:'DEF',nat:'ECU'}, winnerId:ME_ID, amount:6, beat:1, drop:'N. Williams', outcome:'lost', mine:true, note:'outbid — m5 bid $11' },
    { add:{first:'Hwang',last:'Hee-chan',pos:'FWD',nat:'KOR'}, winnerId:'m10', amount:8, beat:0, drop:'L. Insigne', outcome:'won', mine:false },
  ]},
];

const WV_POS = ['ALL','GK','DEF','MID','FWD'];
const wvFmtH = (m)=>{ if(m<=0) return 'now'; const h=Math.floor(m/60), mm=m%60; return h>0?`${h}h ${mm}m`:`${mm}m`; };

Object.assign(window, {
  WAIVER_ORDER, myWaiverPriority, rivalBids, INITIAL_BIDS, claimStatus,
  committed, committedActive, faabState, claimableFAs, droppableSquad,
  BATCH, HISTORY, WV_POS, fmtH: window.fmtH || wvFmtH,
});
