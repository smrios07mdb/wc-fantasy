// auth/components.jsx — the logged-out auth / join flow. One responsive <AuthFlow> rendered in
// both the desktop browser and the iOS frame; the layout Tweak switches centered ↔ split on desktop.
// Reuses: Avatar, mgr, AUTH_LEAGUE, AUTH_COMMISH, AUTH_ROSTER, INVITE, emailValid, onAllowlist.
const { useState:useA, useEffect:useAE, useRef:useAR } = React;

// ---- icons ----
const IcMail = (p)=> <svg viewBox="0 0 24 24" width={p.s||22} height={p.s||22} fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M4 7l8 6 8-6"/></svg>;
const IcCheck = (p)=> <svg viewBox="0 0 24 24" width={p.s||22} height={p.s||22} fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M5 13l4 4L19 7"/></svg>;
const IcShield = (p)=> <svg viewBox="0 0 24 24" width={p.s||14} height={p.s||14} fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z"/></svg>;
const IcAlert = (p)=> <svg viewBox="0 0 24 24" width={p.s||22} height={p.s||22} fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3l9 16H3l9-16z"/><path d="M12 10v4M12 17h.01"/></svg>;
const IcClock = (p)=> <svg viewBox="0 0 24 24" width={p.s||22} height={p.s||22} fill="none" stroke="currentColor" strokeWidth="1.9"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
const IcArrow = ()=> <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
const IcGoogle = ()=> <svg viewBox="0 0 24 24" width="17" height="17"><path fill="#4285F4" d="M22.5 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-2 3.2-4.9 3.2-7.9z"/><path fill="#34A853" d="M12 23c2.9 0 5.4-1 7.2-2.6l-3.6-2.7c-1 .7-2.3 1.1-3.6 1.1-2.8 0-5.1-1.9-6-4.4H2.3v2.8A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M6 14.4a6.6 6.6 0 0 1 0-4.2V7.4H2.3a11 11 0 0 0 0 9.8L6 14.4z"/><path fill="#EA4335" d="M12 5.5c1.6 0 3 .5 4.1 1.6l3.1-3.1A11 11 0 0 0 12 1 11 11 0 0 0 2.3 7.4L6 10.2c.9-2.6 3.2-4.7 6-4.7z"/></svg>;

// ---- brand bits ----
function AuthLogo({ lg }){ return <div className={'au-logo'+(lg?' au-logo-lg':'')}>W</div>; }
function PrivateTag(){ return <span className="au-private"><IcShield s={12}/>Private league · invite only</span>; }

function RosterAvatars({ compact }){
  const show = AUTH_ROSTER.slice(0, compact?6:8);
  return (
    <div className="au-roster">
      <div className="au-roster-stack">
        {show.map((m,i)=> <span key={m.id} className="au-roster-av" style={{ zIndex:show.length-i }}><Avatar m={m} size="sm"/></span>)}
      </div>
      <span className="au-roster-cap">{AUTH_ROSTER.length} managers in · <b>{INVITE.spotsLeft} {INVITE.spotsLeft===1?'spot':'spots'} left</b></span>
    </div>
  );
}

function InviteBanner(){
  const by = AUTH_COMMISH;
  return (
    <div className="au-invite">
      <Avatar m={by} size="md"/>
      <div className="au-invite-txt"><b>{by.name}</b> invited you to join<br/><span className="text-secondary">{AUTH_LEAGUE.name}</span></div>
    </div>
  );
}

// ---- the form views ----
function SignInView({ mode, email, setEmail, err, onMagic, onGoogle, showGoogle, sending }){
  const invite = mode==='invite';
  return (
    <form className="au-view" onSubmit={e=>{ e.preventDefault(); onMagic(); }}>
      <div className="au-head">
        <h1 className="au-title">{invite ? 'Accept your invite' : 'Sign in to your league'}</h1>
        <p className="au-sub">{invite
          ? 'Confirm your email to claim your spot. We’ll send a secure sign-in link — no password.'
          : 'Enter your email and we’ll send a secure sign-in link. No password to remember.'}</p>
      </div>

      <label className="au-field">
        <span className="au-label">Email address</span>
        <input className={'au-input'+(err?' is-error':'')} type="email" inputMode="email" autoComplete="email"
          placeholder="you@email.com" value={email} onChange={e=>setEmail(e.target.value)} spellCheck={false} autoFocus/>
        {err && <span className="au-err"><IcAlert s={13}/>{err}</span>}
      </label>

      <button className="btn btn-primary btn-block au-magic" type="submit" disabled={sending}>
        {sending ? <><span className="spinner" style={{width:16,height:16}}></span>Sending…</> : <><IcMail s={17}/>Send magic link</>}
      </button>

      {showGoogle && <>
        <div className="au-or"><span>or</span></div>
        <button className="au-google" type="button" onClick={onGoogle}><IcGoogle/>Continue with Google</button>
      </>}

      <p className="au-fineprint">By continuing you agree to the league rules. Only invited emails can join — this keeps the league private.</p>
    </form>
  );
}

function CheckEmailView({ email, onResend, onChange, cooldown, onSimClick }){
  return (
    <div className="au-view au-center">
      <div className="au-icon tone-accent"><IcMail s={26}/></div>
      <h1 className="au-title">Check your email</h1>
      <p className="au-sub">We sent a sign-in link to<br/><b className="au-email">{email}</b></p>
      <div className="au-note"><IcClock s={14}/>The link expires in 15 minutes. You can close this tab once you’ve clicked it.</div>
      <div className="au-actions">
        <button className="btn btn-primary btn-block" type="button" onClick={onSimClick}><IcArrow/>Open the link (demo)</button>
        <div className="au-actions-row">
          <button className="btn btn-ghost" type="button" onClick={onResend} disabled={cooldown>0}>{cooldown>0?`Resend in ${cooldown}s`:'Resend link'}</button>
          <button className="btn btn-quiet" type="button" onClick={onChange}>Use a different email</button>
        </div>
      </div>
    </div>
  );
}

