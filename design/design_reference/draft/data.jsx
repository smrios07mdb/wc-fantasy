// draft/data.jsx — mock data for the draft room. Exports to window.
// Real national teams + plausible player names. N managers is variable (default 12).

// ---- Nations: flag rendered as CSS gradient (no external assets) ----
const NATIONS = {
  ARG:{n:'Argentina', f:'linear-gradient(180deg,#75AADB 0 33%,#fff 33% 66%,#75AADB 66%)'},
  FRA:{n:'France', f:'linear-gradient(90deg,#0055A4 0 33%,#fff 33% 66%,#EF4135 66%)'},
  ENG:{n:'England', f:'linear-gradient(180deg,#fff 0 45%,#CF142B 45% 55%,#fff 55%)'},
  BRA:{n:'Brazil', f:'linear-gradient(135deg,#009C3B 0 50%,#FFDF00 50%)'},
  ESP:{n:'Spain', f:'linear-gradient(180deg,#AA151B 0 25%,#F1BF00 25% 75%,#AA151B 75%)'},
  GER:{n:'Germany', f:'linear-gradient(180deg,#000 0 33%,#DD0000 33% 66%,#FFCE00 66%)'},
  POR:{n:'Portugal', f:'linear-gradient(90deg,#006600 0 40%,#FF0000 40%)'},
  NED:{n:'Netherlands', f:'linear-gradient(180deg,#AE1C28 0 33%,#fff 33% 66%,#21468B 66%)'},
  BEL:{n:'Belgium', f:'linear-gradient(90deg,#000 0 33%,#FAE042 33% 66%,#ED2939 66%)'},
  CRO:{n:'Croatia', f:'linear-gradient(180deg,#FF0000 0 33%,#fff 33% 66%,#171796 66%)'},
  USA:{n:'USA', f:'linear-gradient(180deg,#B22234 0 50%,#fff 50%),#3C3B6E'},
  MEX:{n:'Mexico', f:'linear-gradient(90deg,#006847 0 33%,#fff 33% 66%,#CE1126 66%)'},
  ITA:{n:'Italy', f:'linear-gradient(90deg,#009246 0 33%,#fff 33% 66%,#CE2B37 66%)'},
  URU:{n:'Uruguay', f:'linear-gradient(180deg,#fff 0 50%,#7AB2DD 50%)'},
  COL:{n:'Colombia', f:'linear-gradient(180deg,#FCD116 0 50%,#003893 50% 75%,#CE1126 75%)'},
  JPN:{n:'Japan', f:'radial-gradient(circle at 50% 50%,#BC002D 22%,#fff 23%)'},
  KOR:{n:'South Korea', f:'radial-gradient(circle at 50% 50%,#CD2E3A 18%,#0047A0 19% 24%,#fff 25%)'},
  SEN:{n:'Senegal', f:'linear-gradient(90deg,#00853F 0 33%,#FDEF42 33% 66%,#E31B23 66%)'},
  MAR:{n:'Morocco', f:'linear-gradient(135deg,#C1272D 0 55%,#006233 55%)'},
  NGA:{n:'Nigeria', f:'linear-gradient(90deg,#008751 0 33%,#fff 33% 66%,#008751 66%)'},
};
function flagStyle(code){ return { background: (NATIONS[code]||{}).f || 'var(--surface-3)', backgroundSize:'cover' }; }

// ---- Managers (league members — people, not nations). N variable. ----
const MANAGERS = [
  {id:'m1', name:'Tomás', init:'Tó', color:'#2E8B8B', online:true},
  {id:'m2', name:'Wei', init:'We', color:'#B0823A', online:true},
  {id:'m3', name:'Jordi', init:'Jo', color:'#5C7CFF', online:true},
  {id:'me', name:'Margaux', init:'MK', color:'#7C5CFF', online:true, isMe:true},
  {id:'m5', name:'Priya', init:'Pr', color:'#C0568A', online:true},
  {id:'m6', name:'Diego', init:'Di', color:'#3FA66A', online:false},
  {id:'m7', name:'Lena', init:'Le', color:'#D08A3E', online:true},
  {id:'m8', name:'Omar', init:'Om', color:'#4C9BC0', online:true},
  {id:'m9', name:'Sofia', init:'So', color:'#B5524E', online:false},
  {id:'m10', name:'Kenji', init:'Ke', color:'#6E8A2E', online:true},
  {id:'m11', name:'Aïcha', init:'Aï', color:'#8A5CC0', online:true},
  {id:'m12', name:'Nils', init:'Ni', color:'#3E8FD0', online:true},
];
const ME_ID = 'me';

