// auth/app.jsx — auth/join state machine + fit-scaled desktop+mobile stage + presenter + tweaks.
const { useState, useEffect, useRef, useMemo } = React;

function useFitScaleAu(contentW, contentH){
  const ref = useRef(null);
  const [scale, setScale] = useState(1);
  useEffect(()=>{
    const el = ref.current; if(!el) return;
    const fit = () => {
      const w = el.clientWidth - 8, h = el.clientHeight - 8;
      if (w <= 0) return;                       // guard: clientWidth reads 0 mid-layout → negative scale
      setScale(Math.max(0.05, Math.min(1, w/contentW, h>0 ? h/contentH : 1)));
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    window.addEventListener('resize', fit);
    return ()=>{ ro.disconnect(); window.removeEventListener('resize', fit); };
  }, [contentW, contentH]);
  return [ref, scale];
}

const AU_TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "entry": "invite",
  "layout": "centered",
  "google": "on"
}/*EDITMODE-END*/;

function App(){
  const [tw, setTweak] = useTweaks(AU_TWEAK_DEFAULTS);
  useEffect(()=>{
    const el = document.documentElement;
    el.setAttribute('data-accent', 'cobalt');        // accent LOCKED
    el.setAttribute('data-theme', tw.theme);
    el.setAttribute('data-density', 'comfortable');
  }, [tw.theme]);

  const mode = tw.entry === 'open' ? 'open' : 'invite';
  const [view, setView] = useState('signin');
  const [email, setEmail] = useState(mode==='invite' ? INVITE.email : '');
  const [err, setErr] = useState('');
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const timers = useRef([]);
  const clearTimers = ()=>{ timers.current.forEach(clearTimeout); timers.current = []; };
  const after = (ms, fn)=>{ const id=setTimeout(fn, ms); timers.current.push(id); };

  // re-seed email when the entry mode changes
  useEffect(()=>{ setEmail(mode==='invite' ? INVITE.email : ''); setErr(''); setView('signin'); }, [mode]);
  useEffect(()=>()=>clearTimers(), []);

  // cooldown ticker
  useEffect(()=>{ if(cooldown<=0) return; const id=setInterval(()=> setCooldown(c=>c-1), 1000); return ()=>clearInterval(id); }, [cooldown]);

  const reset = ()=>{ clearTimers(); setSending(false); setErr(''); setCooldown(0); setView('signin'); setEmail(mode==='invite'?INVITE.email:''); };

  const onMagic = ()=>{
    setErr('');
    if (!emailValid(email)){ setErr('Enter a valid email address.'); return; }
    setSending(true);
    after(850, ()=>{
      setSending(false);
      if (onAllowlist(email)){ setView('checkemail'); setCooldown(30); }
      else setView('denied');
    });
  };
  const onGoogle = ()=>{
    setView('verifying');
    after(1300, ()=> setView(onAllowlist(email)||mode==='invite' ? 'success' : 'denied'));
  };
  const onResend = ()=>{ setView('checkemail'); setCooldown(30); };
  const onChangeEmail = ()=>{ setView('signin'); setErr(''); };
  const onSimClick = ()=>{ setView('verifying'); after(1500, ()=> setView('success')); };
  const onRetry = ()=>{ setView('signin'); setErr(''); setEmail(''); };

  const shared = {
    view, mode, email, setEmail, err, onMagic, onGoogle, showGoogle: tw.google==='on', sending,
    onResend, onChangeEmail, cooldown, onSimClick, onRetry,
    layout: tw.layout,
  };

  const CONTENT_W = 1180 + 28 + 402;
  const CONTENT_H = 880;
  const [fitRef, scale] = useFitScaleAu(CONTENT_W, CONTENT_H);

  const JUMPS = [
    { id:'signin', label:'Sign in' }, { id:'checkemail', label:'Check email' },
    { id:'verifying', label:'Verifying' }, { id:'success', label:'Welcome' },
  ];
  const ERRS = [ { id:'denied', label:'Not invited' }, { id:'expired', label:'Link expired' }, { id:'ratelimit', label:'Rate limited' } ];
  const jump = (id)=>{ clearTimers(); setSending(false); setView(id); };

  return (
    <div className="vf-stage">
      <div className="vf-stagebar">
        <div className="vf-sb-title">
          <div className="vf-logo">W</div>
          <div><b className="display" style={{fontSize:15, lineHeight:1, whiteSpace:'nowrap'}}>Join / Sign in</b>
          <div className="t-micro text-tertiary" style={{whiteSpace:'nowrap'}}>Magic-link · invite only</div></div>
        </div>

        <div className="vf-sb-sim">
          <span className="t-label" style={{margin:'0 2px'}}>Flow</span>
          {JUMPS.map(j=>(
            <button key={j.id} className={'vf-connbtn'+(view===j.id?' is-active':'')} onClick={()=>jump(j.id)}>{j.label}</button>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={reset} style={{marginLeft:4}}>↺ Reset</button>
        </div>

        <div className="vf-sb-conn">
          <span className="t-label" style={{margin:'0 2px'}}>Errors</span>
          {ERRS.map(e=>(
            <button key={e.id} className={'vf-connbtn'+(view===e.id?' is-active':'')} onClick={()=>jump(e.id)}>{e.label}</button>
          ))}
        </div>
      </div>

      <div className="vf-fit" ref={fitRef}>
        <div className="vf-frames" style={{ width:CONTENT_W, height:CONTENT_H, transform:`scale(${scale})` }}>
          <div className="vf-browser">
            <div className="vf-bw-bar">
              <span className="vf-bw-dot" style={{background:'var(--surface-4)'}}></span>
              <span className="vf-bw-dot" style={{background:'var(--surface-4)'}}></span>
              <span className="vf-bw-dot" style={{background:'var(--surface-4)'}}></span>
              <div className="vf-bw-url"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>worldcupfantasy.app/join</div>
              <span className="vf-bw-badge t-micro">Desktop · 1180×768</span>
            </div>
            <div className="vf-bw-body au-bw-body"><AuthFlow {...shared}/></div>
          </div>
          <div className="vf-phone">
            <IOSDevice dark={tw.theme!=='light'} width={402} height={860}>
              <div className="au-phone" data-theme={tw.theme}><AuthFlow {...shared} compact/></div>
            </IOSDevice>
            <div className="vf-phone-badge t-micro">Mobile · iPhone</div>
          </div>
        </div>
      </div>

      <TweaksPanel>
        <TweakSection label="Entry point" />
        <TweakRadio label="How they arrive" value={tw.entry}
          options={[{value:'invite',label:'Invite link'},{value:'open',label:'Plain sign-in'}]}
          onChange={v=>setTweak('entry', v)} />
        <TweakRadio label="Google sign-in" value={tw.google} options={[{value:'on',label:'Show'},{value:'off',label:'Hide'}]} onChange={v=>setTweak('google', v)} />
        <TweakSection label="Layout" />
        <TweakRadio label="Desktop layout" value={tw.layout}
          options={[{value:'centered',label:'Centered card'},{value:'split',label:'Split brand'}]}
          onChange={v=>setTweak('layout', v)} />
        <TweakSection label="Appearance" />
        <TweakRadio label="Theme" value={tw.theme} options={['dark','light']} onChange={v=>setTweak('theme', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
