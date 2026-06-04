// settings/components.jsx — settings atoms + section renderers (shared by desktop & mobile).
// Reuses: Avatar, Flag, mgr, NATIONS, PROFILE_INIT, ACCOUNT, LEAGUE_INFO, TIMEZONES,
//   THEMES, DENSITIES, ACCENTS, PreferencesPanel.
const { useState:useSt, useRef:useStR } = React;

// ----------------------------------------------------------------- atoms ---
function SIcon({ name, s=18 }){
  const p = { width:s, height:s, fill:'none', stroke:'currentColor', strokeWidth:1.9 };
  if (name==='user')  return <svg viewBox="0 0 24 24" {...p}><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>;
  if (name==='key')   return <svg viewBox="0 0 24 24" {...p}><circle cx="8" cy="15" r="5"/><path d="M11.5 11.5L21 2M17 6l3 3M14 9l2 2"/></svg>;
  if (name==='bell')  return <svg viewBox="0 0 24 24" {...p}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/></svg>;
  if (name==='sun')   return <svg viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/></svg>;
  if (name==='flag')  return <svg viewBox="0 0 24 24" {...p}><path d="M5 21V4M5 4h11l-1.5 4L16 12H5"/></svg>;
  if (name==='alert') return <svg viewBox="0 0 24 24" {...p}><path d="M12 3l9 16H3l9-16z"/><path d="M12 10v4M12 17h.01"/></svg>;
  return <svg viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="9"/></svg>;
}

function Toggle({ on, onChange }){
  return <button className={'st-switch'+(on?' is-on':'')} role="switch" aria-checked={on} onClick={()=>onChange(!on)}><i/></button>;
}
function SegControl({ value, options, onChange, full }){
  return (
    <div className={'st-seg'+(full?' is-full':'')}>
      {options.map(o=>{ const v=typeof o==='object'?o.id:o, l=typeof o==='object'?o.label:o;
        return <button key={v} className={'st-seg-btn'+(value===v?' is-active':'')} onClick={()=>onChange(v)}>{l}</button>; })}
    </div>
  );
}
function Field({ label, value, onChange, placeholder, prefix, hint, type='text' }){
  return (
    <label className="st-field">
      <span className="st-flabel">{label}</span>
      <div className={'st-input-wrap'+(prefix?' has-prefix':'')}>
        {prefix && <span className="st-prefix">{prefix}</span>}
        <input className="st-input" type={type} value={value} placeholder={placeholder} onChange={e=>onChange(e.target.value)}/>
      </div>
      {hint && <span className="st-fhint">{hint}</span>}
    </label>
  );
}
function TextArea({ label, value, onChange, hint, max }){
  return (
    <label className="st-field">
      <span className="st-flabel">{label}{max && <span className="st-count">{value.length}/{max}</span>}</span>
      <textarea className="st-input st-textarea" value={value} maxLength={max} rows={3} onChange={e=>onChange(e.target.value)}/>
      {hint && <span className="st-fhint">{hint}</span>}
    </label>
  );
}
function SettingRow({ icon, title, sub, control, danger }){
  return (
    <div className={'st-row'+(danger?' is-danger':'')}>
      {icon && <span className="st-row-ico">{icon}</span>}
      <div className="st-row-id"><div className="st-row-title">{title}</div>{sub && <div className="st-row-sub">{sub}</div>}</div>
      <div className="st-row-ctrl">{control}</div>
    </div>
  );
}
function SubCard({ title, desc, children }){
  return (
    <section className="st-sub">
      {(title||desc) && <header className="st-sub-h"><h3 className="st-sub-title">{title}</h3>{desc && <p className="st-sub-desc">{desc}</p>}</header>}
      <div className="st-sub-b">{children}</div>
    </section>
  );
}

