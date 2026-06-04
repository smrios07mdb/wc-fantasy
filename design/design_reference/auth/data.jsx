// auth/data.jsx — minimal model for the logged-out auth / join flow.
// Reuses MANAGERS, mgr, ME_ID from vsfield/data.jsx (loaded first) for the "who's already in" preview.
//
// PRIVATE LEAGUE: this is an invite-only / allowlist-gated league. Magic-link (passwordless) sign-in
// is primary; Google is an optional secondary. Only emails on the league allowlist can get in — a
// valid, well-formed email that isn't invited is REJECTED (the core edge case for a private league).

const AUTH_LEAGUE = { name:'WC Fantasy League', season:'World Cup 2026', spots:14 };

// the commissioner who owns the invite (distinct from "you" — here the perspective is a new joiner)
const AUTH_COMMISH = mgr('m3') || mgr(ME_ID);     // Marlon, by our mock

// managers already in (for the social-proof avatars on the invite)
const AUTH_ROSTER = MANAGERS.slice(0, 11);

// the invite this magic link is for (token-bound). Email is prefilled + on the allowlist.
const INVITE = {
  email: 'taylor.reed@gmail.com',
  invitedBy: AUTH_COMMISH,
  token: 'inv_8Kd92x',         // opaque; shown only as context
  spotsLeft: AUTH_LEAGUE.spots - AUTH_ROSTER.length,
};

// allowlist: every current manager's email + the open invite. A deterministic handle per manager.
const _handle = m => m.name.toLowerCase().replace(/[^a-z]/g,'') + '@example.com';
const ALLOWLIST = new Set([ ...MANAGERS.map(_handle), INVITE.email, 'demo@example.com' ]);

const emailValid = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((e||'').trim());
const onAllowlist = e => ALLOWLIST.has((e||'').trim().toLowerCase());

// the auth state machine views
const AUTH_VIEWS = [
  { id:'signin',     label:'Sign in' },
  { id:'checkemail', label:'Check email' },
  { id:'verifying',  label:'Verifying' },
  { id:'success',    label:'Welcome' },
  { id:'denied',     label:'Not invited' },
  { id:'expired',    label:'Link expired' },
  { id:'ratelimit',  label:'Rate limited' },
];

Object.assign(window, {
  AUTH_LEAGUE, AUTH_COMMISH, AUTH_ROSTER, INVITE, ALLOWLIST,
  emailValid, onAllowlist, AUTH_VIEWS,
});
