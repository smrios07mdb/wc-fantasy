// settings/data.jsx — profile / account / league / appearance model for the Settings surface.
// Reuses: MANAGERS, mgr, ME_ID, NATIONS (vsfield/data); NOTIF_PREF_ROWS, NOTIF_CATS (notifs/data).

const ME = mgr(ME_ID);

// ----------------------------------------------------------------- profile ---
const PROFILE_INIT = {
  displayName: 'Cesar',
  teamName: 'Cesar’s XI',
  handle: 'cesar',
  favoriteTeam: 'ARG',            // WC team you’re backing — a flag chip
  bio: 'Drafting on the laptop, sweating the lineup on my phone. Three-time finalist, zero titles.',
  joined: 'Founding manager · since 2024',
  isCommissioner: true,
};

// ----------------------------------------------------------------- account ---
const ACCOUNT = {
  email: 'cesar@example.com',
  emailVerified: true,
  google: { connected: true, email: 'cesar@gmail.com' },
  passwordless: true,
  sessions: [
    { id:'s1', device:'MacBook Pro · Chrome', where:'San Francisco, US', current:true,  lastSeen:'Active now' },
    { id:'s2', device:'iPhone 15 · Safari',    where:'San Francisco, US', current:false, lastSeen:'2h ago' },
    { id:'s3', device:'iPad · App',            where:'London, UK',        current:false, lastSeen:'3d ago' },
  ],
};

// ----------------------------------------------------------------- league ---
const LEAGUE_INFO = {
  name: 'WC Fantasy League',
  season: 'World Cup 2026',
  managers: MANAGERS.length,
  commissioner: mgr('m3'),         // Marlon
  yourSeed: 4,
  yourRecord: '8–3',
  scoring: 'All-play-all · power record',
};
const TIMEZONES = [
  'UTC (league default)',
  'America/New_York (EST)',
  'America/Los_Angeles (PST)',
  'Europe/London (GMT)',
  'Europe/Madrid (CET)',
];

// ----------------------------------------------------------------- appearance (real, drives root) ---
const THEMES    = [ { id:'dark', label:'Dark' }, { id:'light', label:'Light' }, { id:'system', label:'System' } ];
const DENSITIES = [ { id:'comfortable', label:'Comfortable' }, { id:'compact', label:'Compact' } ];
// the design system's three accent directions — personalization re-tints "you" + primary actions
const ACCENTS = [
  { id:'cobalt', label:'Cobalt', hex:'#4D8DFF' },
  { id:'green',  label:'Emerald', hex:'#2FD39A' },
  { id:'violet', label:'Violet', hex:'#8B7CFF' },
];
const APPEARANCE_INIT = { theme:'dark', density:'comfortable', accent:'cobalt', reduceMotion:false };

// ----------------------------------------------------------------- sections ---
const SETTINGS_SECTIONS = [
  { id:'profile',  label:'Profile',       icon:'user' },
  { id:'account',  label:'Account',       icon:'key' },
  { id:'notifs',   label:'Notifications', icon:'bell' },
  { id:'appearance',label:'Appearance',   icon:'sun' },
  { id:'league',   label:'League',        icon:'flag' },
  { id:'danger',   label:'Sign out & danger', icon:'alert' },
];

Object.assign(window, {
  ME, PROFILE_INIT, ACCOUNT, LEAGUE_INFO, TIMEZONES,
  THEMES, DENSITIES, ACCENTS, APPEARANCE_INIT, SETTINGS_SECTIONS,
});
