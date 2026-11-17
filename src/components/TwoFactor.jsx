import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase.js'
import { confirmDialog, notify } from '../dialog.jsx'
import Icon, { Logo } from './Icon.jsx'

const clean = (s) => s.replace(/\D/g, '').slice(0, 6)

/* Full-screen check after signing in, for people who turned on two-factor. */
export function MfaGate({ onDone, onSignOut }) {
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus() }, [])
  async function verify(e) {
    e?.preventDefault()
    if (code.length !== 6 || busy) return
    setBusy(true); setErr('')
    try {
      const { data: f, error: fe } = await supabase.auth.mfa.listFactors()
      if (fe) throw fe
      const factor = f.totp?.[0]
      if (!factor) throw new Error('No authenticator app is set up on this account.')
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code })
      if (error) throw error
      onDone()
    } catch (e2) {
      setErr(/invalid|expired/i.test(e2.message) ? 'That code did not work. Check the time on your phone and try the newest code.' : e2.message)
      setCode(''); setBusy(false); ref.current?.focus()
    }
  }
  return (
    <div className="center-screen">
      <form className="card" onSubmit={verify}>
        <div className="brand"><Logo size={34} /><h1>Two-factor check</h1></div>
        <p className="muted">Open your authenticator app and enter the 6-digit code for Nook.</p>
        <input ref={ref} className="code-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={7} value={code} onChange={(e) => { const v = clean(e.target.value); setCode(v); if (v.length === 6) setTimeout(() => ref.current?.form?.requestSubmit(), 60) }} placeholder="000000" aria-label="6-digit code" />
        {err && <div className="error" role="alert">{err}</div>}
        <button className="primary" disabled={code.length !== 6 || busy}>{busy ? 'Checking…' : 'Continue'}</button>
        <button type="button" className="link" onClick={onSignOut}>Sign out</button>
      </form>
    </div>
  )
}

/* Settings: turn two-factor on or off. Works with Google Authenticator, Authy, 1Password and similar apps. */
export function TwoFactorPanel() {
  const [factor, setFactor] = useState(undefined) // undefined loading, null none, object enabled
  const [enroll, setEnroll] = useState(null) // { id, qr, secret }
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.listFactors()
    if (error) { setErr(error.message); return setFactor(null) }
    setFactor(data.totp?.[0] || null)
  }, [])
  useEffect(() => { load() }, [load])

  async function start() {
    setBusy(true); setErr('')
    try {
      const { data: all } = await supabase.auth.mfa.listFactors()
      // Remove half-finished attempts so a new one can start.
      for (const f of (all?.all || []).filter((x) => x.status !== 'verified')) await supabase.auth.mfa.unenroll({ factorId: f.id })
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Nook ${new Date().toISOString().slice(0, 10)}` })
      if (error) throw error
      setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
    } catch (e) {
      setErr(/not enabled|disabled/i.test(e.message) ? 'Two-factor is switched off for this project. Turn on TOTP under Authentication, Multi-Factor in Supabase.' : e.message)
    }
    setBusy(false)
  }
  async function confirm(e) {
    e.preventDefault()
    if (code.length !== 6) return
    setBusy(true); setErr('')
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll.id, code })
    setBusy(false)
    if (error) { setCode(''); return setErr('That code did not work. Try the newest one.') }
    setEnroll(null); setCode(''); notify('Two-factor is on.'); load()
  }
  async function cancel() {
    if (enroll) await supabase.auth.mfa.unenroll({ factorId: enroll.id })
    setEnroll(null); setCode(''); setErr('')
  }
  async function disable() {
    if (!(await confirmDialog({ title: 'Turn off two-factor?', body: 'Your account will be protected by your password alone. Staff accounts need two-factor to use the staff panel.', confirmLabel: 'Turn off', danger: true }))) return
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id })
    if (error) return setErr(/aal2|assurance/i.test(error.message) ? 'Sign out and back in with your code first, then try again.' : error.message)
    notify('Two-factor is off.'); load()
  }

  return (
    <>
      <div className="section">Two-factor sign-in</div>
      <div className="enc-card">
        <span className={`enc-ico ${factor ? 'on' : ''}`}><Icon name="key" size={18} /></span>
        <div className="grow">
          <strong>{factor === undefined ? 'Checking…' : factor ? 'On' : 'Off'}</strong>
          <span className="muted tiny">Adds a 6-digit code from an authenticator app when you sign in, so a stolen password is not enough to get into your account.</span>
        </div>
      </div>
      {enroll ? (
        <form className="tfa-setup" onSubmit={confirm}>
          <ol className="muted small">
            <li>Open an authenticator app (Google Authenticator, Authy, 1Password...).</li>
            <li>Scan this picture, or type the key in by hand.</li>
            <li>Enter the 6-digit code it shows.</li>
          </ol>
          <div className="tfa-qr"><img src={enroll.qr} alt="QR code to scan with your authenticator app" width="168" height="168" /></div>
          <div className="rkey"><code>{enroll.secret}</code></div>
          <input className="code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(clean(e.target.value))} placeholder="000000" aria-label="6-digit code" autoFocus />
          <div className="row"><button className="primary" disabled={code.length !== 6 || busy}>{busy ? 'Checking…' : 'Turn on'}</button><button type="button" className="ghost" onClick={cancel}>Cancel</button></div>
        </form>
      ) : (
        <div className="row">
          {factor === null && <button className="primary" onClick={start} disabled={busy}>{busy ? 'Starting…' : 'Set up two-factor'}</button>}
          {factor && <button className="ghost danger" onClick={disable}>Turn off</button>}
        </div>
      )}
      {err && <div className="error" role="alert">{err}</div>}
      {factor && <p className="muted tiny">Lose your phone? Ask Nook staff to remove it, or use your authenticator app's backup.</p>}
    </>
  )
}
