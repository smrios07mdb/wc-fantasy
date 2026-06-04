// fa/data.jsx — Free-agent / waiver-wire model for the "Free Agents" browser.
// Reuses globals (loaded earlier): MATCHES, matchState, NATIONS, JERSEY_BG, mgr, ME_ID,
//   MANAGERS, POS_ORDER, faabLeft, ROSTER_FAAB.
//
// UNIQUE OWNERSHIP: every player is owned by exactly ONE manager league-wide, or is a free
// agent (owner=null). The browser defaults to free agents; an "include owned" toggle reveals
// rostered players (dimmed, with their owner) so you can see the whole pool.
//
// ACQUISITION CUTOFF: you can't pick up a player once HIS match has kicked off — the SAME
// clock model as lock-on-play. Each free agent is tied to one of today's 4 staggered matches,
// so his cutoff is his match's kickoff. Past kickoff → locked out (CTA disabled).

// nation → (today's match, side). Today: mt0 ARG·MEX, mt1 FRA·CRO, mt2 ENG·USA, mt3 BRA·POR.
const FA_NAT_MATCH = {
  ARG:['mt0','home'], MEX:['mt0','away'], FRA:['mt1','home'], CRO:['mt1','away'],
  ENG:['mt2','home'], USA:['mt2','away'], BRA:['mt3','home'], POR:['mt3','away'],
};
// league-local kickoff clock per match slot (display only — data is UTC).
const FA_SLOT_CLOCK = ['14:00','15:00','17:30','20:00'];

// regional name pools (kept plausible per nation without claiming exactness).
const FA_REGION = { ARG:'lat', MEX:'lat', BRA:'lat', POR:'lat', FRA:'eur', CRO:'eur', ENG:'eng', USA:'eng' };
const FA_GIVEN = {
  lat:['Matías','Gonzalo','Rodrigo','Felipe','Santiago','Thiago','Joaquín','Nahuel','Iker','Gael','Vicente','Bruno','Emanuel','Lucas','Agustín'],
  eur:['Théo','Marko','Ivan','Mateo','Hugo','Antoine','Clément','Adrien','Florian','Josip','Nikola','Luka','Matěj','Karlo'],
  eng:['Harvey','Cole','Tyler','Reece','Mason','Brennan','Owen','Jaden','Caleb','Miles','Conor','Levi','Brooks','Tariq'],
};
const FA_SUR = {
  lat:['Herrera','Paredes','Quintero','Cardona','Vega','Fonseca','Barbosa','Nunes','Pereira','Mendoza','Salas','Ortega','Cabral','Tavares','Acuña','Montiel'],
  eur:['Lemaire','Dubois','Perić','Kovač','Brozić','Girard','Moreau','Lukić','Renard','Petković','Sušić','Caron','Vlašić','Marin'],
  eng:['Whitaker','Doyle','Brooks','Hayes','Sullivan','Carter','Lowe','Maddox','Turner','Aaronson','Dest','Greenwood','Ferguson','Pulis'],
};

// small deterministic PRNG so the pool is stable across reloads
function faRng(seed){ return function(){ seed|=0; seed=seed+0x6D2B79F5|0; let x=Math.imul(seed^seed>>>15,1|seed); x=x+Math.imul(x^x>>>7,61|x)^x; return ((x^x>>>14)>>>0)/4294967296; }; }

// per-nation roster of the pool: counts by position (gives each filter real depth)
const FA_PLAN = { GK:1, DEF:2, MID:2, FWD:1 };  // ×8 nations = 48 players