// ----------------------------------------------------------------- profile header ---
function ProfileHeader({ profile, header }){
  const fav = NATIONS[profile.favoriteTeam] || {};
  return (
    <div className={'st-profhead st-profhead-'+header}>
      {header==='banner' && <div className="st-banner" style={{ background:`linear-gradient(120deg, color-mix(in srgb,${ME.color} 55%, var(--surface-2)), var(--surface-2))` }}></div>}
      <div className="st-prof-av"><span className="avatar avatar-lg" style={{ width:64, height:64, fontSize:22, background:ME.color, color:'#fff' }}>{ME.init}</span></div>
      <div className="st-prof-id">
        <div className="st-prof-name">{profile.displayName}
          {profile.isCommissioner && <span className="st-commish"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M13 2L4.5 13H11l-1 9 9-12h-6.5L13 2z"/></svg>Commissioner</span>}
        </div>
        <div className="st-prof-team"><b>{profile.teamName}</b> · @{profile.handle}</div>
        <div className="st-prof-meta">
          <span className="st-prof-fav"><Flag nat={profile.favoriteTeam}/>Backing {fav.n||profile.favoriteTeam}</span>
          <span className="st-prof-since">{profile.joined}</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================ SECTIONS ===
function ProfileSection({ profile, setProfile, header }){
  const upd = (k,v)=> setProfile(p=>({ ...p, [k]:v }));
  return (
    <div className="st-section">
      <ProfileHeader profile={profile} header={header}/>
      <SubCard title="Public profile" desc="Shown to other managers across the league.">
        <div className="st-grid2">
          <Field label="Display name" value={profile.displayName} onChange={v=>upd('displayName',v)}/>
          <Field label="Team name" value={profile.teamName} onChange={v=>upd('teamName',v)}/>
          <Field label="Handle" prefix="@" value={profile.handle} onChange={v=>upd('handle',v.replace(/[^a-z0-9_]/gi,'').toLowerCase())} hint="Letters, numbers and underscores."/>
          <label className="st-field">
            <span className="st-flabel">World Cup team you’re backing</span>
            <div className="st-favpick">
              {['ARG','BRA','FRA','ENG','MEX','CRO','USA','POR'].map(c=>(
                <button key={c} className={'st-fav'+(profile.favoriteTeam===c?' is-active':'')} onClick={()=>upd('favoriteTeam',c)} title={(NATIONS[c]||{}).n}>
                  <Flag nat={c}/>
                </button>
              ))}
            </div>
          </label>
        </div>
        <TextArea label="Bio" value={profile.bio} onChange={v=>upd('bio',v)} max={160} hint="A short line for your league profile."/>
      </SubCard>
    </div>
  );
}

function AccountSection({ saved, onSignOut }){
  return (
    <div className="st-section">
      <SubCard title="Sign-in" desc="This league is passwordless — you sign in with a secure email link.">
        <SettingRow icon={<SIcon name="bell" s={16}/>} title="Email"
          sub={ACCOUNT.email} control={ACCOUNT.emailVerified
            ? <span className="st-verif"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 13l4 4L19 7"/></svg>Verified</span>
            : <button className="btn btn-sm btn-ghost">Verify</button>}/>
        <SettingRow title="Magic-link sign-in" sub="A one-time link is emailed each time you sign in"
          control={<span className="st-pill-on">On</span>}/>
        <SettingRow title="Google" sub={ACCOUNT.google.connected? ACCOUNT.google.email : 'Not connected'}
          control={ACCOUNT.google.connected ? <button className="btn btn-sm btn-ghost">Disconnect</button> : <button className="btn btn-sm btn-ghost">Connect</button>}/>
      </SubCard>
      <SubCard title="Active sessions" desc="Devices currently signed in to your account.">
        <div className="st-sessions">
          {ACCOUNT.sessions.map(s=>(
            <div className="st-session" key={s.id}>
              <span className="st-session-ico"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg></span>
              <div className="st-session-id"><div className="st-session-dev">{s.device}{s.current && <span className="st-session-cur">This device</span>}</div>
                <div className="st-session-meta">{s.where} · {s.lastSeen}</div></div>
              {!s.current && <button className="st-session-x">Sign out</button>}
            </div>
          ))}
        </div>
      </SubCard>
    </div>
  );
}

function NotifSection({ prefRows, onPrefToggle, quiet, setQuiet }){
  return (
    <div className="st-section">
      <SubCard title="Notifications" desc="Choose how you’re alerted for each kind of league event. The same controls live in the notification center.">
        <PreferencesPanel rows={prefRows} onToggle={onPrefToggle} quiet={quiet} onQuiet={()=>setQuiet(q=>!q)}/>
      </SubCard>
    </div>
  );
}

function AppearanceSection({ appearance, setAppearance }){
  const upd = (k,v)=> setAppearance(a=>({ ...a, [k]:v }));
  return (
    <div className="st-section">
      <SubCard title="Theme" desc="Dark is tuned for evening match windows; light is first-class too.">
        <div className="st-themes">
          {THEMES.map(t=>(
            <button key={t.id} className={'st-theme'+(appearance.theme===t.id?' is-active':'')} onClick={()=>upd('theme',t.id)}>
              <span className={'st-theme-prev is-'+t.id}><i></i><i></i></span>
              <span className="st-theme-lbl">{t.label}</span>
            </button>
          ))}
        </div>
      </SubCard>
      <SubCard title="Accent" desc="Marks you and primary actions across the app.">
        <div className="st-accents">
          {ACCENTS.map(a=>(
            <button key={a.id} className={'st-accent'+(appearance.accent===a.id?' is-active':'')} onClick={()=>upd('accent',a.id)}>
              <span className="st-accent-dot" style={{ background:a.hex }}>{appearance.accent===a.id && <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#fff" strokeWidth="3"><path d="M5 13l4 4L19 7"/></svg>}</span>
              <span className="st-accent-lbl">{a.label}</span>
            </button>
          ))}
        </div>
      </SubCard>
      <SubCard title="Display">
        <SettingRow title="Density" sub="Comfortable suits touch; compact fits more on screen"
          control={<SegControl value={appearance.density} options={DENSITIES} onChange={v=>upd('density',v)}/>}/>
        <SettingRow title="Reduce motion" sub="Minimise animations and live pulses"
          control={<Toggle on={appearance.reduceMotion} onChange={v=>upd('reduceMotion',v)}/>}/>
      </SubCard>
    </div>
  );
}

function LeagueSection({ tz, setTz }){
  const L = LEAGUE_INFO; const c = L.commissioner;
  return (
    <div className="st-section">
      <SubCard title={L.name} desc={`${L.season} · ${L.scoring}`}>
        <div className="st-leaguegrid">
          <div className="st-lstat"><span className="t-label">Managers</span><b className="num">{L.managers}</b></div>
          <div className="st-lstat"><span className="t-label">Your seed</span><b className="num">{L.yourSeed}</b></div>
          <div className="st-lstat"><span className="t-label">Record</span><b className="mono">{L.yourRecord}</b></div>
        </div>
        <SettingRow icon={<Avatar m={c} size="sm"/>} title="Commissioner" sub={c.name}
          control={<button className="btn btn-sm btn-ghost">Message</button>}/>
      </SubCard>
      <SubCard title="Time &amp; display" desc="All times are stored in UTC and shown in your league-local zone — kickoffs, lock deadlines and the FAAB batch clock.">
        <label className="st-field">
          <span className="st-flabel">League-local time zone</span>
          <select className="st-input st-select" value={tz} onChange={e=>setTz(e.target.value)}>
            {TIMEZONES.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
        </label>
      </SubCard>
    </div>
  );
}

function DangerSection({ onSignOut, onConfirm }){
  return (
    <div className="st-section">
      <SubCard title="Sign out">
        <SettingRow title="Sign out of this device" sub="You’ll need a fresh magic link to return"
          control={<a className="btn btn-sm btn-ghost" href="Join.html">Sign out</a>}/>
      </SubCard>
      <div className="st-danger">
        <div className="st-danger-h"><SIcon name="alert" s={18}/><span>Danger zone</span></div>
        <SettingRow danger title="Leave the league" sub="Your squad is released to free agency. This can’t be undone."
          control={<button className="btn btn-sm btn-danger" onClick={()=>onConfirm('leave')}>Leave league</button>}/>
        <SettingRow danger title="Delete account" sub="Permanently removes your profile and history across all leagues."
          control={<button className="btn btn-sm btn-danger" onClick={()=>onConfirm('delete')}>Delete</button>}/>
      </div>
    </div>
  );
}

// section id → renderer
function renderSection(id, ctx){
  if (id==='profile')    return <ProfileSection profile={ctx.profile} setProfile={ctx.setProfile} header={ctx.header}/>;
  if (id==='account')    return <AccountSection/>;
  if (id==='notifs')     return <NotifSection prefRows={ctx.prefRows} onPrefToggle={ctx.onPrefToggle} quiet={ctx.quiet} setQuiet={ctx.setQuiet}/>;
  if (id==='appearance') return <AppearanceSection appearance={ctx.appearance} setAppearance={ctx.setAppearance}/>;
  if (id==='league')     return <LeagueSection tz={ctx.tz} setTz={ctx.setTz}/>;
  if (id==='danger')     return <DangerSection onConfirm={ctx.onConfirm}/>;
  return null;
}

Object.assign(window, {
  SIcon, Toggle, SegControl, Field, TextArea, SettingRow, SubCard, ProfileHeader,
  ProfileSection, AccountSection, NotifSection, AppearanceSection, LeagueSection, DangerSection, renderSection,
});
