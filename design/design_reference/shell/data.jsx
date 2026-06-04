// shell/data.jsx — Phase 5 connective tissue: the ONE canonical IA for the whole product.
// Every destination is a real screen file. Reuses MANAGERS/ME_ID/mgr (vsfield) and
// buildFeed (notifs) for the persistent bell unread count. League name is the placeholder.
//
// NAMING: this file owns SHELL_* globals only — it must never redeclare `NAV` (that const
// already lives in dashboard/desktop.jsx and would collide in global scope).

const SHELL_LEAGUE_NAME = 'WC Fantasy League';   // PLACEHOLDER (4-spot swap when real name lands)

// --- icon keys map to inline SVGs in shell/components.jsx (NAV_ICON) -------------
// id          label                href                          icon
const SHELL_HOME = { id:'home', label:'Home', href:null, icon:'home' };

// Flat PRIMARY list — the 5–6 most-used destinations (always visible on desktop) ---
const SHELL_NAV_PRIMARY = [
  SHELL_HOME,
  { id:'team',      label:'My Team',     href:'My Team.html',           icon:'team' },
  { id:'lineup',    label:'Set Lineup',  href:'Set Lineup.html',        icon:'lineup' },
  { id:'field',     label:'The Field',   href:'Vs the Field.html',      icon:'field' },
  { id:'standings', label:'Standings',   href:'Standings.html',         icon:'standings' },
  { id:'fa',        label:'Free Agents', href:'Free Agents.html',       icon:'market' },
];

// Everything else lives under the "More" overflow -------------------------------
const SHELL_NAV_MORE = [
  { id:'waivers',  label:'Waivers',            href:'Waivers.html',            icon:'waivers' },
  { id:'draft',    label:'Draft Room',         href:'Draft Room.html',         icon:'draft' },
  { id:'playoffs', label:'Guillotine Playoffs',href:'Guillotine Playoffs.html',icon:'playoffs' },
  { id:'box',      label:'Player Box Score',   href:'Player Box Score.html',   icon:'box' },
  { id:'notifs',   label:'Notifications',      href:'Notifications.html',      icon:'bell' },
  { id:'settings', label:'Settings',           href:'Settings.html',           icon:'settings' },
];

// Commissioner-only — slate "elevated privileges" entry, gated by is_commissioner -
const SHELL_NAV_COMMISH = { id:'admin', label:'Commissioner', href:'Commissioner.html', icon:'shield' };

// Mobile tab-bar — exactly 5 slots. Market + More open bottom sheets. ------------
const SHELL_MOBILE_TABS = [
  SHELL_HOME,
  { id:'team',   label:'My Team',   href:'My Team.html',      icon:'team' },
  { id:'field',  label:'The Field', href:'Vs the Field.html', icon:'field' },
  { id:'market', label:'Market',    sheet:'market',           icon:'market' },
  { id:'more',   label:'More',      sheet:'more',             icon:'more' },
];

// Market sheet — the acquisition surfaces grouped together ------------------------
const SHELL_MARKET_GROUP = [
  { id:'fa',      label:'Free Agents', href:'Free Agents.html', icon:'market',  hint:'Browse the wire' },
  { id:'waivers', label:'Waivers',     href:'Waivers.html',     icon:'waivers', hint:'Blind FAAB bids' },
  { id:'draft',   label:'Draft Room',  href:'Draft Room.html',  icon:'draft',   hint:'Snake draft' },
];

// More sheet (mobile) — note Standings is PRIMARY on desktop but lives here on phone
function shellMoreGroup(isCommish){
  const base = [
    { id:'standings', label:'Standings',          href:'Standings.html',          icon:'standings', hint:'Power record' },
    { id:'playoffs',  label:'Guillotine Playoffs',href:'Guillotine Playoffs.html',icon:'playoffs',  hint:'Survive the cut' },
    { id:'box',       label:'Player Box Score',   href:'Player Box Score.html',   icon:'box',       hint:'Scoring detail' },
    { id:'notifs',    label:'Notifications',      href:'Notifications.html',      icon:'bell',      hint:'Your alerts' },
    { id:'settings',  label:'Settings',           href:'Settings.html',           icon:'settings',  hint:'Profile · appearance' },
  ];
  if(isCommish) base.push({ ...SHELL_NAV_COMMISH, hint:'Elevated privileges', commish:true });
  return base;
}

// Avatar menu — identity actions. Sign out lands on the logged-out auth flow. -----
function shellAvatarMenu(isCommish){
  const items = [
    { id:'profile',  label:'Profile',  href:'Settings.html',  icon:'team' },
    { id:'settings', label:'Settings', href:'Settings.html',  icon:'settings' },
  ];
  if(isCommish) items.push({ id:'admin', label:'Commissioner console', href:'Commissioner.html', icon:'shield', commish:true });
  items.push({ id:'signout', label:'Sign out', href:'Join.html', icon:'signout', danger:true });
  return items;
}

// --- bell unread -----------------------------------------------------------------
// Persistent chrome: the bell badge reads the SAME feed as Notifications.html so the
// count is consistent product-wide. buildFeed(t) yields items with a .read flag.
function shellUnread(t){
  try { return buildFeed(t).filter(n => !n.read).length; }
  catch(e){ return 0; }
}

// active-id helper so any screen could highlight its own nav entry later
function shellActiveId(currentId){ return currentId || 'home'; }

Object.assign(window, {
  SHELL_LEAGUE_NAME,
  SHELL_HOME, SHELL_NAV_PRIMARY, SHELL_NAV_MORE, SHELL_NAV_COMMISH,
  SHELL_MOBILE_TABS, SHELL_MARKET_GROUP, shellMoreGroup, shellAvatarMenu,
  shellUnread, shellActiveId,
});