function buildFreeAgents(){
  const r = faRng(70260603);
  const nats = Object.keys(FA_NAT_MATCH);
  const used = new Set();
  const ptsBase = { GK:[10,34], DEF:[8,40], MID:[12,46], FWD:[10,50] };
  const pool = [];
  let id = 0;
  nats.forEach((nat, ni) => {
    const reg = FA_REGION[nat];
    POS_ORDER.forEach(pos => {
      const n = FA_PLAN[pos];
      for (let k=0;k<n;k++){
        let first, last, tries=0;
        do { first = FA_GIVEN[reg][Math.floor(r()*FA_GIVEN[reg].length)];
             last  = FA_SUR[reg][Math.floor(r()*FA_SUR[reg].length)]; tries++; }
        while (used.has(first+last) && tries<40);
        used.add(first+last);
        const [matchId, side] = FA_NAT_MATCH[nat];
        const [lo,hi] = ptsBase[pos];
        const szn  = Math.round(lo + r()*(hi-lo));
        const proj = Math.max(1, Math.round(szn/ (5 + r()*3)));    // illustrative next-period projection
        pool.push({ id:'fa'+(++id), first, last, pos, nat, matchId, side, szn, proj,
                    owner:null, dropped:false });
      }
    });
  });
  // sprinkle ownership (unique, one manager each) + a couple of fresh drops among the FAs
  const rivals = MANAGERS.filter(m=>m.id!==ME_ID).map(m=>m.id);
  const ownedIdx = [2,7,11,16,23,28,35,41];                       // ~8 of the pool are rostered
  ownedIdx.forEach((i, j) => { if (pool[i]) pool[i].owner = rivals[j % rivals.length]; });
  [4, 19, 31].forEach(i => { if (pool[i]) pool[i].dropped = true; });
  return pool;
}

const FA_POOL = buildFreeAgents();
const faMatch = p => MATCHES.find(x=>x.id===p.matchId);
const faOpp   = p => { const m=faMatch(p); return p.side==='home'? m.away : m.home; };
const faClock = p => FA_SLOT_CLOCK[faMatch(p).slot] || '—';

// acquisition state at period-minute t
function faCutoff(p, t){
  const m = faMatch(p);
  const st = matchState(m, t);                 // 'ytp' | 'live' | 'final'
  const ko = m.ko;
  return {
    phase: st.phase,
    open: st.phase==='ytp',                     // can still be acquired
    ko, clock: faClock(p),
    toKO: Math.max(0, ko - t),                  // period-minutes until his kickoff (cutoff)
    urgent: st.phase==='ytp' && (ko - t) <= 18, // closing soon
    matchMin: st.min,
  };
}
const faAvailable = (p) => p.owner==null;

// filter + sort the pool
function faList(t, { q='', pos='ALL', includeOwned=false, sort='season' }={}){
  let rows = FA_POOL.filter(p => {
    if (!includeOwned && p.owner!=null) return false;
    if (pos!=='ALL' && p.pos!==pos) return false;
    if (q){ const s=(p.first+' '+p.last).toLowerCase(); if (!s.includes(q.toLowerCase())) return false; }
    return true;
  });
  const posRank = id => POS_ORDER.indexOf(id);
  if (sort==='season')      rows.sort((a,b)=> b.szn - a.szn || posRank(a.pos)-posRank(b.pos));
  else if (sort==='pos')    rows.sort((a,b)=> posRank(a.pos)-posRank(b.pos) || b.szn - a.szn);
  else if (sort==='kickoff'){
    // soonest cutoff first; players whose match already started drop to the bottom
    rows.sort((a,b)=>{
      const ca=faCutoff(a,t), cb=faCutoff(b,t);
      if (ca.open!==cb.open) return ca.open ? -1 : 1;
      return ca.ko - cb.ko || b.szn - a.szn;
    });
  }
  return rows;
}

// counts for the header (free agents available now vs locked-out by cutoff)
function faCounts(t){
  const fas = FA_POOL.filter(faAvailable);
  let open=0, closed=0;
  fas.forEach(p => { faCutoff(p,t).open ? open++ : closed++; });
  return { total:fas.length, open, closed, owned: FA_POOL.length - fas.length };
}

const FA_POS_FILTERS = ['ALL','GK','DEF','MID','FWD'];
const FA_SORTS = [ {k:'season',label:'Season pts'}, {k:'pos',label:'Position'}, {k:'kickoff',label:'Kickoff'} ];

Object.assign(window, {
  FA_POOL, FA_NAT_MATCH, FA_SLOT_CLOCK, FA_POS_FILTERS, FA_SORTS,
  faMatch, faOpp, faClock, faCutoff, faAvailable, faList, faCounts,
});
