import { useState } from 'react'
import { supabase } from '../supabase.js'
import Mascot from './Mascot.jsx'
import { LegalLinks } from './Legal.jsx'
import { TERMS_VERSION, LEGAL } from '../legal/config.js'

export default function Auth({ onBack }) {
  const [mode, setMode] = useState('signin') // signin | signup | reset
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [agree, setAgree] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  const switchMode = (m) => { setMode(m); setError(''); setInfo('') }

  async function submit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    setBusy(true)
    try {
      if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
        if (error) throw error
        setInfo('If that email has an account, a reset link is on its way.')
      } else if (mode === 'signup') {
        const name = username.trim().toLowerCase()
        if (!/^[a-z0-9_]{3,20}$/.test(name)) throw new Error('Username: 3–20 letters, numbers or underscores.')
        if (!agree) throw new Error(`Please confirm you are ${LEGAL.minAge} or older and accept the Terms, Privacy Policy and Guidelines.`)
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { username: name, terms_version: TERMS_VERSION, age_confirmed: true } } })
        if (error) throw error
        if (!data.session) setInfo('Check your email to confirm your account, then sign in.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="center-screen">
      <form className="card" onSubmit={submit}>
        {onBack && <button type="button" className="link auth-back" onClick={onBack}>&larr; Back to home</button>}
        <div className="card-head">
          <div className={busy ? 'hop' : ''}><Mascot mood={busy ? 'happy' : mode === 'reset' ? 'oops' : mode === 'signup' ? 'wink' : 'wave'} size={84} animated /></div>
          <h1>{mode === 'signin' ? 'Welcome back' : mode === 'signup' ? 'Join Nook' : 'Reset your password'}</h1>
          <p className="muted">{mode === 'reset' ? 'We will email you a link to choose a new one.' : 'Group chats and DMs. No servers, no fuss.'}</p>
        </div>

        {mode === 'signup' && (
          <label>
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="cooluser" autoComplete="username" required />
          </label>
        )}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        {mode !== 'reset' && (
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required />
          </label>
        )}

        {mode === 'signup' && (
          <label className="check">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>I am {LEGAL.minAge} or older and agree to the <a href="#/terms">Terms of Service</a>, <a href="#/privacy">Privacy Policy</a> and <a href="#/rules">Community Guidelines</a>.</span>
          </label>
        )}

        {error && <div className="error">{error}</div>}
        {info && <div className="info">{info}</div>}

        <button className="primary" disabled={busy}>
          {busy ? 'One sec…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
        </button>
        {mode === 'signin' && <button type="button" className="link" onClick={() => switchMode('reset')}>Forgot your password?</button>}
        <button type="button" className="link" onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}>
          {mode === 'signin' ? 'Need an account? Sign up' : mode === 'signup' ? 'Already have an account? Sign in' : 'Back to sign in'}
        </button>
        <LegalLinks />
      </form>
    </div>
  )
}