// ---- Player pool ----
// Marquee real-ish players, then procedurally-generated depth to fill ~15 rounds.
const STARS = [
  ['Kylian','Mbappé','FRA','FWD',112],['Erling','Haaland','NOR','FWD',108],
  ['Vinícius','Júnior','BRA','FWD',104],['Lionel','Messi','ARG','FWD',101],
  ['Harry','Kane','ENG','FWD',99],['Lautaro','Martínez','ARG','FWD',92],
  ['Julián','Álvarez','ARG','FWD',90],['Rafael','Leão','POR','FWD',88],
  ['Bukayo','Saka','ENG','MID',95],['Jude','Bellingham','ENG','MID',97],
  ['Jamal','Musiala','GER','MID',93],['Pedri','González','ESP','MID',89],
  ['Federico','Valverde','URU','MID',86],['Kevin','De Bruyne','BEL','MID',91],
  ['Florian','Wirtz','GER','MID',88],['Bernardo','Silva','POR','MID',84],
  ['Rodri','Hernández','ESP','MID',82],['Declan','Rice','ENG','MID',79],
  ['Achraf','Hakimi','MAR','DEF',81],['Rúben','Dias','POR','DEF',78],
  ['Virgil','van Dijk','NED','DEF',80],['Antonio','Rüdiger','GER','DEF',76],
  ['William','Saliba','FRA','DEF',77],['Alphonso','Davies','CAN','DEF',79],
  ['Theo','Hernández','FRA','DEF',75],['Josko','Gvardiol','CRO','DEF',74],
  ['Emiliano','Martínez','ARG','GK',72],['Thibaut','Courtois','BEL','GK',70],
  ['Marc-André','ter Stegen','GER','GK',68],['Mike','Maignan','FRA','GK',67],
  ['Gianluigi','Donnarumma','ITA','GK',66],['Jordan','Pickford','ENG','GK',64],
  ['Phil','Foden','ENG','MID',85],['Cole','Palmer','ENG','MID',83],
  ['Nico','Williams','ESP','FWD',80],['Lamine','Yamal','ESP','FWD',86],
  ['Antoine','Griezmann','FRA','FWD',82],['Olivier','Giroud','FRA','FWD',64],
  ['Christian','Pulisic','USA','MID',74],['Hirving','Lozano','MEX','FWD',62],
];
const FIRST = ['Lucas','Marco','Diego','Andrés','Mateo','Luka','Ivan','Samuel','Noah','Yuki','Min-jae','Sadio','Youssef','Ola','Felix','Karim','Bruno','João','Sergio','Carlos','Niklas','Joel','Adam','Leon','Pau','Nico','Enzo','Frenkie','Dani','Raphaël'];
const LAST = ['Silva','Fernández','Costa','Moreno','Kovačić','Hansen','Tanaka','Diallo','Bensaïd','Okafor','Müller','Andersson','Romero','Lopez','Schmidt','Rossi','Nakamura','Kim','Traoré','Sánchez','Becker','Vargas','Novak','Persson','Haaland','Olsen','Vermeer','Kruse','Mendes','Acosta'];
const NAT_CODES = Object.keys(NATIONS);
const POS_DIST = ['GK','DEF','DEF','DEF','MID','MID','MID','MID','FWD','FWD'];

function buildPool(){
  const pool = [];
  STARS.forEach((s,i)=> pool.push({ id:'p'+i, first:s[0], last:s[1], nat:s[2], pos:s[3], proj:s[4] }));
  let proj = 60;
  for(let i=0;i<200;i++){
    const pos = POS_DIST[i % POS_DIST.length];
    const first = FIRST[(i*11+2)%FIRST.length];
    const last = LAST[(i*13+7)%LAST.length];
    const nat = NAT_CODES[(i*3)%NAT_CODES.length];
    proj = Math.max(6, 60 - i*0.26 - (pos==='GK'?6:0)) + ((i*13)%9);
    pool.push({ id:'g'+i, first, last, nat: (NATIONS[nat]?nat:'BRA'), pos, proj: +proj.toFixed(1) });
  }
  // de-dup names roughly + assign opponent / kickoff for cutoff demo
  const OPP = [['MEX','19:00'],['CRO','21:00'],['JPN','16:00'],['USA','19:00'],['POR','21:00'],['NED','16:00']];
  pool.forEach((p,i)=>{ const o = OPP[i%OPP.length]; p.opp=o[0]; p.ko=o[1]; p.bye = (i%9===4); });
  return pool.sort((a,b)=> b.proj - a.proj);
}
const POOL = buildPool();

const ROUNDS = 15;                 // 15-man squad
const POS_REQ = { GK:2, DEF:5, MID:5, FWD:3 };
const PICK_SECONDS = 60;           // server-authoritative pick clock

Object.assign(window, { NATIONS, flagStyle, MANAGERS, ME_ID, POOL, ROUNDS, POS_REQ, PICK_SECONDS });