function VerifyingView(){
  return (
    <div className="au-view au-center">
      <div className="au-icon tone-accent"><span className="spinner" style={{width:26,height:26}}></span></div>
      <h1 className="au-title">Signing you in…</h1>
      <p className="au-sub">Verifying your secure link. This only takes a moment.</p>
    </div>
  );
}

function SuccessView({ onEnter }){
  return (
    <div className="au-view au-center">
      <div className="au-icon tone-success au-pop"><IcCheck s={28}/></div>
      <h1 className="au-title">You’re in!</h1>
      <p className="au-sub">Welcome to <b>{AUTH_LEAGUE.name}</b>. Your squad and the draft are waiting.</p>
      <RosterAvatars/>
      <a className="btn btn-primary btn-block btn-lg au-enter" href="Dashboard.html"><IcArrow/>Enter the league</a>
    </div>
  );
}

function DeniedView({ email, onRetry }){
  return (
    <div className="au-view au-center">
      <div className="au-icon tone-danger"><IcShield s={26}/></div>
      <h1 className="au-title">This email isn’t invited</h1>
      <p className="au-sub"><b className="au-email">{email}</b> isn’t on the league’s invite list. {AUTH_LEAGUE.name} is private — only allow-listed emails can join.</p>
      <div className="au-actions">
        <button className="btn btn-primary btn-block" type="button" onClick={onRetry}>Try a different email</button>
        <button className="btn btn-ghost btn-block" type="button" onClick={onRetry}>Ask {AUTH_COMMISH.name} for an invite</button>
      </div>
    </div>
  );
}

function ExpiredView({ onResend }){
  return (
    <div className="au-view au-center">
      <div className="au-icon tone-warn"><IcClock s={26}/></div>
      <h1 className="au-title">This link has expired</h1>
      <p className="au-sub">Sign-in links are valid for 15 minutes for your security. Request a fresh one and we’ll email it right over.</p>
      <button className="btn btn-primary btn-block" type="button" onClick={onResend}><IcMail s={17}/>Send a new link</button>
    </div>
  );
}

function RateLimitView({ onBack }){
  return (
    <div className="au-view au-center">
      <div className="au-icon tone-warn"><IcAlert s={26}/></div>
      <h1 className="au-title">Too many attempts</h1>
      <p className="au-sub">We’ve paused new links for a few minutes to keep your account safe. Try again shortly.</p>
      <button className="btn btn-ghost btn-block" type="button" onClick={onBack}>Back to sign in</button>
    </div>
  );
}

// ---- the shell + flow ----
function AuthFlow({ view, mode, email, setEmail, err, onMagic, onGoogle, showGoogle, sending,
                    onResend, onChangeEmail, cooldown, onSimClick, onEnter, onRetry, layout, compact }){
  const body = (
    view==='checkemail' ? <CheckEmailView email={email} onResend={onResend} onChange={onChangeEmail} cooldown={cooldown} onSimClick={onSimClick}/> :
    view==='verifying'  ? <VerifyingView/> :
    view==='success'    ? <SuccessView onEnter={onEnter}/> :
    view==='denied'     ? <DeniedView email={email} onRetry={onRetry}/> :
    view==='expired'    ? <ExpiredView onResend={onResend}/> :
    view==='ratelimit'  ? <RateLimitView onBack={onRetry}/> :
      <SignInView mode={mode} email={email} setEmail={setEmail} err={err} onMagic={onMagic}
        onGoogle={onGoogle} showGoogle={showGoogle} sending={sending}/>
  );

  const split = layout==='split' && !compact;
  const showInvite = mode==='invite' && (view==='signin');

  // brand column (left in split, top in centered/mobile)
  const brand = split ? (
    <div className="au-brandpanel">
      <div className="au-brandpanel-top">
        <div className="au-brandrow"><AuthLogo lg/><div><div className="au-brand-name">{AUTH_LEAGUE.name}</div><div className="au-brand-season">{AUTH_LEAGUE.season}</div></div></div>
        <PrivateTag/>
      </div>
      {mode==='invite' && <InviteBanner/>}
      <ul className="au-values">
        <li><span className="au-valdot"></span>All-play-all power record — scored vs every manager, every week</li>
        <li><span className="au-valdot"></span>Guillotine playoffs — lowest score is cut each round</li>
        <li><span className="au-valdot"></span>Live lock-on-play scoring as the matches kick off</li>
      </ul>
      <RosterAvatars/>
    </div>
  ) : null;

  return (
    <div className={'au-shell'+(split?' is-split':'')+(compact?' is-compact':'')}>
      {brand}
      <div className="au-formcol">
        <div className="au-card">
          {!split &&
            <div className="au-cardbrand">
              <div className="au-brandrow"><AuthLogo/><div><div className="au-brand-name">{AUTH_LEAGUE.name}</div><div className="au-brand-season">{AUTH_LEAGUE.season}</div></div></div>
              <PrivateTag/>
            </div>}
          {!split && showInvite && <InviteBanner/>}
          {body}
        </div>
        <div className="au-foot">Trouble signing in? <a href="#">Contact the commissioner</a></div>
      </div>
    </div>
  );
}

Object.assign(window, { AuthFlow });
